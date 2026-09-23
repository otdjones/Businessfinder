import { createDraft, outreachDecision } from './campaign.js';
import { contactsFromMapsPlace, mergeContacts } from './contacts.js';
import { validateInput } from './input.js';

export const MAPS_ACTOR_ID = 'compass/crawler-google-places';

export function buildMapsInput(input) {
    return {
        searchStringsArray: input.searchTerms,
        locationQuery: input.location,
        maxCrawledPlacesPerSearch: input.maxResultsPerSearch,
        language: 'en',
        skipClosedPlaces: true,
        scrapePlaceDetailPage: false,
        scrapeContacts: input.enrichment.useMapsContactAddon,
        maximumLeadsEnrichmentRecords: 0,
        maxReviews: 0,
        scrapeReviewsPersonalData: false,
        maxImages: 0,
        includeWebResults: false,
    };
}

function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeBusiness(place) {
    return {
        id: place.placeId ?? place.cid ?? null,
        name: place.title ?? place.name ?? 'Unknown business',
        category: place.categoryName ?? place.categories?.[0] ?? null,
        categories: Array.isArray(place.categories) ? place.categories : [],
        address: place.address ?? null,
        street: place.street ?? null,
        city: place.city ?? null,
        postal_code: place.postalCode ?? null,
        country_code: place.countryCode ?? null,
        website: place.website ?? null,
        google_maps_url: place.googleMapsUrl ?? place.url ?? null,
        rating: numberOrNull(place.totalScore ?? place.rating),
        reviews: numberOrNull(place.reviewsCount),
        location:
            typeof place.location?.lat === 'number' && typeof place.location?.lng === 'number'
                ? { latitude: place.location.lat, longitude: place.location.lng }
                : null,
        temporarily_closed: place.temporarilyClosed === true,
        permanently_closed: place.permanentlyClosed === true,
    };
}

function dedupePlaces(places) {
    const unique = new Map();
    for (const place of places) {
        const business = normalizeBusiness(place);
        const key =
            business.id ??
            `${business.name.toLowerCase()}|${(business.address ?? business.website ?? '').toLowerCase()}`;
        if (!unique.has(key)) unique.set(key, place);
    }
    return [...unique.values()];
}

function qualifies(business, input) {
    if (business.permanently_closed || business.temporarily_closed) return false;
    if (input.minimumRating > 0 && (business.rating ?? 0) < input.minimumRating) return false;
    if (input.minimumReviews > 0 && (business.reviews ?? 0) < input.minimumReviews) return false;
    return true;
}

function scoreLead(business, contacts) {
    let score = 0;
    const reasons = [];
    if (business.website) {
        score += 15;
        reasons.push('has_website');
    }
    if (contacts.best_email) {
        score += 40;
        reasons.push('has_public_business_email');
    }
    if (contacts.phones.length > 0) {
        score += 15;
        reasons.push('has_phone');
    }
    if (contacts.phones.some((phone) => phone.is_mobile)) {
        score += 10;
        reasons.push('has_uk_mobile');
    }
    if ((business.rating ?? 0) >= 4) {
        score += 10;
        reasons.push('rating_at_least_4');
    }
    if ((business.reviews ?? 0) >= 10) {
        score += 10;
        reasons.push('at_least_10_reviews');
    }
    return { score, reasons };
}

async function mapLimit(items, concurrency, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

async function buildLead(place, input, runtime) {
    const business = normalizeBusiness(place);
    const mapContacts = contactsFromMapsPlace(place);
    const websiteContacts = input.enrichment.crawlBusinessWebsite
        ? await runtime.enrichWebsite(business.website, input.enrichment.maxWebsitePages)
        : { emails: [], phones: [], pages: [], error: null };
    const contacts = mergeContacts(mapContacts, websiteContacts, business.website);
    if (!input.enrichment.includeMobileNumbers) {
        contacts.phones = contacts.phones.filter((phone) => !phone.is_mobile);
    }

    return {
        schema_version: '1.0',
        business,
        contacts,
        qualification: scoreLead(business, contacts),
        outreach: { status: 'not_requested' },
        provenance: {
            maps_actor: MAPS_ACTOR_ID,
            map_scraped_at: place.scrapedAt ?? null,
            website_pages_checked: websiteContacts.pages,
            website_enrichment_error: websiteContacts.error,
            personal_employee_enrichment_requested: false,
        },
    };
}

export async function executeBusinessfinder(runtime) {
    const input = validateInput(await runtime.getInput());
    const sender = input.outreach.mode === 'send' ? runtime.getEmailSender() : null;
    const mapsResult = await runtime.runMaps(buildMapsInput(input));
    const uniquePlaces = dedupePlaces(mapsResult.items);
    const filteredPlaces = uniquePlaces.filter((place) => qualifies(normalizeBusiness(place), input));
    const leads = await mapLimit(filteredPlaces, 4, (place) => buildLead(place, input, runtime));

    let actionCount = 0;
    let sentCount = 0;
    let sendFailures = 0;
    for (const lead of leads) {
        const decision = outreachDecision(lead, input.outreach, actionCount);
        lead.outreach = decision;

        if (decision.status === 'drafted' || decision.status === 'ready_to_send') {
            const draft = createDraft(lead, input.outreach);
            lead.outreach = { ...decision, draft };
            actionCount += 1;
            if (decision.status === 'ready_to_send') {
                if (sentCount > 0) await runtime.delay(input.outreach.sendIntervalMs);
                try {
                    const result = await sender(draft, input.outreach.fromName);
                    lead.outreach = { status: 'sent', message_id: result.id ?? null };
                    sentCount += 1;
                } catch (error) {
                    lead.outreach = {
                        status: 'send_failed',
                        error: error instanceof Error ? error.message : 'Unknown Gmail API error.',
                    };
                    sendFailures += 1;
                }
            }
        }

        await runtime.pushData(lead);
    }

    const summary = {
        schema_version: '1.0',
        status: sendFailures > 0 ? 'COMPLETED_WITH_SEND_FAILURES' : 'COMPLETED',
        search_terms: input.searchTerms,
        location: input.location,
        maps_actor_run_id: mapsResult.runId ?? null,
        maps_places_received: mapsResult.items.length,
        duplicates_removed: mapsResult.items.length - uniquePlaces.length,
        businesses_output: leads.length,
        businesses_with_email: leads.filter((lead) => lead.contacts.best_email).length,
        businesses_with_uk_mobile: leads.filter((lead) =>
            lead.contacts.phones.some((phone) => phone.is_mobile),
        ).length,
        outreach_mode: input.outreach.mode,
        drafts_prepared: input.outreach.mode === 'prepare' ? actionCount : 0,
        messages_sent: sentCount,
        send_failures: sendFailures,
    };
    await runtime.setSummary(summary);
    return { leads, summary };
}

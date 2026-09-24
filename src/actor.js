import { createHash } from 'node:crypto';

import { createDraft, outreachDecision } from './campaign.js';
import { contactsFromMapsPlace, mergeContacts } from './contacts.js';
import { markEmailsNotChecked } from './email-verification.js';
import { validateInput } from './input.js';
import { assessOpportunity, scoreQualification } from './opportunity.js';

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

export function businessKey(business) {
    return (
        business.id ??
        `${business.name.toLowerCase()}|${(business.address ?? business.website ?? '').toLowerCase()}`
    );
}

export function historyScopeKey(input) {
    const scope = JSON.stringify({
        searchTerms: [...input.searchTerms].sort(),
        location: input.location.toLowerCase(),
        servicePreset: input.servicePreset,
    });
    return `SEEN_${createHash('sha256').update(scope).digest('hex').slice(0, 32)}`;
}

function qualifies(business, input) {
    if (business.permanently_closed || business.temporarily_closed) return false;
    if (input.minimumRating > 0 && (business.rating ?? 0) < input.minimumRating) return false;
    if (input.minimumReviews > 0 && (business.reviews ?? 0) < input.minimumReviews) return false;
    return true;
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
        : {
              emails: [],
              emailSources: {},
              phones: [],
              phoneSources: {},
              socials: {},
              pages: [],
              signals: {
                  status: business.website ? 'not_checked' : 'no_website',
                  secure_https: business.website?.startsWith('https://') ?? false,
              },
              error: null,
          };
    let contacts = mergeContacts(mapContacts, websiteContacts, business.website);
    if (!input.enrichment.includeMobileNumbers) {
        contacts.phones = contacts.phones.filter((phone) => !phone.is_mobile);
    }
    contacts =
        input.enrichment.verifyEmailDomains && runtime.verifyContacts
            ? await runtime.verifyContacts(contacts)
            : markEmailsNotChecked(contacts);
    const websiteSignals = websiteContacts.signals ?? {
        status: business.website ? 'unavailable' : 'no_website',
        secure_https: business.website?.startsWith('https://') ?? false,
    };
    const opportunity = assessOpportunity(business, contacts, websiteSignals, input.servicePreset);

    return {
        schema_version: '2.0',
        business,
        contacts,
        website_signals: websiteSignals,
        opportunity,
        qualification: scoreQualification(business, contacts, opportunity, input),
        outreach: { status: 'not_requested' },
        provenance: {
            maps_actor: MAPS_ACTOR_ID,
            map_scraped_at: place.scrapedAt ?? null,
            website_pages_checked: websiteContacts.pages,
            website_enrichment_error: websiteContacts.error,
            personal_employee_enrichment_requested: false,
            collected_at: new Date().toISOString(),
        },
    };
}

function addExportFields(lead) {
    const bestEmailRecord = lead.contacts.emails.find((email) => email.value === lead.contacts.best_email);
    const firstMobile = lead.contacts.phones.find((phone) => phone.is_mobile);
    const firstPhone = lead.contacts.phones.find((phone) => !phone.is_mobile) ?? lead.contacts.phones[0];

    Object.assign(lead, {
        business_name: lead.business.name,
        category: lead.business.category,
        address: lead.business.address,
        city: lead.business.city,
        postcode: lead.business.postal_code,
        website: lead.business.website,
        google_maps_url: lead.business.google_maps_url,
        rating: lead.business.rating,
        reviews: lead.business.reviews,
        latitude: lead.business.location?.latitude ?? null,
        longitude: lead.business.location?.longitude ?? null,
        email: lead.contacts.best_email,
        emails: lead.contacts.emails.map((email) => email.value),
        email_source: bestEmailRecord?.source ?? null,
        email_source_url: bestEmailRecord?.source_url ?? null,
        email_verification: bestEmailRecord?.verification_status ?? null,
        email_mx_valid: bestEmailRecord?.mx_valid ?? null,
        phone: firstPhone?.value ?? null,
        mobile: firstMobile?.value ?? null,
        phones: lead.contacts.phones.map((phone) => phone.value),
        lead_score: lead.qualification.score,
        is_qualified: lead.qualification.is_qualified,
        opportunity_type: lead.opportunity.type,
        opportunity_score: lead.opportunity.score,
        primary_issue: lead.opportunity.primary_issue,
        opportunity_summary: lead.opportunity.summary,
        pitch_angle: lead.opportunity.pitch_angle,
        website_issues: lead.opportunity.issues.map((issue) => issue.label),
        facebook: lead.contacts.socials.facebook ?? null,
        instagram: lead.contacts.socials.instagram ?? null,
        linkedin: lead.contacts.socials.linkedin ?? null,
        qualification_reasons: lead.qualification.reasons,
        outreach_status: lead.outreach.status,
    });
}

export async function executeBusinessfinder(runtime) {
    const startedAt = Date.now();
    const input = validateInput(await runtime.getInput());
    const sender = input.outreach.mode === 'send' ? runtime.getEmailSender() : null;
    const mapsResult = await runtime.runMaps(buildMapsInput(input));
    const uniquePlaces = dedupePlaces(mapsResult.items);
    const filteredPlaces = uniquePlaces.filter((place) => qualifies(normalizeBusiness(place), input));
    const scopeKey = historyScopeKey(input);
    const seenKeys = input.onlyNewBusinesses
        ? new Set((await runtime.getSeenLeadKeys?.(scopeKey)) ?? [])
        : new Set();
    const unseenPlaces = filteredPlaces.filter(
        (place) => !seenKeys.has(businessKey(normalizeBusiness(place))),
    );
    const candidateLeads = await mapLimit(unseenPlaces, 4, (place) => buildLead(place, input, runtime));
    const qualifiedLeads = candidateLeads.filter((lead) => lead.qualification.is_qualified);
    const leads = input.includeUnqualified ? candidateLeads : qualifiedLeads;

    let actionCount = 0;
    let sentCount = 0;
    let sendFailures = 0;
    const outputLeads = [];
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

        addExportFields(lead);
        const pushResult = await runtime.pushData(lead, lead.qualification.is_qualified);
        if (pushResult?.eventChargeLimitReached && pushResult.chargedCount === 0) break;
        outputLeads.push(lead);
    }

    if (input.onlyNewBusinesses && runtime.rememberSeenLeadKeys) {
        await runtime.rememberSeenLeadKeys(
            scopeKey,
            outputLeads
                .filter((lead) => lead.qualification.is_qualified)
                .map((lead) => businessKey(lead.business)),
        );
    }

    const outputQualifiedLeads = outputLeads.filter((lead) => lead.qualification.is_qualified);
    const countWith = (predicate) => outputQualifiedLeads.filter(predicate).length;
    const rate = (count) =>
        outputQualifiedLeads.length > 0
            ? Number(((count / outputQualifiedLeads.length) * 100).toFixed(1))
            : 0;
    const emailCount = countWith((lead) => lead.contacts.best_email);
    const verifiedEmailCount = countWith((lead) =>
        lead.contacts.emails.some(
            (email) => email.value === lead.contacts.best_email && email.mx_valid === true,
        ),
    );
    const phoneCount = countWith((lead) => lead.contacts.phones.length > 0);
    const mobileCount = countWith((lead) => lead.contacts.phones.some((phone) => phone.is_mobile));
    const summary = {
        schema_version: '2.0',
        status: sendFailures > 0 ? 'COMPLETED_WITH_SEND_FAILURES' : 'COMPLETED',
        search_terms: input.searchTerms,
        location: input.location,
        maps_actor_run_id: mapsResult.runId ?? null,
        maps_places_received: mapsResult.items.length,
        duplicates_removed: mapsResult.items.length - uniquePlaces.length,
        excluded_by_map_filters: uniquePlaces.length - filteredPlaces.length,
        previously_delivered_excluded: filteredPlaces.length - unseenPlaces.length,
        candidates_enriched: candidateLeads.length,
        qualified_leads_found: qualifiedLeads.length,
        qualified_leads: outputQualifiedLeads.length,
        unqualified_leads: candidateLeads.length - qualifiedLeads.length,
        businesses_output: outputLeads.length,
        businesses_with_email: emailCount,
        businesses_with_verified_email: verifiedEmailCount,
        businesses_with_phone: phoneCount,
        businesses_with_uk_mobile: mobileCount,
        email_fill_rate_percent: rate(emailCount),
        verified_email_fill_rate_percent: rate(verifiedEmailCount),
        phone_fill_rate_percent: rate(phoneCount),
        uk_mobile_fill_rate_percent: rate(mobileCount),
        service_preset: input.servicePreset,
        minimum_lead_score: input.minimumLeadScore,
        contact_requirement: input.contactRequirement,
        only_new_businesses: input.onlyNewBusinesses,
        opportunity_types: Object.fromEntries(
            [...new Set(outputQualifiedLeads.map((lead) => lead.opportunity.type))].map((type) => [
                type,
                outputQualifiedLeads.filter((lead) => lead.opportunity.type === type).length,
            ]),
        ),
        outreach_mode: input.outreach.mode,
        drafts_prepared: input.outreach.mode === 'prepare' ? actionCount : 0,
        messages_sent: sentCount,
        send_failures: sendFailures,
        runtime_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    };
    await runtime.setSummary(summary);
    return { leads: outputLeads, summary };
}

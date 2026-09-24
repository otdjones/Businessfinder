import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMapsInput, executeBusinessfinder, normalizeBusiness } from '../src/actor.js';
import { validateInput } from '../src/input.js';

test('builds a Maps request without reviewer or employee personal-data enrichment', () => {
    const input = validateInput({ searchTerms: ['cafes'], location: 'Bath' });
    const mapsInput = buildMapsInput(input);
    assert.deepEqual(mapsInput.searchStringsArray, ['cafes']);
    assert.equal(mapsInput.scrapeContacts, true);
    assert.equal(mapsInput.maximumLeadsEnrichmentRecords, 0);
    assert.equal(mapsInput.scrapeReviewsPersonalData, false);
    assert.equal(mapsInput.maxReviews, 0);
});

test('normalises the stable business fields from a Maps result', () => {
    const business = normalizeBusiness({
        placeId: 'place-1',
        title: 'Acme',
        categoryName: 'Accountant',
        totalScore: 4.7,
        reviewsCount: 23,
        location: { lat: 51.4, lng: -2.5 },
    });
    assert.equal(business.name, 'Acme');
    assert.equal(business.rating, 4.7);
    assert.deepEqual(business.location, { latitude: 51.4, longitude: -2.5 });
});

test('deduplicates, filters, enriches, and prepares drafts end to end', async () => {
    const pushed = [];
    let summary;
    const result = await executeBusinessfinder({
        getInput: async () => ({
            searchTerms: ['accountants'],
            location: 'Bristol, UK',
            minimumRating: 4,
            outreach: {
                mode: 'prepare',
                fromName: 'Alex',
                unsubscribeUrl: 'https://sender.example/unsubscribe',
                senderPostalAddress: '1 Example Road',
                maxMessages: 10,
            },
        }),
        runMaps: async () => ({
            runId: 'run-1',
            items: [
                {
                    placeId: 'one',
                    title: 'Acme Accounting',
                    website: 'https://acme.example',
                    totalScore: 4.8,
                    reviewsCount: 20,
                },
                { placeId: 'one', title: 'Duplicate Acme', totalScore: 4.8, reviewsCount: 20 },
                { placeId: 'two', title: 'Low Rated', totalScore: 2, reviewsCount: 20 },
            ],
        }),
        enrichWebsite: async () => ({
            emails: ['hello@acme.example'],
            phones: [],
            pages: ['https://acme.example/'],
            error: null,
        }),
        getEmailSender: () => {
            throw new Error('Sender should not be constructed in prepare mode.');
        },
        delay: async () => {},
        pushData: async (lead) => pushed.push(lead),
        setSummary: async (value) => {
            summary = value;
        },
    });

    assert.equal(result.leads.length, 1);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].contacts.best_email, 'hello@acme.example');
    assert.equal(pushed[0].outreach.status, 'drafted');
    assert.equal(pushed[0].business_name, 'Acme Accounting');
    assert.equal(pushed[0].email, 'hello@acme.example');
    assert.deepEqual(pushed[0].emails, ['hello@acme.example']);
    assert.equal(pushed[0].rating, 4.8);
    assert.equal(pushed[0].lead_score, 75);
    assert.equal(pushed[0].outreach_status, 'drafted');
    assert.equal(summary.duplicates_removed, 1);
    assert.equal(summary.businesses_output, 1);
    assert.equal(summary.drafts_prepared, 1);
});

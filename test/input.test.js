import assert from 'node:assert/strict';
import test from 'node:test';

import { InputError, validateInput } from '../src/input.js';

test('validates and normalises a discovery request', () => {
    const input = validateInput({
        searchTerms: [' Accountants ', 'accountants', 'Commercial cleaners'],
        location: ' Bristol, UK ',
    });
    assert.deepEqual(input.searchTerms, ['accountants', 'commercial cleaners']);
    assert.equal(input.location, 'Bristol, UK');
    assert.equal(input.maxResultsPerSearch, 25);
    assert.equal(input.outreach.mode, 'off');
});

test('rejects unknown root fields', () => {
    assert.throws(
        () => validateInput({ searchTerms: ['cafes'], location: 'Bath', token: 'secret' }),
        /Unknown input field: token/,
    );
});

test('blocks send mode without explicit lawful-basis confirmation', () => {
    assert.throws(
        () =>
            validateInput({
                searchTerms: ['cafes'],
                location: 'Bath',
                outreach: {
                    mode: 'send',
                    fromName: 'Alex',
                    unsubscribeUrl: 'https://example.com/unsubscribe',
                    senderPostalAddress: '1 Example Road',
                },
            }),
        (error) => error instanceof InputError && error.code === 'LAWFUL_BASIS_NOT_CONFIRMED',
    );
});

test('requires unsubscribe token in outreach body', () => {
    assert.throws(
        () =>
            validateInput({
                searchTerms: ['cafes'],
                location: 'Bath',
                outreach: {
                    mode: 'prepare',
                    fromName: 'Alex',
                    bodyTemplate: 'Hello there',
                    unsubscribeUrl: 'https://example.com/unsubscribe',
                    senderPostalAddress: '1 Example Road',
                },
            }),
        /must include {{unsubscribe_url}}/,
    );
});

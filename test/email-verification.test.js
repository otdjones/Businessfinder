import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmailDomainVerifier } from '../src/email-verification.js';

test('checks each email domain once and prefers an MX-valid address', async () => {
    const checked = [];
    const verify = createEmailDomainVerifier(async (domain) => {
        checked.push(domain);
        if (domain === 'valid.example') return [{ exchange: 'mail.valid.example', priority: 10 }];
        const error = new Error('No data');
        error.code = 'ENODATA';
        throw error;
    });
    const result = await verify({
        emails: [
            { value: 'info@invalid.example', score: 70 },
            { value: 'sales@valid.example', score: 50 },
            { value: 'hello@valid.example', score: 60 },
        ],
        phones: [],
        best_email: 'info@invalid.example',
    });

    assert.equal(result.best_email, 'hello@valid.example');
    assert.equal(result.emails[0].mx_valid, true);
    assert.deepEqual(checked.sort(), ['invalid.example', 'valid.example']);
});

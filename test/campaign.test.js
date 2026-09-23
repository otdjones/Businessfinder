import assert from 'node:assert/strict';
import test from 'node:test';

import { createDraft, outreachDecision } from '../src/campaign.js';
import { encodeMessage } from '../src/gmail.js';

const lead = {
    business: { name: 'Acme Gardens', category: 'Garden centre', city: 'Bristol' },
    contacts: { best_email: 'hello@acme.example' },
};

const outreach = {
    mode: 'prepare',
    fromName: 'Alex',
    subjectTemplate: 'Hello {{business_name}}\r\nBcc: bad@example.com',
    bodyTemplate: 'Hi {{business_name}} in {{business_city}}. Opt out: {{unsubscribe_url}}',
    unsubscribeUrl: 'https://sender.example/unsubscribe',
    senderPostalAddress: '1 Example Road',
    suppressionEmails: [],
    maxMessages: 25,
};

test('renders a personalised draft and strips header injection', () => {
    const draft = createDraft(lead, outreach);
    assert.equal(draft.to, 'hello@acme.example');
    assert.equal(draft.subject, 'Hello Acme Gardens Bcc: bad@example.com');
    assert.match(draft.text, /Acme Gardens in Bristol/);
});

test('suppression list wins over draft preparation', () => {
    const decision = outreachDecision(lead, { ...outreach, suppressionEmails: ['hello@acme.example'] }, 0);
    assert.equal(decision.status, 'skipped_suppressed');
});

test('Gmail message includes one-click unsubscribe headers', () => {
    const raw = encodeMessage({
        from: 'sender@example.com',
        fromName: 'Alex',
        to: 'hello@acme.example',
        subject: 'Hello',
        text: 'Body',
        unsubscribeUrl: 'https://sender.example/unsubscribe',
    });
    const decoded = Buffer.from(raw, 'base64url').toString();
    assert.match(decoded, /List-Unsubscribe: <https:\/\/sender\.example\/unsubscribe>/);
    assert.match(decoded, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
});

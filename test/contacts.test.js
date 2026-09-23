import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyEmail,
    classifyPhone,
    contactsFromMapsPlace,
    extractContactsFromHtml,
    mergeContacts,
    normalizeEmail,
} from '../src/contacts.js';

test('normalises and filters email candidates', () => {
    assert.equal(normalizeEmail('MAILTO:Hello@Acme.COM?subject=Hi'), 'hello@acme.com');
    assert.equal(normalizeEmail('logo@example.com.png'), null);
    assert.equal(normalizeEmail('noreply@example.com'), null);
});

test('ranks a same-domain role mailbox above other addresses', () => {
    const role = classifyEmail('sales@acme.co.uk', 'www.acme.co.uk');
    const other = classifyEmail('founder@gmail.com', 'www.acme.co.uk');
    assert.equal(role.kind, 'role_business');
    assert.equal(role.same_domain, true);
    assert.ok(role.score > other.score);
});

test('classifies UK mobiles while excluding 070 personal numbers', () => {
    assert.deepEqual(classifyPhone('07700 900123'), {
        value: '+447700900123',
        kind: 'uk_mobile',
        is_mobile: true,
    });
    assert.equal(classifyPhone('07000 900123').is_mobile, false);
    assert.equal(classifyPhone('0117 123 4567').kind, 'uk_landline_or_service');
});

test('extracts mailto, visible email, tel, and contact links from HTML', () => {
    const result = extractContactsFromHtml(
        '<body>Email sales@acme.co.uk <a href="mailto:hello@acme.co.uk">email</a><a href="tel:07700900123">call</a><a href="/contact">Contact</a></body>',
        'https://acme.co.uk/',
    );
    assert.deepEqual(result.emails.sort(), ['hello@acme.co.uk', 'sales@acme.co.uk']);
    assert.equal(result.phones[0].value, '+447700900123');
    assert.ok(result.links.includes('https://acme.co.uk/contact'));
});

test('uses only email and phone-shaped map fields', () => {
    const contacts = contactsFromMapsPlace({
        website: 'https://acme.co.uk',
        emails: ['info@acme.co.uk'],
        phoneUnformatted: '+441171234567',
        description: 'Do not treat random text like person@example.net as a contact.',
    });
    assert.equal(contacts.emails.length, 1);
    assert.equal(contacts.emails[0].value, 'info@acme.co.uk');
    assert.equal(contacts.phones[0].value, '+441171234567');
});

test('merges map and website contacts and selects the best email', () => {
    const merged = mergeContacts(
        { emails: [classifyEmail('owner@gmail.com', 'acme.co.uk')], phones: [] },
        { emails: ['sales@acme.co.uk'], phones: [], pages: [] },
        'https://acme.co.uk',
    );
    assert.equal(merged.best_email, 'sales@acme.co.uk');
    assert.equal(merged.emails[0].source, 'business_website');
});

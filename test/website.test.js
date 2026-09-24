import assert from 'node:assert/strict';
import test from 'node:test';

import { assertPublicUrl, enrichWebsite, inspectWebsiteHtml } from '../src/website.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('blocks local and private network targets', async () => {
    await assert.rejects(() => assertPublicUrl('http://localhost/contact', publicLookup), /Local websites/);
    await assert.rejects(() => assertPublicUrl('http://127.0.0.1/contact', publicLookup), /Private network/);
    await assert.rejects(
        () =>
            assertPublicUrl('https://internal.example/contact', async () => [
                { address: '10.0.0.3', family: 4 },
            ]),
        /public addresses/,
    );
});

test('crawls only same-domain contact pages', async () => {
    const pages = new Map([
        [
            'https://acme.example/',
            '<body><a href="/contact">Contact us</a><a href="https://other.example/contact">Other</a></body>',
        ],
        [
            'https://acme.example/contact',
            '<body>Email <a href="mailto:hello@acme.example">hello@acme.example</a> or <a href="tel:07700900123">call</a></body>',
        ],
    ]);
    const fetchImplementation = async (url) => {
        const body = pages.get(url.href);
        return new Response(body ?? 'missing', {
            status: body ? 200 : 404,
            headers: { 'content-type': 'text/html' },
        });
    };
    const result = await enrichWebsite('https://acme.example/', 4, {
        fetchImplementation,
        lookup: publicLookup,
    });
    assert.deepEqual(result.pages, ['https://acme.example/', 'https://acme.example/contact']);
    assert.deepEqual(result.emails, ['hello@acme.example']);
    assert.equal(result.phones[0].is_mobile, true);
    assert.equal(result.emailSources['hello@acme.example'], 'https://acme.example/contact');
});

test('detects evidence useful for a website redesign pitch', () => {
    const signals = inspectWebsiteHtml(
        '<html><head><title>Acme</title></head><body>Copyright 2020 <a href="/book">Book now</a></body></html>',
        'http://acme.example/',
        2026,
    );
    assert.equal(signals.secure_https, false);
    assert.equal(signals.mobile_viewport, false);
    assert.equal(signals.booking_cta, true);
    assert.equal(signals.outdated_copyright, true);
});

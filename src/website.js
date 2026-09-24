import dns from 'node:dns/promises';
import net from 'node:net';

import { extractContactsFromHtml } from './contacts.js';

const MAX_PAGE_BYTES = 1024 * 1024;
const CONTACT_PATH = /(?:contact|about|enquir|reach-us|get-in-touch)/i;
const BOOKING_PATTERN =
    /(?:book|appointment|reserve|request[-\s]?a?[-\s]?quote|free[-\s]?estimate|consultation)/i;
const ANALYTICS_PATTERN =
    /(?:googletagmanager\.com|google-analytics\.com|gtag\s*\(|fbq\s*\(|connect\.facebook\.net|plausible\.io|matomo|clarity\.ms)/i;

function emptySignals(website) {
    return {
        status: website ? 'unavailable' : 'no_website',
        secure_https: website ? null : false,
        mobile_viewport: null,
        contact_form: null,
        booking_cta: null,
        analytics_detected: null,
        page_title_present: null,
        meta_description_present: null,
        copyright_year: null,
        outdated_copyright: null,
    };
}

export function inspectWebsiteHtml(html, pageUrl, currentYear = new Date().getUTCFullYear()) {
    const $ = extractContactsFromHtml(html, 'https://inspection.invalid/').document;
    const copyrightYears = [...$.text.matchAll(/(?:©|&copy;|copyright)\s*(?:19|20)\d{2}/gi)]
        .map((match) => Number(match[0].match(/(?:19|20)\d{2}/)?.[0]))
        .filter(Number.isFinite);
    const copyrightYear = copyrightYears.length > 0 ? Math.max(...copyrightYears) : null;

    return {
        status: 'checked',
        secure_https: new URL(pageUrl).protocol === 'https:',
        mobile_viewport: $.hasMobileViewport,
        contact_form: $.hasContactForm,
        booking_cta: BOOKING_PATTERN.test($.interactiveText),
        analytics_detected: ANALYTICS_PATTERN.test(html),
        page_title_present: $.title.length >= 3,
        meta_description_present: $.metaDescription.length >= 20,
        copyright_year: copyrightYear,
        outdated_copyright: copyrightYear === null ? null : copyrightYear < currentYear - 2,
    };
}

function isPrivateIpv4(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return true;
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
    );
}

function isPrivateIp(address) {
    if (net.isIPv4(address)) return isPrivateIpv4(address);
    if (!net.isIPv6(address)) return true;
    const normalized = address.toLowerCase();
    return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/.test(normalized) ||
        normalized.startsWith('::ffff:127.') ||
        normalized.startsWith('::ffff:10.') ||
        normalized.startsWith('::ffff:192.168.')
    );
}

export async function assertPublicUrl(value, lookup = dns.lookup) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Website URL is invalid.');
    }
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Only HTTP(S) websites can be enriched.');
    if (url.username || url.password) throw new Error('Website URLs containing credentials are not allowed.');
    if (url.port && !['80', '443'].includes(url.port))
        throw new Error('Non-standard website ports are not allowed.');
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local'))
        throw new Error('Local websites are not allowed.');

    if (net.isIP(url.hostname)) {
        if (isPrivateIp(url.hostname)) throw new Error('Private network websites are not allowed.');
    } else {
        const addresses = await lookup(url.hostname, { all: true, verbatim: true });
        if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
            throw new Error('Website did not resolve exclusively to public addresses.');
        }
    }
    return url;
}

async function readLimitedText(response, limit = MAX_PAGE_BYTES) {
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > limit) throw new Error('Website page exceeded the 1 MiB limit.');
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            throw new Error('Website page exceeded the 1 MiB limit.');
        }
        chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

async function safeFetchHtml(initialUrl, fetchImplementation, lookup) {
    let current = await assertPublicUrl(initialUrl, lookup);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await fetchImplementation(current, {
            redirect: 'manual',
            signal: AbortSignal.timeout(12000),
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'BusinessfinderBot/0.1 (+contact enrichment; respects public business pages)',
            },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Website returned an invalid redirect.');
            current = await assertPublicUrl(new URL(location, current).href, lookup);
            continue;
        }
        if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('text/html'))
            throw new Error('Website response was not HTML.');
        return { html: await readLimitedText(response), finalUrl: current.href };
    }
    throw new Error('Website redirected too many times.');
}

export async function enrichWebsite(
    website,
    maxPages,
    { fetchImplementation = globalThis.fetch, lookup = dns.lookup } = {},
) {
    if (!website)
        return {
            emails: [],
            emailSources: {},
            phones: [],
            phoneSources: {},
            socials: {},
            pages: [],
            signals: emptySignals(null),
            error: null,
        };
    let root;
    try {
        root = await assertPublicUrl(website, lookup);
    } catch (error) {
        return {
            emails: [],
            emailSources: {},
            phones: [],
            phoneSources: {},
            socials: {},
            pages: [],
            signals: emptySignals(website),
            error: error.message,
        };
    }

    const queue = [root.href];
    const visited = new Set();
    const emails = new Set();
    const phones = new Map();
    const emailSources = {};
    const phoneSources = {};
    const socials = {};
    let signals = emptySignals(website);
    let lastError = null;

    while (queue.length > 0 && visited.size < maxPages) {
        const nextUrl = queue.shift();
        if (visited.has(nextUrl)) continue;
        visited.add(nextUrl);
        try {
            const { html, finalUrl } = await safeFetchHtml(nextUrl, fetchImplementation, lookup);
            const extracted = extractContactsFromHtml(html, finalUrl);
            if (signals.status !== 'checked') signals = inspectWebsiteHtml(html, finalUrl);
            else {
                signals.contact_form ||= extracted.document.hasContactForm;
                signals.booking_cta ||= BOOKING_PATTERN.test(extracted.document.interactiveText);
            }
            extracted.emails.forEach((email) => {
                emails.add(email);
                emailSources[email] ??= finalUrl;
            });
            extracted.phones.forEach((phone) => {
                phones.set(phone.value, phone);
                phoneSources[phone.value] ??= finalUrl;
            });
            Object.assign(socials, extracted.socials);
            for (const link of extracted.links) {
                const candidate = new URL(link);
                if (
                    candidate.hostname === root.hostname &&
                    CONTACT_PATH.test(candidate.pathname) &&
                    !visited.has(candidate.href)
                ) {
                    queue.push(candidate.href);
                }
            }
        } catch (error) {
            lastError = error.message;
        }
    }

    return {
        emails: [...emails],
        emailSources,
        phones: [...phones.values()],
        phoneSources,
        socials,
        pages: [...visited],
        signals,
        error: emails.size === 0 && phones.size === 0 ? lastError : null,
    };
}

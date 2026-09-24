import { load } from 'cheerio';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
const PHONE_PATTERN =
    /(?:\+?44\s?(?:\(0\)\s?)?|0)(?:7\d{3}|1\d{2,4}|2\d{1,3}|3\d{2})[\s().-]*\d[\d\s().-]{5,12}\d/g;
const BAD_EMAIL_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js'];
const BAD_LOCAL_PARTS = new Set(['example', 'email', 'name', 'yourname', 'user', 'noreply', 'no-reply']);
const ROLE_PREFIXES = new Set([
    'hello',
    'info',
    'sales',
    'contact',
    'enquiries',
    'enquiry',
    'office',
    'bookings',
    'support',
    'team',
]);
const SOCIAL_HOSTS = {
    facebook: /(^|\.)facebook\.com$/i,
    instagram: /(^|\.)instagram\.com$/i,
    linkedin: /(^|\.)linkedin\.com$/i,
    x: /(^|\.)(?:x|twitter)\.com$/i,
    youtube: /(^|\.)youtube\.com$/i,
};

export function normalizeEmail(value) {
    if (typeof value !== 'string') return null;
    const email = value
        .replace(/^mailto:/i, '')
        .split('?')[0]
        .trim()
        .toLowerCase()
        .replace(/[),.;:]+$/, '');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(email)) return null;
    if (BAD_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix))) return null;
    const [local, domain] = email.split('@');
    if (BAD_LOCAL_PARTS.has(local) || domain.includes('example.')) return null;
    return email;
}

export function classifyEmail(email, websiteHostname = '') {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const [local, domain] = normalized.split('@');
    const hostname = websiteHostname.toLowerCase().replace(/^www\./, '');
    const sameDomain =
        hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`);
    const roleBased = ROLE_PREFIXES.has(local);
    return {
        value: normalized,
        kind: roleBased ? 'role_business' : 'published_business',
        same_domain: sameDomain,
        score: (sameDomain ? 40 : 0) + (roleBased ? 30 : 10),
    };
}

function digitsOnly(value) {
    return value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

export function normalizePhone(value) {
    if (typeof value !== 'string') return null;
    let compact = digitsOnly(value.trim());
    if (compact.startsWith('0044')) compact = `+44${compact.slice(4)}`;
    if (compact.startsWith('+440')) compact = `+44${compact.slice(4)}`;
    if (compact.startsWith('0') && compact.length >= 10 && compact.length <= 11)
        compact = `+44${compact.slice(1)}`;
    if (!compact.startsWith('+') || compact.length < 9 || compact.length > 16) return null;
    return compact;
}

export function classifyPhone(value) {
    const normalized = normalizePhone(value);
    if (!normalized) return null;
    const ukNational = normalized.startsWith('+44') ? `0${normalized.slice(3)}` : '';
    const isUkMobile = /^07\d{9}$/.test(ukNational) && !/^070/.test(ukNational);
    let kind = 'unknown';
    if (normalized.startsWith('+44')) kind = 'uk_landline_or_service';
    if (isUkMobile) kind = 'uk_mobile';
    return {
        value: normalized,
        kind,
        is_mobile: isUkMobile,
    };
}

function uniqueByValue(items) {
    return [...new Map(items.filter(Boolean).map((item) => [item.value, item])).values()];
}

export function extractContactsFromHtml(html, pageUrl) {
    const $ = load(html);
    const text = $('body').text().replace(/\s+/g, ' ');
    const emails = [];
    const phones = [];
    const links = [];
    const socials = {};

    for (const match of text.matchAll(EMAIL_PATTERN)) emails.push(normalizeEmail(match[0]));
    for (const match of text.matchAll(PHONE_PATTERN)) phones.push(classifyPhone(match[0]));

    $('a[href]').each((_index, element) => {
        const href = $(element).attr('href')?.trim();
        if (!href) return;
        if (/^mailto:/i.test(href)) emails.push(normalizeEmail(href));
        if (/^tel:/i.test(href)) phones.push(classifyPhone(href.replace(/^tel:/i, '')));
        try {
            const link = new URL(href, pageUrl);
            links.push(link.href);
            for (const [network, pattern] of Object.entries(SOCIAL_HOSTS)) {
                if (pattern.test(link.hostname)) socials[network] ??= link.href;
            }
        } catch {
            // Ignore malformed page links.
        }
    });

    return {
        emails: [...new Set(emails.filter(Boolean))],
        phones: uniqueByValue(phones),
        links: [...new Set(links)],
        socials,
        document: {
            text,
            title: $('title').first().text().trim(),
            metaDescription: $('meta[name="description"]').first().attr('content')?.trim() ?? '',
            hasMobileViewport: $('meta[name="viewport"]').length > 0,
            hasContactForm:
                $('form').filter((_index, form) => {
                    const formHtml = $.html(form);
                    return /(?:type=["']?(?:email|tel)|contact|enquir|message)/i.test(formHtml);
                }).length > 0,
            interactiveText: $('a, button')
                .map((_index, element) => `${$(element).text()} ${$(element).attr('href') ?? ''}`)
                .get()
                .join(' '),
        },
    };
}

function collectStringsForKeys(value, wantedPattern, output = [], depth = 0) {
    if (depth > 5 || value === null || value === undefined) return output;
    if (Array.isArray(value)) {
        for (const item of value) collectStringsForKeys(item, wantedPattern, output, depth + 1);
        return output;
    }
    if (typeof value !== 'object') return output;
    for (const [key, item] of Object.entries(value)) {
        if (wantedPattern.test(key)) {
            if (typeof item === 'string') output.push(item);
            if (Array.isArray(item)) output.push(...item.filter((entry) => typeof entry === 'string'));
        } else if (typeof item === 'object') {
            collectStringsForKeys(item, wantedPattern, output, depth + 1);
        }
    }
    return output;
}

export function contactsFromMapsPlace(place) {
    let hostname = '';
    try {
        hostname = new URL(place.website).hostname;
    } catch {
        // A missing or malformed website simply cannot get same-domain scoring.
    }

    const emailValues = collectStringsForKeys(place, /email/i);
    const phoneValues = collectStringsForKeys(place, /phone/i);
    if (typeof place.phone === 'string') phoneValues.push(place.phone);
    if (typeof place.phoneUnformatted === 'string') phoneValues.push(place.phoneUnformatted);

    return {
        emails: uniqueByValue(
            emailValues
                .flatMap((value) => value.match(EMAIL_PATTERN) ?? [])
                .map((email) => classifyEmail(email, hostname)),
        ),
        phones: uniqueByValue(phoneValues.map(classifyPhone)),
        socials: {},
    };
}

export function mergeContacts(mapContacts, websiteContacts, website) {
    let hostname = '';
    try {
        hostname = new URL(website).hostname;
    } catch {
        // Leave hostname empty.
    }
    const emails = [
        ...mapContacts.emails.map((item) => ({ ...item, source: 'maps_contact_data' })),
        ...websiteContacts.emails.map((email) => ({
            ...classifyEmail(email, hostname),
            source: 'business_website',
            source_url: websiteContacts.emailSources?.[email] ?? null,
        })),
    ].filter((item) => item.value);
    const phones = [
        ...mapContacts.phones.map((item) => ({ ...item, source: 'google_maps' })),
        ...websiteContacts.phones.map((item) => ({
            ...item,
            source: 'business_website',
            source_url: websiteContacts.phoneSources?.[item.value] ?? null,
        })),
    ];

    return {
        emails: uniqueByValue(emails).sort((a, b) => b.score - a.score),
        phones: uniqueByValue(phones),
        best_email: uniqueByValue(emails).sort((a, b) => b.score - a.score)[0]?.value ?? null,
        socials: { ...(mapContacts.socials ?? {}), ...(websiteContacts.socials ?? {}) },
    };
}

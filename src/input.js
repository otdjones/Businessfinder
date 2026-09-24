const ROOT_KEYS = new Set([
    'searchTerms',
    'location',
    'maxResultsPerSearch',
    'minimumRating',
    'minimumReviews',
    'servicePreset',
    'minimumLeadScore',
    'contactRequirement',
    'includeUnqualified',
    'onlyNewBusinesses',
    'enrichment',
    'outreach',
]);

const DEFAULT_BODY = `Hello {{business_name}} team,

I noticed {{opportunity_summary}}

I would be happy to share an idea for {{pitch_angle}}

Kind regards,
{{sender_name}}

If this is not relevant, you can opt out here: {{unsubscribe_url}}
{{sender_postal_address}}`;

export class InputError extends Error {
    constructor(message, code = 'INVALID_INPUT') {
        super(message);
        this.name = 'InputError';
        this.code = code;
    }
}

function boundedInteger(value, fallback, minimum, maximum, field) {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
        throw new InputError(`${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return resolved;
}

function boundedNumber(value, fallback, minimum, maximum, field) {
    const resolved = value ?? fallback;
    if (
        typeof resolved !== 'number' ||
        !Number.isFinite(resolved) ||
        resolved < minimum ||
        resolved > maximum
    ) {
        throw new InputError(`${field} must be a number from ${minimum} to ${maximum}.`);
    }
    return resolved;
}

function cleanText(value, field, { minimum = 1, maximum = 500 } = {}) {
    if (typeof value !== 'string') throw new InputError(`${field} must be text.`);
    const cleaned = value.trim();
    if (cleaned.length < minimum || cleaned.length > maximum) {
        throw new InputError(`${field} must contain ${minimum} to ${maximum} characters.`);
    }
    return cleaned;
}

function cleanEmailList(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 5000) {
        throw new InputError('outreach.suppressionEmails must be an array with at most 5,000 entries.');
    }
    return [
        ...new Set(value.map((item) => cleanText(item, 'suppression email', { maximum: 254 }).toLowerCase())),
    ];
}

function validateOutreach(value = {}) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new InputError('outreach must be an object.');
    }

    const mode = value.mode ?? 'off';
    if (!['off', 'prepare', 'send'].includes(mode)) {
        throw new InputError('outreach.mode must be off, prepare, or send.');
    }

    const outreach = {
        mode,
        fromName: typeof value.fromName === 'string' ? value.fromName.trim() : '',
        subjectTemplate:
            typeof value.subjectTemplate === 'string'
                ? value.subjectTemplate.trim()
                : 'A quick idea for {{business_name}}',
        bodyTemplate: typeof value.bodyTemplate === 'string' ? value.bodyTemplate.trim() : DEFAULT_BODY,
        unsubscribeUrl: typeof value.unsubscribeUrl === 'string' ? value.unsubscribeUrl.trim() : '',
        senderPostalAddress:
            typeof value.senderPostalAddress === 'string' ? value.senderPostalAddress.trim() : '',
        confirmedLawfulBasis: value.confirmedLawfulBasis === true,
        suppressionEmails: cleanEmailList(value.suppressionEmails),
        maxMessages: boundedInteger(value.maxMessages, 25, 1, 50, 'outreach.maxMessages'),
        sendIntervalMs: boundedInteger(value.sendIntervalMs, 3000, 1000, 60000, 'outreach.sendIntervalMs'),
    };

    if (mode === 'off') return outreach;
    if (!outreach.fromName) throw new InputError('outreach.fromName is required when outreach is enabled.');
    if (!outreach.subjectTemplate || outreach.subjectTemplate.length > 200) {
        throw new InputError('outreach.subjectTemplate must contain 1 to 200 characters.');
    }
    if (!outreach.bodyTemplate || outreach.bodyTemplate.length > 10000) {
        throw new InputError('outreach.bodyTemplate must contain 1 to 10,000 characters.');
    }
    if (!outreach.unsubscribeUrl.startsWith('https://')) {
        throw new InputError('outreach.unsubscribeUrl must be an HTTPS URL when outreach is enabled.');
    }
    if (!outreach.senderPostalAddress) {
        throw new InputError('outreach.senderPostalAddress is required when outreach is enabled.');
    }
    if (!outreach.bodyTemplate.includes('{{unsubscribe_url}}')) {
        throw new InputError('outreach.bodyTemplate must include {{unsubscribe_url}}.');
    }
    if (mode === 'send' && !outreach.confirmedLawfulBasis) {
        throw new InputError(
            'Sending is blocked until outreach.confirmedLawfulBasis is explicitly set to true.',
            'LAWFUL_BASIS_NOT_CONFIRMED',
        );
    }

    return outreach;
}

export function validateInput(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new InputError('Input must be a JSON object.');
    }

    const unknownKeys = Object.keys(value).filter((key) => !ROOT_KEYS.has(key));
    if (unknownKeys.length > 0) throw new InputError(`Unknown input field: ${unknownKeys[0]}.`);
    if (!Array.isArray(value.searchTerms) || value.searchTerms.length < 1 || value.searchTerms.length > 20) {
        throw new InputError('searchTerms must contain 1 to 20 business types.');
    }

    const searchTerms = [
        ...new Set(
            value.searchTerms.map((term) => cleanText(term, 'search term', { maximum: 120 }).toLowerCase()),
        ),
    ];
    const location = cleanText(value.location, 'location', { minimum: 2, maximum: 160 });
    const enrichmentValue = value.enrichment ?? {};
    if (enrichmentValue === null || typeof enrichmentValue !== 'object' || Array.isArray(enrichmentValue)) {
        throw new InputError('enrichment must be an object.');
    }

    const servicePreset = value.servicePreset ?? 'website_redesign';
    if (!['website_redesign', 'local_seo', 'reputation', 'general_sales'].includes(servicePreset)) {
        throw new InputError(
            'servicePreset must be website_redesign, local_seo, reputation, or general_sales.',
        );
    }
    const contactRequirement = value.contactRequirement ?? 'email_or_phone';
    if (!['any', 'email', 'verified_email', 'phone', 'email_or_phone'].includes(contactRequirement)) {
        throw new InputError(
            'contactRequirement must be any, email, verified_email, phone, or email_or_phone.',
        );
    }

    return {
        searchTerms,
        location,
        maxResultsPerSearch: boundedInteger(value.maxResultsPerSearch, 25, 1, 200, 'maxResultsPerSearch'),
        minimumRating: boundedNumber(value.minimumRating, 0, 0, 5, 'minimumRating'),
        minimumReviews: boundedInteger(value.minimumReviews, 0, 0, 1000000, 'minimumReviews'),
        servicePreset,
        minimumLeadScore: boundedInteger(value.minimumLeadScore, 45, 0, 100, 'minimumLeadScore'),
        contactRequirement,
        includeUnqualified: value.includeUnqualified === true,
        onlyNewBusinesses: value.onlyNewBusinesses === true,
        enrichment: {
            useMapsContactAddon: enrichmentValue.useMapsContactAddon === true,
            crawlBusinessWebsite: enrichmentValue.crawlBusinessWebsite !== false,
            verifyEmailDomains: enrichmentValue.verifyEmailDomains !== false,
            maxWebsitePages: boundedInteger(
                enrichmentValue.maxWebsitePages,
                4,
                1,
                8,
                'enrichment.maxWebsitePages',
            ),
            includeMobileNumbers: enrichmentValue.includeMobileNumbers !== false,
        },
        outreach: validateOutreach(value.outreach),
    };
}

import dns from 'node:dns/promises';

function verificationForError(error) {
    if (['ENODATA', 'ENOTFOUND', 'ENONAME'].includes(error?.code)) {
        return { status: 'no_mx', mx_valid: false };
    }
    return { status: 'unknown', mx_valid: null };
}

export function createEmailDomainVerifier(resolveMx = dns.resolveMx) {
    const cache = new Map();

    async function verifyDomain(domain) {
        if (!cache.has(domain)) {
            cache.set(
                domain,
                (async () => {
                    try {
                        const records = await resolveMx(domain);
                        const acceptsMail = records.some(
                            (record) =>
                                typeof record.exchange === 'string' &&
                                record.exchange.length > 0 &&
                                record.exchange !== '.',
                        );
                        return acceptsMail
                            ? { status: 'mx_valid', mx_valid: true }
                            : { status: 'no_mx', mx_valid: false };
                    } catch (error) {
                        return verificationForError(error);
                    }
                })(),
            );
        }
        return cache.get(domain);
    }

    return async function verifyContacts(contacts) {
        const emails = await Promise.all(
            contacts.emails.map(async (email) => {
                const domain = email.value.split('@')[1];
                const verification = domain
                    ? await verifyDomain(domain)
                    : { status: 'no_mx', mx_valid: false };
                return {
                    ...email,
                    verification_status: verification.status,
                    mx_valid: verification.mx_valid,
                };
            }),
        );
        emails.sort((a, b) => {
            const verificationDifference = Number(b.mx_valid === true) - Number(a.mx_valid === true);
            return verificationDifference || b.score - a.score;
        });
        const preferred = emails.find((email) => email.mx_valid !== false) ?? emails[0];
        return { ...contacts, emails, best_email: preferred?.value ?? null };
    };
}

export function markEmailsNotChecked(contacts) {
    const emails = contacts.emails.map((email) => ({
        ...email,
        verification_status: 'not_checked',
        mx_valid: null,
    }));
    return { ...contacts, emails, best_email: emails[0]?.value ?? null };
}

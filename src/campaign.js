const TOKEN_PATTERN = /{{\s*([a-z_]+)\s*}}/g;

function render(template, variables) {
    return template.replace(TOKEN_PATTERN, (_match, name) => variables[name] ?? '');
}

function safeHeader(value) {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

export function createDraft(lead, outreach) {
    const variables = {
        business_name: lead.business.name,
        business_category: lead.business.category ?? '',
        business_city: lead.business.city ?? '',
        sender_name: outreach.fromName,
        sender_postal_address: outreach.senderPostalAddress,
        unsubscribe_url: outreach.unsubscribeUrl,
    };
    return {
        to: lead.contacts.best_email,
        subject: safeHeader(render(outreach.subjectTemplate, variables)).slice(0, 200),
        text: render(outreach.bodyTemplate, variables),
        unsubscribe_url: outreach.unsubscribeUrl,
    };
}

export function outreachDecision(lead, outreach, sentCount) {
    if (outreach.mode === 'off') return { status: 'not_requested' };
    if (!lead.contacts.best_email) return { status: 'skipped_no_business_email' };
    if (outreach.suppressionEmails.includes(lead.contacts.best_email))
        return { status: 'skipped_suppressed' };
    if (sentCount >= outreach.maxMessages) return { status: 'skipped_run_limit' };
    return { status: outreach.mode === 'prepare' ? 'drafted' : 'ready_to_send' };
}

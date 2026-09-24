function percentage(value) {
    return `${Number(value ?? 0).toFixed(1)}%`;
}

export function renderRunReport(summary) {
    return `# Businessfinder run report

## Outcome

- Qualified leads: **${summary.qualified_leads}**
- Dataset rows: **${summary.businesses_output}**
- Candidates checked: **${summary.candidates_enriched}**
- Previously delivered businesses skipped: **${summary.previously_delivered_excluded}**
- Duplicate Maps results removed: **${summary.duplicates_removed}**

## Contact quality

- Public email: **${percentage(summary.email_fill_rate_percent)}**
- MX-verified email: **${percentage(summary.verified_email_fill_rate_percent)}**
- Phone: **${percentage(summary.phone_fill_rate_percent)}**
- UK mobile: **${percentage(summary.uk_mobile_fill_rate_percent)}**

## Qualification settings

- Service preset: \`${summary.service_preset}\`
- Minimum lead score: **${summary.minimum_lead_score}**
- Required contact: \`${summary.contact_requirement}\`
- Only new businesses: **${summary.only_new_businesses ? 'yes' : 'no'}**

Runtime: ${summary.runtime_seconds} seconds. Outreach mode: \`${summary.outreach_mode}\`.
`;
}

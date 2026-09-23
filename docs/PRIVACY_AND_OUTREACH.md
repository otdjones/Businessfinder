# Privacy and outreach checklist

This is a product checklist, not legal advice.

## Collection

- Collect only contact details that a business intentionally publishes on Google Maps or its own public website.
- Keep employee/person enrichment and reviewer personal data disabled.
- Record the source page and collection time so a contact can be reviewed or removed.
- Do not infer a person's consent from the fact that an address or number is public.
- Apply a retention period and delete stale leads.

## Before sending

- Decide and document the lawful basis and the rules that apply in every target country.
- In the UK, distinguish corporate subscribers from sole traders and some partnerships; the rules are not identical.
- Verify the sender domain's SPF, DKIM, and DMARC configuration.
- Use a truthful sender name, subject, and postal address.
- Include a working opt-out in every marketing message and honour it promptly.
- Merge opt-outs, hard bounces, complaints, and previous do-not-contact requests into the suppression list before every campaign.
- Never use an extracted mobile number for SMS or WhatsApp without a separate, appropriate permission and workflow.

## Operational safeguards

- Start with drafts and human review.
- Send one recipient per message; never expose a recipient list in To or CC.
- Keep volumes low and consistent with the mailbox provider's current limits.
- Stop a campaign when complaints, bounces, authentication failures, or provider warnings rise.
- Preserve an audit log containing the campaign, template version, recipient source, send result, and opt-out state.

## Gmail configuration

The current single-tenant sender uses OAuth and the Gmail API. It does not accept mailbox passwords. The OAuth refresh token, client secret, and sender address must be stored as platform secrets. A production multi-tenant service should encrypt each customer's token separately and support immediate revocation.

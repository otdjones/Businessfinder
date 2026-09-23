# Businessfinder

Businessfinder is an Apify Actor for building a clean, auditable list of local businesses. It delegates Maps discovery to Apify's maintained `compass/crawler-google-places` Actor, deduplicates and filters the results, checks a small number of public pages on each business's own website, ranks public business email addresses, and identifies UK mobile numbers.

It can also prepare personalised plain-text outreach drafts or, in a single-tenant deployment, send them through the operator's own Gmail/Google Workspace mailbox using OAuth. Sending is off by default.

## What it does

1. Searches one location for up to 20 distinct business types.
2. Uses hard per-search limits so the upstream Maps cost is bounded.
3. Requests company contact enrichment but never requests employee/person lead enrichment or reviewer personal data.
4. Deduplicates places and filters closed, low-rating, or low-review results.
5. Checks the business homepage and a few same-domain contact/about pages.
6. Normalises public emails and phone numbers, including UK mobile classification.
7. Outputs one structured lead per dataset row, ready for CSV/Excel export.
8. Optionally creates drafts or sends a small, rate-limited campaign with suppression and unsubscribe controls.

## Input example

```json
{
    "searchTerms": ["independent garden centre", "landscape gardener"],
    "location": "Bristol, United Kingdom",
    "maxResultsPerSearch": 25,
    "minimumRating": 3.5,
    "minimumReviews": 5,
    "enrichment": {
        "useMapsContactAddon": true,
        "crawlBusinessWebsite": true,
        "maxWebsitePages": 4,
        "includeMobileNumbers": true
    },
    "outreach": {
        "mode": "prepare",
        "fromName": "Alex",
        "subjectTemplate": "A quick idea for {{business_name}}",
        "bodyTemplate": "Hello {{business_name}} team,\n\nI think our service may be relevant to you.\n\nKind regards,\n{{sender_name}}\n\nOpt out: {{unsubscribe_url}}\n{{sender_postal_address}}",
        "unsubscribeUrl": "https://example.com/unsubscribe",
        "senderPostalAddress": "1 Example Street, Bristol, BS1 1AA",
        "maxMessages": 25,
        "suppressionEmails": []
    }
}
```

Supported template fields are `{{business_name}}`, `{{business_category}}`, `{{business_city}}`, `{{sender_name}}`, `{{sender_postal_address}}`, and `{{unsubscribe_url}}`.

## Outreach modes

- `off`: discovery and enrichment only.
- `prepare`: saves a draft in each eligible lead row but sends nothing.
- `send`: sends through Gmail after every send safeguard passes.

`send` additionally requires `confirmedLawfulBasis: true` and the four secrets shown in `.env.example`. Store them as Apify secrets. Never put refresh tokens in Actor input or source control. The Gmail API sends one recipient per message and the Actor caps a run at 50 messages.

The confirmation is a technical safety gate, not legal advice. The operator remains responsible for recipient selection, applicable UK GDPR/PECR or other local law, an accurate sender identity, working opt-out handling, mailbox limits, and suppression-list updates. See [docs/PRIVACY_AND_OUTREACH.md](docs/PRIVACY_AND_OUTREACH.md).

## Output

Each dataset row contains:

- `business`: name, category, address, website, Maps URL, rating, reviews, and location;
- `contacts`: ranked emails, normalised phones, and `best_email`;
- `qualification`: a transparent score and its reasons;
- `outreach`: not requested, skipped, drafted, sent, or failed;
- `provenance`: Maps source, pages checked, and any enrichment error.

The run summary is saved as `RUN_SUMMARY` in the default key-value store.

## Local development

```bash
npm ci
npm run check
npm start
```

Local Actor runs need an Apify token because discovery calls another Actor. Sending also needs the Gmail OAuth secrets described above.

## Security limits

Website refinement accepts only HTTP(S), blocks credentials, local hostnames, private/reserved network addresses, non-standard ports, oversized pages, non-HTML content, and long redirect chains. It visits no more than eight same-domain pages per business and does not execute page JavaScript.

## Known limitations

- Public contact text can be stale or incorrectly labelled; verify important leads before outreach.
- UK mobile classification is based on number structure and excludes `070` personal numbers; it does not prove who owns a number.
- Website discovery is intentionally conservative and will miss contacts rendered only by JavaScript or hidden behind forms.
- The public Apify Actor is best for discovery, enrichment, and draft preparation. A multi-customer sending product should use a separate web service with per-user OAuth, encrypted token storage, webhook-driven unsubscribe handling, tenant isolation, and delivery monitoring. The recommended design is in [docs/OUTREACH_SERVICE.md](docs/OUTREACH_SERVICE.md).

Businessfinder is not affiliated with Google, Apify, or Gmail. Upstream Actor usage is billed separately by Apify under its live listing.

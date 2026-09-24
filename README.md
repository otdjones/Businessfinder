# Businessfinder — qualified local business opportunities

Businessfinder finds local businesses that have a specific, observable problem your service can solve. It combines Google Maps discovery with conservative website inspection, public contact extraction, email-domain checks, transparent lead scoring, and CRM-ready output.

Instead of returning a raw directory, every qualified row answers three questions:

1. **Can I contact this business?** Public email, phone, UK-mobile classification, source URL, and MX status.
2. **Why might it need my service?** Website, local SEO, or reputation evidence gathered from public pages and Maps data.
3. **What should I say?** A concise opportunity summary and suggested pitch angle.

## Best fit

The first version is designed for UK web-design, local SEO, and reputation-management agencies that prospect local businesses. It can also produce general B2B prospect lists.

## What it does

1. Searches up to 20 business types in one town, city, county, or country.
2. Places a hard limit on each Maps search to control upstream cost.
3. Deduplicates results and removes closed or below-threshold businesses.
4. Checks a small number of public, same-domain website pages without executing JavaScript.
5. Finds public business emails, phones, UK mobiles, and social profiles.
6. Checks whether an email domain publishes a usable MX record. This is a domain check, not a guarantee that a particular mailbox exists.
7. Detects evidence such as no website, no HTTPS, missing mobile viewport, no contact form, no booking CTA, weak page metadata, outdated copyright, low review count, or a rating below 4.0.
8. Returns qualified leads only by default and explains every score.
9. Optionally remembers delivered businesses so a scheduled task returns only new leads.
10. Produces a JSON summary and readable Markdown run report.

Businessfinder delegates Maps discovery to Apify's maintained `compass/crawler-google-places` Actor. Its paid contact add-on is off by default because Businessfinder performs its own public website refinement.

## Opportunity presets

- `website_redesign` — finds visible website and conversion problems.
- `local_seo` — finds weak page metadata, low review volume, and other local visibility opportunities.
- `reputation` — prioritises low ratings and low review counts.
- `general_sales` — prioritises contactability for broader B2B prospecting.

## Input example

```json
{
    "searchTerms": ["roofers", "landscape gardeners"],
    "location": "Manchester, United Kingdom",
    "maxResultsPerSearch": 25,
    "servicePreset": "website_redesign",
    "minimumLeadScore": 45,
    "contactRequirement": "email_or_phone",
    "onlyNewBusinesses": true,
    "enrichment": {
        "useMapsContactAddon": false,
        "crawlBusinessWebsite": true,
        "verifyEmailDomains": true,
        "maxWebsitePages": 4,
        "includeMobileNumbers": true
    },
    "outreach": {
        "mode": "off"
    }
}
```

Set `includeUnqualified` to `true` only when tuning a preset or score threshold. Normal customer runs should leave it off.

## Output

The default table and CSV contain flat fields including:

- business name, category, address, city, postcode, website, Maps URL, rating, and reviews;
- best email, email source URL, MX status, phone, UK mobile, and social profiles;
- lead score, opportunity score, primary issue, full opportunity summary, suggested pitch angle, and evidence labels;
- outreach status.

Nested `business`, `contacts`, `website_signals`, `opportunity`, `qualification`, `outreach`, and `provenance` objects preserve the complete audit trail. `RUN_SUMMARY` contains machine-readable metrics and `RUN_REPORT` contains a readable quality report.

## Repeat discovery

Enable `onlyNewBusinesses` when saving an Apify task or schedule. Businessfinder stores up to 50,000 delivered business keys per search scope and omits them on later runs with the same location, search terms, and opportunity preset.

## Pay per qualified lead

Qualified dataset rows are emitted under the Apify pay-per-event name `qualified-lead`; diagnostic rows use `unqualified-candidate`, which must remain free. Before publishing paid pricing, benchmark several categories and configure those events in the Actor's Monetization settings. Do not set a price until the real upstream and compute cost per 1,000 qualified leads has been measured.

## Outreach modes

- `off` — lead discovery and qualification only.
- `prepare` — adds a personalised draft to eligible rows but sends nothing.
- `send` — a restricted single-mailbox proof of concept using Gmail OAuth.

Draft templates support `{{business_name}}`, `{{business_category}}`, `{{business_city}}`, `{{opportunity_summary}}`, `{{pitch_angle}}`, `{{sender_name}}`, `{{sender_postal_address}}`, and `{{unsubscribe_url}}`.

Sending is deliberately not the main public product. A customer-facing sender needs per-user Google/Microsoft OAuth, encrypted token storage, tenant isolation, bounce handling, suppression, unsubscribe processing, and delivery monitoring. See [the multi-customer design](docs/OUTREACH_SERVICE.md).

## Local development

```bash
npm ci
npm run check
npm start
```

Local Actor runs require an Apify token because discovery calls another Actor.

## Security and data limits

Website refinement accepts only HTTP(S), blocks credentials, local hostnames, private/reserved network addresses, non-standard ports, oversized pages, non-HTML content, and long redirect chains. It visits no more than eight same-domain pages and does not execute page JavaScript.

Public contact information can be stale. An MX result confirms only that a domain advertises mail handling, not that the specific address will accept mail. UK-mobile classification is structural and does not prove ownership. Operators remain responsible for UK GDPR, PECR, suppression, opt-out, and their own outreach decisions; see [the privacy and outreach checklist](docs/PRIVACY_AND_OUTREACH.md).

Businessfinder is not affiliated with Google, Apify, or Gmail. Upstream Actor usage is billed separately under Apify's live listing.

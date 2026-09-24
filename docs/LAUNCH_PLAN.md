# Businessfinder launch plan

## Positioning

**Store name:** UK Business Opportunity Finder — Verified Leads

**One-line promise:** Find contactable UK businesses with a specific website, local SEO, or reputation problem your agency can solve.

Avoid positioning Businessfinder as a generic Google Maps scraper. The buyer is paying for a qualified reason to contact a business, evidence behind that reason, and a usable contact route.

## Initial customer

Start with UK web-design and local SEO agencies. Their recurring job is:

> Give me new local businesses each week that have a visible marketing problem, a public way to contact them, and a sensible opening angle.

Do not expand to many customer types until this group is repeatedly using scheduled runs.

## Beta offer

1. Recruit five agency owners or lead-generation freelancers.
2. Give each a free sample of 25 leads for one service, category, and location.
3. Ask which five they would actually contact and why.
4. Record false positives, missing contacts, and missing opportunity evidence.
5. Adjust preset weights only from repeated feedback, not a single unusual lead.
6. Ask successful testers for an honest Apify review and a one-sentence testimonial.

## Evidence to publish

Benchmark at least 100 candidates in each of five categories across multiple UK cities. Publish:

- candidates checked and qualified leads returned;
- public-email, MX-valid-email, phone, and UK-mobile fill rates;
- duplicates removed;
- runtime and total platform cost;
- cost per 1,000 qualified leads;
- a manually reviewed false-positive sample.

Never advertise a fill rate or accuracy claim that has not been measured from saved run reports.

## Pricing gate

Keep the beta free or on platform-usage pricing until there are enough benchmark runs to calculate:

`profit per 1,000 = (listed PPE price × 0.80) - upstream Actor cost - Businessfinder compute cost`

The initial hypothesis is £/$9.90 per 1,000 qualified leads, but publish that price only if the benchmark leaves a healthy margin and buyers prefer the results over cheaper raw-data Actors. Charge the `qualified-lead` event only; configure `unqualified-candidate` as free so diagnostic candidates are never billed.

## Store assets

- Screenshot of the simple input form.
- Screenshot of the flat output table showing “Why now” and “Suggested angle.”
- Screenshot of the run-quality report.
- A 60–90 second video: choose a niche and city, run, inspect evidence, export.
- Three concrete examples: website redesign, local SEO, and reputation growth.
- Clear disclosure that Maps discovery has upstream Apify usage cost.

## Repeat-use funnel

1. Buyer runs a small sample.
2. Buyer checks the source evidence and exports accepted leads.
3. Buyer saves the input as a task with `onlyNewBusinesses: true`.
4. Buyer schedules a weekly run.
5. Businessfinder returns only newly discovered qualified businesses.

## Metrics

Track store view-to-run conversion, successful-run rate, cost per qualified lead, contact fill rates, false-positive rate, repeat users, scheduled tasks, and support/refund volume. Do not prioritise bulk email sending until the lead product has repeat customers.

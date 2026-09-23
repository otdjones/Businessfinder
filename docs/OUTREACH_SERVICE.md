# Multi-customer outreach service design

The Actor can safely create lead exports and drafts. Turning it into a service where customers connect their own mailbox should be a separate application rather than asking customers to place OAuth tokens in Actor input.

## Recommended components

1. **Web dashboard** — customer account, campaign builder, lead review, suppression list, and send status.
2. **OAuth broker** — Google OAuth with the narrow Gmail send scope, state/PKCE validation, revocation, and encrypted refresh-token storage.
3. **Lead worker** — starts Businessfinder Actor runs and imports only that customer's dataset.
4. **Campaign queue** — one job per recipient with idempotency keys, scheduled rate limits, retries only for known-safe failures, and an emergency pause.
5. **Unsubscribe service** — opaque signed links, one-click POST support, tenant-specific suppression, and immediate queue cancellation.
6. **Event store** — immutable source, consent/lawful-basis assertion, draft approval, sends, bounces, complaints, and opt-outs.

## Minimum data model

- `tenants`: customer and retention settings.
- `mailbox_connections`: provider, encrypted token reference, sender address, status, and last validation.
- `leads`: business details, contact source, collected date, and tenant ownership.
- `campaigns`: template version, audience rule, approval, daily limit, and status.
- `deliveries`: idempotency key, recipient, queued/sent/failed state, provider message ID, and timestamps.
- `suppressions`: tenant, normalised address, reason, source, and date.

## Non-negotiable controls

- Strong tenant isolation and row-level authorisation.
- Tokens encrypted with a managed key service and never written to logs.
- Explicit campaign approval; scraping never automatically starts sending.
- One recipient per provider call.
- Global and per-mailbox rate limits below provider limits.
- Required unsubscribe URL and postal address.
- Suppression check immediately before every send.
- Idempotency so a worker restart cannot duplicate a campaign.
- Admin kill switch and per-customer pause.

The Actor's environment-secret sender is suitable for the operator's own mailbox or a controlled proof of concept. It is not the right credential model for a public multi-tenant product.

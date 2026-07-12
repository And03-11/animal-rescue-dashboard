# Airtable Insights Audit

Audit date: 2026-07-12
Primary base: `Fundraising Hub 2.0`

## Data inventory

| Table | Records | Strong analytical fields |
| --- | ---: | --- |
| Donors | 11,789 | stage, funnel stage, region, lifetime donated, gift count, campaigns donated |
| Emails | 12,294 | domain, bounced account, days since last donation, sync status |
| Campaigns | 136 | source, start date, donation count, total raised, active state |
| Form Titles | 1,520 | source, campaign, total raised, donation count, first donation date |
| Donations | 34,553 | amount, timestamp, source, donor stage, domain, currency, DNR state |
| Email Engagement | 34,225 | event type, timestamp, campaign tag, subject, clicked URL, device |
| System Logs | 1,718 | workflow, status, action, details, run ID, timestamp |
| Daily Summaries | 285 | daily amount and donation count |
| FunnelCatalog | 14 | ordered stages, delays, email titles and template IDs |

## Verified findings

- Last 30 days: approximately $105.8K from 2,150 donations.
- Versus the previous 30 days: revenue -13.3%, donation volume -16.3%, average gift +3.6%.
- 3,249 repeat donors; 1,944 have made at least three gifts.
- Repeat-donor rate among donors with recorded gifts: 35.9%.
- 240 donors have contributed at least $1,000; 33 have contributed at least $5,000.
- Sunday is the strongest weekday over the latest 90 days, averaging roughly $4.5K.
- Big Campaign is the leading source over the latest 90 days: approximately $263K from 5,103 gifts.
- Funnel-only past-month engagement events: 2,696 unique opens, 775 clicks, 416 soft bounces, 394 blocks, 148 unsubscribes, 10 invalid emails, 6 spam reports and 1 hard bounce.
- Engagement device mix: approximately 85% desktop, 14% mobile and 1% tablet.

## Implemented in the website

The dashboard now exposes a `Strategic insights` panel backed by the new
`/api/v1/dashboard/insights` endpoint. Metrics are calculated from the
Airtable-synced PostgreSQL tables and cached for five minutes.

This avoids storing duplicate values in Airtable and keeps the UI fast.

## Data-quality findings

- Resolved on 2026-07-12: 164 stale donor rows and 460 stale email rows were removed from Supabase. The replica now matches Airtable's 11,789 donors.
- Campaign rollups account for 34,546 donations while the Donations table contains 34,553. Seven donations likely lack a valid campaign/form-title relationship.
- One donor changes cohort between Airtable and the replica (one-time versus repeat), suggesting a recent or incomplete incremental update.
- The Donations `Date` field description refers to an AI attachment summary and should be corrected; the field itself is a date-time.
- The schema lists `Campaign (from Form Title)`, but that field ID was rejected by the public API. The lookup may have been recreated and should be checked in Airtable.

The sync now runs incremental updates every 10 minutes and a complete ID reconciliation every 24 hours. Donor deletion unlinks the donor from historical donations instead of deleting the financial records.

## Recommended primary data to add

These values cannot be reliably inferred and are worth recording at the source.

### Campaigns

- `Goal Amount` — enables progress-to-goal, forecast and pacing.
- `End Date` — enables campaign duration and time-to-goal.
- `Budget / Ad Spend` — enables true ROI and cost per donor.
- `Audience Segment` — enables segment performance comparisons.
- `Attribution / UTM Campaign` — separates source from campaign attribution.

### Donations

- `Recurring Gift` and `Subscription ID` — enables recurring revenue and churn.
- `Processing Fee` and `Net Amount` — separates gross from usable funds.
- normalized `Currency` and `Base Currency Amount` — prevents mixed-currency totals.
- `Acquisition Campaign` snapshot — preserves original attribution after links change.

### Donors and consent

- `Consent Source`, `Consent Timestamp` and `Preferred Channel`.
- `Preferred Language` and `Time Zone` for safer send scheduling.
- `Country` rather than the current two-value USA/EUR region grouping.

### Email delivery

Email Engagement has opens, clicks and failures, but no reliable sent/delivered
denominator inside Airtable. This is now complemented by a low-impact Brevo
transactional report sync that stores one aggregate row per funnel tag/day in
Supabase. It provides sent, delivered, opened, clicked, bounced and unsubscribed
counts without copying individual delivery events or donor PII.

## Recommended next product surfaces

1. Email performance page: delivery funnel, click-to-open rate, top links, device mix and unsubscribe trend.
2. Donor retention page: new versus returning donors, cohort retention, lapse risk and high-value movement.
3. Campaign planning page: goal pacing, forecast, channel efficiency and weekday timing.
4. Data health page: stale sync rows, unlinked donations, duplicates, invalid emails and workflow failures.

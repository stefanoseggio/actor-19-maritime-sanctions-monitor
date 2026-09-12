# Maritime Sanctions Watchdog - OFAC & UN Vessel Screening (Global Trade Compliance)

## Executive Value Proposition

The US Treasury's OFAC Specially Designated Nationals (SDN) list runs to roughly 19,000 entries in a single raw XML feed, of which about 1,540 are vessel-type designations - and the UN Security Council Consolidated Sanctions List carries no dedicated vessel record at all, only free-text IMO mentions buried in individual/entity remarks. Manually pulling both feeds, filtering to vessels, and cross-checking IMO numbers by eye is slow, easy to get wrong, and impractical to repeat on a schedule. This Actor automates that entire lookup - one run turns two raw government/UN feeds into one normalized, IMO-cross-referenced vessel dataset, and recurring runs add real change detection (new designations, sanctions-program changes, and delistings) instead of a manual re-diff every time.

## Use Cases

- **Vendor and counterparty KYC screening.** Before onboarding a shipping counterparty, charterer, or logistics vendor, screen the vessels they operate against the current OFAC vessel-type SDN list and see immediately whether any carry independent UN corroboration via IMO number.
- **Shipping and logistics risk checks.** Freight forwarders, marine insurers, and charterers can use `vesselNameContains` to check one vessel of interest before booking cargo or binding coverage, or run `programFilter` (e.g. `["IRAN"]`, `["RUSSIA-EO14024"]`) to watch an entire sanctions program relevant to a trade lane.
- **Export-compliance due diligence monitoring.** Compliance teams running recurring screening programs can schedule this Actor with `onlyNew` enabled to get only what changed since the last run - new sanctions, program additions/removals, and delistings - instead of re-reviewing the full list every cycle.

## Input

```json
{
  "maxItems": 250,
  "onlyNew": true,
  "enrichWithUnConsolidatedList": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `maxItems` | integer | `250` | Hard cap on how many vessel-type SDN records to return this run, taken in the order OFAC lists them in the source feed. |
| `onlyNew` | boolean | `false` | Delta mode - persists a content fingerprint per vessel between runs and returns only records that are new or changed since the last run. Vessels no longer present in the current OFAC feed are always reported as `DELISTED` regardless of this setting (unless the run was truncated by `maxItems`). Recommended for recurring monitoring. |
| `enrichWithUnConsolidatedList` | boolean | `true` | Cross-references each vessel's IMO number against the UN Security Council Consolidated Sanctions List. Disable for a faster OFAC-only run. |
| `programFilter` | array of strings | - | Optional: only return vessels whose Program list contains at least one of these OFAC program codes (case-insensitive substring match, e.g. `"IRAN"`, `"DPRK2"`, `"RUSSIA-EO14024"`). Leave empty to return vessels from all programs. |
| `vesselNameContains` | string | - | Optional case-insensitive substring filter on the vessel's listed name, applied before `maxItems`. Useful for a narrow monitoring run against one vessel of interest. |

## Output

Each dataset item is the vessel's native OFAC record (name, IMO/MMSI/other identifiers, sanctions programs, flag, tonnage, owner, remarks, and AKA names) plus the UN cross-reference result and this Actor's own tracking envelope:

```json
{
  "uid": "15036",
  "vesselName": "ARTAVIL",
  "programs": ["IRAN"],
  "imoNumber": "9187629",
  "vesselFlag": "Iran",
  "crossReferencedInUnConsolidatedList": true,
  "record_id": "OFAC-SDN-15036",
  "event_type": "SANCTION",
  "scraped_at": "2026-09-08T14:00:00.000Z",
  "is_new": true,
  "source_url": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=15036"
}
```

`event_type` is one of `SANCTION` (first sighting), `STATUS_CHANGE` (the vessel's sanctions program(s) changed since last seen), `UPDATED` (some other tracked field changed), `SNAPSHOT_NO_DIFF` (identical to last time - only delivered when `onlyNew` is off), or `DELISTED` (a previously-seen vessel is no longer in the current OFAC feed). You can download the dataset in JSON, CSV, Excel, or other formats from the Apify platform.

## Reliability

- **Retrying HTTP layer.** Both source feeds are fetched with exponential-backoff retry (up to 4 retries, doubling from a 1-second base delay), with HTTP 429/503 explicitly treated as retryable alongside network failures and other non-2xx statuses. Both OFAC and UN endpoints redirect (302) to a pre-signed storage URL before returning the actual file; the client follows redirects by default.
- **A delta-state failure never blocks a fresh extraction.** Loading the persisted cross-run fingerprint state is a real network call to the Apify platform's key-value store and is treated as fallible: if it fails, the run logs the error and falls back to a cold-start (empty) delta state rather than crashing before a single record is fetched.
- **Extraction success is decoupled from state-persistence success.** If saving the updated delta state fails after a run's records were already pushed, that failure is logged on its own and does not retroactively mark an already-successful extraction as failed, and does not push a spurious error record on top of real data already in the dataset.
- **Process-level safety net.** Top-level `unhandledRejection`/`uncaughtException` handlers guarantee any failure outside the main try/catch blocks is written to the captured log stream before the process exits, rather than exiting silently.
- **Truncation-aware delisting logic.** The OFAC feed is always fetched and parsed in full - never paginated - so a previously-seen vessel that's genuinely absent is a trustworthy `DELISTED` signal, not a guess. If `maxItems` caps delivery before the full feed is walked, `DELISTED` detection is skipped for that run (and logged) and the vessel-fingerprint state is merged rather than replaced, so vessels beyond the cutoff are never wrongly reported as delisted next run.
- **Scoped UN cross-referencing.** IMO numbers are matched against the UN Consolidated List per-record (within each entity/individual's own remarks field), not via a flat whole-document scan, avoiding misattributing an IMO number to the wrong neighboring entity.
- **Source integrity.** Paris MoU/EMSA THETIS, Tokyo MoU/APCIS, and IMO GISIS were live-checked as candidate sources and excluded because they sit behind a login wall, a CAPTCHA-protected search form, or a robots.txt-restricted, registration-gated module, respectively. Only the two genuinely open, unauthenticated OFAC and UN feeds are used - no CAPTCHA-solving, login-wall bypass, or session spoofing anywhere in this Actor.

## Pricing

Pay-per-event pricing: **$0.0005 per delivered record**, plus a small one-time actor-start charge. Both source feeds are plain unauthenticated file downloads with no per-record request cost, so there's no proxy or per-page fetch overhead passed through in the price.

## Support & Enterprise SLA

This Actor is built and maintained by an independent developer, not a formal enterprise vendor - there is no contractual SLA. Issues, bugs, and source-coverage requests are handled through the Apify Store's Issues tab and are typically triaged within 48 hours. If you need a new data source evaluated or a schema extension, open an issue there with details and it will be reviewed against the same compliance doctrine (no CAPTCHA-solving, no login-wall bypass) used to build the rest of this Actor.

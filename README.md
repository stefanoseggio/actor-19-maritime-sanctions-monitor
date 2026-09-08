# Global Maritime & Vessel Sanctions Monitor

Extracts sanctioned-vessel records from the **US Treasury OFAC Specially Designated Nationals (SDN) List**, cross-referenced against the **UN Security Council Consolidated Sanctions List** by IMO number, normalized into one clean 18-field schema. Now with real cross-run change detection - including delisting alerts.

## Why use this Actor?

- **Real compliance-grade coverage, honestly scoped.** Paris MoU, Tokyo MoU, and IMO GISIS were all live-checked and explicitly rejected because they're CAPTCHA- or login-gated (see "What was checked and rejected" below) - this Actor only uses genuinely open, unauthenticated sources, and says so plainly rather than force-scraping a gated site.
- **Change detection that matters for sanctions monitoring.** Enable `onlyNew` and get notified when a vessel is newly designated, has its sanctions program(s) change, or - uniquely for this domain - is **delisted** entirely.
- **Cross-referenced, not just extracted.** Every vessel's IMO number is checked against the UN Consolidated List, flagging entries with independent international corroboration.
- **Trade compliance, insurance, and shipping/logistics teams**: screen counterparties, cargo, or fleet composition against a live sanctions feed without building your own OFAC parser.

## How to use it

1. Run it with the default input for a full extraction of the current OFAC vessel-type SDN list (with UN cross-reference enabled).
2. Optionally filter by `programFilter` (e.g. `["IRAN"]`) or `vesselNameContains` for a narrower watch.
3. For recurring monitoring, enable `onlyNew` on a scheduled task - see "Delta mode" below.

```json
{
  "maxItems": 250,
  "onlyNew": true,
  "enrichWithUnConsolidatedList": true
}
```

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `maxItems` | integer | `250` | Hard cap on vessel records returned this run. |
| `onlyNew` | boolean | `false` | Delta mode - only new or changed records since the last run. See "Delta mode" below. |
| `enrichWithUnConsolidatedList` | boolean | `true` | Cross-reference each vessel's IMO number against the UN Consolidated List. |
| `programFilter` | array | - | Only vessels under one or more OFAC program codes (e.g. `"IRAN"`, `"DPRK2"`). |
| `vesselNameContains` | string | - | Case-insensitive substring filter on vessel name. |

## Output

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

You can download the dataset in various formats such as JSON, HTML, CSV, or Excel.

## Delta mode - change detection, including delistings

Enable `onlyNew: true` on a scheduled task and this Actor persists a fingerprint per vessel across runs:

- **`SANCTION`** - first time this vessel has been seen.
- **`STATUS_CHANGE`** - the vessel's sanctions program(s) changed since last time (e.g. added to a new program).
- **`UPDATED`** - some other field changed (name, flag, owner, IMO, etc.) but programs didn't.
- **`SNAPSHOT_NO_DIFF`** - identical to last time; skipped from delivery when `onlyNew` is on.
- **`DELISTED`** - a vessel previously seen is no longer in the current OFAC feed. The OFAC SDN List is always fetched as one complete file (never paginated), so this is a genuine, trustworthy signal - not a guess. Always delivered regardless of `onlyNew`, and skipped only if `maxItems` truncated this particular run before the full list was walked (logged when this happens).

## Pricing

Pay-per-event: **$0.0005 per delivered record**, plus a small one-time actor-start charge. Both source feeds are plain unauthenticated file downloads with no per-record request cost.

## What was checked and rejected

| Source | Status | Why |
|---|---|---|
| Paris MoU / EMSA THETIS | Rejected | Redirects into a Keycloak OpenID Connect login wall on every request |
| Tokyo MoU / APCIS | Rejected | The public search form carries a literal CAPTCHA field |
| IMO GISIS | Not used | `robots.txt` disallows the relevant path; the public module is session/registration-gated for real search |

No CAPTCHA-solving, no fingerprint spoofing, no login-wall bypass anywhere in this Actor - these sources were investigated and honestly excluded rather than force-scraped.

## Known limitations

- `DELISTED` detection is skipped on any run where `maxItems` cut off the walk before the full feed was read - logged when this happens, never silently guessed at.
- No monetary/value fields - an SDN designation blocks a vessel's assets, it doesn't itself carry a dollar amount.
- The UN Consolidated List has no dedicated vessel record type - cross-referencing is IMO-number-based only, not a full UN vessel record.

Questions or a source-coverage request? Use the Issues tab - custom extensions are available.

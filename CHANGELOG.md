# Changelog

## Unreleased

### Fixed

- **Malformed/truncated-but-HTTP-200 OFAC fetch could wipe delta state and falsely mark every tracked vessel DELISTED.** `src/parseSdnXml.ts` never distinguished "the feed genuinely has 0 vessels today" from "the response parsed to 0 entries because it wasn't really the SDN.XML feed" (a bot-check/error/redirect-target page, or a download truncated mid-stream all return HTTP 200). Since `fetchVesselRecords.ts`'s DELISTED computation and `main.ts`'s state-replace path are both gated only on `truncatedByMaxItems` - a flag that only fires on a `maxItems` delivery cap, never on a broken fetch - a bad response with 0 (or dramatically reduced) vessel entries fell straight through to "every previously-tracked vessel is now delisted" plus a full state replace with the (empty) result, silently erasing the persisted census. Fixed with a new `suspectedFetchFailure` sanity guard: `parseSdnXml()` now also reports `totalEntryCount` (every `<sdnEntry>` of any sdnType) and `declaredRecordCount` (the feed's own `<Record_Count>` metadata); `fetchVesselRecords()` trusts a zero-vessel reading only when those two agree (a real, complete document), and treats a non-zero reading that crashed to less than half of the previously-tracked count as suspicious regardless (OFAC vessel delistings are historically sparse, never a single-run mass wipe). When `suspectedFetchFailure` is true, DELISTED detection is skipped and `main.ts` merges onto prior state instead of replacing it - exactly the existing `truncatedByMaxItems` discipline, extended to cover a broken fetch instead of only a `maxItems` cap. Covered by new tests in `test/fetchVesselRecords.test.ts` for the malformed-empty-response case, the genuinely-empty-and-structurally-consistent case (proving a real empty/closed day still works), and the non-zero-but-crashed case.

## [2.1.0](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/compare/actor-19-maritime-sanctions-monitor-v2.0.0...actor-19-maritime-sanctions-monitor-v2.1.0) (2026-09-19)


### Features

* standardize on multi-stage Dockerfile builder pattern ([#10](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/issues/10)) ([6ac9e98](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/6ac9e98d105665cf7ecb83aacf10029d163ac2e9))
* V2 delta engine with real DELISTED detection (2.0.0) ([207e0f0](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/207e0f0bfed69adc4669da55c5e640a7c3deb620))


### Bug Fixes

* bump transitive adm-zip to 0.6.1, resolving a HIGH-severity CVE ([#12](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/issues/12)) ([79039df](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/79039dfb84bf54602215af0b5d3d1df6d4408bfb))
* **ci:** pass RELEASE_PLEASE_TOKEN so release PRs skip the bot-approval gate ([90217c8](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/90217c82b5320dba0d584a02a98fdf3feeb1d5e8))
* correct dataset_schema.json field-name drift and complete PPE pricing disclosure ([208e75f](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/208e75f3e45407d62af9381e46357c87634d2c85))
* guard against a malformed/truncated-but-200 OFAC fetch wiping delta state ([#11](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/issues/11)) ([fa3e333](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/fa3e333cdc06fb0e01a209146b8efba320fd9b31))
* restore dist/ tracking (regression from repo-standardization pass) ([#9](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/issues/9)) ([9152dc0](https://github.com/stefanoseggio/actor-19-maritime-sanctions-monitor/commit/9152dc0f47a89f86bd961a5fb2956aa6fb9d5ecc))

## 2.0.0 - 2026-09-08

### Added

- Real cross-run delta classification, replacing a flat per-uid seen-id list. Every vessel now carries a dual content-fingerprint pair (`src/fingerprint.ts`: a `statusFingerprint` over the vessel's sorted `programs` list - the closest thing to a "status" this domain has, since a still-listed vessel can be added to or dropped from a specific sanctions program without being delisted outright - and a `contentFingerprint` over its other mutable fields, including `vesselName` since a renamed vessel is a real, meaningful signal for a sanctions monitor). `src/delta.ts`'s `classifyVesselRecord()` computes `SANCTION` (first-seen, preserving the existing name) / `STATUS_CHANGE` / `UPDATED` / `SNAPSHOT_NO_DIFF`.
- **New `DELISTED` event type.** The OFAC SDN.XML feed is a complete, unpaginated single-file export (confirmed live) - every fetch is a genuine full census, so a previously-seen vessel absent from the current fetch is trustworthily delisted, not just "not linked this run." Gated on `truncatedByMaxItems` being false (see below) - the same complete-census discipline used elsewhere in this fleet (`salta-compras-monitor`'s `truncatedByMaxItems`, `pba-tenders-monitor`'s views-completeness check). A `DELISTED` record (`src/types.ts`'s new `VesselDelistedRecord`) deliberately does NOT reuse stale native fields it can no longer confirm - `category_or_type`/`effective_date_iso` etc. are honestly nulled, not backfilled from the last-known snapshot.
- `truncatedByMaxItems` tracking in `src/fetchVesselRecords.ts`: `maxItems` caps DELIVERY, never the underlying OFAC fetch (always read in full) - but the walk that records "this uid was seen" runs inside the same loop as delivery, so a `maxItems`-triggered break also stops that walk early. Without gating `DELISTED` on this, vessels beyond the truncation point would be wrongly reported delisted. Covered by dedicated tests in `test/fetchVesselRecords.test.ts` for both the exact-boundary case (`maxItems` equal to the real count - not truncated) and the genuine truncation case.
- `src/state.ts` rewritten to a `{ entries: Record<uid, {statusFingerprint, contentFingerprint, lastSeenAt, vesselName, imoNumber}>, lastRunAt }` shape (was `{ seenUids: string[], lastRunAt }`). `saveState()` now takes the final entries map directly rather than merging internally - the caller (`main.ts`) decides REPLACE (a complete, untruncated census - a vessel absent from this run's fetch really is delisted, so it's correctly dropped) vs. MERGE (a truncated run - entries beyond the cutoff were never re-visited and must be preserved, or they'd wrongly look "new" again next time they're reached). Named `Actor.openKeyValueStore()` was already correct here - no store-migration risk, unlike the bug found on a sibling actor the same day.
- `test/fingerprint.test.ts`, `test/delta.test.ts`, `test/state.test.ts`, `test/fetchVesselRecords.test.ts`: full unit and integration coverage of the new classification/fingerprint/state-persistence/truncation/DELISTED logic, including an integration test that mocks only the network layer and exercises the real XML parser against the actual fixture file - not a hand-simplified stub.
- `LICENSE` (Apache-2.0, matching the fleet standard), `eslint.config.mjs` (missing before - `npm run lint` was defined but could not run), `.github/workflows/test.yaml` (lint+build+test CI - this actor had none), `.gitignore`, this `CHANGELOG.md`, `AGENTS.md`.

### Fixed

- `src/graphMapping.ts` used `new RegExp('[\\u0300-\\u036f]', 'g')` (a lint error, flagged as pre-existing when the CI pipeline was added) - replaced with the equivalent regex literal `/[̀-ͯ]/g`. No behavior change, purely a lint-clean fix needed so the new CI pipeline doesn't start red.

### Changed

- **Disclosed behavior change to `onlyNew`:** now means "new or changed since last run" (delivers `STATUS_CHANGE`/`UPDATED` too), not just "never seen before" - matching the same upgrade made the same day to this fleet's `actor-22-drug-safety-recalls-monitor`. A vessel's sanctions program changing is exactly the kind of thing a recurring monitor should surface, not silently suppress because the vessel itself "was seen before." `DELISTED` records are always delivered regardless of `onlyNew` (a delisting is inherently new information, never redundant).
- `DELISTED` detection is deliberately NOT filtered by `programFilter`/`vesselNameContains` - hiding a delisting because it doesn't match this run's unrelated filter would defeat this actor's core compliance purpose (and this actor doesn't retain a delisted vessel's raw program list in state to filter against anyway, only its fingerprint hash).

### Not added (and why)

- **No pricing/monetization change.** The live-configured single-tier `result` price ($0.0005/record) was already correct and is untouched - below the fleet's $0.003 rate card, a defensible independent choice for a simpler-per-record domain than a full tender detail page, not itself reviewed as part of this pass.
- **No dual-floor/baseline-floor pagination-limiting mechanism.** Not needed here in the sense used elsewhere in this fleet: the OFAC feed is always fetched in one complete pass (not a paginated walk with an early-stop budget concern) - the `truncatedByMaxItems` gate above is this domain's real analogue, solving the actual risk (a DELIVERY cap silently narrowing the CENSUS) rather than a backlog-draining problem this actor doesn't have.

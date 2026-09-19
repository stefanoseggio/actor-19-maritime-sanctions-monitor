# actor-19-maritime-sanctions-monitor - AI agent notes

Global Maritime & Vessel Sanctions Monitor. Extracts sanctioned-vessel records from the **US Treasury OFAC Specially Designated Nationals (SDN) List** (`sanctionslistservice.ofac.treas.gov`, plain unauthenticated JSON/XML, ~29MB per fetch, ~1,540 vessel entries as of the original build), optionally cross-referenced against the **UN Security Council Consolidated Sanctions List** by IMO number. Paris MoU, Tokyo MoU, and IMO GISIS were live-checked and rejected as CAPTCHA/login-gated (Paris MoU/Tokyo MoU both proxy through EMSA THETIS, a real Keycloak OAuth login wall) - see `src/http.ts`'s header comment for the full verification record.

## HTTP transport: `impit`, not the native `fetch`

`src/http.ts`'s `fetchTextWithRetry` calls a module-level `Impit` instance
(`new Impit({ browser: 'chrome' })`, from the `impit` package) instead of
the global `fetch` - added 2026-09-19 as a fleet-wide TLS-fingerprint-
hardening pilot (proactive hardening, not a bug fix - Node's `fetch` isn't
deprecated). Both live sources (OFAC SDN.XML and the UN Consolidated List)
re-verified reachable through the new transport this session (~29MB and
~2.1MB real downloads, both parsed successfully). No test-mocking changes
were needed for this actor: its only `src/http.ts`-adjacent unit test
(`test/fetchVesselRecords.test.ts`) mocks `fetchTextWithRetry` directly via
`vi.mock('../src/http.js', ...)`, never the global `fetch` or `impit`, so
it was unaffected by the transport swap underneath. Unlike the fleet's
other two `impit` pilots (`florida-tenders-monitor`,
`australia-grantconnect-monitor`), this actor has no `test:live`
script - live connectivity was instead re-verified manually this session
with a throwaway script exercising the real `fetchTextWithRetry` against
both live URLs.

## V2 delta engine (added 2026-09-08)

This actor was one of 5 found on the account outside the original 9-actor V2 migration mandate. It already had a correctly-NAMED key-value store (no run-scoped `Actor.getValue()`/`setValue()` bug, unlike a sibling actor found the same day) and, uniquely among the 5, already had explicit dedicated 429/503 HTTP retry handling in `src/http.ts` - both confirmed by direct code read before any change was made, not assumed. What it lacked: real per-record classification (state was a flat `seenUids: string[]`, `event_type` hardcoded to `'SANCTION'` always).

- `src/fingerprint.ts` / `src/delta.ts`: dual-fingerprint classification (`statusFingerprint` over sorted `programs`, `contentFingerprint` over everything else mutable) -> `SANCTION` (first-seen) / `STATUS_CHANGE` / `UPDATED` / `SNAPSHOT_NO_DIFF`.
- **`DELISTED` - this actor's one genuinely new event type beyond the fleet's usual four.** The OFAC SDN.XML feed is always fetched as ONE complete file (confirmed live, no pagination) - so unlike most registry-monitoring actors in this fleet, a previously-seen vessel's absence from the current fetch is a trustworthy signal, gated only on `truncatedByMaxItems` (see `src/fetchVesselRecords.ts`'s doc comment - `maxItems` caps DELIVERY, not the underlying fetch, but the same loop that tracks "seen this run" also breaks on that cap, so truncation is a real risk to gate against).
- `src/state.ts`'s `saveState()` deliberately takes the FINAL entries map to write, not a delta to merge internally - `main.ts` decides REPLACE (complete census - a delisted vessel is correctly dropped from state) vs. MERGE (truncated run - untouched entries beyond the cutoff must survive). Getting this backwards would silently forget every vessel beyond a truncated walk's cutoff on the very next run.
- `onlyNew`'s meaning changed (disclosed, not silent): now "new or changed since last run" (delivers `STATUS_CHANGE`/`UPDATED` too), not just "never seen before." See `CHANGELOG.md`.

## Known footguns

- No local `Dockerfile` - Apify's implicit build for this template does `COPY . ./` then `npm install --only=prod` ONLY, confirmed against a real build-failure + build log on a sibling actor the same day. **`dist/` MUST be committed, not gitignored** - `tsc` never runs in that container. **Also run `rm -f tsconfig.tsbuildinfo` before every `npm run build`** when you've just deleted `dist/` - `tsc`'s incremental cache doesn't verify its own output files still exist on disk, and can silently no-op a build that looks successful (exit 0, zero files written) if the buildinfo cache thinks nothing changed. This exact failure mode hit a sibling actor (`actor-18-b2b-lead-magnet`) the same day this actor was migrated.
- `this actor's memory ceiling (.actor/actor.json: 1024-4096MB) is deliberately well above the fleet's usual 256-512MB default` - parsing the real ~29MB SDN.XML into cheerio's full DOM needs it. Don't "normalize" this down to match sibling actors without re-verifying the real feed size first.
- `mcp/searchVesselSanctions.ts` is outside `tsconfig.json`'s `include` and outside `eslint.config.mjs`'s lint scope (`**/mcp` ignored) - a standalone MCP-tool entry point, not part of the `dist/main.js` build.
- `graphMapping.ts`'s diacritics-stripping regex is a literal `/[̀-ͯ]/g` (the actual Unicode combining-marks range U+0300-U+036F, not the escaped-text form) - this is intentional and correct, not a stray paste error; do not "clean it up" back to `new RegExp('[\\u0300-\\u036f]', 'g')`, which is exactly what CHANGELOG.md's 2.0.0 fix replaced (that constructor form was a real lint error, `prefer-regex-literals`).

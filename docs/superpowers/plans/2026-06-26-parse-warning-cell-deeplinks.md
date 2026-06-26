# PR-3 — Exact-cell "Open in Sheet" deep links for parse warnings

**Goal:** In the Step-3 onboarding review (and the per-show data-quality panel), render an "Open in Sheet ↗" link next to a `SCHEDULE_TIME_UNPARSED` warning that opens the Google Sheet **on the offending DATES-tab TIME cell**. v1 = SCHEDULE_TIME_UNPARSED only (the user-flagged case); the infra is generic so other located warnings can add anchors later ("where possible").

## Why it's non-trivial (investigation findings)
- The deep-link `SourceAnchor` system (`lib/sheet-links/buildSheetDeepLink.ts`, `lib/drive/sourceAnchors.ts`) is computed at **cron/publish** time (`runScheduledCronSync.ts:2391`) and consumed on the **crew page** — nothing reaches the onboarding Step-3 review.
- There is **no DATES region** (REGION_IDS has `schedule` → AGENDA tab; this warning is the DATES tab).
- The parser runs on **markdown** (`parseScheduleTimes` ← `readShowDayTimeCells(markdown)`), so A1 coordinates are gone at emit time.
- The onboarding scan (`runOnboardingScan`) uses `fetchMarkdownWithBinding` → markdown only; the XLSX bytes exist internally (markdown is `synthesizeMarkdownFromXlsx(bytes)`) but aren't returned. `titleToGid` comes from sheet metadata (`{title, sheetId}`), not the xlsx.

## Design (no extra Drive download)
1. **Type** — `lib/parser/types.ts`: add `sourceCell?: SourceAnchor | null` to `ParseWarning`. (`SourceAnchor = {title, gid, a1?}` from buildSheetDeepLink.) jsonb-persisted, backward-compatible, no migration.
2. **Locator** (pure) — `lib/drive/showDayTimeAnchors.ts`: `extractShowDayTimeAnchors(bytes, titleToGid): SourceAnchor[]`. Reuses `buildAbsGrid` (factor it out of sourceAnchors.ts or duplicate minimally). Scans the DATES tab grid for SHOW DAY rows using the SAME predicate as `readShowDayTimeCells` (col0 = "DATES"/blank-continuation, col1 ~ /^SHOW DAY/, col3 = date, col4 = TIME). Returns, in document order, the A1 of each SHOW DAY row's **TIME cell** (col index minCol+4) with `{title:"DATES", gid: titleToGid.get("DATES"), a1}`. Skips a row if gid missing.
3. **Drive layer** — extend `fetchMarkdownWithBinding` (lib/drive/fetch.ts) to also return `bytes` (already in hand) + the scan to obtain `sheets` metadata for `titleToGid`. Thread both into the scan loop. Guard: if bytes/metadata unavailable, anchors = [] (feature degrades to no-link, never blocks the scan).
4. **Scan integration** — `runOnboardingScan` (~line 925): after `parseSheet(markdown)`, compute `anchors = extractShowDayTimeAnchors(bytes, titleToGid)`, then for each warning with `code === "SCHEDULE_TIME_UNPARSED"`, set `w.sourceCell = anchors[w.blockRef.index] ?? null`. **Correlate by index** (both scans iterate DATES SHOW DAY rows in document order). Sanity-degrade: if index out of range → no anchor.
5. **UI** — `components/admin/wizard/Step3SheetCard.tsx` `WarningsBreakdown`: thread `driveFileId` (already has `dfid`); for a warning with `sourceCell`, render an "Open in Sheet ↗" anchor (`buildSheetDeepLink(dfid, w.sourceCell)`, `target=_blank rel=noopener`, tokens only). Same in the per-show DQ panel (`app/admin/show/[slug]/page.tsx`) if it carries driveFileId + warnings (check).

## Divergence mitigation
The grid-side SHOW DAY detection MUST match the markdown-side (`readShowDayTimeCells`). Factor the predicate into a shared helper OR pin both with a corpus test (same fixtures → same count/order). On any mismatch (count differs, index OOB), emit NO anchor for that warning — a missing link is acceptable; a wrong-cell link is not.

## Test plan (TDD)
- `tests/drive/showDayTimeAnchors.test.ts`: golden xlsx fixture(s) → expected TIME-cell A1s in order; missing-gid → skip; non-DATES sheet → []; merged-cell handling.
- Parser-side: a fixture whose Nth SHOW DAY is unparseable → the locator's Nth anchor matches that row's TIME cell (index correlation).
- Scan integration test: warning gets `sourceCell` set; bytes-absent path → warnings unchanged (no crash).
- UI: WarningsBreakdown renders the link with the right href when `sourceCell` present; NO link when absent; invariant-5 (link text, no raw code).
- Anti-tautology: assert the href's `range=` equals the fixture's computed A1, derived from the fixture, not hardcoded.

## Gates
TDD per layer → impeccable critique+audit on the UI diff (invariant 8) → Codex whole-diff → real CI green → merge.

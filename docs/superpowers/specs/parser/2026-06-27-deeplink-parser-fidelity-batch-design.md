# Deep-link coverage + parser-fidelity batch — design

**Date:** 2026-06-27
**Status:** spec (autonomous-ship; user approved the ship-now batch from the post-#155 follow-up survey)
**Scope:** four small, independently-verified fixes shipped as one PR. Two deep-link-coverage gaps (reusing the #154/#155 anchor infra) + two parser-fidelity defects. No new catalog code, no §12.4 lockstep, no new `/help/errors` family (all touched codes already exist with families). No DB schema change, no advisory-lock change, no UI component change.

All factual claims below were grep-verified against the merged tree (`origin/main` @ `51e561d7`) before drafting.

---

## Shared mechanics (read once)

- `lib/parser/dataGaps.ts` exports `OPERATOR_ACTIONABLE_ANCHORED` (a `ReadonlySet<string>`); `lib/drive/showDayTimeAnchors.ts` exports `CELL_ANCHORED_CODES` which **is the same object** (`CELL_ANCHORED_CODES === OPERATOR_ACTIONABLE_ANCHORED`). Adding a code to the set widens BOTH the render/selector gate (`operatorActionableWarnings`, warn-severity + membership) AND the `attachSourceCellAnchors` population gate + the `hasCellAnchoredWarning` gid-fetch gate.
- `attachSourceCellAnchors(warnings, sources)` (`showDayTimeAnchors.ts:105-122`) dispatches by `w.code`: `SCHEDULE_TIME_UNPARSED`→`resolveSourceCell(showDay, blockRef.iso)`; crew codes (`UNKNOWN_ROLE_TOKEN`/`UNKNOWN_DAY_RESTRICTION`/`STAGE_WORD_AUTOCORRECTED`)→`resolveCrewRoleCell(crewRole, blockRef.name)`; `FIELD_UNREADABLE`→`sources.region[blockRef.kind] ?? null`. `sources.region` is `Record<string, SourceAnchor>` keyed by `RegionId` (`lib/sheet-links/buildSheetDeepLink.ts:21-34`: includes `crew`, `venue`, `gear_packlist`, `schedule`, …), populated by `extractSourceAnchors` (`lib/drive/sourceAnchors.ts`) on both ingestion paths.
- **Both ingestion paths** call the shared `attachWarningAnchors` (`lib/sync/attachWarningAnchors.ts`): onboarding scan (`runOnboardingScan.ts:946`) and cron prepare (`runScheduledCronSync.ts:2450`). `attachWarningAnchors` builds `region` from `regionAnchors ?? extractSourceAnchors(...)` and calls the pure `attachSourceCellAnchors`. Per-family `safe()` degrade is already in place (#154 whole-diff fix) — a failing extractor never drops the other families' links.
- **Two structural pin-tests gate the anchored set's membership and must be bumped in lockstep with any addition** (AGENTS.md meta-test inventory — these are the relevant registries; no new meta-test is created this batch):
  - `tests/parser/operatorActionableWarnings.test.ts` — `contains exactly the N codes` (currently 5).
  - `tests/drive/showDayTimeAnchors.test.ts` — `hasCellAnchoredWarning is TRUE for all N anchored codes` (currently 5).
- **No `/help/errors` family / §12.4 / catalog change this batch.** All codes touched (`UNKNOWN_FIELD`, the five `AGENDA_*`, the three `PULL_SHEET_*`) already exist in `lib/messages/catalog.ts` and §12.4, and their prefixes are already mapped in `app/help/errors/_families.ts` (`UNKNOWN`→crew-schedule, `AGENDA`→crew-schedule, `PULL`→syncing-sheets). The `errors-grouping` orphan guard (the CI-only failure that bit #155) therefore stays green — verified: no new prefix is introduced.

---

## Fix 1 — Deep-link `UNKNOWN_FIELD` to its VENUE region (S, ship-now)

**Problem.** `UNKNOWN_FIELD` ("Unrecognized venue row label") is `severity: "warn"`, `followUp: "Doug → optional Report"` — operator-actionable — but is NOT in `OPERATOR_ACTIONABLE_ANCHORED`, so it renders with no "Open in Sheet" jump. The cell is already resolvable.

**Verified.** Single emission site `lib/parser/blocks/venue.ts:272-279`: `{ severity:"warn", code:"UNKNOWN_FIELD", blockRef:{ kind:"venue" }, rawSnippet }`. No other emission site exists (grep: only `venue.ts:275` + the `catalog.ts` definition). `"venue"` is a `RegionId`. The existing `FIELD_UNREADABLE` dispatch branch (`showDayTimeAnchors.ts:119-122`) resolves `sources.region[kind]`, and `UNKNOWN_FIELD`'s `kind` is `"venue"` → resolves `region["venue"]` directly. No new resolver, no new region, no index needed (the branch reads only `kind`).

**Change.**
1. `lib/parser/dataGaps.ts`: add `"UNKNOWN_FIELD"` to `OPERATOR_ACTIONABLE_ANCHORED`.
2. `lib/drive/showDayTimeAnchors.ts`: change the `FIELD_UNREADABLE` branch condition to `w.code === "FIELD_UNREADABLE" || w.code === "UNKNOWN_FIELD"` (both resolve `region[kind]`).

**Guard conditions.** `blockRef.kind` absent → existing `kind ? … : null` already returns null (no link, warning still renders). `region["venue"]` absent (no venue tab) → `?? null` → no link. Never mis-anchors to a wrong region (kind is the only key).

**Tests.** Bump both pin-tests to include `UNKNOWN_FIELD`. Add a dispatch test: a `UNKNOWN_FIELD` warning with `blockRef.kind:"venue"` + `region:{ venue: <anchor> }` → resolves that anchor; with empty region → `sourceCell` undefined.

---

## Fix 2 — Strip zero-width characters at the shared cell-value boundary (S, ship-now)

**Problem.** The zero-width strip lives only inside the hotel name/address parser (`lib/parser/blocks/hotels.ts:226-230`: `.replace(/[zero-width set]/g,"")`). Other crew-facing free-text fields — confirmed `transportation.parking` — retain zero-width chars (ZWSP/ZWNJ/ZWJ/BOM). A crew member copying such a value to a maps app carries invisible chars that break geocoding/search.

**Verified.** `hotels.ts:227` strips `ZWSP/ZWNJ/ZWJ/BOM`. The shared cleaners in `lib/parser/blocks/_helpers.ts` do NOT: `clean()` (`:45`) only backslash-unescapes; `decodeEntities()` (`:60`) only handles `&#10;`/`&#9;`; `presence()` (`:65`) trims + nulls-empty. Live evidence: `fixtures/shows/exporter-xlsx/fintech.md:67` Parking cell carries 7 ZWNJ; re-parse confirms `transportation.parking` keeps them while `hotel_address` is clean.

**Scope decision.** Move ONLY the **zero-width strip** (the unambiguous invisible-junk class) to the shared boundary so every stored field benefits. Leave hotels' smart-quote→space and `\s+`→` ` collapse local to the hotel address parser — those are address-formatting opinions, not universal-junk removal, and changing them broadly is out of scope (a venue/role name legitimately may contain a quote).

**Change.**
1. `lib/parser/blocks/_helpers.ts`: add a zero-width strip to `clean()` (the canonical cell-text cleaner that every block value flows through). Implementation: `.replace(/[\u200B-\u200D\uFEFF]/g, "")` applied inside `clean()` — the **escaped-codepoint** form (ZWSP `\u200B` through ZWJ `\u200D`, plus BOM `\uFEFF`), matching the coverage of the existing literal-char range at `hotels.ts:227`. Escaped (not literal) so the regex is greppable/reviewable and the source stays free of invisible chars.
2. `lib/parser/blocks/hotels.ts:227`: drop the now-redundant zero-width portion of the local strip (keep the quote→space + whitespace-collapse). Hotels still passes through `clean()` upstream, so its output is unchanged.

**Guard conditions.** Empty/whitespace input → unchanged behavior (strip is a no-op, then existing trim/null logic). A value that is ENTIRELY zero-width chars → becomes empty → existing `presence()`/null handling applies (renders no field), which is correct (it was visually empty anyway).

**Tests.** Unit: `clean("a\u200Bb")` → `"ab"`. Re-parse the fintech fixture → `transportation.parking` contains no codepoint in the zero-width set; `hotel_address` still clean (no regression). Negative-regression: a value with a smart-quote is NOT mangled by `clean()` (quote handling stays hotel-local).

---

## Fix 3 — Deep-link the five `AGENDA_*` grid + three `PULL_SHEET_*` warnings (M, ship-now)

**Problem.** All five AGENDA run-of-show grid warnings (`AGENDA_GRID_MALFORMED`, `AGENDA_BLOCK_UNRESOLVED`, `AGENDA_DAY_AMBIGUOUS`, `AGENDA_DAY_TRUNCATED`, `AGENDA_DAY_EMPTIED`) and all three PULL SHEET warnings (`PULL_SHEET_PARSE_PARTIAL`, `PULL_SHEET_AMBIGUOUS_FORMAT`, `PULL_SHEET_UNKNOWN_VARIANT`) carry a `blockRef` but get no link. AGENDA includes operator-actionable rows (`AGENDA_DAY_AMBIGUOUS` = "Doug → fix sheet", `AGENDA_DAY_EMPTIED` = "Doug → check sheet").

**Out of scope (explicit).** `AGENDA_PDF_UNREADABLE` and `AGENDA_SCHEDULE_LOW_CONFIDENCE` are about a linked agenda PDF, carry no agenda-grid `blockRef`, and have no resolvable grid cell — NOT included.

**Verified.** `lib/parser/blocks/agendaWarnings.ts`: the five grid codes each emit `blockRef:{ kind:"agenda", index }` (lines 6-41); the sixth helper there is `SCHEDULE_TIME_UNPARSED` with `kind:"dates"` (already handled, untouched). `lib/parser/pull-sheet.ts:182/223/273`: the three codes emit `blockRef:{ kind:"pull_sheet" }`. Neither `agenda` nor `pull_sheet` is a `RegionId`, so a direct `region[kind]` lookup misses — a **kind→region alias** is required: `agenda`→`schedule`, `pull_sheet`→`gear_packlist` (both targets are valid `RegionId`s and are whole-tab-anchored by `extractSourceAnchors`). This is a region/tab-level link (the parser knows the tab, not the exact run-of-show cell) — matching the `FIELD_UNREADABLE` region-level precedent.

**The `AGENDA_DAY_EMPTIED` apply-path wrinkle (verified, has a clean fix).** `agendaDayEmptied()` is **apply-only**: its sole call site is `lib/sync/applyParseResult.ts:170` (`args.parseResult.warnings.push(agendaDayEmptied(emittedIndex, iso))`), which runs DURING apply — AFTER the prepare-stage `attachWarningAnchors` (cron `runScheduledCronSync.ts:2450`; the prepare function returns at ~`:2478` with `parseResult: enriched, sourceAnchors`, and apply runs later). So the appended `AGENDA_DAY_EMPTIED` is never seen by the prepare-stage anchoring. Fix: `runPhase2` already receives `sourceAnchors` (`lib/sync/phase2.ts:55,117,301`) and `applyParseResult` mutates `parseResult.warnings` in place, with the post-apply set carried out at `phase2.ts:434` (`parseWarnings: parseResult.warnings`). After the apply mutation, call the **pure** `attachSourceCellAnchors(parseResult.warnings, { showDay: [], crewRole: [], region: args.sourceAnchors ?? {} })` — region-only, no fetch, no new lock (invariant 2 unaffected; `attachSourceCellAnchors` is a pure in-memory pass). It is idempotent and non-destructive: it only sets `sourceCell` when a cell resolves, so already-anchored warnings (whose `showDay`/`crewRole` sources are empty here) keep their existing `sourceCell` (`if (cell) w.sourceCell = cell`).

**Change.**
1. `lib/parser/dataGaps.ts`: add the eight codes to `OPERATOR_ACTIONABLE_ANCHORED`.
2. `lib/drive/showDayTimeAnchors.ts`: add a `KIND_TO_REGION` alias map (`{ agenda: "schedule", pull_sheet: "gear_packlist" }`) and a dispatch branch: when `w.blockRef?.kind` is in the map, `cell = sources.region[KIND_TO_REGION[kind]] ?? null`. (Reached only for the eight codes, since the outer `CELL_ANCHORED_CODES.has(w.code)` guard already gates membership.)
3. `lib/sync/phase2.ts`: after `applyParseResult` runs, call the pure `attachSourceCellAnchors` with region-only sources from `args.sourceAnchors` to anchor the apply-appended `AGENDA_DAY_EMPTIED`. Import `attachSourceCellAnchors` from `@/lib/drive/showDayTimeAnchors`.

**Guard conditions.** `kind` absent → no map hit → null (no link). `region["schedule"]`/`region["gear_packlist"]` absent (no AGENDA/PULL tab) → `?? null` → no link, warning still renders. `args.sourceAnchors` undefined (e.g. a path with no xlsx bytes) → `?? {}` → no link, no throw. AGENDA path with zero emptied days → re-attach iterates an unchanged set, no-op.

**Tests.**
- Dispatch unit (`showDayTimeAnchors.test.ts`): each of the 8 codes with its `blockRef.kind` + a `region` containing the aliased key → resolves that anchor; empty region → undefined. Bump the two pin-tests to the full **14**-code set (5 prior + `UNKNOWN_FIELD` + 5 `AGENDA_*` + 3 `PULL_SHEET_*`; no overlap); enumerate exactly.
- Cron-path test (`phase2`/apply): a re-sync where a previously-published day goes empty appends `AGENDA_DAY_EMPTIED`; after `runPhase2`, that warning has a `sourceCell` resolving to the `schedule` region. Concrete failure mode caught: the apply-appended warning shipping link-less.

---

## Fix 4 — Transport yearless dates: infer the show year instead of hard-coding `/25` (S, ship-now)

**Problem.** `parseV2DateTime` (`lib/parser/blocks/transport.ts:563-578`) back-fills a yearless transport date with a literal `"/25"` (`:570`, `:576`). On a 2026+ show, a yearless transport cell (e.g. `10/6 @ 12:00 PM`) silently resolves to **2025** — wrong year, no warning. This is an existing correctness defect, not a deferred tolerance.

**Verified.** The two `normalizeDate(... + "/25")` calls at `transport.ts:570` and `:576`. `lib/parser/blocks/hotels.ts:764-775` (`resolveDate`) already solves the identical problem correctly: year-present (`M/D/YY`, two slashes) → `normalizeDate` as-is; yearless → back-fill from a 4-digit year in the cell, else from `contextYear`, else return `null` (never hard-code an era). `contextYear` is derived once per parse via `inferShowYear(markdown)` (`hotels.ts:49`), currently a private function in `hotels.ts:570`. `parseTransportation` has `markdown` in scope (`transport.ts:106`).

**Change.**
1. **Extract `inferShowYear` to `lib/parser/blocks/_helpers.ts`** (export it) and import it in both `hotels.ts` and `transport.ts` (DRY; avoids a transport→hotels coupling). Behavior unchanged — pure relocation; `hotels.ts` keeps identical results.
2. `lib/parser/blocks/transport.ts`: in `parseTransportation`, derive `const contextYear = inferShowYear(markdown)`; thread it into `parseV2DateTime(raw, contextYear)`; replace the two `+ "/25"` back-fills with hotels' `resolveDate` logic (year-present → as-is; yearless → cell-year else `contextYear`, else `null`).

**Guard conditions.** `TBD` / empty → unchanged (`{ date:null, time:null }`). Yearless date + no inferable year (no cell year, no show DATES) → `null` date (mirrors hotels — better to show no date than a wrong one). Year already present (`M/D/YY`) → passes through unchanged (no double-year). The `@`-time branch and the date-only branch both use the shared resolver.

**Tests.**
- `parseV2DateTime`-level (or `parseTransportation` end-to-end): a yearless transport cell on a show whose DATES are in 2026 → date resolves to **2026** (the concrete bug: must NOT be 2025). A cell with an explicit `M/D/YY` year → that year preserved. A yearless cell with no inferable year → `null` (not a hard-coded era). `TBD` → null.
- `inferShowYear` relocation: existing hotel date tests stay green (pure move). Add an `inferShowYear` unit test in `_helpers` if none exists.

---

## Cross-cutting: invariants & meta-tests

- **Invariant 2 (advisory lock):** the `phase2` re-attach is a pure in-memory call inside the existing apply path — no new `pg_advisory*` acquisition, no new lock holder. The advisory-lock topology test is untouched.
- **Invariant 5 (no raw codes):** no new code; all eight + `UNKNOWN_FIELD` already render via catalog title. `x2-no-raw-codes` unaffected.
- **Invariant 8 (UI dual-gate):** no `components/**` or `app/**` (non-api) change. `app/help/errors/_families.ts` is NOT edited (no new prefix). Dual-gate N/A.
- **Invariant 9 (Supabase call boundary):** no new Supabase client call. `_metaInfraContract` unaffected.
- **Meta-test inventory:** EXTENDS the anchored-set membership pin-tests (`operatorActionableWarnings.test.ts`, `showDayTimeAnchors.test.ts`). Creates none. No §12.4 catalog-parity (x1), no internal-code-enum manifest (x2) change — no new code.
- **Full-suite gate:** run the COMPLETE `pnpm vitest run` before push (the #155 lesson — `tests/help` is in shard 2 and is easy to miss running only the parser/drive/sync surface). Env-bound live-DB/HTTP suites (`tests/admin/test-auth-gate` Layer-2, `pg-cron-coverage`, `email-canonicalization` live audit) fail locally without infra and pass in real CI.

## Out of scope (and why)

The post-#155 survey's needs-trigger items (#5 typo-tolerant section/field headers, #6 multi-word role phrases, #7 standalone Hotel-Address routing, #8 time/date format-robustness, #9 ONLY/`***` marker bundle) are deliberately NOT in this batch — each waits for a real-sheet trigger or warrants its own gated PR. They will be re-surfaced after this batch merges (per the owner's instruction).

# Parse Data-Quality Warnings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Detect three classes of silent sheet-parse data drop (unreadable field, unknown section, vanished block) and surface them as advisory, non-blocking warnings at the surfaces an operator sees before/at publish.

**Architecture:** Two stateless parser detectors (classes A/B) emit `ParseWarning`s through the existing aggregator; class C derives a `BLOCK_DISAPPEARED` parse-warning from existing MI-7 items in the sync chokepoint. A shared `summarizeDataGaps` helper feeds six operator surfaces. No schema migration; one additive jsonb context field; three admin-log-only §12.4 catalog rows.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, Supabase/Postgres, Tailwind v4.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-23-parse-data-quality-warnings-design.md` (11-round Codex APPROVE). Section refs below (§N) point there for design rationale — this plan is the executable decomposition.

---

## Meta-test inventory (mandatory pre-declaration)

This milestone **creates**:
- `tests/parser/_metaKnownSectionsRegistry.test.ts` — every block parser header matcher ∈ `lib/parser/knownSections.ts` (class-B registry drift guard, §9).
- Class-B **corpus regression** (in `tests/parser/exporterFixtures.test.ts` or a new `tests/parser/unknownSectionCorpus.test.ts`) — zero `UNKNOWN_SECTION_HEADER` across all 7 `fixtures/shows/exporter-xlsx/*.md` (§5.2, R10 F2).

This milestone **extends**:
- `tests/cross-cutting/codes.test.ts` (active-code parity) — gains the 3 new admin-log-only §12.4 rows (§5/§9, R1 F3).
- `tests/messages/_metaAdminAlertCatalog.test.ts` — verify the `SHOW_FIRST_PUBLISHED` write-site regex still matches after the additive `data_gaps` context field (§6.4).
- `tests/admin/_metaInfraContract.test.ts` — register the new `shows_internal.parse_warnings` reads (invariant 9, §6.6, R10 F1).

**Advisory-lock topology:** unchanged — no `pg_advisory*` touched. **No new RPC-gated table** → no PostgREST DML lockdown. **No schema migration** (all columns exist; `admin_alerts.context.data_gaps` is additive jsonb).

**Execution order:** Task 1 (shared types/helper) → 2 (class A) → 3 (class B + registry + corpus) → 4 (class C) → 5 (catalog rows) → 6 (summarizeDataGaps) → 7 (P2 staged card) → 8 (P3 Step-3) → 9 (P3 unpublished) → 10 (P4 changes feed render) → 11 (P1 alert digest, shared emitter) → 12 (per-show Data-Quality panel + invariant-9) → 13 (layout-dimensions) → 14 (transition audit) → 15 (impeccable dual-gate) → 16 (adversarial review) → 17 (close-out).

---

## Task 1: Shared warning codes + ParseWarning literals

**Files:** Modify `lib/parser/warnings.ts`; Test `tests/parser/warnings.test.ts` (create if absent).

- [ ] **Step 1: Failing test** — assert `emitFieldUnreadable(agg, {section:"crew", field:"phone", rawSnippet:"call John", index:0})` pushes a `ParseWarning{severity:"warn", code:"FIELD_UNREADABLE", blockRef:{kind:"crew",index:0}, rawSnippet:"call John"}` with a message containing the raw snippet. Run: `pnpm exec vitest run tests/parser/warnings.test.ts` → FAIL (function not defined).
- [ ] **Step 2: Implement** — add `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED` as string-literal consts (mirroring `SECTION_HEADER_NO_FIELDS` at `warnings.ts:33`); add `emitFieldUnreadable` and `emitUnknownSection` emitters (same shape as `emitEmptySection:42-50`). Codes emitted as literals at the push site (x2 coverage).
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(parser): data-quality warning codes + field/section emitters`.

## Task 2: Class A — `FIELD_UNREADABLE` (crew phone)

**Files:** Modify `lib/parser/blocks/crew.ts` (~`:127-143` buildCrewMember/phone); Test `tests/parser/blocks/crew.test.ts`.

- [ ] **Step 1: Failing test** — fixture crew row phone `"call John"` → asserts one `FIELD_UNREADABLE` warning (`rawSnippet==="call John"`) AND the member still parses. **Both header paths (R-plan F2):** a CREW-header sheet AND a TECH-header sheet (both flow through the shared `buildCrewMember`) must each emit. Negatives: `"917-331-4885"` → no warning; empty phone → no warning; whitespace → no warning. Derive expectations from the fixture. Run → FAIL.
- [ ] **Step 2: Implement** — put the predicate **inside the shared `buildCrewMember`** (called by BOTH `parseCrewBlock` and `parseTechBlock`, each of which computes its own `phoneRaw` ~`crew.ts:127` and passes it in), so both header paths share it: if `presence(phoneRaw) !== null && digitsOnly(phoneRaw).length === 0` call `emitFieldUnreadable`. The aggregator + raw phone + index must be in `buildCrewMember`'s scope (thread them in if not). v1 scope = phone only.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(parser): flag unreadable crew phone (FIELD_UNREADABLE)`.

## Task 3: Class B — `UNKNOWN_SECTION_HEADER` + registry + corpus

**Files:** Create `lib/parser/knownSections.ts`; Modify `lib/parser/index.ts` (post-block scan, agg in scope before `:449` return); Tests `tests/parser/unknownSection.test.ts`, `tests/parser/_metaKnownSectionsRegistry.test.ts`, corpus assertion.

- [ ] **Step 1a: Registry meta-test (failing)** — assert each block parser's header matcher token (CREW/TECH/HOTEL/HOTEL RESERVATIONS/HOTEL STAYS/TRANSPORTATION/GENERAL SESSION/BREAKOUT/ADDITIONAL ROOM/EVENT DETAILS/DETAILS/DATES/VENUE/IN HOUSE AV/AGENDA + contacts labels) is present in `knownSections.ts`. FAIL (file absent).
- [ ] **Step 1b: Detection test (failing)** — markdown with `CATERING | NAME | PHONE` after `TRANSPORTATION` → one `UNKNOWN_SECTION_HEADER` (rawSnippet contains `CATERING`). **Mandatory no-blank-separator variant** (CATERING immediately after the last TRANSPORTATION row) → still fires (§5.2 R3 F2). Negatives: a `Driver`/`Vehicle` sub-label → none; a known header → none; a recognized-but-empty section → `SECTION_HEADER_NO_FIELDS` only (no double-fire); a lone all-caps GEAR row (`DLP DATA PROJECTOR | DLP DATA PROJECTOR | | | 1 | 1`) → none (≥2 *header-word* columns required).
- [ ] **Step 1c: Corpus regression (failing→will pass after impl)** — class-B over all 7 `fixtures/shows/exporter-xlsx/*.md` → zero `UNKNOWN_SECTION_HEADER`.
- [ ] **Step 2: Implement** — `knownSections.ts` exporting the canonical header set + an `isKnownSectionHeader(col0)` predicate; in `index.ts` after block parsers, iterate `md.split("\n")` rows (split via `CELL_SPLIT_RE`), and for each row where col0 is all-caps, not in the registry, not a known sub-label, AND col1+ contains ≥2 all-caps header-words → `emitUnknownSection`. Skip blocks already carrying `SECTION_HEADER_NO_FIELDS`.
- [ ] **Step 3: Green (all of 1a/1b/1c)** + **Step 4: Commit** `feat(parser): flag unknown section headers + registry + corpus guard`.

## Task 4: Class C — `BLOCK_DISAPPEARED` from MI-7

**Files:** Create `lib/sync/blockDisappearance.ts`; Modify `lib/sync/runScheduledCronSync.ts` (`processOneFile_unlocked` ~`:2555`, after `runInvariants`, before apply); Test `tests/sync/blockDisappearance.test.ts` + extend a real-DB test.

- [ ] **Step 1: Failing test** — `blockDisappearanceWarnings(triggeredItems, existingWarnings)`: MI-7 items with `new_count===0` for each section → one `BLOCK_DISAPPEARED` each (`blockRef.kind` = MI-7 `section`). Cases: MI-7 `new_count>0` → none; no MI-7 → none; **`existingWarnings` has `SECTION_HEADER_NO_FIELDS` with `blockRef.kind:"hotels"` while MI-7 `section:"hotel_reservations"` → suppressed via the `hotels→hotel_reservations` normalization** (assert exactly one warning, the SECTION_HEADER_NO_FIELDS) — use the REAL parser kind, not a synthetic name (§R9). FAIL.
- [ ] **Step 2: Implement** — pure helper mapping MI-7(`new_count===0`)→`BLOCK_DISAPPEARED`, with the `hotels→hotel_reservations` normalization map for the suppression check; wire into `processOneFile_unlocked` appending to `parseResult.warnings` before the apply.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(sync): derive BLOCK_DISAPPEARED parse-warning from MI-7`.
- [ ] **Step 5: Real-DB e2e** (extend `tests/sync/` real-DB) — a recurring re-sync (cron AND manual via `processOneFile_unlocked`) where a block goes `prior>0→next0` → exactly one `section_shrunk` feed row (the existing MI-7 row; assert NO duplicate) AND `BLOCK_DISAPPEARED` in `shows_internal.parse_warnings`. Include `transportation: object→null`. Commit `test(sync): class-C recurring e2e + no feed double-log`.

## Task 5: §12.4 catalog rows (admin-log-only)

**Files:** Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose, admin-log-only rows mirroring `SECTION_HEADER_NO_FIELDS:2901`); run `pnpm gen:spec-codes`; Modify `lib/messages/catalog.ts`.

- [ ] **Step 1: Failing** — `pnpm exec vitest run tests/cross-cutting/codes.test.ts` after Tasks 1-4 introduce the literals → FAIL (active codes absent from SPEC_CODES). (Confirms the parity gate sees the new producer codes.)
- [ ] **Step 2: Implement** — add 3 §12.4 rows (admin-log-only, `—`/`—` crew columns); `pnpm gen:spec-codes` to regen `lib/messages/__generated__/spec-codes.ts`; add matching `catalog.ts` rows. All three staged in ONE commit (§12.4 lockstep discipline).
- [ ] **Step 3: Green** (codes.test.ts + x1-catalog-parity) + **Step 4: Commit** `feat(messages): admin-log-only §12.4 rows for the 3 parse-warning codes`.

## Task 6: `summarizeDataGaps` shared helper

**Files:** Create `lib/parser/dataGaps.ts` (or `lib/admin/dataGaps.ts`); Test `tests/.../dataGaps.test.ts`.

- [ ] **Step 1: Failing** — `summarizeDataGaps(warnings)` → `{ total, classes: {FIELD_UNREADABLE, UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED} }`; excludes `severity:"info"`; `[]`/null → `{total:0}`. Assert against the input array (anti-tautology). FAIL.
- [ ] **Step 2: Implement** + **Step 3: Green** + **Step 4: Commit** `feat: summarizeDataGaps helper (single-sourced count logic)`.

## Task 7: P2 — staged-review card warnings (`pending_syncs`)

**Files:** Modify `app/admin/show/staged/[stagedId]/page.tsx` (`:183` `warningSummary:""`); Test `tests/app/admin/...` or component.

- [ ] **Step 1: Failing** — a `pending_syncs` staged first-seen row whose `parse_result.warnings`/`warning_summary` carry data-gaps → the page loader yields a non-empty `warningSummary` + a `dataGaps` summary; `StagedReviewCard` renders it (it already renders `warningSummary` at `:531`). Derive from the seeded warning array. FAIL (hardcoded `""`).
- [ ] **Step 2: Implement** — populate `warningSummary`/`dataGaps` from `parse_result.warnings` (jsonb) / `warning_summary`, replacing `""`.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(admin): surface data gaps on the staged-review card`.

## Task 8: P3 primary — wizard Step 3

**Files:** Modify `components/admin/wizard/Step3SheetCard.tsx` (+ `Step3Review.tsx` if the row shape flows there); Test `tests/components/...Step3...`.

- [ ] **Step 1: Failing** — a Step-3 row checked/applied-clean but carrying data-gap warnings → `Step3SheetCard` renders per-class data-gap detail (not just a generic count) before the publish checkbox. Derive from the row's warning array. FAIL.
- [ ] **Step 2: Implement** — derive `summarizeDataGaps` for the row, render the detail.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(admin): wizard Step-3 data-gap detail before publish`.

## Task 9: P3 secondary — `/admin/unpublished` chip

**Files:** Modify `lib/admin/loadHeldShows.ts` (`:100-105` select), `components/admin/ShowsTable.tsx` (chip); Test `tests/admin/loadHeldShows...`, component.

- [ ] **Step 1a: Failing (render)** — `loadHeldShows` reading seeded `shows_internal.parse_warnings` → per-show `summarizeDataGaps` summary derived from the seeded array (NOT the chip). `ShowsTable` renders the chip when `total>0`, nothing when `0`. FAIL.
- [ ] **Step 1b: Failing (invariant 9, R-plan F1 — NOT deferred)** — the NEW `loadHeldShows` `shows_internal.parse_warnings` read returns an error AND (separately) throws → `loadHeldShows` yields a discriminable `infra_error` and `/admin/unpublished` shows a visible degraded state, NOT a silent absent-chip/`{total:0}`. FAIL.
- [ ] **Step 2: Implement** — extend the read with `{data,error}` destructure; failure → typed `infra_error`/degraded UI (mirror `loadHeldShows`'s existing infra_error result shape); null/absent → no chip; render the chip near `PublishShowButton` otherwise. **Register the new `shows_internal` read in `tests/admin/_metaInfraContract.test.ts`** (its own row, distinct from the existing `shows` read).
- [ ] **Step 3: Green (1a+1b + meta-contract)** + **Step 4: Commit** `feat(admin): data-gaps chip on /admin/unpublished (invariant-9 safe)`.

## Task 10: P4 — Changes-feed (no new render, confirm reuse)

**Files:** none new for the feed (MI-7 `section_shrunk` already renders). Test asserts the e2e from Task 4.5 covers it.

- [ ] **Step 1: Confirm** — verify (test from Task 4.5) the recurring disappearance shows in `ChangesFeed` as the existing `section_shrunk` entry; no `section_emptied`, no new `ChangeFeedEntry` mapping. No code change. (If a render gap is found, add a minimal `ChangeFeedEntry` label tweak under this task.) Commit only if a change is made.

## Task 11: P1 — `SHOW_FIRST_PUBLISHED` digest (shared emitter)

**Files:** Modify the shared `emitSuccessfulPhase2Tail` path (`lib/sync/applyStaged.ts` / wherever `SHOW_FIRST_PUBLISHED` context is built), `components/admin/PerShowAlertSection.tsx` (sub-line); Tests sync + component.

- [ ] **Step 1: Failing** — a first-published emission with `severity:"warn"` warnings → `SHOW_FIRST_PUBLISHED` `context.data_gaps` populated, asserted on the cron path AND ≥1 staged/manual emitter (proves shared-emitter placement). `PerShowAlertSection` renders the sub-line only when `context.data_gaps` present (bespoke, NOT in the catalog `dougFacing`). FAIL.
- [ ] **Step 2: Implement** — add `data_gaps` to the context in the shared emitter; render the sub-line in `PerShowAlertSection`. Verify `_metaAdminAlertCatalog` write-site regex still matches.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(admin): data-gaps digest on SHOW_FIRST_PUBLISHED alert`.

## Task 12: All paths — per-show Data-Quality panel + invariant 9

**Files:** Modify `app/admin/show/[slug]/page.tsx` (panel + `shows_internal.parse_warnings` read), extend `tests/admin/_metaInfraContract.test.ts`; Tests component + infra.

- [ ] **Step 1a: Failing (render)** — per-show page with seeded `shows_internal.parse_warnings` → "Data quality" panel lists each `.message`; zero warnings → panel absent.
- [ ] **Step 1b: Failing (invariant 9, R10 F1 — per-show read; the held-show read is covered in Task 9)** — the per-show page's `shows_internal.parse_warnings` read returns an error AND (separately) throws → the surface degrades visibly (calm notice), NOT a silent absent-panel/`{total:0}`. Register THIS read in `_metaInfraContract` (distinct row from Task 9's `loadHeldShows` read). FAIL.
- [ ] **Step 2: Implement** — read with `{data,error}` destructure; failure → degraded notice (mirror the existing Changes-feed `SyncInfraError` degrade on this page, `app/admin/show/[slug]/page.tsx`); null/absent → no panel; render the list otherwise.
- [ ] **Step 3: Green** + **Step 4: Commit** `feat(admin): per-show Data-Quality panel (invariant-9 safe)`.

## Task 13: Layout-dimensions (real-browser, mandatory)

**Files:** Test `tests/e2e/...` or chrome-devtools assertion.

- [ ] **Step 1: Playwright assertion** — render `/admin/unpublished` (chip + `PublishShowButton` row) and the wizard Step-3 card row (checkbox + data-gap detail); `getBoundingClientRect()` asserts the chip/detail and the control share vertical center and the row has no overflow at the documented viewport (jsdom NOT sufficient). Commit `test(admin): layout-dimensions for data-gap chip rows`.

## Task 14: Transition audit

**Files:** Test in the relevant component test files.

- [ ] **Step 1** — enumerate each new conditional render (chip present/absent, panel present/absent, alert sub-line present/absent, Step-3 detail present/absent); assert each is instant (no `AnimatePresence`/exit needed — static parse state). Commit `test(admin): transition audit for data-gap surfaces`.

## Task 15: Impeccable dual-gate (invariant 8, UI)

- [ ] Run `/impeccable critique` AND `/impeccable audit` (external) on the UI diff (`ShowsTable`, `StagedReviewCard`, `Step3SheetCard`, `PerShowAlertSection`, per-show Data-Quality panel). HIGH/CRITICAL fixed or `DEFERRED.md`'d. Record dispositions.

## Task 16: Adversarial review (cross-model)

- [ ] Whole-diff Codex `adversarial-review`, fresh-eyes, REVIEWER ONLY, iterate to APPROVE. Triage via deferral discipline.

## Task 17: Close-out

- [ ] Full local suite green (tsc, prettier, the new + extended meta-tests). Push; open PR; **real GitHub CI green** (all required checks; not DIRTY). `gh pr merge --merge`. Fast-forward local main; verify `rev-list --left-right --count main...origin/main` == `0 0`.

---

## Self-review checklist (run after drafting)
- Spec coverage: every §5 detector + §6 surface + §9 meta-test has a task. ✓
- No placeholders; each code step names the file + the concrete change. ✓
- Type consistency: `summarizeDataGaps` shape, `ParseWarning` shape, `blockDisappearanceWarnings(items, existingWarnings)` signature consistent across tasks. ✓
- Anti-tautology: surfacing tests assert against the warning-array data source, not the rendered output; corpus + invariant-9 negative tests included. ✓
- Adversarial review task present between self-review and execution handoff. ✓

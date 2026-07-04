# Plan — Data-quality badge: full warn-severity gap class

**Spec:** `docs/superpowers/specs/2026-07-04-data-quality-badge-full-warn-class.md` (Codex-APPROVED, 6 rounds).
**Branch:** `feat/data-quality-badge-full-warn-class` (worktree). **Builds on:** #289 (`09aa942c`).
**Discipline:** TDD per task (failing test → minimal impl → green → commit). Conventional commits. `--no-verify` (shared hooks). Run `pnpm typecheck` + `pnpm format:check` before push (vitest strips types; `--no-verify` skips prettier).

---

## Meta-test inventory (mandatory declaration)

- **CREATES:** `tests/parser/dataGapsClassCompleteness.test.ts` — the catalog-anchored drift guard (spec §3.2). Registry completeness (42-partition pairwise-disjoint) + mechanism-agnostic scan (collect code-shaped literals in `lib/parser`+`lib/sync`, ∩ `MESSAGE_CATALOG`, assert ⊆ `ALL_PERSISTED_WARNING_CODES ∪ NON_PARSE_WARNING_CODES_IN_SYNC`).
- **EXTENDS:** none of the existing structural meta-tests (`_metaInfraContract`, `_metaSentinelHiding`, `_metaAdminAlertCatalog`, `advisoryLockRpcDeadlock`, `no-inline-email-normalization`) — this change touches no Supabase boundary, no admin_alerts.upsert catalog, no advisory lock, no email path. Declared: **N/A** for all existing registries.
- **Advisory-lock topology:** N/A — the plan touches no `pg_advisory*` surface (pure read/render + a pure helper).

## Layout / transition tasks (mandatory consideration)

- **Layout-dimensions (real-browser) task:** **N/A** — no fixed-dimension parent is introduced. Badge/chip are content-height `flex items-center` children (spec §9 watchpoint 3; ratified in #289 `DEFERRED.md` DQ-1). The existing `tests/components/admin/dataGapsChipRowLayout.test.tsx` (jsdom structural) already covers the row; we extend it only if the chip's DOM changes (it doesn't — only its `title` string changes).
- **Transition-audit task:** **N/A** — no new visual state or animation. Badge/chip appear via conditional render (`total>0`), instant, no `AnimatePresence` (spec §5; same as #289). No compound transitions introduced.

## Consumer blast radius (from spec §4, verified)

Only 2 files need a shape change; everything else auto-generalizes (`.total` / `dataGapClassDetails()` / `Object.keys()` / `code in LABELS`). The 3 cap surfaces (`DataQualityBadge`, `PerShowAlertSection` sub-line, `ShowsTable` `DataGapsChip`) route through the new helper.

---

## Tasks

### Task 1 — `dataGaps.ts`: single-source registry + generalized helper + `formatDataGapBreakdown`

**RED** (`tests/parser/dataGaps.test.ts` — extend existing):
- Assert `GAP_CLASSES.length === 22` and every entry has a non-empty `label` that (a) starts lowercase, (b) contains **no underscore**, (c) contains **no screaming-snake token** (`!/[A-Z0-9]{2,}_/`), and (d) `!== its code`. This is the invariant-5 property — a raw §12.4 CODE token must never render; plain-language acronyms like `"PDF"` ARE allowed (`AGENDA_PDF_UNREADABLE` → `"unreadable agenda PDF"`). Do NOT assert lowercase-only (Codex plan R1 HIGH: that would reject the legitimate "PDF" acronym and contradict the pluralization assertion below).
- **Derive from registry, not hardcoded:** build a fixture with one `warn` warning per `GAP_CLASSES.code`; assert `summarizeDataGaps(fixture).total === GAP_CLASSES.length` and every `classes[code] === 1`.
- Add one `info` autocorrect (`DAY_RESTRICTION_DOUBLE_LOCATION`), one `warn` autocorrect (`STAGE_WORD_AUTOCORRECTED`), one asset warn (`REEL_DRIFTED`): assert none increments `total` (allow-list discriminator, not severity). **Failure mode caught:** counting by severity would count the warn autocorrect.
- Guard conditions: `summarizeDataGaps(null|undefined|[])` → `{total:0, classes:{all 22 keys→0}}`; a `warn` warning with an unknown code → not counted; a warning MISSING `severity` whose code ∈ set → **counted** (preserve #289 contract). `dataGapClassDetails(all-zero)` → `[]`.
- `formatDataGapBreakdown`: (a) `≤cap` classes → `"2 unreadable fields, 1 unknown section"` (count desc, then registry order); (b) `>cap` (build 6 classes) → ends with `", +N more"` and lists exactly `cap` classes; (c) `total:0` or `cap<=0` → `""`; (d) ties broken by registry order (deterministic — two classes count 2 each appear in `GAP_CLASSES` order); (e) pluralization: assert `"unreadable agenda PDFs"`, `"empty sections"` render correctly under `+s`.

**GREEN:** Introduce `const GAP_CLASSES = [{code,label}×22] as const`; derive `GapCode`, `DATA_GAP_CODES`, `DATA_GAP_CLASS_LABELS`, and the `dataGapClassDetails` order array from it. `DataGapsSummary.classes: Record<GapCode, number>` built via `Object.fromEntries(GAP_CLASSES.map(g=>[g.code,0]))`. `summarizeDataGaps`: keep `if (w.severity==="info") continue`, then `if (DATA_GAP_CODES.has(w.code)) classes[w.code as GapCode]++`. Add `formatDataGapBreakdown(summary, cap=4)`.

**Commit:** `feat(parser): generalize data-gap set to the full 22-code class + bounded breakdown helper`

### Task 2 — Drift-guard meta-test (`tests/parser/dataGapsClassCompleteness.test.ts`)

**RED (the test IS the deliverable — write it to fail first against an intentionally-incomplete registry, then complete the registry):**
- Define the 4 buckets + `NON_PARSE_WARNING_CODES_IN_SYNC` ignore-list. Assert pairwise-disjoint; `ALL_PERSISTED_WARNING_CODES` = 22+7+2+11 = 42 with the documented per-bucket counts.
- **Scan:** walk `lib/parser/**` + `lib/sync/**` (excl `*.test.ts`); collect every string literal matching `/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/`; **∩ `MESSAGE_CATALOG` keys**; assert each survivor ∈ `ALL_PERSISTED_WARNING_CODES ∪ NON_PARSE_WARNING_CODES_IN_SYNC`. AST-based collection (`typescript` `createSourceFile`, walk `StringLiteral` nodes) per `feedback_ast_guard_for_log_code_stamps`.
- **Bootstrap the ignore-list:** run the scan, subtract the 42-partition, and seed `NON_PARSE_WARNING_CODES_IN_SYNC` with the remainder — each with a one-line reason. Known members: `HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`, `AGENDA_GETFILE_GONE/FAULT`, `AGENDA_PDF_DOWNLOADED`, `AGENDA_EXTRACTED`, `AGENDA_ENRICH_THREW` (log-only), plus any sync-raised admin-alert/forensic codes the scan surfaces.
- **Negative test (proves the guard bites):** add a fake catalog-present code literal to the collected set in-test (or a fixture module) that's in neither partition nor ignore-list → assert the completeness assertion throws. **Failure mode caught:** a new persisted code silently unclassified.

**GREEN:** complete the registry + ignore-list until the scan passes.
**Commit:** `test(parser): catalog-anchored drift guard for the persisted-ParseWarning universe`

### Task 3 — `PerShowAlertSection`: generalize digest reader + cap the sub-line

**RED** (`tests/components/admin/PerShowAlertSection*.test.tsx` or the digest unit test):
- `readDataGapsDigest` on a context with the **full 22-key `classes`** → reconstructs all keys. On an **old 3-key context** (`{FIELD_UNREADABLE, UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED}` + old `total`) → missing keys default 0, persisted `total` preserved (NOT recomputed). **Failure modes caught:** dropping new classes from a new context; crashing/regressing on an old context.
- The sub-line renders via `formatDataGapBreakdown` (assert a >4-class digest yields a bounded `"…, +N more"` string, no raw code).

**GREEN:** reconstruct `classes` by mapping `GAP_CLASSES` → `num(c[code])`; route the sub-line through the helper.
**Commit:** `fix(admin): per-show data-gaps digest reads all classes + bounded sub-line`

### Task 4 — `DataQualityBadge`: bounded accessible name

**RED** (`tests/components/admin/ShowsTable.test.tsx` badge tests): with a >4-class summary, assert **both** the badge `aria-label` AND its `title` attribute equal `"${total} data gap(s): "` + `formatDataGapBreakdown(...)` (≤4 classes + "+N more") — the spec bounds both (Codex plan R2 MEDIUM: don't leave `title` on the unbounded 22-class join). Query by `role=img` accessible name + read the `title` attr; expected derived from the helper (not hardcoded). Assert no raw `_`-code token in either (clone tree, strip sibling panels per anti-tautology rule).
**GREEN:** build both the badge accessible name and `title` via the helper.
**Commit:** `fix(admin): bound the data-quality badge accessible name via the shared cap helper`

### Task 5 — `ShowsTable` `DataGapsChip`: bounded title

**RED:** with a >4-class summary, assert the held-row chip `title` = `formatDataGapBreakdown(...)` (bounded). Extend `dataGapsChipRowLayout.test.tsx` only if DOM changes (it does not — `title` string only).
**GREEN:** replace the inline `details.map().join()` with the helper.
**Commit:** `fix(admin): bound the held-row data-gaps chip title via the shared cap helper`

### Task 6 — `rescanDecision`: regression coverage for newly-counted codes

**RED** (`tests/onboarding/rescanDecision.test.ts`): a refreshed parse that adds a **newly-counted** code (e.g. `UNKNOWN_FIELD`) vs a prior with none → `gapRegressed` true → `dirty` true. **Failure mode caught:** the generalized `classes` shape silently not covering a new code in the `Object.keys` comparison.
**GREEN:** no impl change expected (already generic) — this task PROVES the auto-generalization holds. If it fails, fix the shape.
**Commit:** `test(onboarding): rescan flags regression on newly-counted data-gap codes`

### Task 7 — Impeccable dual-gate (invariant 8) — UI surfaces

Run `/impeccable critique` AND `/impeccable audit` on the diff (touched UI: `DataQualityBadge.tsx`, `ShowsTable.tsx` chip, `PerShowAlertSection.tsx`, the **19** new `DATA_GAP_CLASS_LABELS` copy strings — 22 counted − 3 reused from #289). Fix HIGH/CRITICAL or defer via `DEFERRED.md`. Copy focus: the 19 new labels are plain-language, mid-sentence, pluralize under `+s`, no jargon, **no em dash** (absolute ban). Record findings + dispositions.
**Commit:** `fix(admin): impeccable dual-gate — data-gap label copy + badge/chip polish` (only if changes)

### Task 8 — Full verification + adversarial review (cross-model)

- `pnpm typecheck` + `pnpm test` (touched suites + `tests/parser` + `tests/messages` + `tests/admin`) + `pnpm format:check`. Confirm no `exactOptionalPropertyTypes` `toEqual`-shape regression from the `classes` Record change (run the FULL suite — the shape is widely consumed).
- **Adversarial review (cross-model, Codex)** of the whole implementation diff — fresh-eyes, iterate to APPROVE.

---

## Self-review checklist (writing-plans additions)

- **Anti-tautology:** Task 1/4/5 derive expectations from `GAP_CLASSES`/the helper, never hardcoded counts; Task 4 clones+strips sibling panels; each task states its concrete failure mode. ✅
- **Pre-draft code-verification:** every named file/fn/field verified via the two live sweeps + consumer grep (§4). ✅
- **Fix-round regression budget:** after any fix, re-run `tests/parser` (drift guard) + the full suite (shape change). ✅
- **No silent caps:** the §5 cap logs nothing (UI), but the `+N more` affordance is visible; the drift-guard ignore-list is explicit + reasoned. ✅

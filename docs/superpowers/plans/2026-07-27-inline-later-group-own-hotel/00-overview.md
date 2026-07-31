# Inline Later-Group Own-Hotel Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an inline `Hotel Reservations`/`Hotel Stays` cell glues multiple bookings together, detect later groups that carry their OWN hotel (name + postal-complete address), keep that hotel on the group's reservation row instead of silently inheriting group 0's hotel, and warn (`HOTEL_INLINE_GROUP_OWN_HOTEL` / `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED`) wherever a keep is unsafe.

**Architecture:** A pure exported detector `classifyLaterSegment(rawSegment, ordinal, contextYear): LaterSegmentOutcome` implements the spec's D1–D7 pipeline (normalize → divider strip → conf-delimiter prefix cut → address anchor + tail extension → tier decision with guards/caps/scans → rebuild via existing `buildInlineHotel`). `buildInlineReservations` calls it per later segment; caller-side scope-A/scope-B degraded scans and nearest-preceding inheritance handle multi-marker and fallback cells. Two new warn-severity ParseWarning codes are registered across the full fan-out (23 rows a–w).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, existing parser modules (`lib/parser/blocks/hotels.ts`, `hotelConfTokens.ts`, `warnings.ts`, `dataGaps.ts`).

**Spec (canonical, APPROVED after 58 adversarial rounds):** `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md`. Its §8.1 behavior table (~159 rows) carries the byte-exact input and assertion for every oracle; task bodies below cite rows by their bold row-name — the row text is normative for test content. **Closes:** `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL`.

## Global Constraints

- Spec is canonical (invariant 7); every §8.1 row's input/assertions are copied byte-exact from the row, never paraphrased.
- TDD per task (invariant 1): failing test → minimal implementation → pass → commit. Conventional commits `test(parser):` / `feat(parser):` / `docs(parser):` / `chore:`.
- No UI surface: zero files under `app/` or `components/` change (impeccable gate N/A). No DB, no advisory locks, no Supabase calls (invariants 2/9 N/A — declared, see meta-test inventory).
- Emitters use LITERAL code strings (`lib/parser/warnings.ts:29-30` convention; extractor `scripts/extract-internal-code-enums.ts:70-73`).
- Persisted `rawSnippet`/`rawCells` stay RAW (post-`clean()` cell text; D1 normalization is scan/detector-internal only). `clean()` at `lib/parser/blocks/hotels.ts:691`/`:704` strips zero-width + backslashes BEFORE `buildInlineReservations` — no rawSnippet can retain zero-width bytes (spec R49).
- Copy caps: `helpfulContext` ≤ 300 (C-OWN-5 is 294), `triggerContext` ≤ 160 (`tests/messages/_metaWarningCardCopy.test.ts:53-56`); no em-dashes, straight apostrophes.
- Counts after this feature: DATA_GAP_CODES 35→37, ALL_PERSISTED 55→57, card-copy registry 42→44, walker required-list five→eight, AMBIGUITY_CODES five→seven.
- `pnpm spec:lint <doc>` must report 0 hard before any spec/plan doc commit.

## Task List

| # | Task file | Deliverable | Commits |
| - | --------- | ----------- | ------- |
| 1 | 01-detector-core.md | `classifyLaterSegment` exported pure fn (D1–D7, S8/S9); unit oracles | test(parser) + feat(parser) |
| 2 | 02-integration-keeps-demotes.md | wired into `buildInlineReservations`; all tier-1 keeps / tier-2 demotes / parity negatives | test(parser) + feat(parser) |
| 3 | 03-inheritance-degraded-scopes.md | nearest-preceding inheritance; scope-A/scope-B scans; max-one matrix | test(parser) + feat(parser) |
| 4 | 04-stash-emit-plumbing.md | HotelAmbiguity kinds, toPending, two emitters, envelopes, stash order | test(parser) + feat(parser) |
| 5 | 05-registration-fanout.md | §6.3 rows a–w in one commit (three-lockstep + counts + walkers + card-copy 42→44 + EXPECTED_HELPFUL_CONTEXT) | feat(parser) |
| 6 | 06-corpus-closeout.md | corpus goldens re-assert; parent-spec §3.1 row-7 pointer; hotels.ts comment rewrite; BACKLOG delete + BL-CARD-COPY-HELPFULCONTEXT-PARITY add; full gates | docs/test/chore |
| 7 | (this file, below) | Plan self-review → **Adversarial review (cross-model)** → execution | — |

## Meta-test inventory (writing-plans mandatory)

- EXTENDS `tests/parser/_metaTransformSitesWalker.test.ts` — required list +2 (both stash sites), count comments/enumeration/test name five→eight (T5 rows k/l).
- EXTENDS count gates: `tests/parser/dataGaps.test.ts` (35→37 at :43/:44/:45/:157, `:75` enumeration +2, `:83` total 5→7) and `tests/parser/dataGapsClassCompleteness.test.ts` (35→37, 55→57, `:68` "(55)"→"(57)", test name "(37/7/2/11)") (T5 rows n/o).
- EXTENDS `tests/parser/ambiguityCodes.test.ts` — five→seven, both codes in the sorted enumeration (T5 row p).
- EXTENDS `tests/messages/warningCardCopyRegistry.ts` + `tests/messages/_metaWarningCardCopy.test.ts` — NEW `EXPECTED_HELPFUL_CONTEXT` map (both new codes) + byte-parity loop beside the `triggerContext` one (spec row v, R57) (T5 row v).
- NEW oracle: `INTERNAL_CODE_ENUMS` membership for both codes, source `parse_warnings.code` (T5 row j).
- RIDES ALONG fail-by-default: `_metaWarningCardCopy` caps, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage`.
- N/A — declared: advisory-lock topology (no `pg_advisory*` anywhere in the diff), Supabase call-boundary registry (no Supabase client calls — pure parser), sentinel-hiding/tiles + layout-dimensions + transition-audit (zero UI files), admin-alert catalog (no admin surface), e2e harness-readiness (no Playwright attached), mutation-surface observability (parser library, not a mutation surface — invariant 10 applies to routes/server actions, none touched).

## Pre-draft verification, sweeps, corpus re-probe (run 2026-07-30, banked)

- Every cited file:line grep-verified against this worktree during spec rounds R18–R58 (the spec's citations were themselves adversarially audited; the plan reuses them).
- Test wiring: `tests/parser/**/*.test.{ts,tsx}` auto-collected via `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:82`); only `mutationHarness.*` is nightly-excluded (`vitest.projects.ts:65`). New test files need NO config change. `tests/messages/**` likewise collected (existing `_metaWarningCardCopy` runs there).
- Count-literal sweep of gap test files (exact command + output + per-hit disposition): plan-time run banked in the spec-round record; re-run in T5 step 1 verbatim: `grep -n "\b35\b\|\b37\b\|\b55\b\|\b57\b" tests/parser/dataGapsClassCompleteness.test.ts tests/parser/dataGaps.test.ts` — current hits: completeness :36 (35), :68 "(55)", :204 name "total 55 (35/7/2/11)", :205 (35), :209 (55); dataGaps :43/:44/:45 (35), :157 (35), :83 (total 5). Disposition: every hit is edited by T5 rows n/o; dataGaps.test.ts:481 fixture literal `42` is NOT a count (untouched).
- Walker sweep: `grep -n "five\|required" tests/parser/_metaTransformSitesWalker.test.ts` — hits :15/:42/:95 ("five required") — all edited by T5 row l.
- ambiguityCodes sweep: `grep -n "exactly the" tests/parser/ambiguityCodes.test.ts` — hit :16 ("exactly the five ratified members") — edited by T5 row p.
- Corpus re-probe (§9): only multi-`Check In` inline cell in fixtures is `fixtures/shows/exporter-xlsx/consultants.md` — later segment prefix `Eric Weiss` = 2 base words, no D4 match → tier 3. Expected corpus deltas: ZERO new cards (guest cards stay 9, consultants 1).
- Case-parity audit: `STREET_ADDRESS_RE` is `/iu`, `STREET_ADDRESS_ZIP_RE` is `/u` (state code case-sensitive) — every spec-new regex borrowing the ST+postal tail is `/u`, matching live posture.

## Execution notes

- `InlineBuild` is module-private (`lib/parser/blocks/hotels.ts:887`). Export ONLY `classifyLaterSegment` + `LaterSegmentOutcome`; tests access `outcome.build.row.*` structurally (repo emits no d.ts — no TS4023 surface).
- Tests narrow the discriminated union via `outcome.tier === 1` before touching `.build` (strict-safe).
- Anti-tautology (project rule): every keep asserts `hotel_name`/`hotel_address`/`names`/dates against CELL-derived literals; every demote asserts rows byte-equal to the row's pre-change probe plus exact warning cardinality (`warnings.filter(...)` length, never `.some()`); expected values derive from the cell text, never parser output. Each task body states the concrete failure mode per test group.
- §8.1 date convention: inputs are authored year-suffixed (`3/3` → `3/3/26`) so `inferShowYear` resolves 2026 (spec R11).
- Structural-defense-at-first-occurrence and class-sweep rules apply to every review round of this plan and its diff.

## Task 7 — Self-review → Adversarial review (cross-model) → execution handoff

- [ ] Plan self-review (spec coverage / placeholder scan / type consistency) — run inline, fix inline.
- [ ] **Adversarial review (cross-model):** dispatch Codex via `node scripts/codex-guard.mjs review --brief <plan-review brief> --cwd <worktree> --out <fresh timestamped dir> --attempt-max-secs 1380 --total-max-secs 3600 --max-attempts 3`. Brief carries: REVIEWER ONLY, fresh-eyes, VERDICT line contract, the R1–R58 spec ratification list as DO-NOT-RELITIGATE, and the plan-scope watchpoints (zero-width = unit-only; dash form×context matrix; counts 35→37/55→57/42→44; fan-out a–w; EXPECTED_HELPFUL_CONTEXT). Iterate repair rounds to APPROVE with no round budget.
- [ ] Execution: TDD per task in this worktree (autonomous pipeline — subagent-driven or inline per orchestrator), then whole-diff Codex review, push, real CI green, `gh pr merge --merge`, fast-forward main to `0 0`.

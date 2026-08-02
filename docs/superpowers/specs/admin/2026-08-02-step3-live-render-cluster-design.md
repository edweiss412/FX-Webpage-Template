# Step-3 live-render cluster — seeded state gallery, impeccable dual-gate, NUL-byte hygiene, agenda-wrapper harness fidelity

**Date:** 2026-08-02 · **Branch:** `test/step3-live-render-cluster` · **Status:** DRAFT
**Graduates:** `BL-STEP3-IMPECCABLE-LIVE-RENDER`, `BL-SOURCE-NUL-BYTE-STEP3REVIEW`, `BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` (all in `BACKLOG.md`)

## 0. Summary

Three related closures on the Step-3 "Review & publish" surface, one branch, one PR:

1. **Seeded state gallery + impeccable dual-gate** (`BL-STEP3-IMPECCABLE-LIVE-RENDER`): extend the existing e2e seed helper so the live `/admin?step=3` render shows all six pre-finalize row states, then run `/impeccable critique` + `/impeccable audit` against that live render — the pass the Variant-B milestone could not run.
2. **Agenda-wrapper harness fidelity** (`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY`, Option A — harness-level): give the live-entry modal harness a non-empty agenda baseline so the REAL admin wrapper chrome is what the containment assertions measure, then delete the hand-transcribed chrome spec.
3. **NUL-byte hygiene** (`BL-SOURCE-NUL-BYTE-STEP3REVIEW`): replace the raw U+0000 literal in `Step3Review.tsx` with the `"\u0000"` escape spelling. Zero behavior change; rides this branch because the branch already runs the invariant-8 gate.

## 1. Scope

**In scope:** `tests/e2e/helpers/devCaptureStaged.ts` (seed extension), a new live-entry bundle spec for the agenda wrapper, deletion of the transcribed chrome in `tests/e2e/agendaBreakdown.layout.spec.ts`, one-byte edit in `components/admin/wizard/Step3Review.tsx`, workflow path additions in `.github/workflows/step3-live-bundle.yml`, the impeccable dual-gate run + findings dispositions, DEFERRED.md/BACKLOG graduation bookkeeping.

**Out of scope:** linked-show display states (`live`, `ready_to_publish`, `held`, `skipped` — need created-show seeding, an earlier branch of the derivation; the BACKLOG entry's ratified ask is the five pre-finalize states alongside `ready`); any change to `deriveStep3DisplayState` or product UI beyond P0 findings; the seeded-app-level agenda assertion (Option B, rejected — re-opens the "days" sizing the corrected BACKLOG entry retired).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Findings posture: P0 fixed inline, P1+ deferred via DEFERRED.md entries | Owner decision, this brainstorm (2026-08-02); invariant 8 permits "fixed or explicitly deferred" (`AGENTS.md` rule 8) |
| One branch / one PR for all three items | Owner decision, this brainstorm (2026-08-02) |
| Agenda close is harness-level (Option A), not seeded-app-level | Owner decision, this brainstorm; cost analysis in the BACKLOG entry (corrected R3, `BACKLOG.md` § BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY: "additive work, not a new harness. Sized in hours") |
| Double-"Review" affordance on demoted RESCAN cards is INTENTIONAL — critique must not file it as a defect; the gate checks it renders correctly, not whether it should exist | `docs/superpowers/plans/step3-onboarding/2026-07-04-step3-review-page-variant-b-closeout.md` §12 finding 7 ("intentional per spec §4.3") |
| Linked-show states out of scope | BACKLOG entry's own fix text: "add ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row alongside the ready row" |
| NUL byte fixed as escape, not deleted logic | `BL-SOURCE-NUL-BYTE-STEP3REVIEW`: "replace the raw byte with the escape sequence" |
| The hand-written chrome spec is deleted only after its assertions are re-homed in the real-wrapper spec | This spec §4; the BACKLOG entry's fix text ("then delete the transcribed chrome") |

## 2. Seed extension (state gallery)

### 2.1 Current state

`seedStagedRow` (`tests/e2e/helpers/devCaptureStaged.ts:94`, symbol `seedStagedRow`) inserts one `pending_syncs` row (`drive_file_id`, `source_kind: "manual"`, `parse_result` jsonb with a parsed `show`, `triggered_review_items: []`, `wizard_session_id`) plus one `onboarding_scan_manifest` row (`status: "staged"`, reserved `wizard_session_id`, `drive_file_id` `e2e-devcapture:<uuid>`). It never writes `pending_syncs.last_finalize_failure_code` (defaults null) and never writes `created_show_id`, so `buildStep3Row` (`components/admin/OnboardingWizard.tsx:285`) passes `linkedShow: null` and `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44`) returns `ready`.

### 2.2 Change

`seedStagedRow` gains an options parameter (backward-compatible; existing callers unchanged) selecting a **state variant**. A new helper `seedStep3StateGallery` seeds six rows in ONE reserved wizard session, one per variant. Derivation inputs verified against `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44-78`, first-match-wins) and `buildStep3Row` field sources (`OnboardingWizard.tsx:340-348`: `publishIntent = m.publish_intent === true`; `lastFinalizeFailureCode = pending?.last_finalize_failure_code ?? null`; `hasWellFormedParseResult = !!(parseResult && parseResult.show)` at `OnboardingWizard.tsx:346`).

### 2.3 State × seed-field matrix

| # | Variant (display state) | `onboarding_scan_manifest.status` | `pending_syncs.last_finalize_failure_code` | `pending_syncs.parse_result` | Derivation path |
| --- | --- | --- | --- | --- | --- |
| 1 | `ready` (existing default) | `staged` | null | well-formed (`show` present) | rule 7 fallthrough |
| 2 | `needs_review_reapply` — generic | `staged` | `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` (`app/api/admin/onboarding/finalize/route.ts:47-48`) | well-formed | rule 2, well-formed branch |
| 3 | `needs_review_reapply` — demoted RESCAN | `staged` | `RESCAN_REVIEW_REQUIRED` (`lib/onboarding/rescanReviewCode.ts`, consumed at `components/admin/wizard/Step3SheetCard.tsx:235` `isDirtyRescan`) | well-formed | rule 2, well-formed branch; card renders RescanReviewBanner (`Step3SheetCard.tsx:627`) + "Review" button (`Step3SheetCard.tsx:663`) |
| 4 | `needs_review_no_details` | `staged` | `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` | **null** | rule 2, `hasWellFormedParseResult` false |
| 5 | `needs_review_other` (blocking) | `hard_failed` | null | well-formed | rule 1 (`HARD_BLOCK` set, `step3DisplayState.ts:34`) |
| 6 | `set_aside` | `permanent_ignore` | null | well-formed | rule 3a (`SET_ASIDE` set, `step3DisplayState.ts:39`) |

`Step3ManifestStatus` union verified at `components/admin/wizard/Step3Review.tsx:71-79` (`staged | hard_failed | skipped_non_sheet | applied | defer_until_modified | permanent_ignore | discard_retryable | live_row_conflict`) — every status this matrix writes is a member.

**Guard conditions.** Variant 4 writes `parse_result: null` — `buildStep3Row:346` handles null explicitly (`!!(parseResult && ...)`), so no crash path; the card's no-details branch renders inline Re-scan/Ignore controls (display-state comment, `step3DisplayState.ts:15`). Rows carry distinct `name` values (`"E2E <variant> Dev Capture"`) so the critique can attribute findings to states. No variant writes `created_show_id`, `publish_intent`, or `wizard_approved` — all six stay on the `linkedShow: null` path.

**Cap:** exactly six rows, fixed list — no unbounded growth.

### 2.4 TDD shape

Red-first test: a DB-backed test (same project as existing devCapture tests) seeds the gallery, reads back via the same query path `fetchStep3Data` uses (`OnboardingWizard.tsx:436` area), maps each row through `deriveStep3DisplayState`, and asserts the six expected states 1:1. This pins the matrix to the derivation, so a future derivation change breaks the seed loudly (anti-tautology: expectations are the matrix's state names, not re-derived from the same inputs).

## 3. Impeccable dual-gate on the live render

- Drive: real sign-in + `/admin?step=3` (pattern: `tests/e2e/admin-phase2-surfaces.spec.ts:67`), gallery seeded, `openStep3Modal` (`devCaptureStaged.ts:216`) for modal-context checks.
- Run `/impeccable critique` and `/impeccable audit` with canonical v3 setup gates (context.mjs load → register read), per invariant 8.
- Explicit check items carried from the BACKLOG entry: dark-mode warn-contrast on warn-bearing cards; demoted RESCAN card's double-"Review" affordance renders correctly (NOT whether it should exist — §1.1).
- Both themes screenshotted at mobile + desktop widths.
- Dispositions: P0 → fix inline on this branch (each fix re-runs the affected gate half); P1+ → DEFERRED.md entries with trigger. Findings + dispositions recorded in this spec's closeout section and the PR body.
- Closeout marker (grammar per `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md:49-64`): `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` — filled at close; `p0+p1>0 → dispositions=recorded`.

## 4. Agenda-wrapper harness fidelity (Option A)

### 4.1 Change

1. `buildSectionData` (`tests/e2e/_step3ReviewModalHarness.tsx:128`, currently `(prOverrides = {}, showOverrides = {})`) gains an optional third parameter `agendaBaseline: AdminAgendaItem[] = []`, threaded to the `_step3ReviewModalHarness.tsx:158` call site that currently hardcodes `agendaBaseline: []`. Existing callers untouched (default preserves today's behavior).
2. New fixture: non-empty `AdminAgendaItem[]` (`lib/agenda/agendaAdminPreview.ts:34`: `label`, `badge`, `href`, `block: { extraction, droppedSessions/Days/Tracks, extracted? }`) including one item whose `label` is a ≥90-char unbroken token (same class the transcribed spec uses).
3. New bundle entry (working name `_step3ReviewModalAgendaEntry`, under tests/e2e/) (pattern: `_step3ReviewModalLiveEntry.tsx:124` `createRoot` render of the real `Step3ReviewModal`; built by `_step3ReviewModalBundle.mjs` esbuild IIFE with the `"use server"` directive plugin) + new spec (working name `step3-review-modal.agenda`, a Playwright spec under tests/e2e/) asserting, against the REAL modal chrome (`AgendaBreakdown` mounted at `components/admin/wizard/step3ReviewSections.tsx:3300`, props incl. `baseline: AdminAgendaItem[]` at `step3ReviewSections.tsx:3309`, real `li.flex.min-w-0.flex-col` wrapper at `step3ReviewSections.tsx:3322` area):
   - no horizontal overflow at 320 / 390 / 720 px viewports;
   - the long unbroken label wraps within its card (`min-w-0` + `wrap-break-word` chain);
   - assertions scoped to the agenda list subtree (anti-tautology: measure the `li` wrapper's box vs its scroll width, not the page).
4. Fetch stub: the existing intercept (`_step3ReviewModalLiveEntry.tsx:36-62`) passes through everything but the rescan route; if `AgendaBreakdown` issues a fetch when `baseline` is non-empty, the new entry stubs that route the same way — determined red-first at plan time.
5. Delete the hand-written chrome from `tests/e2e/agendaBreakdown.layout.spec.ts` — the spec is deleted whole; its three assertion families (320/390/720 no-overflow, long-title wrap, grid containment) are re-homed in the new spec. No other spec references its serving harness (it boots its own `node:http` server).
6. Workflow: add the new entry + spec paths to `.github/workflows/step3-live-bundle.yml` `pull_request.paths` (`step3-live-bundle.yml:18-29`) and the run list (`step3-live-bundle.yml:70` pattern, `STEP3_LIVE_BUNDLE_ONLY=1`). Remove `agendaBreakdown.layout.spec.ts` from wherever the standalone config picks it up (it matches the standalone project's glob; deletion of the file suffices — verify no allowlist row names it).

### 4.2 Dimensional invariants

| Parent | Child | Guarantee |
| --- | --- | --- |
| `li.flex.min-w-0.flex-col` (real wrapper, `step3ReviewSections.tsx:3322` area) | agenda card content | `min-w-0` on the `li` breaks the flex min-content floor; asserted by real-browser `getBoundingClientRect` ≤ viewport width at all three widths |
| modal panel | agenda list `ul` | no `overflow-x` growth: `scrollWidth === clientWidth` on the list container |

Real browser only (Playwright, `desktop-chromium` project of the bundle workflow) — jsdom computes no layout.

### 4.3 Transition inventory

N/A — the new spec renders a static baseline; no new visual states or animations are introduced by this branch. (The modal's own transitions are out of scope and unchanged.)

## 5. NUL byte

`components/admin/wizard/Step3Review.tsx`, `uncheckedCleanNames.join("\x00")` (raw byte at offset 53571, sole NUL; `file(1)` reports `data`): replace the raw byte with the two-character escape spelling `\u0000`. Identical runtime string; `grep` regains visibility of the file. Proof: `file` reports a text type after the edit and `git diff` shows a one-line change. No flag lifecycle, no telemetry, no DB surface.

## 6. Testing & invariants

- **TDD per task** (invariant 1): seed matrix test red-first (§2.4); agenda spec red-first against the unfixed harness default (asserting the new fixture path exercises the real wrapper — red = spec file exists but override param absent / entry not built); NUL byte proven by a `file(1)`-type check in the existing source-hygiene test location if one exists, else by the diff itself (one-shot hygiene, no standing test — a standing NUL-ban meta-test is out of scope, noted in §7).
- **Advisory locks / DB writes:** seed writes go through the existing seed helper's client (test-only surface, no product mutation path) — invariant 2 N/A; invariant 10 N/A (no new mutation surface; test helpers are not routes/actions).
- **Impeccable gate:** §3; marker line lands in this spec's closeout section (flat-plan style per invariant 8).
- **Commits:** `test(admin)` for seed + gallery test, `test(e2e)` for the agenda harness/spec swap, `fix(admin)` for the NUL byte, `docs(plan)`/`docs(backlog)` for spec + graduations.
- **CI:** `step3-live-bundle.yml` runs the new spec on this PR (paths include it); `unit-suite` runs the seed matrix test; full required set must be green before merge.

## 7. Documented limits

- The gallery covers the six `linkedShow: null` states only; `live` / `ready_to_publish` / `held` / `skipped` renders stay un-gated by impeccable until a created-show seed exists (tracked implicitly by the BACKLOG entry's out-of-scope note; no new backlog row — the residual is visible in this spec).
- The agenda spec exercises the modal-context wrapper (the real chrome the BACKLOG finding names). The card-context "Agenda" eyebrow branch (`Step3SectionChromeContext`, `step3ReviewSections.tsx:3322`) renders the same list markup; a separate card-context assertion is not added.
- `applied` and `discard_retryable` / `live_row_conflict` manifest statuses are not seeded (the first is post-apply, the latter two are `needs_review_other` duplicates of `hard_failed` for display purposes).
- No standing guard prevents a future raw NUL byte landing in source; accepted (single historical instance).

## 8. Acceptance criteria

1. `seedStep3StateGallery` seeds six rows; matrix test asserts the six display states via the real read path.
2. Live `/admin?step=3` renders all six states; impeccable critique + audit both RUN against it; P0s fixed; P1+ in DEFERRED.md; marker line recorded.
3. New agenda spec green in `step3-live-bundle.yml` asserting real-wrapper containment; `agendaBreakdown.layout.spec.ts` deleted; no orphaned allowlist/registry rows (grep `agendaBreakdown` tree-wide = docs only).
4. `Step3Review.tsx` reports as text to `file(1)`; sole diff at the `join` site.
5. Three BACKLOG entries graduated to `BACKLOG-archive.md` with provenance; graduation meta-test green.
6. Whole-diff cross-model review APPROVE; real CI green; merged; `main...origin/main` = `0 0`.

## Closeout (filled at ship time)

impeccable-gate: TEMPLATE — critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

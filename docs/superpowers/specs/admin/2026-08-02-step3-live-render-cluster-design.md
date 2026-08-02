# Step-3 live-render cluster — seeded state gallery, impeccable dual-gate, NUL-byte hygiene, agenda-wrapper harness fidelity

**Date:** 2026-08-02 · **Branch:** `test/step3-live-render-cluster` · **Status:** DRAFT (R1-R3 repairs applied)
**Graduates:** `BL-STEP3-IMPECCABLE-LIVE-RENDER`, `BL-SOURCE-NUL-BYTE-STEP3REVIEW`, `BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` (all in `BACKLOG.md`)

## 0. Summary

Three related closures on the Step-3 "Review & publish" surface, one branch, one PR:

1. **Seeded state gallery + impeccable dual-gate** (`BL-STEP3-IMPECCABLE-LIVE-RENDER`): extend the existing e2e seed helper so the live `/admin?step=3` render shows all six card variants the BACKLOG entry names, then run `/impeccable critique` + `/impeccable audit` against that live render — the pass the Variant-B milestone could not run.
2. **Agenda-wrapper harness fidelity** (`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY`, Option A — harness-level): give the live-entry modal harness a non-empty agenda baseline so the REAL admin wrapper chrome is what the containment assertions measure, then delete the hand-transcribed chrome spec with every consumer reconciled (§4.4).
3. **NUL-byte hygiene** (`BL-SOURCE-NUL-BYTE-STEP3REVIEW`): replace the raw U+0000 literal in `Step3Review.tsx` with the `"\u0000"` escape spelling, red-first via the existing source-walking test (§5).

## 1. Scope

**In scope:** `tests/e2e/helpers/devCaptureStaged.ts` (seed extension + lock-topology correction, §2.5), a new live-entry bundle spec for the agenda wrapper, deletion of `tests/e2e/agendaBreakdown.layout.spec.ts` with its six non-doc consumers reconciled, one-byte edit in `components/admin/wizard/Step3Review.tsx` plus a red-first NUL guard in the existing deletion-safety test, workflow path additions in `.github/workflows/step3-live-bundle.yml`, the impeccable dual-gate run + findings dispositions, DEFERRED.md/BACKLOG graduation bookkeeping.

**Out of scope:** linked-show display states (`live`, `ready_to_publish`, `held`, `skipped` — need created-show seeding, an earlier branch of the derivation; the BACKLOG entry's ratified ask is the six pre-finalize card variants); any change to `deriveStep3DisplayState` or product UI beyond P0 findings; the seeded-app-level agenda assertion (Option B, rejected — re-opens the "days" sizing the corrected BACKLOG entry retired).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Findings posture: P0 fixed inline, P1+ deferred via DEFERRED.md entries | Owner decision, this brainstorm (2026-08-02); invariant 8 permits "fixed or explicitly deferred" (`AGENTS.md` rule 8) |
| One branch / one PR for all three items | Owner decision, this brainstorm (2026-08-02) |
| Agenda close is harness-level (Option A), not seeded-app-level | Owner decision, this brainstorm; cost analysis in the BACKLOG entry (corrected R3, `BACKLOG.md` § BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY: "additive work, not a new harness. Sized in hours") |
| Double-"Review" affordance on demoted RESCAN cards is INTENTIONAL — critique must not file it as a defect; the gate checks it renders correctly, not whether it should exist | `docs/superpowers/plans/step3-onboarding/2026-07-04-step3-review-page-variant-b-closeout.md` §12 finding 7 ("intentional per spec §4.3") |
| Linked-show states out of scope | BACKLOG entry's own fix text: "add ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row alongside the ready row" |
| NUL byte fixed as escape spelling, not deleted logic | `BL-SOURCE-NUL-BYTE-STEP3REVIEW`: "replace the raw byte with the escape sequence" |
| The hand-written chrome spec is deleted only after its assertions are re-homed in the real-wrapper spec | This spec §4; the BACKLOG entry's fix text ("then delete the transcribed chrome") |
| "Needs a look" is a warn-card VARIANT of the `ready` derivation state, not a distinct `Step3DisplayState` value — the gallery covers six card variants over five derivation states | R1 finding 1, accepted; driver is `nonAmbiguityGapTotal(row) > 0` (`components/admin/wizard/Step3SheetCard.tsx:489`), not the display-state enum |

## 2. Seed extension (state gallery)

### 2.1 Current state

`seedStagedRow` (`tests/e2e/helpers/devCaptureStaged.ts:94`, symbol `seedStagedRow`) inserts one `pending_syncs` row (`drive_file_id`, `source_kind: "manual"`, `parse_result` jsonb with a parsed `show`, `triggered_review_items: []`, `wizard_session_id`) plus one `onboarding_scan_manifest` row (`status: "staged"`, reserved `wizard_session_id`, `drive_file_id` `e2e-devcapture:<uuid>`). It never writes `pending_syncs.last_finalize_failure_code` (defaults null) and never writes `created_show_id`, so `buildStep3Row` (`components/admin/OnboardingWizard.tsx:285`) passes `linkedShow: null` and `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44`) returns `ready`.

### 2.2 Change

`seedStagedRow` gains an options parameter (backward-compatible; existing callers unchanged) selecting a **card variant**. A new helper `seedStep3StateGallery` seeds six rows in ONE reserved wizard session, one per variant, each with a **distinct `drive_file_id`** (uniqueness: `pending_syncs` unique on `(drive_file_id, wizard_session_id)` per `supabase/migrations/20260501001000_internal_and_admin.sql:182`; manifest unique on `(wizard_session_id, drive_file_id)` per the same migration `supabase/migrations/20260501001000_internal_and_admin.sql:357`) and per-variant distinguishers that respect production's parse-attachment gate: `parseResult` is attached only to clean rows (`isCleanReviewRow` gate, `components/admin/OnboardingWizard.tsx:616` area), and the card headline renders `pr.show.title` before the manifest name fallback (`components/admin/wizard/Step3SheetCard.tsx:497`). So **variants 1-3 carry distinct parsed `show.title` values; variants 4-6 carry distinct manifest `name` values** (variant 4's empty parse has no `show`; variants 5-6 are not clean-status rows, so no parse attaches).

Derivation inputs verified against `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44-78`, first-match-wins) and `buildStep3Row` field sources (`OnboardingWizard.tsx:340-348`: `publishIntent = m.publish_intent === true`; `lastFinalizeFailureCode = pending?.last_finalize_failure_code ?? null`; `hasWellFormedParseResult = !!(parseResult && parseResult.show)` at `OnboardingWizard.tsx:346`).

### 2.3 Variant × seed-field matrix

Six card variants over five derivation states (variant 2 is the warn-card presentation of `ready`; see §1.1):

| # | Variant (BACKLOG name) | Derivation state | `onboarding_scan_manifest.status` | `pending_syncs.last_finalize_failure_code` | `pending_syncs.parse_result` | Driver |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ready | `ready` | `staged` | null | well-formed `show`, `warnings: []` | rule 7 fallthrough; zero gap warnings |
| 2 | needs-a-look | `ready` (warn-card variant) | `staged` | null | well-formed `show` + `warnings` carrying at least one non-ambiguity `GAP_CLASSES` warning, e.g. `FIELD_UNREADABLE` (`lib/parser/dataGaps.ts:31-32`) | `nonAmbiguityGapTotal(row) > 0` (`lib/admin/step3Buckets.ts:67`, consumed at `Step3SheetCard.tsx:489`) |
| 3 | demoted (RESCAN) | `needs_review_reapply` | `staged` | `RESCAN_REVIEW_REQUIRED` (`lib/onboarding/rescanReviewCode.ts`) | well-formed | rule 2 well-formed branch; demoted card renders RescanReviewBanner (`Step3SheetCard.tsx:627`) + "Review" button (`Step3SheetCard.tsx:663`), `isDirtyRescan` at `Step3SheetCard.tsx:235` |
| 4 | no-details | `needs_review_no_details` | `staged` | `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` (`app/api/admin/onboarding/finalize/route.ts:47-48`) | `'{}'::jsonb` — an empty object, NOT SQL NULL: the column is `jsonb not null` (`supabase/migrations/20260501001000_internal_and_admin.sql:144`); missing `show` key makes `hasWellFormedParseResult` false (`OnboardingWizard.tsx:346`) | rule 2, not-well-formed branch |
| 5 | blocking | `needs_review_other` | `hard_failed` | null | well-formed | rule 1 (`HARD_BLOCK` set, `lib/admin/step3DisplayState.ts:34`) |
| 6 | set-aside | `set_aside` | `permanent_ignore` | null | well-formed | rule 3a (`SET_ASIDE` set, `lib/admin/step3DisplayState.ts:39`) |

**Variant 5 additionally seeds a `pending_ingestions` row**, fully specified against the DDL and the read path: matching `drive_file_id`; the gallery's `wizard_session_id` (the production read filters `.eq("wizard_session_id", wizardSessionId)`); non-null `drive_file_name`; non-null `last_error_message`; and `last_error_code: "STAGED_PARSE_FAILED"` — the code `applyRescanDecisionUnderLock.ts:240` uses as the hard-fail fallback and a catalog `MessageCode` (`lib/messages/catalog.ts:3207`), so `HelpAffordance`'s `isKnownCode` gate (`components/admin/HelpAffordance.tsx:66` and rendered-gate at `components/admin/HelpAffordance.tsx:73`) passes and the affordance actually renders. Production attaches `pendingIngestionId` from `pending_ingestions` (`components/admin/OnboardingWizard.tsx:641-646`, `ingestionByDfid` built at `OnboardingWizard.tsx:590-592`), and the real blocking controls — `HardFailedActions`, hard-fail copy, `HelpAffordance` — render only when `row.pendingIngestionId` exists (`components/admin/wizard/Step3Review.tsx:599`). Variants 1-4 and 6 seed no `pending_ingestions` row (their branches never read it).

`Step3ManifestStatus` union verified at `components/admin/wizard/Step3Review.tsx:71-79` (`staged | hard_failed | skipped_non_sheet | applied | defer_until_modified | permanent_ignore | discard_retryable | live_row_conflict`) — every status this matrix writes is a member.

**Guard conditions.** Variant 4's `'{}'::jsonb` is handled explicitly by `buildStep3Row` (`!!(parseResult && parseResult.show)` — missing `show` key is falsy); the no-details branch renders inline Re-scan/Ignore controls (display-state comment, `lib/admin/step3DisplayState.ts:15`). Variant 2's warning array must survive `stripLegacyUnknownFieldAnchors` (`lib/admin/step3Buckets.ts:46-50`) — `FIELD_UNREADABLE` is not a legacy UNKNOWN_FIELD anchor, so it does. No variant writes `created_show_id`, `publish_intent`, or `wizard_approved` — all six stay on the `linkedShow: null` path.

**Cap:** exactly six rows, fixed list — no unbounded growth.

### 2.4 TDD shape

Red-first test: a vitest DB-backed test in the SERIAL project (runs in `unit-suite-db` — NOT a Playwright spec; the dev-capture Playwright spec is `UNSEEN` in the coverage ledger, `tests/ci/_metaE2eWorkflowCoverage.test.ts:64`, and gains nothing here) seeds the gallery, reads rows back, and derives each card's state **through the real assembly path**. `buildStep3Row` alone is NOT that path (R3 finding 3): it returns at `OnboardingWizard.tsx:392` BEFORE production attaches `parseResult`/`stagedShowTitle` (clean-row enrichment, `OnboardingWizard.tsx:616`) and `pendingIngestionId`/`errorCode` (hard-fail enrichment, `OnboardingWizard.tsx:641`) — so `nonAmbiguityGapTotal` over its bare return is vacuously zero. This branch therefore performs a **mechanical extraction**: the per-row assembly loop body (`OnboardingWizard.tsx:598-648` — `buildStep3Row` call plus both enrichment branches) moves into one exported pure function (working name `assembleStep3Row`) consumed by the production loop AND the gallery test — zero behavior change, pinned by the existing suites staying green. The gallery test asserts, per variant: the derivation state; variant 2's `nonAmbiguityGapTotal > 0` (`lib/admin/step3Buckets.ts:67`) over the ASSEMBLED row; variant 5's `pendingIngestionId` and `errorCode: "STAGED_PARSE_FAILED"` present on the assembled row; variants 1-3 distinct `parseResult.show.title`; variants 4-6 distinct manifest `name`. Expectations are the matrix's literals (anti-tautology: not re-derived from the seed's inputs).

### 2.5 Lock topology (invariant 2 — APPLIES; single-holder enumeration)

Invariant 2 has no test-helper exemption (R1 finding 4). The helper today is split: `pending_syncs` insert/delete run inside `runLockedSql` (`tests/e2e/helpers/devCaptureStaged.ts:110-112`, `devCaptureStaged.ts:166-168`) holding the per-show advisory lock, but BOTH `onboarding_scan_manifest` mutations go through unlocked PostgREST (`devCaptureStaged.ts:132` insert, `devCaptureStaged.ts:176-177` delete). This branch corrects that while extending the helper:

- Every seed-path mutation of `pending_syncs`, `onboarding_scan_manifest`, AND `pending_ingestions` (variant 5; insert and cleanup delete, all six rows) moves inside the same `runLockedSql` transaction holding `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` for that row's `drive_file_id`.
- **Single-holder enumeration:** the JS-side `runLockedSql` wrapper is the ONLY holder on this path — no RPC holder, no nested SECURITY DEFINER holder exists on the seed path (the helper issues plain SQL, not RPCs). Per-row locking (six distinct `drive_file_id` values, six distinct hashkeys) — no cross-row lock-ordering concern.
- The gallery test asserts the lock is held BEHAVIORALLY, using the repository's live pattern at `tests/db/advisory-lock.test.ts:50` as template: while the seed transaction runs, a second connection's competing `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` returns false and `pg_locks` shows the holder. (The lexical topology guard `tests/auth/advisoryLockRpcDeadlock.test.ts` pins holder ORDER, not liveness — it is not the observation seam here.) The exact seam (probe connection timing hook in the seed helper) is a plan-time mechanism decision; the requirement is a live-transaction observation, not a lexical scan.

## 3. Impeccable dual-gate on the live render

- Drive: real sign-in + `/admin?step=3` (pattern: `tests/e2e/admin-phase2-surfaces.spec.ts:67`), gallery seeded, `openStep3Modal` (`tests/e2e/helpers/devCaptureStaged.ts:216`) for modal-context checks.
- Run `/impeccable critique` and `/impeccable audit` with canonical v3 setup gates (context.mjs load → register read), per invariant 8.
- Explicit check items carried from the BACKLOG entry: dark-mode warn-contrast on the variant-2 warn card; demoted RESCAN card's double-"Review" affordance renders correctly (NOT whether it should exist — §1.1).
- Both themes screenshotted at mobile + desktop widths.
- Dispositions: P0 fixed inline on this branch (each fix re-runs the affected gate half); P1+ get DEFERRED.md entries with trigger. Findings + dispositions recorded in the PLAN unit's closeout section (invariant 8: findings live in the plan/handoff §12, not the spec tree) and summarized in the PR body.
- Closeout marker (grammar per `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md:49-64`): `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` — the marker line lives in the PLAN unit under `docs/superpowers/plans/` (the governing spec excludes the specs tree), filled at close; `p0+p1>0` requires `dispositions=recorded`.

## 4. Agenda-wrapper harness fidelity (Option A)

### 4.1 Change

1. `buildSectionData` (`tests/e2e/_step3ReviewModalHarness.tsx:128`, currently `(prOverrides = {}, showOverrides = {})`) gains an optional third parameter `agendaBaseline: AdminAgendaItem[] = []`, threaded to the `_step3ReviewModalHarness.tsx:158` call site that currently hardcodes `agendaBaseline: []`. Existing callers untouched (default preserves today's behavior).
2. New fixture: non-empty `AdminAgendaItem[]` (`lib/agenda/agendaAdminPreview.ts:34`: `label`, `badge`, `href`, `block` — whose optional full-payload field is `fullExtraction?`, NOT `extracted?`). The long unbroken token — the existing `_agendaFixture.ts` `LONG_TITLE` (measured 88 chars) reused verbatim — goes in a **session `title` inside the extraction payload** — the wrapping chain renders `session.title` (`components/crew/AgendaScheduleBlock.tsx:165-167`), and `AdminAgendaItem.label` is used only in the React key (`components/admin/wizard/step3ReviewSections.tsx:3477`), so a long `label` would paint nothing (R1 finding 3).
3. **Extract-route stub is mandatory, not conditional** (settled by probe: a non-empty baseline unconditionally POSTs — the guard at `step3ReviewSections.tsx:3354` returns early only on an EMPTY baseline, and the fetch fires at `step3ReviewSections.tsx:3374`; the schedule block reaches `ready` state only after a successful response, `step3ReviewSections.tsx:3394`). The new entry stubs that route the same way the rescan stub works (`tests/e2e/_step3ReviewModalLiveEntry.tsx:36-62`), returning a successful extraction payload carrying the long-token session title.
4. New bundle entry (working name `_step3ReviewModalAgendaEntry`, under tests/e2e/; pattern: `_step3ReviewModalLiveEntry.tsx:124` `createRoot` render of the real `Step3ReviewModal`; built by `_step3ReviewModalBundle.mjs` esbuild IIFE with the `"use server"` directive plugin) plus new spec (working name `step3-review-modal.agenda`, a Playwright spec under tests/e2e/) asserting, against the REAL modal chrome — `AgendaBreakdown` defined at `components/admin/wizard/step3ReviewSections.tsx:3300`, **mounted at `step3ReviewSections.tsx:4222`**, props incl. `baseline: AdminAgendaItem[]` at `step3ReviewSections.tsx:3309`, real `li.flex.min-w-0` wrapper at `step3ReviewSections.tsx:3239` (the `step3ReviewSections.tsx:3322` site is the chrome-context lookup, not the wrapper):
   - no horizontal overflow at 320 / 390 / 720 px viewports;
   - the 88-char unbroken session title wraps within its card (`min-w-0` + `wrap-break-word` chain);
   - assertions scoped to the agenda list subtree (anti-tautology: measure the `li` wrapper's box vs its scroll width, not the page).

### 4.2 Dimensional invariants

| Parent | Child | Guarantee |
| --- | --- | --- |
| `li.flex.min-w-0` (real wrapper, `step3ReviewSections.tsx:3239`) | agenda card content | `min-w-0` on the `li` breaks the flex min-content floor; asserted by real-browser `getBoundingClientRect` at or under viewport width at all three widths |
| modal panel | agenda list container | no horizontal growth: `scrollWidth === clientWidth` on the list container |

Real browser only (Playwright, `desktop-chromium` project of the bundle workflow) — jsdom computes no layout.

### 4.3 Transition inventory

No NEW transitions are introduced by this branch. The agenda block's existing production lifecycle (loading, then the stubbed extract POST resolves, then `ready` — `step3ReviewSections.tsx:3394`) runs unchanged in the harness; the spec's layout assertions wait for the `ready` state before measuring. That single existing loading-to-ready swap is the only state change in frame, and it ships today untouched. (The modal's own transitions are out of scope and unchanged.)

### 4.4 Deleting the transcribed spec — consumer reconciliation (R1 finding 6)

`tests/e2e/agendaBreakdown.layout.spec.ts` has six non-doc consumers; each gets an explicit action in the plan:

| Consumer | Action |
| --- | --- |
| `tests/e2e/standalone.config.ts:86` | remove the filename from the config's spec list |
| `tests/e2e/standalone-baseline.json:3` | remove its baseline row; regenerate if the file is generated |
| `package.json:55` | remove/replace the script reference |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts:193` | remove its row; ADD registration for the new spec (see below) |
| `tests/e2e/_agendaFixture.ts:9` | re-point the consumer reference at the new spec (fixture itself is reused) |
| `tests/e2e/pendingDiscardReflow.layout.spec.ts:23` | update the cross-reference comment |

**Post-delete oracle:** tree-wide grep for the filename stem `agendaBreakdown.layout` returns zero non-doc hits. (NOT bare `agendaBreakdown` — the component unit tests `agendaBreakdown.test.tsx` / `agendaBreakdown.transitions.test.tsx` legitimately remain.)

**Executable routing (probe-verified):** the new filename matches NEITHER existing project regex today, and project membership alone does NOT make the workflow run it — `step3-live-bundle.yml:70` passes spec files as POSITIONAL Playwright filters (R3 finding 1). Three additions, all required: (a) the `desktop-chromium` `testMatch` regex in `playwright.config.ts:76`; (b) the standalone config `testMatch` (`tests/e2e/standalone.config.ts:85`) — the `step3-review-modal.interactions` precedent lives in both, and standalone's unfiltered every-PR run is what satisfies `_metaE2eWorkflowCoverage.test.ts`; (c) the new spec's filename appended to the POSITIONAL file list in the `step3-live-bundle.yml:70` run command. `tests/e2e/standalone-baseline.json` gains the new spec's row (and loses the deleted spec's row, per §4.4 table).

**Workflow paths:** `.github/workflows/step3-live-bundle.yml` `pull_request.paths` (`step3-live-bundle.yml:18-29`) gains the new entry + spec paths AND the behavioral inputs the re-homed assertions depend on: `components/crew/AgendaScheduleBlock.tsx`, `app/globals.css`, and the reused `tests/e2e/_agendaFixture.ts`. Run list per `step3-live-bundle.yml:70` pattern (`STEP3_LIVE_BUNDLE_ONLY=1`).

## 5. NUL byte

`components/admin/wizard/Step3Review.tsx`, `uncheckedCleanNames.join(<raw U+0000>)` (raw byte at offset 53571, sole NUL; `file(1)` reports `data`): replace the raw byte with the escape spelling `"\u0000"`. Identical runtime string.

**Corrected rationale (R1 finding 7):** the practical damage is tool-specific — `file(1)` classifies the file as `data`, and **ripgrep suppresses normal match output** (reports a binary-file notice instead of match lines); BSD `grep` does print the line. The audit-blindness class the BACKLOG entry records is real for `rg`-based sweeps, which this repo's discipline uses heavily.

**TDD (R1 finding 5):** red-first via the existing source-walking test `tests/admin/step3DeletionSafety.test.ts:48` (it already reads this file with `readFileSync` and documents the NUL): add an assertion that the file contains no raw U+0000 — red against the current byte, green after the one-byte fix. This also retires the "no standing guard" limitation the draft carried.

## 6. Testing & invariants

- **TDD per task** (invariant 1): seed matrix test red-first (§2.4); agenda spec red-first (new spec asserting real-wrapper containment fails before the override param + entry exist); NUL guard red-first (§5).
- **Advisory locks** (invariant 2): APPLIES — §2.5 is the lock-topology section; the helper's manifest mutations move under the JS-side `runLockedSql` holder, and the gallery test asserts the lock is held.
- **Mutation-surface observability** (invariant 10): N/A — no new HTTP route or server action; test helpers are not mutation surfaces under the invariant's definition (routes / `"use server"` actions).
- **Impeccable gate** (invariant 8): §3; marker line and findings land in the plan unit's closeout (§12-style), not this spec.
- **Commits:** one commit per task, each carrying its red-first test AND the implementation that turns it green (invariants 1 + 6 — never a red guard committed alone, never impl before test). Expected shape: `test(admin)` seed gallery task (seed extension + matrix test + lock assertion); `fix(admin)` NUL task (guard assertion + one-byte fix, same commit); `test(e2e)` agenda harness task(s) (override param + fixture + entry + spec; deletion + consumer reconciliation may be its own task commit); `docs(plan)`/`docs(backlog)` for spec, plan, graduations. Final task split is the plan's to fix.
- **CI:** `step3-live-bundle.yml` runs the new spec on this PR (paths include it); `unit-suite` runs the seed matrix + NUL guard tests; full required set green before merge.

## 7. Documented limits

- The gallery covers the six `linkedShow: null` card variants only; `live` / `ready_to_publish` / `held` / `skipped` renders stay un-gated by impeccable until a created-show seed exists (residual visible here; no new backlog row).
- Needs-a-look is exercised as the warn-card variant of `ready` (§1.1); a warn-bearing DEMOTED card (warnings plus failure code simultaneously) is not seeded — the demoted branch already suppresses the checkbox regardless (`Step3SheetCard.tsx:242` area), so the compound adds no distinct affordance under test.
- The agenda spec exercises the modal-context wrapper (the real chrome the BACKLOG finding names). The card context is the NO-context branch of `Step3SectionChromeContext` (`step3ReviewSections.tsx:3322`) — it shares only the body list markup, and a separate card-context assertion is not added.
- `applied` and `discard_retryable` / `live_row_conflict` manifest statuses are not seeded (the first is post-apply; the latter two share the `needs_review_other` display branch with `hard_failed`).

## 8. Acceptance criteria

1. `seedStep3StateGallery` seeds six rows (distinct `drive_file_id`; variants 1-3 distinct parsed `show.title`, variants 4-6 distinct manifest `name`); gallery test asserts five derivation states plus the warn-card variant through the real builder path, and asserts the advisory lock is held during seed mutations.
2. Live `/admin?step=3` renders all six card variants; impeccable critique + audit both RUN against it; P0s fixed; P1+ in DEFERRED.md; marker line recorded.
3. New agenda spec green in `step3-live-bundle.yml` asserting real-wrapper containment (88-char session-title token wraps; no horizontal overflow at 320/390/720); `agendaBreakdown.layout.spec.ts` deleted with all six §4.4 consumers reconciled; `agendaBreakdown.layout` stem greps to zero non-doc hits; new spec registered in `_metaE2eWorkflowCoverage.test.ts`.
4. `Step3Review.tsx` reports as text to `file(1)`; NUL guard green; product diff limited to the `join` site plus any impeccable P0-disposition fixes (each recorded in the plan closeout).
5. Three BACKLOG entries graduated to `BACKLOG-archive.md` with provenance; graduation meta-test green.
6. Whole-diff cross-model review APPROVE; real CI green; merged; `main...origin/main` = `0 0`.


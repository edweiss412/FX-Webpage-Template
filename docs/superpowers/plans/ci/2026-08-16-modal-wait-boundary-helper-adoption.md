# Modal-wait Boundary-Helper Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every e2e open site that loads `/admin?show=<slug>` and then waits for content inside the review modal recovers exactly once from the admin error boundary, surfaces that recovery in its CI job log even when the run later fails, and can never be re-authored without the recovery.

**Architecture:** One recovery implementation, three entry points. `awaitReviewModalOrRecover` holds the loaded-or-boundary wait plus the single retry; `openShowReviewModalAt` adds goto-with-options; `openShowReviewModal` keeps its ratified signature by delegating through both. Because the URL entry point exists, no spec file writes `page.goto('/admin?show=…')` any more, which lets the structural guard be a flat per-site ban rather than a heuristic. The census is not prose: a candidate enumeration in code, asserted as a total disposition, is what keeps the member set honest.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Playwright, Vitest. No new dependencies, no DDL, no product change.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md` (APPROVED at adversarial spec round 7). Parent: `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md`. All §-references are to this arc's spec unless prefixed "parent".

impeccable-gate: N/A — no UI surface

## Global Constraints

- Conventional commits, one task per commit (AGENTS.md invariant 6).
- TDD per task (invariant 1), with one declared deliberate-red span stated in "Guard ordering" below.
- All work in this worktree; never the main checkout (invariant 11).
- Every non-interactive playwright run is wrapped: `pnpm heavy pnpm exec playwright test …` (AGENTS.md heavy-phase rule; the `heavy` script in the repo-root package.json). Scoped vitest runs, `pnpm typecheck`, and eslint are NOT wrapped.
- Downstream assertions are byte-unchanged at every adopted site. The helper replaces the navigation-plus-presence wait and nothing else.
- The recovery bound stays exactly 1 (parent §1.1; helper header `tests/e2e/helpers/openShowReviewModal.ts:13-15`).
- No workflow gating changes: no retries flags added or removed, no run-step file lists changed. The only workflow edits are reporter flags, `PLAYWRIGHT_JSON_OUTPUT_NAME`, and `if: always()` print steps.
- Acceptance criteria are spec §5's. Each task's `ac=` names the ones it discharges: **AC-1** helper surface; **AC-2** all 51 member sites adopted; **AC-2b** the executable candidate enumeration + total disposition; **AC-2b-pattern** one shared route-pattern constant; **AC-3** guard + mutation enrolment; **AC-4** collector, printer, oracle print duties, workflow wiring; **AC-5** no gating change; **AC-6** ledger + README + corpus.

## Guard ordering (the one deliberate red span)

The structural guard is Task 2, BEFORE any adoption, per AGENTS.md structural-defense-calibration ("if the class is already nameable at FIRST occurrence, ship the structural defense in the FIRST repair commit"). Spec review named the class in round 1, so the threshold is met several times over.

Two consequences, both intended:

1. The guard's violation list IS the direct-goto worklist, and AC-2b's disposition is the whole-census worklist. A guard landing after the sweep can only confirm what the sweep already decided; landing first, it makes a missed site fail a test rather than survive to review — which is precisely the failure mode that cost the spec four rounds.
<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this plan -->
2. `tests/ci/_metaModalWaitHelper.test.ts` is RED across Tasks 2-7 and goes green on Task 7's commit. This is ONE red-then-green cycle on the SAME command, committed in five reviewable slices — not five broken cycles. PR CI evaluates the branch head, which is green.

Tasks 3-7 therefore declare `red-state=authored` (Task 2 authored the failing case; each group discharges its slice) with a `red-target=` naming a naked goto line in that group's own files. `red-state=live` would be factually wrong at plan time: Task 2's suite does not exist on the tree, so `--exec-red` would exit non-zero for a module-not-found reason, which is the invalid RED shape the grammar rejects (`docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md` §4.2).

## Meta-test inventory (writing-plans mandate)

<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this plan -->
- **Creates:** `tests/ci/_metaModalWaitHelper.test.ts` plus its importable predicate module (registry-expressible shape from the start — an importable module with a referring Vitest suite, never a terminal CLI script).
- **Extends:** `tests/mutation/source/registry.ts` — one `GuardSurface` row for the predicate module (shape at `tests/mutation/source/registry.ts:12-38`: `id`, `sourcePath`, `suitePaths`, `operators`, `scoreFloor`, `control: {from,to}`, `accepted[]`).
- **Unchanged but must stay green:** `tests/ci/appE2eAnnotationPrint.test.ts` (green-run stdout pin, spec §1.1 — assertions NOT edited), `tests/e2e/helpers/openShowReviewModal.unit.test.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts`.
- **N/A with reason:** `tests/auth/_metaInfraContract.test.ts` — no Supabase call boundary added. `tests/messages/_metaAdminAlertCatalog.test.ts` — no admin_alert code. `tests/log/_metaMutationSurfaceObservability.test.ts` — no mutation surface. `tests/auth/advisoryLockRpcDeadlock.test.ts` — this plan touches no `pg_advisory*` surface, so the advisory-lock topology mandate does not apply.

## Plan-time verification transcript (run 2026-08-16; re-run before dispatch if the tree moved)

**Census.** Spec §2.1's five commands; outputs are the spec's §2.3/§2.4 tables. 51 member open sites over 17 files, discharged by 49 edit locations; 37 direct-goto, 14 non-textual. Two `/admin?show=` gotos are deliberately NOT adopted and are the guard's two pinned exemptions: `tests/e2e/published-review-modal.deeplink.spec.ts:298` (non-member) and line 344 (skeleton-tolerant, spec limit 3b). **These counts are as-of-authoring renderings, not gates** — spec §2.3-§2.5 are non-normative and AC-2b's disposition in code is the contract.

**Per-task reconciliation** (authored AND run, per the writing-plans reconciliation rule; must sum to the spec's totals or a group has been dropped):

| task | sites | edits |
| --- | --- | --- |
| 3 — published-modal family | 16 | 15 |
| 4 — lifecycle-layout family | 17 | 17 |
| 5 — crew-e2e family | 5 | 5 |
| 6 — admin-layout + phantom-gap | 6 | 6 |
| 7 — UNSEEN family | 7 | 7 |
| **total** | **51** | **49** |

Two effects separate sites from edits, pulling opposite ways: `published-review-modal.reopen.spec.ts`'s four row clicks all reach one wait wrapper (one edit, four sites, −3), and `published-review-modal.interactions.spec.ts:506` (`openGated`) is ONE click site whose loaded-modal wait lives in BOTH callers after `release()`, at line 529 and line 550 — its own wait at line 508 is the skeleton panel while the gate is still held, so it is not the wait to replace (+1).

**Workflow reporter state.** Larger than the spec's illustrative list; the spec deferred the exact enumeration here.

| step | current reporter | this plan adds |
| --- | --- | --- |
| `.github/workflows/crew-e2e.yml:188` | `--reporter=list,json` | print duty inside `check-crew-e2e-executed.mjs`, above its gating exit |
| `.github/workflows/published-modal-e2e.yml:149` | `--reporter=list` | `,json` + `PLAYWRIGHT_JSON_OUTPUT_NAME` + `if: always()` print step |
| `.github/workflows/admin-layout-e2e.yml:173` | none (config default) | both + `if: always()` print step |
| `.github/workflows/phantom-gap-e2e.yml:194` | `--reporter=list` | both + `if: always()` print step |
| `.github/workflows/phantom-gap-e2e.yml:204` | `--reporter=list` | both + `if: always()` print step |
| `.github/workflows/phantom-gap-e2e.yml:210` | `--reporter=list` | both + `if: always()` print step |
| `.github/workflows/lifecycle-layout-e2e.yml:110` | none (config default) | both + `if: always()` print step |
| `.github/workflows/lifecycle-layout-e2e.yml:130`, line 132 | none (config default) | both + `if: always()` print step |

`phantom-gap-e2e.yml` runs `admin-layout-dimensions.spec.ts` in THREE `-g`-filtered steps, not one; each needs its own `PLAYWRIGHT_JSON_OUTPUT_NAME` or they overwrite each other's report. Probed: no `if: always()` step exists in any of the five member workflows today.

**Other verified facts.**

- `collectInfraRecoveries` is ALREADY exported (`scripts/check-app-e2e-executed.mjs:75`); its print is inline at `scripts/check-app-e2e-executed.mjs:201-203`. Task 8 moves an existing export plus an inline loop into a shared module — it does not write a collector from nothing.
- **Both oracles gate above their reporting tail** — `scripts/check-crew-e2e-executed.mjs:165` and `scripts/check-app-e2e-executed.mjs:189` — so the app oracle's shipped recovery print is already unreachable on a floor shortfall. Spec §4.3's print-before-gate rule repairs both.
- UNSEEN members confirmed: `tests/ci/_metaE2eWorkflowCoverage.test.ts:129` (admin-parse-panel), line 146 (dev-capture), line 168 (published-show-attention), plus warning-panel-polish; none appears in any `.github/workflows/*.yml`.
- Playwright projects: `mobile-safari` (lifecycle-layout family), `desktop-chromium` (all other member specs) — `playwright.config.ts:64`, line 95.
- `pnpm heavy` = `python3 scripts/with-heavy-slot.py --` (`scripts/with-heavy-slot.py`, wired as the repo-root package.json `heavy` script).
- The Suspense skeleton shares the modal testid (`components/admin/showpage/ShowReviewModalSkeleton.tsx:51` → `components/admin/review/ReviewModalShell.tsx:584`). This is why there is no `readySelector` option and why two sites are excluded.

## e2e harness-readiness checklist (writing-plans mandate)

- **Server boot:** the existing per-workflow dev/prod boot is untouched; local verification uses the repo's standard seeded local stack (`pnpm preflight` green before any run).
- **Readiness gate:** the helper itself IS the gate — loaded-modal-or-boundary, never `networkidle` alone. Sites that additionally wait on `networkidle` (`picker-flow`, `alert-action-links:381`) keep that wait AFTER the helper, never instead of it. Row-click sites keep their existing `waitForRowHydration` before the click.
- **Detach safety:** no sampler or `locator.evaluate` call is added by this plan; every existing one keeps its current position relative to the modal's lifetime.

<!-- tasks: depth=3 red-contract -->

### Task 1: Helper surface — extract the core, add the URL entry point

**Files:**

- Modify: `tests/e2e/helpers/openShowReviewModal.ts`
- Test: `tests/e2e/helpers/openShowReviewModal.unit.test.ts` (extend)

**Interfaces:**

- Produces `awaitReviewModalOrRecover(page, opts?: { timeoutMs?, label? })` and `openShowReviewModalAt(page, url, opts?: { timeoutMs?, label?, gotoOptions? })`.
- `openShowReviewModal(page, slug, opts?)` keeps its exact signature and behavior, delegating: empty-slug guard → `openShowReviewModalAt(page, '/admin?show=' + slug, { timeoutMs, label: 'slug=' + slug })`.
- **There is no `readySelector` option.** The core waits on `LOADED_REVIEW_MODAL` only (spec §4.1; the skeleton shares the testid, so a modal-or-boundary race on `MODAL_ANY` would return on the skeleton and hide the fault).
- All three ready-locator operations run on a `.first()`-scoped locator (`tests/e2e/helpers/openShowReviewModal.ts:64`, line 68, line 78); the two boundary operations (line 80, line 76) do not, because the boundary is a single node by construction (`app/admin/error.tsx:34`). The RETURN value stays UNSCOPED so public behavior is byte-identical.
- The lazy `@playwright/test` dynamic import stays inside the boundary branch (`tests/e2e/helpers/openShowReviewModal.ts:17-19`) — the module must stay loadable under vitest.

**New unit cases (each states the failure mode it catches):**

- `gotoOptions` pass-through: the options object reaches `page.goto` unchanged. Catches a wrapper that drops `waitUntil`, which would silently change `picker-flow`'s and `admin-layout-dimensions`' navigation semantics.
- `label` fallback: absent label yields `label=unspecified` in annotation and error text. Catches `undefined` leaking into operator-facing strings.
- **Twin-frame cardinality:** a fixture where BOTH a skeleton `…-modal` and a loaded `…-modal:has(…-title)` are present, asserting `LOADED_REVIEW_MODAL` resolves to EXACTLY ONE node. The property is the locator's cardinality, NOT the execution of any branch — both the first wait and the post-recovery re-wait use that same locator, so cardinality covers both call sites by construction. This is what keeps AC-1 consistent with documented limit 2 ("the recovery branch has no deterministic test"); do not rewrite this case to traverse the boundary branch.
- Return-value identity: `openShowReviewModal` still returns an UNSCOPED `page.locator(LOADED_REVIEW_MODAL)`, so a caller counting or scoping off it sees exactly what it sees today.
- Delegation identity: the three existing cases (`tests/e2e/helpers/openShowReviewModal.unit.test.ts:28-37`) and the dead-slug diagnostic's asserted substrings (`tests/e2e/admin-changes-feed-layout.spec.ts:185`) pass unchanged on every exit path.

**Pre-dispatch mutants (string-presence discipline):** for the error-substring assertions run all four — value emptied; expected content plus an appended suffix; content present but not live (behind a false branch); and each discriminating parameter (`label`, `timeoutMs`) varied in turn. Record each result in the commit message.

<!-- task: red=`pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/openShowReviewModal.ts:40` why=`the new cases call awaitReviewModalOrRecover and openShowReviewModalAt, which do not exist: openShowReviewModal at :40 does goto-then-wait inline with no extractable core` ac=AC-1 -->

### Task 2: Structural guard — predicate, candidate enumeration, total disposition (deliberately red until Task 7)

**Files:**

- Create: the predicate module (importable; exports the route-pattern constant, the violation scan, and the candidate enumeration)
<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this plan -->
- Create: `tests/ci/_metaModalWaitHelper.test.ts`

**Three exports, one shared constant:**

1. **`MODAL_ROUTE_PATTERN`** — the single source for "a `/admin` route carrying a `show` query param in ANY position". Both the violation scan and candidate origin (a) resolve it. A unit case asserts the two consumers use this constant, never two regexes that happen to agree (AC-2b-pattern; spec R5 finding 1 measured the cost of two).
2. **Violation scan (the guard):** a line in `tests/e2e/*.spec.ts` matching both a `goto(` call and `MODAL_ROUTE_PATTERN` is a violation, unless it carries `// modal-wait-exempt: <non-empty reason>` on that line or the line immediately above. Population is a filesystem walk, so a new spec is covered by default; `tests/e2e/helpers/**` is outside the population by construction.
3. **Candidate enumeration:** every open site the five §2.1 origins can produce — the `tests/e2e/*.spec.ts` walk, plus a product-surface scan of `app/` and `components/` for `openHref(` call sites, literal `/admin?…show=` hrefs, and `action.href` builders resolved through `lib/adminAlerts/alertActions.ts`. **No hand-maintained list on either side.**

**Total disposition (AC-2b):** every candidate is a member (carrying its §4.2 shape) or an exclusion (carrying a reason); `members ∪ exclusions = candidates` exactly, with no leftovers on either side. An undispositioned candidate FAILS. A subset assertion would be vacuous against a newly-omitted candidate and a bare equality could never pass, since origins (b)-(e) deliberately yield non-members — the disposition, not the member set, is the assertion.

**Premise proof (five cases, per spec §4.4 and `BL-GUARD-PREMISE-REACHABILITY`):** FLAGS a bare `goto` line; STAYS QUIET on a helper call carrying the same URL text (the false-positive direction); STAYS QUIET on a valid exemption comment; FLAGS an empty-reason exemption; and — the R1 finding-2 regression pin — FLAGS a bare `goto` line in a fixture that ALSO imports the helper, the case the refuted file-level predicate passed. Plus the AC-2b pin: a constructed candidate with no disposition must FAIL.

**Exemption inventory:** pinned to exactly TWO entries (`published-review-modal.deeplink.spec.ts:298` and line 344). A third fails until an author edits the pinned inventory deliberately.

**This commit is RED by design.** Record the violation count and full site list in the commit message: that list is the worklist Tasks 3-7 consume.

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/published-review-modal.interactions.spec.ts:389` why=`the corpus assertion flags every naked goto of the modal route; :389 is one of the live ones, and specifically the site spec-review R1 finding 2 used to refute the file-level import predicate` ac=AC-2b,AC-2b-pattern,AC-3 -->

### Task 3: Adopt — `published-modal-e2e` family (6 files, 16 sites, 15 edits)

**Files:** `published-review-modal.crew-actions.spec.ts` (1), `tests/e2e/published-review-modal.deeplink.spec.ts` (3: 120, 239, 257), `tests/e2e/published-review-modal.interactions.spec.ts` (5: 103, 389, 255, 355, 506), `tests/e2e/published-review-modal.realtime.spec.ts` (2: 321, 789), `tests/e2e/published-review-modal.reopen.spec.ts` (4 click sites, 1 edit at its wrapper line 65), `tests/e2e/published-review-modal.closeFreshness.spec.ts` (1 click site, 1 edit at its wrapper line 54).

**Shapes:** G at crew-actions:48, realtime:321, interactions:389. U at deeplink:120 (its local `openModal` delegates) and interactions:103 (the `opts.url ??` branch). N at deeplink:239/:257 (after their `waitForURL`), interactions:255/355/506, realtime:789, reopen:65, closeFreshness:54.

**`openGated` takes TWO edits for ONE site:** its loaded wait lives in both callers after `release()`, at line 529 and line 550. Its own line 508 wait is the skeleton panel while the gate is held — not the wait to replace.

**Two sites here are deliberately NOT adopted.** `deeplink:344` and `realtime:913` wait on `MODAL_ANY`, which the skeleton also matches, so the helper would return on the skeleton and hide the fault (spec §2.5, limit 3b, `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES`). Leave both byte-unchanged; `deeplink:344` needs its `// modal-wait-exempt:` comment in this commit.

**Verify:** `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.crew-actions.spec.ts tests/e2e/published-review-modal.deeplink.spec.ts tests/e2e/published-review-modal.interactions.spec.ts tests/e2e/published-review-modal.realtime.spec.ts tests/e2e/published-review-modal.reopen.spec.ts tests/e2e/published-review-modal.closeFreshness.spec.ts`

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/published-review-modal.crew-actions.spec.ts:48` why=`Task 2 authored the corpus assertion; this group discharges its slice, of which :48 is a live naked goto` ac=AC-2 -->

### Task 4: Adopt — `lifecycle-layout-e2e` family (2 files, 17 sites, 17 edits)

**Files:** `admin-lifecycle-layout.spec.ts` (11 Shape G sites: 249, 362, 475, 603, 704, 785, 829, 915, 969, 1150, 1242), `admin-lifecycle-transitions.spec.ts` (5 Shape G sites: 282, 310, 412, 539 on `pageB`, 604; plus 1 Shape N site at 174).

Shape G here is a mechanical one-for-one replacement of goto-plus-loaded-const-wait. The file-level loaded consts (`admin-lifecycle-layout.spec.ts:59`, `admin-lifecycle-transitions.spec.ts:67`) survive for any other assertion using them.

**The Shape N site is the reload tier, and the guard cannot see it (no `goto`) — do not skip it.** Inside `expectFlipLanded` (`admin-lifecycle-transitions.spec.ts:162`) the `reload` tier does `page.reload()` at line 174 then `expect(modal).toBeVisible({ timeout: 20_000 })` at line 175. That bare wait becomes `awaitReviewModalOrRecover(page, { timeoutMs: 20_000, label: "reload:expectFlipLanded" })`. The `modal` locator the caller passed stays valid; every later `modal.getByTestId("published-toggle")` assertion is untouched. This site is already the path a wedged run takes, which is why it matters more than its single-site weight suggests.

**Verify:** `pnpm heavy pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-layout.spec.ts tests/e2e/admin-lifecycle-transitions.spec.ts`

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/admin-lifecycle-layout.spec.ts:249` why=`Task 2 authored the corpus assertion; this group discharges its slice, of which :249 is a live naked goto` ac=AC-2 -->

### Task 5: Adopt — `crew-e2e` family (3 files, 5 sites, 5 edits)

**Files:** `picker-flow.spec.ts` (398, 431 — Shape U with `gotoOptions: { waitUntil: "networkidle" }`, load-bearing for the post-open clicks), `font-binding.spec.ts` (463 — Shape G, keep the `toHaveCount(1)` after), `alert-action-links.spec.ts` (381 — Shape U preserving `encodeURIComponent`; 345 — Shape N).

**Loop care at `alert-action-links.spec.ts:345`:** the loop navigates several route families; only `/admin?show=` destinations adopt. The `waitUntil: "commit"` navigation and its tolerated `net::ERR_ABORTED` handling are unchanged — the helper's wait goes after the existing `admin-layout` assertion and before the fragment waits. (`admin-layout` is boundary-satisfied and proves nothing; the fragment waits are the class signal.)

**Verify:** `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/picker-flow.spec.ts tests/e2e/font-binding.spec.ts tests/e2e/alert-action-links.spec.ts`

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/picker-flow.spec.ts:398` why=`Task 2 authored the corpus assertion; this group discharges its slice, of which :398 is a live naked goto` ac=AC-2 -->

### Task 6: Adopt — `admin-layout-e2e` + `phantom-gap-e2e` (2 files, 6 sites, 6 edits)

**Files:** `needs-attention-holds.spec.ts` (350 — Shape G, keep `waitForFormAction` after; 335 — Shape N, before the `mi11-*` assertions), `admin-layout-dimensions.spec.ts` (551, 686, 836, 1182 — Shape U with `gotoOptions: { waitUntil: "domcontentloaded" }`; the `reducedMotion` emulation precedes each call untouched, and both content waits stay after).

**Verify:** `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/needs-attention-holds.spec.ts tests/e2e/admin-layout-dimensions.spec.ts`

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/needs-attention-holds.spec.ts:350` why=`Task 2 authored the corpus assertion; this group discharges its slice, of which :350 is a live naked goto` ac=AC-2 -->

### Task 7: Adopt — UNSEEN family (4 files, 7 sites, 7 edits); guard goes GREEN

**Files:** `admin-parse-panel.spec.ts` (249), `dev-capture.spec.ts` (168, 227, 236), `warning-panel-polish.spec.ts` (96, 340), `published-show-attention.spec.ts` (71, inside its local `openModal` at line 69). All Shape G.

`dev-capture`'s `awaitModalHydrated` (line 49) is left byte-unchanged: its now-redundant first wait passes instantly against an already-visible modal, which is how "downstream assertions unchanged" holds literally rather than approximately.

<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this plan -->
**This is the commit where `tests/ci/_metaModalWaitHelper.test.ts` turns green** — zero violations, exactly two pinned exemptions, total disposition satisfied. State the before/after violation counts in the commit message.

<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this plan -->
**Verify:** `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-parse-panel.spec.ts tests/e2e/dev-capture.spec.ts tests/e2e/warning-panel-polish.spec.ts tests/e2e/published-show-attention.spec.ts` then `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts`

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/e2e/dev-capture.spec.ts:168` why=`Task 2 authored the corpus assertion; this final group discharges the last slice, of which :168 is a live naked goto, and the same command goes green on this commit` ac=AC-2,AC-2b,AC-3 -->

### Task 8: Enrol the guard predicate in the source-mutation registry

**Files:** Modify `tests/mutation/source/registry.ts` (one `GuardSurface` row).

Row fields per `tests/mutation/source/registry.ts:12-38`. `control: { from, to }` is a deliberately behavior-changing edit this surface's own suite MUST notice — per-surface, never a literal borrowed from another row.

**Mutation-family closure:** the enumerated operator set in this row IS the closure set the diff review converges against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

Run `pnpm heavy pnpm mutation:guards`; record the score and the unaccepted-survivor set (must be empty) in the commit message and the closeout, **before the first diff-review dispatch**.

<!-- task: red=`pnpm vitest run tests/mutation/source/registry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:1` why=`the registry has no row for the modal-wait predicate module, so the harness never overlays it and the surface has no score` ac=AC-3 -->

### Task 9: Shared collector, thin printer, and the print-before-gate repair in BOTH oracles

<!-- spec-lint: ignore — scripts/lib/infraRecoveryAnnotations.mjs is created by this plan -->
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this plan -->
**Files:** Create `scripts/lib/infraRecoveryAnnotations.mjs`; modify `scripts/check-app-e2e-executed.mjs` and `scripts/check-crew-e2e-executed.mjs`; create `scripts/print-infra-recoveries.mjs`; create its vitest cases.

<!-- spec-lint: ignore — scripts/lib/infraRecoveryAnnotations.mjs is created by this plan -->
- `collect(report)` moves from `scripts/check-app-e2e-executed.mjs:75` verbatim — `tests[].annotations` ONLY, every occurrence (double-count trap documented at `scripts/check-app-e2e-executed.mjs:70-71`). `print(recoveries)` takes over the inline loop at lines 201-203 with byte-identical output.
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this plan -->
- `scripts/print-infra-recoveries.mjs --report <path>` reads a Playwright JSON report, prints via the shared module, and ALWAYS exits 0 — informational, never a gate.
- **Print-before-gate ordering (spec §4.3), applied to BOTH oracles.** Today each gates above its reporting tail (`scripts/check-app-e2e-executed.mjs:189`, `scripts/check-crew-e2e-executed.mjs:165`), so the app oracle's shipped print is already unreachable on a floor shortfall. Restructure each to: compute failures → emit the `ok — …` line when there are none → print recoveries → **`process.exit(1)` as the LAST statement** if there were failures. A `finally` block is NOT the mechanism: `process.exit()` does not run `finally`.
- **Green-run stdout is byte-identical**, so `tests/ci/appE2eAnnotationPrint.test.ts` stays green with its assertions UNEDITED (spec §1.1 pin). The new output appears only on the failing path, where nothing was printed before.

**Tests (red first):** the printer's child-process case (rows from `tests[].annotations` only; exactly-once on the duplicated-location report; the total line). **Plus one behavioral case per gating oracle** against a synthetic report carrying BOTH an `infra-recovery` annotation AND an executed-count floor shortfall, asserting the annotation IS printed and the exit code is still 1. Without these two the ordering rule is asserted nowhere — the printer case exercises an always-zero process and the app-oracle case exercises a successful run.

<!-- task: red=`pnpm vitest run tests/ci/printInfraRecoveries.test.ts` red-state=authored red-target=`scripts/print-infra-recoveries.mjs` why=`the printer does not exist; the path-only red-target declares an absent production file` ac=AC-4 -->

### Task 10: Wire the print duty into every member workflow step

**Files:** `.github/workflows/published-modal-e2e.yml`, `admin-layout-e2e.yml`, `phantom-gap-e2e.yml`, `lifecycle-layout-e2e.yml`.

Apply the transcript table. Every added print step carries `if: always()` — without it the step is prerequisite-gated and a run that recovered then failed downstream skips the print entirely. The three `phantom-gap-e2e.yml` steps get three distinct report paths. `crew-e2e.yml` needs no new step: its oracle gained the duty in Task 9.

**Gate-command discipline — probe, do not assert:** run the printer against a report with zero recoveries and confirm exit 0; against a malformed report and confirm exit 0 with a surfaced message. Confirm `if: always()` cannot convert a red run green (the printer's exit is always 0, and the Playwright step's own status remains the job verdict).

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`.github/workflows/published-modal-e2e.yml:149` why=`the step emits --reporter=list with no json, so no report exists for a print step to read` ac=AC-4,AC-5 -->

## Task 11: Ledger graduation, README row, closeout

- `BACKLOG.md` → `BACKLOG-archive.md` for `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`, recording the census correction (the open-site derivation is the durable form, and closing it as CODE is what four spec rounds bought) and both exclusion classes.
- `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` stays OPEN — it is this arc's filed peer, not its debt.
- The `**Status:** IN PROGRESS · **Branch:** …` marker comes off in the PR's LAST commit, before the merge (AGENTS.md invariant 12) — never in a post-merge turn.
- `docs/superpowers/specs/ci/README.md` index row: already present, verify only. Add the plan's own README row if `docs/superpowers/plans/ci/README.md` indexes plans.
**Discharges AC-6** (ledger graduation + README index row + review-rounds corpus rows). It is
the only AC not named by any `ac=` field, because it is the only one whose task carries no
marker — recorded here so the coverage is complete by statement rather than by omission.

**No task marker, deliberately.** This task is bookkeeping with no red available, and a
fabricated one is worse than none: `tests/docs/_metaInvariant8Closeout.test.ts` already passes
(probed — the plan's inline `impeccable-gate:` line satisfies it), and
`tests/docs/_metaLedgerInProgress.test.ts` passes both before AND after by design, since an
entry that declares nothing is untouched by it. Verify both green after the edits instead.

- Closeout carries `impeccable-gate: N/A — no UI surface`, the mutation score from Task 8, and the review-round corpus rows.


## Task 12: Adversarial review (cross-model)

Whole-diff Codex review via `node scripts/codex-guard.mjs review --stage diff --round <n>`, iterating to APPROVE. **Split tight-scope reviews are the default at this diff size** (AGENTS.md): dispatch per surface — (a) helper + guard predicate, (b) adoption, (c) collector/printer/oracles/workflows — with each brief's file list inlined.

Every brief carries: REVIEWER ONLY; spec §6's consequence bound, PROBE DOMAIN and threat fence; the do-not-relitigate list from spec §1.1; and — because the predicate is registry-enrolled — **the Task 8 mutation score plus the empty unaccepted-survivor set as the convergence criterion**, with "the guard does not pin what it claims" admissible ONLY with a surviving mutant from the declared operator set.

Carry forward the spec arc's fenced repairs so they are not re-derived: the census is closed as code with non-normative tables; there is no `readySelector`; AC-1 asserts locator cardinality, not branch execution; the gating exit is the last statement by construction.

## Task 13: Execution handoff

Push, real CI green (not just local — AGENTS.md treats CI-green as a separate gate), `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

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
- Acceptance criteria are spec §5's. Each task's `ac=` names the ones it discharges: **AC-1** helper surface; **AC-2** all 51 member sites adopted; **AC-2b** the executable candidate enumeration + total disposition; **AC-2b-pattern** one shared route-pattern constant; **AC-3** guard + mutation enrolment; **AC-4** collector, printer, oracle print duties, workflow wiring; **AC-5** no gating change; **AC-6** ledger + README + corpus. AC-1 through AC-5 are each named by an `ac=` field on a Task 1-10 marker; **AC-6 is discharged by Task 12**, which sits outside the red-contract region (bookkeeping-and-merge tail, not a TDD unit) and so states its discharge in prose along with the red-then-green it must still observe.

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
| 3 — published-modal family | 16 | 14 |
| 4 — lifecycle-layout family | 17 | 17 |
| 5 — crew-e2e family | 5 | 5 |
| 6 — admin-layout + phantom-gap | 6 | 6 |
| 7 — UNSEEN family | 7 | 7 |
| **total** | **51** | **49** |

Two effects separate sites from edits, pulling opposite ways: `published-review-modal.reopen.spec.ts`'s four row clicks all reach one wait wrapper (one edit, four sites, −3), and `published-review-modal.interactions.spec.ts:506` (`openGated`) is ONE click site whose loaded-modal wait lives in BOTH callers after `release()`, at line 529 and line 550 — its own wait at line 508 is the skeleton panel while the gate is still held, so it is not the wait to replace (+1). Both effects fall inside Task 3, which is why that task alone diverges: 16 − 3 + 1 = **14 edits**, and 14 + 17 + 5 + 6 + 7 = **49**, matching the spec's total. Plan review R1 finding 2 caught this row reading 15, which made the column sum to 50 against a stated 49 — the arithmetic is spelled out here so the two cannot drift apart again.

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

**Marker-command project sweep** (run 2026-08-16, after plan review R3/R4 both landed on this):
every `red=` command in this plan was checked against `vitest.projects.ts` for project
restriction, and each resolves under the DEFAULT projects: the helper unit suite, the new
modal-wait meta-test, `tests/mutation/_metaPremiseContract.test.ts`, the new printer suite, and
`tests/ci/_metaE2eWorkflowCoverage.test.ts`. The only mutation-project-only suite this plan touches is
`tests/mutation/guardSurfaces.gate.test.ts` (`vitest.projects.ts:87`, `vitest.projects.ts:91`),
and it appears in NO marker — it is verified by its own
`VITEST_INCLUDE_MUTATION_HARNESS=1 … --project mutation` command in Task 8's body. Collection
was confirmed by running two of them: the helper unit suite collects 3 tests and
`tests/ci/appE2eAnnotationPrint.test.ts` collects 1, so the `tests/e2e/**` and `tests/ci/**`
paths are both live under vitest.

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

<!-- spec-lint: ignore — tests/ci/modalWaitHelper/scan.ts is created by this plan -->
- Create: `tests/ci/modalWaitHelper/scan.ts` — the predicate module (importable; exports the
  route-pattern constant, the violation scan, and the candidate enumeration). The path is named
  here, not left to the executor, because Task 8's registry row cites it as `sourcePath` and
  plan review R1 finding 4 caught that dependency dangling.
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

### Task 3: Adopt — `published-modal-e2e` family (6 files, 16 sites, 14 edits)

**Files:** `published-review-modal.crew-actions.spec.ts` (1), `tests/e2e/published-review-modal.deeplink.spec.ts` (3: 120, 239, 257), `tests/e2e/published-review-modal.interactions.spec.ts` (5: 103, 389, 255, 355, 506), `tests/e2e/published-review-modal.realtime.spec.ts` (2: 321, 789), `tests/e2e/published-review-modal.reopen.spec.ts` (4 click sites, 1 edit at its wrapper line 65), `tests/e2e/published-review-modal.closeFreshness.spec.ts` (1 click site, 1 edit at its wrapper line 54).

**Shapes:** G at crew-actions:48, realtime:321, interactions:389. U at deeplink:120 (its local `openModal` delegates) and interactions:103 (the `opts.url ??` branch). N at deeplink:239/:257 (after their `waitForURL`), interactions:255/355/506, realtime:789, reopen:65, closeFreshness:54.

**`openGated` takes TWO edits for ONE site:** its loaded wait lives in both callers after `release()`, at line 529 and line 550. Its own line 508 wait is the skeleton panel while the gate is held — not the wait to replace.

**Two sites here are deliberately NOT adopted.** `deeplink:344` and `realtime:913` wait on `MODAL_ANY`, which the skeleton also matches, so the helper would return on the skeleton and hide the fault (spec §2.5, limit 3b, `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES`). Leave both byte-unchanged. **BOTH pinned exemption comments land in this commit** — line 344
(the skeleton-tolerant member) AND line 298 (the unknown-slug non-member, which is a naked
`goto` of the route and is flagged by the guard exactly like any other). Task 7's zero-violation
claim is false without both, and no later task touches this file.

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

**Files:** Modify `tests/mutation/source/registry.ts` (one `GuardSurface` row), `tests/mutation/guardSurfaces.gate.test.ts` (its `EXPECTED_LEDGER_KINDS` key), and `tests/mutation/_metaPremiseContract.test.ts` (its `EXPECTED_ENV_TOUCHING` key).

**Enrollment is a THREE-registry edit, and that is what makes this task's red observable** (plan review R2 findings 1 and 2). The mutation registry is opt-in with no discovery (`tests/mutation/source/registry.ts:8-10`) and `tests/mutation/_metaGuardSurfaceRegistry.test.ts` only iterates existing rows, so adding nothing keeps it green — the earlier marker's red half was impossible. But two companion registries are EXACT: `tests/mutation/guardSurfaces.gate.test.ts:150-154` asserts `EXPECTED_LEDGER_KINDS`' keys equal the surface ids, and `tests/mutation/_metaPremiseContract.test.ts:137-142` asserts `EXPECTED_ENV_TOUCHING`' keys equal the enrolled suites. **The two arms live in DIFFERENT vitest projects, so they are two commands, not one** (plan review R3 finding 1). `tests/mutation/guardSurfaces.gate.test.ts` is mutation-project-only — excluded from the default projects (`vitest.projects.ts:87`, `vitest.projects.ts:91`) and reachable only with `VITEST_INCLUDE_MUTATION_HARNESS=1 … --project mutation`, which is why the repo-root package.json `mutation:guards` script spells it that way. `tests/mutation/_metaPremiseContract.test.ts` is in the default projects.

So the observable cycle on the MARKER command is the premise-contract arm: add the `GuardSurface` row → `_metaPremiseContract` reds on `EXPECTED_ENV_TOUCHING` key equality → add the key → green. Do the row first and observe that red; that ordering IS the TDD step.

The ledger-kinds arm is verified separately, and its key MUST land before the mutation run or that run cannot green:

```
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation \
  tests/mutation/guardSurfaces.gate.test.ts
```

Record both arms' before/after in the commit message, since only one of them is the marker's.

Row fields per `tests/mutation/source/registry.ts:12-38`:

- `id`: `modal-wait-helper-scan`
<!-- spec-lint: ignore — tests/ci/modalWaitHelper/scan.ts is created by this plan -->
- `sourcePath`: `tests/ci/modalWaitHelper/scan.ts` (created in Task 2)
- `suitePaths`: a one-element array naming the Task 2 suite
- `operators`: **all six declared families** — `relational-boundary`, `equality-flip`,
  `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`
  (`tests/mutation/source/operators.ts:17-24`). Enrolling the full set is the honest default: a
  narrowed subset is a claim about which mutations cannot escape, and this surface has no
  evidence for one. **Do NOT claim all six are exercised.** Plan review R2 finding 3 probed the
  earlier draft's liveness claim and refuted it: `regex-quantifier-bound` recognizes only
  bounded `{m,n}` syntax (`tests/mutation/source/operators.ts:157-164`), and the route pattern
  uses `*`, so it yields ZERO sites here. The gate checks only that the surface produces some
  mutants, never one per declared family, so a claimed-live family can exercise nothing while
  the score and the empty survivor set both look healthy. **The first `pnpm mutation:guards` run
  therefore reports per-family site counts, and every family yielding zero sites on this surface
  is recorded in the closeout as not-exercised** — an accepted limit someone has to re-state,
  never a coverage claim nobody checked.
- `scoreFloor`: set from the first real run, never guessed.
- `control: { from, to }`: a deliberately behavior-changing edit this surface's own suite MUST
  notice — per-surface, never a literal borrowed from another row (the registry header at
  `tests/mutation/source/registry.ts:22-36` records why: an earlier version hardcoded a literal
  that existed in only one file, so enrolling a second surface redded the gate).
- `accepted`: `[]` at authoring; any row added later carries its backlog ref.

**Mutation-family closure is therefore declared UP FRONT, per `docs/agents/writing-plans.md:30`**
— plan review R1 finding 4 caught the earlier draft claiming an enumerated operator set as the
closure criterion while enumerating nothing.

**Mutation-family closure:** the enumerated operator set in this row IS the closure set the diff review converges against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

Run `pnpm heavy pnpm mutation:guards`; record the score and the unaccepted-survivor set (must be empty) in the commit message and the closeout, **before the first diff-review dispatch**.

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:141` why=`EXPECTED_ENV_TOUCHING at :141 asserts exact key equality against the suites GUARD_SURFACES enrols, so adding this task's registry row reds it until the new suite declares its key; the ledger-kinds arm is mutation-project-only and is verified by its own command in the task body, never by this one` ac=AC-3 -->

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

**Files:** `.github/workflows/published-modal-e2e.yml`, `.github/workflows/admin-layout-e2e.yml`, `.github/workflows/phantom-gap-e2e.yml`, `.github/workflows/lifecycle-layout-e2e.yml`, `.github/workflows/crew-e2e.yml`, and `tests/ci/_workflowCoverageScan.ts`.

Apply the transcript table. Every added print step carries `if: always()` — without it the step is prerequisite-gated and a run that recovered then failed downstream skips the print entirely. The three `phantom-gap-e2e.yml` steps get three distinct report paths.

**`crew-e2e.yml` DOES need an edit** (plan review R1 finding 6). Task 9 moves the print above the oracle's INTERNAL gate, which is necessary but not sufficient: the oracle step itself (`.github/workflows/crew-e2e.yml:194-195`) has no `if: always()`, so on a recovered-then-failed run GitHub skips the step entirely and the internal ordering never executes. Add `if: always()` to that step. Its `run:` line, its file list, and its gating semantics are untouched — the oracle still exits 1 on a floor shortfall, which is why this does not convert a red run green.

**The env-key registry must move with the workflows** (plan review R1 finding 5). New `PLAYWRIGHT_JSON_OUTPUT_NAME` values are gated by `ENV_KEY_ALLOWLIST` (`tests/ci/_workflowCoverageScan.ts:724`), and `tests/ci/_metaE2eWorkflowCoverage.test.ts` rejects every unreviewed live pair. Each new report path added above is registered there in THIS commit with its one-line rationale, or the meta-test reds for unreviewed environment values and the task's own command can never return green.

**What this task's red does and does not cover.** The marker's red is the env-allowlist arm: `tests/ci/_metaE2eWorkflowCoverage.test.ts` carries no assertion about JSON reporters, recovery printers, or `if: always()` — plan review R3 finding 2 probed that and it is correct. The wiring half of AC-4 is therefore verified by the enumerated probes below, not machine-checked, which is exactly spec documented limit 8 ("recovery-print coverage is workflow-step-enumerated, not workflow-structural"). Do NOT add a workflow-parser guard to close it: the spec declined that trade explicitly, and a wider recognizer is the ratchet this arc spent seven spec rounds avoiding.

**Gate-command discipline — probe, do not assert:** run the printer against a report with zero recoveries and confirm exit 0; against a malformed report and confirm exit 0 with a surfaced message. Confirm `if: always()` cannot convert a red run green (the printer's exit is always 0, and the Playwright step's own status remains the job verdict).

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`tests/ci/_workflowCoverageScan.ts:724` why=`ENV_KEY_ALLOWLIST at :724 does not list the new PLAYWRIGHT_JSON_OUTPUT_NAME values this task introduces, so the suite reds on unreviewed live env pairs until each is registered with its rationale` ac=AC-4,AC-5 -->

## Task 11: Adversarial review (cross-model)

**Split tight-scope reviews are the default at this diff size** (AGENTS.md): dispatch per surface — (a) helper + guard predicate, (b) adoption, (c) collector/printer/oracles/workflows — with each brief's file list inlined.

Each dispatch is launched BACKGROUNDED with every required flag. Plan review R2 finding 4 probed the earlier draft's abbreviated form and it exits 2 before reviewing (`--brief`, `--cwd` and `--out` are all required, `scripts/codex-guard.mjs:151-153`):

```
node scripts/codex-guard.mjs review \
  --brief <brief-file> \
  --cwd /Users/ericweiss/FX-worktrees/modal-wait-helper-adoption \
  --out <fresh-timestamped-dir> \
  --stage diff --round <n>
```

Read the dispatch's result.json on completion; `no_verdict` is an infra fault, not a finding set. Iterate to APPROVE.

Every brief carries: REVIEWER ONLY; spec §6's consequence bound, PROBE DOMAIN and threat fence; the do-not-relitigate list from spec §1.1; and — because the predicate is registry-enrolled — **the Task 8 mutation score plus the empty unaccepted-survivor set as the convergence criterion**, with "the guard does not pin what it claims" admissible ONLY with a surviving mutant from the declared operator set, plus the per-family site counts so a zero-site family is not mistaken for coverage.

Carry forward the spec arc's fenced repairs so they are not re-derived: the census is closed as code with non-normative tables; there is no `readySelector`; AC-1 asserts locator cardinality, not branch execution; the gating exit is the last statement by construction.

## Task 12: Final commit — ledger graduation, README row, closeout, corpus rows, marker removal

- `BACKLOG.md` → `BACKLOG-archive.md` for `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`, recording the census correction (the open-site derivation is the durable form, and closing it as CODE is what four spec rounds bought) and both exclusion classes.
- `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` stays OPEN — it is this arc's filed peer, not its debt.
- The `**Status:** IN PROGRESS · **Branch:** …` marker comes off in the PR's LAST commit, before the merge (AGENTS.md invariant 12) — never in a post-merge turn.
- Both README index rows are ALREADY PRESENT — `docs/superpowers/specs/ci/README.md` for the spec and `docs/superpowers/plans/ci/README.md` for this plan (added when the plan was authored). **Verify only; adding them again duplicates the rows** (plan review R3 finding 3).
**Discharges AC-6.** It carries no task marker because it sits outside the red-contract region (it is the branch's bookkeeping-and-merge tail, not a TDD unit), so the discharge is stated here rather than in an `ac=` field. The red-then-green is still real and MUST be observed: add the `BACKLOG_GRADUATED` row while the entry is still in `BACKLOG.md` and `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` goes RED (the registry asserts every registered id is archive-only); the archive move in the same commit turns it GREEN.

**This task DOES have a red, and plan review R1 finding 7 is why it is here.** The earlier
draft declared no red available, having probed only the invariant-8 and in-progress gates —
both of which pass on either side, the first because the plan's inline `impeccable-gate:` line
already satisfies it and the second because an entry that declares nothing is untouched by it.
Neither establishes graduation. `tests/docs/_metaDeferralLedgerGraduation.test.ts` carries a
`BACKLOG_GRADUATED` registry (`tests/docs/_metaDeferralLedgerGraduation.test.ts:99`) that
asserts every registered id is archive-only, and without a row there the graduation contract is
bypassed while AC-6 reads complete. Add the row — id
`BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`, provenance `test/modal-wait-helper-adoption`, with
the comment recording what the arc actually settled (the census closed as code, not the
two-grep sweep the entry proposed) — in the SAME commit as the archive move.

- **The closeout destination is a `## Closeout` section appended to THIS plan file** — the in-plan form invariant 8 allows for a flat plan. Plan review R3 finding 3 caught that the earlier text required "the closeout" without naming a file or section, leaving a separate executor no declared place to put the evidence. It carries: `impeccable-gate: N/A — no UI surface`; the Task 8 mutation score with its unaccepted-survivor set and the per-family site counts (including every zero-site family, recorded as not-exercised); the review-round tallies for both stages; and the dispositions of any findings deferred rather than fixed.
- Verify green after the edits: `tests/docs/_metaDeferralLedgerGraduation.test.ts`,
  `tests/docs/_metaLedgerInProgress.test.ts`, `tests/docs/_metaInvariant8Closeout.test.ts`,
  `tests/docs/_metaReviewRoundEconomy.test.ts`.


**This task runs AFTER Task 11 and is the branch's LAST commit** (plan review R2 finding 5). The earlier ordering was impossible: `scripts/codex-guard.mjs` appends a tracked JSONL row under `docs/review-rounds/` keyed by branch and base sha at every dispatch, so any review in Task 11 dirties the tree after a "final" bookkeeping commit. This branch demonstrates it — the round-1 repair commit carries that very file.

So this task commits, together and last: the ledger graduation, the README row, the closeout, **every review-round corpus row including the ones Task 11's own dispatches emitted**, and the `**Status:** IN PROGRESS · **Branch:** …` marker removal (AGENTS.md invariant 12 — the marker comes off in the PR's last commit, never in a post-merge turn).

**Why the regress terminates here, stated so nobody re-opens it:** committing Task 11's corpus rows is itself a tree change the final review did not examine, and reviewing THAT would emit another row. It terminates because those rows are wrapper-emitted telemetry ABOUT the reviews — a JSONL line recording stage, round, verdict and finding count — not design a reviewer could hold an opinion on. The reviewable diff is what Task 11 approved; this commit adds bookkeeping over it. Re-run `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` here so the corpus and its filing stay consistent at the merged state.

## Task 13: Execution handoff

Push, real CI green (not just local — AGENTS.md treats CI-green as a separate gate), `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

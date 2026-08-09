<!-- spec-lint: not-ui — CI workflow YAML + e2e test wiring + docs only; app/ paths appear as route-liveness evidence, not UI deliverables. impeccable-gate: N/A — no UI surface. -->

# app-e2e batch 1 — wire nine app-dependent e2e specs into a PR workflow

**Date:** 2026-08-09 · **Ledger:** `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (stays OPEN; this arc lands batch 1 of its incremental promotion path) · **Branch:** `ci/app-e2e-batch1`

## 1. Problem

The `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts` (`LOCAL_ONLY_ALLOWLIST`, the rows bound to the `UNSEEN` reason string) are e2e specs no CI workflow names: they exist, match a Playwright `testMatch`, and prove nothing on any PR. After PR #743 (`test/resurrect-mobile-safari-e2e`) the population is **32** (its `BACKLOG.md` census restatement, counted from the allowlist). This arc wires the cheapest nine into one new always-on PR workflow and deletes their allowlist rows, moving the census to 23.

## 1.1 Resolved scope — do not relitigate

- **Batch 1 only.** The entry's promotion path is incremental by design (`BACKLOG.md` § `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK`, "land green batches one at a time"). C-tier auth-heavy leftovers, D-tier cold-build/:3004/screenshot specs, and required-set promotion (an owner GitHub-settings action, not repo code — same section) are all out of scope. User ratified batch-1-only scope 2026-08-09 (this session).
- **New workflow, not an extension of `lifecycle-layout-e2e.yml`.** Ratified 2026-08-09 after an explicit CI-cost trade discussion: +~10-15 runner-minutes per PR accepted for flake isolation from the already-wired lifecycle gate. Do not propose folding the batch into an existing job.
- **`onboarding-wizard-step1.spec.ts` is excluded, not deferred by laziness.** It asserts `[data-testid=onboarding-wizard]` on `/admin`, but `supabase/seed.ts` sets `app_settings.watched_folder_id`, and `app/admin/page.tsx` (precedence 3, the `watched_folder_id` branch) then renders the dashboard. Deterministic failure on any seeded DB, and its required state is mutually exclusive with `admin-changes-feed-layout.spec.ts`'s. Wiring it needs a seed-state redesign — its own arc.
- **`right-now-transitions.spec.ts` is owned by PR #743's filing** (`BL-RIGHTNOW-SECTION57-FIXTURE-INERT`): its fixture proved inert against the migrated route. Not this batch's question.
- **Sequencing on PR #743.** This arc is specced against post-#743 state (census 32; nine M4 tile specs deleted; `crew-page`/`theme-toggle` wired into `crew-e2e.yml`). Implementation starts by rebasing/merging `origin/main` AFTER #743 merges. If #743 is abandoned instead, this spec's census numbers and the §5 ledger edit are re-derived before implementation — the nine batch members and the workflow design are unaffected either way (none of the nine is touched by #743's diff).
- **R1 triage note (recorded so later rounds do not re-derive it).** R1 finding 2 targeted an aggregate-total oracle floor that the committed spec had already replaced before the verdict returned (the pre-repair text was in the reviewer's read window): §3's oracle and AC-5 are per-spec `executed >= min` floors from a real run's report, the exact posture the finding demanded. No further change from that finding.
- **Advisory posture accepted.** No e2e context is in the branch-protection required set (measured 2026-07-26, twelve contexts, none e2e — `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5). Enforcement is the ship pipeline's all-checks-green procedural gate. Promotion to the required set is an owner action tracked in the ledger entry, not here.

## 2. The batch

Nine specs, all verified live on 2026-08-09 by full-file read: zero `test.skip`/`describe.skip`/`fixme`/project-name early returns, zero `toHaveScreenshot`, zero `waitForTimeout`, all navigated routes have live `page.tsx` files (`/` deliberately has none — `next.config.ts` `redirects()` 307s `/` → `/auth/sign-in?next=/admin`, which is exactly what `root-landing.spec.ts` asserts).

| Spec (`tests/e2e/`) | Projects resolving it | Auth | Data |
| --- | --- | --- | --- |
| `sample.spec.ts` | both | none | none |
| `root-landing.spec.ts` | both | ADMIN + NON_ADMIN_CREW | none |
| `admin-layout.spec.ts` | both | ADMIN | none (needs `ADMIN_DEV_PANEL_ENABLED=true`, which the :3000 CI server command sets — `playwright.config.ts`, `webServer` block for the baseline port) |
| `admin-phase2-surfaces.spec.ts` | mobile-safari | ADMIN | none; state-tolerant (passes on wizard or dashboard) |
| `notify-toggles.spec.ts` | both | ADMIN | writes `app_settings.alert_on_sync_problems` (§4 repair) |
| `help-pages.spec.ts` | mobile-safari | ADMIN | none (§4 repair for the route-coverage guard) |
| `me-page.spec.ts` | both | NON_ADMIN_CREW | fully self-seeded `shows`/`crew_members` via `supabaseAdmin`, symmetric cleanup (§4 repair for wall-clock dates) |
| `report-modal.spec.ts` | both | ADMIN | seed-dependent read-only (Waldorf show + auto-minted `show_share_tokens` row); `/api/report` fully `page.route()`-mocked |
| `admin-changes-feed-layout.spec.ts` | both | ADMIN | seed-dependent + self-seeded `show_change_log`/`sync_holds` marker rows, cleaned in `beforeAll`/`afterAll` |

"Projects resolving it" is a resolution from the `testMatch` regexes of `mobile-safari` and `desktop-chromium` in `playwright.config.ts` — re-derive with `--list` at implementation time rather than trusting this table (the `crew-e2e.yml` header comment ratifies exactly this posture for its own list).

Estimated ~74 test executions (per-spec counts × resolving projects, from the 2026-08-09 verification read), 6–10 min spec runtime on top of the build/bootstrap floor.

<!-- spec-lint: ignore — .github/workflows/app-e2e.yml is created by this spec's implementation; not yet tracked -->
## 3. Workflow: `.github/workflows/app-e2e.yml`

Cloned from the scanner-clean template `lifecycle-layout-e2e.yml` (bare `pull_request:` trigger — the property that makes its specs count as covered — plus `workflow_dispatch`):

- **Triggers:** `pull_request:` with NO filters of any kind (no `paths`, `paths-ignore`, `types`, `branches` — any configuration under `pull_request` voids coverage per the scanner's bare-only rule, `tests/ci/_workflowCoverageScan.ts`, R24 fixture block in `_metaE2eWorkflowCoverage.test.ts`), plus bare `workflow_dispatch:` for the §6 measurement loop.
- **Job:** single job, `runs-on: ubuntu-latest`, `timeout-minutes: 30`, concurrency group with `cancel-in-progress` on PRs. No `if:`, no `continue-on-error:` anywhere on the job or the run step (scanner refusals).
- **Env (job-level):** copied verbatim from `lifecycle-layout-e2e.yml`'s job env — the local-Supabase demo key set, `JWT_SIGNING_SECRET`, `HASH_FOR_LOG_PEPPER`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ENABLE_TEST_AUTH`, `TEST_AUTH_SECRET`, `PICKER_COOKIE_SIGNING_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_REALTIME_ISS`, and `BASELINE_SERVER_ONLY: "1"` (boots only the :3000 server; alias of `CREW_E2E_ONLY` accepted at `playwright.config.ts` server-filter block). **Every (key, value) pair must byte-match an existing `ENV_KEY_ALLOWLIST` row** (`tests/ci/_workflowCoverageScan.ts`, `ENV_KEY_ALLOWLIST`) — the scan fails closed on novel pairs. Two registry consequences, both landed in the same commit as the workflow (spec R1 finding 1):
  - **`governs` extension on every reused pair.** Each allowlist row's `values[].governs` is the SORTED list of spec paths the pair currently governs, and the hygiene suite asserts set EQUALITY against a fresh derivation (`_workflowCoverageScan.ts` doc block, spec §7 R3). An unfiltered workflow whose env scope covers a claiming run step makes every reused pair govern all nine batch specs — the R1 probe measured 17 pairs picking up governance. Implementation therefore extends the `governs` arrays of every affected (key, value) row with the nine batch spec paths; the authoritative pair set and paths come from running the hygiene assertions and pasting their fresh-derivation output, never from this prose (the 17-pair count is the R1 probe's, to be re-derived at implementation time).
  - **One NEW value row.** The step-level `PLAYWRIGHT_JSON_OUTPUT_NAME` must point at this job's own report (the oracle reads the run's own artifact), and a distinct path (e.g. test-results/app-e2e-report.json, final name fixed at implementation) is a NOVEL value text for that key — fails closed until a value row is added under the existing key with `governs` = the nine batch specs and the key's existing inert-output-path rationale. Reusing the crew value text to dodge the registry edit is forbidden: two jobs writing one report path is exactly the artifact confusion the "run's own report" rule exists to prevent.
- **Steps** (same chain as the template): checkout → `./.github/actions/setup` → `supabase/setup-cli@v1` pinned to the same version the sibling workflows pin → psql install → `bash scripts/ci/supabase-local-bootstrap.sh` → `pnpm db:seed` → Playwright browser cache keyed on `pnpm-lock.yaml` → `playwright install-deps chromium webkit` + `install chromium webkit` → ONE run step → executed-count oracle step → failure-artifact upload (`if: failure() || github.event_name == 'workflow_dispatch'` on the upload step only — a diagnostic `if:` on a sibling step does not disqualify coverage, pinned by the R1 scanner self-test).
- **Run step:** one invocation, both projects, named spec paths in command position:

  ```
  pnpm exec playwright test tests/e2e/sample.spec.ts tests/e2e/root-landing.spec.ts tests/e2e/admin-layout.spec.ts tests/e2e/admin-phase2-surfaces.spec.ts tests/e2e/notify-toggles.spec.ts tests/e2e/help-pages.spec.ts tests/e2e/me-page.spec.ts tests/e2e/report-modal.spec.ts tests/e2e/admin-changes-feed-layout.spec.ts --project=mobile-safari --project=desktop-chromium --reporter=list,json
  ```

  One invocation because each Playwright process cold-builds and owns its webServer (`pnpm build && pnpm start` in CI — `playwright.config.ts` baseline `webServer` command); per-project or per-spec steps would pay that cost repeatedly (the `crew-e2e.yml` run-step comment ratifies this). Each project's `testMatch` claims its own subset of the named files.
<!-- spec-lint: ignore — scripts/check-app-e2e-executed.mjs is created by this spec's implementation; not yet tracked -->
- **Vacuity oracle:** a post-run step invoking a NEW sibling script (working name `scripts/check-app-e2e-executed.mjs`, same shape as `scripts/check-crew-e2e-executed.mjs`: reads the run's own JSON report, per-spec `executed >= min` floor map). The crew script is not reusable — its `REQUIRED` map is a hardcoded module constant keyed to the crew-e2e specs. Per the derivation rule its #743 additions ratify in-file, every count in the new map is derived from an ACTUAL run's report (summed over the projects each spec resolves under), never from arithmetic. The JSON report path goes through step-level `PLAYWRIGHT_JSON_OUTPUT_NAME` (already-allowlisted env pair).

## 4. Mandated pre-wiring test repairs (same branch, before the workflow lands)

Class-sweep discipline: these are defects the wiring would convert from latent to flaky-in-CI, so they are repaired in-branch, not filed.

1. **`notify-toggles.spec.ts` — restore what it flips.** The dispatch test flips `app_settings.alert_on_sync_problems` and never restores it; the spec runs under BOTH projects, so post-job state depends on execution parity and any later same-job reader sees an ordering-dependent value. Repair: snapshot the value in `beforeAll`, restore in `afterAll` (the `admin-changes-feed-layout.spec.ts` snapshot/cleanup shape is the in-tree template).
2. **`me-page.spec.ts` — derive dates from the clock.** The multi-show partition test hardcodes 2026-04-10 / 2026-09-15 around an assumed "today" — a date bomb that starts failing after 2026-09-15, inside a job whose acceptance bar is five consecutive greens. Repair: derive past/future dates relative to `Date.now()` (offsets, not literals).
3. **`help-pages.spec.ts` — un-tautologize the route-coverage guard.** `app/help/_nav.ts` now carries 14 entries; the spec's "covers all 13" guard asserts `HELP_ROUTES.length` against itself, so the drift (uncovered `/help/admin/settings`) is invisible. Repair: derive the route list from the `_nav.ts` export (assert against the data source, not the copy — the anti-tautology rule), which both fixes the count and adds the missing page to coverage.

Each repair is TDD-shaped: the strengthened assertion (or a probe of the current defect) goes red first where the harness allows it.

## 5. Bookkeeping (same PR)

- **Allowlist:** delete the nine wired rows from `LOCAL_ONLY_ALLOWLIST` in `tests/ci/_metaE2eWorkflowCoverage.test.ts` — forced by its shadowing assertion ("allowlisted specs that ARE covered - remove the row") in the same commit the workflow lands, and the meta-test run is the structural proof of wiring. The same commit carries the §3 `ENV_KEY_ALLOWLIST` governance extensions and the new `PLAYWRIGHT_JSON_OUTPUT_NAME` value row — the governance-equality hygiene assertions red otherwise.
- **Ledger:** update `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` in `BACKLOG.md` on top of #743's restated census: record batch 1 (nine specs, workflow name, date), restate `UNSEEN` 32 → 23, note `onboarding-wizard-step1`'s exclusion reason (§1.1) so the next batch doesn't re-derive it. Entry stays OPEN. The `**Status:** IN PROGRESS · **Branch:** ci/app-e2e-batch1` marker comes off in the PR's last commit (invariant 12).
- **Closeout marker:** `impeccable-gate: N/A — no UI surface` (workflow YAML, test files, docs only — nothing under `app/` or `components/`).

## 6. Acceptance (AC)

- **AC-1:** the new workflow file exists with a bare `pull_request` trigger and the §3 anatomy; `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` passes with the nine rows deleted (scan reports them covered; no stale/shadowing rows; governance-equality and pair-hygiene assertions green with the §3 registry edits in place).
- **AC-2:** The three §4 repairs are landed, each with its strengthened assertion.
- **AC-3 (the bar):** **Five consecutive green runs of the new workflow's `pull_request` job on the PR**, zero retries, before merge — the acceptance-count precedent is `lifecycle-layout-e2e.yml`'s five-green bar (ci-dark design §6.1 amendment / AC-6). Run links recorded in the PR body. *Amended at plan R2 (2026-08-09): the bar was first written as five `workflow_dispatch` runs on the branch, but GitHub only exposes `workflow_dispatch` for workflows already on the DEFAULT branch — a NEW workflow cannot be dispatched pre-merge. `pull_request`-triggered runs are the replacement evidence, and the stronger one: they exercise the exact trigger the wiring claims. The PR is opened before the measurement loop; runs are serialized (the concurrency group cancels a superseded run, so each push waits for the prior run's completion), and re-triggers between content pushes use empty commits. The `workflow_dispatch:` trigger stays in the YAML for post-merge reruns.*
- **AC-4 (pre-ratified fallback):** any spec that cannot clear AC-3 is dropped from the run command, its allowlist row restored with a recorded flake reason, and the ledger census adjusted — "an admitted flake is worse than a known gap" (ci-dark design, pre-ratified fallback). The batch does not hold the arc hostage.
- **AC-5:** Executed-count oracle fails the job if any batch spec's executed count drops below its floor; floors are measured from a real run's JSON report at wiring time (never `--list` arithmetic — `--list` cannot see runtime skips, the exact blindness the oracle exists to close).
- **AC-6:** Real CI green on the PR itself (all workflows), then merge; local green is not sufficient (local-passes-CI-fails is its own bug class).

## 7. Documented limits

- The job is advisory at the GitHub layer (§1.1). A red `app-e2e` blocks merge only procedurally.
- Three batch specs hardcode port-3000 URL literals (`root-landing`, `help-pages`, `me-page`): correct in CI (default `E2E_PORT`), breaks only the local sibling-worktree `E2E_PORT` escape hatch — pre-existing, unchanged by this arc, and shared with other specs; a port-literal class sweep is not this arc's scope.
- `signInAs` deletes/recreates fixture `auth.users` rows per call, so batch specs must stay serialized (root config sets `fullyParallel: false` and `workers: 1` — `playwright.config.ts`, both near the config head; the design adds no parallelism).
- The +~10-15 runner-minutes/PR cost (second cold build + Supabase bootstrap) was accepted at the placement decision (§1.1). Wall-clock impact bounded by existing slowest job unless the account's concurrent-runner pool saturates.

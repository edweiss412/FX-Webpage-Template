<!-- spec-lint: not-ui — CI workflow YAML + e2e test wiring + docs only; app/ paths appear as route-liveness evidence, not UI deliverables. impeccable-gate: N/A — no UI surface. -->

# app-e2e batch 2 — wire the next green set of app-dependent e2e specs into `app-e2e.yml`

**Date:** 2026-08-21 · **Ledger:** `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (`BACKLOG.md:687`; stays OPEN, this is batch 2 of its incremental promotion path) · **Branch:** `ci/app-e2e-batch2` · **Predecessor:** `docs/superpowers/specs/ci/2026-08-09-app-e2e-batch1-design.md` (inherited unless a section here argues otherwise) · **Probe record:** `docs/superpowers/specs/ci/probes/2026-08-21-app-e2e-batch2-membership-probe.md`

## 0. Bound, domain, fence, criterion

These four lines are quoted byte-identical into every review brief for this arc. Repair them HERE, then re-quote; never patch a brief alone.

**CONSEQUENCE BOUND:** every candidate is wired correctly or signaled, never silently wrong. Concretely: every spec this batch names in `app-e2e.yml` either executes every one of its resolved (case x project) identities on every `pull_request` run and reports them through the executed-count oracle, or it is NOT in the batch: its `UNSEEN` allowlist row stays, and the reason is recorded from a run. No spec is counted as covered while executing nothing, and no spec is dropped or kept on a reading alone. A spec that is red for an APP defect is deferred with its own ledger row, never repaired here. A conservative outcome with a surfaced reason (a candidate left on the allowlist with its run line) is a documented limit, not a finding.

**PROBE DOMAIN:** the `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts` (the 23 listed in section 2, derived by the command printed there) plus the batch's own real-run records in the probe record. A finding about a spec outside that set, or about a run this arc did not take, files to documented limits, not to a round.

**THREAT FENCE:** accidental wiring drift by an ordinary contributor: a spec named in the run step without an oracle row, a floor that goes stale as a spec gains cases, a narrowing flag on the run command, a filter key under `pull_request`, a row left on the allowlist after the spec became covered. Adversarial workflow edits, and GitHub-side enforcement (the required-context set), are out of scope; the second is an owner action named in section 1.1.

**CLOSED CRITERION:** each batch member is green on five consecutive normal-dispatch `pull_request` runs of `app-e2e.yml` at `--retries=0`, carries an executed-count oracle row equal to its live Playwright resolution, has its `UNSEEN` allowlist row deleted, and the census in section 2 is restated by the same commands in the ledger row in the same PR. When every member satisfies that and the reviewer finds nothing admissible inside the probe domain, the review is converged.

**Enrolment (convergence bullet 4):** NOT enrolled, and stated rather than assumed. The deliverables are a workflow YAML file and three data edits (a run-step file list, the `REQUIRED` table in `scripts/check-app-e2e-executed.mjs:38`, and `governs` arrays in `tests/ci/_workflowCoverageScan.ts`). The source-mutation registry overlays an importable module that a Vitest suite imports; a workflow file is neither, which is the step3 shape (`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`, the tap-target suite the registry could not express), and a data table has no branches to mutate. The oracle's LOGIC is untouched by this batch. If the plan finds it must add decision logic to the oracle, that logic is authored as an importable module with a referring suite and enrolled before the round-1 diff dispatch, per AGENTS.md convergence bullet 4. The guards that do bind are executable and already shipped: `tests/cross-cutting/app-e2e-ci-wiring.test.ts` (one un-chained invocation at line 112, the exact project set at line 137, and the oracle's key set and floors pinned against live Playwright resolution at line 203) and the coverage scanner's shadowing and stale-row assertions (`tests/ci/_metaE2eWorkflowCoverage.test.ts:264`, line 266).

## 1. Problem

The `UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts` (`LOCAL_ONLY_ALLOWLIST`, line 116, bound to the reason string at line 112) are e2e specs no CI workflow names. They exist, match a Playwright `testMatch`, and prove nothing on any PR. Batch 1 (PR #753 and the two follow-on promotions) took the population from 32 to 23. The ledger row's own promotion path is incremental by design: small green batches, never the whole residual, because the acceptance bar (five consecutive green runs per spec) is what makes a batch green, and it does not survive a large batch.

This spec defines batch 2: its membership (from a real run, section 4), its wiring (section 5), and its acceptance (section 8). It does not solve all 23.

## 1.1 Resolved scope — do not relitigate

- **Incremental batch framing.** `BACKLOG.md:687` ff. ("Promotion path ... incremental by design"), ratified by batch 1's spec §1.1 and vindicated by its AC-4 drops. Batch 2 is a subset of the 23; the residual stays on the allowlist with its rows intact. Do not propose the whole residual.
- **Membership is derived from a real run, not from a reading.** `BACKLOG.md` row, "Five of the nine specced members were RED when first run ... derive a batch's membership from a real run". Section 4 IS that run. A finding that a spec "looks wired-able" or "looks broken" on a read is not admissible against section 4's measurement.
- **`onboarding-wizard-step1.spec.ts` is excluded** (`BACKLOG.md:740`; batch-1 spec §1.1): it asserts the wizard on `/admin` while `supabase/seed.ts` sets `app_settings.watched_folder_id`, so the seeded dashboard renders instead. Deterministic red on any seeded DB and mutually exclusive with `admin-changes-feed-layout.spec.ts`'s required state. Section 4 runs it once to record the measurement beside the reason; it is not a candidate.
- **Required-set promotion is an owner action, not repo code.** Measured at `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:101` (§2.5: twelve required contexts, none e2e). Every e2e job, including `app-e2e`, is advisory at the GitHub layer; the ship pipeline's all-checks-green gate is the procedural enforcement. Not specced here; cited.
- **AC-4 and AC-6 are inherited verbatim** from the batch-1 spec (`docs/superpowers/specs/ci/2026-08-09-app-e2e-batch1-design.md:85` ff.): an admitted flake never rides in, and only CI settles a flake question; real CI green is a separate gate from local green. The changes-feed history in the ledger row is the proof in both directions.
- **Path-gated rows are out of scope.** `PATH_GATED` and `PATH_GATED_BY_EXCLUSION` rows are named by a workflow; "not PR-blocking-capable" is a different property from "runs nowhere" (the row's own text). The population is `UNSEEN` only.
- **Extend `app-e2e.yml`; do not mint a second app-dependent workflow.** Ratified here, with the trade stated. Batch 1 minted a NEW workflow for flake isolation from the already-wired LIFECYCLE gate and accepted +10-15 runner-minutes per PR for it. Batch 2's members have the same requirement class as batch 1's (the port 3000 baseline server plus the seeded local Supabase), so the isolation argument does not apply between batches of the same job, and a second workflow would pay a second cold build, a second Supabase bootstrap, a second oracle script, a second wiring test and a second `PLAYWRIGHT_JSON_OUTPUT_NAME` value row to buy nothing the AC-4 fallback does not already buy (a flaky member leaves the run command; it does not red the job for long). The cost that DOES move is the job's wall clock against its `timeout-minutes: 30` (`.github/workflows/app-e2e.yml:75`), which section 5.3 measures rather than guesses, because a job timeout is a CANCELLED leg that reports nothing (the silent ceiling; `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`'s measured shape).
- **No UI files.** A candidate red for an APP defect is deferred with its own row (the help-pages precedent: `BL-HELP-TOUR-HYDRATION-MISMATCH` got its own arc because its fix was a UI surface under invariant 8). This arc wires; it does not repair app code. Test-only staleness in a candidate IS repaired in-branch, as batch 1 §4 ratified.
- **Advisory posture accepted.** Same as batch 1 §1.1, last bullet.

## 2. Population, by command

Counts below are produced by the commands beside them, run at `ba5d3f808` (this branch's Stage-0 head, whose only delta from `origin/main` at `0ba72c237` is the ledger marker). The ledger row's census table is restated from these same commands in section 7, never copied from this prose.

```
$ grep -cE '^ +"tests/e2e/[^"]+": UNSEEN,' tests/ci/_metaE2eWorkflowCoverage.test.ts
23
```

```
$ F=tests/ci/_metaE2eWorkflowCoverage.test.ts
$ awk '/^const LOCAL_ONLY_ALLOWLIST/,/^};/' "$F" | grep -E '^ +"tests/e2e/' \
    | sed -E 's/^ +"[^"]+":[[:space:]]*//' \
    | awk '{ v=$0; sub(/,$/,"",v); if (v ~ /^(UNSEEN|PATH_GATED|PATH_GATED_BY_EXCLUSION|LOCAL_ONLY_GALLERY_CAPTURE)$/) print v; else print "custom-reason" }' \
    | sort | uniq -c
      3 custom-reason
      1 LOCAL_ONLY_GALLERY_CAPTURE
     14 PATH_GATED
     10 PATH_GATED_BY_EXCLUSION
     23 UNSEEN
$ awk '/^const LOCAL_ONLY_ALLOWLIST/,/^};/' "$F" | grep -cE '^ +"tests/e2e/'
51
```

The classifier keys on the VALUE TOKEN: a row whose value is one of the four constants is that bucket, and every other row is `custom-reason`, whether its reason sits on the same line or on a continuation line (the layout of the three current custom rows and of the seven section-7.3 rewrites). Spec review round 4 found the first draft's pipeline printed an unlabeled `3` for those rows while the draft quoted a labelled line the command never produced; the block above is pasted from the run. Positive control, run beside it: a constructed one-line `"short custom reason",` row, a constant row and a bare `path:` row classify as 2 `custom-reason` and 1 `UNSEEN`.

The row's 2026-08-10 table reads "total unchanged at 50". The allowlist holds 51 rows today; `staged-preview.spec.ts` joined as `UNSEEN` after that restatement (its row comment cites the step3 crew-preview spec §7). Not a defect in this arc, but the section-7 restatement carries the corrected total with its command, and does not inherit the 50.

The 23 `UNSEEN` paths, in allowlist order, are listed once in the probe record (section "population") and derived by the first command above with `-c` removed. This document does not repeat the list as prose.

## 3. Candidate inventory: resolution and requirement class

Resolution is a Playwright fact, not a reading: the command below replays the two baseline projects' `testMatch` regexes (`playwright.config.ts:64`, line 95) over the 23 paths. `--list` starts no webServer and is not a heavy phase.

```
$ BASELINE_SERVER_ONLY=1 pnpm exec playwright test --list \
    --project=mobile-safari --project=desktop-chromium $(cat <the 23 paths>)
Total: 114 tests in 16 files
```

Per (project, file), from that listing (`grep -E '^\s+\[' | sed ... | sort | uniq -c`):

| Spec (`tests/e2e/`) | mobile-safari | desktop-chromium | Static signals (grep counts, probe record section "static sweep") |
| --- | --- | --- | --- |
| `admin-parse-panel.spec.ts` | 5 | 5 | signInAs, supabaseAdmin self-seeds a staged row |
| `admin-route-boundaries.spec.ts` | 0 | 5 | signInAs, supabaseAdmin, seed-fixture refs |
| `admin-settings-admins-refresh.spec.ts` | 0 | 1 | signInAs, supabaseAdmin |
| `dev-capture.spec.ts` | 0 | 4 | signInAs (developer + normal admin), PNG download + pixel scan |
| `developer-tier.spec.ts` | 0 | 7 | signInAs (developer fixture via JWT arm), `/admin/dev` routes |
| `empty-state-reachability.spec.ts` | 4 | 4 | `toHaveScreenshot` x5 (darwin PNG baselines committed, 4 files); navigates `/show/<slug>` (line 154), a slug-only route with no `page.tsx` under `app/show/[slug]/` |
| `needs-attention-page.spec.ts` | 6 | 6 | signInAs, supabaseAdmin seeds `pending_syncs`/`pending_ingestions`; header says the server needs `TEST_DATABASE_URL` |
| `no-raw-codes.spec.ts` | 10 | 0 | signInAs; walks `discoverStaticAppRoutePaths()` and visits each |
| `onboarding-wizard-step1.spec.ts` | 2 | 0 | EXCLUDED (section 1.1); run once for the record |
| `published-show-attention.spec.ts` | 0 | 6 | signInAs, supabaseAdmin seeds `admin_alerts` |
| `roles-settings-layout.spec.ts` | 0 | 5 | signInAs, supabaseAdmin; fixed-timestamp literals only |
| `sign-in-page.spec.ts` | 12 | 12 | signInAs; `TEST_BASE_URL = "http://127.0.0.1:3000"` literal (line 39) |
| `source-link-dimensional.spec.ts` | 0 | 5 | signInAs; `HARNESS_PATH = "/admin/dev/source-link-dim"` (line 55), a dev-panel route the port 3000 server builds with `ADMIN_DEV_PANEL_ENABLED=true` in both CI and dev postures |
| `staged-preview.spec.ts` | 0 | 8 | signInAs; inserts its own staged row; `SHOW_DAYS` date literals (line 47) |
| `telemetry-layout.spec.ts` | 0 | 3 | signInAs; `HARNESS_PATH = "/admin/dev/telemetry-dim"` (line 30) |
| `warning-panel-polish.spec.ts` | 0 | 4 | signInAs, supabaseAdmin seeds a published show with warnings |

Sum of the two columns is 114, which is the listing's total. Zero `waitForTimeout` and zero `project.name` early-return gates across the 16 (static sweep); `toHaveScreenshot` appears in exactly one file.

**Requirement classes.**

- **Class A, the batch-1 shape:** port 3000 baseline server + seeded local Supabase + `signInAs`. Every one of the 16 above except `empty-state-reachability` and the excluded `onboarding-wizard-step1`. These are the batch-2 candidates; section 4 runs them.
- **Class B, pixel baselines:** `empty-state-reachability.spec.ts`. Two independent blockers, either sufficient: it navigates a retired route (404 by construction), and it asserts bytes against `-darwin.png` baselines, which the byte-comparison discipline (AGENTS.md, "Byte-comparison CI gates must pin BOTH the Docker image AND the host architecture") forbids on this native-runner job. Not a candidate; disposition in section 10.
- **Class C, other build servers:** the 7 `UNSEEN` paths that resolve under no baseline project. `admin-dev.spec.ts` resolves under `dev-build`/`prod-build`/`prod-runtime-flip` (port 3001-port 3003; 6 each); `deep-link-walker`, `help-auth`, `help-mobile`, `help-typography` under `help-docs`/`help-docs-desktop` (port 3004); `help-screenshots-clock-pipeline` under `screenshots-help` (port 3004); `screenshots-help-capture` resolves under NO project in the default config (only under `playwright.screenshots.config.ts`). Out of batch 2 by requirement class. All seven are ALREADY RUN by a path-filtered workflow through an invocation the scanner cannot see, five through a project-only `--project=` run step and two through the screenshots docker block; section 7.3 records the evidence and disposes of all seven as bookkeeping, not wiring.

## 4. Membership: derived from a real run

Command shape (the exact invocation, with its recorded rc, is in the probe record):

```
pnpm heavy bash probe-inner.sh   # inside the hold:
  pnpm db:seed
  BASELINE_SERVER_ONLY=1 PLAYWRIGHT_JSON_OUTPUT_NAME=<scratch>/probe-report.json \
    pnpm exec playwright test <16 paths> --project=mobile-safari --project=desktop-chromium \
    --retries=0 --reporter=list,json
```

Run posture: local `pnpm dev` on port 3000 (the non-CI branch of the baseline webServer command, `playwright.config.ts:263`), `reuseExistingServer` (line 269) with port 3000 verified free before boot and the listener verified after. The CI posture (`pnpm build && pnpm start`) is the implementer's first CI run; batch 1 measured both and the two postures agreed on membership, with the CI posture surfacing only env gaps (the `DATABASE_URL` class, section 5.2).

Three runs, each ONE heavy-wrapped invocation (probe record sections 4 to 6): run 1, all 16 baseline-resolving specs, 114 identities, rc 1, 86 passed on first attempt, 27 failed, 1 skipped, 7 minutes wall including seed and boot, under this machine's `.env.local` (which the probe record section 4.3 shows sent every postgres.js route to the remote validation database); run 2, seven specs with both DSNs pinned to the local stack, rc 1, 28 passed, 9 failed, 5 skipped, 3 minutes; run 3, three specs with `--trace on`, rc 1, 6 passed, 3 failed, 1 skipped, 90 seconds. Counts below are "passed on first attempt / resolved" per project, from each run's own JSON report, listed run by run where a spec ran more than once.

| Spec | mobile-safari | desktop-chromium | Run-1 result | Disposition |
| --- | --- | --- | --- | --- |
| `developer-tier.spec.ts` | n/a | 7/7 | GREEN | MEMBER |
| `source-link-dimensional.spec.ts` | n/a | 5/5 | GREEN | MEMBER |
| `staged-preview.spec.ts` | n/a | 8/8 | GREEN | MEMBER |
| `telemetry-layout.spec.ts` | n/a | 3/3 | GREEN | MEMBER |
| `no-raw-codes.spec.ts` | 9/10 | n/a | one red: `expect(routePaths).toContain("/")` | MEMBER after repair (section 6, R1) |
| `sign-in-page.spec.ts` | 11/12 | 11/12 | one red per project: signed-in crew + `next=/show/<slug>` lands on `/me` | MEMBER after repair (section 6, R2) |
| `admin-route-boundaries.spec.ts` | n/a | 4/5 | one red: helper picked a crew-less foreign show | MEMBER after repair (section 6, R3) |
| `needs-attention-page.spec.ts` | 3/6 | 3/6 | three reds per project: badge "9+" where the spec seeded 3 | MEMBER after repair (section 6, R4); CI-posture note in section 5.2 |
| `admin-parse-panel.spec.ts` | 4/5, then 5/5 | 4/5, then 5/5 | run 1: discard answered `STALE_DISCARD_REJECTED` because the route's postgres.js lookup read the remote DB (section 5.2); run 2, both DSNs local: GREEN | MEMBER (run 2 is the measurement; run 1's red is a local-environment artefact, probe record 4.3) |
| `dev-capture.spec.ts` | n/a | 3/4, then 4/4 | run 1: the wizard's `sessionLifecycle` read the remote DB, so Step 3 had no staged row; run 2: GREEN | MEMBER (same) |
| `published-show-attention.spec.ts` | n/a | 5/6, then 6/6 | run 1: the resolve route (postgres.js) read the remote DB, pill stayed "2 issues"; run 2: GREEN | MEMBER (same) |
| `roles-settings-layout.spec.ts` | n/a | 4/5, then no data, then 4/5 | runs 1 and 3: the same one red, `role-mapping-saved-confirm` measured while `sr-only`; run 3's trace shows the save's server-action POST still in flight (status -1) when the measurement ran; run 2: `beforeAll` fixture insert hit the local gateway's transient 502 and the cases skipped | MEMBER after repair (section 6, R5) |
| `admin-settings-admins-refresh.spec.ts` | n/a | 0/1, three times | 60 s case timeout on every run after the revoke landed; run 3's trace: the `Add` click never completed, Playwright retrying "`admin-settings-admins-card` intercepts pointer events" until the test timeout, and only ONE server-action POST (the revoke) in the network log; the add form sits behind an "Add admin" disclosure the spec never opens (`app/admin/settings/page.tsx:23`) | MEMBER after repair (section 6, R6) |
| `warning-panel-polish.spec.ts` | n/a | 2/4, three times | announcer region "" after Ignore on every run, no `dq-error-*` copy; run 3's trace: the Ignore click completed in 179 ms and NO request to `/api/admin/show/<slug>/data-quality/ignore` followed, so the click landed before React attached `onClick={run}`; `openShowReviewModal` awaits the modal's mount, not its hydration; the reveal case skipped each time by the serial describe | MEMBER after repair (section 6, R7); reveal case re-measured on the post-fix run |
| `onboarding-wizard-step1.spec.ts` | 0/2 | n/a | wizard not rendered on the seeded dashboard, as `BACKLOG.md:740` records | EXCLUDED (section 1.1) |
| `empty-state-reachability.spec.ts` | 0/4 | 0/4 | every case: `/show/<slug>` renders none of the tile testids | DEFERRED (section 10) |

Every disposition above is measured, not read, and the table is meant to be re-derivable on its own: each row names its runs, its numbers, the mechanism of any red, and the repair or deferral that follows. MEMBER rows need no change. "MEMBER after repair" rows enter the batch as red-then-green: the run above is the observed red, section 6 names the repair, and the plan's first task re-runs the full member set once with both DSNs on the local stack and records the green (the post-fix run is the measurement the batch derives from; a member that is not green there leaves the batch under AC-4 before the PR opens). A single red on a shared local database was not treated as a classification: every undetermined red was re-measured before it was dispositioned (probe record sections 4.3 and 5; batch 1's `report-modal` lesson cuts both ways).

Disposition vocabulary, fixed: **MEMBER** (green on first attempt, all resolved identities), **MEMBER after repair** (red on a test-only defect batch 1 §4 already ratifies repairing in-branch; the repair is named in section 6 and the spec re-run green before the PR opens), **DEFERRED** (red on an app defect, or a repair that is a redesign; its own row with the exception it names), **EXCLUDED** (section 1.1).

## 5. Workflow wiring

### 5.1 `app-e2e.yml`

One file, four edits, nothing structural:

1. **Run step** (`.github/workflows/app-e2e.yml:150`): append the section-4 members' paths to the single invocation. Same flags exactly: `--project=mobile-safari --project=desktop-chromium --retries=0 --reporter=list,json`. The wiring test refuses any other flag (`tests/cross-cutting/app-e2e-ci-wiring.test.ts:137` ff.) and a second invocation (line 112).
2. **`name:`** (line 1): `App e2e batch 1 (...)` becomes `App e2e (mobile-safari + desktop-chromium)`. Nothing pins the display name (probe: `grep -rn 'App e2e batch 1' tests scripts` returns nothing); the concurrency group reads `${{ github.workflow }}` and therefore changes with it, which is the desired behaviour for a renamed job.
3. **`timeout-minutes`** (line 75): set from section 5.3's measurement, never raised by feel.
4. **Header comment**: the batch-2 members, the probe record path, and the measured duration, replacing the batch-1-only narrative.

No new `pull_request` key of any kind (`tests/cross-cutting/app-e2e-ci-wiring.test.ts` "the pull_request trigger narrows on nothing at all"); no `if:`/`continue-on-error:` on the job or the run step.

### 5.2 Env: `DATABASE_URL` is REQUIRED on the run step, not optional

The app's postgres.js paths resolve `TEST_DATABASE_URL ?? DATABASE_URL` and throw in production posture when neither is set (`lib/onboarding/sessionLifecycle.ts:95`, `lib/sync/lockedShowTx.ts:40`, and ten sibling modules, derived by `rg -n 'TEST_DATABASE_URL' lib --glob '!**/*.test.*'`). Batch 1's members never reached those paths, which is why `app-e2e.yml` carries no DSN today. Batch 2's do: the staged discard route (`app/api/admin/show/staged/[stagedId]/discard/route.ts:64` resolves the staged row through `defaultReadDriveFileIdForStagedId`, a postgres.js read in `app/api/admin/show/staged/[stagedId]/apply/route.ts:46`, then `discardStaged` runs under `lockedShowTx`), the wizard Step-3 surface `dev-capture.spec.ts` opens (`sessionLifecycle`), and the staged-row flows in `needs-attention-page.spec.ts`.

So the run step gains, at STEP level, the pair the lifecycle tap-target step already carries for the same reason: `DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres` (`.github/workflows/lifecycle-layout-e2e.yml:193`; an existing `ENV_KEY_ALLOWLIST` value row whose `governs` array gains the batch-2 members; the rationale in that step's comment, "DATABASE_URL, not TEST_DATABASE_URL: the latter is this repo's name for the REMOTE validation project", applies verbatim). Without it the first CI run fails every member that touches a postgres.js path with `requires DATABASE_URL in production`, the exact message the tap-target step's comment records from its own first run.

**The same split contaminated the local probe, and the probe record says so.** On the origin machine `.env.local` sets `TEST_DATABASE_URL` to the remote validation pooler (`pnpm preflight` warns: "TEST_DATABASE_URL is NON-LOOPBACK … loopback-guarded DB tests will skip"), so under `pnpm dev` every postgres.js path read a different database than the specs seeded through `supabaseAdmin`. Run 1's reds on those paths (probe record section 4.1, rows 1/13, 16 and plausibly 15, 24, 25, 27) are therefore local-environment artefacts until re-measured with `TEST_DATABASE_URL` and `DATABASE_URL` both pointed at the local stack, which is run 2's only change. A local membership probe on this repo MUST export both DSNs to the local stack on the playwright invocation; the probe record carries the exact command. This is a documented limit of local probing (section 9), not a spec repair: the specs are correct to seed through one client and exercise the app through another, and CI has exactly one database.

Any OTHER (key, value) pair a member needs fails the scan closed (`tests/ci/_workflowCoverageScan.ts` `ENV_KEY_ALLOWLIST`) until a value row is added with `governs` and a reason. None is expected beyond `DATABASE_URL`: the candidates read no `process.env.*` key the job does not already set (static sweep: only `TEST_AUTH_SECRET`, already set).

### 5.3 Wall clock and the silent ceiling

The job's `timeout-minutes: 30` bounds the WHOLE job. A run that crosses it is CANCELLED and uploads nothing; the oracle never runs; the leg is neither red nor green. Batch 1's measured `pull_request` durations (`gh run list --workflow=app-e2e.yml ... | select(completed)`, 2026-08-21) range 330s to 741s across the last twelve completed runs. Batch 2 adds up to 114 executions to the current 77.

The plan measures, in this order: (a) the probe's wall clock for the 16 (probe record, `inner-start`/`inner-end` stamps); (b) the first CI run's job duration with the members added. Then `timeout-minutes` = ceil(measured CI duration x 1.5) + 5, floored at the current 30, stated in the YAML comment with the run id it was derived from. The 1.5 is headroom for CI runner variance (the twelve runs above vary 2.2x on identical members); the +5 is the reporting reserve so the oracle and artifact-upload steps run inside the ceiling even at the bound (rule: a ceiling that equals the budget leaves zero reserve for the steps that report).

### 5.4 Executed-count oracle

`scripts/check-app-e2e-executed.mjs:38` `REQUIRED` gains one row per member, each value = the member's executed (case x project) identities from a REAL run's JSON report on the final run command (the probe's report is the first measurement; the wiring test then pins each floor to live resolution, so a wrong literal reds). Rows are the spec's FULL executable set, never a floor of 1 (the script's own comment). No logic change.

### 5.5 `governs`

Every `ENV_KEY_ALLOWLIST` pair the run step is in scope of gains the members' paths in its SORTED `governs` array (`tests/ci/_workflowCoverageScan.ts:665` doc block; the hygiene suite asserts set equality against a fresh derivation). Batch 1 measured 17 pairs; the implementer pastes the hygiene suite's fresh-derivation output rather than editing by hand. The `PLAYWRIGHT_JSON_OUTPUT_NAME` app-e2e value row (line 739) is one of them; its text does not change.

## 6. Pre-wiring repairs

Each repair is test-only staleness or fixture selection (batch 1 §4 ratifies repairing, not filing, defects the wiring would convert to CI-red), names the defect the run produced and the line it lives on, and is TDD-shaped: the run-1 failure IS the observed red on the same command; the repaired case goes green on the post-fix run (plan Task 1), and that green is the measurement membership derives from. No repair here touches `app/` or `components/`.

- **R1, `tests/e2e/no-raw-codes.spec.ts:96`: a route expectation the root redirect retired.** `expect(routePaths).toContain("/")` fails because app/page.tsx (unbackticked: it does not exist, which is the point) does not exist; `/` is a `next.config.ts` redirect to `/auth/sign-in?next=/admin` (`next.config.ts:66`), which `root-landing.spec.ts` (batch 1) already asserts. Repair: replace the line with `expect(routePaths).not.toContain("/")` plus the citation, so the guard states the ratified shape instead of the retired one. Red: run-1 row 9. Nothing else in the case depends on `/`: the crawl loop skips it, and the `/admin` and `not /admin/dev` expectations stand.
- **R2, `tests/e2e/sign-in-page.spec.ts:116` to `tests/e2e/sign-in-page.spec.ts:155`: a slug-only `next` the validator rejects since the picker pivot.** The case seeds a show and asserts the signed-in crew viewer is redirected to `/show/<slug>`. `lib/auth/validateNextParam.ts:16` rejects slug-only `/show/<slug>` (the crew route is `/show/<slug>/<64-hex token>`, line 25), and `app/auth/sign-in/page.tsx:128` to `app/auth/sign-in/page.tsx:148` then sends a confirmed non-admin to `/me`. The run received exactly `/me` on both projects (rows 12, 26). Repair: the case asserts `url.pathname` equals `/me` and is retitled "already signed in (non-admin crew) + slug-only `next=/show/<slug>` is rejected → redirect to /me", with the validator citation in its comment; the seeded show and crew row stay, because the case's purpose (the sign-in page bounces out of the way) is unchanged. A positive tokenized-`next` sibling would need a `show_share_tokens` row and is a strengthening outside this batch (section 9).
- **R3, `tests/e2e/admin-route-boundaries.spec.ts:55` to `tests/e2e/admin-route-boundaries.spec.ts:74`: fixture selection keyed to "any published show".** `lookupPublishedShowWithCrew` takes the first `published AND NOT archived` show with no namespace and got a foreign `slug-*` row with zero crew (row 14; probe record section 4.2). Repair: scope the select to the seed corpus (`.like("drive_file_id", "seed-fixture:%")`, the prefix `supabase/seed.ts:22` manages) and assert the chosen show has a crew member, so the helper fails by name when the seed lacks one rather than when a neighbour's row wins the race. Class sweep, run at spec time over the 16 candidates plus `tests/e2e/helpers/` (`rg -n -A6 'from\("shows"\)' <files>`, hits in the probe record): ONE peer with the same shape, `tests/e2e/admin-parse-panel.spec.ts:52` to `tests/e2e/admin-parse-panel.spec.ts:62` `lookupSeed`, which takes the oldest `published AND NOT archived` show with no namespace; it is repaired in the same commit by the same scope (same defect, different file is not a deferral reason). Every other hit is already scoped (`tests/e2e/helpers/rightNow.ts:101` by `drive_file_id`, `tests/e2e/empty-state-reachability.spec.ts:77` by `drive_file_id`, `tests/e2e/sign-in-page.spec.ts:48`/line 63 by its own id) or is not a selection (`tests/e2e/helpers/supabaseAdmin.ts:50` snapshots the whole table by design); `tests/e2e/helpers/seedAlerts.ts:26`/line 138 select unscoped but no batch-2 candidate imports that helper (`rg -l 'helpers/seedAlerts'` over the 16 returns nothing), so it is outside this sweep's population and is named here rather than silently skipped.
- **R4, `tests/e2e/needs-attention-page.spec.ts:184`, line 197, line 224: badge literals that assume an otherwise-empty pending population.** The badge is `components/admin/nav/AdminNav.tsx:230` (`badgeCount > 9 ? "9+" : String(badgeCount)`) over two exact head-counts in `lib/admin/loadNeedsAttention.ts` (`pending_ingestions` at line 87 and `pending_syncs` at line 139, each where `wizard_session_id is null`; plan round 3 corrected this sentence, which had named the filter on one table). The spec seeds 3 and asserts "3"; on a database holding other rows it reads "9+" (rows 6-8, 21-23). Repair: derive the expected text from the data source at assertion time, the same two head-counts through the admin client, formatted by the same cap rule, so the actual (rendered badge) and the expected (database) come from different sources and the assertion cannot pass by construction (anti-tautology); keep the spec's own namespace pre-clean. In CI the derived value equals the old literal; locally it is honest. Flows 4 and 5 assert deltas (+1 after a server-side insert, -1 after Discard) rather than absolute literals.

- **R5, `tests/e2e/roles-settings-layout.spec.ts:277` to `tests/e2e/roles-settings-layout.spec.ts:279`: a visibility wait that a screen-reader-only element satisfies.** `role-mapping-saved-confirm` is rendered in both states: `sr-only` while `savedConfirm` is false, and as the visible confirmation once `updateRoleTokenMapping` returns `ok` (`app/admin/settings/roles/RoleMappingRow.tsx:118`, line 165-line 174). Playwright's `toBeVisible` accepts a non-empty `sr-only` box, so the spec measured the 1 px placeholder before the action resolved (run 1: width diff 697). Repair: wait on the STATE, `await expect(saved).toHaveText(COPY.EDIT_SAVED_CONFIRM)` before `rect(saved)`, so a slow action waits and a failed action fails by name instead of measuring the placeholder. Red: run-1 row 25. Run 2 gave no data (probe record 5 (c)); run 3 is the third data point, and the post-fix run is the measurement.

- **R6, `tests/e2e/admin-settings-admins-refresh.spec.ts:137` to `tests/e2e/admin-settings-admins-refresh.spec.ts:142`: the add form is behind a disclosure the spec never opens.** `app/admin/settings/page.tsx:23` documents the current surface: "Add admin" is a heading-row trigger that discloses the add form. The spec fills `admin-allowlist-email-input` (which succeeds, the inputs are in the DOM) and clicks `admin-allowlist-add-button`, and run 3's trace shows that click retrying "`admin-settings-admins-card` intercepts pointer events" until the 60 s test timeout, with no second server-action POST in the network log. Repair: click the "Add admin" trigger (`admin-add-admin-trigger`, `components/admin/settings/AddAdminDisclosure.tsx:8`, which toggles the `admin-settings-add-admin` panel at line 71) and wait for the form to be disclosed before filling; the revoke half of the case is untouched, it already passes. Red: run-1 row 15 (reproduced on runs 2 and 3).
- **R7, `tests/e2e/warning-panel-polish.spec.ts:97` to `tests/e2e/warning-panel-polish.spec.ts:100` (`openModal`) and line 267-line 276: a click that lands before hydration.** Run 3's trace: the Ignore click completed in 179 ms and no `data-quality/ignore` request followed. `DataQualityWarningControls.tsx` binds `onClick={run}` and `run()` fetches first, so a completed click with no fetch is a click React had not yet attached a handler to. `openShowReviewModal` (`tests/e2e/helpers/openShowReviewModal.ts`) awaits the modal's mount, not its hydration. Repair: after `openShowReviewModal`, await the in-tree hydration gate, the `awaitModalHydrated` shape at `tests/e2e/dev-capture.spec.ts:50` to `tests/e2e/dev-capture.spec.ts:62` (loaded frame visible, exactly one modal, initial focus on `published-show-review-close`); promote that helper into `tests/e2e/helpers/` so both specs share one copy rather than two that drift, and apply it in this spec's `openModal`. The serial-skipped reveal case (line 340) runs on the post-fix run and is measured there. Red: run-1 row 27 (reproduced on runs 2 and 3). This is the pre-hydration click-swallow class the ci-dark design §6.1 records for `admin-lifecycle-transitions`; the repair shape is the same. Spec review round 3 read the lost click as an app defect; the orchestrator dispositioned it on the ratified precedent (the gate is the repair pattern `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:309` ratified for this class, not a workaround), and section 9 records the framework window as a documented limit with the trace and the re-file trigger that would convert it into a row.

Checked and NOT repaired: `tests/e2e/staged-preview.spec.ts:47`'s `SHOW_DAYS` and the other fixed-timestamp literals in the candidates are inert seed data (the spec passed 8/8 with dates two months in the past), not the batch-1 §4.2 date-bomb shape, which partitioned around "today".

## 7. Bookkeeping (same PR)

### 7.1 Allowlist

Delete the members' `UNSEEN` rows from `LOCAL_ONLY_ALLOWLIST` in the same commit the run step gains them; the shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:266`) reds otherwise, which is the structural proof of wiring. Retained rows (deferred, excluded, class B/C) keep their paths; a retained row whose reason is now measured gets the measurement in its reason string, as batch 1 did for `help-pages`.

### 7.2 Ledger

Update `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` in `BACKLOG.md`: a batch-2 paragraph in the same shape as the batch-1 one (members, workflow, date, PR), the census table restated by the section-2 commands at the closeout head. Expected, derived bucket by bucket from section 2's counts: `UNSEEN` 23 → 2 (fourteen member rows deleted, seven rows moved to custom reasons, two left), custom-reason rows 3 → 10, `PATH_GATED` 14, `PATH_GATED_BY_EXCLUSION` 10 and the gallery `LOCAL_ONLY` row unchanged, total 51 → 37 (deletions move the total; reclassifications do not). The ledger table carries the 2026-08-09 and 2026-08-10 columns as history and adds the closeout column with its commands; the staged-preview note explains why the pre-closeout total reads 51 where the row last said 50, the class-C bookkeeping from 7.3, and the deferred rows from section 10 linked. Entry stays OPEN while any `UNSEEN` row remains. The `**Status:** IN PROGRESS · **Branch:** ci/app-e2e-batch2` marker comes off in the ledger-closeout commit taken BEFORE whole-diff review (the ratified early-closeout ordering; a marker that reaches main names a branch the merge just deleted).

### 7.3 Class-C rows that already run: bookkeeping, not wiring

Seven `UNSEEN` rows name specs a path-filtered workflow already runs through an invocation the scanner is blind to by its own contract (`UNSEEN`'s reason text at `tests/ci/_metaE2eWorkflowCoverage.test.ts` line 112 names the project-only form; the docker-block form is the `section-header-visual` row's, line 172). Evidence, by command:

```
$ grep -nE 'run: pnpm exec playwright test' .github/workflows/dev-gate-e2e.yml .github/workflows/help-affordances.yml
.github/workflows/dev-gate-e2e.yml:153:        run: pnpm exec playwright test --project=dev-build --project=prod-build --project=prod-runtime-flip
.github/workflows/help-affordances.yml:97:        run: pnpm exec playwright test --project=help-docs-setup --project=help-docs --project=help-docs-desktop
$ grep -nE '^  pull_request:|^    paths:|^  schedule:|pnpm screenshot:help' .github/workflows/screenshots-drift.yml
12:  pull_request:
13:    paths:
44:  schedule:
118:            bash -lc "apt-get update && apt-get install -y postgresql-client && corepack enable && pnpm screenshot:help"
$ grep -n '"screenshot:help"' package.json
50:    "screenshot:help": "... playwright test -c playwright.screenshots.config.ts --project=screenshots-help --project=screenshots-help-capture",
$ grep -nE 'name: "screenshots-help"|name: "screenshots-help-capture"|testMatch: /help-screenshots-clock-pipeline|testMatch: /screenshots-help-capture' playwright.screenshots.config.ts
25:      name: "screenshots-help",
26:      testMatch: /help-screenshots-clock-pipeline\.spec\.ts/,
44:      name: "screenshots-help-capture",
45:      testMatch: /screenshots-help-capture\.spec\.ts/,
$ pnpm exec playwright test --list <the 7 class-C paths>   # per (project,file), from the listing
      6 dev-build admin-dev.spec.ts   6 prod-build admin-dev.spec.ts   6 prod-runtime-flip admin-dev.spec.ts
     19 help-docs deep-link-walker.spec.ts   19 help-docs-desktop deep-link-walker.spec.ts
     13 help-docs help-auth.spec.ts   1 help-docs help-mobile.spec.ts
      6 help-docs help-typography.spec.ts   6 help-docs-desktop help-typography.spec.ts
      1 screenshots-help help-screenshots-clock-pipeline.spec.ts
   NOWHERE: screenshots-help-capture.spec.ts   (default config; the screenshots config above resolves it)
```

`dev-gate-e2e.yml` and `help-affordances.yml` carry a PATH-FILTERED `pull_request` trigger (`dev-gate-e2e.yml` also a daily `schedule`) and run their projects by name; `screenshots-drift.yml` carries a PATH-FILTERED `pull_request` trigger and a `schedule` and runs `pnpm screenshot:help`, which runs the two screenshot projects under `playwright.screenshots.config.ts`. So all seven are "named by a workflow, runs when its filter matches", the property the row's text assigns to the path-gated buckets, not to this population. The `attention-modal-gallery.spec.ts` row (line 136) is the precedent for the project-only five; the `section-header-visual.spec.ts` row (line 172) is the precedent for the docker-block two.

Disposition, ratified here: batch 2 rewrites all seven rows to those two precedents' shape, each carrying the invocation line, the filter, the schedule where one exists, why it cannot join the required set, and the commands above as evidence. This moves seven rows OUT of `UNSEEN` and changes no workflow, no run, and no total (the fourteen member-row deletions in section 7.1 are what move the total, 51 to 37). It is in this PR because the section-7.2 census cannot honestly call them "runs nowhere" once the evidence is in the same document.

Spec review round 1 found that this section's first draft stopped at five, fencing the two screenshot rows as "a census question for the owner of `screenshots-drift.yml`". That was the sweep stopping at an invocation FORM (project-only) instead of at the CLASS (already run by a path-filtered workflow's invocation the scanner cannot see); the finding was accepted and repaired for the whole class. Fenced in both directions so it is not relitigated: the class is exactly those seven, enumerated by the commands above; its complement inside the 23, after this batch, is the two rows section 4 leaves `UNSEEN` on a recorded run line (`onboarding-wizard-step1`, `empty-state-reachability`), and nothing else.

### 7.4 Docs

- Index row in `docs/superpowers/specs/ci/README.md` (the `2026-08-09-app-e2e-batch1-design.md` row shape).
- Probe record at `docs/superpowers/specs/ci/probes/2026-08-21-app-e2e-batch2-membership-probe.md`: population list, static sweep, listing, the probe command with its rc, per-spec results, stamps, log excerpts for every red.
- Closeout marker: `impeccable-gate: N/A — no UI surface` (workflow YAML, test files, scripts data table, docs; nothing under `app/` or `components/`).

## 8. Acceptance

Every AC names the command that proves it. A green suite is not read as proof where the AC says otherwise.

- **AC-1 (wiring, structural):** `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts` green with the members' rows deleted, the `REQUIRED` rows added, and the `governs` arrays extended. Proof it discriminates: with one member's `REQUIRED` row deleted, the wiring test's key-set assertion reds by name; restored, green.
- **AC-2 (repairs):** every section-6 repair lands with its strengthened assertion, red observed before the repair on the probe's failure output, green after, on the SAME command.
- **AC-3 (the bar, inherited):** five consecutive green `pull_request` runs of `app-e2e.yml` on the PR at `--retries=0`, run ids in the PR body, each run's oracle line quoted. Runs are serialized by the concurrency group; re-triggers between content pushes use empty commits. `workflow_dispatch` is not usable pre-merge for a changed workflow on a non-default branch for the same reason batch 1 recorded.
- **AC-4 (fallback, inherited verbatim):** a member that cannot clear AC-3 leaves the run command, its allowlist row is restored with the CI run ids that failed it as the reason, its `REQUIRED` row and `governs` entries are removed in the same commit, and the census moves accordingly. Only CI settles a flake question; a local green is not evidence against a CI red.
- **AC-5 (oracle):** every `REQUIRED` value equals the member's live resolution under the final run command (the wiring test asserts this at line 203); every value is a positive integer; the oracle reds on a constructed shortfall (`--report` pointed at a report with one member's cases removed exits 1 naming the spec).
- **AC-6 (real CI, inherited):** all required contexts green BY NAME on the final head, read sha-keyed in both vocabularies (check-runs and commit statuses); `app-e2e` green on that same head. Local green is not sufficient.
- **AC-7 (ceiling):** the first CI run's job duration with all members is recorded in the PR body and the YAML comment; `timeout-minutes` satisfies section 5.3's formula against it. A run that CANCELS at the ceiling is read as a ceiling defect, not a spec defect, and the formula is re-applied before any member is dropped.
- **AC-8 (census):** the ledger row's census table is regenerated by the section-2 commands at the closeout head and pasted with the commands; the `UNSEEN` count equals `23 - members - 7` (the seven class-C reclassifications), which with the fourteen members of section 4 is 2 (`onboarding-wizard-step1`, `empty-state-reachability`); the custom-reason count equals `3 + 7` = 10; `PATH_GATED` 14, `PATH_GATED_BY_EXCLUSION` 10 and the gallery row are unchanged; and the total equals `51 - members` = 37. The two commands in section 2 print every one of those numbers; a closeout that cannot reproduce them is not closed.
- **AC-9 (closeout ordering):** the ledger closeout commit (members' rows deleted, census restated, deferred rows filed, marker removed) lands BEFORE the whole-diff review dispatch; `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` green at that head.

## 9. Documented limits

- Advisory at the GitHub layer (section 1.1). A red `app-e2e` blocks merge only procedurally.
- Port literals: `tests/e2e/sign-in-page.spec.ts:39` hardcodes 127.0.0.1 port 3000; `source-link-dimensional.spec.ts` and `telemetry-layout.spec.ts` navigate dev-panel harness routes. Correct in CI (default `E2E_PORT`, `ADMIN_DEV_PANEL_ENABLED=true` on the port 3000 server in both postures); the local sibling-worktree `E2E_PORT` escape hatch breaks the first one, as batch 1 §7 already recorded. Not this arc's class sweep.
- Serialization: `signInAs` deletes and recreates fixture `auth.users` rows per call, so members must stay serialized (`playwright.config.ts:34`, line 49: `fullyParallel: false`, `workers: 1`). A local probe red that coincides with another session's e2e run on the shared local Supabase is contaminated signal, not membership evidence (batch 1's `report-modal` lesson); the probe record notes which other playwright/next processes were live at launch.
- Local posture versus CI posture: the membership probe runs `pnpm dev`; CI runs `pnpm build && pnpm start`. Env gaps that only production posture surfaces (section 5.2) are found by the first CI run, which is why AC-6 is a separate gate.
- `screenshots-help-capture.spec.ts` resolves under no default-config project; its reclassified row records that it runs only under `playwright.screenshots.config.ts` through `screenshots-drift.yml`, so `pnpm test:e2e` never executes it by design (the comment above `playwright.config.ts`'s `help-docs-setup` project). That is the row's reason, not a gap this batch leaves.
- The wall-clock formula (section 5.3) is derived from twelve runs on one day; a runner-pool change re-measures it. The YAML comment names the run id it was derived from so the derivation can be re-run.
- **Pre-hydration click loss on a server-rendered control is a harness-readiness concern, not a member-disqualifying app defect; the R7 gate is the ratified repair, and the window itself is recorded here.** Run 3's trace (probe record section 6), verbatim: "the `click` on `[data-testid^="dq-ignore-"] >> nth=0` completed in 179 ms, then `toHaveText` on `warnings-panel-status` waited 15004 ms" and "after the modal opened there is NO request to `/api/admin/show/<slug>/data-quality/ignore` at all". React had not yet attached `onClick={run}` (`components/admin/DataQualityWarningControls.tsx`) to the server-rendered button, which is a property of every client island in a Next app between first paint and hydration. The repo's ratified handling of this class is test-side: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:309` repaired "three pre-hydration click-swallow flakes" in the lifecycle transitions spec with a hydration retry, `docs/agents/writing-plans.md:31` makes a readiness gate before the first assertion mandatory for every Playwright plan, and `tests/e2e/dev-capture.spec.ts:50` already gates this same modal. R7 applies that gate; it closes this spec's exposure to the window and is not a workaround the limit excuses. The window is kept here because it is real: under `pnpm dev` it was wide enough to lose the click on three of three runs, and a user on a slow device could lose one too; the conservative worst case is a visible re-click, a surfaced annoyance and not silent corruption, which is why the ledger filing bar places it here and not in the open queue (reproduced only under `pnpm dev`, zero user incidents). Re-file trigger, either of: the click is lost on a CI-posture (`pnpm build && pnpm start`) run WITH the R7 gate present, which would mean the gate is not measuring hydration and would falsify the test-side reading; or a reported lost click on that control in production. Until one fires, the product question (render admin controls disabled until hydrated, app-wide) stays outside this arc's no-UI fence.

## 10. Deferred, with the exception each names

Every peer the sweep does not fix states why (AGENTS.md disposition rule). Rows are filed in section 7.2's closeout commit with `**Facing:** product` where the repair changes what a crew member or admin observes, and with their probe evidence.

- **`empty-state-reachability.spec.ts`: exception (c), redesign.** Its route (`/show/<slug>`) was retired by the M11.5 picker pivot (no `page.tsx` under `app/show/[slug]/`; the crew route is `/show/[slug]/[shareToken]`), and its five `toHaveScreenshot` assertions compare bytes against `-darwin.png` baselines, which cannot run on `app-e2e.yml`'s native Linux runner under the byte-comparison discipline. Re-targeting the route and replacing pixel assertions with behaviour assertions, or moving it to the pinned-Docker screenshots job, is a rewrite of a spec this batch does not otherwise touch. Row: `BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE` (working name; final id at closeout), `**Facing:** product` (it is the §8.3 empty-state catalog's only real-browser proof), probe evidence = the section-4 run line for this spec.
- **No other member is deferred.** Every remaining red resolved to a test-only repair (section 6) on a measured mechanism; none was an app defect, so the no-UI-files fence was not exercised.
- **`onboarding-wizard-step1.spec.ts`:** not deferred here; already recorded at `BACKLOG.md:740` as excluded pending a seed-state redesign. Section 4's run line is appended to that paragraph.

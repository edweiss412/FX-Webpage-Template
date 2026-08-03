# Plan — CI boot/install overlap, and the T-REGROW settle contract

**Spec:** `docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md` (design authority: `docs/superpowers/specs/ci/2026-07-20-ci-overlap-boot-with-setup.md`) · **Branch:** `chore/ci-boot-overlap-and-popover-flake` · **Backlog:** `BL-CI-OVERLAP-BOOT-WITH-SETUP`, and the "New instance observed 2026-07-26" paragraph of `BL-E2E-LIFECYCLE-SPECS-CI-DARK`.

**Plan-wide invariants:** TDD per task (failing test first, then minimal implementation, then commit). No advisory-lock surface, no Supabase call boundary, no DB migration, no `§12.4` catalog row, no mutation surface — this diff is one workflow job, one vitest meta-test, one new structural guard, and one Playwright spec body.

This work touches no UI surface. Neither half of the invariant-8 gate applies: no file under `app/` (except `app/api/**`, which is also untouched), no file under `components/`, no `@theme` token block, no change to `DESIGN.md` or a Tailwind config. Recorded per invariant 8, which requires the marker line whenever a plan names both the impeccable critique and impeccable audit halves:

impeccable-gate: N/A — no UI surface

**Invariant 11 (worktree):** all work happens in `/Users/ericweiss/FX-worktrees/ci-boot-overlap-and-popover-flake`, created off `origin/main` at `09b6c2178`. `pnpm install`, `pnpm worktree:link-env`, and `pnpm preflight` all ran clean before the first edit (`preflight: env ✓  local DB ✓`).

**Round-record discipline:** every adversarial round's findings and dispositions land in `## Review + ship` before the next dispatch.

---

## Pre-draft verification (run 2026-08-02 in this worktree)

Every file, symbol, and literal this plan names, verified live before drafting.

| Claim | Verification | Result |
| --- | --- | --- |
| `unit-suite-db` is the job that boots, with 8 legs | `sed -n '101,133p' .github/workflows/unit-suite.yml` | confirmed: `shard: [1..8]`, `bash scripts/ci/supabase-local-bootstrap.sh`, `--project=serial` |
| `assert-pnpm-sources` sits between the boot and vitest, with only `name` + `uses` | same read; `tests/cross-cutting/unit-suite-shard-topology.test.ts:152-166` | confirmed both |
| The topology test parses the workflow BOTH as text (`jobBlock`, `directives`) and as YAML (`parseYaml`) | `sed -n '45,70p;95,170p' tests/cross-cutting/unit-suite-shard-topology.test.ts` | confirmed — new assertions use the parsed-YAML path |
| No existing test pins that `unit-suite-db` uses `./.github/actions/setup` | `grep -rn 'actions/setup' tests/` | 3 hits, all in `tests/ci/` scanner internals and a fixture; none pins the db job |
| The psql guard must stay on ONE line | `tests/cross-cutting/ci-workflow-speedup.test.ts:130` | confirmed: the `command -v psql` token must be on the same line as `sudo apt-get` + `postgresql-client` |
| No `\|\| true` anywhere in `unit-suite.yml` | `tests/cross-cutting/unit-suite-shard-topology.test.ts:313` | confirmed |
| The composite's two non-install steps and their `with:` values | `cat .github/actions/setup/action.yml` | `pnpm/action-setup@v4`; `actions/setup-node@v4` with `node-version: 20`, `cache: pnpm`; then `run: pnpm install --frozen-lockfile` |
| The bootstrap never invokes node/npm/npx/pnpm | `grep -nE 'pnpm\|npx\|node \|node_modules\|npm ' scripts/ci/supabase-local-bootstrap.sh` | zero matches |
| `allowBuilds` holds five keys, four enabled | `cat pnpm-workspace.yaml` | `@sentry/cli`, `esbuild`, `sharp`, `unrs-resolver` true; `simple-git-hooks` false |
| The install's build scripts write nothing under `supabase/` (host) | `pnpm rebuild` with a timestamp mark, then `find supabase -newer` + `git status --porcelain supabase/` | 5 lifecycle scripts ran; both checks empty (spec §3.2 probe A) |
| …and on x86_64 Linux, from a FRESH install | `git archive HEAD` piped into `--platform linux/amd64 node:20-bookworm`, `corepack enable`, `pnpm install --frozen-lockfile`, with a `sha256sum` manifest of `supabase/` diffed before and after, and separately with `inotifywait -m -r` watching `supabase/` for the duration | x86_64, Debian 12 (NOT Ubuntu 24.04 — the shared axis is linux/x64/glibc, which is what these install scripts branch on; the distro gap is documented in spec §3.2); the same 4 build scripts + `prepare` ran; 126-file manifest IDENTICAL, and the inotify watch (confirmed established) recorded ZERO events of any kind — creates, deletes, modifies, moves, attribute changes, closed writes — so not even a transient write occurred; one Linux-only candidate `@parcel/watcher` 2.6.0 correctly IGNORED (spec §3.2 probe B) |
| `pnpm install` runs `preprepare`/`postprepare`; `pnpm rebuild` does not | pnpm 10.33.2 lifecycle sets, surfaced in spec review r1 | T1(h) forbids both keys |
| The setup composite's blast radius | `grep -rc 'uses: ./.github/actions/setup$' .github/workflows/` | 31 job steps across 17 workflows (the composite's own comment says "~20 across 8" and is stale) |
| T-REGROW's two fixed waits | `grep -n 'waitForTimeout' tests/e2e/admin-lifecycle-layout.spec.ts` | `tests/e2e/admin-lifecycle-layout.spec.ts:508` (ladder sweep) and `tests/e2e/admin-lifecycle-layout.spec.ts:532` (real run) are inside T-REGROW; the other three are in the T-CONFIRM-SCROLL, `T-FIT/T-REACH` and `T-TRANSITION` cases, enumerated by enclosing test name and filed as `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` rather than fixed here (spec §8) |
| T1(d)'s read path — the composite parses to steps carrying `uses`/`with` | parsed the composite manifest at `.github/actions/setup/action.yml` with the `yaml` package | 3 steps: `{uses: pnpm/action-setup@v4}`, `{uses: actions/setup-node@v4, with: {node-version: 20, cache: "pnpm"}}`, `{run: "pnpm install --frozen-lockfile", shell: "bash"}`. **`node-version` parses as the NUMBER 20, not a string** — the `toEqual` comparison must not assume a string, and the inlined copy uses the same literal so it parses the same way. The install step also carries `shell: bash`, so the run-step comparison is on `.run` alone, not the whole step |
| T1(h) item 3's read path — one version per allow-listed name, split on the LAST `@` | `parse(readFileSync("pnpm-lock.yaml")).packages`, 1034 keys | `@sentry/cli` -> `["2.58.5"]`, `esbuild` -> `["0.28.0"]`, `sharp` -> `["0.34.5"]`, `unrs-resolver` -> `["1.11.1"]` — each a one-element set today, which is what the `toEqual` expects |
| `measure()` is idempotent (safe to retry) | read of the helper at `tests/e2e/admin-lifecycle-layout.spec.ts:437-470` | saves `priorMaxH`, reads, restores |
| `toPass` template already used in this file | `tests/e2e/admin-lifecycle-layout.spec.ts:481-486` (`openHub`'s kebab retry, `{ timeout: 15_000 }`) | confirmed — the new blocks match it |
| `spec:lint` passes on the spec | `pnpm spec:lint docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md` | `summary: 0 hard` (advisories are cross-document section numbers and per-item counts, all correct as written; the exact advisory count moves with each repair round and is re-reported in the review dispatch rather than pinned here) |

## Meta-test inventory (mandatory declaration)

**EXTENDS** `tests/cross-cutting/unit-suite-shard-topology.test.ts` — spec §5 items (a) through (h), all scoped to `unit-suite-db`.

**CREATES** `tests/cross-cutting/e2e-regrow-settle-contract.test.ts` — a structural guard that T-REGROW's body contains no `page.waitForTimeout(`, so the fixed wait cannot creep back. It is the TDD hook for T2.

**Not applicable, declared explicitly:** the Supabase call-boundary registry (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call is added; the advisory-lock topology pin (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` surface; the mutation-surface observability registry (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler and no `"use server"` action; the `admin_alerts` catalog (`tests/messages/_metaAdminAlertCatalog.test.ts`) — no alert code.

---

## T1 — the boot/install overlap (ONE TDD cycle, ONE commit)

Invariant 1 is `failing test → minimal implementation → passing test → commit`, so the meta-test and the workflow edit are ONE task. An earlier draft split them and committed the red block; that is `test → commit → implementation` and is a P0 regardless of test status.

**Step 1 — the failing test.** Extend `tests/cross-cutting/unit-suite-shard-topology.test.ts` with a `describe("unit-suite-db boot/install overlap")` block. The block is RED against the current workflow. Two of its items are not red-first and are not meant to be: **(f)** already passes (today's job invokes the shared bootstrap exactly once, `.github/workflows/unit-suite.yml:125`) and **(h)** already passes (it pins lifecycle, `allowBuilds` and lockfile state that step 2 does not change). Both are REGRESSION pins carried in the same block because they belong to the same contract. Items (a) through (e) and (g) are the red-first ones.

Assertions, one `it` each, lettered to the spec's §5:

- **(a) ordering** — parse the workflow, take `jobs["unit-suite-db"].steps`, assert the index order `actions/checkout@v4` < `pnpm/action-setup@v4` < `actions/setup-node@v4` < `supabase/setup-cli@v1` < the psql step < the combined step < `./.github/actions/assert-pnpm-sources` < the vitest step. Identify the combined step as the single step whose `run` contains `supabase-local-bootstrap.sh`.
- **(b)+(g) body equality** — take the combined step's `run`, drop blank lines and `#` comment lines, `trimEnd` each remaining line, assert the result equals exactly:

  ```
  set -euo pipefail
  bash scripts/ci/supabase-local-bootstrap.sh &
  boot_pid=$!
  pnpm install --frozen-lockfile
  wait "$boot_pid"
  ```

  Equality, not a substring or denylist: spec §5g records why a denylist cannot close the class (`pnpm install ... || kill "$boot_pid"` contains no banned token yet masks the install failure).
- **(c) fail-closed at both levels** — body level: the last non-comment line is the `wait`, and the body matches none of `/\|\|\s*true/`, `/set \+e/`, `/\bexit 0\b/`, `/\btrap\b/`. Step level: the combined step's key set is exactly `["name", "run"]`. Body equality alone does not pin fail-closed behaviour — an expression-valued `continue-on-error`, a `shell:` override, an `if:`, or a `working-directory:` masks or redirects a byte-identical body. Same qualification the file already applies to the vitest step and to the guard step (`tests/cross-cutting/unit-suite-shard-topology.test.ts:131-141`, `tests/cross-cutting/unit-suite-shard-topology.test.ts:164-166`).
- **(d) prerequisites derived from the composite** — parse `.github/actions/setup/action.yml` and partition its steps. Every `uses:` step must have a matching step in `unit-suite-db` before the combined step with identical `uses`, identical `with`, and an identical full key set. Separately, the composite must contain EXACTLY ONE `run:` step, whose command equals the install line inside the combined step body — without that count assertion, a second `run:` prerequisite added to the composite would leave a `uses`-keyed matcher matching nothing and passing vacuously (spec §5d).
- **(e) install exactly once** — exactly one step in `unit-suite-db` has a `run` containing `pnpm install`, and no step in that job has `uses: ./.github/actions/setup`.
- **(f) bootstrap exactly once** — exactly one step's `run` contains `scripts/ci/supabase-local-bootstrap.sh`, invoked as `bash scripts/ci/supabase-local-bootstrap.sh` (shared-script contract).
- **(h) install write-surface guard** — read `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`. Three pins, each with a failure message naming spec §3.2 as the audit to re-run:
  1. `scripts` contains none of `preinstall`, `install`, `postinstall`, `preprepare`, `postprepare`, `prepublish`, `prepublishOnly` — the set `pnpm install` executes, which is NOT `pnpm rebuild`'s set (`preprepare`/`postprepare` run on install only, spec §3.2); plus `scripts.prepare === "simple-git-hooks"` and `pkg["simple-git-hooks"]` equal to `{ "pre-commit": "pnpm exec lint-staged" }`.
  2. the parsed `allowBuilds` map `toEqual`s `{ "@sentry/cli": true, esbuild: true, sharp: true, "simple-git-hooks": false, "unrs-resolver": true }` — booleans included, so `simple-git-hooks` flipping to `true` (a new executing build script) fails.
  3. the audited VERSIONS of the four enabled build packages, from `pnpm-lock.yaml`'s `packages:` keys (the version is the key's SUFFIX, not the entry's value; the real keys carry the version after the LAST `@` — and the Sentry CLI key is scoped, so its name itself contains one, which is why the split must be on the last occurrence and not the first). For each name build the COMPLETE set of matching versions and `toEqual` it against a one-element expected set. Not a first match: `allowBuilds` is keyed by name, so a lockfile carrying two versions of an allow-listed package permits BOTH install scripts.

**Step 2 — the implementation.** Edit `.github/workflows/unit-suite.yml`, job `unit-suite-db` only, per spec §4: inline the composite's two non-install actions, move `supabase/setup-cli@v1` and the psql step above the new combined step, add the combined step with the §4 body verbatim. `unit-suite-nodb` and the aggregator are untouched. The step comment is ASCII only, per `scripts/ci/assert-pnpm-sources-clean.sh`, which runs live in this job and refuses non-ASCII outside `#` comment lines.

**Step 3 — verify green.**

1. `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts` — all green, including every pre-existing assertion.
2. `pnpm exec vitest run tests/cross-cutting/ci-workflow-speedup.test.ts tests/cross-cutting/vitest-projects-partition.test.ts` — green (the psql-guard-on-one-line assertion lives in the first).
3. `bash scripts/ci/assert-pnpm-sources-clean.sh` — green against the edited workflow.
4. `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/unit-suite.yml','utf8'))"` — parses.

**Commit:** `perf(infra): overlap the Supabase boot with pnpm install in unit-suite-db`

## T2 — the T-REGROW settle contract (ONE TDD cycle, ONE commit)

**Step 1 — the failing guard.** Create `tests/cross-cutting/e2e-regrow-settle-contract.test.ts`. It reads `tests/e2e/admin-lifecycle-layout.spec.ts`, slices the T-REGROW test body (from the line containing `test("T-REGROW:` to the line containing the `// ── T-CARET-1` banner that opens the next case), and asserts:

- the slice contains no `page.waitForTimeout(` — the settle must be condition-based;
- for EACH of the two occurrences of `archive-show-confirm-button` in the slice, the following **900** characters contain both `measure()` and `.toPass(` and contain no `waitForTimeout`. The window is measured, not guessed: applying the step-2 edits to a scratch copy puts `.toPass(` at +333 for the ladder site and **+733** for the real-run site (whose retried block carries the two invariant comments), with `measure()` at +107 and +103. A 600-char window would fail the correct implementation; 900 clears the larger site by ~170 characters and stays far short of the ~1,280 separating the two sites. A slice-wide `.toPass(` COUNT does not work at all here: `openHub`'s kebab-click retry is inside the slice, so "at least two" is satisfied by `openHub` plus one converted measurement and a half-done conversion would pass;
- anti-vacuity: the slice is non-empty, exceeds 500 characters, and contains `archive-show-confirm-button`, so a bad regex fails loudly instead of vacuously passing.

Red against the current spec body (two `waitForTimeout` calls inside T-REGROW).

**Project wiring for the new file, verified:** `tests/cross-cutting/` is not in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:86-101`), so the file defaults into the `serial` project and runs in `unit-suite-db` — no workflow path filter, no `testMatch` entry, and no new CI wiring is needed. It is a vitest test file under `tests/cross-cutting/`, not a Playwright spec, so no Playwright config matches it. `tests/cross-cutting/vitest-projects-partition.test.ts` is the executable confirmation and is in step 3.

**Step 2 — the implementation.** Edit `tests/e2e/admin-lifecycle-layout.spec.ts`:

- **Ladder sweep** (currently `tests/e2e/admin-lifecycle-layout.spec.ts:508`): replace `await page.waitForTimeout(250)` with

  ```ts
  await expect(async () => {
    const probe = await measure();
    expect(probe, "armed measurement returned null").not.toBeNull();
    expect(probe!.natural, "armed body has not grown past the idle body yet").toBeGreaterThan(
      idle.natural,
    );
  }).toPass({ timeout: 15_000 });
  const armed = await measure();
  if (!armed) continue;
  ```

  The settle probe and the value the rung uses are two separate `measure()` calls, deliberately. Capturing into an outer `let` assigned only inside the callback does NOT typecheck: TypeScript does not assume a callback ran, so the existing `if (!armed) continue` narrows the rest of the rung to `never` and `armed.natural` fails with TS2339. Growth is the right settle condition here because the rung's decision depends on the armed NATURAL height, not on where placement put it; a rung where growth never appears now fails its own `toPass` instead of silently selecting a wrong height.

- **Real run** (currently `tests/e2e/admin-lifecycle-layout.spec.ts:532`): replace `await page.waitForTimeout(300)` and the three assertions that follow it with one retried block, so a transient pre-re-placement state retries rather than failing:

  ```ts
  await expect(async () => {
    const armed = await measure();
    expect(armed, "armed measurement returned null").not.toBeNull();
    // The invariant: still inside the clip rect after the growth.
    expect(armed!.bodyTop).toBeGreaterThanOrEqual(armed!.boundsTop - TOL);
    expect(armed!.bodyBottom).toBeLessThanOrEqual(armed!.boundsBottom + TOL);
    // And it got there by RE-PLACING, not by a CSS cap that happened to bite:
    // either the side flipped or a fitted max-height was written.
    const replaced = armed!.side !== idle!.side || armed!.inlineMaxHeight !== "";
    expect(replaced, "placement did not re-run when the body grew").toBe(true);
  }).toPass({ timeout: 15_000 });
  ```

  The assertions move INTO the block and are deleted from below it, so each is asserted exactly once. A regression in which placement never re-runs still fails — the block never passes and `toPass` times out with the same assertion text.

**Step 3 — verify green.**

1. `pnpm exec vitest run tests/cross-cutting/e2e-regrow-settle-contract.test.ts tests/cross-cutting/vitest-projects-partition.test.ts` — green (the second confirms the new file lands in exactly one project).
2. `pnpm exec tsc --noEmit` — clean. Already probed: both snippets were applied to a scratch copy of the spec file and `tsc --noEmit` exited 0 with no diagnostics, including the follow-up-null `continue` path; the copy was reverted.
3. The e2e run, with the harness contract stated rather than implied (writing-plans e2e rule):
   - **Server:** the baseline Next server on `E2E_PORT` (default 3000), booted by `playwright.config.ts`'s webServer array. Run with `BASELINE_SERVER_ONLY=1` so ONLY that server boots — the array otherwise carries five servers and the other four cold-build for nothing (`playwright.config.ts:390-410`). This is exactly what `lifecycle-layout-e2e.yml:79` sets.
   - **Reuse hazard, named:** `reuseExistingServer: !process.env.CI` (`playwright.config.ts:245`), so a stale server on that port from another checkout WILL be reused and the run would silently test the wrong tree. Before the run, confirm nothing is listening (`lsof -ti tcp:3000`) or set a distinct `E2E_PORT`.
   - **Command:** `BASELINE_SERVER_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-layout.spec.ts -g "T-REGROW"` — the same project and spec `lifecycle-layout-e2e.yml:110` runs.
   - **Readiness gate:** the spec's own, unchanged — `openHub` awaits `LOADED_REVIEW_MODAL` (`tests/e2e/admin-lifecycle-layout.spec.ts:57`) visible with a 30s timeout, then retries the kebab click until the popover is visible. Not `networkidle`.
   - **Detach safety:** `measure()` is a `page.evaluate` that re-queries by `data-testid` on every call and returns `null` when the node is absent — it never holds a `locator.evaluate` handle across a remount, so retrying it cannot hang on an unmounted node.
   - Record the run in `## Review + ship`. A single green run is not proof a flake is gone and is not claimed as such.

**Commit:** `test(e2e): settle T-REGROW's armed measurements on a condition, not a fixed wait`

## T3 — pre-push ledger updates (no executable surface; TDD failing-test-first declared N/A)

Invariant 1 declared explicitly rather than skipped silently: this task edits ledger PROSE only. It adds no behaviour and no code path, so there is no assertion that could meaningfully fail first — the applicable contract is that `tests/docs/` stays green, which is a regression gate, not a red-first hook. (The one ledger change that DOES have a red-first hook is the graduation in T4, and it is written that way there.)

`BACKLOG.md`:

- In `BL-E2E-LIFECYCLE-SPECS-CI-DARK`, mark the "New instance observed 2026-07-26" paragraph fixed by this branch, leaving the ~60-app-dependent-spec umbrella OPEN and untouched.
- In `BL-CI-OVERLAP-BOOT-WITH-SETUP`, record that the spec's two blocking preconditions are discharged (write-surface audit redone empirically on x86_64 Linux; topology reconciled) and that the accept/revert decision is pending the PR's real-CI measurement. The row stays OPEN.
- `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` needs NO edit here: it was filed with the plan commit anchored by ENCLOSING TEST NAME (T-CONFIRM-SCROLL, `T-FIT/T-REACH @ 390x{height}`, `T-TRANSITION`), precisely because T2 inserts lines above two of the three and any line anchor would rot the moment T2 lands. Spec §8 carries the same anchoring. Confirm both still read correctly after T2 — the check is that neither cites a line inside the edited region.

**Verify:** `pnpm exec vitest run tests/docs/` — green.

**Commit:** `docs(backlog): record the T-REGROW fix and the discharged overlap preconditions`

## T4 — post-CI: measure, decide, record (after the first COMPLETED real-CI run, before merge)

Scheduled after the run COMPLETES, whatever its outcome — the revert branch exists precisely for the not-green case, and gating on green would make it unreachable. The steps are ordered so that measurement happens BEFORE classification, because spec §7.4 requires the figures recorded either way.

1. **Measure first, unconditionally.** Run `legfix <PR run id>` and `legfix <baseline run id>` (baseline chosen by spec §7.1's rule). Record in the PR body: both run IDs, both leg counts, both medians, **and both max legs** (same `--jq`, `max` in place of the median step). If `legfix` on the PR run exits 1 with `FAIL: n legs, expected 8`, record `n` and the per-leg values it did emit — that non-zero exit is DATA, not a tooling failure: fewer than eight legs reported means fewer than eight completed, which is itself a classification input for step 2.
2. **Classify the run by the conclusion of every REQUIRED job** — the 8 `unit-suite-db` legs, the 3 `unit-suite-nodb` legs, and the `unit-suite` aggregator (`gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'`). Exactly one branch applies:
   - **Every required job `success`** → go to step 3.
   - **Any required job `failure`, `cancelled`, `timed_out`, `skipped`, or ABSENT from the job list** → not accepted. `cancelled` and `skipped` most often mean a superseding push or a `needs` short-circuit rather than a defect, and an absent leg means the matrix did not fully expand; in all of these, attribute first. If the cause is attributable to the overlap — a boot or install failure inside the combined step, or a leg that never reached the vitest step — go to step 4. If it is unrelated (an infrastructure flake, a superseded run), re-run and return to step 1 with the new run. Say in the PR body which happened.
3. **Accept** only if ALL of these hold; otherwise go to step 4.
   - every required job concluded `success` (step 2);
   - the leg-median fixed overhead dropped by ≥8s versus the baseline (step 1);
   - **the boot log is present in every one of the 8 db legs** — spec §7.1 criterion 1, and the one criterion a conclusions-plus-median check would silently skip. Backgrounding must not hide the bootstrap's output. Verified by token count, not by eye: `gh run view <id> --log | grep -c 'Started supabase local development setup'` must be exactly 8. That token was chosen by probing a real run — on main run 30783618781 it appears exactly 8 times, once per db leg, alongside `Initialising schema` and `Seeding globals` at the same count.

   Then graduate `BL-CI-OVERLAP-BOOT-WITH-SETUP`, TDD-shaped because a real red-first hook exists: FIRST add its row to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts:90` (`{ id: "BL-CI-OVERLAP-BOOT-WITH-SETUP", provenance: "chore/ci-boot-overlap-and-popover-flake" }`) — red, because the entry is still in `BACKLOG.md` and absent from the archive — THEN move the entry to `BACKLOG-archive.md` with the recorded figures and a section naming that branch, and re-run to green. Without the registry row the move alone satisfies only the no-overlap assertion; the archive-only and section-scoped provenance assertions (`tests/docs/_metaDeferralLedgerGraduation.test.ts:351` and `tests/docs/_metaDeferralLedgerGraduation.test.ts:357`) run only for registered ids.
4. **Revert item 1.** ONE operation over the PAIR of item-1 files — `.github/workflows/unit-suite.yml` AND the `describe` block T1 added to `tests/cross-cutting/unit-suite-shard-topology.test.ts` — because that block pins the combined step's existence; reverting only the workflow leaves the suite red (spec §7). T2's work and its guard are untouched by this path and still ship. `BL-CI-OVERLAP-BOOT-WITH-SETUP` stays OPEN, updated with the step-1 figures and the step-2 classification that forced the revert, so the next attempt starts from data rather than from this spec's projection. Then re-run the pre-push ladder and push; the revert commit needs its own green CI before merge.

**Verify:** `pnpm exec vitest run tests/cross-cutting/ tests/docs/` — green on whichever tree results.

**Commit:** `docs(backlog): record the measured boot/install overlap result` (accept) or `revert(infra): back out the boot/install overlap — measured <n>s, below the 8s floor` (revert).

---

## Snippet-typecheck note (writing-plans rule)

Both of T2's snippets have ALREADY been typechecked against the real file, not merely scheduled for it: applied to a scratch copy of `tests/e2e/admin-lifecycle-layout.spec.ts`, `pnpm exec tsc --noEmit` exited 0 with no diagnostics, and the copy was reverted. T2's verify step 2 re-runs the same check on the committed tree. Two strict-mode hazards were designed around rather than discovered at paste time: `measure()` returns a nullable object, so every field read goes through a `!` after an explicit non-null assertion (matching the existing style at `tests/e2e/admin-lifecycle-layout.spec.ts:534-546`); and the sweep does NOT capture out of its `toPass` callback at all — it settles inside the block and re-measures after it. TypeScript narrows a `let` assigned only inside a callback to `never` on the outside read, and an explicit `Awaited<ReturnType<typeof measure>>` annotation does not rescue it: a strict compiler probe during plan review r2 reproduced `Property 'natural' does not exist on type 'never'` against exactly that form. That is why the snippet has the shape it has.

## Failure modes each new test catches (anti-tautology declaration)

| Test | Concrete failure it catches | Why it is not tautological |
| --- | --- | --- |
| T1(a) ordering | someone moves `supabase/setup-cli` back below the combined step: the bootstrap runs with no `supabase` binary on PATH and every db leg reds with a confusing error | asserts indices from the parsed step list, not a substring of the file |
| T1(b)/(g) body equality | the exact regression rounds 5-7 of the design named: `pnpm install ... \|\| kill "$boot_pid"` — no banned token, yet the install failure is masked whenever the final `wait` succeeds | equality admits nothing; a denylist admits that line |
| T1(d) prerequisites | someone bumps `node-version` or drops `cache: pnpm` in the composite; the db job silently keeps the old toolchain or loses the warm store | expectations are READ from the composite, so the test cannot drift with it |
| T1(e) install once | the composite is re-added alongside the inlined install: two concurrent installs, saving erased, possible store race | counts steps in the parsed job, and separately forbids the composite `uses` |
| T1(h) allowBuilds | a new dependency gets a build script allow-listed, or `simple-git-hooks` flips to `true` — either introduces an unaudited writer running concurrently with the bootstrap | pins the whole map including booleans; a key-presence check would pass with any value |
| T2's settle contract | the fixed wait is re-introduced, or only ONE of the two armed measurements is converted | anchors per ARMING SITE, not on a slice-wide `toPass` count: `openHub`'s own retry lives inside the slice, so a count-based check is already satisfied by `openHub` plus one converted measurement and a half-done conversion would pass. Three anti-vacuity anchors bound the slice itself |

Not claimed: T2 does not prove the flake is gone. It removes a timing-dependent read and pins that the removal stays. The evidence is the mechanism, not a green run.

## Review + ship

1. Spec self-review — done (spec §1.1 do-not-relitigate table, live-citation pass, numeric sweep, `pnpm spec:lint` 0 hard).
2. **Adversarial review (cross-model), spec** — Codex, iterate to APPROVE. Findings + dispositions recorded here.
3. Plan self-review — this section's checklist.
4. **Adversarial review (cross-model), plan** — Codex, iterate to APPROVE. Findings + dispositions recorded here.
5. TDD execution: T1, T2, T3 — one commit per task, each a complete red-to-green cycle (T3's failing-test-first is declared N/A in its own body). T4 is post-CI by construction and is NOT part of this step.
6. **Whole-diff adversarial review (cross-model)** — fresh-eyes posture, iterate to APPROVE.
7. Push; wait for the real-CI run to COMPLETE (not merely to go green — T4 owns the not-green case); then run **T4**: measure, classify, decide accept or revert, record both run IDs, both leg counts, both medians and both max legs in the PR body, and land the resulting commit. On the revert path that commit needs its own green CI run. Then `gh pr merge --merge`; fast-forward `main` until `git rev-list --left-right --count main...origin/main` reports `0	0`.

### Round record

**Spec r1 (Codex) — NEEDS-ATTENTION, 10 findings, all accepted.** 3 HIGH: `pnpm rebuild` is not a proxy for `pnpm install`'s lifecycle set (install also runs `preprepare`/`postprepare`); the probe ran on Darwin arm64 while the build scripts branch on platform; the write-surface guard pinned names and booleans but not versions. 4 MEDIUM: body equality does not pin step-level failure masking; the composite-derived check could pass vacuously; the accept metric left median arithmetic and baseline choice to the operator; the bootstrap command "enumeration" was wrong. 3 LOW: the T-CONFIRM-SCROLL exclusion rationale was false; §4.1 omitted two live guards; the composite blast-radius count was stale. Repairs: a second probe (fresh `pnpm install --frozen-lockfile` inside a `linux/amd64 node:20-bookworm` container, all four build scripts executed, zero writes under `supabase/`), version pins in §5h, step-key qualification, a `legfix` function that fails unless 8 legs report, a deterministic baseline rule, corrected counts, and `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` filed.

**Spec + plan r2 (Codex) — NEEDS-ATTENTION, 7 findings, all accepted.** 3 HIGH: the T3b sweep snippet does not typecheck (a `let` assigned only inside the `toPass` callback narrows to `never`; the annotation does not rescue it — reproduced by compiler probe); T4 was scheduled before the real-CI evidence it needs, and the revert path did not say that item 1's revert must take BOTH its files; the version guard admitted a second lockfile version of an allow-listed package. 2 MEDIUM: T3a's "two `toPass` calls" is already satisfied by `openHub`'s own retry plus one converted measurement; the repaired command vocabulary was STILL incomplete (`set`, `trap`, `[`, `true`). 2 LOW: "every new assertion is red before T2" is false for (f) and (h); the spec's revert file inventory omitted the new guard file. Repairs: the sweep settles inside the block and re-measures after it; T4 split into T4 (pre-push ledger) and T5 (post-CI measure/decide/record) with the paired revert spelled out; the version pin compares the COMPLETE matching-version set; T3a anchors per arming site; the vocabulary enumeration is dropped in favour of the grep that the claim actually rests on; the red-first claim is scoped to (a)-(e) and (g); the revert inventory is a table.

**Spec + plan r3 (Codex) — BLOCKING, 10 findings, all accepted.** 1 BLOCKING: the plan violated invariant 1's TDD shape in three places — T1 committed while red, and two ledger tasks had no failing-test-first at all. 2 HIGH: T3a's 600-character arming-site window rejects the plan's own correct implementation (measured +733 at the real-run site); T4's revert branch was unreachable because it was gated on a GREEN run, ran `legfix` unconditionally before deciding, and checked only the 8 db legs where the spec requires all 8 + 3 + aggregator. 4 MEDIUM: probe B overstated platform fidelity (Debian 12 is not Ubuntu 24.04) and its evidence (`find -newer` cannot see deletions, and no `git status` equivalent ran); the e2e verification named no server mode, port, config, hydration gate or detach-safety and could reuse another checkout's server; the accept path omitted the `BACKLOG_GRADUATED` registry row without which the graduation assertions never run for the id; the PR body omitted the max leg the spec requires. 3 LOW: the new vitest file's project wiring was undeclared; the residue citations would go stale the moment T2 lands; the recorded lint count was stale. Repairs: T1 and T2 are each ONE red→green→commit cycle; T3 is ledger prose with the TDD N/A declared and reasoned; T4 fires on run COMPLETION with an explicit red branch, checks every required leg, and does the graduation registry-row-first so it too is red→green; the window is 900 with the measurement recorded; probe B re-run with a 126-file `sha256sum` manifest diffed before and after (IDENTICAL) and its distro gap stated as a documented limit; the e2e harness contract is spelled out including the `reuseExistingServer` hazard; max leg added; project wiring verified against `vitest.projects.ts:86-101`; every residue citation re-anchored to enclosing test names in spec, plan and `BACKLOG.md`.

**Spec + plan r4 (Codex) — NEEDS-ATTENTION, 4 findings, all accepted.** 3 HIGH: T4's decision tree handled only "red" and "all green", leaving `cancelled`/`skipped`/`timed_out`/absent-leg outcomes unclassified, and it invoked `legfix` only after everything was green, which made the fewer-than-eight signal unreachable and skipped the figures the spec requires either way; the accept path omitted the ratified boot-log-present criterion entirely, so it could accept a run that fails an explicit criterion; stale task numbering (T5, T3a, T3b) survived the r3 restructure in the ship checklist, the snippet note and the failure-mode table. 1 MEDIUM: probe B's manifest is end-state only and cannot see transient create/delete, mode-only, symlink or directory activity — which is exactly the concern for CONCURRENT access. Repairs: T4 now measures FIRST and unconditionally (its non-zero exit recorded as data), then classifies every required job by conclusion with an explicit branch for each non-`success` state including absence, and its accept condition carries the boot-log check as a token count — `Started supabase local development setup` must appear exactly 8 times, a token chosen by probing main run 30783618781 where it appears exactly 8 times; every stale task number fixed; and probe B was run a THIRD time with `inotifywait -m -r` over `supabase/` for the whole install, recording ZERO events of any kind with the watch confirmed established.

## Pre-push ladder record (contract, not a transcript)

Before the push in step 7, run and record: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec vitest run tests/cross-cutting/ tests/docs/ tests/ci/`, and `bash scripts/ci/assert-pnpm-sources-clean.sh`. Real CI is the gate that decides item 1 (spec §7); local green is necessary, not sufficient — "local-passes-CI-fails is its own bug class" is a standing project rule and this diff's whole subject is a CI workflow.

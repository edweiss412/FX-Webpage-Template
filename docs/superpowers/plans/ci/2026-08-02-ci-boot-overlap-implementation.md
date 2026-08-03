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
| …and on the TARGET platform, from a FRESH install | `git archive HEAD` piped into `--platform linux/amd64 node:20-bookworm`, `corepack enable`, `pnpm install --frozen-lockfile`, then `find supabase -newer` | x86_64, Debian 12; the same 4 build scripts + `prepare` ran; nothing under `supabase/`; one Linux-only candidate `@parcel/watcher` 2.6.0 correctly IGNORED (spec §3.2 probe B) |
| `pnpm install` runs `preprepare`/`postprepare`; `pnpm rebuild` does not | pnpm 10.33.2 lifecycle sets, surfaced in spec review r1 | T1(h) forbids both keys |
| The setup composite's blast radius | `grep -rc 'uses: ./.github/actions/setup$' .github/workflows/` | 31 job steps across 17 workflows (the composite's own comment says "~20 across 8" and is stale) |
| T-REGROW's two fixed waits | `grep -n 'waitForTimeout' tests/e2e/admin-lifecycle-layout.spec.ts` | `tests/e2e/admin-lifecycle-layout.spec.ts:508` (ladder sweep) and `tests/e2e/admin-lifecycle-layout.spec.ts:532` (real run) are inside T-REGROW; the calls at lines 378, 916 and 998 are other cases in the same file, enumerated and filed as `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` rather than fixed here (spec §8) |
| `measure()` is idempotent (safe to retry) | read of the helper at `tests/e2e/admin-lifecycle-layout.spec.ts:437-470` | saves `priorMaxH`, reads, restores |
| `toPass` template already used in this file | `tests/e2e/admin-lifecycle-layout.spec.ts:481-486` (`openHub`'s kebab retry, `{ timeout: 15_000 }`) | confirmed — the new blocks match it |
| `spec:lint` passes on the spec | `pnpm spec:lint docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md` | `summary: 0 hard, 17 advisory` (advisories are cross-document section numbers and per-item counts, all correct as written) |

## Meta-test inventory (mandatory declaration)

**EXTENDS** `tests/cross-cutting/unit-suite-shard-topology.test.ts` — spec §5 items (a) through (h), all scoped to `unit-suite-db`.

**CREATES** `tests/cross-cutting/e2e-regrow-settle-contract.test.ts` — a structural guard that T-REGROW's body contains no `page.waitForTimeout(`, so the fixed wait cannot creep back. It is the TDD hook for T3.

**Not applicable, declared explicitly:** the Supabase call-boundary registry (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call is added; the advisory-lock topology pin (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` surface; the mutation-surface observability registry (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler and no `"use server"` action; the `admin_alerts` catalog (`tests/messages/_metaAdminAlertCatalog.test.ts`) — no alert code.

---

## T1 — meta-test first: pin the combined step's shape (FAILING)

Extend `tests/cross-cutting/unit-suite-shard-topology.test.ts` with a `describe("unit-suite-db boot/install overlap")` block. The block as a whole is RED against the current workflow, which is the TDD hook. Two of its items are not red-first and are not meant to be: **(f)** already passes (today's job invokes the shared bootstrap exactly once, `.github/workflows/unit-suite.yml:125`) and **(h)** already passes (it pins lifecycle, `allowBuilds` and lockfile state that T2 does not change). Both are REGRESSION pins carried in the same block because they belong to the same contract — (f) so the shared-script invocation survives the rewrite, (h) so the disjointness premise the rewrite depends on cannot rot silently. Items (a) through (e) and (g) are the red-first ones.

Assertions, one `it` each, lettered to the spec's §5:

- **(a) ordering** — parse the workflow, take `jobs["unit-suite-db"].steps`, and assert the index order `actions/checkout@v4` < `pnpm/action-setup@v4` < `actions/setup-node@v4` < `supabase/setup-cli@v1` < the psql step < the combined step < `./.github/actions/assert-pnpm-sources` < the vitest step. Identify the combined step as the single step whose `run` contains `supabase-local-bootstrap.sh`.
- **(b)+(g) body equality** — take the combined step's `run`, drop blank lines and `#` comment lines, `trimEnd` each remaining line, and assert the result equals exactly:

  ```
  set -euo pipefail
  bash scripts/ci/supabase-local-bootstrap.sh &
  boot_pid=$!
  pnpm install --frozen-lockfile
  wait "$boot_pid"
  ```

  Equality, not a substring or denylist: spec §5g records why a denylist cannot close the class (`pnpm install ... || kill "$boot_pid"` contains no banned token yet masks the install failure).
- **(c) fail-closed at both levels** — body level: the last non-comment line is the `wait`, and the body matches none of `/\|\|\s*true/`, `/set \+e/`, `/\bexit 0\b/`, `/\btrap\b/`. Step level: the combined step key set is exactly `["name", "run"]`. Body equality alone does not pin fail-closed behaviour — an expression-valued `continue-on-error`, a `shell:` override, an `if:`, or a `working-directory:` masks or redirects a byte-identical body. Same qualification the file already applies to the vitest step and to the guard step (`tests/cross-cutting/unit-suite-shard-topology.test.ts:131-141`, `tests/cross-cutting/unit-suite-shard-topology.test.ts:164-166`).
- **(d) prerequisites derived from the composite** — read and parse `.github/actions/setup/action.yml` and partition its steps. Every `uses:` step must have a matching step in `unit-suite-db` before the combined step with identical `uses`, identical `with`, and an identical full key set. Separately, the composite must contain EXACTLY ONE `run:` step, whose command equals the install line inside the combined step body — without that count assertion, a second `run:` prerequisite added to the composite would leave a `uses`-keyed matcher matching nothing and passing vacuously (spec §5d).
- **(e) install exactly once** — exactly one step in `unit-suite-db` has a `run` containing `pnpm install`, and no step in that job has `uses: ./.github/actions/setup`.
- **(f) bootstrap exactly once** — exactly one step's `run` contains `scripts/ci/supabase-local-bootstrap.sh`, and it is invoked as `bash scripts/ci/supabase-local-bootstrap.sh` (shared-script contract).
- **(h) install write-surface guard** — read `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`. Three pins, each with a failure message naming spec §3.2 as the audit to re-run:
  1. `scripts` contains none of `preinstall`, `install`, `postinstall`, `preprepare`, `postprepare`, `prepublish`, `prepublishOnly` — the set `pnpm install` executes, which is NOT `pnpm rebuild`'s set (`preprepare`/`postprepare` run on install only, spec §3.2); plus `scripts.prepare === "simple-git-hooks"` and `pkg["simple-git-hooks"]` equal to `{ "pre-commit": "pnpm exec lint-staged" }`.
  2. the parsed `allowBuilds` map `toEqual`s `{ "@sentry/cli": true, esbuild: true, sharp: true, "simple-git-hooks": false, "unrs-resolver": true }` — booleans included, so `simple-git-hooks` flipping to `true` (a new executing build script) fails.
  3. the audited VERSIONS of the four enabled build packages, parsed from `pnpm-lock.yaml`'s `packages:` keys (the version is the key's SUFFIX, not the entry's value): 2.58.5, 0.28.0, 0.34.5, 1.11.1. A routine lockfile bump replaces an allow-listed package's install script wholesale while the five-key map is untouched; without this pin the guard stays green over unaudited code. Implementation note: parse the lockfile with the `yaml` package, take the key set of `packages`, and for each of the four names build the COMPLETE set of versions whose key parses to that name, then `toEqual` it against a one-element expected set. Not a first match: `allowBuilds` is keyed by name, so a lockfile carrying two versions of an allow-listed package permits BOTH install scripts, and a first-match check stays green over the unaudited one.

**Verify:** `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts` — the new block is red, every pre-existing `it` in the file is still green.

**Commit:** `test(infra): pin the unit-suite-db boot/install overlap step shape`

## T2 — implement the overlap (T1 GREEN)

Edit `.github/workflows/unit-suite.yml`, job `unit-suite-db` only. Replace `- uses: ./.github/actions/setup` with the composite's two non-install actions inlined; move `supabase/setup-cli@v1` and the psql step above the new combined step; add the combined step with the §4 body verbatim. `unit-suite-nodb` and the aggregator are not touched. Carry a step comment explaining the overlap and pointing at the spec — ASCII only, per `scripts/ci/assert-pnpm-sources-clean.sh`, which runs live in this job and refuses non-ASCII outside `#` comment lines.

**Verify:**

1. `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts` — all green, including every pre-existing assertion.
2. `pnpm exec vitest run tests/cross-cutting/ci-workflow-speedup.test.ts tests/cross-cutting/vitest-projects-partition.test.ts` — green (the psql-guard-on-one-line assertion lives in the first).
3. `bash scripts/ci/assert-pnpm-sources-clean.sh` — green against the edited workflow.
4. `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/unit-suite.yml','utf8'))"` — parses.

**Commit:** `perf(infra): overlap the Supabase boot with pnpm install in unit-suite-db`

## T3 — guard first, then de-flake T-REGROW

**T3a (FAILING).** Create `tests/cross-cutting/e2e-regrow-settle-contract.test.ts`. It reads `tests/e2e/admin-lifecycle-layout.spec.ts`, slices the T-REGROW test body (from the line containing `test("T-REGROW:` to the line before the next top-level `test(` or `for (const [height`), and asserts:

- the slice contains no `page.waitForTimeout(` — the settle must be condition-based;
- for EACH of the two occurrences of `archive-show-confirm-button` in the slice, the following 600 characters contain both `measure()` and `.toPass(` and contain no `waitForTimeout`. A bare count of `.toPass(` in the slice does not work: `openHub`'s kebab-click retry is itself inside the slice, so "at least two" is already satisfied by `openHub` plus ONE converted measurement, and a half-done conversion would pass. Anchoring per arming site is what makes the guard mean "one retry per armed measurement";
- anti-vacuity: the slice is non-empty, exceeds 500 characters, and contains `archive-show-confirm-button`, so a bad regex fails loudly instead of vacuously passing.

Red against the current spec body (two `waitForTimeout` calls inside T-REGROW).

**T3b (GREEN).** Edit `tests/e2e/admin-lifecycle-layout.spec.ts`:

- **Ladder sweep** (currently `tests/e2e/admin-lifecycle-layout.spec.ts:508`): replace `await page.waitForTimeout(250)` with a `toPass` that re-measures until growth is observed, capturing the result:

  ```ts
  await expect(async () => {
    const probe = await measure();
    expect(probe, "armed measurement returned null").not.toBeNull();
    expect(
      probe!.natural,
      "armed body has not grown past the idle body yet",
    ).toBeGreaterThan(idle.natural);
  }).toPass({ timeout: 15_000 });
  const armed = await measure();
  if (!armed) continue;
  ```

  The settle probe and the value the rung actually uses are two separate `measure()` calls, deliberately. Capturing into an outer `let` assigned only inside the callback does NOT typecheck: TypeScript does not assume a callback ran, so the existing `if (!armed) continue` narrows the rest of the rung to `never` and `armed.natural` fails with TS2339. (Verified by strict compiler probe during plan review r2 — an earlier draft of this snippet claimed an explicit `Awaited<ReturnType<typeof measure>>` annotation avoided that, and it does not.) One extra `evaluate` per rung is the cost; the rung already does a full navigation.

  Growth is the right settle condition here because the rung's decision depends on the armed NATURAL height, not on where placement put it. A rung where growth never appears now fails its own `toPass` instead of silently selecting a wrong height.

- **Real run** (currently `tests/e2e/admin-lifecycle-layout.spec.ts:532`): replace `await page.waitForTimeout(300)` with a `toPass` that re-measures and asserts the invariants together, so a transient pre-re-placement state retries rather than failing:

  ```ts
  await expect(async () => {
    const a = await measure();
    expect(a, "armed measurement returned null").not.toBeNull();
    expect(a!.bodyTop).toBeGreaterThanOrEqual(a!.boundsTop - TOL);
    expect(a!.bodyBottom).toBeLessThanOrEqual(a!.boundsBottom + TOL);
    expect(
      a!.side !== idle!.side || a!.inlineMaxHeight !== "",
      "placement did not re-run when the body grew",
    ).toBe(true);
  }).toPass({ timeout: 15_000 });
  ```

  The three assertions that previously followed the fixed wait move INTO the block and are deleted from below it, so they are asserted exactly once. A regression in which placement never re-runs still fails — the block never passes and `toPass` times out with the same assertion text.

**Verify:**

1. `pnpm exec vitest run tests/cross-cutting/e2e-regrow-settle-contract.test.ts` — green.
2. `pnpm exec tsc --noEmit -p tsconfig.json` — clean (the spec file is in the project; `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on).
3. `pnpm exec playwright test tests/e2e/admin-lifecycle-layout.spec.ts -g "T-REGROW" --project=mobile-safari` against a locally-booted app — green. Record the run in `## Review + ship`; a single green run is not proof a flake is gone and is not claimed as such.

**Commit:** `test(e2e): settle T-REGROW's armed measurements on a condition, not a fixed wait`

## T4 — the ledger updates that do NOT depend on real CI (pre-push)

Splitting T4 and T5 is deliberate: the item-1 disposition cannot be written before the evidence that decides it exists, and the evidence is a real-CI run. T4 carries only what is already known at push time.

`BACKLOG.md`: in `BL-E2E-LIFECYCLE-SPECS-CI-DARK`, mark the "New instance observed 2026-07-26" paragraph fixed by this branch, leaving the ~60-app-dependent-spec umbrella OPEN and untouched. In `BL-CI-OVERLAP-BOOT-WITH-SETUP`, record that the spec's two blocking preconditions are discharged (the write-surface audit redone empirically on the target platform; the topology reconciled) and that the accept/revert decision is pending the PR's real-CI measurement — the row stays OPEN.

`BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` was filed in `BACKLOG.md` with the plan commit (so the ledger-integrity test never sees a dangling id mid-branch); T4 leaves it OPEN. It records the three remaining fixed waits in `tests/e2e/admin-lifecycle-layout.spec.ts` (at `tests/e2e/admin-lifecycle-layout.spec.ts:378` in T-CONFIRM-SCROLL, and at `tests/e2e/admin-lifecycle-layout.spec.ts:916` and `tests/e2e/admin-lifecycle-layout.spec.ts:998`), each needing its own settle predicate — T-CONFIRM-SCROLL's is "the production `scrollIntoView` call has been recorded on `window.__siv`", which is not T-REGROW's growth-then-replace and carries its own tautology risk. Enumerating them is what discharges the class-sweep rule; leaving them unfixed is the scope decision (spec §8). Because the row is cited from this plan and from the spec, it MUST exist as a `##` heading in `BACKLOG.md` or `tests/docs/_metaLedgerReferentialIntegrity.test.ts` reds on the dangling id.

Deferral discipline: `BL-CI-OVERLAP-BOOT-WITH-SETUP` graduates to `BACKLOG-archive.md` only if item 1 is ACCEPTED at §7.3; a reverted item 1 stays OPEN with the measurement recorded. `tests/docs/_metaDeferralLedgerGraduation.test.ts` refuses an id that is both active and archived, and refuses an active entry carrying a terminal status.

**Verify:** `pnpm exec vitest run tests/docs/` — green.

**Commit:** `docs(backlog): record the T-REGROW fix and the discharged overlap preconditions`

## T5 — post-CI: measure, decide, and record (after the first green real-CI run, before merge)

This task runs AFTER the push, on the PR's own run. It is the only place the item-1 accept/revert decision is made.

1. Run `legfix <PR run id>` and `legfix <baseline run id>`, the baseline chosen by spec §7.1's rule. Put both leg counts, both medians, and both run IDs in the PR body — per spec §7.4, whichever way the decision goes.
2. **If the median drops by ≥8s and all 8 db legs are green:** item 1 is ACCEPTED. Update `BL-CI-OVERLAP-BOOT-WITH-SETUP` with the two figures and graduate it to `BACKLOG-archive.md` (`tests/docs/_metaDeferralLedgerGraduation.test.ts` refuses an id that is both active and archived, so it is a move, not a copy).
3. **If it does not:** item 1 is REVERTED. The revert is ONE operation over the PAIR of item-1 files — `.github/workflows/unit-suite.yml` AND the new `describe` block in `tests/cross-cutting/unit-suite-shard-topology.test.ts` — because that block pins the combined step's existence; reverting only the workflow leaves the suite red (spec §7). Item 2 and its guard are untouched by this path and still ship. `BL-CI-OVERLAP-BOOT-WITH-SETUP` stays OPEN, updated with the measurement that forced the revert so the next attempt starts from data rather than from this spec's projection. Then re-run the pre-push ladder and push again; a reverted item 1 needs its own green CI before merge.

**Verify:** `pnpm exec vitest run tests/cross-cutting/ tests/docs/` — green on whichever tree results.

**Commit:** `docs(backlog): record the measured boot/install overlap result` (accept path) or `revert(infra): back out the boot/install overlap — measured <n>s, below the 8s floor` (revert path).

---

## Snippet-typecheck note (writing-plans rule)

Both T3b snippets are typechecked in T3's verify step 2 by `tsc --noEmit` over the real file, not in isolation. Two strict-mode hazards were designed around rather than discovered at paste time: `measure()` returns a nullable object, so every field read goes through a `!` after an explicit non-null assertion (matching the existing style at `tests/e2e/admin-lifecycle-layout.spec.ts:534-546`); and the sweep does NOT capture out of its `toPass` callback at all — it settles inside the block and re-measures after it. TypeScript narrows a `let` assigned only inside a callback to `never` on the outside read, and an explicit `Awaited<ReturnType<typeof measure>>` annotation does not rescue it: a strict compiler probe during plan review r2 reproduced `Property 'natural' does not exist on type 'never'` against exactly that form. That is why the snippet has the shape it has.

## Failure modes each new test catches (anti-tautology declaration)

| Test | Concrete failure it catches | Why it is not tautological |
| --- | --- | --- |
| T1(a) ordering | someone moves `supabase/setup-cli` back below the combined step: the bootstrap runs with no `supabase` binary on PATH and every db leg reds with a confusing error | asserts indices from the parsed step list, not a substring of the file |
| T1(b)/(g) body equality | the exact regression rounds 5-7 of the design named: `pnpm install ... \|\| kill "$boot_pid"` — no banned token, yet the install failure is masked whenever the final `wait` succeeds | equality admits nothing; a denylist admits that line |
| T1(d) prerequisites | someone bumps `node-version` or drops `cache: pnpm` in the composite; the db job silently keeps the old toolchain or loses the warm store | expectations are READ from the composite, so the test cannot drift with it |
| T1(e) install once | the composite is re-added alongside the inlined install: two concurrent installs, saving erased, possible store race | counts steps in the parsed job, and separately forbids the composite `uses` |
| T1(h) allowBuilds | a new dependency gets a build script allow-listed, or `simple-git-hooks` flips to `true` — either introduces an unaudited writer running concurrently with the bootstrap | pins the whole map including booleans; a key-presence check would pass with any value |
| T3a settle contract | the fixed wait is re-introduced, or only ONE of the two armed measurements is converted | anchors per ARMING SITE, not on a slice-wide `toPass` count: `openHub`'s own retry lives inside the slice, so a count-based check is already satisfied by `openHub` plus one converted measurement and a half-done conversion would pass. Three anti-vacuity anchors bound the slice itself |

Not claimed: T3 does not prove the flake is gone. It removes a timing-dependent read and pins that the removal stays. The evidence is the mechanism, not a green run.

## Review + ship

1. Spec self-review — done (spec §1.1 do-not-relitigate table, live-citation pass, numeric sweep, `pnpm spec:lint` 0 hard).
2. **Adversarial review (cross-model), spec** — Codex, iterate to APPROVE. Findings + dispositions recorded here.
3. Plan self-review — this section's checklist.
4. **Adversarial review (cross-model), plan** — Codex, iterate to APPROVE. Findings + dispositions recorded here.
5. TDD execution, T1 through T4, one commit per task. T5 is post-CI by construction and is NOT part of this step.
6. **Whole-diff adversarial review (cross-model)** — fresh-eyes posture, iterate to APPROVE.
7. Push; real CI green (not just local); then **T5** — measure per spec §7.1, decide accept or revert, record both figures and both run IDs in the PR body, and land the resulting commit. On the revert path that commit needs its own green CI run. Then `gh pr merge --merge`; fast-forward `main` until `git rev-list --left-right --count main...origin/main` reports `0	0`.

### Round record

**Spec r1 (Codex) — NEEDS-ATTENTION, 10 findings, all accepted.** 3 HIGH: `pnpm rebuild` is not a proxy for `pnpm install`'s lifecycle set (install also runs `preprepare`/`postprepare`); the probe ran on Darwin arm64 while the build scripts branch on platform; the write-surface guard pinned names and booleans but not versions. 4 MEDIUM: body equality does not pin step-level failure masking; the composite-derived check could pass vacuously; the accept metric left median arithmetic and baseline choice to the operator; the bootstrap command "enumeration" was wrong. 3 LOW: the T-CONFIRM-SCROLL exclusion rationale was false; §4.1 omitted two live guards; the composite blast-radius count was stale. Repairs: a second probe (fresh `pnpm install --frozen-lockfile` inside a `linux/amd64 node:20-bookworm` container, all four build scripts executed, zero writes under `supabase/`), version pins in §5h, step-key qualification, a `legfix` function that fails unless 8 legs report, a deterministic baseline rule, corrected counts, and `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` filed.

**Spec + plan r2 (Codex) — NEEDS-ATTENTION, 7 findings, all accepted.** 3 HIGH: the T3b sweep snippet does not typecheck (a `let` assigned only inside the `toPass` callback narrows to `never`; the annotation does not rescue it — reproduced by compiler probe); T4 was scheduled before the real-CI evidence it needs, and the revert path did not say that item 1's revert must take BOTH its files; the version guard admitted a second lockfile version of an allow-listed package. 2 MEDIUM: T3a's "two `toPass` calls" is already satisfied by `openHub`'s own retry plus one converted measurement; the repaired command vocabulary was STILL incomplete (`set`, `trap`, `[`, `true`). 2 LOW: "every new assertion is red before T2" is false for (f) and (h); the spec's revert file inventory omitted the new guard file. Repairs: the sweep settles inside the block and re-measures after it; T4 split into T4 (pre-push ledger) and T5 (post-CI measure/decide/record) with the paired revert spelled out; the version pin compares the COMPLETE matching-version set; T3a anchors per arming site; the vocabulary enumeration is dropped in favour of the grep that the claim actually rests on; the red-first claim is scoped to (a)-(e) and (g); the revert inventory is a table.

## Pre-push ladder record (contract, not a transcript)

Before the push in step 7, run and record: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec vitest run tests/cross-cutting/ tests/docs/ tests/ci/`, and `bash scripts/ci/assert-pnpm-sources-clean.sh`. Real CI is the gate that decides item 1 (spec §7); local green is necessary, not sufficient — "local-passes-CI-fails is its own bug class" is a standing project rule and this diff's whole subject is a CI workflow.

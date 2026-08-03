# CI wall-clock + flake pair — implement the boot/install overlap, and de-flake T-REGROW

**Date:** 2026-08-02
**Status:** SPEC — implementation-only. Two independent items shipped together because both are CI-surface changes with no product code between them.

**Design authority for item 1 is [`2026-07-20-ci-overlap-boot-with-setup.md`](./2026-07-20-ci-overlap-boot-with-setup.md).** Eight adversarial rounds are sunk into that document. Its §1.1 resolved-scope table, its §3 single-shell design, and its §5 accept gate are RATIFIED and are not reopened here. This spec exists to do the three things that document says must happen before it ships, and nothing else:

1. redo the write-surface audit against the real `allowBuilds` inventory (its §3/§4h state a known factual error — the inventory is five keys, not one);
2. reconcile the design against the workflow topology as it exists today, which changed after 2026-07-20 (the job split into `unit-suite-db` / `unit-suite-nodb`);
3. state the meta-test inventory and accept criteria against that current topology.

Item 2 (the T-REGROW e2e flake) is unrelated to item 1 and carries its own §6.

## 1. Scope

**Item 1 — overlap the Supabase boot with `pnpm install` in `unit-suite-db`.** One workflow step backgrounds `scripts/ci/supabase-local-bootstrap.sh`, captures its PID, runs `pnpm install --frozen-lockfile` in the foreground, and `wait`s on the PID, under `set -euo pipefail`.

**Item 2 — replace the fixed `waitForTimeout` calls in T-REGROW's armed measurements** (`tests/e2e/admin-lifecycle-layout.spec.ts`) with `toPass` blocks, the template the rest of that spec already uses. Filed as the "New instance observed 2026-07-26" paragraph of `BL-E2E-LIFECYCLE-SPECS-CI-DARK`.

Out of scope, stated so it is not inferred: the ~60 app-dependent dark e2e specs in that same backlog umbrella. This spec wires nothing new into CI.

### 1.1 Resolved scope — do not relitigate

| Settled | Where |
| --- | --- |
| Image caching is dead as a lever (measured ~19s SLOWER than the registry pull on P1) | 2026-07-20 §1.1, PR #504 |
| Test-membership / shard-count changes are out of scope | 2026-07-20 §1.1, PR #510 |
| The cross-step coordination protocol (sentinel, PID file, deadline arithmetic) is RETIRED — rounds 1–4 died on it. The design is ONE step with a native `wait` | 2026-07-20 §3 |
| The bootstrap script's body is unchanged; this phase changes only WHEN it runs | 2026-07-20 §1.1 |
| A pre-baked/pre-migrated Postgres image is out of scope | 2026-07-20 §1.1, §6 |
| **The install-failure stdout-pipe delay (~70s typical, bounded only by `timeout-minutes: 20`) is an ACCEPTED NON-GOAL.** Killing the background job correctly needs process-group termination + a join + PID-reuse care, and must not interrupt the bootstrap's held-aside-migration restore trap. Bought for a rare path whose only symptom is a slower failure report | 2026-07-20 §3, rounds 5–6 |
| The probe establishing that a detached process survives step boundaries (run 29743206592) is durable but INFORMATIONAL — the §3 design needs none of it | 2026-07-20 §2.1, round 7 |

## 2. Surface reconciliation — what changed since 2026-07-20

The 2026-07-20 spec describes a single 8-leg `unit-suite` job whose steps are `checkout → ./.github/actions/setup → supabase/setup-cli → psql guard → boot → vitest` (its §2 table). That topology no longer exists. Current `.github/workflows/unit-suite.yml`:

| Job | Legs | Boots Supabase | Project |
| --- | --- | --- | --- |
| `unit-suite-db` | 8 | yes | `serial` |
| `unit-suite-nodb` | 3 | no | `parallel` |
| `unit-suite` | — | aggregator, REQUIRED check-context name | — |

Anchors, all in `.github/workflows/unit-suite.yml`: `unit-suite-db` at `.github/workflows/unit-suite.yml:101` with `shard: [1, 2, 3, 4, 5, 6, 7, 8]` at `.github/workflows/unit-suite.yml:108`, the bootstrap step at `.github/workflows/unit-suite.yml:125`, and `--project=serial` at `.github/workflows/unit-suite.yml:133`; `unit-suite-nodb` at `.github/workflows/unit-suite.yml:135` with `shard: [1, 2, 3]` at `.github/workflows/unit-suite.yml:142`, its no-boot rationale comment at `.github/workflows/unit-suite.yml:154`, and `--project=parallel` at `.github/workflows/unit-suite.yml:165`; the aggregator at `.github/workflows/unit-suite.yml:167` with its `needs:` / `if: always()` at `.github/workflows/unit-suite.yml:177`.

Consequences for this implementation, all of them additive:

- **Only `unit-suite-db` changes.** `unit-suite-nodb` boots nothing, so it has nothing to overlap; it keeps `- uses: ./.github/actions/setup` verbatim. The composite is therefore NOT deleted, and `tests/cross-cutting/unit-suite-shard-topology.test.ts:190-196` ("`unit-suite-nodb` must use exactly three actions") stays green untouched.
- **One step exists today that the 2026-07-20 spec does not mention:** `- uses: ./.github/actions/assert-pnpm-sources` (`unit-suite.yml:126-127`), a composite guard, positioned after the boot and before vitest. Its relative order is preserved exactly — it runs after the combined step, before vitest. It is already downstream of the install today, so nothing about it moves.
- **The §2 measurement table is stale as a baseline.** Its `vitest 154s` line was a mixed-project leg. The accept gate (§7) therefore recomputes the baseline from `main` on the SAME topology, which is what 2026-07-20 §5.2 already requires ("versus the main baseline computed the SAME way").

## 3. Write-surface audit, REDONE (this is the correction)

2026-07-20 §3 asserts the concurrent install and the concurrent bootstrap have disjoint filesystem surfaces, and §4h pins `allowBuilds` as the audited inventory — but names only `@sentry/cli`. The real inventory is five keys. That error is why the branch was parked. Audit redone, empirically rather than by inference.

### 3.1 The inventory, verbatim

`pnpm-workspace.yaml` in full:

```yaml
allowBuilds:
  "@sentry/cli": true
  esbuild: true
  sharp: true
  # (comment: reviewed + intentionally NOT built)
  simple-git-hooks: false
  unrs-resolver: true
```

Five keys; four enabled, one deliberately disabled. Lifecycle scripts, read from the installed packages:

| Package | Version | Lifecycle |
| --- | --- | --- |
| `@sentry/cli` | 2.58.5 | `postinstall: node ./scripts/install.js` |
| `esbuild` | 0.28.0 | `postinstall: node install.js` |
| `sharp` | 0.34.5 | `install: node install/check.js \|\| npm run build` |
| `unrs-resolver` | 1.11.1 | `postinstall: napi-postinstall unrs-resolver 1.11.1 check` |
| `simple-git-hooks` | 2.13.1 | `postinstall: node ./postinstall.js` — **not run**, `allowBuilds: false` |

Root lifecycle: `package.json` declares exactly one install-lifecycle script, `prepare: "simple-git-hooks"`, whose config is `{"pre-commit": "pnpm exec lint-staged"}`.

### 3.2 The probe (the thing §4h could not do)

2026-07-20 §4h states the honest limitation: `allowBuilds` holds names and booleans, not commands, so pinning the set cannot prove where an allow-listed dependency writes. This spec closes that by OBSERVING the writes instead of reasoning about them.

Procedure, run in a clean worktree at this branch's tree: mark a timestamp, run `pnpm rebuild` (which executes exactly the enabled build scripts plus the root `prepare` — the install's entire executable surface), then look for anything under `supabase/` newer than the mark, and for any git-visible change under `supabase/`.

Result:

```
$ pnpm rebuild
@sentry/cli postinstall$      ... Done
esbuild postinstall$          ... Done
sharp install$                ... Done
unrs-resolver postinstall$    ... Done
. prepare$ simple-git-hooks   ... Done      (5 lifecycle scripts executed)

$ find supabase -newer "$MARK" -type f
(no output)
$ git status --porcelain supabase/
(no output)
```

All four enabled build scripts plus the root `prepare` executed; **zero writes under `supabase/`**. The disjointness premise now has an audited basis, and it is an observation, not an inference from package names.

### 3.3 Disjointness in the other direction

The premise also requires the BOOTSTRAP not to touch the install's surface. Audited against `scripts/ci/supabase-local-bootstrap.sh`:

- It invokes `supabase`, `docker`, `psql`, `mv`, `mkdir`, `sleep`, `echo` — and **no `node`, `npm`, `npx`, or `pnpm` at all** (grep for those four tokens returns nothing). It therefore never reads `node_modules/`, which is the install's principal write target.
- Its held-aside stash is `STASH_DIR="$(mktemp -d)"` (`scripts/ci/supabase-local-bootstrap.sh:49`), outside the repo entirely. The migrations it moves and restores live under `supabase/migrations/` (`scripts/ci/supabase-local-bootstrap.sh:50-66`), which §3.2 just showed the install never touches.

So the two surfaces are disjoint in both directions, by observation on one side and by enumeration of an eleven-line command vocabulary on the other.

### 3.4 What the guard can still prove, and what it cannot

The §3.2 probe is a point-in-time observation; it cannot bind the future. The durable guard (§5h) is unchanged in KIND from 2026-07-20 §4h — pin the root lifecycle keys and pin the `allowBuilds` set — but is corrected to the real five-key inventory. Its job is to force a human re-run of §3.2 when either set changes, which is the realistic way this premise rots. It still does not, and cannot, prove where an already-allow-listed dependency writes.

## 4. Implementation — item 1

`.github/workflows/unit-suite.yml`, job `unit-suite-db` only. `- uses: ./.github/actions/setup` is replaced by the composite's two non-install actions inlined, followed by the combined step:

```yaml
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - uses: supabase/setup-cli@v1
        with:
          version: 2.107.0
      - name: Install psql (local-DB tests + bootstrap shell out to psql)
        run: command -v psql >/dev/null || (sudo apt-get update && sudo apt-get install -y postgresql-client)
      - name: Boot local Supabase and install dependencies concurrently
        run: |
          set -euo pipefail
          bash scripts/ci/supabase-local-bootstrap.sh &
          boot_pid=$!
          pnpm install --frozen-lockfile
          wait "$boot_pid"
      - name: Refuse node-killing pnpm settings (composite, pre-node, defaults-immune)
        uses: ./.github/actions/assert-pnpm-sources
      - name: Run serial project, shard ${{ matrix.shard }}/8
        ...
```

The step body is the canonical five lines of 2026-07-20 §3, unmodified. `setup-cli` and the psql guard move ABOVE the combined step because the bootstrap needs both on PATH; `assert-pnpm-sources` and vitest keep their positions after it.

### 4.1 Constraints the rewrite must not break (swept, not assumed)

Existing guards over this file, each verified against the planned diff:

| Guard | Constraint | Planned diff |
| --- | --- | --- |
| `tests/cross-cutting/ci-workflow-speedup.test.ts:130` | every line containing `sudo apt-get` + `postgresql-client` must also contain `command -v psql` **on that same line** | psql step is moved verbatim, still one line — never reformatted into a multi-line `run: \|` |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:152-166` | `./.github/actions/assert-pnpm-sources` must remain a step in `unit-suite-db`, precede the vitest step, and carry exactly the keys `name` + `uses` | kept verbatim including its `name:`, still immediately before vitest |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:313` | zero `\|\| true` anywhere in `unit-suite.yml` | the combined step has none; this is also §5c |
| `scripts/ci/assert-pnpm-sources-clean.sh:67-73` (runs live in this job) | refuses `node[_-]?options`, a `defaults:` key, `\x`/`\u`/`\U` escapes, and non-ASCII outside `#` comment lines | the combined step's body and its comments are plain ASCII |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:183-198` | the no-Supabase guard and the exactly-three-`uses:` count are scoped to `unit-suite-nodb` | `unit-suite-nodb` is untouched; the db job's `uses:` count is unconstrained |

**Why inline rather than a nested composite.** 2026-07-20 §3 states the composite cannot simply be dropped, since `pnpm/action-setup@v4` and `actions/setup-node@v4` (with `cache: pnpm`) are prerequisites of the install, and prescribes pinning them ahead of the combined step (§4d). Splitting the composite into a toolchain-only child action would preserve D12's single-version-source property more elegantly, but it changes a composite that ~20 jobs across 8 workflows consume — a blast radius disproportionate to this change. Inlining plus a meta-test that derives its expectations FROM the composite's own YAML (§5d) buys the same anti-drift guarantee with a two-line diff outside `unit-suite.yml`. Recorded here so it is not re-litigated as an oversight.

## 5. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/unit-suite-shard-topology.test.ts`. CREATES no new file. Lettering follows 2026-07-20 §4 so the two documents can be read side by side; every item is scoped to `unit-suite-db`.

(a) **Step ordering**, by index comparison within `unit-suite-db`: `checkout` < `pnpm/action-setup` < `setup-node` < `supabase/setup-cli` < psql guard < combined step < `assert-pnpm-sources` < vitest.

(b) **The combined step's shape** — the whole contract: its `run:` body contains the bootstrap invocation suffixed with `&`, captures the PID, runs `pnpm install --frozen-lockfile` in the foreground, and ends with `wait` on that captured PID, under `set -euo pipefail`.

(c) **Fail-closed**: the `wait` is the step's last command and carries no `|| true`, no `set +e`, and no trailing `exit 0`.

(d) **Prerequisites preserved, derived from the composite rather than hardcoded.** Parse `.github/actions/setup/action.yml`; take its steps other than the `pnpm install` run-step; assert each appears in `unit-suite-db` before the combined step with identical `uses` AND identical `with` (so `node-version: 20` and `cache: pnpm` cannot silently drop). A change to the composite that this job does not mirror fails the test, which is the anti-drift property inlining would otherwise lose.

(e) **Install runs exactly once** in `unit-suite-db`: `pnpm install` appears once in the job, and `./.github/actions/setup` is not also invoked there (a double install would erase the saving and could race itself).

(f) **Bootstrap invoked exactly once**, still as `bash scripts/ci/supabase-local-bootstrap.sh` (shared-script contract, already pinned at `unit-suite-shard-topology.test.ts:176`).

(g) **Step body pinned by EQUALITY, not by a forbidden-substring list.** 2026-07-20 rounds 5–7 showed a denylist cannot close the class: `pnpm install ... || kill "$boot_pid"` contains neither `trap` nor `|| true`, yet masks the install failure whenever the final `wait` succeeds. The guard asserts the `run:` body, with comments and leading whitespace stripped, EQUALS the canonical five lines. Any cleanup re-introduction, conditional wrapper, or reordering fails the equality.

(h) **Install write-surface guard, corrected inventory.** Assert `package.json` declares no install-lifecycle script beyond `prepare` (checking `preinstall`, `install`, `postinstall`, `prepublish`, `prepublishOnly` are all absent), that `prepare`'s command is still `simple-git-hooks` and its `simple-git-hooks` config is still `{"pre-commit": "pnpm exec lint-staged"}`, and that `pnpm-workspace.yaml`'s `allowBuilds` map equals the audited five-key inventory of §3.1 **including each boolean** — `simple-git-hooks: false` flipping to `true` is a new executing build script and must fail. The failure message names §3.2 as the audit to re-run.

(i) **Unchanged and must stay green:** the 8/3-leg matrix + `--shard` denominator pins, the `unit-suite-nodb`-boots-nothing guard, the no-`continue-on-error` guard, the aggregator name/`needs`/`if: always()` pins, and `tests/cross-cutting/ci-workflow-speedup.test.ts` (notably its guarded-psql-install assertion, which the moved psql step must still satisfy).

No executable behavioral harness is specified for item 1. That is the deliberate consequence of the §3 simplification, not a gap: correctness lives in `wait` and `set -e`, which are shell semantics, and the real proof is the §7 accept gate — all 8 db legs green means both the boot and the install succeeded and were joined.

## 6. Item 2 — de-flake T-REGROW's armed measurement

### 6.1 The defect

`tests/e2e/admin-lifecycle-layout.spec.ts`, test `T-REGROW: re-places when the popover's own content grows`. After clicking `archive-show-button` and waiting for `archive-show-confirm-button` to be visible, the test sleeps a fixed 300ms and then measures:

```ts
await popover.getByTestId("archive-show-button").click();
await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
await page.waitForTimeout(300);
const armed = await measure();
```

Confirm-button visibility is not the settle signal the assertions need. The invariant under test is that placement RE-RAN after the body grew, and the re-placement is an async effect downstream of the growth. When 300ms is not enough on a loaded runner, the measurement reads the pre-re-placement state: the body has grown but the stale "bottom, no cap" placement is still applied, so the clip-rect assertion fails first. That is exactly the observed CI failure on PR #604 (`lifecycle-layout-e2e`, `mobile-safari`, 24 passed / 1 failed, re-run of the identical tree green).

The same fixed-wait shape appears twice in this one test — the ladder sweep uses `waitForTimeout(250)` before its own armed measurement, where an early read makes the sweep either pick the wrong rung or find none and fail on `chosen` being null. Per the project's class-sweep rule, both are fixed, not just the one the backlog names.

### 6.2 The fix

Wrap each armed measurement in `expect(async () => { ... }).toPass({ ... })`, the template already used in this file (`openHub`'s kebab-click retry). The retried block re-measures each attempt; `measure()` is idempotent by construction (it saves and restores `body.style.maxHeight` around its natural-height read), so retrying is safe.

**Real run.** The retried block measures and asserts the two clip-rect invariants and the `replaced` predicate together, so a transient pre-re-placement state retries instead of failing. A regression in which placement never re-runs still fails — the block never passes and `toPass` times out, reporting the same assertion text it does today.

**Ladder sweep.** The sweep is not asserting an invariant, it is probing for a viewport. Its block retries until GROWTH is observed — `armed.natural > idle.natural`, both numbers read from the page — and only then evaluates the window predicate. Growth is the right settle condition there because the rung's decision depends on the armed natural height, not on where placement put it. A rung where growth never appears fails its own `toPass` rather than silently selecting a wrong height.

### 6.3 Anti-tautology note

Folding the clip-rect assertions into the `toPass` weakens nothing that the fixed wait provided: today a slow re-placement fails a real invariant for a timing reason (a false red), and a broken re-placement fails the same invariant. After the change the first case passes on retry and the second still fails, at the timeout. The `replaced` predicate stays inside the block precisely so "placement never re-ran" remains a failure rather than becoming a silently-satisfied wait condition.

Timeouts: `toPass({ timeout: 15_000 })`, matching `openHub`'s existing retry budget in the same file. The test already calls `test.setTimeout(240_000)`.

## 7. Accept criteria

**Item 1 (real CI, per 2026-07-20 §5, restated against the current topology):**

1. All 8 `unit-suite-db` legs, all 3 `unit-suite-nodb` legs, and the `unit-suite` aggregator green; the boot log present in each db leg's job output (backgrounding must not hide it).
2. Comparison metric is **leg-median fixed overhead** for `unit-suite-db` — `(job wall) − (vitest step)` — not max leg, whose noise is dominated by test distribution. The baseline is computed the SAME way from a `main` run of the CURRENT topology, not from the stale 2026-07-20 §2 table.
3. **Accept** if median fixed overhead drops by **≥8s** versus that baseline AND every leg is green. **Revert item 1** otherwise. The 8s floor is half the theoretical 16s: it demands a real effect while tolerating contention, and is far enough from zero that runner noise cannot manufacture it. A one-second difference is not a gain.
4. Record both the median fixed overhead and the max leg in the PR body either way, so a revert is as legible as an accept.

**Item 2:** `lifecycle-layout-e2e` green on the PR, and the modified test observed green locally. Item 2's value is the removal of a timing-dependent read; a single green run is not proof of a flake's absence and is not claimed as such.

The two items are independently revertible: item 1 touches `.github/workflows/unit-suite.yml` plus `tests/cross-cutting/unit-suite-shard-topology.test.ts`, item 2 touches `tests/e2e/admin-lifecycle-layout.spec.ts`, and the sets do not intersect.

## 8. Out of scope

- Everything in §1.1.
- The ~60 app-dependent dark e2e specs of `BL-E2E-LIFECYCLE-SPECS-CI-DARK`.
- The `tests/e2e/admin-lifecycle-layout.spec.ts:411` `scrollIntoView` assertion in the T-CONFIRM-SCROLL case, which the PR #604 run also touched. It has no fixed wait in its measurement path; it is not the same defect shape and is not changed here.
- Promoting any e2e job into branch protection's required-context set (an owner GitHub-settings action, `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`).
- The next wall-clock lever, a pre-baked Postgres image removing the ~14s schema+migration phase.

## 9. Numeric self-consistency register

Theoretical upper-bound saving 16s (the install step's measured duration, 2026-07-20 §2); accept threshold ≥8s median fixed-overhead reduction (§7.3), deliberately half of it; `unit-suite-db` 8 legs, `unit-suite-nodb` 3 legs (§2); `allowBuilds` five keys, four enabled (§3.1); five lifecycle scripts executed by the §3.2 probe, zero writes under `supabase/`; `toPass` timeout 15_000 ms in both item-2 blocks (§6.2), matching `openHub`; test-level timeout 240_000 ms, unchanged; install-failure report delay ~70s typical, hard-bounded only by `timeout-minutes: 20` (§1.1).

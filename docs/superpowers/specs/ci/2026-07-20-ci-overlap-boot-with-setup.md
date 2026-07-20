# CI unit-suite — overlap the Supabase boot with dependency setup

**Date:** 2026-07-20
**Predecessors:** P1 #504 (8-leg matrix, image-cache lever reverted on measurement), P2 #507 (12 dirs serial→parallel), P3 #510 (closed unmerged — file-granular membership measured no gain), #512 (resolved-config partition proof). Program doc: `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md`.

## 1. Goal

Cut per-leg wall clock by running the Supabase bootstrap CONCURRENTLY with the dependency-install step instead of after it. Target: **~16s off every leg**, the duration of the setup step that currently blocks the boot from starting.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Image caching is DEAD as a lever — measured on P1 as ~19s SLOWER than the registry pull (cache-hit boot median 92.5s vs 73.5s). Do not re-propose it here | P1 spec §6.1 outcome, PR #504 |
| Test-membership changes (which files run in which vitest project) are OUT of scope — P3 measured no wall-clock gain from them and was closed unmerged | PR #510, `BL-CI-P3-FILE-GRANULAR-SERIAL` |
| Shard count stays 8; the aggregator, its REQUIRED check name, and branch protection are untouched | P1 §5.1 |
| The bootstrap script's contents (held-aside migrations, GUC dance, `-x` service list, `SUPABASE_START_ATTEMPTS` retry) are UNCHANGED. This phase changes only WHEN it runs relative to other steps | this spec §3 |
| A pre-migrated/pre-baked Postgres image (removing the ~14s schema-init + migration phase) is out of scope: it needs a build-and-publish pipeline and a staleness contract, which is a larger change than this one | this spec §6 |

## 2. Measurement (current main, run 29741812457, leg 1)

| Step | Seconds |
| --- | --- |
| Set up job + checkout | 3 |
| `./.github/actions/setup` (pnpm install, warm cache) | **16** |
| `supabase/setup-cli@v1` | 2 |
| Install psql (guarded; preinstalled) | 0 |
| Boot local Supabase | **70** |
| vitest shard | 154 |

Boot-phase decomposition from that run's log: image pull ≈45s (first `Pulled` 12:20:31 → last 12:21:07), container start ≈11s (→ `Initialising schema...` 12:21:18), schema init ≈6s (→ `Seeding globals` 12:21:24), migrations ≈8s. Fixed overhead on this leg totals ~91s against a 245s max leg; the leg-MEDIAN fixed overhead across all 8 legs of the same run is 101s (per-leg: 89, 96, 98, 101, 101, 103, 105, 108), and §5 gates on that median rather than on any single leg.

**The observation this phase exploits:** the boot step cannot begin until `./.github/actions/setup` finishes, yet the two share no data. The boot's first ~45s is network-bound image pulling; the setup step's 16s is npm-registry-bound installing. Running them concurrently should reclaim most of the shorter one — bounded above by 16s, and possibly less under contention (§3); §5 measures rather than assumes, and the gate reverts a change that does not pay.

### 2.1 Empirical probe (run 29743206592, 2026-07-20) — the design's undocumented premises, measured

Whether a process detached in one step survives into later steps on a GitHub-hosted runner is undocumented runner behaviour, and the whole design rests on it. Per this project's spike rule it was PROBED, not assumed, before this design was written down. A throwaway workflow started a detached worker that slept 40s then published a status, ran a 20s step in between, and joined:

| Probe question | Result |
| --- | --- |
| Detached process survives across step boundaries? | **YES** — worker started 12:42:09, its output and sentinel appeared at 12:42:49, read by a later step's shell |
| Sentinel status propagates to the joining step? | **YES** — status 7 written, 7 observed |
| Is `echo N > file` observably non-atomic to a concurrent reader? | **0 empty reads in 400 create/read races** |

The probe was run against the (now superseded) cross-step design; its results are retained because they are durable facts about the runner, and because they are what let round 4 conclude the mechanism was sound and the FRAGILITY was in the cross-step protocol, not in the idea of overlapping. The simplified §3 design needs none of them. The third says the empty-read race is not observable in practice — but 0/400 is not proof of impossibility, and the fix was free. NOTE (round 7): that mitigation belonged to the retired cross-step protocol. The §3 design has no sentinel at all, so this probe result is now purely informational.

## 3. Design — one shell, native `wait` (simplified after round 4)

Rounds 1–4 all attacked one vector: proving a CROSS-STEP coordination protocol correct. Round 1 killed `wait` on a foreign PID; rounds 2–4 then found successive regression classes surviving each proof suite (deadline not enforced for a late sentinel, failure-path log surfacing, an unrealizable missing-sentinel trial, no proof the start step returns promptly). Per this project's three-round rule the response is to remove the vector, not to patch it again.

**The protocol existed only because the two operations sat in different step shells.** Put them in ONE step and every piece of it dissolves — no sentinel, no PID file, no start marker, no deadline arithmetic, no cross-step liveness assumption, no buffered log:

```yaml
- name: Boot Supabase and install dependencies concurrently
  # The bootstrap is network-bound (image pull) and pnpm install is
  # registry-bound; they share no data, so running them in one shell overlaps
  # the two. `wait` here is a NATIVE wait on a real child of this shell — the
  # cross-step variant is impossible (a later step is a different process), which
  # is what made every earlier revision of this design fragile.
  run: |
    set -euo pipefail
    bash scripts/ci/supabase-local-bootstrap.sh &
    boot_pid=$!
    pnpm install --frozen-lockfile
    wait "$boot_pid"
```

Properties that come for free, each of which needed explicit machinery in the cross-step form:

- **Fail-closed.** `wait "$boot_pid"` returns the bootstrap's real exit status, and `set -e` fails the step on non-zero. No sentinel to publish atomically, no status to misread.
- **Fail-closed on the install too — with one accepted, bounded cost.** `pnpm install` failing aborts under `set -e` before the `wait`, so the leg fails. The still-running bootstrap then holds the step's inherited stdout pipe until it finishes, delaying the failure report by one bootstrap duration — **typically ~70s (the measured healthy boot), but the only HARD bound is the job's `timeout-minutes: 20`**. `SUPABASE_START_ATTEMPTS` caps attempts, not elapsed time: `supabase start` has no timeout of its own, and a pathological boot could consume the remainder of the job. Round-7 correction: an earlier draft called ~70s an upper bound, which it is not.

  **This is a deliberate non-goal, not an oversight (rounds 5-6).** Killing the background job on install failure sounds trivial and is not: `kill "$pid"` signals one process, not the process group, while the bootstrap's real work happens in descendants (`supabase start`, docker, psql, `supabase migration up`); a correct version needs process-group termination plus an actual join plus care about PID reuse — and it must not interrupt the bootstrap's held-aside-migration restore trap mid-flight. That is a substantial correctness surface bought for a rare path (a lockfile or registry failure) whose only symptom is a slower failure report. The overlap this phase exists for is on the SUCCESS path, which needs none of it. If install failures ever become common enough for the delay to matter, revisit with process-group semantics rather than a bare `kill`.
- **Live log.** Both processes inherit the step's stdout, so output streams exactly as it does now — the round-2/3 finding about losing diagnostics on cancellation or runner timeout evaporates, because nothing is buffered.
- **No timeout logic.** The job's existing `timeout-minutes: 20` bounds a hung boot, as it does today. There is no second deadline to keep consistent with it.
- **Overlap is structural, not asserted.** The `&` is on the line before a foreground command in the same shell; there is no way for it to be "secretly sequential" the way a separate start step could be.

**Working-tree concurrency (audited, not asserted).** Single-shell execution removes the cross-step protocol but NOT concurrent filesystem access: the bootstrap still moves two tracked migrations aside and restores them via an exit trap (`scripts/ci/supabase-local-bootstrap.sh` held-aside block) while the install runs. The install's write surface, audited rather than inferred: the root `prepare: simple-git-hooks` lifecycle, whose config is `{"pre-commit": "pnpm exec lint-staged"}` and which writes `.git/hooks/` only; the dependency build scripts enumerated in `pnpm-workspace.yaml`'s `allowBuilds`; and `node_modules/`. None writes under `supabase/`, so the sets are disjoint today — and §4 adds a guard so a future lifecycle addition cannot silently invalidate that premise.

The remaining steps are unchanged and keep their order: `checkout` → `supabase/setup-cli@v1` (moved up; the bootstrap needs the CLI on PATH) → psql guard (moved up, same reason) → **this combined step** → vitest.

**Cost of the simplification, stated plainly:** this step inlines `pnpm install --frozen-lockfile`, so the leg no longer uses the `./.github/actions/setup` composite. The composite's other two actions (`pnpm/action-setup@v4`, `actions/setup-node@v4` with `cache: pnpm`) must still run BEFORE this step, since pnpm and the warm cache are prerequisites of the install. The composite therefore cannot simply be dropped; §4 pins that those two actions still precede the combined step, and that the install is not run twice.

**Expected saving:** unchanged in magnitude — `pnpm install`'s duration disappears into the boot's, bounded above by the install's ~16s and likely less under contention. §5 measures it.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/unit-suite-shard-topology.test.ts`. CREATES none. The surface is far smaller than the cross-step design required — most of what §4 previously had to pin is now impossible by construction.

(a) **Step ordering**: checkout → setup-cli → psql guard → pnpm/setup-node prerequisites → combined boot+install step → vitest, by index comparison.
(b) **The combined step's shape**, which is the whole contract: its `run:` body contains the bootstrap invocation suffixed with `&`, captures the PID, runs `pnpm install --frozen-lockfile` in the foreground, and ends with `wait` on that captured PID. Assert all four, plus `set -euo pipefail`.
(c) **Fail-closed**: the `wait` is the step's last command and carries no `|| true`, no `set +e`, and no trailing `exit 0`.
(d) **Prerequisites preserved, enumerated against the composite**: every action the `./.github/actions/setup` composite performs except the install itself still runs before the combined step — `pnpm/action-setup@v4` (pnpm binary, version from `packageManager`) and `actions/setup-node@v4` with `node-version: 20` and `cache: pnpm`. Assert all three properties, not just the action names: dropping `cache: pnpm` or the node version would leave a green but slower or differently-versioned leg.
(e) **Install runs exactly once** in the leg: `pnpm install` appears once in the workflow, and the `./.github/actions/setup` composite is not also invoked in this job (a double install would erase the saving and could race itself).
(f) **Bootstrap invoked exactly once**, still as `bash scripts/ci/supabase-local-bootstrap.sh` (shared-script contract).
(g) **Step body pinned exactly, not by forbidden-substring list.** Rounds 5-7 showed a denylist cannot work: `pnpm install ... || kill "$boot_pid"` contains neither `trap` nor `|| true`, yet masks the install failure whenever the final `wait` succeeds. The guard therefore asserts the step's `run:` body EQUALS the canonical five lines of §3 (modulo leading whitespace and comments): `set -euo pipefail`, the backgrounded bootstrap, the PID capture, the bare foreground `pnpm install --frozen-lockfile`, and `wait "$boot_pid"` as the final command. Any cleanup re-introduction, conditional wrapper, or reordering fails the equality — which is the only formulation that actually closes the class.
(h) **Install write-surface guard, scoped to what it can actually prove (round-7 finding 3):** assert `package.json` declares no install-lifecycle script beyond `prepare`, that `prepare`'s configured command is unchanged, and that `pnpm-workspace.yaml`'s `allowBuilds` set equals the audited inventory (today `@sentry/cli`). This catches a NEW lifecycle key or a NEW build-allowed dependency — the realistic ways the disjointness premise rots. It explicitly does NOT prove where an already-allow-listed dependency writes: `allowBuilds` holds names and booleans, not commands. Pinning the set is what forces a human to re-audit when it changes.
(i) Unchanged and must stay green: the 8-leg matrix + denominator pins, the no-`continue-on-error` guard, the aggregator name/`needs`/`if: always()` pins, `tests/cross-cutting/ci-workflow-speedup.test.ts`.

No executable behavioral harness is specified, and that is a deliberate consequence of the simplification rather than a gap: the earlier design needed one because its correctness lived in a hand-rolled protocol; here it lives in `wait` and `set -e`, which are shell semantics, and the real proof is the accept gate in §5 (all 8 legs green means both the boot and the install succeeded and were joined).

## 5. Accept criteria (real CI)

1. All 8 legs + aggregator green, and the boot log is present in each leg's job output (backgrounding must not hide it).
2. Measure with P1's `measure()` (`LEGS=8`). The comparison is **leg-median fixed overhead** — `(job wall) − (vitest step)`, which isolates what this phase actually changes — not max leg alone, whose noise is dominated by test distribution.
3. **Accept** if the leg-median fixed overhead drops by **≥8s** versus the main baseline computed the SAME way AND all legs are green. **Revert** otherwise. The 8s floor is deliberately half the theoretical 16s: it demands a real effect while tolerating the contention §3 predicts, and it is far enough from zero that runner noise cannot manufacture it. A one-second difference is not a gain (round-1 finding 6).
4. Record both the median fixed overhead and max leg in the PR body either way, so a revert is as legible as an accept.

## 6. Out of scope

- Image caching (§1.1, measured dead on P1).
- A pre-baked/pre-migrated Postgres image removing the ~14s schema+migration phase — a larger change needing a publish pipeline and staleness contract; note it as the next lever if this one lands.
- Trimming the `-x` service list further (each remaining service is exercised; documented in the bootstrap).
- Any change to test membership, shard count, or the bootstrap script's body.

## 7. Numeric self-consistency register

Baseline run 29741812457 leg 1: setup 16s, setup-cli 2s, boot 70s, vitest 154s, leg-1 fixed overhead 91s, leg-median fixed overhead 101s, max leg 245s (§2); boot decomposition pull ≈45s / start ≈11s / schema ≈6s / migrations ≈8s (§2); theoretical upper-bound saving 16s → overhead ~75s (§3); accept threshold ≥8s median fixed-overhead reduction vs the 101s median baseline (§5.3); probe run 29743206592, 0/400 empty reads (§2.1).

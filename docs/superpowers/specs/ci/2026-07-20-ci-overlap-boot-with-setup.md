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

Boot-phase decomposition from that run's log: image pull ≈45s (first `Pulled` 12:20:31 → last 12:21:07), container start ≈11s (→ `Initialising schema...` 12:21:18), schema init ≈6s (→ `Seeding globals` 12:21:24), migrations ≈8s. Fixed overhead totals ~91s against a 245s max leg.

**The observation this phase exploits:** the boot step cannot begin until `./.github/actions/setup` finishes, yet the two share no data. The boot's first ~45s is network-bound image pulling; the setup step's 16s is npm-registry-bound installing. Running them concurrently costs nothing and reclaims the shorter of the two.

## 3. Design

Reorder and background, changing no script. **The cross-step coordination is a completion sentinel, not a PID** — a `run:` step is its own shell, so a later step cannot `wait` on an earlier step's child (`wait` on a non-child returns non-zero, which would fail every leg permanently). Status must be persisted to the filesystem, which outlives the step shell.

1. `actions/checkout@v4` (unchanged, must be first — the composite action and the bootstrap both live in the repo).
2. `supabase/setup-cli@v1` moves UP, before the setup composite (2s; the bootstrap needs the CLI on PATH).
3. Install psql moves UP for the same reason (0s in practice, guarded).
4. **NEW — start the bootstrap detached, writing a sentinel on completion:**

   ```bash
   rm -f /tmp/supabase-boot.rc
   nohup bash -c 'bash scripts/ci/supabase-local-bootstrap.sh; echo $? > /tmp/supabase-boot.rc' \
     > /tmp/supabase-boot.log 2>&1 &
   disown
   ```

   The inner `echo $?` records the bootstrap's real exit status. Background processes survive step boundaries: steps are separate shells inside ONE job on ONE runner VM, and the runner does not reap a job's background processes between steps.

5. `./.github/actions/setup` runs while images pull.
6. **NEW — join: wait for the sentinel, surface the log, adopt the status.**

   ```bash
   deadline=$((SECONDS + 900))
   until [ -f /tmp/supabase-boot.rc ]; do
     if [ "$SECONDS" -ge "$deadline" ]; then
       echo "::error::supabase bootstrap did not finish within 900s"
       cat /tmp/supabase-boot.log || true
       exit 1
     fi
     sleep 2
   done
   cat /tmp/supabase-boot.log
   rc=$(cat /tmp/supabase-boot.rc)
   echo "bootstrap exit status: $rc"
   exit "$rc"
   ```

   `exit "$rc"` is the fail-closed hinge: a non-zero bootstrap fails the leg and therefore the REQUIRED aggregate, exactly as the foreground form does. The timeout bounds the pathological case where the detached process dies before writing the sentinel (leg fails rather than hangs to the 20-minute job cap). The single `|| true` is on the diagnostic `cat` in the timeout path ONLY, where the log may legitimately not exist yet; it can never mask a bootstrap failure because that path exits 1 unconditionally.

7. vitest step unchanged.

**Diagnostics on failure paths (round-1 finding 7).** Today the boot log streams live; buffering it until the join would hide it whenever setup fails, the job is cancelled, or the runner times out before the join. Both new steps therefore run under `if: always()`-style availability at the job level via an additional **`if: failure()` log dump** appended to the setup composite's step list, so a setup failure still prints whatever the boot has produced. The join prints the log on both its success and timeout paths.

**Working-tree interleaving (round-1 finding 3).** The bootstrap moves two migration files aside and restores them via `trap restore EXIT`, while `pnpm install` runs concurrently. These touch disjoint paths (`supabase/migrations/*.sql` vs `node_modules/`), so the interleaving is safe. If the job dies between the move and the trap, the mutated tree is discarded with the ephemeral runner — no persistence risk, and no other step reads those files before the join.

**Expected saving — bounded, not asserted.** Contention-free, `16 + 70` becomes `max(16, 70)`, i.e. 16s. But the setup step is not purely network-bound: with `cache: pnpm` it also restores a cache, links/extracts packages, and runs package scripts, competing with Docker layer extraction for disk and CPU. **16s is an upper bound; the realized saving may be materially less.** §5 measures rather than assumes.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/unit-suite-shard-topology.test.ts`. CREATES none.

(a) **Step ordering**: checkout → setup-cli → psql → background-start → setup composite → join → vitest, by index comparison.
(b) **Executable behavioral proof of the join — this is the assertion that matters, and shape-matching cannot replace it.** Round-1 review established that a structural check would happily accept a join that always fails (or always passes). The meta-test therefore EXTRACTS the start and join `run:` bodies from the workflow YAML and EXECUTES them in a temp directory against a stub bootstrap, twice:
   - stub exits 0 → the join exits 0 (a successful boot permits the leg to continue);
   - stub exits 7 → the join exits 7 (a failed boot blocks vitest and fails the leg).
   Running the real extracted commands is what makes this non-tautological: any regression that decouples the join from the bootstrap's status — `set +e`, a conditional `wait`, an overwritten status variable, an unconditional `exit 0`, reading the wrong sentinel — changes one of those two observed exit codes. Enumerating soft-failure syntaxes could not.
(c) **The bootstrap is invoked exactly once** in the workflow, still as `bash scripts/ci/supabase-local-bootstrap.sh` (the shared-script contract other workflows depend on).
(d) **Soft-failure inventory**: `|| true` appears exactly once, on the timeout path's diagnostic `cat` (§3.6), and never on the bootstrap invocation or the join's exit.
(e) Unchanged and must stay green: the 8-leg matrix + denominator pins, the no-`continue-on-error` guard, the aggregator name/`needs`/`if: always()` pins, `tests/cross-cutting/ci-workflow-speedup.test.ts`.

## 5. Accept criteria (real CI)

1. All 8 legs + aggregator green, and the boot log is present in each leg's job output (backgrounding must not hide it).
2. Measure with P1's `measure()` (`LEGS=8`). The comparison is **leg-median fixed overhead** — `(job wall) − (vitest step)`, which isolates what this phase actually changes — not max leg alone, whose noise is dominated by test distribution.
3. **Accept** if the leg-median fixed overhead drops by **≥8s** versus the main baseline (91s, run 29741812457) AND all legs are green. **Revert** otherwise. The 8s floor is deliberately half the theoretical 16s: it demands a real effect while tolerating the contention §3 predicts, and it is far enough from zero that runner noise cannot manufacture it. A one-second difference is not a gain (round-1 finding 6).
4. Record both the median fixed overhead and max leg in the PR body either way, so a revert is as legible as an accept.

## 6. Out of scope

- Image caching (§1.1, measured dead on P1).
- A pre-baked/pre-migrated Postgres image removing the ~14s schema+migration phase — a larger change needing a publish pipeline and staleness contract; note it as the next lever if this one lands.
- Trimming the `-x` service list further (each remaining service is exercised; documented in the bootstrap).
- Any change to test membership, shard count, or the bootstrap script's body.

## 7. Numeric self-consistency register

Baseline run 29741812457 leg 1: setup 16s, setup-cli 2s, boot 70s, vitest 154s, fixed overhead 91s, max leg 245s (§2); boot decomposition pull ≈45s / start ≈11s / schema ≈6s / migrations ≈8s (§2); theoretical upper-bound saving 16s → overhead ~75s (§3); accept threshold ≥8s median fixed-overhead reduction vs the 91s baseline (§5.3); join timeout 900s (§3.6).

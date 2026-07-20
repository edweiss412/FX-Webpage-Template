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

Reorder and background, changing no script:

1. `actions/checkout@v4` (unchanged, must be first — the local composite action and the bootstrap script both live in the repo).
2. `supabase/setup-cli@v1` moves UP, before the setup composite (it is 2s and the bootstrap needs the CLI on PATH).
3. Install psql moves UP for the same reason (0s in practice, guarded).
4. **NEW — start the bootstrap in the background:** `nohup bash scripts/ci/supabase-local-bootstrap.sh > /tmp/supabase-boot.log 2>&1 & echo $! > /tmp/supabase-boot.pid`.
5. `./.github/actions/setup` runs while the images pull.
6. **NEW — join before use:** `wait` on the recorded PID; on non-zero exit, print the captured boot log and fail the step. The log is ALSO printed on success at the end, so the boot's output (migration list, retry warnings) stays visible in the job log exactly as today.
7. vitest step unchanged.

**Failure semantics are preserved, and this is the load-bearing property.** The bootstrap keeps its own `set -euo pipefail` and retry loop; backgrounding only defers where its exit status is observed. The join step exits non-zero whenever the bootstrap did, so a boot failure still fails the leg and the REQUIRED aggregate. A backgrounded step whose status is never checked would silently green a leg with no database — the join step is what makes that impossible, and §4 pins it.

**Expected saving:** `min(setup duration, remaining boot)` = the full 16s setup, since the boot is 70s. Per-leg 91s → ~75s of overhead; max leg ~245s → ~229s.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/unit-suite-shard-topology.test.ts`. CREATES none.

(a) **Step ordering**: checkout → setup-cli → psql → background-boot → setup composite → join → vitest, asserted by index comparison as the existing cache-era ordering pin did.
(b) **The join exists and is fatal**: a step that reads the recorded PID, `wait`s on it, and exits non-zero on failure — assert the step is present, references the PID file, and contains no `|| true` (a soft-failed join would silently green a database-less leg; this is the single most dangerous regression this design admits).
(c) **The bootstrap is invoked exactly once** across the workflow, and still via `bash scripts/ci/supabase-local-bootstrap.sh` (the shared-script contract other workflows depend on).
(d) **Soft-failure inventory**: `|| true` appears zero times in the workflow (this phase introduces no soft-failure sites; the P1 cache lever that once needed two was reverted).
(e) Unchanged and must stay green: the 8-leg matrix + denominator pins, the no-`continue-on-error` guard, the aggregator name/`needs`/`if: always()` pins, `tests/cross-cutting/ci-workflow-speedup.test.ts`.

## 5. Accept criteria (real CI)

1. All 8 legs + aggregator green; the boot log appears in each leg's job output (backgrounding must not hide it).
2. Measure with P1's `measure()` (`LEGS=8`): record max leg wall vs the current main baseline (**245s**, run 29741812457).
3. **Accept** if max leg < 245s AND all legs green. **Revert** if max leg ≥ 245s (no gain, same disposition as P1's cache lever and P3 — a change that does not pay is not merged).
4. Skew is not a gate here: this phase moves fixed overhead, not test distribution.

## 6. Out of scope

- Image caching (§1.1, measured dead on P1).
- A pre-baked/pre-migrated Postgres image removing the ~14s schema+migration phase — a larger change needing a publish pipeline and staleness contract; note it as the next lever if this one lands.
- Trimming the `-x` service list further (each remaining service is exercised; documented in the bootstrap).
- Any change to test membership, shard count, or the bootstrap script's body.

## 7. Numeric self-consistency register

Baseline run 29741812457 leg 1: setup 16s, setup-cli 2s, boot 70s, vitest 154s, fixed overhead 91s, max leg 245s (§2); boot decomposition pull ≈45s / start ≈11s / schema ≈6s / migrations ≈8s (§2); expected saving 16s → overhead ~75s, max leg ~229s (§3); accept threshold max leg < 245s (§5.3).

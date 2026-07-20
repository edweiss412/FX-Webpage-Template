# Namespace runner trial — persist the Supabase images across runs

**Date:** 2026-07-20
**Status:** PREPARED, NOT ACTIVE. The workflow change is committed on `chore/ci-namespace-runner-trial` but no PR is open, because the shard jobs would queue forever against a runner profile that does not exist yet. Open the PR only after §3's setup is done.
**Predecessors:** #504 (8-leg matrix; image-cache lever reverted on measurement), #507 (12 dirs serial→parallel), #510 (closed unmerged, no gain), #512 (resolved-config partition proof), #513 (stale runner-spec correction).

## 1. Why this and not something else

Per-leg wall clock is ~245–259s, of which ~100s is fixed overhead. That overhead decomposes (run 29746157908, leg 1): **15s layer download, 25s layer extraction, 11s container start, 6s schema init, 14s migrations**, plus ~17s dependency install.

Every cheaper lever has been measured and rejected:

| Lever | Verdict | Evidence |
| --- | --- | --- |
| Tarball image cache (`docker save`/`load`) | ~19s SLOWER than pulling | #504 §6.1 — `docker load` extracts one tarball serially; a registry pull extracts layers in parallel |
| File-granular test membership | flat wall clock, added flake | #510, closed unmerged |
| Larger GitHub runner | unavailable AND already applied | runners measured at 4 vCPU / 15.6 GiB (#513); larger runners need Team/Enterprise |
| Registry mirror / GHCR | attacks the wrong 15s | download is not the bottleneck; extraction is |
| Pre-baked Postgres image | likely net worse | a bigger image extracts slower, to save the 14s of migrations that sit outside the bottleneck |
| Overlap boot with install | abandoned at spec stage | `BL-CI-OVERLAP-BOOT-WITH-SETUP`; ≤16s for an expanding correctness surface |

What remains is the 40s of pull+extract, and the only way to remove it is to **not do it** — to have the images already present on the runner. That requires a persistent disk attached across jobs, which GitHub-hosted runners cannot provide at any price because their VMs are ephemeral. Namespace's Cache Volumes with "Container images" enabled do exactly this: images pulled in one run are reused in the next, and their docs state a repeat pull should be "close to 0".

### 1.1 Resolved scope — do not relitigate

| Decision | Rationale |
| --- | --- |
| Only `unit-suite` moves. Everything else stays on free GitHub runners | It is 52% of measured minutes (1,398 of 2,678 per week) and the REQUIRED merge gate. Moving everything costs ~$46/mo and busts the budget |
| The aggregator job stays GitHub-hosted | ~3s status rollup; billing it buys nothing. Pinned by meta-test |
| Profile label, never a bare `nscloud-*` label | A bare label gets the fast runner WITHOUT the cache volume — losing the one feature being tested while still billing. Pinned by meta-test |
| Namespace, not Ubicloud | Ubicloud is far cheaper but its caching is GitHub-cache acceleration + docker BUILD layers; it does not persist pulled images, so it misses the lever entirely |
| Namespace, not Blacksmith/Depot/WarpBuild | All organization-only; this repo is personal-account-owned |

## 2. Baselines to measure against (this session, current main)

| Metric | Value | Source |
| --- | --- | --- |
| max leg wall | 245s / 259s | runs 29741812457 / 29746157908 |
| leg-median fixed overhead (wall − vitest) | 101s | run 29741812457, all 8 legs: 89/96/98/101/101/103/105/108 |
| boot step | 70–72s | both runs |
| ├ download | 15s | log timestamps |
| ├ extraction | 25s | log timestamps |
| ├ container start | 11s | log timestamps |
| ├ schema init | 6s | log timestamps |
| └ migrations | 14s | log timestamps |
| vitest step | 154–164s | both runs |
| measured minutes, 7d | 2,678 total; `unit-suite` 1,398 | job durations across 300 runs |

Note the 7-day figure is inflated by an unusually heavy CI session; typical volume is likely lower, which moves cost DOWN.

## 3. Setup (must be done by the account owner, before opening the PR)

1. Sign up at namespace.so and connect the GitHub account (confirm at this step that a personal, non-organization account is accepted — this is the linchpin assumption).
2. Create a runner profile named exactly **`fxav-unit-suite`** (the workflow label is `namespace-profile-fxav-unit-suite`; the meta-test pins the name).
3. Shape: **Ubuntu 24.04, amd64, 4 vCPU** — matches today's GitHub runner, so the comparison isolates caching rather than confounding it with a core-count change.
4. Add a **Cache Volume** to the profile and enable **Container images**. Without this the trial measures nothing it set out to.
5. Note the trial start date; the free trial is 30 days.

## 4. Accept / revert gate

Run the PR at least **twice** — the first run populates the cache and is expected to show little or no gain; the second is the real measurement.

**Accept** if, on the second run:
- all 8 legs and the aggregator are green, and
- leg-median fixed overhead ≤ **70s** (from 101s — i.e. the ~30s the pull+extract should surrender), and
- projected monthly cost ≤ **$20**, computed as (measured `unit-suite` minutes on the new runner) × 4.3 weeks × $0.004.

**Revert** otherwise. Revert is one line — restore `runs-on: ubuntu-latest` on the shard job — plus deleting the meta-test guard block. Nothing else in the repo depends on the runner.

Record both the overhead and the projected cost in the PR body whichever way it goes, so the decision is legible later.

## 5. Risks accepted

- **Third-party runners on a public repo.** Fork PRs would execute on Namespace infrastructure. GitHub's default "require approval for first-time contributors" mitigates it; the repo has no external contributors today.
- **Cold-cache concurrency.** Eight matrix legs start simultaneously on the first run against an empty cache volume. Namespace documents "automatic forking" for high concurrency, but the first run's behaviour is unverified — which is why the gate measures the SECOND run.
- **A new dependency in the merge path.** If Namespace has an outage, the REQUIRED check cannot run. The revert is one line, so the exposure is bounded by how fast someone reverts.

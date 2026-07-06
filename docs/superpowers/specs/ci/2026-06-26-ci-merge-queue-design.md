# GitHub merge queue for `main` — design

> **OUTCOME (2026-06-26): NOT ADOPTED — merge queue is unavailable on this plan.**
> GitHub's merge queue is gated to GitHub Team / Enterprise (and org-owned repos);
> this is a **free personal public repo**, so it has neither the branch-protection
> "Require merge queue" UI toggle nor the REST `merge_queue` ruleset rule (the REST
> POST returns `422 Invalid rule 'merge_queue'`, and `evaluate` enforcement returns
> "upgrade to Enterprise"). **Resolution:** relaxed classic
> `required_status_checks.strict` to `false` (keeping all 12 required checks) to end
> the merge-race treadmill, and reverted the Phase-1 `merge_group` triggers + their
> meta-test (this PR). The design below is retained for the record / a future
> plan upgrade. See memory `project_ci_speedup_pr_d_matrix_shard`.

**Date:** 2026-06-26
**Scope:** CI/repo-policy infra. No app code. Ends the merge-race treadmill (strict "require-up-to-date" + busy main + ~7m CI) that bit PR D and PR E.
**Branch:** `chore/ci-merge-queue` (off `origin/main`).

## Problem

Merging to `main` requires the branch to be **up to date** (classic protection `required_status_checks.strict=true`, 12 required contexts). With a ~4–5 min main merge cadence and a ~6–7 min CI, a PR is stale before its CI finishes → rebase → re-CI → repeat. The audit rated this the biggest lever on *effective* merge latency.

A **merge queue** fixes it structurally: you click "Merge when ready", GitHub builds a temporary `merge_group` branch (latest main + the PR), runs the required checks on it **once**, and merges in order when green — no manual rebase, no treadmill, all protections preserved.

## Facts (verified)

- Repo is **public**, owner type User → merge queue available. Uses **classic** branch protection (no rulesets; `gh api .../rulesets` == `[]`). Classic protection has **no** merge-queue API field, so the queue is enabled via a **repository ruleset** with a `merge_queue` rule (coexists with the classic 12-check protection).
- The 12 required contexts are produced by exactly **3 workflows**: `quality.yml` (`quality`), `unit-suite.yml` (`unit-suite`), `x-audits.yml` (the 10 x*/parity/lockdown/traceability).
- **Workflows must trigger on `merge_group` or the queue HANGS** — the required check never reports on the merge_group branch → all merges block. (GitHub docs, verified.)
- `merge_method=MERGE` matches the repo convention (squash disabled, merge commits).

## Phase 1 — workflow `merge_group` triggers (this PR, safe/additive)

Add `merge_group:` to the `on:` of `quality.yml`, `unit-suite.yml`, `x-audits.yml`. This is a **no-op until the queue is enabled** (no merge_group events fire otherwise). The path-filtered/non-required workflows (crew-e2e, screenshots-drift, help-affordances, dev-gate-e2e) are deliberately **NOT** given `merge_group` — the queue doesn't wait on them.

Compatibility: the existing concurrency blocks (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`, group `…-${{ github.ref }}`) are correct under merge_group — on a merge_group event `cancel-in-progress` is false (don't cancel queue runs) and `github.ref` is the unique `gh-readonly-queue/...` ref (no cross-cancellation).

**Guard:** `tests/cross-cutting/merge-queue-triggers.test.ts` pins that all 3 required-check workflows keep `merge_group:` (dropping it silently breaks the queue → blocks all merges).

## Phase 2 — enable the queue (ruleset + strict flip), AFTER Phase 1 is on `main`

Phase 1 MUST be merged to `main` first: the merge_group branch uses `main`'s workflows, so they need `merge_group` before the queue dispatches.

1. **Create the ruleset** (`gh api -X POST repos/.../rulesets`):
   ```json
   {
     "name": "main-merge-queue",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
     "rules": [{ "type": "merge_queue", "parameters": {
       "merge_method": "MERGE",
       "grouping_strategy": "ALLGREEN",
       "max_entries_to_build": 5,
       "max_entries_to_merge": 5,
       "min_entries_to_merge": 1,
       "min_entries_to_merge_wait_minutes": 5,
       "check_response_timeout_minutes": 60
     }}]
   }
   ```
   `ALLGREEN` = every queued entry must independently pass (safest). `min_entries_to_merge:1` + `wait:5` = merge a single ready entry after a short batching window. `check_response_timeout:60` ≥ the ~7m CI with headroom.

2. **Flip classic `strict` → false** (`gh api -X PATCH .../branches/main/protection/required_status_checks -f strict=false`, keeping the 12 contexts). The queue is the up-to-date mechanism now; leaving `strict=true` alongside a queue is the documented "two alternatives" conflict and risks an "out of date, can't queue" state. The 12 required **checks stay required** (strict only governs the up-to-date requirement, not the contexts list). Order: ruleset active first, then strict=false — the queue re-tests against main, so there is no stale-merge window.

## Verification (immediately after Phase 2)

- Queue **PR F** (the `supabase start -x` boot trim) via "Merge when ready" (`gh pr merge --merge --auto` enrolls it in the queue once required checks pass on the PR). Confirm: a `gh-readonly-queue/main/...` branch appears; `quality`/`unit-suite`/`x-audits` run on the **merge_group** event; PR F merges via the queue without a manual rebase.
- Confirm an ordinary PR can no longer merge by bypassing the queue.

## Rollback (if merges break)

Single, fast, complete: `gh api -X DELETE repos/.../rulesets/<id>` removes the queue (reverts to classic-protection-only behavior), and `…protection/required_status_checks -f strict=true` restores the up-to-date requirement. Capture the ruleset `id` on creation. The classic 12-check protection is untouched throughout, so deleting the ruleset is a complete revert.

## Out of scope

- Migrating classic protection → rulesets (unnecessary; the merge_queue ruleset coexists).
- Tuning batch sizes beyond the conservative defaults above (revisit if throughput warrants).

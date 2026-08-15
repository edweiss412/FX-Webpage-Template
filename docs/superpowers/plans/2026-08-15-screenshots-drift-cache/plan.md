# Screenshots-drift cache refresh — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the
> Opus pane's entry point). The spec is
> `docs/superpowers/specs/ci/2026-08-15-screenshots-drift-cache-refresh-design.md`;
> this plan carries its own adversarial-review gate below.

**Goal:** make a stale nextcache restore impossible in `screenshots-drift.yml` —
exact input-hash key in a fresh `-v2-` namespace, no `restore-keys`, split
`actions/cache/restore@v4` + `actions/cache/save@v4` with an `if: always()` save —
pin the shape, and prove the design with real `workflow_dispatch` runs.

**Architecture:** one implementation branch, `fix/screenshots-drift-cache`, off
`origin/main`, three tasks, one PR.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/ci/2026-08-15-screenshots-drift-cache-refresh-design.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 6 (conventional commits), 11
  (worktree-only), 12 (claims — marker pre-declared by the authoring handoff; strips
  in the archive move, task B3).
- CI-bound arc: **real CI green is a separate gate from local review** (AGENTS.md
  local-passes-CI-fails rule); the §2.3 dispatch proofs are the workflow-level
  verification and their run ids are recorded in the PR body.
- Worktree setup: `pnpm install && pnpm worktree:link-env && pnpm preflight` (the
  branch runs vitest suites — the docs-only preflight exemption is NOT invoked).
- Archive RED (task B3): move the entry WITH its flight marker → observe
  `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` fail by name → strip →
  GREEN.

## Pre-draft verification pass (writing-plans rule)

Verified 2026-08-15 on the authoring branch (grep transcripts in the review dispatch):

- The combined step is the only cache step in `.github/workflows/screenshots-drift.yml`
  ("Restore Next build cache (screenshots-help :3004 build)", `actions/cache@v4`,
  path `.next-screenshots-help/cache`, key
  `${{ runner.os }}-nextcache-screenshots-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}`,
  two prefix restore-keys). The chown step ("Reclaim Next cache ownership") runs
  `if: always()` and precedes the drift check; the drift check is
  `git diff --exit-code public/help/screenshots/` plus an untracked-files test; the
  failure-only artifact upload is last.
- `workflow_dispatch:` is declared in the workflow (the 2026-08-14 probe used it).
- `tests/cross-cutting/ci-workflow-speedup.test.ts` already reads this workflow (its
  `describe` at line 71-72 via `readWorkflow("screenshots-drift.yml")`); its
  `PW_WORKFLOWS` combined-cache assertions (lines 155-175) cover three OTHER
  workflows and exclude screenshots-drift by design — the new pin does not collide.
- `.github/workflows/screenshots-regen.yml` has zero cache steps (the probe's
  no-cache control).
- No other test pins the nextcache step's shape (`grep -rn 'nextcache-screenshots'
  tests/` → no hits).

## Meta-test inventory (declared per writing-plans rule)

- **EXTENDS:** `tests/cross-cutting/ci-workflow-speedup.test.ts` — one new `describe`
  pinning the restore/save split (spec §2.2). Already CI-wired (runs in the unit
  suite); no new testMatch or workflow entry.
- **CREATES / registries:** nothing else — no Supabase call site, no mutation
  surface, no advisory lock, no §12.4 row, no `env:` block or `GITHUB_ENV` write (the
  CI env-guard layers see no change).

## Task B1 — pin + workflow edit (one commit)

1. **Write the pin** in `tests/cross-cutting/ci-workflow-speedup.test.ts`, new
   `describe("screenshots-drift nextcache: exact input-hash key, no fallback, always-save")`,
   asserting on PARSED step objects — `import { parse } from "yaml"` and walk
   `jobs.screenshots-drift.steps`, the same pattern the wiring guards already use
   (`tests/cross-cutting/app-e2e-ci-wiring.test.ts:27`); never file-wide substrings
   and never raw text-block slicing, so a commented-out `# uses:` line can satisfy
   nothing (plan R2 F1) — the spec §2.2 nine (behavioral assertion 9 included — plan
   R1 F1):
   1. exactly one `actions/cache/restore@v4` and one `actions/cache/save@v4` step; no
      combined `actions/cache@v4` block naming `.next-screenshots-help/cache` (the
      OTHER workflows' `~/.cache/ms-playwright` combined steps asserted at lines
      155-175 stay legal and untouched);
   2. the save step's block carries `if: always()`;
   3. restore and save declare the same `path`; the restore carries
      `id: nextcache-restore` and the save's `key` is exactly
      `${{ steps.nextcache-restore.outputs.cache-primary-key }}` (single-evaluation
      parity, spec R2 F1);
   4. the restore block declares NO `restore-keys`;
   5. step order capture → chown → drift check → save, asserted on extracted-step
      indices;
   6. the restore key's `hashFiles(...)` argument set == the `pull_request.paths`
      glob set MINUS `public/help/screenshots/**` plus exactly `pnpm-lock.yaml`,
      `next.config.ts`, `package.json` (parse both lists from the YAML; compare as
      sets; the exclusion's reason — capture mutates those bytes mid-run — lives in
      the assertion's comment);
   7. the save block cites `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING`;
   8. key SHAPE (spec R2 F4): the restore key matches exactly
      `${{ runner.os }}-nextcache-screenshots-v2-${{ hashFiles(...) }}` — namespace
      present, no further components;
   9. behavioral name emission (spec R3 F3, §2.2 assertion 9): extract the
      drift-check step's `run:` script from the YAML and EXECUTE it (bash, cwd a
      constructed throwaway git repo with `public/help/screenshots/` holding one
      committed-then-modified WebP and one untracked WebP): exit non-zero AND BOTH
      filenames in the captured output — a script that prints only the tracked name
      fails here by name; clean-repo negative exits 0 with no names (plan R1 F1).
2. **RED, observed:** `pnpm vitest run tests/cross-cutting/ci-workflow-speedup.test.ts`
   fails on the new describe against the unedited workflow — the production lines
   whose defect makes it fail are the combined `actions/cache@v4` step and the absent
   save step. Record the failure output.
   **Four pre-dispatch mutants (writing-plans string-presence rule, plan R2 F1),
   each run against the FINISHED pin + edited workflow and recorded in the commit:**
   (a) empty the save step's `key:` value → pin red; (b) append `-${{ github.sha }}`
   to the restore key → pin red (shape assertion 8); (c) present-but-not-live —
   comment out the save step's `uses:` line → pin red (a parsed-YAML walk sees no
   save step; this is the exact escape a text-block extractor would miss); (d) vary
   each discriminating parameter in turn — `path` on the save step, `if:` condition
   dropped, one hashFiles glob removed → pin red each time. Restore the workflow
   after each mutant; all four results pasted into the task record.
3. **Edit the workflow** per spec §2.1: restore step (`actions/cache/restore@v4`,
   `id: nextcache-restore`, same path, NEW key
   `${{ runner.os }}-nextcache-screenshots-v2-${{ hashFiles(...) }}` over the 24
   census args — the 22 filter globs minus `public/help/screenshots/**` plus the
   three named extras — NO `restore-keys`; comment rewritten to the
   key-construction argument, dropping the refuted byte-safety paragraph); save step
   (`actions/cache/save@v4`, `if: always()`, same path,
   `key: ${{ steps.nextcache-restore.outputs.cache-primary-key }}`, entry-citing
   comment) placed after the chown step and after the drift check; the drift-check
   step becomes the ONE aggregated check of spec §2.1 — both name lists computed
   first, every name from both printed, single exit (spec R2 F3 + R3 F2); chown
   comment repointed at the explicit save. Step order otherwise unchanged.
4. **GREEN:** the suite passes; `pnpm exec eslint . && pnpm format:check && pnpm
   typecheck` clean.
5. Commit: `fix(ci): split screenshots-drift nextcache into restore/save with
   always-save so failing runs refresh their cache`.

## Task B2 — dispatch proofs (an EVIDENCE task, not a code task; plan R3 F1)

Invariant 1's red-then-green binds code tasks; B2 ships no code. Its shape is the
repo's stated-proof precedent for non-code tasks (the L-wave plan's own rule:
"Stamp-only and refile tasks use `pnpm vitest run tests/docs/` green as their proof
(prose edits have no executable red of their own)",
`docs/superpowers/plans/2026-08-06-l-wave/plan.md:26-27`). B2's deliverable is
EVIDENCE; its executable proof is the conclusion check in step 3 below — three
recorded run ids whose `gh run view <id> --json conclusion -q .conclusion` outputs
match the expected values exactly (success, success, failure). The constructed
failing dispatch is the mutant-red for the WORKFLOW gate (spec §2.3), not a vitest
red.

1. Push the branch. `gh workflow run screenshots-drift.yml --ref
   fix/screenshots-drift-cache`; the first run MISSES (empty v2 namespace), builds
   cold, passes, and the save logs a saved cache. Dispatch again on the same ref: the
   second run HITS the exact key (warmth proof). Record both run ids.
2. **Failing-run proof (the constructed failing input, spec §2.3.3):** on a throwaway
   branch off the impl branch, edit a rendered admin-chrome string (a real render
   input under `components/admin/**`) WITHOUT regenerating baselines; push; dispatch
   on that ref. Confirm all three in one run: restore MISSES (input hash moved, no
   fallback), the `drifted-screenshots` artifact shows the NEW chrome (stale restore
   impossible, live), the run FAILS at "Check screenshot drift", and the save still
   executes and saves under `if: always()`. Record the run id; delete the throwaway
   branch. The edit never reaches the impl branch.
3. All three run ids, with per-run step-level observations AND the literal
   `gh run view <id> --json conclusion -q .conclusion` output per run (expected:
   `success`, `success`, `failure` — the task's executable proof, plan R3 F1), land
   in a committed transcript — a new file named "dispatch-proofs" (markdown) in
   this plan directory (created by the task) — commit
   `docs(plan): record screenshots-drift dispatch-proof run ids`. The commit puts
   the evidence in the reviewed diff (plan R2 F2). The PR body and the B3 archive
   resolution cite the same ids.

## Task B3 — archive + close

1. Merge `origin/main` FIRST (ledger conflicts resolve per-entry, both sides
   preserved), so gates and the final review examine the tree that merges (the
   "review covers what merges" lint shape, class-swept from the sibling arc's plan
   R1 F3).
2. Archive `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING` (archive RED)
   with: the shipped direction, the two rejected directions (spec §4.1-§4.2), and the
   B2 run ids as resolution evidence. Marker strips inside the move, which is
   exactly where invariant 12 places it for a graduating entry ("A graduating
   entry's marker comes off in the same commit that archives it — archives
   categorically reject in-progress entries", AGENTS.md invariant 12; plan R3 F2
   REFUTED the last-commit reading — that clause governs markers on entries that
   STAY OPEN, and this branch's only entry graduates). Later review-forced repair
   commits and mechanical `origin/main` merges are ordinary; a repair re-runs the
   gates and re-dispatches the review. Commit:
   `docs(backlog): archive BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING
   with dispatch-run evidence`; push (plan R1 F5 — the archive, run ids, and marker
   release must reach the reviewed diff before the PR gate).
3. Terminal check, run and recorded, over ALL FOUR ledger files:
   `! grep -q 'Branch:\*\* fix/screenshots-drift-cache' BACKLOG.md
   BACKLOG-archive.md DEFERRED.md DEFERRED-archive.md` — exits 0 exactly when no
   marker spelling survives anywhere (plan R1 F3 exit-safety; four-file scope
   class-swept from the sibling arc's plan R1 F4), PLUS
   `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` green (walks every
   ledger file from disk; archives categorically reject in-flight entries).
4. Pre-push gates: `pnpm heavy pnpm test:fast`, `pnpm typecheck`,
   `pnpm exec eslint .`, `pnpm format:check`. Whole-diff codex-guard review
   (`--stage diff`) to APPROVE runs after the merge and gates, on the final tree.
5. PR (body: preflight ran; dispatch run ids; RED transcript) → real CI green →
   `gh pr merge --merge` same turn → ff main, verify `0 0`. Note: the PR itself
   fires the drift workflow (the paths filter lists the workflow file), so the PR run
   is a third live verification.

## Adversarial review (cross-model)

- This plan: self-review (below) → codex-guard `--stage plan --round <n>` to APPROVE
  before execution handoff. Briefs carry REVIEWER ONLY, the numbered CONSEQUENCE
  BOUND / PROBE DOMAIN / THREAT-MODEL FENCE block with the literal phrase "never
  silently wrong", VERDICT + FINDINGS lines, round cap 4, and the spec §1.1
  do-not-relitigate list.
- The impl branch: whole-diff codex-guard `--stage diff` review to APPROVE before
  merge (single brief — one workflow, one test file, ledger moves).

## Execution handoff

After this authoring branch's PR merges, a fresh Opus pane executes Tasks B1-B3 from
`HANDOFF.md` in this directory. The impl worktree + branch + claim marker are created
by the authoring session BEFORE its PR's last commit releases the authoring claim,
per the handoff-by-overlap protocol (the impl branch's `pnpm ledger:claims --check`
EXPECTS exit 1 naming `docs/screenshots-drift-cache-spec` and only it; any other
branch = stop). Never end a turn mid-pipeline; 10-minute nudge per Stage-0 semantics.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol/step re-grepped against the live tree (workflow step
      names, `ci-workflow-speedup.test.ts` line anchors, regen workflow's zero cache
      steps).
- [ ] Anti-tautology: every pin assertion runs on extracted step blocks, not
      file-wide substrings; the failing-dispatch proof derives from a constructed
      failing input (a real render-input edit), not from re-reading the green run.
- [ ] RED validity: the pin fails against the CURRENT workflow (combined step live at
      plan time); same command passes after the edit.
- [ ] Gate commands probed: the drift check's failure mode is exercised by B2.2's
      constructed input; `gh workflow run` on a branch ref verified live by B2.1.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-screenshots-drift-cache/plan.md`
      0 hard.

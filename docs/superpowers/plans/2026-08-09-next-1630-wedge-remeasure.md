# Next 16.3.0 Bump + Wedge Re-measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is procedural (dependency bump + CI measurement + ledger disposition) — tasks are strictly sequential; do NOT parallelize.

**Goal:** Bump `next` 16.2.10 → 16.3.0 and measure whether its 4.5-months-newer vendored React canary fixes the Published-toggle client-commit wedge, then disposition `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` per the pre-stated decision rule.

**Architecture:** Zero product code. One dependency edit + lockfile; the measurement harness already exists (`transitions_repeats` workflow_dispatch input on `.github/workflows/lifecycle-layout-e2e.yml`). The spec is `docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md` — read it in full first; its §4.1 decision rule and §5 dispositions govern Tasks 3–4. Ordering principle: all content commits land BEFORE the final-head CI gate (Task 6), because spec AC-2 binds the six dark-suite dispatches to the head that merges.

**Tech Stack:** pnpm, gh CLI, GitHub Actions, Playwright (CI-side only).

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure`, branch `chore/next-1630-wedge-remeasure` (already created, claimed, pushed).
- Spec §1.1 (do not relitigate): `next`-only bump — no `@next/*`/`eslint-config-next` alignment; NO client watchdog under any outcome; merge-per-AC-2-even-if-still-wedging (measurement decides the LEDGER disposition, not the merge); zero product code; no new CI surface.
- Spec §7 AC-5 file allowlist: only `package.json`, `pnpm-lock.yaml`, `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A's registry row only), `docs/superpowers/**`, `docs/review-rounds/**`, and (drift contingency only) `public/help/screenshots/**` may change on this branch. Task 6 verifies this executably.
- **Every commit is followed by `git push` in the same step.** The reviewed and merged head must contain everything; a local-only commit is a plan violation.
- **TDD posture (declared):** Invariant 1 has no RED shape here — no behavior is authored; the app's existing suites are the regression net and the CI measurement loop is the empirical test. No task in this plan writes a test.
- **Meta-test inventory (declared):** none applies beyond outcome A's registry row in the EXISTING `tests/docs/_metaDeferralLedgerGraduation.test.ts` — no new meta-test is created or extended structurally; no auth/DB/admin-alert/tile surface, no advisory-lock path, no mutation surface.
- impeccable-gate: N/A — no UI surface.
- Commits: conventional style, `--no-verify`, each ending with the Claude Code trailer block already used on this branch (`git log -2` shows the format).
- `2026-08-XX` anywhere below = the actual execution date; stamp it.

---

### Task 1: Bump next to 16.3.0

**Files:**
- Modify: repo-root `package.json` (the `"next": "16.2.10"` dependency line)
- Modify: `pnpm-lock.yaml` (via `pnpm install`, never by hand)

**Interfaces:**
- Produces: a branch head where `pnpm exec next --version` reports 16.3.0 and the vendored React canary is `cbb046ab-20260731` — Task 3's measurement subject.

- [ ] **Step 1: Edit the dependency**

In the worktree root `package.json`, change `"next": "16.2.10"` to `"next": "16.3.0"`. Touch nothing else in the file.

- [ ] **Step 2: Update the lockfile**

Run: `pnpm install`
Expected: exits 0, `pnpm-lock.yaml` modified, no other file dirty (`git status --porcelain` shows exactly `package.json` and `pnpm-lock.yaml`).

- [ ] **Step 3: Verify the bump is real (probe, not assumption)**

Run: `pnpm exec next --version`
Expected: `Next.js v16.3.0`

Run: `grep -m1 -o '19\.[0-9]*\.[0-9]*-canary-[a-f0-9]*-[0-9]*' node_modules/next/dist/compiled/react/cjs/react.production.js`
Expected: `19.3.0-canary-cbb046ab-20260731` (spec §2.1). If this prints anything else, STOP — the spec's premise is wrong; set blockedOn in the worktree's .claude/ship-state.json marker and escalate.

- [ ] **Step 4: Local gates**

Run: `pnpm typecheck`
Expected: exits 0.

Run: `pnpm build`
Expected: exits 0 (Next 16.3 compiles the app).

- [ ] **Step 5: Commit + push**

```bash
git add package.json pnpm-lock.yaml
git commit --no-verify -m "chore(infra): bump next 16.2.10 -> 16.3.0 (vendored React canary 20260317 -> 20260731)"
git push
```

(Append the branch's standard co-author/session trailer as on prior commits.)

---

### Task 2: Open PR; auto-triggered CI green

**Files:** none (GitHub state only)

**Interfaces:**
- Consumes: Task 1's pushed head.
- Produces: a PR with green auto-triggered checks and the PR-body scaffold Task 3 fills in. (The six dark-suite dispatches happen in Task 6, against the FINAL head — spec AC-2.)

- [ ] **Step 1: Open the PR**

```bash
gh pr create --title "chore(infra): next 16.3.0 bump + Published-toggle wedge re-measurement" --body "$(cat <<'EOF'
Executes docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md for BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE.

Bump: next 16.2.10 -> 16.3.0 (vendored React 19.3.0-canary-3f0b9e61-20260317 -> 19.3.0-canary-cbb046ab-20260731). Zero product code.

## Measurement (spec §4)
Baseline: 7/10 wedged (run 30235889083, canary 20260317).
- Valid dispatch runs: PENDING
- Discarded/invalid runs: PENDING (or none)
- Wedged samples of 20 valid: PENDING
- Wedged flips of F executed: PENDING
- Decision (§4.1): PENDING

## Dark-suite dispatches on final head (spec §6, filled by Task 6)
PENDING

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BDmohc85Vb5jkHAeviyiPs
EOF
)"
```

- [ ] **Step 2: Wait for auto-triggered CI**

Run: `gh pr checks --watch`
Expected: every check green. (Auto-running on this diff, per spec §6: crew-e2e, lifecycle-layout-e2e, quality, section-header-visual, standalone-e2e, unit-suite, x-audits, phantom-gap-e2e, step3-live-bundle.) A red auto check: diagnose; a Next-minor regression needing product-code repair exceeds AC-5 — set blockedOn in the worktree's .claude/ship-state.json marker and escalate rather than patching app code here.

---

### Task 3: Run the measurement loop (2 × 10 samples, plus replacements per validity)

**Files:** none (GitHub state + PR body edit)

**Interfaces:**
- Consumes: green PR head from Task 2.
- Produces: wedged-sample count (of 20 valid), wedged-flip count (of F executed), all run URLs, recorded in the PR body — Task 4's disposition input.

- [ ] **Step 1: Dispatch measurement run 1 and capture ITS run id (never a PR-triggered run's)**

```bash
gh workflow run lifecycle-layout-e2e.yml --ref chore/next-1630-wedge-remeasure -f transitions_repeats=10
sleep 10
RUN1=$(gh run list --workflow=lifecycle-layout-e2e.yml --branch chore/next-1630-wedge-remeasure \
  --event workflow_dispatch --json databaseId,url,headSha --limit 1 --jq '.[0].databaseId')
echo "RUN1=$RUN1"
gh run watch "$RUN1" --exit-status || true
```

`--event workflow_dispatch` is what excludes the ordinary one-repeat `pull_request` runs of the same workflow. The `|| true`: a run conclusion of `failure` can still be a valid measurement (spec §4 item 5 — wedges self-recover, but a reload-tier throw fails the case while still being a wedged sample); validity is decided in Step 2, not by exit code.

- [ ] **Step 2: Classify the run and count (mechanical, spec §4 items 4–5)**

Run validity — the measurement step must have executed its repeats:

```bash
gh run view "$RUN1" --log > "run-$RUN1.log"
grep -c "Published toggle round-trip" "run-$RUN1.log" || true
```

Expected: a nonzero count of test-execution lines mentioning the case. If the log shows the job died in setup, in the preceding layout-spec step, or hit the 35-minute timeout before/inside the measurement step: the run is INVALID — record its URL under "Discarded/invalid runs" in the PR body and dispatch a replacement (repeat Step 1).

Wedged-flip count for the run (`|| true` because ZERO MATCHES IS THE FIX-CONFIRMED CASE — grep exits 1 with output `0`, which is a success branch here, not a command failure):

```bash
grep -c "tier=plain did not land" "run-$RUN1.log" || true
grep "wedge-recovery" "run-$RUN1.log" || true
```

Sample-grained partition — one trace directory per test invocation (the workflow runs `--trace=on` and uploads `test-results/`, workflow lines 132-146), so each sample's console output is inspectable per-sample:

```bash
gh run download "$RUN1" --dir "run-$RUN1-artifacts"
WEDGED_SAMPLES=0; EARLY_ENDED=0; TOTAL_TRACES=0
for tz in $(find "run-$RUN1-artifacts" -name "trace.zip"); do
  TOTAL_TRACES=$((TOTAL_TRACES+1))
  if unzip -p "$tz" 2>/dev/null | grep -a -q "tier=plain did not land"; then
    WEDGED_SAMPLES=$((WEDGED_SAMPLES+1))
    unzip -p "$tz" 2>/dev/null | grep -a -q 'ON flip' || EARLY_ENDED=$((EARLY_ENDED+1))
  fi
done
echo "traces=$TOTAL_TRACES wedged_samples=$WEDGED_SAMPLES early_ended=$EARLY_ENDED"
```

Per-sample rules from the trace inspection:
- A sample (trace) containing a `tier=plain did not land` line = **wedged sample**; its wedged flips = its count of those lines.
- A FAILED sample with no wedge-recovery line = **indeterminate** — excluded (spec §4 item 5); note it in the PR body. (Passed samples are valid and unwedged.)
- **F (executed flips)** = 2 × (valid samples) − (early-ended samples), where early-ended = wedged samples whose trace shows no ON-flip activity after an OFF-flip wedge (the reload-tier throw ended the sample after one flip).

- [ ] **Step 3: Dispatch run 2; repeat Steps 1–2 (RUN2)**

Same commands with `RUN2`. Keep dispatching replacement runs per the validity rule until ≥20 valid samples exist. The decision reads exactly the first 20 valid samples in dispatch order.

- [ ] **Step 4: Record in the PR body**

`gh pr edit <pr-number> --body "<updated body>"` — reproduce the Task 2 body with every PENDING line filled: valid run URLs; discarded/invalid run URLs (or "none"); wedged samples N/20; wedged flips M of F executed (F from Step 2's formula); the §4.1 decision line ("0/20 wedged samples → fix confirmed" or "N≥1 → not fixed").

---

### Task 4: Ledger disposition (exactly one of A / B)

**Files:**
- Modify: `BACKLOG.md` (both outcomes)
- Modify: `BACKLOG-archive.md` + `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A only)

Consult spec §5 for the authoritative wording. Execute ONLY the outcome the measurement selected. **The IN PROGRESS marker is NOT touched in this task under outcome B** (it comes off in Task 6, the PR's last content commit — spec §5B / invariant 12). Under outcome A it MUST come off here (archives reject in-flight entries — same-commit rule).

- [ ] **Outcome A (0 wedged samples in 20): archive the entry**

In one commit:
1. Cut the entire `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` section from `BACKLOG.md` (heading through the "Watch signals" paragraph). This removes the IN PROGRESS/Branch marker (it lives on the entry's meta line).
2. Append the section to `BACKLOG-archive.md` per that file's archived-entry format, meta line rewritten to `**Status:** CLOSED 2026-08-XX (upstream fix confirmed by measurement)`, watch signals preserved verbatim, plus a closing stamp paragraph containing ALL of:
   - all valid dispatch run URLs;
   - `3f0b9e61-20260317` wedged 7/10 (run 30235889083) vs `cbb046ab-20260731` wedged 0/20 samples (0 wedged flips across all executed flips);
   - Fisher exact one-sided p ≈ 5.9×10⁻⁵;
   - **the §4.1 decision rule, restated:** "Decision rule (pre-stated): 0 wedged samples in 20 valid samples = fix confirmed; ≥1 = not fixed. Measured: 0/20.";
   - the branch name `chore/next-1630-wedge-remeasure` (the graduation guard asserts the archived section contains the provenance string);
   - the note that the e2e recovery tiers remain in `expectFlipLanded` deliberately;
   - the un-archive contract verbatim: "Un-archive triggers: (a) any future `[wedge-recovery]` line (ANY tier, including the plain-escalation line) in lifecycle-layout-e2e output; (b) an admin report of a stuck Published switch. On either, this entry returns to BACKLOG.md as **Status:** OPEN (park posture re-evaluated against whatever canary is then vendored) and its `BACKLOG_GRADUATED` row is removed in the same commit."
3. Add to the `BACKLOG_GRADUATED` array in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (existing commented-row style):

```ts
// chore/next-1630-wedge-remeasure (2026-08-XX): upstream React replay-loss fix
// confirmed by measurement: 0/20 wedged samples on next 16.3.0's vendored canary
// cbb046ab-20260731 vs the 7/10 baseline on 3f0b9e61-20260317.
{
  id: "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE",
  provenance: "chore/next-1630-wedge-remeasure",
},
```

4. Verify + commit + push:

```bash
pnpm vitest run tests/docs/
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit --no-verify -m "docs(plan): archive BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE - 0/20 wedged samples on next 16.3.0"
git push
```

Expected: vitest green before the commit; push succeeds.

- [ ] **Outcome B (≥1 wedged sample in 20): re-stamp the entry open — marker STAYS for now**

In one commit:
1. In `BACKLOG.md`, leave the `**Status:** IN PROGRESS · **Branch:** …` meta line UNTOUCHED (Task 6 removes it in the last content commit).
2. Below the l-wave-screen stamp line, add: `**Re-measured 2026-08-XX (chore/next-1630-wedge-remeasure):** next 16.3.0 (vendored canary cbb046ab-20260731) still wedges: N wedged samples of 20 valid samples; M wedged flips of F executed flips (F from the run logs per spec §4 item 4; run URLs, valid runs only); 16.3.0 is measured-insufficient, PARKED-WATCH continues.`
3. In the entry body, edit the sentence ending "so no patch-bump fix exists today." to "so no patch-bump fix existed then; next 16.3.0 (canary cbb046ab-20260731) was measured insufficient 2026-08-XX (see the re-measurement stamp)."
4. Verify + commit + push:

```bash
pnpm vitest run tests/docs/
git add BACKLOG.md
git commit --no-verify -m "docs(plan): re-stamp BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE - next 16.3.0 measured insufficient (N/20 wedged samples)"
git push
```

---

### Task 5: Whole-diff adversarial review

**Files:**
- Create (wrapper-written, committed in Task 6): new JSONL rows under docs/review-rounds/chore/next-1630-wedge-remeasure/

- [ ] **Step 1: Write the review brief**

Write to a scratch path (e.g. /tmp/wedge-remeasure-diff-brief.md, no repo path) a brief containing, verbatim where quoted:
- "Your role: REVIEWER ONLY. Do not fix issues, propose patches as commits, or imply changes you will make. Challenge the implementation approach and surface findings; fixes are the implementer session’s job in a separate dispatch."
- Fresh-eyes whole-diff posture: "Treat the entire diff as if you have not seen it before: `git diff origin/main...HEAD`."
- The spec §1.1 DO-NOT-RELITIGATE list (copy the five bullets).
- Scope note: the spec converged APPROVE after 4 rounds and the plan after its own rounds; review the DIFF (dependency bump + lockfile + ledger/docs edits) for correctness and completeness against spec §5/§7.
- Output contract: "End with exactly two final lines: `FINDINGS: <n>` then `VERDICT: <APPROVE | NEEDS-ATTENTION | BLOCKING>`."

- [ ] **Step 2: Dispatch (backgrounded), bounded wait, read the result**

```bash
OUT="$(pwd)/.codex-diff-r1-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT"
node scripts/codex-guard.mjs review --brief /tmp/wedge-remeasure-diff-brief.md \
  --cwd "$(pwd)" --out "$OUT" --stage diff --round 1 &
GUARD_PID=$!
until [ -f "$OUT/result.json" ] || ! kill -0 $GUARD_PID 2>/dev/null; do sleep 15; done
cat "$OUT/result.json"
```

(`--brief`, `--cwd`, `--out`, `--stage`, `--round` are all required by the wrapper.) Read `status` + `verdict` from `$OUT/result.json`. NOTE: `$OUT` is inside the worktree but dot-prefixed and untracked — do NOT `git add` it; only the wrapper's `docs/review-rounds/**` JSONL rows are committed (Task 6).

- [ ] **Step 3: Triage**

- `status:"verdict"` + `VERDICT: APPROVE` → proceed to Task 6.
- Findings → repair per the class-sweep discipline (sweep the whole diff for each finding's SHAPE before resubmitting), commit + push repairs, re-dispatch with `--round 2` (fresh `--out` dir). Repeat until APPROVE.
- `status:"no_verdict"` → infra fault per AGENTS.md silent-death guidance: re-dispatch once (fresh `--out`); if it recurs, set blockedOn in the worktree's .claude/ship-state.json marker and escalate.

---

### Task 6: Final-head gate, merge, closeout

Everything in this task runs AFTER the last review round, because spec AC-2 binds the dark-suite dispatches to the head that merges.

- [ ] **Step 1: Final content commit — corpus rows + marker removal**

```bash
git add docs/review-rounds/
```

Then, ONLY under outcome B (outcome A's marker came off in Task 4): edit `BACKLOG.md`, restoring the entry's meta line from `**Status:** IN PROGRESS · **Branch:** chore/next-1630-wedge-remeasure · **Severity:** …` to `**Status:** OPEN · **Severity:** …` (drop exactly the Branch field and flip the status; touch nothing else on the line), and `git add BACKLOG.md`.

```bash
git commit --no-verify -m "docs(plan): review-rounds corpus rows; clear flight marker"
git push
```

Verify the marker is gone from the branch (`-F` = literal match, no regex):

```bash
grep -Fn "Branch:** chore/next-1630-wedge-remeasure" BACKLOG.md BACKLOG-archive.md || echo CLEAN
```

Expected: `CLEAN` (grep exits 1 with no hits).

- [ ] **Step 2: AC-5 executable allowlist check**

```bash
git diff --name-only origin/main...HEAD | grep -v -E \
  '^(package\.json|pnpm-lock\.yaml|BACKLOG\.md|BACKLOG-archive\.md|tests/docs/_metaDeferralLedgerGraduation\.test\.ts|docs/superpowers/|docs/review-rounds/|public/help/screenshots/)' \
  || echo AC5-CLEAN
```

Expected: `AC5-CLEAN`. Any other output = an out-of-allowlist file changed — STOP, investigate, remove it before proceeding.

- [ ] **Step 3: Auto-CI green on the final head**

```bash
gh pr checks --watch
```

Expected: all green (pushes in Steps 1 re-triggered the auto suites on the final head).

- [ ] **Step 4: Dispatch all six dark suites against the FINAL head; verify head binding**

```bash
FINAL=$(git rev-parse HEAD)
for wf in admin-layout-e2e.yml help-affordances.yml published-modal-e2e.yml dev-gate-e2e.yml screenshots-drift.yml mutation-harness.yml; do
  gh workflow run "$wf" --ref chore/next-1630-wedge-remeasure
done
sleep 15
for wf in admin-layout-e2e.yml help-affordances.yml published-modal-e2e.yml dev-gate-e2e.yml screenshots-drift.yml mutation-harness.yml; do
  ID=$(gh run list --workflow="$wf" --branch chore/next-1630-wedge-remeasure \
    --event workflow_dispatch --json databaseId,headSha --limit 1 --jq '.[0].databaseId')
  SHA=$(gh run list --workflow="$wf" --branch chore/next-1630-wedge-remeasure \
    --event workflow_dispatch --json databaseId,headSha --limit 1 --jq '.[0].headSha')
  echo "$wf run=$ID headSha=$SHA (must equal $FINAL)"
  gh run watch "$ID" --exit-status || echo "RED: $wf run $ID"
done
```

Each run's `headSha` MUST equal `$FINAL` — if not (a race with a concurrent push), re-dispatch that suite. Record the six run URLs in the PR body ("Dark-suite dispatches on final head" section).

**Red routing (spec §6 — three terminals: GREEN / PRE-EXISTING-RED / ESCALATED):**
- `screenshots-drift.yml` red AT its byte-comparison step (actual drift) → Step 5's regen contingency, then return to Step 4's dispatch loop (the regen commit changed the head — ALL six suites re-dispatch against the new head).
- Any other red (including screenshots-drift red BEFORE comparison — setup/bootstrap/capture) → re-dispatch that suite once (flake allowance); red again → `gh workflow run "$wf" --ref main` and watch: also red on main → PRE-EXISTING-RED (record both run URLs in the PR body, file per normal ledger triage, non-blocking); green on main → bump-caused → repair exceeds AC-5 → set blockedOn in the worktree's .claude/ship-state.json marker and ESCALATE.
- Merge requires all six at GREEN or PRE-EXISTING-RED.

- [ ] **Step 5: Screenshot-regen contingency (only if drift red at comparison)**

```bash
gh workflow run screenshots-regen.yml --ref chore/next-1630-wedge-remeasure
sleep 15
RID=$(gh run list --workflow=screenshots-regen.yml --branch chore/next-1630-wedge-remeasure \
  --event workflow_dispatch --json databaseId --limit 1 --jq '.[0].databaseId')
gh run watch "$RID" --exit-status
git pull --ff-only
```

The regen workflow's final step commits regenerated baselines and pushes them to the branch itself (`git push origin "HEAD:$BRANCH"` in its last step) — the `git pull --ff-only` synchronizes the local worktree with the bot commit BEFORE any further local commits, preventing divergence. If the regen run fails, or a re-dispatched drift run is still red after the regen commit landed: ESCALATED (set blockedOn, escalate). Then RETURN TO STEP 3 (the head changed: auto-CI re-verifies, and Step 4 re-dispatches all six against the new head). This loop is bounded: the regen cycle may run at most once (spec §6).

- [ ] **Step 6: Merge + verify complete**

```bash
gh pr merge --merge
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main
```

Expected final line: `0	0`. Green CI is not a stopping point — merge in the same turn as the last green check. The run is complete ONLY when `0	0` prints.

- [ ] **Step 7: Stage 4.4 teardown**

1. Set stage to "done" in the worktree's .claude/ship-state.json marker.
2. `CronDelete` the implementing session's nudge job (its id is in the marker's `cronJobId`).
3. `herdr pane rename "$HERDR_PANE_ID" --clear` and `herdr agent rename "$HERDR_PANE_ID" --clear` (skip silently if `HERDR_PANE_ID` is empty).
4. Optionally remove the worktree AFTER `0	0`: `git worktree remove /Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure`.

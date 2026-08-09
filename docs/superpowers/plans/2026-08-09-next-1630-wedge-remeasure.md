# Next 16.3.0 Bump + Wedge Re-measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is procedural (dependency bump + CI measurement + ledger disposition) — tasks are strictly sequential; do NOT parallelize.

**Goal:** Bump `next` 16.2.10 → 16.3.0 and measure whether its 4.5-months-newer vendored React canary fixes the Published-toggle client-commit wedge, then disposition `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` per the pre-stated decision rule.

**Architecture:** Zero product code. One dependency edit + lockfile; the measurement harness already exists (`transitions_repeats` workflow_dispatch input on `.github/workflows/lifecycle-layout-e2e.yml`). The spec is `docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md` — read it in full first; its §4.1 decision rule and §5 dispositions govern Tasks 3–4.

**Tech Stack:** pnpm, gh CLI, GitHub Actions, Playwright (CI-side only).

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure`, branch `chore/next-1630-wedge-remeasure` (already created, claimed, pushed).
- Spec §1.1 (do not relitigate): `next`-only bump — no `@next/*`/`eslint-config-next` alignment; NO client watchdog under any outcome; merge-even-if-still-wedging (measurement decides the LEDGER disposition, not the merge); zero product code; no new CI surface.
- Spec §7 AC-5 file allowlist: only `package.json`, `pnpm-lock.yaml`, `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A's registry row only), `docs/superpowers/**`, `docs/review-rounds/**`, and (drift contingency only) `public/help/screenshots/**` may change on this branch.
- **TDD posture (declared):** Invariant 1 has no RED shape here — no behavior is authored; the app's existing suites are the regression net and the CI measurement loop is the empirical test. No task in this plan writes a test.
- **Meta-test inventory (declared):** none applies — no new code, no new tests, no auth/DB/admin-alert/tile surface touched, no advisory-lock path touched, no mutation surface added.
- impeccable-gate: N/A — no UI surface.
- Commits: conventional style, `--no-verify`, each ending with the Claude Code trailer block already used on this branch (`git log -2` shows the format).

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

### Task 2: Open PR; full CI green

**Files:** none (GitHub state only)

**Interfaces:**
- Consumes: Task 1's pushed head.
- Produces: a PR whose `pull_request` CI matrix is green — the bump's regression net (spec §6) — and the PR body scaffold Task 3 fills in.

- [ ] **Step 1: Open the PR**

```bash
gh pr create --title "chore(infra): next 16.3.0 bump + Published-toggle wedge re-measurement" --body "$(cat <<'EOF'
Executes docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md for BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE.

Bump: next 16.2.10 -> 16.3.0 (vendored React 19.3.0-canary-3f0b9e61-20260317 -> 19.3.0-canary-cbb046ab-20260731). Zero product code.

## Measurement (spec §4)
Baseline: 7/10 wedged (run 30235889083, canary 20260317).
- Dispatch run 1: PENDING
- Dispatch run 2: PENDING
- Wedged flips (`tier=plain did not land` lines): PENDING
- Decision (§4.1): PENDING

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BDmohc85Vb5jkHAeviyiPs
EOF
)"
```

- [ ] **Step 2: Wait for auto-triggered CI**

Run: `gh pr checks --watch` (or poll `gh pr checks`)
Expected: every check green. (Auto-running on this diff, per spec §6: crew-e2e, lifecycle-layout-e2e, quality, section-header-visual, standalone-e2e, unit-suite, x-audits, phantom-gap-e2e, step3-live-bundle.)

- [ ] **Step 3: Dispatch all six dark suites (spec §6 — their PR triggers miss dependency-file diffs)**

```bash
for wf in admin-layout-e2e.yml help-affordances.yml published-modal-e2e.yml dev-gate-e2e.yml screenshots-drift.yml mutation-harness.yml; do
  gh workflow run "$wf" --ref chore/next-1630-wedge-remeasure
done
```

Then await each: `gh run list --workflow=<wf> --branch chore/next-1630-wedge-remeasure --limit 1` + `gh run watch <id> --exit-status`. Expected: all six green. Record the six run URLs in the PR body.

**Red dark-suite branches (spec §6 — three terminal dispositions: GREEN / PRE-EXISTING-RED / ESCALATED):**
- `screenshots-drift.yml` red AT its byte-comparison step (actual drift) → the drift contingency below; if the regen workflow fails, or drift is still red after regenerated baselines are committed → ESCALATED (set `blockedOn`, escalate).
- Any other red (any suite, or screenshots-drift red BEFORE comparison — setup/bootstrap/capture) → re-dispatch once (flake allowance); red again → dispatch the SAME workflow with `--ref main`. Also red on main → PRE-EXISTING-RED: record both run URLs in the PR body, file per normal ledger triage, does not block merge. Green on main → bump-caused: repair exceeds AC-5 → ESCALATED (set blockedOn in the worktree's .claude/ship-state.json marker, escalate).
- AC-2 requires every suite at GREEN or PRE-EXISTING-RED before merge; ESCALATED blocks until the user resolves.

**Screenshot-drift contingency (only if the drift gate fails):** trigger `gh workflow run screenshots-regen.yml --ref chore/next-1630-wedge-remeasure`, which regenerates baselines under the pinned Docker image (byte-comparison discipline, AGENTS.md); commit the regenerated `public/help/screenshots/**` WebPs it produces to this branch (per that workflow's own delivery mechanism — read its final step before assuming a local commit is needed) and re-run checks. Never regenerate screenshots on a dev machine.

**Any other red check:** diagnose before touching anything; a Next-minor regression that needs product-code repair exceeds this branch's AC-5 allowlist — set `blockedOn` and escalate rather than patching app code here.

---

### Task 3: Run the measurement loop (2 × 10 samples)

**Files:** none (GitHub state + PR body edit)

**Interfaces:**
- Consumes: green PR head from Task 2.
- Produces: the wedge count + two run URLs, recorded in the PR body — Task 4's disposition input.

- [ ] **Step 1: Dispatch run 1**

```bash
gh workflow run lifecycle-layout-e2e.yml --ref chore/next-1630-wedge-remeasure -f transitions_repeats=10
```

- [ ] **Step 2: Await completion; capture the run id**

```bash
gh run list --workflow=lifecycle-layout-e2e.yml --branch chore/next-1630-wedge-remeasure --limit 3
gh run watch <run-id> --exit-status
```

Expected: run concludes (the e2e recovery tiers mean a wedge does NOT fail the run — spec §4; conclusion `failure` is still a valid measurement unless the failure is infrastructural, in which case re-dispatch and note the discard in the PR body).

- [ ] **Step 3: Validate the run + count wedges (spec §4 items 4–5)**

Run validity: the transitions measurement step must have executed its repeats (a run dying in setup, the preceding layout-spec step, or the 35-min timeout is INVALID — discard, note its URL in the PR body, dispatch a replacement).

```bash
gh run view <run-id> --log | grep "wedge-recovery"
gh run view <run-id> --log | grep -c "tier=plain did not land"
```

Counting (spec §4 item 4): one `tier=plain did not land, escalating` line = one **wedged flip** (exactly one per wedged flip); each repeat (sample) attempts up to two flips (OFF then ON — a thrown recovery failure ends the sample early; a one-flip wedged sample is still a wedged sample). **Wedged sample** = repeat with ≥1 wedged flip. Sample validity (spec §4 item 5): valid = passed repeats + failed repeats showing wedge-recovery lines (a reload-tier failure IS a wedged sample); a failed repeat with NO wedge-recovery line is INDETERMINATE (could have failed before the flips or in the post-republish assertions after them) — EXCLUDE it, note it in the PR body, and dispatch additional runs until ≥20 valid samples exist (exclusion can only drop unwedged-looking samples — a wedged sample always carries its plain-escalation line — so it can never manufacture a false "fixed"). Read the Playwright summary in the log for passed/failed repeat counts.

- [ ] **Step 4: Dispatch run 2; repeat Steps 2–3**

Same commands; second run id. Keep dispatching replacements per the validity rule until ≥20 valid samples exist; the decision reads the first 20 valid samples in dispatch order.

- [ ] **Step 5: Record in the PR body**

`gh pr edit --body ...` replacing the PENDING lines with: all run URLs (valid and discarded, labeled), wedged-sample count /20 and wedged-flip count /40, and the §4.1 decision line ("0/20 wedged samples → fix confirmed" or "N≥1 → not fixed").

---

### Task 4: Ledger disposition (exactly one of A / B)

**Files:**
- Modify: `BACKLOG.md` (both outcomes)
- Modify: `BACKLOG-archive.md` (outcome A only)

Consult spec §5 for the authoritative wording requirements. Both outcomes below are written in full — execute ONLY the one the measurement selected. (`2026-08-XX` in the copy below = the actual execution date; stamp it.)

- [ ] **Outcome A (0 wedged samples in 20): archive the entry**

**Files (this outcome):** Modify `BACKLOG.md`, `BACKLOG-archive.md`, AND `tests/docs/_metaDeferralLedgerGraduation.test.ts`.

In one commit:
1. Cut the entire `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` section from `BACKLOG.md` (heading through the "Watch signals" paragraph).
2. Append it to `BACKLOG-archive.md` following that file's existing archived-entry format, with the meta line rewritten to `**Status:** CLOSED 2026-08-XX (upstream fix confirmed by measurement)` — the IN PROGRESS/Branch marker MUST be gone in this same commit (invariant 12: archives reject in-flight entries) — preserving the entry's two watch signals verbatim, and a closing stamp paragraph containing: all valid dispatch run URLs; `3f0b9e61-20260317` wedged 7/10 (run 30235889083) vs `cbb046ab-20260731` wedged 0/20 samples (0/40 flips); Fisher exact one-sided p ≈ 5.9×10⁻⁵; the branch name `chore/next-1630-wedge-remeasure` (the graduation guard asserts the archived section contains the provenance string); the note that the e2e recovery tiers remain in `expectFlipLanded` deliberately; and the un-archive contract verbatim: "Un-archive triggers: (a) any future `[wedge-recovery]` line (ANY tier, including the plain-escalation line) in lifecycle-layout-e2e output; (b) an admin report of a stuck Published switch. On either, this entry returns to BACKLOG.md as **Status:** OPEN (park posture re-evaluated against whatever canary is then vendored) and its `BACKLOG_GRADUATED` row is removed in the same commit."
3. Add to the `BACKLOG_GRADUATED` array in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (following the existing commented-row style there):

```ts
// chore/next-1630-wedge-remeasure (2026-08-XX): upstream React replay-loss fix
// confirmed by measurement: 0/20 wedged samples on next 16.3.0's vendored canary
// cbb046ab-20260731 vs the 7/10 baseline on 3f0b9e61-20260317.
{
  id: "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE",
  provenance: "chore/next-1630-wedge-remeasure",
},
```

4. Commit: `docs(plan): archive BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE — 0/20 wedged samples on next 16.3.0`

Run: `pnpm vitest run tests/docs/` — Expected: green (graduation guard + ledger meta-suites accept the archive).

- [ ] **Outcome B (≥1 wedge in 20): re-stamp the entry open**

In one commit:
1. In `BACKLOG.md`, restore the meta line to `**Status:** OPEN · **Severity:** MEDIUM ...` (drop the `**Branch:**` field — the flight marker comes off here, in the PR's last-but-one commit at latest).
2. Below the l-wave-screen stamp line, add: `**Re-measured 2026-08-XX (chore/next-1630-wedge-remeasure):** next 16.3.0 (vendored canary cbb046ab-20260731) still wedges — N wedged samples of 20 valid samples; M wedged flips of F executed flips (F from the run logs per spec §4 item 4; run URLs, valid runs only); 16.3.0 is measured-insufficient, PARKED-WATCH continues.`
3. In the entry body, edit the sentence ending "so no patch-bump fix exists today." to "so no patch-bump fix existed then; next 16.3.0 (canary cbb046ab-20260731) was measured insufficient 2026-08-XX (see the re-measurement stamp)."
4. Commit: `docs(plan): re-stamp BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE — next 16.3.0 measured insufficient (N/20 wedged samples)`

Run: `pnpm vitest run tests/docs/` — Expected: green.

---

### Task 5: Whole-diff adversarial review

**Files:**
- Create (wrapper-written): the JSONL corpus row file under docs/review-rounds/chore/next-1630-wedge-remeasure/ (basename = first 12 chars of the merge-base SHA) — commit it.

- [ ] **Step 1: Commit any pending review-rounds rows**

The spec/plan review dispatches already appended JSONL rows via codex-guard. `git status docs/review-rounds/` — add + commit anything untracked: `docs(plan): review-rounds corpus rows for the wedge-remeasure arc`.

- [ ] **Step 2: Dispatch the whole-diff review**

Backgrounded codex-guard, `--stage diff --round 1`, fresh timestamped `--out` dir, brief containing: REVIEWER ONLY (verbatim rule); fresh-eyes whole-diff posture; the spec §1.1 DO-NOT-RELITIGATE list; the diff scope (`git diff origin/main...HEAD`); the FINDINGS:/VERDICT: output contract. The diff is small (2 dep lines + lockfile + docs) — whole-diff is appropriate; split-scope fallback is not needed unless the review dies silently twice.

- [ ] **Step 3: Read result.json; triage**

`status:"verdict"` + `VERDICT: APPROVE` → proceed. Findings → repair per the class-sweep discipline (sweep the whole diff for each finding's shape before resubmitting), commit repairs, re-dispatch `--round 2`. `no_verdict` → treat as infra fault per AGENTS.md silent-death guidance, re-dispatch once before escalating.

---

### Task 6: Merge + closeout

- [ ] **Step 1: Remove the flight marker (if outcome A didn't already)**

Outcome A removed it in the archive commit. Outcome B removed it in Task 4. Verify: `grep -n "Branch:** chore/next-1630-wedge-remeasure" BACKLOG.md BACKLOG-archive.md` — Expected: no hits. If any hit remains, remove it now in a final commit BEFORE merging (invariant 12: the marker never reaches main).

- [ ] **Step 2: Final CI green + merge**

```bash
gh pr checks --watch
gh pr merge --merge
```

Green CI is not a stopping point — merge in the same turn.

- [ ] **Step 3: Sync main + verify complete**

```bash
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main
```

Expected: `0	0`. The run is complete ONLY when this prints `0	0`.

- [ ] **Step 4: Stage 4.4 teardown**

1. Set stage to "done" in the worktree's .claude/ship-state.json marker.
2. `CronDelete` the session's nudge job (the implementing session's own job id, recorded in the marker's `cronJobId`).
3. `herdr pane rename "$HERDR_PANE_ID" --clear` and `herdr agent rename "$HERDR_PANE_ID" --clear`.
4. Optionally remove the worktree: `git worktree remove /Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure` (only after `0	0`).

# Step 3 tap-cluster implementation handoff — Opus pane entry point

You are the Opus implementer session for the step-3 tap cluster (one arc, three BACKLOG entries). This file is self-contained: everything you need is here or one `Read` away. **GATE CHECK before anything else:** open `docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 autonomy grant. Every design decision is ratified — enumerated in spec §1.1; do not re-ask any of them.

## Step 0 — in your FIRST turn, in order

1. Run `date`. The shell clock is the ONLY source of truth for current time; discard any stale timing or "blocked/waiting" framing from anywhere in your context.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md` (canonical), `docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`. Open the committed design mock `docs/superpowers/specs/2026-08-15-step3-tap-decisions-mock.html` in a browser if you want the ratified visual reference.
3. The implementation worktree ALREADY EXISTS with claim markers pushed: `../FX-worktrees/step3-tap-cluster`, branch `fix/step3-tap-cluster` (created by the authoring session; the three entries are marked `IN PROGRESS · Branch: fix/step3-tap-cluster` on origin). Verify the authoring PR is MERGED with an ANCHORED read of origin state, never a bounded log: `git fetch origin && git cat-file -e origin/main:docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md` — exit 0 means the plan is on origin/main (merged); non-zero means STOP, you were launched early. In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main` (mechanical — the parent PR only adds spec/plan/mock and removes its own markers).
4. Overwrite `/Users/ericweiss/FX-worktrees/step3-tap-cluster/.claude/ship-state.json` with YOUR session, as literal valid JSON — `cronJobId` starts EMPTY and is filled by step 5; replace the sessionId value with your actual session UUID (the directory segment of your scratchpad path):

   ```json
   {
     "branch": "fix/step3-tap-cluster",
     "stage": "implementing",
     "tasksRemaining": "T1-T5",
     "next": "Task 1",
     "blockedOn": "",
     "cronJobId": "",
     "sessionId": "<your-session-uuid>"
   }
   ```
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via the supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` is non-empty; otherwise resume the marker's `next` IMMEDIATELY and keep driving; explicitly discard stale blocked/waiting framing. After CronCreate returns, write the new job id into the marker's `cronJobId` (empty until now by design).
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/step3-tap-cluster" && herdr agent rename "$HERDR_PANE_ID" "fix/step3-tap-cluster"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout (`/Users/ericweiss/FX-Webpage-Template`): `pnpm ledger:claims` — the three ids must show `fix/step3-tap-cluster` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task 1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, adversarially reviewed to APPROVE, and MERGED to main via `docs/step3-tap-cluster-spec`.
- The three entries were claimed by the authoring branch, HANDED OFF to `fix/step3-tap-cluster` (markers pushed on this branch), and the authoring branch's markers released in its PR's last commit — no undeclared instant on origin. Your Step-0.7 is verification only.
- All plan-time probes are recorded in the plan's "Pre-draft verification pass" — do not re-derive; re-verify only where a task says to.

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1): each task's RED is stated in the plan — e2e assertions that fail against the current tree for a named production-line reason; Task 4 uses the archive-RED pattern.
- You are Opus and this is UI work — the hard rule is satisfied by you implementing it yourself. Pre-code mechanical UI gate BEFORE Task 1's GREEN; `/impeccable critique` + `/impeccable audit` at close (Task 5), P0/P1 fixed or DEFERRED-entried, findings + dispositions + the filled `impeccable-gate:` line in `closeout.md` in this directory (the directory-unit home invariant 8's style clause sanctions; M-wave/L-wave precedent).
- Heavy-slot discipline: every non-interactive Playwright run through `pnpm heavy`.
- Conventional commits per task, exactly as named in the plan.
- Whole-diff codex-guard review (`--stage diff --round <n>`, round cap 4) to APPROVE before merge. Brief: REVIEWER ONLY; numbered CONSEQUENCE BOUND / PROBE DOMAIN / THREAT-MODEL FENCE block with the literal phrase "never silently wrong"; VERDICT + FINDINGS line instructions; the do-not-relitigate list from spec §1.1 cited at file:line.
- Real CI green is a separate gate from local green (AC-7 names `lifecycle-layout-e2e.yml`); `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `git rev-list --left-right --count main...origin/main` = `0 0`.
- Never end a turn mid-pipeline. Report inline while continuing. Genuine new ambiguity (nothing in spec §1.1 answers it): drain answer-independent work, PushNotification naming the decision, set `blockedOn`, leave the nudge registered.

## Arc completion

PR merged; `0 0` verified; `closeout.md` written in this directory (gate findings + dispositions, the filled `impeccable-gate:` marker line, AC-1..AC-7 confirmations); labels cleared (`herdr pane rename "$HERDR_PANE_ID" --clear` + `herdr agent rename "$HERDR_PANE_ID" --clear`); your cron job CronDelete'd (Stage 4.4 — the only permitted delete site besides supersession).

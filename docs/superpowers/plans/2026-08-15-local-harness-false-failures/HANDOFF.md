# Local-harness false failures — implementation handoff (Opus pane entry point)

You are the Opus implementer session for `fix/local-harness-false-failures`. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-local-harness-false-failures/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT, STOP (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 autonomy grant. Do not re-ask any ratified decision — spec §1.1 enumerates them.

## Step 0 — first turn, in order

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing from anything you read.
2. Read in full: `AGENTS.md` (repo root), `docs/superpowers/specs/ci/2026-08-15-local-harness-false-failures-design.md`, `docs/superpowers/plans/2026-08-15-local-harness-false-failures/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The worktree `../FX-worktrees/local-harness-false-failures` ALREADY EXISTS with claim markers pushed (authoring session, spec §3). Verify the authoring PR is MERGED (`git log --oneline origin/main | head -5` shows the docs/harness-false-failures-spec merge; if not, STOP — launched early). In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight` (this branch runs suites and needs the local stack — NOT docs-only), then `git merge origin/main`.
4. Overwrite `.claude/ship-state.json` in the worktree: `{branch: "fix/local-harness-false-failures", stage: "implement", tasksRemaining: [T1..T5], next: "Task 1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently while `blockedOn` is non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/local-harness-false-failures" && herdr agent rename "$HERDR_PANE_ID" "fix/local-harness-false-failures"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout (`/Users/ericweiss/FX-Webpage-Template`): `pnpm ledger:claims` — the three ids (`BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS`, `BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS`, `BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE`) must show `fix/local-harness-false-failures` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task 1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, adversarially reviewed to APPROVE, MERGED to main on `docs/harness-false-failures-spec`.
- All plan-time probes recorded in the plan's pre-draft pass: the 745-case/39.84s suite baseline, the 978-site operator census, BOTH overlay parity halves (unmutated suite passes 11/11 through `mutantOverlay.config.ts`; an inert-liveCase mutant fails BY NAME), the echo probe (execFileSync default stdio both captures and passes through stderr), and both class sweeps. Do not re-derive; re-verify only where a task says to.
- The spec's R1 review corrected the ledger entry's race hypothesis: the mechanism is stderr echo + crash-stray, NOT a cross-project glob race. The archive resolution (Task 4) must record that correction.

## Non-negotiables this arc exercises

- TDD per task (plan `red=` markers; the archive-RED pattern for Task 4).
- Conventional commits, messages named per task in the plan.
- Worktree-only edits; heavy-slot wrapper on `pnpm mutation:guards` and `pnpm test:fast`.
- Task 3 enrolment BEFORE the first diff-review dispatch; the round-1 diff brief STATES the mutation score + unaccepted-survivor set (AGENTS.md convergence bullet 4).
- Diff review briefs: REVIEWER ONLY; numbered CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS line instructions; round cap 4; spec §1.1 do-not-relitigate list cited at file:line.
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main; verify `0 0`.
- Never end a turn mid-pipeline. If a genuinely new question arises (not covered by spec §1.1): drain answer-independent work, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `git rev-list --left-right --count main...origin/main` == `0 0`; all three entries archived per AC-7; labels cleared; cron job deleted (Stage 4.4). Then STOP — the orchestrator owns anything further.

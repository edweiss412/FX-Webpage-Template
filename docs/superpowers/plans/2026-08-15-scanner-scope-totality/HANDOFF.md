# Scanner scope/totality fidelity — implementation handoff (Opus pane entry point)

You are the Opus implementer session for `fix/scanner-scope-totality`. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT, STOP (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 autonomy grant. Do not re-ask any ratified decision — spec §1.1 and §4 enumerate them.

## Step 0 — first turn, in order

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing from anything you read.
2. Read in full: `AGENTS.md` (repo root), `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md`, `docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The worktree `../FX-worktrees/scanner-scope-totality` ALREADY EXISTS with claim markers pushed (authoring session, spec §3). Verify the authoring PR is MERGED with an ANCHORED origin-state check, never bounded log output: `git fetch origin && git show origin/main:docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md | grep -q "plan-APPROVED"` — exit 0 means merged and gated; non-zero, STOP (launched early). In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main`.
4. Overwrite `.claude/ship-state.json` in the worktree: `{branch: "fix/scanner-scope-totality", stage: "implement", tasksRemaining: [T1..T5], next: "Task 1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time): prompt runs `date` first; supersession check on the marker's `sessionId` (not yours → CronDelete own job, clear pane + agent labels, silent stand-down); silent while `blockedOn` non-empty; otherwise resume the marker's `next` immediately; discard stale blocked/waiting framing. Write the `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/scanner-scope-totality" && herdr agent rename "$HERDR_PANE_ID" "fix/scanner-scope-totality"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout: `pnpm ledger:claims` — `BL-PREMISESCAN-NESTED-HELPER-SCOPE` and `BL-TIMING-SCAN-PROPERTY-TOTALITY` must show `fix/scanner-scope-totality` and no other live branch. Any other branch = real collision, STOP and reconcile. (`BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` is a FILED row, not claimed — it stays OPEN; do not implement it.)
8. Start plan Task 1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, adversarially reviewed to APPROVE, MERGED to main on `docs/scanner-scope-totality-spec`.
- All plan-time probes recorded in the plan's pre-draft pass: the five-site census + the sixth shorthand site, the 7+1+0 boundary-predicate population, the zero numeric-population delta, suite runtimes (10.76s / 52.20s / 11.66s), site counts (130 / 95), and the spec-R1 import-form + propagation probe tables (now in `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY`). Do not re-derive; re-verify only where a task says to.
- Scope fences you must NOT cross: no namespace/re-export/propagation repairs (filed row); no `TIMING_NAME` change on existing paths; no name-resolution for property values (`BL-TIMING-SCAN-NAME-VS-BINDING` is out of scope); NO `DESIGN.md` edit of any kind (§5.5 stays byte-identical — editing it flips the invariant-8 gate).

## Non-negotiables this arc exercises

- TDD per task (plan `red=` markers; archive-RED for Task 4).
- Conventional commits, messages named per task.
- Worktree-only edits; `pnpm heavy` wraps `pnpm mutation:guards` and any full-suite run.
- Task 3 (premiseScan enrolment + interactionTimingScan accepted-set re-derivation) BEFORE the first diff-review dispatch; the round-1 diff brief STATES both scores + unaccepted-survivor sets (AGENTS.md convergence bullet 4).
- Diff briefs: REVIEWER ONLY; CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; round cap 4; spec §1.1 + §4 do-not-relitigate cited at file:line.
- Real CI green is separate from local green; `gh pr merge --merge` in the SAME turn as CI-green; ff main; `0 0`.
- Never end a turn mid-pipeline. Genuinely new question only: drain independent work, PushNotification, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `0 0`; both claimed entries archived per AC-7; `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` untouched and OPEN; labels cleared; cron deleted (Stage 4.4). Then STOP — the orchestrator owns anything further.

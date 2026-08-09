# HANDOFF — quick-wins-2 implementation (Opus pane)

<!-- Launch (run by the authoring session after plan APPROVE):
herdr agent start quick-wins-2-impl --cwd /Users/ericweiss/FX-Webpage-Template --split right --no-focus -- claude --model opus "Read docs/superpowers/plans/2026-08-09-quick-wins-2/HANDOFF.md in full and execute it task-by-task. Full autonomy granted 2026-08-09; do not re-ask."
-->


You are the implementing session for the quick-wins-2 pass. Full autonomy was granted by the user 2026-08-09 ("yes autonomously"); both user review gates are waived; stop only for a genuinely NEW question, and if you must ask, follow the AGENTS.md ask protocol (drain independent work first, PushNotification, blockedOn, leave the nudge registered).

## Read first, in order

1. `AGENTS.md` (whole file — every invariant binds)
2. `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`
3. `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`
4. `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` (this directory)
5. `docs/agents/writing-plans.md` §anti-tautology + premise rules (they govern every test you write)

## Stage 0 for EACH branch (A, then B, then C — per plan topology)

1. `date`; worktree off `origin/main` (`git worktree add -b <branch> ../FX-worktrees/<name> origin/main`), `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`.
2. `pnpm ledger:claims --check <the branch's entry ids>` (exit 1 = collision, stop and reconcile; exit 2 = check untrustworthy, fix first).
3. Flip each of the branch's entries from `**Branch:** docs/quick-wins-2-specs` to the implementation branch, commit, push immediately.
4. `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "<branch>" && herdr agent rename "$HERDR_PANE_ID" "<branch>"`.
5. Register the 10-minute cron nudge (off-minute `7,17,27,37,47,57 * * * *`) with the standard prompt contract: `date` first, shell clock only, discard stale framing, supersession check on the marker's sessionId, delete only at Stage 4.4 or supersession. Write `.claude/ship-state.json` (branch, stage, tasksRemaining, next, blockedOn, cronJobId, sessionId).

## Execution

- TDD per task, task-by-task per the plan's `<!-- task: red=... ac=... -->` contracts. Observed-RED protocols (A4, A6, and the neutered-branch runs) record BOTH observations in the commit message.
- Branch A entries: BL-ESLINT-CONFIG-ARRAY-JOIN-COMMENT-STALE, BL-SHADOW-TILE-ARROW-SYNTAX, BL-CLASS-CONST-LINT-BLINDSPOT, BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT (watch flip, NOT archive), BL-TRANSPORT-ID-RESOLUTION, BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB, BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE.
- Branch B entries: BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR, BL-CREW-FOOTER-NOT-ANCHORED-SHORT-CONTENT. Branch C: BL-WIZARD-CONNECTOR-MAXW-INERT.
- UI branches (B, C) AND branch A run the impeccable dual gate (`/impeccable critique` + `/impeccable audit`, canonical v3 setup) on the affected diff before adversarial review; findings + dispositions to `closeout.md` §12 here.
- Pre-push per branch: full `pnpm test`, `pnpm typecheck` (vitest AND playwright configs), `pnpm exec eslint`, `pnpm format:check`. Real CI green is a separate gate from local green.
- Whole-diff cross-model review per branch through codex-guard (`--stage diff --round <n>`, REVIEWER ONLY line, consequence bound + threat-model fence in the brief, freeze the worktree while a dispatch runs). Split tight-scope briefs if a diff exceeds a handful of files.
- Merge: `gh pr merge --merge` in the same turn CI goes green; then ff-sync the main checkout and verify `git rev-list --left-right --count main...origin/main` is `0  0`; clear pane + agent labels; CronDelete the branch nudge (Stage 4.4).
- Never end a turn mid-pipeline: announced action = emitted tool call in the same turn; report inline while continuing; context pressure is not a stopping reason.

## Ledger mechanics at each branch close

Graduating entries: archive body moves to `BACKLOG-archive.md` with resolution header, marker stripped in the SAME commit (archives reject in-flight rows — `tests/docs/_metaLedgerInProgress.test.ts` enforces). The §2.4 watch flip edits the entry in place (status → watch + trigger + probe) and strips the marker in the PR's last commit.

## After branch C merges

Update this directory's `closeout.md`: impeccable §12 blocks, observed-RED index, sweep dispositions, review-round rows committed (`docs/review-rounds/<branch>/...`), and the closing status line. Then report completion to the user with PR numbers and the ledger delta (six archives + one watch flip + three archives).

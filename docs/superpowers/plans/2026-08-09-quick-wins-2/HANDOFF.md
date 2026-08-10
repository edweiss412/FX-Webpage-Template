# HANDOFF — quick-wins-2 implementation (Opus pane)

<!-- Launch (run by the authoring session after plan APPROVE):
herdr agent start quick-wins-2-impl --cwd /Users/ericweiss/FX-Webpage-Template --split right --no-focus -- claude --model opus "Read docs/superpowers/plans/2026-08-09-quick-wins-2/HANDOFF.md in full and execute it task-by-task. Full autonomy granted 2026-08-09; do not re-ask."
-->

You are the implementing session for the quick-wins-2 pass. Full autonomy was granted by the user 2026-08-09 ("yes autonomously"); both user review gates are waived; stop only for a genuinely NEW question, and if you must ask, follow the AGENTS.md ask protocol (drain independent work first, PushNotification, blockedOn, leave the nudge registered).

## Read first, in order

1. `AGENTS.md` (whole file — every invariant binds)
2. `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`
3. `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`
4. `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` (this directory — task grain of record, A1-A7 / B1-B6 / C1-C2)
5. `docs/agents/writing-plans.md` anti-tautology + premise rules (they govern every test you write)

## Stage 0 for EACH branch (A, then B, then C — per plan topology)

1. `date`; `git fetch origin`; the three implementation branches ALREADY EXIST on origin carrying their ledger-marker commit (pushed by the authoring session per invariant 12) — create the worktree FROM the existing branch: `git worktree add ../FX-worktrees/<name> <branch>` (never `-b` off origin/main, which would orphan the marker commit); **IMMEDIATELY label:** `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "<branch>" && herdr agent rename "$HERDR_PANE_ID" "<branch>"` (labels come right after worktree creation, before any install — AGENTS.md pane-naming lifecycle).
2. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`.
3. `pnpm ledger:claims --check <the branch's entry ids>` (exit 1 = collision, stop and reconcile; exit 2 = check untrustworthy, fix first).
4. The branch's entries are ALREADY marked `**Status:** IN PROGRESS · **Branch:** <this branch>` in its tip commit — verify with `rg -c 'Branch:.*<branch>' BACKLOG.md`; the `--check` in step 3 passing with your own branch as the declarer is the expected state, not a collision.
5. Register the 10-minute cron nudge (off-minute `7,17,27,37,47,57 * * * *`) with the standard prompt contract: `date` first, shell clock only, discard stale framing, supersession check on the marker's sessionId, delete only at Stage 4.4 or supersession. Write the worktree ship-state marker (ship-state.json under the worktree .claude dir) (branch, stage, tasksRemaining, next, blockedOn, cronJobId, sessionId).

## Branch → entry map

- Branch A (`fix/quick-wins-2-mech`): BL-ESLINT-CONFIG-ARRAY-JOIN-COMMENT-STALE, BL-SHADOW-TILE-ARROW-SYNTAX, BL-CLASS-CONST-LINT-BLINDSPOT, BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT (watch flip via A7, NOT archive), BL-TRANSPORT-ID-RESOLUTION, BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB, BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE.
- Branch B (`feat/crew-chrome-footer-avatar`): BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR, BL-CREW-FOOTER-NOT-ANCHORED-SHORT-CONTENT.
- Branch C (`feat/wizard-step-connector`): BL-WIZARD-CONNECTOR-MAXW-INERT.

## Execution rules

- TDD per task, task-by-task per the plan's `<!-- task: red=... ac=... -->` contracts. Observed-RED protocols record BOTH observations in the commit message.
- The invariant-8 dual design gate (both halves, canonical v3 setup: context load of PRODUCT.md + DESIGN.md, then register read) runs per branch INSIDE its gate task (A7, B5, C2) — never as a post-merge afterthought; the closeout file in this directory accretes the per-branch block + the exact §3.3 grammar marker ON that branch, before its final review, so every closeout edit is part of a reviewed, merged diff.
- Pre-push per branch: full `pnpm test`, `pnpm typecheck` (vitest AND playwright configs), `pnpm exec eslint .`, `pnpm format:check`. Real CI green is a separate gate from local green.
- Whole-diff cross-model review per branch through codex-guard (`--stage diff --round <n>`, REVIEWER ONLY line, consequence bound + threat-model fence in the brief, freeze the worktree while a dispatch runs). Split tight-scope briefs if a diff exceeds a handful of files.
- Merge: `gh pr merge --merge` in the same turn CI goes green; then ff-sync the main checkout and verify `git rev-list --left-right --count main...origin/main` is `0  0`; clear pane + agent labels; CronDelete the branch nudge (Stage 4.4).
- Never end a turn mid-pipeline: announced action = emitted tool call in the same turn; report inline while continuing; context pressure is not a stopping reason.

## Ledger mechanics (inside A7 / B6 / C2)

Graduating entries: archive body moves to `BACKLOG-archive.md` with resolution header, marker stripped in the SAME commit (`tests/docs/_metaLedgerInProgress.test.ts` enforces). The watch flip edits `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` in place (status → watch + harness probe + trigger) and strips its marker in the same ledger commit.

## After branch C merges

Everything already landed on-branch (closeout blocks, markers, review-round rows). Report completion to the user with the three PR numbers and the ledger delta (six archives + one watch flip from A; two archives from B; one archive from C).

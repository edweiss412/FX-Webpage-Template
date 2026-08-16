# Diagram demote notice — implementer handoff (Opus pane entry point)

You are the Opus implementer session for `feat/diagram-demote-notice`. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 batch autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec §1.1.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md`, the parent contract `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` §4.1/§1.1, `docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The worktree `../FX-worktrees/diagram-demote-notice` ALREADY EXISTS with the claim marker pushed (created by the authoring session). Verify the authoring PR is MERGED with an ANCHORED check, never bounded log output: `git fetch origin && git cat-file -e origin/main:docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md` exits 0. Non-zero = not merged: STOP — you were launched early. In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main`.
4. Overwrite `/Users/ericweiss/FX-worktrees/diagram-demote-notice/.claude/ship-state.json`: `{branch: "feat/diagram-demote-notice", stage: "implement", tasksRemaining: "C1-C3", next: "Task C1", blockedOn: "", cronJobId: <yours>, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/diagram-demote-notice" && herdr agent rename "$HERDR_PANE_ID" "feat/diagram-demote-notice"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: `pnpm ledger:claims` — `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` must show `feat/diagram-demote-notice` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task C1 in the same turn (its Step 0 scanner-classification probe comes before any code).

## What is already done (do not redo)

- Spec + plan authored and adversarially APPROVED (spec through R5 per its Status line, plan per its Status line) and MERGED on `docs/diagram-demote-notice-spec`.
- Plan-time probes recorded in the plan's "Pre-draft verification pass": the demote handler anchors, the Reset-chip class family, the four clear conditions' probe citations, the scanner forms. Do not re-derive; re-verify only where a task says to (the C1 Step-0 scanner probe is deliberate re-verification).

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1); each task's RED is stated in its plan body.
- UI surface: YOU are Opus. `/impeccable` setup gates BEFORE component code; critique + audit at close (Task C3); closeout carries the filled `impeccable-gate:` marker line.
- Spec §2.1/§2.2 shapes are binding: all FOUR clear conditions (timer, last-wins re-fire, initiator-side `handleClose` wrapper, second-failure) plus the `closingRef` set-gate and the `openNonce` reset seam, `relative` added to the active-branch figure, `aria-hidden` non-interactive chip, Reset-chip token family, `duration-fast ease-out-quart` tokens (no literal ms in classes).
- Timing discipline: `DEMOTE_CHIP_VISIBLE_MS = 6000` literal + DESIGN.md §5.5 row + inventory regen in the SAME commit; `tests/docs/_metaInteractionTimingInventory.test.ts` green both directions.
- Out of scope (do not touch): `BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL`, `BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE`, the demote mechanism, the announce copy.
- Full pre-push gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
- Whole-diff codex-guard `--stage diff --round <n>` review to APPROVE before merge (brief: REVIEWER ONLY; the spec R3 brief's CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE block with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; the spec §1.1 do-not-relitigate list; round cap 4).
- Real CI green is a separate gate; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0`.
- Never end a turn mid-pipeline. Genuine user-only question: drain answer-independent work, PushNotification, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `0 0`; `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` archived (marker stripped in the archive move, last pre-merge commit); labels cleared; cron deleted (Stage 4.4).

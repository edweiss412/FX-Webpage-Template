# Theme persistence-failure note — implementer handoff (Opus pane entry point)

You are the Opus implementer session for `feat/theme-persistence-note`. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 batch autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec §1.1.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md`, `docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The worktree `../FX-worktrees/theme-persistence-note` ALREADY EXISTS with the claim marker pushed (created by the authoring session). Verify the authoring PR is MERGED with an ANCHORED check, never bounded log output: `git fetch origin && git cat-file -e origin/main:docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md` exits 0. Non-zero = not merged: STOP — you were launched early. In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main`.
4. Overwrite `/Users/ericweiss/FX-worktrees/theme-persistence-note/.claude/ship-state.json`: `{branch: "feat/theme-persistence-note", stage: "implement", tasksRemaining: "N1-N4", next: "Task N1", blockedOn: "", cronJobId: <yours>, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/theme-persistence-note" && herdr agent rename "$HERDR_PANE_ID" "feat/theme-persistence-note"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: `pnpm ledger:claims` — `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` must show `feat/theme-persistence-note` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task N1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored and adversarially APPROVED (spec through R4 per its Status line, plan per its Status line) and MERGED on `docs/theme-persistence-note-spec`.
- Plan-time probes recorded in the plan's "Pre-draft verification pass": the three-consumer census, the mount-effect wipe line, the z-scale, the ReSyncButton insertion trap, the width derivation. Do not re-derive; re-verify only where a task says to.

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1); each task's RED is stated in its plan body.
- UI surface: YOU are Opus — the hard rule is satisfied by you implementing it yourself. `/impeccable` setup gates BEFORE component code (context.mjs PRODUCT.md + DESIGN.md load → register read); critique + audit at close (Task N4); closeout carries the filled `impeccable-gate:` marker line.
- Pre-code mechanical gate: no em dash; straight apostrophe; canonical `text-xs/relaxed text-text-subtle`; no new tokens; tap targets untouched.
- Spec §2.2 shapes are binding: always-mounted status containers; anchored `max-w-36` bubble; chrome on the inner span only; the mount-sync functional update preserving `persistFailed`.
- N2b runs wrapped: `pnpm heavy` for any non-interactive Playwright run (machine-wide slot rule).
- Full pre-push gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
- Whole-diff codex-guard `--stage diff --round <n>` review to APPROVE before merge (brief: REVIEWER ONLY; the spec R4 brief's CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE block with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; the spec §1.1 do-not-relitigate list; round cap 4).
- Real CI green is a separate gate; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0`.
- Never end a turn mid-pipeline. Genuine user-only question: drain answer-independent work, PushNotification, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `0 0`; `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` archived (marker stripped in the archive move, last pre-merge commit); labels cleared; cron deleted (Stage 4.4).

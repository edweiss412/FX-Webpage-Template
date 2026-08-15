# Sync-log emit guard — implementer handoff (Opus pane entry point)

You are the Opus implementer session for `fix/sync-log-emit-guard`. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 batch autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec §1.1.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md`, `docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The worktree `../FX-worktrees/sync-log-emit-guard` ALREADY EXISTS with the claim marker pushed (created by the authoring session). Verify the authoring PR is MERGED with an ANCHORED check, never bounded log output: `git fetch origin && git cat-file -e origin/main:docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` exits 0 (the spec exists on origin/main). Non-zero = not merged: STOP — you were launched early. In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main`.
4. Overwrite `/Users/ericweiss/FX-worktrees/sync-log-emit-guard/.claude/ship-state.json`: `{branch: "fix/sync-log-emit-guard", stage: "implement", tasksRemaining: "T1, T1b, T2-T6", next: "Task T1", blockedOn: "", cronJobId: <yours>, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/sync-log-emit-guard" && herdr agent rename "$HERDR_PANE_ID" "fix/sync-log-emit-guard"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: `pnpm ledger:claims` — `BL-SYNC-LOG-EMIT-UNGUARDED` must show `fix/sync-log-emit-guard` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task T1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored and adversarially APPROVED (spec R3, plan per its Status line) and MERGED on `docs/sync-log-emit-guard-spec`.
- All plan-time probes are recorded in the plan's "Pre-draft verification pass" — the escalation template, the alias sweep dispositions, the 18-site double-serialize census, the STALE_WRITE_ABORTED catalog shape. Do not re-derive; re-verify only where a task says to.

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1); each task's RED is stated in its plan body.
- Conventional commits (invariant 6); messages named per task.
- The §12.4 lockstep triple lands in ONE commit (T4): master-spec row + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row; `pnpm test:audit:x1-catalog-parity` is the proof.
- Escalation shape (spec §2.2): local-const `log.error` + `void escalation.catch(() => {})`, `error:` carries the RAW value — never `serializeError(...)` inside `log.*` fields.
- Invariant 10: no new mutation surface expected; if one appears, its registry row lands in the same commit.
- Full pre-push gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
- Whole-diff codex-guard `--stage diff --round <n>` review to APPROVE before merge (brief: REVIEWER ONLY; the spec R3 brief's CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE block with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; the spec §1.1 do-not-relitigate list; round cap 4).
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0`.
- Never end a turn mid-pipeline. Report inline while continuing. Genuine user-only question: drain answer-independent work, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `git rev-list --left-right --count main...origin/main` == `0 0`; `BL-SYNC-LOG-EMIT-UNGUARDED` archived (its marker stripped in the archive move, in the PR's last pre-merge commit); `BL-SYNC-LOG-ATTRIBUTION-METATEST` carries the guard-presence scope line; labels cleared; your cron job deleted (Stage 4.4).

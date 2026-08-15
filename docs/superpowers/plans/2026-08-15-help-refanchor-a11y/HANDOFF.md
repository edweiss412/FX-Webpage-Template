# RefAnchor a11y implementation handoff — Opus pane entry point

You are the Opus implementer session for the `/help/errors` RefAnchor a11y arc. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/plan.md` and confirm its spec's **Status** line (in `docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md`) reads spec-APPROVED and the plan header records plan-APPROVED with codex-guard round references — if either still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns that gate). Both user review gates were WAIVED by the user's 2026-08-15 smalls-batch autonomy grant. Do not re-ask any ratified decision — spec §1.1 enumerates them.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing from anything you read.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md`, `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. The implementation worktree ALREADY EXISTS with the claim marker pushed: `/Users/ericweiss/FX-worktrees/help-refanchor-a11y`, branch `fix/help-refanchor-a11y`. Verify the authoring PR is MERGED with an ORIGIN-ANCHORED check, never bounded log output (writing-plans lint shape ii): `git fetch origin && git show origin/main:docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md | grep -qE "[*][*]Status:[*][*] spec-APPROVED [(]codex-guard R[0-9]+"` AND `git show origin/main:docs/superpowers/plans/2026-08-15-help-refanchor-a11y/plan.md | grep -qE "[*][*]Status:[*][*] plan-APPROVED [(]codex-guard R[0-9]+"` — the STATUS-FIELD shape, not a bare token that unrelated prose could satisfy (gate-grep precision, writing-plans lint shape iii). Both exit 0 or STOP (you were launched early). In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main` (mechanical — the parent PR only adds spec/plan/handoff and strips its own marker).
4. Overwrite `/Users/ericweiss/FX-worktrees/help-refanchor-a11y/.claude/ship-state.json` with `cronJobId` EMPTY for now (the job does not exist yet — plan R2 F5): `{"branch": "fix/help-refanchor-a11y", "stage": "task-1", "tasksRemaining": ["T1 RefAnchor", "T2 skip path", "T3 gate+closeout", "T4 graduation+merge"], "next": "plan Task 1", "blockedOn": "", "cronJobId": "", "sessionId": "<YOUR session UUID — the directory segment of your scratchpad path>"}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via the supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` is non-empty; otherwise resume the marker's `next` immediately and explicitly discard stale blocked/waiting framing. THEN write the returned job id into the marker's `cronJobId` (register first, record second — the id does not exist before registration).
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/help-refanchor-a11y" && herdr agent rename "$HERDR_PANE_ID" "fix/help-refanchor-a11y"`. NEVER rename the workspace.
7. Verify the claim from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: `pnpm ledger:claims` must show `BL-HELP-REFANCHOR-A11Y-PASS` claimed by `fix/help-refanchor-a11y` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task 1 in the same turn.

## What is already done (do not redo)

- Spec + plan + this handoff authored, adversarially reviewed to APPROVE, and MERGED to main on `docs/help-refanchor-a11y-spec`.
- The entry claim was handed off: the authoring branch marked it, the impl branch re-marked it (`**Branch:** fix/help-refanchor-a11y`), and the authoring PR's last pre-merge commit stripped its own marker — no undeclared instant on origin. Your Step-0.7 is verification only.
- All plan-time probes are in the plan's "Pre-draft verification pass" — label pins (exactly two), live counts (219 renderable entries, 666 help tests), the live-region guard's walk roots, the skip-link recipe, the family-id collision check. Do not re-derive; re-verify only where a task says to.

## Execution order

Plan order is binding: Task 1 (RefAnchor component) → Task 2 (page skip path) → Task 3 (spec §7 dual gate + closeout marker) → Task 4 (graduation + PR + CI + merge). TDD per task: tests written and observed RED before implementation, GREEN after, one conventional commit per task (messages named in the plan).

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1); the plan states each task's RED and the production line whose absence makes it fail.
- Worktree-only edits (invariant 11). Ledger claim (invariant 12): the marker comes off inside the Task 4 graduation move (archives reject in-progress entries), which is the PR's last substantive commit.
- UI hard rule: the diff is `app/help/**` — you are Opus; implement and gate it yourself.
- Spec §7 dual gate (both halves) BEFORE merge, with the closeout marker in the exact §3.3 grammar — Task 3's grep red proves it lands. Honest values only; the cross-check rule (`p0+p1>0` ⇒ `recorded`) is enforced by the meta-test.
- The live-region guard (`tests/components/_metaLiveRegionMounting.test.ts`) must stay green with NO new exemption row — the region ships as lawful shape 1 (unconditional mount, text toggles).
- No em dash in any new user-visible copy; canonical token classes; the 44 px focused tap floor rides the layout skip-link recipe verbatim.
- Screenshot baselines: `/help/errors` is not a captured surface and nothing visible changes unfocused — if you nonetheless touch a captured surface's chrome, follow the byte-comparison discipline (regen FROM the pinned image; `git restore public/help/screenshots/` after any local capture).
- Pre-push gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
- Cross-model whole-diff review to APPROVE (codex-guard `--stage diff --round <n>`; brief carries REVIEWER ONLY, the numbered CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE block with the literal phrase "never silently wrong", VERDICT + FINDINGS line instructions, spec §1.1 as the do-not-relitigate list, round cap 4).
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0`.
- Never end a turn mid-pipeline. Report inline while continuing. If something is genuinely the user's call: drain answer-independent work first, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Escalation

Genuine unresolvable ambiguity NOT covered by spec §1.1 → set `blockedOn`, PushNotification once, continue any unblocked work. An ambiguity that maps to a ratified decision is NOT a stop. The tab-order direction (copy-links stay; skip path added) is pre-ratified by the user — only escalate if your own verification finds it actively wrong.

## Arc completion

PR merged; `git rev-list --left-right --count main...origin/main` == `0 0`; every spec §6 AC satisfied; `closeout.md` carries the gate record + marker; the entry graduated with its registry row; labels cleared; your cron job deleted (Stage 4.4).

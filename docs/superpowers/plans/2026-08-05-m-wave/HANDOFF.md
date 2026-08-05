# M-wave implementation handoff — Opus pane entry point

You are the Opus implementer session for the M-wave. This file is self-contained: everything you need is here or one `Read` away. The spec + plan are APPROVED through cross-model adversarial review; both user review gates were WAIVED by the user's 2026-08-04 autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec §1.1 and the brief.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-05-m-wave-design.md`, `docs/superpowers/specs/2026-08-05-m-wave-decisions-brief.md`, `docs/superpowers/plans/2026-08-05-m-wave/plan.md`, and `docs/agents/writing-plans.md` + `docs/agents/spec-self-review.md` (governing rules you will be held to).
3. Overwrite `sessionId` in `/Users/ericweiss/FX-worktrees/m-wave/.claude/ship-state.json` with YOUR session UUID (the directory segment of your scratchpad path). Set `stage` to `"w-docs-implementation"`, `next` to `"Task D1"`. This demotes the authoring session to the soft tier — intended.
4. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the new `cronJobId` into the marker.
5. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/m-wave" && herdr agent rename "$HERDR_PANE_ID" "feat/m-wave"`. Re-run with the unit branch name each time you move to a new unit branch. NEVER rename the workspace.
6. Verify the worktree: you are in `/Users/ericweiss/FX-worktrees/m-wave` on branch `feat/m-wave`; `pnpm preflight` green (env already linked). The main checkout is READ-ONLY (invariant 11).
7. Start plan Task D1 in the same turn.

## What is already done (do not redo)

- Worktree `FX-worktrees/m-wave`, branch `feat/m-wave`, pushed; `pnpm install` + `worktree:link-env` + `preflight` green.
- All 19 wave entries marked `IN PROGRESS · Branch: feat/m-wave`, committed, pushed (invariant-12 Stage 0). The claim-handoff to unit branches is plan Task D6 — read it BEFORE touching markers.
- Spec + plan + brief committed on `feat/m-wave`, adversarially reviewed to APPROVE.

## Execution order

Plan order is binding: W-DOCS (Tasks D1–D6, on this branch) → W-GUARDS (`feat/m-wave-guards`, Tasks G1–G6) → W-PARITY (`feat/m-wave-parity`, P1–P2) → W-UI (`feat/m-wave-ui`, U1–U7). Task D6 creates the three unit worktrees and hands claims over — its ordering steps are load-bearing for invariant 12; follow them exactly.

## Non-negotiables (the ones this wave exercises)

- TDD per task (invariant 1): failing test → minimal implementation → green → commit. The plan states each task's RED.
- Conventional commits (invariant 6); commit messages named per task in the plan.
- Worktree-only edits (invariant 11); each unit branch gets `pnpm install && pnpm worktree:link-env && pnpm preflight` before tests.
- Ledger claims (invariant 12): each unit branch Stage-0 checks + marks + pushes; markers strip in that branch's LAST pre-merge commit.
- W-UI is dual-gate work: `/impeccable` setup gates BEFORE code; critique + audit at close; `closeout.md` carries the `impeccable-gate:` marker line. You are Opus — the UI hard rule is satisfied by you implementing it yourself, not delegating UI to any other model.
- §12.4 lockstep triple in ONE commit, twice (G6, U5).
- Per-branch cross-model review to APPROVE (codex-guard; brief MUST carry REVIEWER ONLY, the numbered CONSEQUENCE BOUND / THREAT MODEL FENCE block, VERDICT-line instruction, do-not-relitigate list from spec §1.1, round cap 4). Split tight-scope briefs for W-UI.
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0` after each merge.
- Never end a turn mid-pipeline. Report inline while continuing. If you must ask the user something genuinely theirs: drain answer-independent work first, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Escalation

Genuine unresolvable ambiguity NOT covered by spec §1.1 → set `blockedOn`, PushNotification once, continue any unblocked work. An ambiguity that maps to a ratified decision is NOT a stop — the answer is in §1.1 or the brief.

## Wave completion

All four PRs merged; `git rev-list --left-right --count main...origin/main` == `0 0`; all 19 entries archived (or the lawful G1 escape recorded); `pnpm ledger:mass` delta recorded in the wave closeout against baseline 290/93; labels cleared; your cron job deleted (Stage 4.4 semantics apply per branch and at wave end).

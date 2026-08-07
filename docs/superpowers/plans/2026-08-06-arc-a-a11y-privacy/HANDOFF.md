# Arc A implementation handoff — Opus pane entry point

You are the Opus implementer session for arc A of the ABC batch (a11y/privacy cluster). This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-06-arc-a-a11y-privacy/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-06 autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec §1.1.

After arc A: further arc handoffs (arc C, then arc B) will be announced to this pane as their plans merge. After finishing an arc, gate-check the next handoff (same Status-line rule on ITS plan) and continue via the unit-transition protocol below.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-06-arc-a-a11y-privacy.md`, `docs/superpowers/plans/2026-08-06-arc-a-a11y-privacy/plan.md`, and `docs/agents/writing-plans.md` + `docs/agents/spec-self-review.md` (governing rules you will be held to).
3. The implementation worktree ALREADY EXISTS with claim markers pushed (created by the authoring session per spec §3 handoff-by-overlap — `../FX-worktrees/a11y-privacy-cluster`, branch `feat/a11y-privacy-cluster`). Verify the spec/plan PR is MERGED (`git log --oneline origin/main | head -3` shows the docs/arc-a-spec merge; if not merged, STOP — you were launched early). In the worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main` (mechanical; the parent PR only adds spec/plan/handoff and removes its own markers).
4. Write `/Users/ericweiss/FX-worktrees/a11y-privacy-cluster/.claude/ship-state.json` fresh: `{branch: "feat/a11y-privacy-cluster", stage: "arc-a-impl", tasksRemaining, next: "Task T1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the new `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/a11y-privacy-cluster" && herdr agent rename "$HERDR_PANE_ID" "feat/a11y-privacy-cluster"`. Re-run with the new branch name at every arc transition. NEVER rename the workspace.
7. Claims are ALREADY declared (Step 0.3 note) — verify with `pnpm ledger:claims` from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: the four arc A ids must show `feat/a11y-privacy-cluster` and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. **Impeccable setup gates (invariant 8, BEFORE the first component edit):** `/impeccable` canonical v3 setup — context.mjs context load (PRODUCT.md + DESIGN.md) → register reference read. Every task in this arc touches invariant-8 UI surfaces.
9. Start plan Task T1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, adversarially reviewed to APPROVE, and MERGED to main on `docs/arc-a-spec` (check the plan Status line per the Gate Check).
- The four entries were claimed by `docs/arc-a-spec` during authoring and HANDED OFF to `feat/a11y-privacy-cluster` (marked + pushed on that branch); the parent's markers were released in its PR's last commit — at no instant was any entry undeclared on origin (spec §3). Your Step-0.7 is verification only.
- All plan-time probes are recorded in the plan's "Pre-draft verification pass" — the channel-coverage census (three uncovered outcome messages), the flash-state anatomy, the e2e harness shape. Do not re-derive; re-verify only where a task says to.

## Execution order

Plan order is binding: T1 (travel-date suppression) → T2a–T2e (live regions) → T3a–T3d (channel wire+strip) → T4 (scroll cue) → T5 (dual gate, review, merge). One worktree, one branch, one PR.

**Arc-transition protocol (arc A → C → B, at every transition):** in the NEW arc's worktree (already created by the authoring session with claims pushed) — install/link-env/preflight; merge `origin/main`; write a fresh `.claude/ship-state.json` (branch, stage, next, your sessionId); REGISTER a new 10-minute cron nudge scoped to the new worktree's marker (same Stage-0 semantics) and only AFTER the new job's id is confirmed `CronDelete` the previous arc's job (register-then-delete — never a moment with no nudge while an arc is live); update pane + agent labels to the new branch.

## Non-negotiables (the ones this arc exercises)

- TDD per task (invariant 1): the plan states each task's RED — the live-region RED (repair → observe the stale-PENDING failure by name → remove the row → green), the archive RED (move WITH marker → observe `_metaLedgerInProgress` fail by name → strip → green), and per-site behavioural REDs. T4's e2e RED must be OBSERVED failing before implementation.
- Conventional commits (invariant 6); commit messages named per task in the plan.
- Worktree-only edits (invariant 11). Ledger claims (invariant 12): markers strip inside each archive move; terminal check per plan T5.
- Dual gate (invariant 8): setup gates BEFORE code (Step 0.8); critique + audit at close (T5); closeout carries the filled `impeccable-gate:` marker line. You are Opus — the UI hard rule is satisfied by you implementing it yourself.
- Pre-code mechanical checklist per component edit: no em dash in new copy (this arc adds none), no new tap targets, canonical classes.
- Cross-model review to APPROVE (codex-guard `--stage diff --round <n>`; brief MUST carry REVIEWER ONLY, the numbered CONSEQUENCE BOUND / THREAT MODEL FENCE block with the literal phrase "never silently wrong", VERDICT + FINDINGS line instructions, the do-not-relitigate list from spec §1.1, round cap 4).
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0` after the merge.
- Never end a turn mid-pipeline. Report inline while continuing. If you must ask the user something genuinely theirs: drain answer-independent work first, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Escalation

Genuine unresolvable ambiguity NOT covered by spec §1.1 → set `blockedOn`, PushNotification once, continue any unblocked work. An ambiguity that maps to a ratified decision is NOT a stop. T2c's exemption-vs-clean outcome is NOT an ambiguity — both outcomes are compliant; decide against `conditionalStatusRegions` output.

## Arc completion

PR merged; `git rev-list --left-right --count main...origin/main` == `0 0`; all four entries archived (three to `BACKLOG-archive.md`, SHARELINK-CUE-VISIBILITY-1 to `DEFERRED-archive.md`); spec AC-A1..A5 satisfied; `closeout.md` in this directory records the impeccable findings + dispositions and the filled `impeccable-gate:` marker line; labels updated for the next arc (or cleared if none); cron job transitioned per the arc-transition protocol (or deleted at batch end, Stage 4.4 semantics).

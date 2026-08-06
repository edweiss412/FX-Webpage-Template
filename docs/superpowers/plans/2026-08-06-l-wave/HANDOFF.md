# L-wave implementation handoff — Opus pane entry point

You are the Opus implementer session for the L-wave. This file is self-contained: everything you need is here or one `Read` away. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-06-l-wave/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (you were launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-05 autonomy grant (Call H). Do not re-ask any ratified decision — they are enumerated in the spec §1.1/§4.5 and the brief.

## Step 0 — takeover protocol (in your FIRST turn, in order)

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing or "blocked/waiting" framing.
2. Read, in full: `AGENTS.md` (repo root), `docs/superpowers/specs/2026-08-06-l-wave-design.md`, `docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md`, `docs/superpowers/plans/2026-08-06-l-wave/plan.md`, and `docs/agents/writing-plans.md` + `docs/agents/spec-self-review.md` (governing rules you will be held to).
3. The three unit worktrees ALREADY EXIST with claim markers pushed (created by the authoring session per spec §3 handoff-by-overlap — `../FX-worktrees/l-wave-docs`, `../FX-worktrees/l-wave-push`, `../FX-worktrees/l-wave-emdash`). Verify the spec/plan PR is MERGED (`git log --oneline origin/main | head -3` shows the docs/l-wave-spec merge; if not merged, STOP — you were launched early). In `../FX-worktrees/l-wave-docs`: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then `git merge origin/main` (mechanical; the parent PR only adds spec/plan/brief and removes its own markers).
4. Write `/Users/ericweiss/FX-worktrees/l-wave-docs/.claude/ship-state.json` fresh: `{branch, stage: "w-ldocs", tasksRemaining, next: "Task L1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID — the directory segment of your scratchpad path>}`.
5. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time). The prompt MUST: run `date` first; re-read the marker and stand down via supersession check if `sessionId` is not yours (CronDelete own job, clear pane + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume the marker's `next` immediately; explicitly discard stale blocked/waiting framing. Write the new `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/l-wave-docs" && herdr agent rename "$HERDR_PANE_ID" "feat/l-wave-docs"`. Re-run with the unit branch name each time you move to a new unit branch. NEVER rename the workspace.
7. Claims are ALREADY declared per unit branch (Step 0.3 note) — verify with `pnpm ledger:claims` from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`: each unit's ids must show its own branch and no other live branch. Any other branch named = real collision, STOP and reconcile.
8. Start plan Task L1 in the same turn.

## What is already done (do not redo)

- Spec + plan + brief authored, adversarially reviewed to APPROVE, and MERGED to main on `docs/l-wave-spec` (check the plan Status line per the Gate Check).
- The 29 wave entries were claimed by `docs/l-wave-spec` during authoring, HANDED OFF to the three unit branches (W-LDOCS 27, W-PUSH 1, W-EMDASH 1 — each subset marked + pushed on its branch), and the parent's markers were released in its PR's last commit — at no instant was any entry undeclared on origin (spec §3). Your Step-0.7 is verification only.
- All plan-time probes are recorded in the plan's "Pre-draft verification pass" — catalog copy strings are ALREADY em-dash-free, notify copy has exactly 2, transport id-visibility SHIPPED. Do not re-derive; do re-verify only where a task says to.

## Execution order

Plan order is binding: W-LDOCS (Tasks L1–L7, `feat/l-wave-docs`) → W-PUSH (P1–P2, `feat/l-wave-push`) → W-EMDASH (E1–E4, `feat/l-wave-emdash`, dual-gate). Each unit branch already exists with claims pushed. **Unit-transition protocol (every transition, plan R2 F7):** in the NEW worktree — install/link-env/preflight; merge `origin/main` (again after every prior unit lands and once more before opening its own PR); write a fresh `.claude/ship-state.json` (branch, stage, next, your sessionId); REGISTER a new 10-minute cron nudge scoped to the new worktree's marker (same Stage-0 semantics: date first, supersession check, blockedOn silence, resume next) and only AFTER the new job's id is confirmed `CronDelete` the previous unit's job (register-then-delete, per AGENTS.md — never a moment with no nudge while a unit is live); update pane + agent labels to the new branch.

## Non-negotiables (the ones this wave exercises)

- TDD per task (invariant 1): the plan states each task's RED — for archive tasks that is the archive-RED pattern (move WITH marker → observe `_metaLedgerInProgress` fail by name → strip → green).
- Conventional commits (invariant 6); commit messages named per task in the plan.
- Worktree-only edits (invariant 11); each unit branch gets `pnpm install && pnpm worktree:link-env && pnpm preflight` before tests. No unit here qualifies for the docs-only preflight skip (W-LDOCS runs suites + the L3 probe).
- Ledger claims (invariant 12): each unit branch Stage-0 checks + marks + pushes; markers strip in that branch's LAST pre-merge commit (archived entries strip theirs inside the archive move).
- W-EMDASH is dual-gate work: `/impeccable` setup gates BEFORE code; critique + audit at close; the unit closeout carries the `impeccable-gate:` marker line. You are Opus — the UI hard rule is satisfied by you implementing it yourself.
- §12.4 lockstep triple: NOT expected to fire (catalog copy already clean), but if any catalog copy string edit happens, the triple lands in that same commit (master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`; x1 the proof).
- Per-branch cross-model review to APPROVE (codex-guard `--stage diff --round <n>`; brief MUST carry REVIEWER ONLY, the numbered CONSEQUENCE BOUND / THREAT MODEL FENCE block with the literal phrase "never silently wrong", VERDICT + FINDINGS line instructions, the do-not-relitigate list from spec §1.1, round cap 4). Split tight-scope briefs if a diff exceeds a handful of files (W-EMDASH likely splits: guard vs copy repairs).
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows CI-green in the SAME turn; ff main and verify `0 0` after each merge.
- Never end a turn mid-pipeline. Report inline while continuing. If you must ask the user something genuinely theirs: drain answer-independent work first, PushNotification in the same turn, set `blockedOn`, leave the nudge registered.

## Escalation

Genuine unresolvable ambiguity NOT covered by spec §1.1/§4.5 → set `blockedOn`, PushNotification once, continue any unblocked work. An ambiguity that maps to a ratified decision is NOT a stop. The two probe-gated dispositions (plan L3, L6's TRANSPORT-ID) are NOT ambiguities — both outcomes are pre-ratified; execute the probe and follow its result.

## Wave completion

All three unit PRs merged; `git rev-list --left-right --count main...origin/main` == `0 0`; every §2 disposition landed per spec AC-L1..L4; `pnpm ledger:mass` recomputed and recorded in a `closeout.md` in this directory against baseline **80 entries / mass 460** (spec §0) with AC-PROG's strict decrease confirmed; labels cleared; your cron job deleted (Stage 4.4 semantics per branch and at wave end).

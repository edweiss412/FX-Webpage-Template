# Arc C implementation handoff — Opus pane entry point

You are the Opus implementer session for arc C of the ABC batch (quick wins), reached AFTER arc A completes. This file is self-contained. THE GATE CHECK is Step 0.2 below — it runs after Step 0.1's `date` and reads the plan from the MAIN checkout (`/Users/ericweiss/FX-Webpage-Template`, post-merge by definition), so a stale worktree cannot fake it: the plan's **Status** line must read plan-APPROVED with a codex-guard round reference; if it says DRAFT or pending, STOP and do nothing (launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-06 autonomy grant. Do not re-ask any ratified decision — spec §1.1 enumerates them.

After arc C: arc B's handoff will be announced to this pane when its plan merges; gate-check it (same Status-line rule) and continue via the arc-transition protocol.

## Step 0 — arc-transition protocol (FIRST turn of this arc, in order)

1. Run `date`. Shell clock is the ONLY time truth; discard stale timing/blocked framing.
2. GATE CHECK, from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template` (post-merge by definition): `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only`, then `git -C /Users/ericweiss/FX-Webpage-Template show origin/main:docs/superpowers/plans/2026-08-06-arc-c-quick-wins/plan.md | grep -F "plan-APPROVED"` — the file existing ON origin/main with that Status IS the merged-and-approved proof, immune to how many merges landed since (R3 F3). Empty grep or missing file = STOP (launched early).
3. In the worktree (`../FX-worktrees/backlog-quick-wins`, branch `feat/backlog-quick-wins`, already existing with claim markers pushed per spec §3), IN THIS ORDER: `git fetch origin` → `git merge origin/main` (arc A + this arc's docs just landed; ledger conflicts resolve per-entry, both sides preserved) → THEN `pnpm install && pnpm worktree:link-env && pnpm preflight`. NOW read in full from the post-merge worktree (skip any already read this session): `AGENTS.md`, the arc C spec, this plan directory's `plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
4. Write `/Users/ericweiss/FX-worktrees/backlog-quick-wins/.claude/ship-state.json` fresh: `{branch: "feat/backlog-quick-wins", stage: "arc-c-impl", tasksRemaining, next: "Task Q1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID>}`.
5. REGISTER a new 10-minute cron nudge scoped to this worktree's marker (date-first, supersession check, blockedOn silence, resume `next`), and only AFTER the new job id is confirmed, `CronDelete` the arc A job (register-then-delete — never a moment with no nudge while an arc is live). Write the new `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/backlog-quick-wins" && herdr agent rename "$HERDR_PANE_ID" "feat/backlog-quick-wins"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout: `pnpm ledger:claims` — the two arc C ids must show `feat/backlog-quick-wins` and no other live branch. Any other = real collision, STOP and reconcile.
8. Start plan Task Q1 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, adversarially reviewed to APPROVE, merged on `docs/arc-c-spec`.
- Both entries claimed and handed off to `feat/backlog-quick-wins`; no undeclared instant on origin. Step 0.7 is verification only.
- Plan-time probes recorded in the plan's "Pre-draft verification pass" — the four-shape probe table, the asymmetric branch anatomy, the realtime harness shape, the reopen-spec abort drive. Re-verify only where a task says to.

## Execution order

Q1 (retainRows symmetry: flip pin RED → live-row retain → four green → archive) → Q2 (e2e case per the settled harness contract → observed-RED-against-mutant → archive) → Q3 (closeout, merge origin/main + marker strip, FINAL-diff review to APPROVE, then PR, CI, merge, ff `0 0` — R3 F4: the review covers what merges). Plan order binding.

## Non-negotiables (the ones this arc exercises)

- TDD (invariant 1): Q1's RED is the FLIPPED PIN failing against the unfixed tree; Q2's RED is the case observed failing against the temporary clear-on-hide mutant — the mutant is never committed, both observations recorded in the task record.
- The tombstone counterweight stays green asserting `reported: true` — any fix that silences it is wrong (spec §1.1 item 1).
- Q2 runs under `MODAL_REALTIME_E2E=1` on the shared `webServer` boot (`playwright.config.ts` :245-255: CI cold prod build+start, local `pnpm dev` with reuse) with `waitForRowHydration` before every drive (plan Q2 step 1b); jsdom re-attempts are refuted (spec §1.1 item 3).
- Conventional commits (6); worktree-only (11); claims (12) — both entries archive in Q1/Q2 shedding markers in their moves; terminal check per plan Q3.
- `impeccable-gate: N/A — no UI surface` — carry the marker line in the closeout; if any invariant-8 surface is unexpectedly touched, the gate flips to the dual gate before merge.
- Cross-model review to APPROVE (codex-guard `--stage diff --round <n>`; REVIEWER ONLY; CONSEQUENCE BOUND / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; round cap 4; spec §1.1 list).
- Real CI green (including `published-modal-e2e.yml`) before `gh pr merge --merge` in the SAME turn; ff main, verify `0 0`.
- Never end a turn mid-pipeline. Genuine new ambiguity: drain answer-independent work, PushNotification, set `blockedOn`, leave the nudge registered.

## Escalation

Q2's media context and placement are SETTLED at plan time (reduce emulation proven by the reopen spec's own abort case; second test with its own seeded show) — not ambiguities. Only a genuinely NEW question stops the pipeline.

## Arc completion

`closeout.md` authored IN the PR pre-merge (plan Q3 step 2: marker line + observed-RED reference + AC checklist); PR merged; `0 0`; both entries archived to `BACKLOG-archive.md`; AC-C1..C3 satisfied; then gate-check arc B's handoff and transition (or, if arc B's plan has not merged yet, continue per the pane announcements — the authoring session announces each handoff as it merges).

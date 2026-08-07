# Arc B implementation handoff — Opus pane entry point

You are the Opus implementer session for arc B of the ABC batch (review-infra pair), reached AFTER arc C completes — the LAST arc. This file is self-contained. GATE CHECK before anything else: open `docs/superpowers/plans/2026-08-06-arc-b-review-infra/plan.md` and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference — if it still says DRAFT or pending, STOP and do nothing (launched early; the authoring session owns the gate). Both user review gates were WAIVED by the user's 2026-08-06 autonomy grant. **You (Claude) implement this arc — Codex reviews only** (user routing 2026-08-06). Do not re-ask any ratified decision — spec §1.1 enumerates them.

## Step 0 — arc-transition protocol (FIRST turn of this arc, in order)

1. Run `date`. Shell clock only; discard stale framing.
2. Read in full (skip any already read this session): `AGENTS.md`, `docs/superpowers/specs/2026-08-06-arc-b-review-infra.md`, `docs/superpowers/plans/2026-08-06-arc-b-review-infra/plan.md` (+ the committed probe artifacts beside it), `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`.
3. GATE CHECK, from the MAIN checkout: `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only`, then `git -C /Users/ericweiss/FX-Webpage-Template show origin/main:docs/superpowers/plans/2026-08-06-arc-b-review-infra/plan.md | grep -F "plan-APPROVED"` — empty grep or missing file = STOP (launched early). Then in the worktree (`../FX-worktrees/review-infra-gates`, branch `feat/review-infra-gates`, already existing with claim markers pushed): `git fetch origin` → `git merge origin/main` FIRST (arcs A and C landed; ledger conflicts per-entry, both sides) → THEN `pnpm install && pnpm worktree:link-env && pnpm preflight`.
4. Write `/Users/ericweiss/FX-worktrees/review-infra-gates/.claude/ship-state.json` fresh: `{branch: "feat/review-infra-gates", stage: "arc-b-impl", tasksRemaining, next: "Task G1a", blockedOn: "", cronJobId, sessionId: <YOUR session UUID>}`.
5. REGISTER a new 10-minute cron nudge for this worktree (date-first, supersession check, blockedOn silence, resume `next`); only after its id is confirmed, `CronDelete` the arc C job (register-then-delete). Write `cronJobId` into the marker.
6. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/review-infra-gates" && herdr agent rename "$HERDR_PANE_ID" "feat/review-infra-gates"`. NEVER rename the workspace.
7. Verify claims from the MAIN checkout: `pnpm ledger:claims` — the two arc B ids must show `feat/review-infra-gates` only. Any other live branch = collision, STOP and reconcile.
8. Start plan Task G1a in the same turn.

## What is already done (do not redo)

- Spec + plan + corpus probe authored, adversarially reviewed to APPROVE, merged on `docs/arc-b-spec`. The probe (fence-gate-probe.mjs + its 2026-08-06 output) is committed in this directory — calibration of record; do not re-derive, do re-run the gate's own scan when generating the baseline (G1b).
- Both entries claimed and handed off to `feat/review-infra-gates`. Step 0.7 is verification only.

## Execution order

G1 (fence gate: read-core TDD → meta-test + shrink-only baseline → CLI → archive) → G2 (grammar fixtures RED against the shipped recognizer → vendored block parse → import-surface pin → limit-12 rewrite + archive) → G3 (closeout, merge origin/main + marker strip, FINAL-diff review to APPROVE, then PR, CI, merge, ff `0 0`). Plan order binding.

## Non-negotiables (the ones this arc exercises)

- TDD (invariant 1): G1's REDs are the per-rule fixture failures + the planted-tree meta-test failures; G2a's fixtures are observed against the SHIPPED recognizer before the parser lands (record which fail — those are the genuine misses).
- The five shapes are the closed set; full tsc over fences is rejected; the vendored parse is INLINE and dependency-free (node builtins + named siblings) — all ratified, spec §1.1.
- The baseline is shrink-only and cannot pardon a NEW hit; the waiver reuses `spec-lint: ignore` grammar with fence-extension coverage.
- Conventional commits (6); worktree-only (11); claims (12) — both entries archive in G1d/G2d; terminal check per plan G3.
- `impeccable-gate: N/A — no UI surface` marker line in the closeout.
- Cross-model review to APPROVE (codex-guard `--stage diff --round <n>`; REVIEWER ONLY; CONSEQUENCE BOUND / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; round cap 4; spec §1.1 list INCLUDING the recursion note: the dispatch runs the committed main-checkout wrapper via the shim, not the branch copy under review).
- Real CI green before `gh pr merge --merge` in the SAME turn; ff main, `0 0`.
- Never end a turn mid-pipeline.

## Escalation

G2a features whose fixtures already pass (regression pins, not misses) and per-feature covered-vs-documented-limit outcomes are NOT ambiguities — both dispositions are pre-ratified per feature; follow the fixture evidence. Only a genuinely NEW question stops the pipeline.

## Batch completion (this is the LAST arc)

PR merged; `0 0`; both entries archived; AC-B1..B3 satisfied; `closeout.md` here with the marker line. Then BATCH close-out: verify all six PRs (three authoring, three implementation) merged and main ff'd; clear pane + agent labels (`herdr pane rename "$HERDR_PANE_ID" --clear` and `herdr agent rename "$HERDR_PANE_ID" --clear`); `CronDelete` your nudge (Stage 4.4 semantics). Report completion inline.

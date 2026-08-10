# M-wave 2 — Opus implementer pane HANDOFF

You are the implementer for M-wave 2. This file is your self-contained entry point.

## Stage 0 (every action in your FIRST turn)

1. Run `date` — the shell clock is the only source of truth; discard any prior session's framing.
2. Read, in order: `AGENTS.md` (root), `docs/superpowers/specs/2026-08-09-m-wave-2-design.md` (APPROVED), `docs/superpowers/specs/2026-08-09-m-wave-2-decisions-brief.md`, `docs/superpowers/plans/2026-08-09-m-wave-2/plan.md`, `docs/agents/writing-plans.md` (guard-premise + anti-tautology rules bind every task).
3. The five unit worktrees exist with claims already pushed (plan Task D3): `/Users/ericweiss/FX-worktrees/m2-payload-hygiene`, `m2-sync-fault-codes`, `m2-e2e-infra`, `m2-guard-precision`, `m2-ui-cluster`. Work ONLY in them (invariant 11). Per worktree before tests: `pnpm install && pnpm worktree:link-env && pnpm preflight`.
4. **Per-unit lifecycle — Stage 0 at EVERY unit start, Stage 4.4 at EVERY unit close:**
   - Stage 0 (per unit): write `<that unit's worktree>/.claude/ship-state.json` with YOUR sessionId (scratchpad path segment), branch, stage, next; register a 10-minute cron nudge for THAT unit (off-minute `7,17,27,37,47,57 * * * *`; prompt: date first, supersession check on sessionId, blockedOn semantics, resume `next`, never re-ask authorization); label pane AND agent to the unit branch: `herdr pane rename "$HERDR_PANE_ID" "<branch>"` + `herdr agent rename "$HERDR_PANE_ID" "<branch>"` (skip silently if unset; NEVER rename the workspace).
   - Stage 4.4 (per unit, after that unit's `0  0`): `CronDelete` that unit's nudge job, set the worktree marker `stage: "done"`, clear then re-set labels for the next unit. The register-before-delete rule applies if replacing a nudge.
5. Begin W-PARSE Task P1 (Stage 0 for `feat/m2-payload-hygiene` first).

## Execution contract

- Unit order: W-PARSE → W-SYNC → W-E2E → W-GUARDS → W-UI. Each branch: TDD per task, conventional commits, class-sweep on every finding, cross-model review to APPROVE (codex-guard, detached `nohup … & disown` dispatch — backgrounded Bash dies at 600s on this machine), real CI green → `gh pr merge --merge` → ff main → `0  0`. Merge `origin/main` into later units after each earlier unit lands.
- Flight markers strip in each PR's LAST pre-merge commit (invariant 12).
- W-UI is dual-gated (impeccable critique + audit, canonical v3 setup); W-SYNC runs the gate scoped to `/help/errors`; W-GUARDS flips its gate if crosswalk triage corrects mdx copy.
- Never end a turn mid-pipeline; report inline while continuing. `AskUserQuestion` only for a genuinely NEW question (an ambiguity mapping to a spec §1.1 ratification is NOT one), always with a PushNotification in the same turn and `blockedOn` set.
- Wave closeout: `pnpm ledger:mass` delta vs baseline 77 entries / 365 mass recorded in `closeout.md` here, plus AC-PROG arithmetic and the impeccable marker lines.

## Authorization

User-ratified 2026-08-09 (decisions brief item 8): fully autonomous, both review gates waived, "this fable session owns spec(s) + plan(s), launch new pane(s) for opus implementation(s) + closeout(s)". Do not re-ask.

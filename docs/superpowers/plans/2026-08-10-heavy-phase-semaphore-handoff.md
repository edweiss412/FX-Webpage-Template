# Handoff — heavy-phase concurrency semaphore (implementation)

**Handed off:** 2026-08-10 by the Fable authoring session (pane wD:p2H, session f2a7e793) per the user's routing instruction: Fable owns spec + plan; a dedicated Opus pane owns implementation.
**Implementer:** Opus / Claude Code — the session reading this in the fresh pane.
**Adversarial reviewer:** Codex via codex-guard (fresh account active as of 2026-08-10 ~11:00; the earlier machine-wide usage-limit block is resolved).
**Plan file:** `docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md` — APPROVED R4/0 (rounds 3/4/3/0). Execute it TDD per task; it cites spec §7 cases by number, and the spec is canonical for every case body and mechanism.
**Spec:** `docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md` — APPROVED R13/0 (13 rounds; one case-8 amendment landed with plan R3, re-covered by the whole-diff review).

## State at handoff

- Worktree: `/Users/ericweiss/FX-worktrees/heavy-phase-semaphore`, branch `feat/heavy-phase-semaphore`, all docs commits pushed at handoff; `pnpm install` + `worktree:link-env` + `preflight` already green.
- No implementation files exist yet — Task 1's RED is the first code commit.
- Round corpus + filings through both stages committed (`docs/review-rounds/feat/heavy-phase-semaphore/`).
- Ledger: no BL-/DEF- rows for this arc.
- Marker: `.claude/ship-state.json` — TAKE OWNERSHIP per the AGENTS.md takeover protocol: overwrite `sessionId` with YOUR session UUID, register YOUR 10-minute nudge (full Stage-0 semantics incl. supersession check), write its `cronJobId`, rename YOUR pane AND agent to `feat/heavy-phase-semaphore`. The authoring session's nudge will observe your `sessionId` and stand itself down.

## Remaining pipeline (Stage 3 → 4.4)

1. Tasks 1-5 per the plan: failing test → minimal implementation → green → commit, one commit per task, `--no-verify`. The plan's per-behavior rule is binding: a mechanism lands only in the task whose spec case first asserts it.
2. Task 6 closeout exactly as written: filing sequencing (approving-round corpus row = post-APPROVE process-record commit with the `docs/review-rounds/**` confinement check), `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm test` dogfood, typecheck both tsconfigs, eslint, format:check, whole-diff codex-guard review to APPROVE (stage diff, fresh out dirs, REVIEWER ONLY briefs with both convergence bounds — reuse the spec/plan brief shape in the authoring session's scratchpad if useful, but briefs must be self-contained), push, PR, real CI green, `gh pr merge --merge` same turn, ff-sync `0 0`, Stage 4.4 (labels cleared, nudge deleted).
3. Review-round economy: diff-stage rounds append to the existing corpus; a 4th counted diff round owes a `## diff` filing section in `4a3be8baed76.md`.

## Constraints that bind you (verify, don't re-derive)

- Spec §1.1 fences: Python stdlib; worker-sizing REMOVED; builds IN the wrapped set; priority is bias; no enforcement hook; capacity via `--recreate` only. Do not relitigate in either direction.
- Test scaffolding: sanitized `runWrapped` env (strips ambient `FX_HEAVY_*`), per-case `mkdtemp` slot dirs, spec-contracted stderr lines as oracles, `FX_HEAVY_JITTER_PCT=0` where determinism is asserted.
- Box context: 18 GB machine recovering from this morning's memory crash; keep `VITEST_MAX_WORKERS=6` on full-suite runs until this arc merges (the wrapper you are building is the durable fix).
- Memory files under `~/.claude*/projects/` are per-account and invisible to you — everything binding is in the repo docs named here plus AGENTS.md.

## Do not

- Do not edit spec/plan except via review-round repairs with corpus rows.
- Do not dispatch background subagents and end your turn; never end a turn mid-pipeline (AGENTS.md autonomous-ship rules bind this session).
- Do not touch other worktrees; this arc's worktree is yours alone.

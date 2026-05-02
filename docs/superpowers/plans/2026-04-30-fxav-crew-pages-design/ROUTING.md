# Milestone Routing

**Decision date:** 2026-05-02
**Inputs:** Stet 56-task benchmark (Opus 4.7 vs GPT-5.4 vs GPT-5.5 on Zod + graphql-go-tools), repo-shape analysis of each milestone, plan-wide TDD discipline, existing skill scaffolding under both harnesses.

This file assigns a default implementer (model + harness) to every milestone. Routing is a **default**, not a hard rule — open a question if you think a specific task is shaped against the model's strengths.

---

## Rubric

The benchmark's central finding: model fit depends on repo shape, not absolute capability.

- **Zod-shaped** = local, contained tasks; tests live near the source; correct move is a precise edit + small test update. Opus 4.7 is competitive: smallest, most disciplined patches.
- **graphql-go-tools-shaped** = integration-heavy; multiple parallel surfaces (planner / datasource / hook / runtime) must agree; tests don't fully cover companion work. GPT-5.5 is decisive: passes more tests, matches human patches more often, clears review ~3× as often as Opus.

For frontend / UI-design work the benchmark gives no direct evidence (both repos were libraries, not UIs). Default to Opus + the project's `frontend-design` / `impeccable` skill stack.

---

## Per-milestone assignment

| Milestone | Shape | Implementer | Reviewer (adversarial) | Why |
|---|---|---|---|---|
| **M0 — Repo bootstrap** (Tasks 0.1–0.6) | Zod-shaped | **Opus 4.7 / Claude Code (this session)** | GPT-5.5 / Codex | Mechanical scaffolding (`pnpm create next-app`, configs, Tailwind v4 base, ESLint). Starting in this session preserves orchestrator memory and the skill setup. |
| **M1 — Parser standalone** (Tasks 1.1–1.14) | Zod-shaped | Opus 4.7 / Claude Code | GPT-5.5 / Codex | Block-by-block, version-by-version field maps. Each block has its own vitest file. Self-contained — Opus's small-patch discipline is a net win. |
| **M2 — Schema, RLS, migrations, seed** (Tasks 2.1–2.5) | graphql-go-tools-shaped | **GPT-5.5 / Codex** | Opus 4.7 / Claude Code | DDL + RLS + RPC read/write paths + propagation triggers + cleanup functions must agree. Classic Tier × domain matrix surface where Opus's known under-reach skips cells. |
| **M3 — Admin upload-test** (Tasks 3.1–3.2) | Zod-shaped | Opus 4.7 / Claude Code | GPT-5.5 / Codex | Tiny fixture-upload tester. M3-only, narrow scope. |
| **M4 — Crew page tiles** (Tasks 4.1–4.16) | Frontend / mixed | Opus 4.7 / Claude Code | GPT-5.5 / Codex | Each tile (Lodging, Venue, Schedule, Audio/Video/Lighting Scope, Crew, Contacts, Transport, etc.) is largely local. Plus mandatory `frontend-design` skill + dimensional-invariant Playwright assertions cover the integration risk. **Task 4.1 (DESIGN.md token extraction) is the gate** — assign explicitly to Opus + `impeccable`. |
| **M5 — Auth** (Tasks 5.1–5.11) | Multi-validator coherence | **GPT-5.5 / Codex** | Opus 4.7 / Claude Code | `validateLinkSession` + `validateGoogleSession` + `validateGoogleIdentity` + `isAdminSession` + cookie helpers must share invariants. Opus's "stop at first passing path" failure mode hurts here. |
| **M6 — Drive sync, cron + push** (Tasks 6.1–6.13) | graphql-go-tools-shaped | **GPT-5.5 / Codex** | Opus 4.7 / Claude Code | phase1/phase2 + push webhook + 5-min cron + watch refresh + GC + asset-recovery + per-show advisory locks + per-file processor — the largest integration surface in the plan. Highest model-fit gap. |
| **M7 — Linked content** (Tasks 7.1–7.9) | Mixed | GPT-5.5 / Codex | Opus 4.7 / Claude Code | Diagram snapshots, opening-reel substring extractor, asset routes — touches storage, parser, route handlers, GC. Lean integration-heavy. |
| **M8 — Bug-report pipeline** (Tasks 8.1–8.5 incl. 8.3a–8.3g) | graphql-go-tools-shaped | **GPT-5.5 / Codex** | Opus 4.7 / Claude Code | The §13.2.3 epic. Three amendments interlock: lease_holder ownership, listForRepo recovery, reaper-vs-retry race. Exactly the companion-surface pattern Opus misses in the benchmark. |
| **M9 — Stale-data UX, polish** (Tasks 9.1–9.4) | Zod-shaped | Opus 4.7 / Claude Code | GPT-5.5 / Codex | Per-task UI polish, narrow scope. Plus mandatory `frontend-design`/`polish`/`harden` skills. |
| **M10 — Onboarding wizard** (Tasks 10.1–10.10) | Mixed | Opus 4.7 / Claude Code | GPT-5.5 / Codex | UI-heavy with `onboard` skill, but also touches `api/admin/onboarding/scan/route.ts`, `api/admin/onboarding/finalize/route.ts`, and `runOnboardingScan`. Treat as Zod-shaped *unless* a specific task pulls in cross-cutting concerns. |
| **X.* — Cross-cutting** (Tasks X.1–X.6) | graphql-go-tools-shaped | **GPT-5.5 / Codex** | Opus 4.7 / Claude Code | By definition spans the codebase: traceability matrix walker, message catalog, etc. |

---

## Reviewer pairing logic

Per benchmark code-review correctness scores: GPT-5.5 = 3.16, GPT-5.4 = 2.60, Opus 4.7 = 2.11 (out of 4).

- **Opus implements → GPT-5.5 reviews.** Strong pairing: GPT-5.5 is the strongest reviewer in the benchmark and is well-suited to catch Opus's known under-reach failure mode.
- **GPT-5.5 implements → Opus reviews.** Weaker reviewer side. Compensate by:
  - Running an extra adversarial round if the first round produces non-trivial findings (so the convergence loop has to actually converge, not just terminate).
  - Feeding the spec's existing checklists (Tier × domain matrix, Flag lifecycle table, CHECK/enum migration matrix) explicitly into the review prompt so the reviewer model has a structured worksheet.
  - Don't relax this pairing — the cross-model independence is more important than reviewer absolute strength. Same-model self-review converges to silence.

---

## How to override

A milestone's routing is a default, not a hard rule. Override when:

1. **A specific task within an "Opus" milestone is graphql-go-tools-shaped** (e.g., a parser task that touches both `lib/parser/versions/v3.ts` and `lib/parser/versions/v4.ts` with shared invariants — that's an integration task hiding inside M1). Route that single task to GPT-5.5; document the override at the top of the task in the plan file.
2. **A specific task within a "GPT-5.5" milestone is local + UI-shaped** (e.g., a polish-only follow-up to M8 admin alerts). Route to Opus.
3. **A milestone has been blocked and a fresh perspective is wanted.** Switching implementer harnesses mid-milestone is allowed but requires running the handoff template (`HANDOFF-TEMPLATE.md`) so the second implementer starts from the same artifact set as the first.

Document every override in a one-line note at the top of the affected task. Don't silently switch.

---

## What is NOT decided here

- **Reasoning level.** Default to high for both Opus and GPT-5.5 (matches benchmark configuration). `xhigh`/medium experiments are anecdote-only; if you run one, document the result.
- **Skill loadout per task.** Continues to follow CLAUDE.md (this session) / AGENTS.md (Codex sessions) and the skill `description:` matchers — `frontend-design`, `impeccable`, `subagent-driven-development`, etc. dispatch as usual.
- **Whether to actually delegate vs do everything in this session.** Open question — depends on how the early milestones go. M0–M1 in this session is the conservative default. Reassess at the M1 → M2 boundary.

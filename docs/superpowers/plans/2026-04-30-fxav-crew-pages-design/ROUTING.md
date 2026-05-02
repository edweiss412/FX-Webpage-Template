# Milestone Routing

**Decision date:** 2026-05-02
**Inputs:** Stet 56-task benchmark (Opus 4.7 vs GPT-5.4 vs GPT-5.5 on Zod + graphql-go-tools), repo-shape analysis of each milestone, plan-wide TDD discipline, existing skill scaffolding under both harnesses.

This file assigns a default implementer (model + harness) to every milestone. Routing is a **default**, not a hard rule — open a question if you think a specific task is shaped against the model's strengths.

---

## Hard rule: all UI work is Opus

Regardless of milestone routing below, **every task whose primary deliverable is UI code is owned by Opus / Claude Code**. UI code means:

- Any file under `app/` **except** `app/api/**` (pages, layouts, loading/error/not-found components, route group folders)
- Any file under `components/`
- `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `DESIGN.md`, and any design-token/theme file

This applies even when the surrounding milestone is routed to Codex. M5 (auth backend → Codex) still has Opus building `app/auth/sign-in/page.tsx` and `app/me/page.tsx`. M6 (sync engine → Codex) still has Opus building `components/admin/ParsePanel.tsx`. M8 (report pipeline → Codex) still has Opus building `components/admin/ReportButton.tsx`.

When a milestone splits this way, the handoff doc (per `HANDOFF-TEMPLATE.md`) lists which tasks belong to which implementer. Don't co-mingle UI and backend work in a single subagent dispatch — keep them separated so each runs in its specialist's harness with the correct skill stack (`frontend-design` / `impeccable` for Opus UI work; AGENTS.md discipline for Codex backend work).

The cross-model adversarial review still pairs across milestones, not across split-tasks: M5's reviewer is the opposing harness for whichever side ran *more* of the milestone's task count.

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
| **M5 — Auth** (Tasks 5.1–5.11) | Multi-validator coherence + UI | **GPT-5.5 / Codex (backend)** + **Opus 4.7 / Claude Code (UI)** | Opus 4.7 / Claude Code | Validators (`validateLinkSession`, `validateGoogleSession`, `validateGoogleIdentity`, `isAdminSession`, cookie helpers) → Codex. Pages (`app/auth/sign-in/page.tsx`, `app/me/page.tsx`) and any UI components → Opus per UI hard rule. |
| **M6 — Drive sync, cron + push** (Tasks 6.1–6.13) | graphql-go-tools-shaped + admin UI | **GPT-5.5 / Codex (engine)** + **Opus 4.7 / Claude Code (admin UI)** | Opus 4.7 / Claude Code | Sync engine (phase1/phase2, webhook, cron, watch refresh, GC, recovery, per-show locks) → Codex. Admin parse panel pages and `components/admin/ParsePanel.tsx` / `StagedReviewCard.tsx` → Opus per UI hard rule. |
| **M7 — Linked content** (Tasks 7.1–7.9) | Mixed | GPT-5.5 / Codex | Opus 4.7 / Claude Code | Asset route handlers + diagram snapshot logic + opening-reel extractor are pure backend (no UI deliverables in M7 itself; rendering of these assets lives in M4 tiles). |
| **M8 — Bug-report pipeline** (Tasks 8.1–8.5 incl. 8.3a–8.3g) | graphql-go-tools-shaped + UI button | **GPT-5.5 / Codex (pipeline)** + **Opus 4.7 / Claude Code (ReportButton)** | Opus 4.7 / Claude Code | The §13.2.3 epic — pipeline, idempotency, recovery, reaper, lease_holder → Codex. `components/admin/ReportButton.tsx` and any user-facing report UI → Opus per UI hard rule. |
| **M9 — Stale-data UX, polish** (Tasks 9.1–9.4) | Zod-shaped + UI | Opus 4.7 / Claude Code | GPT-5.5 / Codex | All-Opus: per-task UI polish, narrow scope. Mandatory `frontend-design`/`polish`/`harden` skills. |
| **M10 — Onboarding wizard** (Tasks 10.1–10.10) | UI-heavy + admin routes | **Opus 4.7 / Claude Code (wizard UI)** + **GPT-5.5 / Codex (api routes)** | Opus 4.7 / Claude Code | Wizard pages, `OnboardingWizard.tsx`, and `PendingPanel.tsx` → Opus with `onboard` skill. `api/admin/onboarding/scan/route.ts`, `api/admin/onboarding/finalize/route.ts`, and `runOnboardingScan` → Codex. |
| **X.* — Cross-cutting** (Tasks X.1–X.6) | Mostly graphql-go-tools-shaped | **GPT-5.5 / Codex (most)** + **Opus 4.7 / Claude Code (any UI surface)** | Opus 4.7 / Claude Code | Traceability walker, message catalog, etc. are backend. If a cross-cutting task lands in `components/` or non-api `app/`, that task moves to Opus per UI hard rule. |

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

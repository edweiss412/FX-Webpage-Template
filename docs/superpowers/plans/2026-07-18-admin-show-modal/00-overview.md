# Admin Show Review Modal — Implementation Plan Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace `/admin/show/[slug]` (published review page) with `PublishedReviewModal` over the dashboard at `/admin?show=<slug>`, reusing the Step-3 modal chrome via an extracted `ReviewModalShell`.

**Spec (canonical):** `docs/superpowers/specs/2026-07-18-admin-show-modal.md` — APPROVED by cross-model adversarial review (11 rounds, 2026-07-18). Decisions D1–D10 and the §7 blast-radius matrix are ratified; do not relitigate in-plan.

**Architecture:** Shell extraction (spec §5) → published modal composition (§6) → server loader + dashboard mount (§4) → redirect + link migration (§3) → registry/meta-test retargeting (§7) → e2e + help (§8). Step-3 behavior is frozen: its unit/transition/e2e suites must pass WITHOUT edits after Task 1 (the acceptance test for the extraction).

**Tech stack:** Next.js 16 App Router (RSC + server actions), Tailwind v4, vitest + RTL, Playwright (pinned Docker image for byte gates).

## Global constraints

- Every task: failing test → minimal implementation → green → commit (`--no-verify`; conventional commits). One task per commit.
- No DB/migrations; no advisory-lock changes (invariant 2 untouched — **advisory-lock holder topology: no `pg_advisory*` surface is touched by any task; the single existing JS-side holder layout is unchanged**).
- No raw error codes in UI (invariant 5): all transplanted rendering keeps `lib/messages/lookup.ts` paths; no new §12.4 codes.
- Supabase call-boundary discipline (invariant 9): the loader transplants `page.tsx` reads verbatim; `_metaInfraContract` registry row retargets (Task 8).
- UI files are Opus-only; impeccable critique + audit run before the whole-diff review (Task 14).
- **Meta-test inventory (declared):** EXTENDS `_showReviewReadPathPin`, `_metaInfraContract` (row retarget), `_metaAdminOutcomeContract` (row retarget), `transitionAudit`, `pageTransitions`, `_metaBoundedReads`, `serverNoClientValueCall` (audit-list extension). CREATES none. Registries NOT touched (verified in spec §7): `AUDITABLE_MUTATIONS`, advisory-lock deadlock pin, WarningControlSite scoping, sentinel-hiding, destructive-confirm, no-inline-email, freeze contract, mutation-surface walker, auth next-param pipeline (D10).
- **Fix-round regression budget:** every adversarial-round patch re-greps its bug class across the touched surface + re-runs the relevant meta-test before round closure.
- Full pre-push gates (Task 14): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, local Playwright e2e, impeccable dual-gate.

## Task index

| # | Task | File |
|---|------|------|
| 1 | ReviewModalShell extraction + Step3 refactor | 01-tasks.md |
| 2 | globals.css selector twins | 01-tasks.md |
| 3 | ShowReviewSurface `syncHash` | 01-tasks.md |
| 4 | StatusStrip `renderTitle` | 01-tasks.md |
| 5 | `useShowModalNav` client helper | 01-tasks.md |
| 6 | PublishedReviewModal composition | 01-tasks.md |
| 7 | Server loader `_showReviewModal.tsx` + dashboard mount + skeleton + registry retargets (atomic) | 01-tasks.md |
| 8 | — folded into Task 7 (pin retargets must be atomic with the move) | 01-tasks.md |
| 9 | Redirect page + loading deletion | 01-tasks.md |
| 10 | feed.ts `/admin` revalidation ×3 | 01-tasks.md |
| 11 | Link-site migration + alertActions | 01-tasks.md |
| 12 | e2e: modal layout/interactions/deep-link + URL rewrites in existing specs | 01-tasks.md |
| 13 | Help copy (affordance matrix + per-show-panel mdx) | 01-tasks.md |
| 14 | Close-out gates (full suite, build, impeccable dual-gate, drift) | 01-tasks.md |

Ordering: 1→7 build the surface bottom-up; 9–13 are the blast-radius sweep; 14 gates. Every task leaves the tree green at its commit — Task 7 carries its registry retargets in the same commit as the move for exactly this reason.

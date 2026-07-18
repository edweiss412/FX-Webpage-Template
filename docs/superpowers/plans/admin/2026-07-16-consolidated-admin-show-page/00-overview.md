# Consolidated Admin Show Page — Implementation Plan (Overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/show/[slug]` around the shared Step-3 review surface (rail + section panels + scroll-spy) with a pinned status strip, while the wizard Step-3 modal becomes a thin wrapper with byte-identical behavior.

**Spec (canonical):** `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page.md` (Codex-APPROVED after 9 rounds, 2026-07-16). Where this plan and the spec disagree, the spec wins.

**Design mock:** `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` (committed; README lists the 3 deltas where spec/DESIGN.md override the mock).

**Architecture:** Phase 1 extracts `SectionData` into a source-agnostic `SectionCore` + mode extensions and moves the modal body into `components/admin/review/ShowReviewSurface.tsx` — zero visible change, proven by the untouched wizard test suite. Phase 2 adds the single-statement snapshot RPC, the published adapter, and the consolidated page shell (strip + Overview + registry sections + Changes).

**Tech stack:** Next.js 16 App Router, React Server Components + client components, Supabase (postgres.js for SQL tests), Vitest + Testing Library, Playwright real-browser harness (tsx-subprocess pattern), Tailwind v4 tokens from `app/globals.css` `@theme`.

## Global constraints (from spec + AGENTS.md — every task inherits these)

- TDD per task; commit per task (`feat(admin)`, `test(admin)`, `feat(db)`, `refactor(admin)` scopes as fits).
- Wizard regression pin (spec §14.1): the existing wizard tests pass **unmodified** except mechanical import/type renames, which land in ONE separately-reviewable codemod commit. Any assertion change = extraction changed behavior = P0, stop and fix the extraction.
- No new §12.4 error codes (spec §12). No raw codes in UI (invariant 5).
- No advisory-lock changes (invariant 2 — the snapshot RPC takes none; no lock holder is added at any layer).
- Supabase call-boundary discipline (invariant 9): every new call site destructures `{ data, error }`, distinguishes returned vs thrown, registers in `tests/admin/_metaInfraContract.test.ts` or carries `// not-subject-to-meta: <reason>`.
- No new mutation surfaces (invariant 10): controls relocate with their existing server actions. If any task accidentally creates a mutating route/action, STOP — that's a spec deviation.
- Published mode NEVER touches `/api/admin/onboarding/*` (spec §3.5) and never renders staged identifiers.
- Tailwind v4: no default `align-items: stretch` on `.flex` — every parent→child dimension pairing in §8 gets an explicit class, verified in the Playwright layout task (jsdom insufficient).
- Migration lifecycle (spec §3.3a): local apply + test → `pnpm gen:schema-manifest` + commit manifest → surgical apply to validation project — all in this PR.
- Full gates before push: `pnpm test`, `pnpm typecheck` (or tsc equivalent), `pnpm lint`, `pnpm format:check`, `pnpm build`. Scoped runs during tasks; full suite at close-out.
- Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the UI diff before the whole-diff Codex review (invariant 8).

## Meta-test inventory (declared per AGENTS.md writing-plans rule)

| Registry | Action |
| --- | --- |
| `tests/admin/_metaInfraContract.test.ts` | EXTENDS — row for the snapshot-RPC read helper (Task 7) |
| `tests/admin/_metaBoundedReads.test.ts` | NOT extended — no builder list-reads on the published path; the RPC-only read-path structural pin (Task 7) is the guard |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | PATHS UPDATED only — panels move file, contract unchanged (Task 5) |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | UNCHANGED — no new mutation surfaces; walker discovers nothing new (verified at close-out) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | UNCHANGED — no `pg_advisory*` touched (grep proof at close-out) |
| NEW structural pins | RPC-only read path (Task 7); published no-staged-traffic (Task 9); order-inside-`jsonb_agg` asserted via SQL test (Task 6) |

## Advisory-lock topology

Not touched. `get_admin_show_review_snapshot` is read-only (`STABLE`), acquires no locks; no existing holder changes. (Rule satisfied by declaration; close-out greps `pg_advisory` in the diff = zero hits.)

## File map

**Create**
- `components/admin/review/sectionData.ts` — `SectionCore`, `StagedSectionData`, `PublishedSectionData`, `SectionData`, mode guards
- `components/admin/review/ShowReviewSurface.tsx` — extracted rail/chips/scroll-spy/panel column (both shells consume)
- `components/admin/review/publishedAdapter.ts` — `buildPublishedSectionData(snapshot)`
- `lib/admin/readShowReviewSnapshot.ts` — `.rpc("get_admin_show_review_snapshot")` call-boundary helper
- `supabase/migrations/20260716<hhmmss>_admin_show_review_snapshot_rpc.sql`
- `components/admin/showpage/StatusStrip.tsx`, `components/admin/showpage/OverviewSection.tsx`, `components/admin/showpage/ChangesSection.tsx`, `components/admin/showpage/PublishedReviewPage.tsx` (client shell)
- Tests per task (paths in task files)

**Modify**
- `components/admin/wizard/step3ReviewSections.tsx` — panels consume `SectionCore`; registry unchanged in shape
- `components/admin/wizard/Step3ReviewModal.tsx` — body extraction → wraps `ShowReviewSurface`
- `components/admin/wizard/Step3SheetCard.tsx` — builds `StagedSectionData`
- `app/admin/show/[slug]/page.tsx` — rebuilt to snapshot-RPC + `PublishedReviewPage`
- `supabase/__generated__/schema-manifest.json` — regenerated

## Task list

**Phase 1 — extraction, zero visible change** (`01-phase1-extraction.md`)
1. `sectionData.ts` types + mode guards
2. Rewire section panels onto `SectionCore` (per-site table from spec §3.2)
3. Extract `ShowReviewSurface`; modal becomes wrapper (regression-pinned)
4. Staged builder (`Step3SheetCard`) emits `StagedSectionData`; codemod commit for import renames
5. Meta-test path updates + Phase-1 close-out gates (full suite, build, unchanged screenshots)

**Phase 2 — consolidated page** (`02-phase2-page.md`)
6. Snapshot RPC migration + SQL tests + manifest + validation apply
7. `readShowReviewSnapshot` helper + infra-contract row + RPC-only read-path pin
8. `publishedAdapter` + guard/agenda/billing unit tests
9. Mode forks: published agenda static variant + diagrams asset-route srcs + no-staged-traffic test
10. `StatusStrip` + state variants (live/clean/archived/unpublished)
11. `OverviewSection` + `ChangesSection` + raw-unrecognized placement
12. Per-section warning controls + Preview-As gate (crew section)
13. Page rebuild: `PublishedReviewPage` + `page.tsx` wiring + hash deep links + archived read-only sweep
14. Playwright layout task (§8 dimensional invariants)
15. Transition audit task (§9 inventory incl. compound rows)
16. Help-screenshot rebaseline (pinned Docker image) + Phase-2 close-out: full gates, impeccable dual-gate, DEFERRED.md entries if any

Execution order is strictly 1→16; Phase 2 tasks 6-9 are backend/adapter and may interleave only if the executor runs them sequentially anyway (no parallel file contention).

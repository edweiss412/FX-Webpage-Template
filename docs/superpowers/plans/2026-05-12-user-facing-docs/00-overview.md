# M12 — User-Facing Docs Implementation Plan (Overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app wiki-style documentation site at `/help` whose primary reader is Doug Larson (the sole admin of `/admin`). 13 MDX/TSX pages (4 adoption-track + 7 capability-reference + `/help/tour` + `/help/errors`), gated by `requireAdmin()`, deep-linked from §9.0.1 affordances in M3/M9/M10 via a render-side gate that respects admin-vs-crew context (including a preview-as-crew exception). Real screenshots ship in v1 via a scripted Playwright harness with deterministic clock + fixture seeding.

**Architecture:** Next.js 16 App Router with `@next/mdx` native MDX pipeline (no third-party docs framework). `app/help/layout.tsx` exports `dynamic = "force-dynamic"` and calls `requireAdmin()` per request, catching `AdminInfraError` per the `app/admin/layout.tsx:47-71` pattern. `MessageCatalogEntry` is extended with three new fields (`title`, `longExplanation`, `helpHref`); a catalog-alignment subtask sets `dougFacing: null` on master-spec admin-log-only codes (derivation via a new parser). A new `lib/time/now.ts` utility reads a request-scoped `X-Screenshot-Frozen-Now` header (gated by `ENABLE_TEST_AUTH` + Bearer) to deterministically pin server-rendered relative times. Screenshot harness uses a dedicated Playwright project with `globalSetup` running `pnpm db:seed`, reuses `signInAs` from `tests/e2e/helpers/signInAs.ts`, captures WebP via `sharp` with pinned encoder settings. The `affordanceMatrix.ts` registry is the single source of truth for §9.0.1 retrofit work; M3/M9/M10 components add documented `data-testid` attributes that test #13 walks.

**Tech Stack:**

- Next.js 16 (App Router, RSC) on Vercel — already in use
- `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react` — **new dependencies** (Task A.1)
- `sharp` for WebP encoding — **new dev dependency** (Task F.3)
- Vitest + Playwright — already configured; reuse `tests/e2e/helpers/signInAs.ts:43-73`
- Tailwind v4 + existing `app/globals.css` `@theme` tokens — no new tokens
- Catalog at `lib/messages/catalog.ts:1-8`, accessor `messageFor` at `lib/messages/lookup.ts:11` — schema extended additively

---

## How to use this plan

1. **Spec is canonical**, with no ratified amendments at M12 plan-write time. Every task references a spec section (`§5.2`) or AC (`AC-12.5`). When a task and the spec disagree, the spec wins — open a question, do not silently fix in the plan (AGENTS.md invariant #7).
2. **Work phase-by-phase, top-to-bottom within each file.** Phase order is A → B → C → D → E → F → G → H → I. Phase B (catalog) blocks Phase E (content) because §5 deep-link contract resolves through extended `MessageCatalogEntry`. Phase C (time utility) blocks Phase F (screenshot harness). Phase D (components) blocks Phase E (content authors `<Callout>`, `<Step>`, etc.). Phase F + G in parallel are safe; Phase H verifies the combination.
3. **TDD per task** (AGENTS.md invariant #1). Each task: failing test → minimal implementation → passing test → commit. Never write implementation before its test.
4. **Commit per task** (AGENTS.md invariant #6). Conventional-commits style `<type>(help): <summary>` — common types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Scope `help` for content/components; `messages` for catalog work; `time` for the time utility; `screenshots` for the harness.

---

## Sequencing dependency on M10

**AC-12.22 forbids M12 from beginning until M10 close-out.** Justification: real screenshots require the documented UI surfaces (`/admin` dashboard, per-show panel, preview-as-crew, onboarding wizard) to exist and be stable. M3/M4/M9/M10 own those surfaces.

**Practical impact:** When M10's handoff doc marks all M10 tasks complete and impeccable v3 has been run, this plan's Phase A is unblocked. Phases B + C + D have no M10 dependency strictly speaking (catalog extension, time utility, MDX components don't depend on surface implementations) — they CAN start earlier as a soft-start if the schedule allows, but Phase E (content authoring) and Phase F (screenshot capture) absolutely require M10 to be done.

**Routing note for plan execution:** Per the project's "UI work is always Opus" hard rule (AGENTS.md), every task in this plan is Opus/Claude Code territory. Codex (cross-CLI) runs adversarial review only.

---

## Ratified spec amendments

**None at plan-write time (2026-05-12).** The spec went through 8 rounds of cross-CLI adversarial review (r1 → r10) and was committed at r10 (commit `fc26d8b`). Any amendments ratified during M12 execution must be recorded here in the same shape as the existing crew-pages plan's amendment list (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/00-overview.md`).

---

## Plan-wide invariants (M12-specific, layered on AGENTS.md global)

These extend AGENTS.md's 9 plan-wide invariants. Violating any is a P0 bug regardless of test status.

1. **TDD per task** (AGENTS.md #1) — applies to every task in this plan.
2. **Commit per task** (AGENTS.md #6) — `<type>(help|messages|time|screenshots): <summary>` format.
3. **Spec is canonical** (AGENTS.md #7) — applies.
4. **No raw error codes in user-visible UI** (AGENTS.md #5) — `/help/errors` renders codes as URL fragments only; visible heading is `entry.title`.
5. **impeccable v3 UI gate** (AGENTS.md #8) — every `/help/*` page goes through `/impeccable critique` + `/impeccable audit` before Phase I close-out.
6. **Supabase call-boundary discipline** (AGENTS.md #9) — applies via `requireAdmin()`. `lib/auth/requireAdmin.ts` is already registered in `tests/auth/_metaInfraContract.test.ts`; no new registry entry required, but grep to confirm post-implementation.
7. **MessageCatalogEntry additive extension** (M12-specific) — `messageFor` signature stays unchanged; the return type widens with three new nullable fields. Existing callers compile unchanged. Verified by Task B.1.
8. **Catalog-master-spec alignment** (M12-specific) — Task B.2 sets `dougFacing: null`, `crewFacing: null`, `helpfulContext: null` on every code master-spec §12.4 classifies as admin-log-only. AlertBanner stops surfacing those codes — master-spec-correct behavior. Tests that exercised the drifted behavior break; M12 owns those updates.
9. **`lib/time/now.ts` is the only server-side render-time source** (M12-specific) — every server component reachable from a screenshot manifest route that calls `new Date()` / `Date.now()` for render-side output MUST migrate to this utility (or carry a per-line `// not-render-side: <reason>` waiver). Enforced by test #16.
10. **§5.6 affordance matrix is the §9.0.1 retrofit contract** (M12-specific) — every M3/M9/M10 component that owns a §9.0.1 affordance MUST carry the documented `data-testid` from the matrix in the same PR that adds the affordance text. Test #13 walks the matrix; the reverse-direction check catches affordances added without matrix rows.

---

## Meta-test inventory (per AGENTS.md writing-plans additions)

This milestone CREATES the following structural meta-tests. Declaring this inventory at plan time satisfies the AGENTS.md "Meta-test inventory (mandatory)" requirement.

| Meta-test | Phase | Created in task | Purpose |
| --- | --- | --- | --- |
| `tests/help/_metaNavSync.test.ts` | A | Task A.6 | Every `_nav.ts` entry resolves to a real route under `app/help/`; every route under `app/help/` is referenced in `_nav.ts` (nav-consistency, test #5) |
| `tests/messages/_metaErrorCatalogDocs.test.ts` | B | Task B.4 | Catalog meta-test biconditional: predicate ↔ "all three M12 fields non-null" (test #2). Includes 5 forced-fixture cases. |
| `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts` | B | Task B.5 | Reads master-spec §12.4 markdown via `extract-admin-log-only-codes.ts`; asserts every derived admin-log-only code has all six user-facing fields `null` (test #17) |
| `tests/help/_metaServerTimeGuard.test.ts` | C | Task C.4 | Greps server-side `Date.now()`/`new Date()` under manifest-derived scan roots; per-line waiver rule (test #16) |
| `tests/help/_metaScreenshotManifest.test.ts` | F | Task F.9 | Stale manifest entries, orphan WebPs, fixture name validation (test #9) |
| `tests/messages/_metaErrorRendererGate.test.ts` | G | Task G.5 | Renderer-gate 4-context coverage (admin / help-admin / crew / preview-as-crew) — test #12 |

This milestone EXTENDS:
- `tests/auth/_metaInfraContract.test.ts` — no new registry entry required, but Phase A confirms `requireAdmin` is still registered.

---

## Disagreement-loop preempt

The spec's §11 already documents the round-1 through round-8 adversarial-review resolutions. Plan-writing also surfaces these likely-relitigated contracts; the spec citations are load-bearing per AGENTS.md disagreement-preempt invariant.

| Contract | Pre-resolved by | Cite |
| --- | --- | --- |
| `/help/*` is dynamic, not statically prerendered | r4 fix | spec §3.4, §3.2, AC-12.1, AC-12.31 |
| `MessageCatalogEntry` extension is additive (three new nullable fields), not a new API | r3 / r4 fixes | spec §5.2, AC-12.5 |
| Predicate is `severity !== "info"` AND `dougFacing != null` — no `selfContainedAction` flag (retired r8) | r3 / r4 / r5 / r6 / r7 / r8 fixes | spec §5.2 |
| Catalog alignment (setting `dougFacing: null` on master-spec admin-log-only codes) is M12's responsibility, NOT a separate milestone | r8 / r9 fixes | spec §5.2 distinction note + AC-12.35 |
| Server-side clock pin uses request-scoped header (`X-Screenshot-Frozen-Now`), NOT an env var | r6 / r7 fixes | spec §3.6.2 Fixed clock row |
| Fixture corpus layout is flat single-file `fixtures/shows/raw/<fixture>.md` + pdf-only split `__INFO.md` | r10 fix | spec §3.6.2 Frozen-instant validation row |
| Preview-as-crew is CREW context for the renderer, despite living on `/admin/*` URL | r10 fix | spec §5.2 admin-context allowlist exception |
| `/help/errors` trailing CTA is "If this keeps happening, tell Eric →", NOT a self-linking `Learn more →` | r10 fix | spec §4.3, AC-12.11 |

---

## Same-vector recurrence policy

Per AGENTS.md "Same-vector recurrence triggers comprehensive re-analysis": if three adversarial-review rounds on the M12 PLAN identify findings on the same vector (e.g., catalog drift, clock determinism, affordance discovery), the next round's preparation MUST include a comprehensive re-analysis of that vector before the next review fires. This rule is what closed the catalog-drift class at spec r8 and the clock-determinism class at spec r7; M12 plan execution should apply the same discipline.

---

## File structure (created by M12)

```
app/help/
  layout.tsx                              # Phase A — requireAdmin gate + AdminInfraError catch + sidebar/header chrome
  page.mdx                                # Phase E — landing
  getting-started/page.mdx                # Phase E
  daily-rhythm/page.mdx                   # Phase E
  whats-different/page.mdx                # Phase E
  tour/page.mdx                           # Phase E
  errors/page.tsx                         # Phase E — TSX iterating §12.4 catalog
  admin/
    dashboard/page.mdx                    # Phase E
    review-queues/page.mdx                # Phase E
    parse-warnings/page.mdx               # Phase E (anchored sections per warning code)
    per-show-panel/page.mdx               # Phase E
    preview-as-crew/page.mdx              # Phase E
    sharing-links/page.mdx                # Phase E
    onboarding-wizard/page.mdx            # Phase E
  _components/                            # Phase D
    Sidebar.tsx
    Header.tsx
    Breadcrumb.tsx
    Callout.tsx
    Step.tsx
    Screenshot.tsx                        # primary; renders <picture>
    ScreenshotPlaceholder.tsx             # draft-only; lint-prohibited at v1 close-out
    RefAnchor.tsx
    TipFromSheets.tsx
  _nav.ts                                 # Phase A — sidebar nav registry
  _affordanceMatrix.ts                    # Phase G — §5.6 matrix as typed export
mdx-components.tsx                        # Phase A — project root, required by @next/mdx
lib/time/now.ts                           # Phase C — request-scoped clock with header injection
lib/messages/catalog.ts                   # Phase B — schema extended (title, longExplanation, helpHref)
lib/messages/lookup.ts                    # Phase B — signature unchanged, return type widens
public/help/screenshots/                  # Phase F — WebP output, committed
  <key>-light.webp  ·  <key>-dark.webp    # per manifest entry × theme
scripts/help-screenshots.ts               # Phase F — Playwright capture entry point
scripts/help-screenshots.manifest.ts      # Phase F — single source of truth (per-entry frozenClockInstant required)
scripts/help-screenshots-fixture-range.ts # Phase F — INFO-tab DATES parser
scripts/extract-admin-log-only-codes.ts   # Phase B — master-spec §12.4 derivation parser
tests/help/                               # all M12 help-specific tests
  anchor-resolver.test.ts                 # Phase A (test #1)
  auth.test.ts                            # Phase H (test #3)
  render.test.ts                          # Phase H (test #4)
  _metaNavSync.test.ts                    # Phase A (test #5)
  no-placeholders.test.ts                 # Phase H (test #7)
  screenshot-coverage.test.ts             # Phase F (test #8)
  _metaScreenshotManifest.test.ts         # Phase F (test #9)
  screenshot-picture-contract.test.ts     # Phase F (test #10)
  deep-link-walker.test.ts                # Phase G (test #13)
  fixture-range-parser.test.ts            # Phase F (test #14)
  _metaServerTimeGuard.test.ts            # Phase C (test #16)
tests/messages/
  _metaErrorCatalogDocs.test.ts           # Phase B (test #2)
  _metaErrorRendererGate.test.ts          # Phase G (test #12)
  _metaCatalogAdminLogOnlyAlignment.test.ts # Phase B (test #17)
tests/time/
  now-gate.test.ts                        # Phase C (test #15)
tests/playwright/
  help-mobile.spec.ts                     # Phase H (test #6 — Playwright real-browser layout)
  help-screenshots-clock-pipeline.spec.ts # Phase F (test #18 — E2E clock-pipeline proof)
playwright.config.ts                      # Phase F — add `screenshots-help` project
next.config.ts                            # Phase A — add withMDX + pageExtensions
package.json                              # Phase A + F — new deps + screenshot:help script
```

---

## What's next

Once this plan is approved (or after self-review + an additional cross-CLI plan-review cycle per AGENTS.md), execution follows phase order. Each phase file is self-contained — pull it up and work through its tasks.

For execution, see the per-phase files starting with [01-foundation.md](01-foundation.md).

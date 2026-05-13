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
2. **Work phase-by-phase, top-to-bottom within each file.** Phase order is **strictly sequential** A → B → C → D → E → F → G → H → I (r2 — no parallelization). Rationale: Phase G's affordance retrofit needs Phase F's manifest entries to be in place so the §5.6 matrix's screenshot-bearing rows resolve to real WebPs; Phase F's WebP capture exercises pages from Phase E with components from Phase D referencing catalog content from Phase B with time utility from Phase C and chrome from Phase A. The earlier-draft claim that "F + G can run in parallel" is removed. Earlier-draft soft-start permission for B/C/D before A is also removed (see "Sequencing dependency on M10" below).
3. **TDD per task** (AGENTS.md invariant #1). Each task: failing test → minimal implementation → passing test → commit. Never write implementation before its test.
4. **Commit per task** (AGENTS.md invariant #6). Conventional-commits style `<type>(help): <summary>` — common types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Scope `help` for content/components; `messages` for catalog work; `time` for the time utility; `screenshots` for the harness.

---

## Sequencing dependency on M10

**AC-12.22 forbids M12 from beginning until M10 close-out.** Justification: real screenshots require the documented UI surfaces (`/admin` dashboard, per-show panel, preview-as-crew, onboarding wizard) to exist and be stable. M3/M4/M9/M10 own those surfaces. Additionally, Phase B mutates the shared message catalog (sets `dougFacing: null` on master-spec admin-log-only entries currently rendered by M9 AlertBanner), and Phase D creates new UI files under `app/help/` — both interact with assumptions M9/M10 are still establishing.

**No soft-start.** Earlier plan drafts permitted Phases B/C/D to begin before M10 close-out. **That permission is removed (r2):** AC-12.22 is unconditional, and pre-M10 commits to the catalog or `app/help/` risk invalidating the assumption that screenshot capture (Phase F) and affordance retrofit (Phase G) run against stable M10 surfaces. If the schedule warrants earlier work, the right path is to ratify a spec amendment to AC-12.22 — not silently start work.

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
| `tests/help/_metaNavSync.test.ts` | A | Task A.7 | Every `_nav.ts` entry resolves to a real route under `app/help/`; every route under `app/help/` is referenced in `_nav.ts` (nav-consistency, test #5) |
| `tests/messages/_metaErrorCatalogDocs.test.ts` | B + E | Task B.4 (forced fixtures only) + Task E.13 (extends with live-catalog biconditional) | Catalog meta-test (test #2). B.4 commits 5 forced-fixture cases that exercise the predicate logic against synthetic entries (TDD-green at B.4). E.13 appends the live-catalog biconditional assertion (predicate ↔ "all three M12 fields non-null") alongside E.13's final catalog backfills — red-then-green TDD per r6. |
| `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts` | B | Task B.5 | Reads master-spec §12.4 markdown via `extract-admin-log-only-codes.ts`; asserts every derived admin-log-only code has all six user-facing fields `null` (test #17) |
| `tests/help/_metaServerTimeGuard.test.ts` | C | Task C.4 | Greps server-side `Date.now()`/`new Date()` under manifest-derived scan roots; per-line waiver rule (test #16) |
| `tests/help/_metaScreenshotManifest.test.ts` | F | Task F.7 | Stale manifest entries, orphan WebPs, fixture name validation (test #9) |
| `tests/messages/_metaErrorRendererGate.test.ts` | G | Task G.6 | Renderer-gate 4-context coverage (admin / help-admin / crew / preview-as-crew) — test #12 |
| `tests/help/deep-link-walker-reverse.test.ts` (structural guard, not `_meta`-named) | G | Task G.5 | Reverse-direction codebase grep: every `data-testid="help-affordance--*"` in the codebase must appear in `affordanceMatrix.ts` (concrete row) OR match the template-family pattern. Catches affordances added to source surfaces without matrix rows. Treated as a structural meta-test for the same reason `_metaNavSync` is — it enforces matrix-completeness against a registry. |

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

## File structure (created or modified by M12)

This list is reconciled exhaustively against the `Files:` blocks in every phase file (r2 — earlier draft had drift). Files marked **(create)** are net-new; **(modify)** edits an existing file.

```
# Production source — created
app/help/layout.tsx                                       # Phase A.2 (create) — requireAdmin gate + AdminInfraError catch + chrome
app/help/page.mdx                                         # Phase A.2 (create placeholder) → Phase E.1 (modify with content)
app/help/getting-started/page.mdx                         # Phase E.2 (create)
app/help/daily-rhythm/page.mdx                            # Phase E.3 (create)
app/help/whats-different/page.mdx                         # Phase E.4 (create)
app/help/tour/page.mdx                                    # Phase E.12 (create)
app/help/errors/page.tsx                                  # Phase E.13 (create — TSX iterates §12.4 catalog)
app/help/admin/dashboard/page.mdx                         # Phase E.5 (create)
app/help/admin/review-queues/page.mdx                     # Phase E.6 (create)
app/help/admin/parse-warnings/page.mdx                    # Phase E.7 (create — anchored sections per warning code)
app/help/admin/per-show-panel/page.mdx                    # Phase E.8 (create)
app/help/admin/preview-as-crew/page.mdx                   # Phase E.9 (create)
app/help/admin/sharing-links/page.mdx                     # Phase E.10 (create)
app/help/admin/onboarding-wizard/page.mdx                 # Phase E.11 (create)
app/help/_components/Sidebar.tsx                          # Phase A.4 (create)
app/help/_components/Header.tsx                           # Phase A.5 (create)
app/help/_components/Breadcrumb.tsx                       # Phase A.6 (create)
app/help/_components/Callout.tsx                          # Phase D.1 (create)
app/help/_components/Step.tsx                             # Phase D.2 (create)
app/help/_components/ScreenshotPlaceholder.tsx            # Phase D.3 (create — draft scaffold, lint-prohibited at close-out)
app/help/_components/Screenshot.tsx                       # Phase D.4 (create — production component)
app/help/_components/RefAnchor.tsx                        # Phase D.5 (create)
app/help/_components/TipFromSheets.tsx                    # Phase D.6 (create)
app/help/_nav.ts                                          # Phase A.3 (create)
app/help/_affordanceMatrix.ts                             # Phase G.1 (create — §5.6 matrix typed registry)
mdx-components.tsx                                        # Phase A.1 (create placeholder) → Phase D.7 (modify to register components)
lib/time/now.ts                                           # Phase C.1 (create — request-scoped clock with header gating)
lib/messages/renderer-gate.ts                             # Phase G.2 (create — shouldEmitLearnMore admin-context check)

# Production source — modified
lib/messages/catalog.ts                                   # Phase B.1 (extend type) + B.2 (align admin-log-only) + E.5–E.11 (per-page backfill)
lib/messages/lookup.ts                                    # Phase B.1 (signature unchanged; return type widens) — no edits required if re-export is generic
app/show/[slug]/page.tsx                                  # Phase C.2 (migrate `today` to nowDate())
app/admin/actions.ts                                      # Phase C.4 (add `// not-render-side` waiver on existing new Date() call)
app/show/[slug]/p/actions.ts                              # Phase C.4 (waiver)
app/admin/dev/actions.ts                                  # Phase C.4 (waivers)
components/admin/AlertBanner.tsx                          # Phase G.3 (Learn-more wiring on the shared messageFor renderer)
components/admin/ParsePanel.tsx                           # Phase G.4 (testid retrofit per §5.6 matrix rows: parse-warnings header + parse-warning rows)
components/admin/ReSyncButton.tsx                         # Phase G.4 (testid retrofit per §5.6 matrix: sync-health header sibling)
components/admin/StagedReviewCard.tsx                     # Phase G.4 (testid retrofit per §5.6 matrix: per-show staged-review card; first-seen variant if M9 ships it separately)
components/messages/ErrorExplainer.tsx                    # Phase G.3 — confirmed live at r4 (verified: ls components/messages/ → ErrorExplainer.tsx exists). The §9.0.1 "What does this mean?" expansion component; G.3 wires the Learn-more link inside it via shouldEmitLearnMore.
components/admin/<dashboard-row-component>.tsx            # Phase G.4 — M9-owned, dashboard "Active Shows" + "Sheets we couldn't auto-apply" panel headers and the "Review staged changes" status badge. Concrete path resolves via Phase G.0 pre-execution discovery (r4); per AC-12.22 sequencing, M10 close-out gates M12 execution.
components/<onboarding-wizard>.tsx                        # Phase G.4 — M10-owned, three wizard step headers carrying help-affordance--wizard-step{1,2,3}--tooltip testids. Concrete path resolves via Phase G.0 pre-execution discovery (r4).
next.config.ts                                            # Phase A.1 (add withMDX + pageExtensions ['ts','tsx','mdx'])
package.json + pnpm-lock.yaml                             # Phase A.1 (@next/mdx + loaders) + F.3 (sharp) + F.5 (screenshot:help script)
playwright.config.ts                                      # Phase F.4 (add `screenshots-help` project + webServer entry)

# Scripts — created
scripts/help-screenshots.ts                               # Phase F.3 (Playwright capture entry point)
scripts/help-screenshots.manifest.ts                      # Phase F.1 (single source of truth)
scripts/help-screenshots-fixture-range.ts                 # Phase F.2 (INFO-tab DATES parser)
scripts/extract-admin-log-only-codes.ts                   # Phase B.3 (master-spec §12.4 derivation parser)
scripts/seed-m12-catalog-fields.ts                        # Phase B.1 (one-shot migration adding title/longExplanation/helpHref nulls)

# CI / workflows — created (or extends existing)
.github/workflows/screenshots-drift.yml                   # Phase F.5 (CI drift gate; alternatively extend an existing workflow)

# Public assets — created
public/help/screenshots/<key>-light.webp                  # Phase F.11 (per manifest entry; committed to repo)
public/help/screenshots/<key>-dark.webp                   # Phase F.11

# Tests — created
tests/help/_mdx-pipeline.test.ts                          # Phase A.1
tests/help/auth-stub.test.ts                              # Phase A.2 (Phase A smoke; Phase H.2 has the full Playwright auth spec)
tests/help/_nav-shape.test.ts                             # Phase A.3
tests/help/sidebar.test.tsx                               # Phase A.4
tests/help/header.test.tsx                                # Phase A.5
tests/help/breadcrumb.test.tsx                            # Phase A.6
tests/help/_metaNavSync.test.ts                           # Phase A.7 — meta-test #5
tests/messages/catalog-schema-extension.test.ts           # Phase B.1 + B.2 (extended for alignment cases)
tests/messages/extract-admin-log-only-codes.test.ts       # Phase B.3
tests/messages/_metaErrorCatalogDocs.test.ts              # Phase B.4 — meta-test #2
tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts  # Phase B.5 — meta-test #17
tests/time/now.test.ts                                    # Phase C.1 (smoke) → Phase C.3 (full gating)
tests/show/page-today-uses-now-utility.test.ts            # Phase C.2
tests/help/_metaServerTimeGuard.test.ts                   # Phase C.4 — meta-test #16
tests/help/callout.test.tsx                               # Phase D.1
tests/help/step.test.tsx                                  # Phase D.2
tests/help/screenshot-placeholder.test.tsx                # Phase D.3
tests/help/screenshot.test.tsx                            # Phase D.4
tests/help/ref-anchor.test.tsx                            # Phase D.5
tests/help/tip-from-sheets.test.tsx                       # Phase D.6
tests/help/mdx-components-registration.test.ts            # Phase D.7
tests/help/page-landing.test.tsx                          # Phase E.1
tests/help/page-getting-started.test.tsx                  # Phase E.2
tests/help/page-daily-rhythm.test.tsx                     # Phase E.3
tests/help/page-whats-different.test.tsx                  # Phase E.4
tests/help/page-dashboard.test.tsx                        # Phase E.5
tests/help/page-review-queues.test.tsx                    # Phase E.6 (one similar file per content task)
tests/help/page-parse-warnings.test.tsx                   # Phase E.7
tests/help/page-per-show-panel.test.tsx                   # Phase E.8
tests/help/page-preview-as-crew.test.tsx                  # Phase E.9
tests/help/page-sharing-links.test.tsx                    # Phase E.10
tests/help/page-onboarding-wizard.test.tsx                # Phase E.11
tests/help/page-tour.test.tsx                             # Phase E.12
tests/help/page-errors.test.tsx                           # Phase E.13
tests/help/manifest-shape.test.ts                         # Phase F.1
tests/help/fixture-range-parser.test.ts                   # Phase F.2 — test #14
tests/help/capture-script.test.ts                         # Phase F.3
tests/help/playwright-config.test.ts                      # Phase F.4
tests/help/screenshot-picture-contract.test.tsx           # Phase F.6 — test #10
tests/help/_metaScreenshotManifest.test.ts                # Phase F.7 — meta-test #9
tests/help/screenshot-coverage.test.ts                    # Phase F.8 — test #8
tests/playwright/help-screenshots-clock-pipeline.spec.ts  # Phase F.9 — test #18
tests/help/_affordance-matrix-shape.test.ts               # Phase G.1
tests/messages/renderer-gate-unit.test.ts                 # Phase G.2
tests/messages/renderer-emits-learn-more.test.tsx         # Phase G.3
tests/playwright/deep-link-walker.spec.ts                 # Phase G.5 — test #13 (concrete rows, E2E)
tests/help/deep-link-walker-template-family.test.tsx      # Phase G.5 — test #13 (template-family, unit)
tests/help/deep-link-walker-reverse.test.ts               # Phase G.5 — test #13 reverse-direction structural guard
tests/messages/_metaErrorRendererGate.test.ts             # Phase G.6 — meta-test #12
tests/help/anchor-resolver.test.ts                        # Phase H.1 — test #1
tests/playwright/help-auth.spec.ts                        # Phase H.2 — test #3 (full Playwright auth gate + AdminInfraError mapping)
tests/help/render.test.ts                                 # Phase H.3 — test #4 (MDX smoke renderer)
tests/playwright/help-mobile.spec.ts                      # Phase H.4 — test #6 (Playwright real-browser layout)
tests/help/no-placeholders.test.ts                        # Phase H.5 — test #7 (no-placeholder lint)

# Test infrastructure — created
tests/e2e/global-setup-screenshots.ts                     # Phase F.4 (Playwright globalSetup running pnpm db:seed)
```

---

## What's next

Once this plan is approved (or after self-review + an additional cross-CLI plan-review cycle per AGENTS.md), execution follows phase order. Each phase file is self-contained — pull it up and work through its tasks.

For execution, see the per-phase files starting with [01-foundation.md](01-foundation.md).

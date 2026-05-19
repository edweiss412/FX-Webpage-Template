# FXAV User-Facing Docs (M11) — Implementation Plan

**Plan date:** 2026-05-12
**Spec:** [`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`](../../specs/2026-05-12-user-facing-docs-design.md) (canonical) + companion HTML at [`2026-05-12-user-facing-docs-design.html`](../../specs/2026-05-12-user-facing-docs-design.html)
**Goal:** Build an in-app wiki-style documentation site at `/help` whose primary reader is Doug Larson (admin). 13 pages (4 adoption-track + 7 capability-reference + 2 tour/errors); deep-linked from §9.0.1 affordances in M3/M9/M10; screenshots captured deterministically via a Playwright harness with a request-scoped frozen clock.
**Status:** Drafted r1 (2026-05-12) after 8 rounds of adversarial review on the spec (r1 → r10). Plan execution starts only after M10 close-out (AC-11.22 sequencing constraint).

This plan is split into phase files for navigation. Each phase produces self-contained changes that can be reviewed independently.

---

## File map

| File | Phase | Contents | Approx tasks |
| ---- | ----- | -------- | ------------ |
| [00-overview.md](00-overview.md) | — | Goal, architecture, tech stack, sequencing dependency on M10, ratified spec amendments (none yet for M11), plan-wide invariants, meta-test inventory | — |
| [01-foundation.md](01-foundation.md) | **A** | `@next/mdx` pipeline + `app/help/layout.tsx` with `requireAdmin` + `AdminInfraError` catch; sidebar / header / breadcrumb chrome; `_nav.ts` registry; nav-consistency meta-test (test #5) | 7 (A.1–A.7) |
| [02-catalog-extension.md](02-catalog-extension.md) | **B** | Extend `MessageCatalogEntry` with `title` + `longExplanation` + `helpHref`; catalog-alignment subtask (AC-11.35) setting `dougFacing: null` on master-spec admin-log-only codes; `scripts/extract-admin-log-only-codes.ts` parser; catalog meta-test (test #2); catalog-alignment meta-test (test #17) | 5 (B.1–B.5) |
| [03-time-utility.md](03-time-utility.md) | **C** | `lib/time/now.ts` with request-scoped `X-Screenshot-Frozen-Now` header + `ENABLE_TEST_AUTH` gating; migrate `app/show/[slug]/page.tsx:646`; gating unit test (test #15); server-time grep guard (test #16) | 4 (C.1–C.4) |
| [04-components.md](04-components.md) | **D** | MDX components: `<Callout>`, `<Step>`, `<ScreenshotPlaceholder>` (draft scaffold), `<Screenshot>` (production), `<RefAnchor>`, `<TipFromSheets>` + `mdx-components.tsx` registration | 7 (D.1–D.7) |
| [05-content.md](05-content.md) | **E** | Author 13 pages: 4 adoption-track + 7 capability-reference + `/help/tour` + `/help/errors` (TSX iterating catalog) | 13 (E.1–E.13) |
| [06-screenshot-harness.md](06-screenshot-harness.md) | **F** | Manifest + fixture-range parser + capture script + `screenshots-help` Playwright project + `sharp` encoder + CI drift gate + `<picture>`-contract test (test #10) + manifest-integrity meta-test (test #9) + screenshot-coverage test (test #8) + fixture-range parser unit test (test #14) + E2E clock-pipeline proof (test #18) | 11 (F.1–F.11) |
| [07-affordance-retrofit.md](07-affordance-retrofit.md) | **G** | G.0 pre-execution discovery (pins M9/M10 component paths in the file inventory); `affordanceMatrix.ts` registry; render-side gate with preview-as-crew exception; `Learn more →` link wiring via `messageFor().helpHref`; deep-link affordance walker (test #13, three row-class split); error-renderer gate (test #12); retrofit `data-testid` to M3/M9/M10 source surfaces | 7 (G.0–G.6) |
| [08-auth-integration.md](08-auth-integration.md) | **H** | Anchor resolver test (test #1); auth-gating + AdminInfraError mapping test (test #3); MDX smoke test (test #4); mobile-layout Playwright (test #6); no-placeholder lint (test #7). r4's H.6 (live-catalog biconditional) was REMOVED in r6 — the assertion now lives in E.13 to be TDD-compliant. | 5 (H.1–H.5) |
| [09-close-out.md](09-close-out.md) | **I** | `/impeccable critique` + `/impeccable audit` per page; cross-model adversarial review of plan execution; M11 handoff doc update | 3 (I.1–I.3) |
| [HANDOFF-TEMPLATE.md](HANDOFF-TEMPLATE.md) | — | Per-execution-session handoff template (spec sections in scope, AC list, test commands, convergence log) | — |
| [handoffs/](handoffs/) | — | Per-execution handoff docs (created as M11 work begins) | — |

**Total:** 62 tasks across 9 phase files (A=7 + B=5 + C=4 + D=7 + E=13 + F=11 + G=7 + H=5 + I=3). r4 added G.0 + H.6 (+2); r6 removed H.6 (−1) by folding the live-catalog biconditional into E.13. Sub-skill: [`superpowers:subagent-driven-development`](../../../../.claude/skills/superpowers/subagent-driven-development) (recommended) or [`superpowers:executing-plans`](../../../../.claude/skills/superpowers/executing-plans).

---

## How to use this plan

1. **Read [00-overview.md](00-overview.md) first.** Contains goal, architecture, M10 sequencing dependency, ratified amendments, plan-wide invariants, meta-test inventory.
2. **Work phase-by-phase, top-to-bottom within each file.** Dependency order is A → B → C → D → E → F → G → H → I. Some intra-phase tasks can parallelize; the phase files note which.
3. **Spec is canonical** (per AGENTS.md invariant #7). When a task and spec disagree, the spec wins — open a question, do not silently fix.
4. **Each task has its own TDD red → green → commit loop.** Commit per task, never batch (AGENTS.md invariant #6).
5. **Cross-references** use textual `Phase X, Task N` form. To find any task: `grep -rn "Task A.3" docs/superpowers/plans/2026-05-12-user-facing-docs/`.

---

## Cross-reference convention

Task numbers are phase-prefixed: `A.1`, `A.2`, … `B.1`, … `I.3`. Spec section references (`§5.2`, `§3.6.2`, etc.) point into the spec at `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`. AC references (`AC-11.5`, `AC-11.35`, etc.) point into the spec's §13 AC table.

---

## Routing

This milestone has not yet been added to the main project's `ROUTING.md`. When M10 close-out approaches, add an entry per the existing routing decision pattern:

```
| M11 | User-facing /help docs | Opus / Claude Code | Codex (cross-CLI) | UI surface — invariant #8 (impeccable v3 gate) plus all 13 pages are UI files per the "UI work is always Opus" hard rule |
```

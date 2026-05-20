# M11 (User-Facing Docs) Phase Routing

**Decision date:** 2026-05-19
**Inputs:** M11 spec at `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`; plan phases A–I in this dir; project-wide routing rules from the FXAV crew-pages plan ([`../2026-04-30-fxav-crew-pages-design/ROUTING.md`](../2026-04-30-fxav-crew-pages-design/ROUTING.md)); UI hard rule from `AGENTS.md`; lessons from M0–M10 + M6.5.

M11's phase structure (A–I) replaces FXAV's milestone numbering. Routing is decided per-phase, not per-task, because phases are the natural execution + close-out boundary in this plan (each phase has its own pre/post tests + checkpoint).

This file is the per-phase analog of FXAV's ROUTING.md. The same rules apply:
- **UI work is always Opus / Claude Code.** Any file under `app/help/` (the new docs site), any new `components/` files, any `*.mdx` content file, or any change to design tokens.
- **Adversarial review is always the opposing harness.** Reviewer is the cross-model partner regardless of implementer.
- **Pin-stops on split phases** follow the M5/M6/M8/M10 pattern documented in `HANDOFF-TEMPLATE.md`.

---

## Per-phase assignment

| Phase | Effort | Implementer | Reviewer | Why |
| --- | --- | --- | --- | --- |
| **A — Foundation** (Tasks A.1–A.7) | MDX pipeline, `/help` layout + chrome (sidebar/header/breadcrumb), nav registry, nav-consistency meta-test | **Opus / Claude Code** | Codex | All UI surface: `app/help/layout.tsx`, sidebar/header/breadcrumb components, `mdx-components.tsx`. Per UI hard rule, all-Opus. The `requireAdmin` + AdminInfraError catch in the layout is gluing existing M5 helpers, not authoring auth logic. |
| **B — Catalog extension** (Tasks B.1–B.5) | Extend `MessageCatalogEntry` with `title` + `longExplanation` + `helpHref`; `scripts/extract-admin-log-only-codes.ts`; catalog + catalog-alignment meta-tests | **GPT-5.5 / Codex** | Opus | Pure backend: `lib/messages/catalog.ts` type extension + scripts + meta-tests. `lib/messages/` has been Codex-owned since M5 §A and M8 §A. Catalog-alignment subtask reconciles live catalog with master-spec §12.4 admin-log-only contract — structural backend work. |
| **C — Time utility** (Tasks C.1–C.4) | `lib/time/now.ts` request-scoped frozen-clock + `ENABLE_TEST_AUTH` gating; migrate `app/show/[slug]/page.tsx:697`; gating + grep guard tests | **Mostly Codex** + **Opus for one page-component edit** | Opus (for Codex majority) | C.1–C.3 are `lib/time/*` + scripts + tests → Codex. C.4 (migrate one `new Date()` call site in `app/show/[slug]/page.tsx`) is a UI file touch — strictly Opus per UI hard rule. Cleanest split: Codex pins the `nowForServer()` signature in C.1; Opus does the one-line migration in C.4 against the pinned contract. Single pin-stop suffices given how narrow the UI touch is. |
| **D — MDX components** (Tasks D.1–D.7) — **CLOSED 2026-05-19 at SHA `08d6546`** ([handoff](handoffs/D-components.md)) | `<Callout>`, `<Step>`, `<ScreenshotPlaceholder>`, `<Screenshot>`, `<RefAnchor>`, `<TipFromSheets>` + `mdx-components.tsx` registration + `tests/styles/_metaDesignTokenPairs.test.ts` structural meta-test | **Opus / Claude Code** | Codex | All UI components. Heavy `impeccable` workflow territory (component visual design + a11y). All-Opus per UI hard rule. **Convergence:** 6 per-component impeccable §1.8 dual-gates (all PASS) + Codex 8 rounds (R1 2 HIGH → R8 APPROVE). |
| **E — Content authoring** (Tasks E.1–E.13) | Author 13 MDX pages: 4 adoption-track + 7 capability-reference + `/help/tour` + `/help/errors` | **Opus / Claude Code** | Codex | All content + `.mdx` files. Heavy `impeccable` `clarify` / `shape` / `polish` territory. Doug is the audience; voice + IA matter. All-Opus. |
| **F — Screenshot harness** (Tasks F.1–F.11) | Manifest, fixture-range parser, Playwright capture script, `screenshots-help` project, `sharp` encoder, CI drift gate, meta-tests #8/#9/#10/#14/#18 | **GPT-5.5 / Codex** | Opus | Pure tooling: Playwright scripts, image encoder, CI gate, test infrastructure. No UI authoring — the harness CAPTURES UI but doesn't WRITE UI. Codex-owned territory same as M6's Drive sync engine. |
| **G — Affordance retrofit** (Tasks G.0–G.6) | `affordanceMatrix.ts` registry, render-side gate with preview-as-crew exception, `Learn more →` link wiring via `messageFor().helpHref`, retrofit `data-testid` on M3/M9/M10 source components, walker + error-renderer-gate tests | **Split-mode: §A Codex / §B Opus** | Opus | Two-surface phase: backend (`lib/help/affordanceMatrix.ts`, gate logic, catalog `helpHref` population) + UI retrofit (`Learn more →` JSX additions + `data-testid` retrofit on existing M3/M9/M10 components). Single pin-stop on the matrix + gate contract; §B starts after the pin and runs in parallel with §A's catalog-population tail. Pattern matches M5/M6/M8 splits. |
| **H — Auth + integration tests** (Tasks H.1–H.5) | Anchor resolver test, auth + AdminInfraError mapping test, MDX smoke test, mobile-layout Playwright, no-placeholder lint | **GPT-5.5 / Codex** | Opus | Test infrastructure. Mobile-layout Playwright IS a UI-shaped test but it's authoring TEST code, not UI code. Codex-owned same as M6's Playwright suite. |
| **I — Close-out** (Tasks I.1–I.3) | `/impeccable critique` + `/impeccable audit` per page; cross-CLI adversarial review of plan execution; M11 handoff doc final | **Opus / Claude Code (orchestrator)** | Codex (cross-CLI review) | `/impeccable` is Opus-loaded; close-out is by definition Opus orchestrator territory. The cross-CLI review of plan execution invokes Codex via the `/codex:adversarial-review` slash command per `feedback_adversarial_review_canonical_invocation.md`. |

---

## Hard rule recap

**UI work is always Opus / Claude Code.** Files under `app/help/`, any new `components/` file, any `*.mdx` content, design-token files, and `mdx-components.tsx` are Opus territory regardless of which phase they're in. If Codex finds itself wanting to author one of those, **stop and hand back to the orchestrator**.

The phases above already respect this: A/D/E/I are all-Opus; B/F/H are pure backend (Codex); C is mostly Codex with one Opus edit; G is split-mode.

## Reviewer pairing logic

Same as FXAV ROUTING.md §"Reviewer pairing logic." Cross-model review pairs the opposing harness regardless of phase, per:
- Memory `feedback_adversarial_review_canonical_invocation.md` (slash-command discipline)
- Memory `feedback_adversarial_review_full_milestone_scope.md` (anchor reviews to phase-base, not per-round fix-base)
- Memory `feedback_iterate_until_convergence.md` (iterate to APPROVE; round-3 cap is for disagreement loops, not new-bug streaks)

## Split-mode pin-stop discipline (for phases C and G)

Both phases have a single pin-stop where the backend signature stabilizes before the UI/co-located work consumes it. Pattern matches the M5/M8/M10 single-pin-stop rule documented in `../2026-04-30-fxav-crew-pages-design/HANDOFF-TEMPLATE.md` §0:

- **Phase C pin:** after C.1 lands `lib/time/now.ts` with the `nowForServer()` export. Pin contract: `(req: Request) => Date | string` (exact signature per spec §C.1). Opus's C.4 migration consumes against this pin.
- **Phase G pin:** after the affordance matrix + render-side gate land (G.1–G.3). Pin contract: `AffordanceRow` type + `shouldShowAffordance(row, ctx): boolean` + `messageFor(code).helpHref` extension. Opus's G.4–G.6 retrofit consumes against this pin.

## Handoff template

Use [`HANDOFF-TEMPLATE.md`](./HANDOFF-TEMPLATE.md) in this dir per phase or per-execution-session. The template is M11-specific (already in place); follows the same shape as the FXAV one.

## Cross-plan note

X.\* (the FXAV cross-cutting tasks) and M11 share one file surface: `lib/messages/catalog.ts`. X.1's catalog-parity audit and M11's Phase B catalog extension both touch this file. **Coordinate ordering** — finish X.1 catalog parity audit before M11 Phase B starts, OR pin Phase B's catalog-row additions against the X.1 audit baseline so the parity assertion sees a known-good starting state. If both run in parallel, the X.* implementer and the M11 Phase B implementer should agree on the sequence at handoff time.

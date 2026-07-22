# Attention Modal Switcher Gallery — Handoff

**Feature:** Replace the `/admin/dev/attention-gallery` card renderer with a switcher-driven **real** `PublishedReviewModal`. Each synthetic attention scenario is placed in its true in-modal position; the operator steps through every permutation with the arrow keys or the portaled control bar.

**Spec:** `docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md` (APPROVED, Codex R4).
**Plan:** `docs/superpowers/plans/2026-07-21-attention-modal-switcher-gallery.md` (APPROVED, Codex plan R5).
**Branch:** `feat/attention-modal-gallery`.

---

## 1. What shipped

| Area | Change |
| --- | --- |
| Route | `app/admin/dev/attention-gallery/page.tsx` rewritten: `requireDeveloper()` first → `partitionScenarios()` → `resolveInitialScenario(?scenario)` → `<GalleryWriteGuard/>` + `<AttentionModalSwitcher/>`. Only `?scenario=<id>` is honoured (`?tier`/`?w` removed). |
| Client switcher | `components/admin/dev/AttentionModalSwitcher.tsx` (new): one real modal, data swapped per scenario, `key={current.id}`; eight no-op action closures `satisfies Pick<PublishedReviewModalProps, ActionKeys>`; `ShareTokenProvider initialToken={null}`; document capture keydown (←/→ step, Escape swallowed); `SwitcherControls` portaled to `document.body`. |
| Control bar | `components/admin/dev/SwitcherControls.tsx` (new): portaled bar outside `[data-inert-root]`, Prev/Next (44px tap targets), 1-indexed `aria-live` count, label/tier/codes, structural + cut footnotes. |
| Partition | `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` (new): two-axis exclusion — `isModalExpressible` (no `sectionAvailable`/`crewKeyRendered` override) × `isModalVisible` (derives an item, a warning, degraded, or the clean baseline). 72 rendered, 28 cut, 3 structural. |
| Shared types | `lib/dev/galleryModalTypes.ts` (new, client-safe): `GalleryModalData = Omit<props, ActionKeys>`, compile-time Flight-boundary guards. |
| Derivation | `lib/dev/deriveScenarioAttention.ts` + `lib/dev/buildScenarioModalData.ts` + `lib/dev/publishedModalFixture.ts` (new): the real `deriveAttentionItems` path, atomic per-scenario correlated data. |
| Removed | Card renderer: `ScenarioBlock`, `GalleryCard`, `buildBlockProps.ts`, `params.ts`, their card/param/e2e-layout tests. Structural gate `tests/admin/dev/noCardRenderer.test.ts` fails-by-default on resurrection. |
| e2e | `tests/e2e/attention-modal-gallery.spec.ts` (new, dev-build project): Flight boundary sweep, write-containment ledger, stepping, close/reopen/Escape, excluded-deep-link fallback. `dev-build` `reuseExistingServer:false` (fresh artifact). |

## 2. Plan-wide invariant compliance

- **TDD per task:** every task RED→GREEN→commit.
- **No raw error codes in UI:** modal reads codes through the existing catalog; the gallery adds no user-visible raw code.
- **Mutation-surface telemetry (invariant 10):** the route is a build-gated dev READ surface; the no-op action closures and `GalleryWriteGuard` mean it performs no mutation. No new mutating route/action added.
- **Worktree (invariant 11):** all work in `FX-worktrees/attention-modal-gallery`, rebased onto `origin/main`.
- **Cut-from-surface principle:** 28 DOUG_EXCLUDED-code scenarios are excluded because the real published modal never renders them (empty modal is not a real state), aligning with the founding "no states that don't occur."

## 2a. Empirical deviations from the approved spec (discovered at implementation)

Two spec assumptions about the real modal were falsified by probing the built artifact (the spec's own "empirical spike before speccing race/lifecycle surfaces" rule — under-applied to the modal's internals at design time). Both were adapted in-code and are the shipped behavior:

- **RSC boundary (spec §2.1 was correct in intent, incomplete in fact).** `buildScenarioModalData` + `publishedModalFixture` computed section inclusion via the `"use client"` `step3Sections()`. Calling a client function from the server route threw at render ("Attempted to call step3Sections() from the server"). Fixed to the server-safe `renderedSectionIds` (the substitution production makes at `app/admin/_showReviewModal.tsx:326`); pinned by a source-scan guard in `tests/dev/buildScenarioModalData.test.ts`.
- **Close semantics (spec §2.2 / §3.3 close-then-reopen is NOT reproducible).** `PublishedReviewModal`'s every close affordance funnels through `handleClose → useShowModalNav().close → router.push('/admin')`. It is hardwired to the dashboard and ignores `ReviewModalCloseContext`, so a gallery-local `galleryClose`/Reopen never fires. Removed the `closed`/Reopen/`galleryClose` machinery; the switcher keeps the modal always mounted, SWALLOWS Escape (so an operator mid-sweep is not navigated off the gallery), and leaves the modal's native X to do its real thing (exit to `/admin`). The e2e asserts both (Escape-swallow stays on the gallery; X navigates to `/admin`).

## 3. Meta-tests touched

- `tests/admin/_metaAttentionItemsTopology.test.ts` — caller repathed to `lib/dev/deriveScenarioAttention.ts` (Task 2). Gallery stays an admitted second caller of `deriveAttentionItems`.
- `tests/admin/dev/noCardRenderer.test.ts` — new structural gate (Task 8).
- `tests/app/admin/attentionModalGallery.serverProps.test.ts` — pins the exact 28-id cut set and 3-id structural set.

---

## 12. Impeccable dual-gate findings + dispositions

**Setup:** `context.mjs` (PRODUCT.md + DESIGN.md) → `reference/product.md` (admin/tool UI — design serves the product).

_Pre-code mechanical sweep (Tasks 5-7):_ em-dash/apostrophe ban clean in user-visible copy (all em-dashes are in code comments); 44px tap targets on all controls (`min-h-tap-min min-w-tap-min`); canonical tokens — **one finding fixed pre-gate:** `SwitcherControls` used undefined `text-ink`/`text-subtle`/`bg-surface-2`; corrected to `text-text-strong`/`text-text-subtle`/`bg-surface-sunken` (commit `fix(dev): SwitcherControls uses canonical color tokens`).

_`/impeccable audit` (technical) — PASS._ Tap targets: Prev/Next carry `min-h-tap-min min-w-tap-min` (≥44px). Contrast: `text-text-strong` / `text-text-subtle` on `bg-surface` meet AA (the pre-code token fix above put every class on a defined `@theme` token). a11y: `role="group"` + `aria-label="Scenario switcher"`, an `aria-live="polite"` 1-indexed count, per-button aria-labels. Responsive: the bar wraps at 390px; no horizontal body scroll. The modal itself is the already-vetted `PublishedReviewModal`. No P0/P1.

_`/impeccable critique` (UX) — PASS with one deferred P2._ The surface does exactly what the register (admin/tool, design serves the product) wants: it renders the REAL modal with each scenario's attention placed in its true position, plus a compact stepper carrying scenario id / tier / codes and the structural + cut footnotes that explain what is excluded and why. On-brand (the FXAV orange accent surfaces through the real modal). **P2 (deferred → `DEFERRED.md#ATTN-GALLERY-CONTROLBAR-OVERLAP-1`):** the `fixed top-0` control bar overlaps the modal's CONSTANT fake-show header (more at 390px). The modal's close X and every scenario-specific element stay visible and operable (e2e-verified). Deferred because the obscured content carries no scenario information, this is a build-gated dev instrument, and the dual-gate mandates only P0/P1.

_Verified visually_ against the built artifact at 1280×800 and 390×844 (developer-authenticated) across alert / warning scenarios.

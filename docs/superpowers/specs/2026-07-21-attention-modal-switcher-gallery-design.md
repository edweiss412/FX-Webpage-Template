# Attention Modal Switcher Gallery — Design Spec

**Date:** 2026-07-21
**Status:** DRAFT → (self-review → cross-model review → APPROVE)
**Supersedes the renderer of:** `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md` (the scenario *catalog*, derivation, safety gates, and materialize path are unchanged; only the gallery's *presentation* is replaced).

---

## 1. Problem

The shipped gallery (`/admin/dev/attention-gallery`, PR #533) renders each scenario's alert/warning as a **bare `AttentionBanner` card** on a flat page (`ScenarioBlock`). That answers "what does the card look like" but not the question the operator actually has: **"where does this alert appear inside the real show modal, and what does the modal look like around it."** The cards are placed by the real `bucketAttention`, but stripped of the modal chrome (nav rail, Overview/Changes sections, status strip, per-section warning controls) that gives an alert its context and position.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Replace, don't augment.** The switcher-driven real modal becomes THE gallery body. `ScenarioBlock`, `GalleryCard`, and the card-list layout are removed. | User decision, this session (recorded in handoff §1). |
| **Layout is Option B: one modal + prev/next switcher.** Not an index-and-open overlay, not a vertical stack. | User decision, this session. |
| **The renderer is the REAL `PublishedReviewModal`** (`components/admin/showpage/PublishedReviewModal.tsx:125`), not a re-implementation. Fidelity is the whole point; a re-skin would look authoritative while lying. | Carried from superseded spec §3.3. |
| **Scenario catalog, tiers, derivation, and safety gates are unchanged.** `lib/dev/attentionScenarios/**` (`ALL_SCENARIOS`, `AttentionScenario`), the `buildBlockProps` derivation path, `GalleryWriteGuard`, and the build gate are reused as-is. Tier 3 stays materialize-only. | `lib/dev/attentionScenarios/index.ts:12`, `app/admin/dev/attention-gallery/buildBlockProps.ts:154`. |
| **Display-only: no scenario can write to any DB.** The 8 modal action props are client-owned inert no-ops; `GalleryWriteGuard` blocks every non-GET `fetch` (covers `PerShowAlertResolveButton`'s imperative `fetch(POST)`). | `components/admin/dev/GalleryWriteGuard.tsx:53`; superseded spec §4.4 (containment P0). |
| **Scoped exception to invariant 5** (no raw error codes in UI): the gallery is a developer instrument; showing raw `code:` on cards/labels is intentional. | Carried from superseded spec §1.1. |
| **`ADMIN_DEV_PANEL_ENABLED` build gate unchanged.** Route stays gated via the `scripts/with-admin-dev-flag.mjs:63` FILES entry (`app/admin/dev/attention-gallery/page.tsx`). | This session verified the gate on validation. |

## 2. Approach (grounded, not assumed)

Empirical grounding was done by reading the live modal + shell source (findings are DATA, per the AGENTS.md empirical-spike mandate):

1. **The modal is a `fixed inset-0 z-50` dialog portaled to `document.body`** (`ReviewModalShell.tsx:582`), `open`-controlled (`PublishedReviewModal.tsx:551` passes `open={!closing}`).
2. **Background inerting is scoped to `[data-inert-root]` elements** (`ReviewModalShell.tsx:179`), and the **admin layout is that root** (`app/admin/layout.tsx:159`). The gallery page renders *inside* the admin layout, so any switcher control left in the page body is inerted the moment the modal opens — dead prev/next. **Therefore the switcher control bar MUST be portaled to `document.body`** (a sibling of `[data-inert-root]`, like the modal overlay) and sit at `z > 50`.
3. **Production already passes all 18 data props across the Server→Client boundary** (`app/admin/_showReviewModal.tsx:406` is a Server Component rendering the client `PublishedReviewModal`), proving `data`/`bySection`/`attentionItems`/`now`/`feed`/`pickerCrew` etc. are RSC-serializable. **Only the 8 function props are not** — in production they are `"use server"` action refs; in the gallery they are plain closures, which are NOT RSC-serializable. This is the exact RSC-boundary throw that shipped a blank page in the prior run (`onResolved` from a Server Component). **Therefore the 8 action props MUST be owned by a Client Component**, never passed from the server page.
4. **`baseProps()` (`tests/components/admin/showpage/publishedReviewModal.test.tsx:214`) already assembles a complete, valid `PublishedReviewModalProps`** using the SAME real builders the loader uses (`buildPublishedSectionData`, `buildSectionWarningModel`) and `vi.fn()` for the 8 actions. It is the lift target — promoted from a test helper into a shared, non-test fixture factory.

### Architecture

```
app/admin/dev/attention-gallery/page.tsx          (Server Component, gated — REWRITTEN body)
  requireDeveloper()                                first line (unchanged auth chain)
  const scenarios = buildSwitcherScenarios()        → GallerySwitcherScenario[] (serializable data only)
  <GalleryWriteGuard/>                              (KEPT — network write containment)
  <AttentionModalSwitcher scenarios={scenarios}/>   (Client Component)

components/admin/dev/AttentionModalSwitcher.tsx     (Client Component — NEW)
  owns useState(index), prev/next, keyboard ←/→
  owns the 8 inert no-op action closures (correct return shapes)
  wraps children in <ShareTokenProvider …>          (production wraps the modal in it)
  renders <PublishedReviewModal key={sc.id} {...sc.data} {...noopActions}/>
  renders <SwitcherControls/> via createPortal(…, document.body)   (escapes [data-inert-root], z-[60])

app/admin/dev/attention-gallery/buildSwitcherScenarios.ts   (Server module — NEW, lifts derivation)
  reuses the real derivation from buildBlockProps.ts + the baseProps data shape
  per tier-1/tier-2 scenario → { id, tier, label, data: <18 serializable data props> }

lib/dev/publishedModalFixture.ts                    (shared fixture factory — NEW, promoted from baseProps)
  buildGalleryModalData(overrides) → the 18 data props (no functions)
```

**Data flow per scenario:** the scenario's `alerts`/`holds`/`warnings`/`bucket` (from the catalog) run through the **real** `deriveAlertRowFields → deriveAttentionItems → bucketAttention` path already in `buildBlockProps.ts` to produce `attentionItems: AttentionItem[]` + the warning `bySection` inputs. Those are merged into the `buildGalleryModalData` base to yield the 18 data props. No new derivation logic — the switcher renders the same derived state the cards did, into the real modal.

## 3. Components & responsibilities

### 3.1 `lib/dev/publishedModalFixture.ts (new)`
- `buildGalleryModalData(over?: Partial<GalleryModalData>): GalleryModalData` — returns the 18 serializable data props of `PublishedReviewModalProps` (everything except the 8 functions). Body identical in spirit to `baseProps` lines 218–255 minus the `vi.fn()` fields, with real (non-vitest) defaults.
- `GalleryModalData` = `Omit<PublishedReviewModalProps, "setPublished"|"archiveAction"|"unarchiveAction"|"undoAction"|"acceptAction"|"acceptAllAction"|"approveAction"|"rejectAction">` — derived by `Omit`, so it tracks the source type; if a field is added to the props, this breaks the build until reconciled (no silent drift).
- Default show identity: reuse the gallery's existing constants (`GALLERY_SLUG`/`GALLERY_NOW` from `buildBlockProps.ts:37`) so the fixture and derivation agree on `slug`/`now`. **Single source of truth** — the numeric/string literals live here and in `buildBlockProps`, referenced, never re-typed.
- **Guard:** `over` is shallow-merged last (like `baseProps` `...overrides`), so a scenario overriding `attentionItems`/`bySection`/`data.warnings` wins.

### 3.2 `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts (new)` — Server module
- `buildSwitcherScenarios(): GallerySwitcherScenario[]` — maps `ALL_SCENARIOS.filter(s => s.tier !== 3)` to `{ id: string; tier: 1|2; label: string; data: GalleryModalData }`.
- Per scenario: run the real derivation (extracted/reused from `buildBlockProps`) to get `attentionItems` + warning inputs, then `buildGalleryModalData({ attentionItems, bySection, data: <with warnings>, alertsDegraded, ... })`.
- **Tier-2 degraded** (`scenario.degraded`, e.g. `T2_DEGRADED`): sets `alertsDegraded: true` (drives the modal's degraded banner), `attentionItems: []`.
- **Guard — empty catalog:** if the filtered list is empty (impossible given `T2_REQUIRED_IDS`, but guarded), the switcher renders an explicit "no scenarios" empty state, not a crash.
- **Ordering:** tier-1 alerts, then tier-1 warnings, then tier-2 — the catalog's own order (`ALL_SCENARIOS` spread order, `index.ts:12`). Deterministic; no sort.

### 3.3 `components/admin/dev/AttentionModalSwitcher.tsx (new)` — Client Component
- Props: `{ scenarios: GallerySwitcherScenario[] }`.
- State: `const [index, setIndex] = useState(0)`.
- **Owns the 8 no-op actions**, each returning the correct shape:
  - `setPublished: async () => ({ ok: true } as const)`
  - `archiveAction: async () => ({ ok: true } as const)`
  - `unarchiveAction: async () => {}`
  - `undoAction`/`acceptAction`/`acceptAllAction`/`approveAction`/`rejectAction`: `async () => {}` typed to `ChangesSectionProps[...]` (verify each expected signature; §5.2 guard).
  - These are memoized once (`useMemo`/module const) — stable identities across re-render.
- Renders `<PublishedReviewModal key={current.id} {...current.data} {...noopActions} />`, wrapped in `<ShareTokenProvider>` (match production wrapper; provide a display-only token value). **`key={current.id}` remounts on switch** → fresh focus/attention one-shot state; no stale carry-over between scenarios.
- Renders `<SwitcherControls .../>` via `createPortal(node, document.body)` — a `fixed` bar at `z-[60]` (above the modal's `z-50`), OUTSIDE `[data-inert-root]`, so it stays interactive while the modal inerts the admin shell.
- **Keyboard:** `←`/`→` step prev/next. Registered on `document` at capture is unnecessary (controls are focusable buttons); a keydown listener guarded to ignore when focus is inside an input.
- **`useHasMounted` gate for the portal** (createPortal to `document.body` only after mount; SSR renders controls inline or null). Mirrors the shell's own mount gate (`ReviewModalShell.tsx:158`).

### 3.4 `SwitcherControls` (sub-component of 3.3)
- Rendered content: `‹ Prev`, `Next ›`, `Scenario <n> / <total>`, the current scenario `label`, its `tier` chip, and its primary `code`(s) as a `font-mono` readout (dev-instrument raw-code exception).
- `min-h-tap-min` on both step buttons (44px tap targets — pre-code mechanical UI gate).
- `role="group" aria-label="Scenario switcher"`; count uses `aria-live="polite"` so a SR user hears the scenario change.
- No em-dashes in visible copy; apostrophes literal; canonical type tokens (`text-xs`, `text-subtle`).

### 3.5 KEPT / REMOVED
- **KEPT:** `GalleryWriteGuard.tsx`, the catalog (`lib/dev/attentionScenarios/**`), the derivation core of `buildBlockProps.ts` (`toAlertInputs`/`toHoldRows`/`deriveAttentionItems`/`bucketAttention` path), `params.ts` (scenario/tier selection via `?scenario`/`?tier`), the build gate, `trustDomains.ts:56`, `MaterializeCard`.
- **REMOVED:** `components/admin/dev/ScenarioBlock.tsx`, `components/admin/dev/GalleryCard.tsx`, the card/readout helpers in `buildBlockProps.ts` (`toGroups`:72, `buildReadout`:107) if unused by the new path, and the `w`/`MIN/MAX_WIDTH_PX` width param (cards-only; the modal is full-screen).

## 4. Guard conditions (per prop / state)

| Input / state | null / empty / edge | Behavior |
| --- | --- | --- |
| `scenarios` empty | filtered catalog empty | Explicit empty state ("No renderable scenarios"), no crash. |
| `index` at 0, prev | wrap | Wraps to `scenarios.length - 1` (matches the mock; `%` modulo). |
| `index` at last, next | wrap | Wraps to `0`. |
| scenario with `attentionItems: []` (tier-2 structural) | no alert to show | Modal renders with its sections, degraded/empty attention region — that IS the state under review. |
| `data.warnings` non-empty, `attentionItems` empty (warning scenario) | warnings route to per-section controls | `bySection` drives the section warning controls; nav dot on the warned section. |
| close / Escape inside modal | shell calls `handleClose` → router navigation | Documented: closing the modal exits the gallery to `/admin`. The switcher does NOT intercept close; prev/next is the in-gallery navigation. (Guard: acceptable — "close" is a real modal affordance worth seeing.) |
| resolve/ignore click inside a banner | `PerShowAlertResolveButton` `fetch(POST)` | `GalleryWriteGuard` returns a 403 `{code:"GALLERY_DISPLAY_ONLY"}`; no DB write; `data-gallery-blocked-write` recorded. |
| rapid prev/next | remount churn | `key={id}` remount is idempotent; body-scroll-lock and inert toggle on each remount are self-restoring (`ReviewModalShell.tsx:189`). Transition-audit task covers it. |

## 5. Risks & correctness surfaces

### 5.1 RSC boundary (the prior run's blank-page defect)
The 8 action props are owned by `AttentionModalSwitcher` (client). The server `page.tsx` passes ONLY `GallerySwitcherScenario[]` (data). A test asserts the server module exports no function-valued props (source-scan or render test), and a real-browser Playwright test asserts the modal actually renders (not a blank error boundary) — the jsdom-passing-blank-page trap requires a real-browser assertion.

### 5.2 Action prop signatures
Each of the 5 Changes actions has a precise type via `ChangesSectionProps[...]`. The no-op must satisfy it (e.g. `acceptAction: (id: string) => Promise<void>`). Pre-draft typecheck of the switcher against strict tsconfig is mandatory (paste-time compile). `GalleryModalData` via `Omit` guarantees the data half stays in sync.

### 5.3 Portal + inert interaction (grounded §2.2)
Switcher controls portal to `document.body`, `z-[60]`, outside `[data-inert-root]`. A real-browser test asserts the prev/next buttons are NOT inert while the modal is open (click advances the count) — jsdom does not enforce `inert`, so this is Playwright-only.

### 5.4 ShareTokenProvider / realtime
Wrap in `ShareTokenProvider` (production does). Do NOT render `ShowRealtimeBridge` (opens a realtime channel; irrelevant + undesirable in a gallery). Verify `PublishedReviewModal` does not itself require the realtime bridge to render (it does not — the bridge is a sibling in `_showReviewModal.tsx:441`, not a prop).

## 6. Dimensional Invariants
The modal chrome is the real component; its internal dimensional invariants are already pinned by the existing modal layout tests. The switcher adds only the portaled control bar. **Invariant:** `SwitcherControls` is `position: fixed` and never participates in the modal's fl-ex/grid layout, so it introduces no fixed-parent/flex-child relationship. The one assertion (layout task): the control bar's computed `z-index` (60) `>` the shell overlay's (50), and its bounding box does not overlap the modal's close button (top-right) — controls sit top-left or bottom-center. Real-browser `getBoundingClientRect`.

## 7. Transition Inventory

States: **S0** viewing scenario *i* (modal open). Transitions:

| From → To | Trigger | Treatment |
| --- | --- | --- |
| S0(i) → S0(i±1) | prev/next or ←/→ | `key` change remounts the modal. Instant content swap; the shell's own open animation replays on mount. No custom cross-fade (a re-mount is the honest representation; matches how opening a real show modal animates). |
| S0(i) → S0(i) rapid repeat | held/rapid prev/next | Each step is an independent remount; no compound in-flight animation because the prior modal fully unmounts before the next mounts (React commit). Transition-audit task asserts no `AnimatePresence` exit is stranded. |
| S0 → closed | close button / Escape | Shell's `closing` state → exit, then router navigation to `/admin`. Existing shell close animation (unchanged). |

Compound transition (switch while close animation mid-flight): closing navigates away, so no switch is possible after close begins — not reachable.

## 8. Meta-test inventory
- **EXTENDS** `tests/admin/dev/filesMembership.test.ts` — route path unchanged; entry stays valid (verify, no edit expected).
- **EXTENDS** `tests/admin/build-artifact-gate.test.ts` — `attention-gallery` absent-when-flag-unset checks unchanged.
- **REMOVES** `tests/components/admin/dev/scenarioBlock.test.tsx`, `tests/app/admin/attentionGalleryRender.test.tsx` (card-render), `tests/e2e/attention-gallery-layout.spec.ts` (card layout) — replaced by switcher equivalents.
- **KEEPS** `tests/components/admin/dev/galleryWriteGuard.test.tsx`, `tests/admin/_metaAttentionItemsTopology.test.ts` (gallery remains a 2nd `deriveAttentionItems` caller — the switcher path still calls it).
- **NEW** `tests/components/admin/dev/attentionModalSwitcher.test.tsx (new)` (prev/next/wrap, no-op action shapes, empty state); `tests/app/admin/attentionModalGallery.serverProps.test.ts (new)` (server module passes only data, no function props); `tests/e2e/attention-modal-gallery.spec.ts (new)` (real-browser: modal renders non-blank; controls not inert; count advances; write blocked).
- **No admin-alert / DB / advisory-lock / email meta-tests** apply — no DB write, no schema, no mutation surface added (the modal actions are inert). Invariant 10 (mutation observability): N/A — no new mutating route/action; the no-op closures write nothing.

## 9. Out of scope
- Tier-3 materialize path (unchanged; still dev-panel `MaterializeCard`).
- Any change to `PublishedReviewModal`, `ReviewModalShell`, the catalog, or the derivation semantics.
- Index/stack layouts (Option A/C rejected this session).
- Dark/light theming work (modal is the real component; inherits admin theme).

## 10. Testing strategy
TDD per task. Unit (vitest/jsdom): fixture factory shape, server-props data-only, switcher prev/next/wrap/empty, no-op action return shapes. Real-browser (Playwright, `dev-build` project): modal renders non-blank for a representative scenario, switcher controls interactive while modal open (inert check), count advances on click, `data-gallery-blocked-write` set after a resolve click. Full suite + typecheck + eslint + format before push.

## 11. Impeccable dual-gate
UI surface (new client components under `components/admin/dev/` + rewritten route). `/impeccable critique` AND `/impeccable audit` on the diff before Codex review; P0/P1 fixed or DEFERRED. Pre-code mechanical gate: em-dash ban, apostrophes, 44px tap targets, canonical tokens.

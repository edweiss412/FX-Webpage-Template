# Attention Modal Switcher Gallery — Design Spec

**Date:** 2026-07-21
**Status:** DRAFT → (self-review → cross-model review R2 → APPROVE)
**Supersedes the renderer of:** `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md` (the scenario *catalog*, derivation, safety gates, and materialize path are unchanged; only the gallery's *presentation* is replaced).

**Revision note:** R2 folds in Codex spec-review R1 (27 findings) + a tier-2 faithfulness boundary found during plan pre-verification. Numbered resolutions are cited inline as `[R1-#n]`.

---

## 1. Problem

The shipped gallery (`/admin/dev/attention-gallery`, PR #533) renders each scenario's alert/warning as a **bare `AttentionBanner` card** on a flat page (`ScenarioBlock`). That answers "what does the card look like" but not the operator's real question: **"where does this alert appear inside the real show modal, and what does the modal look like around it."** The cards are placed by the real `bucketAttention`, but stripped of the modal chrome (nav rail, Overview/Changes sections, status strip, per-section warning controls) that gives an alert its context and position.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Replace, don't augment.** The switcher-driven real modal becomes THE gallery body. `ScenarioBlock`, `GalleryCard`, and the card-list layout are removed. | User decision, this session. |
| **Layout is Option B: one modal + prev/next switcher.** Not an index-and-open overlay, not a vertical stack. | User decision, this session. |
| **The renderer is the REAL `PublishedReviewModal`** (`components/admin/showpage/PublishedReviewModal.tsx:125`), not a re-implementation. | Carried from superseded spec §3.3. |
| **Scoped exception to invariant 5** (raw error `code:` shown in the gallery UI is intentional — dev instrument). | Carried from superseded spec §1.1. |
| **Scoped a11y carve-out (NEW, R2):** the switcher control bar sits OUTSIDE the modal's `aria-modal` subtree and its `useDialogFocus` Tab-trap; it is therefore not in the dialog's screen-reader tree and not Tab-reachable while the modal is open. Navigation is by **document-level `←`/`→` keys** (work through the trap) and pointer. This is acceptable for a **build-gated, single-operator developer instrument** — the same class of tradeoff as the raw-codes carve-out. The bar still carries `aria-label`s and an `aria-live` count for the low-vision pointer user. `[R1-1, R1-21]` | This spec §2.2, §3.4. |
| **Scenario catalog, tiers, derivation core, `GalleryWriteGuard`, build gate unchanged.** Tier 3 stays materialize-only and is **not** rendered by the switcher. | `lib/dev/attentionScenarios/index.ts:12`; `components/admin/dev/GalleryWriteGuard.tsx:53`. |
| **`MaterializeCard` is untouched and lives on the dev panel page `app/admin/dev/page.tsx`, NOT on the gallery route.** The gallery route never rendered it; "KEPT" means "not modified," not "relocated." `[R1-3]` | `app/admin/dev/page.tsx` renders `MaterializeCard`; the gallery route does not import it. |
| **`ADMIN_DEV_PANEL_ENABLED` build gate unchanged.** Route stays gated via the `scripts/with-admin-dev-flag.mjs:63` FILES entry (`app/admin/dev/attention-gallery/page.tsx`). | This session verified the gate on validation. |

## 2. Approach (grounded, not assumed)

Grounding done by reading live modal + shell source (findings are DATA, per the empirical-spike mandate).

### 2.1 RSC boundary
1. **The modal is a `fixed inset-0 z-50` dialog portaled to `document.body`** (`ReviewModalShell.tsx:582`), `open`-controlled (`PublishedReviewModal.tsx:551` passes `open={!closing}`).
2. **Production already passes all data props across the Server→Client boundary** (`app/admin/_showReviewModal.tsx:406` is a Server Component rendering the client `PublishedReviewModal`). React Flight serializes `Date`/`Map`/`Set`/plain objects; **the only non-serializable props are the 8 action functions** — in production `"use server"` refs, in the gallery plain closures. This is the RSC throw that shipped a blank page last run (`onResolved` from a Server Component). **Therefore the 8 action props are owned by the Client switcher, never passed from the server page.**
3. **Serializability is PROVEN, not asserted `[R1-5, R1-6, R1-7, R1-20]`:** `Omit` + type-reuse + a source-scan can miss nested callbacks, getters, class instances, or a newly-added optional function field. The real proof is behavioral: (a) a unit test that runs **every** scenario's `data` through the Flight encoder boundary (`react-server-dom` `renderToReadableStream` round-trip, or `@vitest` equivalent) asserting no serialization throw; and (b) the e2e iterates **every** scenario asserting the modal renders non-blank (not one representative). Value-dependent failures are caught per-scenario, not by construction.

### 2.2 Portal, inert, focus trap, and aria-modal (the corrected grounding)
4. **DOM inerting is scoped to `[data-inert-root]`** (`ReviewModalShell.tsx:179`); the **admin layout is that root** (`app/admin/layout.tsx:159`). Controls left in the page body are DOM-inerted when the modal opens. Portaling to `document.body` escapes that.
5. **But escaping inert is NOT sufficient `[R1-1]`.** The dialog is `aria-modal="true"` with a `useDialogFocus` Tab-trap on the panel (`ReviewModalShell.tsx:203`). A body-sibling control is (a) excluded from the dialog's SR accessibility tree and (b) not reachable by Tab (the trap cycles focus inside the panel). **Resolution:** navigation is driven by a **document-level capture-phase `keydown`** listener (`←`/`→` step; fires regardless of where focus sits, exactly like the shell's own document Escape listener at `ReviewModalShell.tsx:238`) plus the pointer bar. The a11y-tree exclusion is accepted as the ratified §1.1 carve-out.
6. **Close is neutralized to make the compound race unreachable `[R1-2, R1-22]`.** The switcher's capture-phase listener **swallows Escape** (`preventDefault` + `stopImmediatePropagation` before the shell's document listener runs), so Escape never triggers close. The modal's X close is grounded by a plan spike on `useReviewModalClose` in the gallery route; the switcher **observes `closing` and transitions to a terminal "closed" state** (modal unmounted, a "Reopen scenario N" button shown, `←`/`→` disabled). Because no switch can occur while closed, the close→switch compound in §7 is unreachable **by construction**, not by assumption.

### 2.3 Fixture lift
7. **`baseProps()` (`tests/components/admin/showpage/publishedReviewModal.test.tsx:214`) already builds a complete valid `PublishedReviewModalProps`** using the real `buildPublishedSectionData` + `buildSectionWarningModel` and `vi.fn()` for the 8 actions. It is the lift target — promoted into a shared non-test factory that returns only the data half.

### Architecture

```
app/admin/dev/attention-gallery/page.tsx          (Server Component, gated — REWRITTEN body)
  requireDeveloper()                                first line (unchanged auth chain)
  const searchParams = await props.searchParams     Next 16 async searchParams
  const scenarios = buildSwitcherScenarios()        GallerySwitcherScenario[] (serializable data only)
  const initialId = resolveInitialScenario(searchParams?.scenario, scenarios)
  <GalleryWriteGuard/>                              (KEPT — network write containment)
  <AttentionModalSwitcher scenarios={scenarios} initialId={initialId}/>   (Client Component)

components/admin/dev/AttentionModalSwitcher.tsx     (Client Component — new)
  owns index state (functional updates), document capture keydown (←/→ + swallow Esc)
  owns the 8 inert no-op action closures (correct return shapes)
  wraps children in <ShareTokenProvider initialToken={null} initialEpoch={0}>
  renders <PublishedReviewModal key={current.id} {...current.data} {...noopActions}/>
  renders <SwitcherControls/> via createPortal(…, document.body) after mount (null pre-mount)
  terminal "closed" state on modal close (nav disabled + Reopen)

app/admin/dev/attention-gallery/buildSwitcherScenarios.ts   (Server module — new)
  reuses deriveScenarioAttention() extracted from buildBlockProps.ts
  per tier-1/tier-2 scenario → { id, tier, label, codes, data }

lib/dev/publishedModalFixture.ts                    (shared fixture factory — new)
  buildGalleryModalData(overrides) → the data props (no functions)
```

## 3. Components & responsibilities

### 3.1 `lib/dev/publishedModalFixture.ts (new)`
- `buildGalleryModalData(over?: GalleryModalOverride): GalleryModalData` — returns the data props of `PublishedReviewModalProps` (everything except the 8 functions).
- `GalleryModalData = Omit<PublishedReviewModalProps, ActionKeys>` where `ActionKeys` is a named union of the 8 function prop names. `Omit` tracks the source type (adding a data field breaks the build). **`Omit` is a compile-time convenience, NOT a serializability proof** — that is §2.1(3)'s behavioral tests. `[R1-5]`
- **No nested partials `[R1-8]`.** `over` overrides only **top-level** keys. To vary warnings, a caller passes a **complete** `data: PublishedSectionData` built by the real `buildPublishedSectionData(snapshot(warnings), …)` — never a partial `data`. The type of `over.data` is the full `PublishedSectionData`, so a partial does not typecheck. This removes the "shallow-merge replaces all of `data`" ambiguity: `data` is always whole.
- Default identity from `GALLERY_SLUG`/`GALLERY_NOW` (`buildBlockProps.ts:37`), single-sourced.
- `now` is a real `Date` (Flight-serializable); `attentionItems: []` default; `alertsDegraded: false` default; `alertId: null`; `pickerCrew: []`; `crewEmails: []`; `feed` a minimal non-null feed.

### 3.2 `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts (new)` — Server module
- `buildSwitcherScenarios(): GallerySwitcherScenario[]`, `GallerySwitcherScenario = { id: string; tier: 1|2; label: string; codes: string[]; data: GalleryModalData }`.
- **`codes` is computed server-side `[R1-13]`** from `scenario.alerts.map(a => a.code)` plus any warning codes (`scenario.warnings?.map(w => w.code)`), so `SwitcherControls` reads a field and never re-derives on the client.
- Maps `ALL_SCENARIOS.filter(s => s.tier !== 3)`. Per scenario: `const { attentionItems, dataWarnings, alertsDegraded } = deriveScenarioAttention(s)` then `buildGalleryModalData({ attentionItems, data: buildData(dataWarnings, s), alertsDegraded })`.
- **`deriveScenarioAttention(s)`** is extracted from `buildBlockProps` (the `deriveAlertRowFields → deriveAttentionItems` path, `buildBlockProps.ts:163`), shared so gallery and any future caller agree. Card-only helpers (`toGroups`, `buildReadout`) are NOT used.
- **Tier-2 faithfulness boundary (NEW, R2) — see §2.4 below.** `buildData` shapes `data` so the modal's OWN `anchorsForData` reproduces the scenario's structural intent, rather than injecting predicates the modal cannot accept.
- **Tier-1 empty-derivation is a build error `[R1-15]`:** a tier-1 alert scenario deriving zero `attentionItems` throws at build (a test asserts every tier-1 scenario yields ≥1 item). Tier-2 structural/degraded legitimately yield `[]`.
- **Warning-only visibility `[R1-14]`:** for a warning scenario, `buildData` places the warning in a section that is part of the modal's default render (Overview or a rendered section), and `codes`/nav-dot make it discoverable; the e2e asserts the warning copy is visible without extra navigation for at least the representative warning scenario.
- **Ordering:** catalog order (`index.ts:12` spread); deterministic, no sort.

### 3.3 `components/admin/dev/AttentionModalSwitcher.tsx (new)` — Client Component
- Props: `{ scenarios: GallerySwitcherScenario[]; initialId: string | null }`.
- **Empty catalog first `[R1-17]`:** `if (scenarios.length === 0) return <EmptyState/>;` returns BEFORE any `scenarios[index]` dereference.
- State: `const [index, setIndex] = useState(() => indexOfId(scenarios, initialId))` (invalid/absent id → 0). `const [closed, setClosed] = useState(false)`.
- **Functional index updates `[R1-16]`:** `const step = (d:1|-1) => setIndex(i => (i + d + scenarios.length) % scenarios.length)` — no stale-`index` collapse under rapid events.
- **The 8 no-op actions, module-const (stable identity) `[R1-18]`:**
  - `setPublished: async () => ({ ok: false, code: "GALLERY_DISPLAY_ONLY" } as const)` — a **rejection**, so the modal shows its refused path and never optimistically flips the immutable scenario's published state to a success it did not perform. (Same `code` string as `GalleryWriteGuard`.)
  - `archiveAction: async () => ({ ok: false, code: "GALLERY_DISPLAY_ONLY" } as const)`.
  - `unarchiveAction: async () => {}` — unreachable (scenarios are `archived: false`).
  - `undo/accept/acceptAll/approve/reject: async () => {}` typed via `PublishedReviewModalProps[...]`. The e2e asserts clicking Accept/Undo leaves the scenario visually unchanged (no stranded optimistic state).
- Renders `<ShareTokenProvider initialToken={null} initialEpoch={0}>` `[R1-19]` (null token → StatusStrip renders no share affordance side-effects; verified by a render test) wrapping `<PublishedReviewModal key={current.id} {...current.data} {...noopActions}/>`. **`key={current.id}` remounts on switch.**
- **Close handling `[R1-2]`:** a `useEffect` document capture-phase `keydown` listener: `←`/`→` call `step` (ignored while `closed` or focus in a text input); `Escape` → `preventDefault()` + `stopImmediatePropagation()` (swallowed). The switcher detects the modal's own close (via the plan-spiked mechanism) and `setClosed(true)`; the closed state unmounts the modal and shows Reopen.
- **Portal mount gate `[R1-10]`:** `useHasMounted()`; **pre-mount the portal renders `null`** (not inline) — a single, defined behavior; the modal itself SSRs in place then portals (unchanged shell behavior). Controls appear only post-mount, avoiding an inline→portal focus move.

### 3.4 `SwitcherControls` (sub-component, portaled)
- Content: `‹ Prev`, `Next ›`, `Scenario <n> / <total>`, current `label`, `tier` chip, `codes.join(", ")` in `font-mono` (raw-code carve-out).
- `min-h-tap-min` (44px) on both step buttons.
- `role="group" aria-label="Scenario switcher"`; the count is `aria-live="polite"`.
- **Layout invariant `[R1-12]`:** the bar is `fixed`, `z-[60]`, positioned **top-center**, height ≤ 56px, and MUST NOT overlap: the modal close button (top-right), nav rail (left), section controls, banners, or the modal footer. On mobile it respects `env(safe-area-inset-top)` and never covers modal body content (top strip only, never bottom-center). A real-browser test asserts non-overlap with the modal's `[data-testid]` header/close/footer boxes.
- No em-dashes in visible copy; apostrophes literal; canonical tokens (`text-xs`, `text-subtle`).

### 3.5 Query contract `[R1-4]`
- `page.tsx` awaits Next 16 async `searchParams`. Supported param: **`?scenario=<id>`** only — deep-links the initial scenario. `resolveInitialScenario(raw, scenarios)`: returns the id if it matches a rendered (tier-1/2) scenario; **invalid, absent, or a tier-3 id → `null`** (switcher starts at index 0). `?tier` and `?w` are **removed** (card-only). `params.ts` is trimmed to just this resolver or replaced by it; `MIN/MAX_WIDTH_PX` deleted.

### 3.6 KEPT / REMOVED
- **KEPT:** `GalleryWriteGuard.tsx`, catalog, the `deriveScenarioAttention` core of `buildBlockProps.ts`, the build gate, `trustDomains.ts:56`, `MaterializeCard` (on the dev panel, untouched).
- **REMOVED:** `ScenarioBlock.tsx`, `GalleryCard.tsx`, `buildBlockProps` card helpers (`toGroups:72`, `buildReadout:107`), the `w`/`MIN/MAX_WIDTH_PX` param.

## 2.4 Tier-2 faithfulness boundary (NEW, R2)
The card gallery injected arbitrary placement predicates into `bucketAttention` (`buildBlockProps.ts:173`). **The real modal derives its predicates from `data`** via `anchorsForData` (`lib/admin/attentionAnchorAvailability.ts:18`): the `rooms→diagrams` anchor is present iff `hasDiagramSignal(resolveCurrentDiagrams(data.diagrams))`; the `event→opening_reel` anchor iff `data.eventDetails.opening_reel` trims non-empty; and `sectionHasConsumer` gates **only** rooms/event on anchors (`PublishedReviewModal.tsx:290`) — other sections are always available. Consequences:

| Tier-2 axis | Faithful in modal? | How |
| --- | --- | --- |
| Anchor absent (rooms/event → Overview fallback) | **Yes** | `buildData` clears `data.diagrams` signal / `data.eventDetails.opening_reel`; the modal's own bucketer falls back to Overview. |
| Degraded | **Yes** | `alertsDegraded: true`. |
| Actionable / counts / tone | **Yes** | Carried on the derived `AttentionItem`. |
| Generic section-unavailable NOT tied to a rooms/event anchor | **No — descoped** | The modal's placement has no predicate for it; injecting one would fake a state the modal cannot produce. Listed in the switcher's readout as "not modal-expressible" rather than shown misplaced. |
| Crew-row-rendered nuance | **No — descoped** | Depends on rendered crew rows the modal derives itself; not reproducible by fixture data without faking. |

Descoped axes are enumerated by id in the handoff and surfaced in-UI (a one-line note in `SwitcherControls` when the current scenario is one of them), so the boundary is visible, not hidden.

## 4. Guard conditions

| Input / state | Edge | Behavior |
| --- | --- | --- |
| `scenarios` empty | filtered catalog empty | `<EmptyState/>` returned before any dereference `[R1-17]`. |
| `initialId` invalid / tier-3 / absent | | index 0 `[R1-4]`. |
| `index` wrap | prev at 0 / next at last | functional modulo wrap `[R1-16]`. |
| tier-1 derives 0 items | | build-time throw `[R1-15]`. |
| tier-2 `attentionItems: []` | structural/degraded | modal renders sections + degraded/empty attention region — the state under review. |
| warning-only scenario | | warning in a default-rendered section, visible without extra nav `[R1-14]`. |
| close / Escape | | Escape swallowed; X → terminal closed state, nav disabled `[R1-2]`. |
| resolve/ignore click | `PerShowAlertResolveButton` `fetch(POST)` | `GalleryWriteGuard` 403s it; e2e drives the REAL control `[R1-25]`. |
| mutating no-op (publish/archive/accept/undo) | | returns rejection / void; e2e asserts scenario visually unchanged `[R1-18]`. |
| rapid prev/next / held key | remount churn | exactly one dialog, admin root inert, body scroll locked — asserted in browser `[R1-11, R1-23]`. |

## 5. Risks & correctness surfaces
- **5.1 RSC blank page:** server passes only data; client owns actions; every scenario proven across Flight (§2.1(3)). Real-browser, all scenarios `[R1-20]`.
- **5.2 Action signatures:** each no-op typed via `PublishedReviewModalProps[...]`; pre-draft typecheck against strict tsconfig.
- **5.3 Focus/inert/aria-modal (§2.2):** keyboard via document listener; a11y carve-out ratified; e2e asserts `←`/`→` advance while the modal is open and focus is inside the trap `[R1-1, R1-21]`.
- **5.4 Close race (§2.2):** unreachable by construction (Escape swallowed, close terminal) `[R1-2]`.

## 6. Dimensional Invariants
The modal's internal invariants are pinned by existing modal tests. New: `SwitcherControls` is `fixed`, never in the modal's flex/grid; the layout test asserts `z-index(60) > overlay z-index(50)` and non-overlap with the modal header/close/footer `[data-testid]` boxes at desktop and a 375px-wide mobile viewport `[R1-12]`.

## 7. Transition Inventory
States: **S0** viewing scenario *i* (open); **Sc** closed (terminal).

| From → To | Trigger | Treatment |
| --- | --- | --- |
| S0(i) → S0(i±1) | prev/next or `←`/`→` | `key` remount; the shell's open animation replays. No custom cross-fade. |
| S0 rapid repeat | held key / fast click | each step an independent remount; functional `setIndex` prevents collapse; exactly one dialog after settle `[R1-11, R1-16, R1-23]`. |
| S0 → Sc | X close | shell `closing` → unmount; switcher shows Reopen; nav disabled. |
| Sc → S0 | Reopen | remount scenario *i*. |
| S0 → S0 while closing | (unreachable) | Escape swallowed; once close begins, nav is disabled → no switch. `[R1-2]` |

## 8. Meta-test inventory
- **EXTENDS/verifies (no edit expected):** `filesMembership.test.ts:152`, `build-artifact-gate.test.ts` (`attention-gallery` absent-when-flag-unset), `trustDomains.ts:56`.
- **REMOVES:** `scenarioBlock.test.tsx`, `attentionGalleryRender.test.tsx`, `tests/e2e/attention-gallery-layout.spec.ts`.
- **KEEPS:** `galleryWriteGuard.test.tsx`, `_metaAttentionItemsTopology.test.ts` (switcher path still calls `deriveAttentionItems`).
- **NEW:** `attentionModalSwitcher.test.tsx (new)`, `attentionModalGallery.serverProps.test.ts (new)` (server passes only data; Flight round-trip per scenario), `attentionModalFixture.test.ts (new)` (fixture shape + no functions), `tests/e2e/attention-modal-gallery.spec.ts (new)`.
- **No DB / advisory-lock / admin-alert / email / mutation-observability meta-tests** apply — no DB write, no schema, no mutating route/action (the no-ops write nothing; invariant 10 N/A).

## 9. Out of scope
Tier-3 materialize (unchanged), any change to `PublishedReviewModal`/`ReviewModalShell`/catalog/derivation semantics, index/stack layouts, theming.

## 10. Testing strategy
TDD per task.
- **Unit (vitest/jsdom):** fixture shape + no-function props; `deriveScenarioAttention` output derived **independently** from catalog inputs (expected codes/sections computed from the scenario, not from the helper — anti-tautology `[R1-26]`); switcher prev/next/wrap/empty/functional-update/closed-state; no-op action return shapes.
- **Flight boundary (vitest):** every scenario's `data` survives a `react-server-dom` encode round-trip `[R1-5, R1-20]`.
- **Real-browser (Playwright, `dev-build` project built WITH `ADMIN_DEV_PANEL_ENABLED=true` `[R1-27]`):**
  - Every scenario renders non-blank (iterate the full catalog, not one) `[R1-20]`.
  - `←`/`→` advance the count while the modal is open and focus is trapped inside the dialog `[R1-1, R1-21]`.
  - Rapid clicks + held-key: exactly one dialog, admin root `inert`, body scroll locked after settle `[R1-11, R1-23]`.
  - A **warning** scenario shows its warning in place; a **degraded** scenario shows the degraded banner `[R1-24]`.
  - Write containment: locate the REAL `PerShowAlertResolveButton`, click it, assert `data-gallery-blocked-write` set AND no non-GET request left via network capture `[R1-25]`.
  - Close: X → terminal closed state; Escape does nothing `[R1-2]`.
- Full suite + typecheck + eslint + format before push.

## 11. Impeccable dual-gate
UI surface. `/impeccable critique` AND `audit` on the diff before Codex whole-diff review; P0/P1 fixed or DEFERRED. Pre-code mechanical gate: em-dash ban, apostrophes, 44px tap targets, canonical tokens.

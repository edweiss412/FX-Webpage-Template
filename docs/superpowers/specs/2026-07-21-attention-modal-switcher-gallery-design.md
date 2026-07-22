# Attention Modal Switcher Gallery — Design Spec

**Date:** 2026-07-21
**Status:** APPROVED (Codex cross-model review R1-R4; R4 APPROVE, no findings)
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
3. **Serializability is PROVEN, not asserted `[R1-5, R1-6, R1-7, R1-20, R3-4]`:** `Omit` + type-reuse + a source-scan can miss nested callbacks, getters, or a newly-added optional function field. The real proof is behavioral, two-layer: (a) a **unit test that `structuredClone`s every scenario's `data`** — `structuredClone` throws `DataCloneError` on **function or symbol** values, which is precisely the blank-page defect class (a stray closure or `"use server"`-shaped value leaking into the data props). NOTE its limits: `structuredClone` does NOT throw on a class instance (it clones own-enumerable data and drops the prototype) and does not flag getters — so it is a **narrow tripwire for function/symbol leakage, not a full Flight-fidelity check**; the repo has no `react-server-dom` package, so a true Flight-encode round-trip is unavailable. (b) The **ground truth: the e2e iterates EVERY scenario** through the real build-gated route (the actual Server→Client Flight boundary) asserting each renders non-blank (not one representative). **Layer (b) is the authoritative proof**; (a) is the fast per-scenario tripwire for the specific function-leak defect. Value-dependent failures are caught per-scenario, not by construction.

### 2.2 Portal, inert, focus trap, and aria-modal (the corrected grounding)
4. **DOM inerting is scoped to `[data-inert-root]`** (`ReviewModalShell.tsx:179`); the **admin layout is that root** (`app/admin/layout.tsx:159`). Controls left in the page body are DOM-inerted when the modal opens. Portaling to `document.body` escapes that.
5. **But escaping inert is NOT sufficient `[R1-1]`.** The dialog is `aria-modal="true"` with a `useDialogFocus` Tab-trap on the panel (`ReviewModalShell.tsx:203`). A body-sibling control is (a) excluded from the dialog's SR accessibility tree and (b) not reachable by Tab (the trap cycles focus inside the panel). **Resolution:** navigation is driven by a **document-level capture-phase `keydown`** listener (`←`/`→` step; fires regardless of where focus sits) plus the pointer bar. The a11y-tree exclusion is accepted as the ratified §1.1 carve-out.
6. **Escape-swallow ordering is grounded, not assumed `[R1-2 R2-2]`.** The shell registers its Escape listener with **no options → bubble phase** (`ReviewModalShell.tsx:245`). The switcher registers its listener with **`{ capture: true }`**; the capture phase always runs before the bubble phase (independent of registration order or the shell's every-render re-subscribe). On `Escape` the switcher calls `preventDefault()` + `stopPropagation()`, halting propagation before the event reaches the shell's bubble-phase document listener — so Escape never triggers close. Deterministic by phase.
7. **Close interception + the race window are closed by a synchronous ref `[R1-2 R2-1]`.** `ReviewModalCloseContext` is **exported** (`ReviewModalShell.tsx:64`) and `PublishedReviewModal`'s `handleClose` calls `close = useReviewModalClose()` inside its transition (`PublishedReviewModal.tsx:211`). The switcher **provides that context** (`<ReviewModalCloseContext.Provider value={galleryClose}>`) — no modal change, so §9 out-of-scope holds. `galleryClose` runs **synchronously** inside `handleClose` and does two things in order: sets a plain `closingRef.current = true` (a ref, committed immediately, not a batched state update) and `setClosed(true)`. The `←`/`→` handler guards on `closingRef.current || closed`; because the ref is set in the same synchronous call stack as the X click and JS is single-threaded, no `keydown` can be processed between the click and the guard flipping — the window Codex R2-#1 describes does not exist. `committedShow` = `searchParams.get("show")` is `null` in the gallery route (`slug` is `"gallery"`), so the self-heal at `PublishedReviewModal.tsx:230` (`committedShow === slug`) never fires and the modal stays hidden → terminal by construction. `handleClose`'s trailing `router.refresh()` merely re-renders the deterministic gallery route.

### 2.3 Fixture lift
7. **`baseProps()` (`tests/components/admin/showpage/publishedReviewModal.test.tsx:214`) already builds a complete valid `PublishedReviewModalProps`** using the real `buildPublishedSectionData` + `buildSectionWarningModel` and `vi.fn()` for the 8 actions. It is the lift target — promoted into a shared non-test factory that returns only the data half.

### Architecture

```
app/admin/dev/attention-gallery/page.tsx          (Server Component, gated — REWRITTEN body)
  requireDeveloper()                                first line (unchanged auth chain)
  const searchParams = await props.searchParams     Next 16 async searchParams
  const { rendered, excluded } = partitionScenarios()   rendered + excluded {id,label}[] (serializable)
  const initialId = resolveInitialScenario(searchParams?.scenario, rendered)
  <GalleryWriteGuard/>                              (KEPT — network write containment)
  <AttentionModalSwitcher scenarios={rendered} excluded={excluded} initialId={initialId}/>   (Client)

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
- `partitionScenarios(): { rendered: GallerySwitcherScenario[]; excluded: ExcludedScenario[] }`, `GallerySwitcherScenario = { id: string; tier: 1|2; label: string; codes: string[]; data: GalleryModalData }`, `ExcludedScenario = { id: string; label: string; reason: "structural" | "cut" }`.
- **`codes` is computed server-side `[R1-13]`** from `scenario.alerts.map(a => a.code)` plus any warning codes (`scenario.warnings?.map(w => w.code)`), so `SwitcherControls` reads a field and never re-derives on the client.
- **Two exclusion axes `[R2-3 R3-3 R5-cut]` — a scenario renders only if it is both modal-EXPRESSIBLE and modal-VISIBLE:**
  - `isModalExpressible(s) = s.bucket?.sectionAvailable === undefined && s.bucket?.crewKeyRendered === undefined` — the modal derives section-availability (only rooms/event gated) and crew-row-rendered state from its own `data`, so a scenario overriding those predicates cannot be reproduced by fixture data; rendering it would MISPLACE the item. `anchorAvailable` IS reproducible (data-shaping), so it does not exclude. NON-expressible → `reason: "structural"`.
  - `isModalVisible(s) = deriveScenarioAttention(s).length > 0 || (s.warnings?.length ?? 0) > 0 || s.degraded === true || (s.alerts.length === 0 && s.holds.length === 0)` — the last clause admits the **intentional-empty baseline** (e.g. `T2_EMPTY`, which DECLARES no attention: the "clean modal, no alerts" state — a real, useful gallery entry). **Discovered during implementation:** 28 tier-1 alert scenarios DECLARE an alert whose code is in `DOUG_EXCLUDED_CODES` (info-severity system/admin codes — `EMAIL_DELIVERY_FAILED`, `WEBHOOK_TOKEN_INVALID`, `SHOW_FIRST_PUBLISHED`, etc.) that `deriveAttentionItems` cuts from the published attention surface (`lib/adminAlerts/audience.ts:34`, applied at `lib/admin/attentionItems.ts:335`). **The real published show modal ALSO cuts them** (`app/admin/_showReviewModal.tsx:306` calls `deriveAttentionItems` with the same default exclusion), so such a scenario declares attention yet yields an EMPTY modal — indistinguishable from the clean state, a non-state. The DISTINCTION `[cutaxis-4]`: a scenario is "cut" only when it **declares** attention (`alerts` or `holds` non-empty) that ALL derives to nothing; a scenario declaring NO attention is the clean baseline and renders. Per the founding "no states that don't occur" principle (superseded spec §3.3), the 28 cut scenarios are EXCLUDED with `reason: "cut"`.
- `rendered` = `ALL_SCENARIOS.filter(s => s.tier !== 3 && isModalExpressible(s) && isModalVisible(s))`; `excluded` = the other tier-1/2 scenarios, each projected to `{ id, label, reason }`. **`reason` precedence is explicit `[cutaxis-2]`:** `!isModalExpressible(s)` → `"structural"` (checked FIRST, wins even if also invisible), else `"cut"`. **Pinned by tests `[cutaxis-1,2]`:** (i) the `"structural"` set equals EXACTLY `[T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT]` (`lib/dev/attentionScenarios/tier2.ts:171`, and lines 176 / 190), AND all three are `isModalVisible === true` (so the precedence hides no real overlap — they are structural-only); (ii) the `"cut"` set equals an **exact checked-in expected id list** (a fixture pinning the current 28 cut ids), not merely a per-entry `0-derivation` check (which would silently adapt if derivation started cutting a new scenario). The server passes BOTH partitions to the switcher; the footnote reads the `excluded` prop grouped by `reason` — no client re-derivation.
- Per rendered scenario: `buildGalleryModalData` over `buildScenarioModalData(s)` (§3.1 atomic builder — correlated `data`/`bySection`/`attentionItems`).
- **`deriveScenarioAttention(s)`** is the shared extraction (`lib/dev/deriveScenarioAttention.ts`) over the `deriveAlertRowFields → deriveAttentionItems` path, so gallery and the real modal agree on which codes surface.
- **`buildData(s)` shapes `data` so the modal's OWN placement reproduces the intent** — see §2.4. For `T2_ANCHOR_ABSENT` it clears the anchor content so `anchorsForData` yields no anchor and the modal's bucketer redirects to Overview. For warning scenarios it sets `data.warnings` (feeding `bySection`). Anchored tier-1 alerts keep anchors present so they land in rooms/event.
- **Rendered-set visibility invariant `[R1-15 R2-7 R5-cut cutaxis-4]`:** every RENDERED scenario has ≥1 visible modal element by construction. To avoid a tautology (a test that merely re-calls `isModalVisible` proves nothing), the pinning test asserts against the **built modal data**: for a warnings-only rendered scenario, `buildScenarioModalData(s).bySection` has a non-empty section entry (the warning produces rendered content); for a degraded rendered scenario, `.alertsDegraded === true`; for an alert scenario, `.attentionItems.length > 0`. This replaces the earlier (false) "every tier-1 yields ≥1 item" invariant — cut tier-1 codes legitimately yield 0 and are excluded, not thrown on.
- **Warning visibility is per-scenario `[R1-14 R2-5]`:** `buildData` routes each warning to a section in the modal's default render; `codes` + nav-dot mark it. The e2e asserts, **for every warning scenario**, that the warning copy is present in the rendered modal DOM and its nav-dot section is marked; the representative case additionally asserts initial-viewport visibility. (The universal claim is DOM-presence + marked section; only the representative adds no-scroll visibility.)
- **Ordering:** catalog order (`index.ts:12` spread); deterministic, no sort.

### 3.3 `components/admin/dev/AttentionModalSwitcher.tsx (new)` — Client Component
- Props: `{ scenarios: GallerySwitcherScenario[]; excluded: ExcludedScenario[]; initialId: string | null }` (both partitions from §3.2's `partitionScenarios`; `ExcludedScenario = { id; label; reason: "structural" | "cut" }`).
- **Empty catalog first `[R1-17]`:** `if (scenarios.length === 0) return <EmptyState/>;` returns BEFORE any `scenarios[index]` dereference.
- State: `const [index, setIndex] = useState(() => indexOfId(scenarios, initialId))` (invalid/absent id → 0). `const [closed, setClosed] = useState(false)`.
- **Functional index updates `[R1-16]`:** `const step = (d:1|-1) => setIndex(i => (i + d + scenarios.length) % scenarios.length)` — no stale-`index` collapse under rapid events.
- **The 8 no-op actions, module-const (stable identity) `[R1-18 R2-4]`:**
  - `setPublished: async () => ({ ok: true } as const)` and `archiveAction: async () => ({ ok: true } as const)`. **Return `{ ok: true }`, NOT a rejection.** Grounded: `PublishedToggle` renders `{ ok: false }` with a non-catalog code as a **generic error banner** (`components/admin/PublishedToggle.tsx:111`) — a persistent "try again" UI that misrepresents the scenario (Codex R2-#4). On `{ ok: true }` it clears error state, and the toggle's checked state is **prop-driven** (the `published` prop, unchanged) — so there is no optimistic flip and no banner. `{ ok: true }` is the inert choice.
  - `unarchiveAction: async () => {}` — unreachable (scenarios are `archived: false`).
  - `undo/accept/acceptAll/approve/reject: async () => {}` typed via `PublishedReviewModalProps[...]`.
  - The e2e asserts clicking the publish toggle AND Accept/Undo leaves the scenario visually unchanged and shows **no error banner** (no stranded optimistic state, no misleading failure UI) `[R2-4]`.
- State also holds `const [closed, setClosed] = useState(false)` and a `const closingRef = useRef(false)` (the synchronous race-guard, §2.2(7)).
- Wraps the modal in **both** providers: `<ReviewModalCloseContext.Provider value={galleryClose}>` (intercepts close, §2.2(7)) inside `<ShareTokenProvider initialToken={null} initialEpoch={0}>` `[R1-19]` (null token → StatusStrip renders no share affordance side-effects; verified by a render test), wrapping `<PublishedReviewModal key={current.id} {...current.data} {...noopActions}/>`. **`key={current.id}` remounts on switch.**
  - `galleryClose = () => { closingRef.current = true; setClosed(true); }` — synchronous ref first (closes the race window), then the terminal state.
- **Close handling `[R1-2 R2-1 R2-2]`:** a `useEffect` document `keydown` listener registered with `{ capture: true }`. `←`/`→` call `step`, **guarded on `closingRef.current || closed`** and skipped when focus is in a text input. `Escape` → `preventDefault()` + `stopPropagation()` — the capture phase runs before the shell's bubble-phase Escape listener (`ReviewModalShell.tsx:245`), so close is swallowed. When the modal's X fires `handleClose`, `galleryClose` runs synchronously (via the provided context) → `closed` true → the modal stays hidden (self-heal never fires, §2.2(7)) and a "Reopen scenario N" button shows; `←`/`→` are disabled until Reopen.
- **`closed` conditionally unmounts + Reopen resets the guard `[R3-1]`:** the render is `{!closed && <ReviewModalCloseContext.Provider …><PublishedReviewModal key={current.id} …/></...>}` — `closed === true` unmounts the modal entirely (so its internal `closing` state is discarded). **Reopen** sets `closingRef.current = false` FIRST, then `setClosed(false)`; the modal remounts fresh at `key={current.id}` (a new instance, `closing=false`). Without the `closingRef` reset, `←`/`→` would stay permanently disabled — so the reset is mandatory and covered by a switcher unit test (close → reopen → arrow advances).
- **Portal mount gate `[R1-10]`:** `useHasMounted()`; **pre-mount the portal renders `null`** (not inline) — a single, defined behavior; the modal itself SSRs in place then portals (unchanged shell behavior). Controls appear only post-mount, avoiding an inline→portal focus move.

### 3.4 `SwitcherControls` (sub-component, portaled)
- Content: `‹ Prev`, `Next ›`, `Scenario <n> / <total>`, current `label`, `tier` chip, `codes.join(", ")` in `font-mono` (raw-code carve-out).
- **Excluded footnote reads the `excluded` prop, grouped by `reason` `[R3-3 R5-cut]`:** when `excluded.length > 0`, two grouped notes — `reason === "structural"` → "card-only structural probes (not modal-expressible): …"; `reason === "cut"` → "cut from the published attention surface (telemetry codes, not shown in this modal): …" (a count + the ids; may collapse the long list). No client re-derivation.
- `min-h-tap-min` (44px) on both step buttons.
- `role="group" aria-label="Scenario switcher"`; the count is `aria-live="polite"`.
- **Layout invariant `[R1-12]`:** the bar is `fixed`, `z-[60]`, positioned **top-center**, height ≤ 56px, and MUST NOT overlap: the modal close button (top-right), nav rail (left), section controls, banners, or the modal footer. On mobile it respects `env(safe-area-inset-top)` and never covers modal body content (top strip only, never bottom-center). A real-browser test asserts non-overlap with the modal's `[data-testid]` header/close/footer boxes. **Amended by `2026-07-21-gallery-switcher-slim-bar-design.md`** (ratified 2026-07-22): single non-wrapping row, ≤64px collapsed cap (exclusive of safe-area inset), footnotes behind a collapsed disclosure; the non-overlap boxes are the `[data-review-modal-panel]` panel + header + close (the published modal renders no footer).
- No em-dashes in visible copy; apostrophes literal; canonical tokens (`text-xs`, `text-subtle`).

### 3.5 Query contract `[R1-4]`
- `page.tsx` awaits Next 16 async `searchParams`. Supported param: **`?scenario=<id>`** only — deep-links the initial scenario. `resolveInitialScenario(raw: string | string[] | undefined, scenarios): string | null` `[R2-6]`: normalizes `raw` first — `undefined → null`; a `string[]` (repeated `?scenario=a&scenario=b`) → takes `raw[0]` (first wins, deterministic); then returns the id iff it matches a **rendered** scenario (tier-1/2 and modal-expressible); a non-matching, tier-3, or excluded id → `null` (switcher starts at index 0). `?tier` and `?w` are **removed** (card-only). `params.ts` is trimmed to just this resolver or replaced by it; `MIN/MAX_WIDTH_PX` deleted.

### 3.6 KEPT / REMOVED
- **KEPT:** `GalleryWriteGuard.tsx`, catalog, the `deriveScenarioAttention` core of `buildBlockProps.ts`, the build gate, `trustDomains.ts:56`, `MaterializeCard` (on the dev panel, untouched).
- **REMOVED:** `ScenarioBlock.tsx`, `GalleryCard.tsx`, `buildBlockProps` card helpers (`toGroups:72`, `buildReadout:107`), the `w`/`MIN/MAX_WIDTH_PX` param.

## 2.4 Tier-2 faithfulness boundary (NEW, R2)
The card gallery injected arbitrary placement predicates into `bucketAttention` (in the now-removed `buildBlockProps`). **The real modal derives its predicates from `data`** via `anchorsForData` (`lib/admin/attentionAnchorAvailability.ts:18`): the `rooms→diagrams` anchor is present iff `hasDiagramSignal(resolveCurrentDiagrams(data.diagrams))`; the `event→opening_reel` anchor iff `data.eventDetails.opening_reel` trims non-empty; and `sectionHasConsumer` gates **only** rooms/event on anchors (`PublishedReviewModal.tsx:290`) — other sections are always available. Consequences:

| Tier-2 axis | Faithful in modal? | How |
| --- | --- | --- |
| Anchor absent (rooms/event → Overview fallback) | **Yes** | `buildData` clears `data.diagrams` signal / `data.eventDetails.opening_reel`; the modal's own bucketer falls back to Overview. |
| Degraded | **Yes** | `alertsDegraded: true`. |
| Actionable / counts / tone | **Yes** | Carried on the derived `AttentionItem`. |
| Generic section-unavailable NOT tied to a rooms/event anchor (`T2_SECTION_ABSENT`, `T2_OVERVIEW_ABSENT`) | **No — EXCLUDED** | The modal's placement has no predicate for it; rendering the item would MISPLACE it. **Excluded from the rendered set** (§3.2 `isModalExpressible`), not shown misplaced. |
| Crew-row-rendered nuance (`T2_CREW_ROW_ABSENT`) | **No — EXCLUDED** | Depends on rendered crew rows the modal derives itself; not reproducible without faking. **Excluded from the rendered set.** |

**Excluded scenarios are not rendered at all `[R2-3]`** — `isModalExpressible` (§3.2) filters `T2_SECTION_ABSENT`, `T2_OVERVIEW_ABSENT`, `T2_CREW_ROW_ABSENT` out of the switcher (`reason: "structural"`), so no misleading item ever appears. They are enumerated in a `SwitcherControls` footnote and the handoff, and the excluded set is pinned by a test.

**Second exclusion axis — cut-from-surface `[R5-cut]`:** independently, `isModalVisible` (§3.2) excludes the 28 tier-1 alert scenarios whose codes are in `DOUG_EXCLUDED_CODES` (system/admin telemetry codes the published show modal never renders). These get `reason: "cut"` and their own footnote group (UI copy: "cut from the published attention surface; these are telemetry codes, not shown in this modal"). This is faithful, not a gap: showing a blank modal for a code the real modal also cuts would teach a state that does not occur. The two axes are orthogonal and both surfaced in the footnote, grouped by `reason`.

## 4. Guard conditions

| Input / state | Edge | Behavior |
| --- | --- | --- |
| `scenarios` empty | filtered catalog empty | `<EmptyState/>` returned before any dereference `[R1-17]`. |
| `initialId` invalid / tier-3 / absent | | index 0 `[R1-4]`. |
| `index` wrap | prev at 0 / next at last | functional modulo wrap `[R1-16]`. |
| tier-1 derives 0 items | | request-time (render) throw, enforced by a catalog unit test `[R1-15 R2-7]`. |
| tier-2 `attentionItems: []` | structural/degraded | modal renders sections + degraded/empty attention region — the state under review. |
| warning scenario | | warning routed to a default-rendered section; its copy is present in the modal DOM and its nav-dot section marked (per-scenario e2e); only the representative case asserts initial-viewport visibility `[R1-14 R2-5]`. |
| close / Escape | | Escape swallowed; X → terminal closed state, nav disabled; Reopen resets `closingRef`+`closed` `[R1-2 R3-1]`. |
| resolve/ignore click | `PerShowAlertResolveButton` `fetch(POST)` | `GalleryWriteGuard` 403s it; e2e drives the REAL control `[R1-25]`. |
| mutating no-op (publish/archive/accept/undo) | | publish/archive return `{ok:true}` (prop-driven toggle, no banner); accept/undo return void; e2e asserts scenario visually unchanged + no error banner `[R1-18 R2-4]`. |
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
| S0 → Sc | X close | `galleryClose` sets `closingRef`+`closed`; `!closed` unmounts the modal; switcher shows Reopen; nav disabled. |
| Sc → S0 | Reopen | `closingRef.current = false` then `setClosed(false)`; modal remounts fresh at `key=i` (`closing=false`); nav re-enabled `[R3-1]`. |
| S0 → S0 while closing | (unreachable) | Escape swallowed; once close begins, nav is disabled → no switch. `[R1-2]` |

## 8. Meta-test inventory
- **EXTENDS/verifies (no edit expected):** `filesMembership.test.ts:152`, `build-artifact-gate.test.ts` (`attention-gallery` absent-when-flag-unset), `trustDomains.ts:56`.
- **REMOVES:** `scenarioBlock.test.tsx`, `attentionGalleryRender.test.tsx`, `tests/e2e/attention-gallery-layout.spec.ts`.
- **KEEPS:** `galleryWriteGuard.test.tsx`, `_metaAttentionItemsTopology.test.ts` (switcher path still calls `deriveAttentionItems`).
- **NEW:** `attentionModalSwitcher.test.tsx (new)`, `attentionModalGallery.serverProps.test.ts (new)` (server passes only data; `structuredClone` per scenario; `"structural"` excluded-set pin; every `"cut"` id verified 0-items/no-warning/not-degraded; every rendered scenario visible), `attentionModalFixture.test.ts (new)` (fixture shape + no functions), `tests/e2e/attention-modal-gallery.spec.ts (new)`.
- **No DB / advisory-lock / admin-alert / email / mutation-observability meta-tests** apply — no DB write, no schema, no mutating route/action (the no-ops write nothing; invariant 10 N/A).

## 9. Out of scope
Tier-3 materialize (unchanged), any change to `PublishedReviewModal`/`ReviewModalShell`/catalog/derivation semantics, index/stack layouts, theming.

## 10. Testing strategy
TDD per task.
- **Unit (vitest/jsdom):** fixture shape + no-function props; `deriveScenarioAttention` output derived **independently** from catalog inputs (expected codes/sections computed from the scenario, not from the helper — anti-tautology `[R1-26]`); `isModalExpressible` excluded set == `{T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT}` (pins the boundary, `[R2-3]`); every **tier-1** scenario derives ≥1 item `[R1-15]`; `resolveInitialScenario` over `string | string[] | undefined` `[R2-6]`; switcher prev/next/wrap/empty/functional-update/closed-state; no-op action return shapes are `{ok:true}`/void `[R2-4]`.
- **Serializability (vitest):** `structuredClone(scenario.data)` for **every** rendered scenario throws nothing — the feasible per-scenario tripwire for **function/symbol** leakage (its limits noted in §2.1(3): it does not catch class instances or getters; the e2e is the authoritative Flight proof) `[R1-5, R1-20, R3-4]`.
- **Real-browser (Playwright, `dev-build` project built WITH `ADMIN_DEV_PANEL_ENABLED=true` `[R1-27]`):**
  - Every rendered scenario renders non-blank (iterate the full rendered set, not one) — the authoritative Flight-boundary proof `[R1-20]`.
  - `←`/`→` advance the count while the modal is open and focus is trapped inside the dialog `[R1-1, R1-21]`.
  - Rapid clicks + held-key: exactly one dialog, admin root `inert`, body scroll locked after settle `[R1-11, R1-23]`.
  - **Every warning** scenario: its warning copy is present in the rendered modal DOM and its nav-dot section is marked; the representative warning additionally asserts initial-viewport visibility `[R1-14, R2-5]`. A **degraded** scenario shows the degraded banner `[R1-24]`.
  - **No-op inertness `[R2-4]`:** click the publish toggle → no error banner, `published` visual state unchanged; click Accept/Undo → scenario visually unchanged.
  - Write containment: locate the REAL `PerShowAlertResolveButton`, click it, assert `data-gallery-blocked-write` set AND no non-GET request left via network capture `[R1-25]`.
  - Close: X → terminal closed state + Reopen; Escape does nothing (swallowed, `[R2-2]`).
- Full suite + typecheck + eslint + format before push.

## 11. Impeccable dual-gate
UI surface. `/impeccable critique` AND `audit` on the diff before Codex whole-diff review; P0/P1 fixed or DEFERRED. Pre-code mechanical gate: em-dash ban, apostrophes, 44px tap targets, canonical tokens.

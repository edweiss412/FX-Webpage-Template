# HoverHelp smart positioning — portal + collision-aware placement

**Date:** 2026-07-22 (round 3 — pure-function positioning core + corrected coordinate formulas after Codex round-2 BLOCKING; round-2 redesigned §4/§6 to the host-portal model)
**Status:** Draft for adversarial review R3
**Closes:** `BL-HOVERHELP-PORTAL` (BACKLOG.md:29), `WARNCARD-POPOVER-OVERLAP-1` (DEFERRED.md:23)
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-22, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

`HoverHelp` (components/admin/HoverHelp.tsx) positions its popover body absolutely IN FLOW below the trigger (`top-[calc(100%+6px)]`, HoverHelp.tsx:249). Two consequences:

1. **Overlap** — on compact alert cards the `?` trigger sits at the message row's end (CompactAlertCard.tsx:112); the popover opens downward over the card's own guidance band — the very text it contextualizes (`WARNCARD-POPOVER-OVERLAP-1`).
2. **Clipping** — inside a scrolling surface the popover is visually clipped by ancestors. Concrete case: attention cards live in the review modal's `overflow-y-auto` pane (ShowReviewSurface.tsx:979) nested in an `overflow-clip` panel (ReviewModalShell.tsx:618); a popover opened near the pane's bottom is cut off, and `getBoundingClientRect()` does not reveal it (`BL-HOVERHELP-PORTAL`).

Goal: an OPEN popover is always fully inside the visible bounds of its positioning host — flipping vertically away from insufficient space, shrinking when neither side fits, and escaping clipping ancestors — with the interaction/a11y regressions enumerated and dispositioned (§4.4-§4.5), not hand-waved to zero.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | Fix ALL 9 consumers by changing shared `HoverHelp`, not a compact-card-local variant | User choice, brainstorming 2026-07-22 ("Fix all 9 consumers") |
| R2 | Mechanism: React portal + JS measurement. NO positioning library (none in deps — verified `package.json` has no floating-ui/popper/radix); CSS anchor positioning REJECTED (needs a heavy polyfill for non-Chromium) | User-approved design, brainstorming 2026-07-22 |
| R3 | This spec SUPERSEDES two ratified postures of `2026-07-20-show-alert-compact`: the §"Spatial note, corrected" overlap acceptance ("CAN paint over the detail, footer, or controls bands… intended tooltip behavior") and amendment A6's descope of placement policy. A6 rejected an **unmeasured prose geometry rule**; this spec replaces it with a **probe-backed, real-browser-tested** policy, which is exactly the escape hatch A6's rationale prescribed ("a spike") | show-alert-compact spec A6 + AGENTS.md spike-before-spec rule; probe transcript §3 |
| R4 | Scenario C (popover open via hover, focus outside the component, Escape) closes BOTH popover and host modal today and continues to after this change. Out of scope. Probe §3 confirmed the portal does not alter this path | Probe transcript §3, scenario C |
| R5 | `placement` prop becomes a PREFERRED-side hint (auto-flip may override); its only writer today is Step2Verify.tsx:638 (`placement="top"`), preserved as the preferred side there | User-approved design |
| R6 | The popover body stays MOUNTED at all times once the client has mounted (display toggled), exactly as today — the portal is not conditionally created per-open. Pre-hydration the body is absent (mounted-gate, §4.1); this narrows the M12.5 "body always in DOM" SR contract to "always in DOM once interactive", which is the same window in which the popover can be opened at all | §4.1; precedent ReviewModalShell.tsx:710 |
| R7 | Dev-only `SwitcherControls` (`fixed top-0 z-60`, DEFERRED.md:11-15) may still paint above the portaled popover. Accepted: build-gated dev instrument | DEFERRED.md ATTN-GALLERY-CONTROLBAR-OVERLAP-1 posture |
| R8 | **Pinch-zoom / visual-viewport posture (R1 F2):** positioning is computed against the LAYOUT viewport (and the host rect). Under pinch zoom the popover may sit partly outside the VISUAL viewport; the user pans, exactly as for every other layout-viewport-positioned element in the app. This is byte-identical to the shipped absolute-positioning behavior — the portal neither improves nor regresses it. `visualViewport`-aware positioning is filed as `BL-HOVERHELP-VISUAL-VIEWPORT` (§7) | This spec, R2 round |
| R9 | **Transient host-transform posture:** during ReviewModalShell's drag/dismiss/spring-back transitions the panel carries an inline transform (ReviewModalShell.tsx:363-375); at rest it is cleared (`panel.style.transform = ""`, :294). A popover open DURING such a transition may be offset until the next reposition frame after settle. Accepted: the popover's own open state rarely survives a drag (pointer is on the panel), and the error self-corrects at rest | This spec, R2 round |

## §2 Current state (all citations verified against worktree @ 3ad629108)

- Component: `components/admin/HoverHelp.tsx`. Body div classes at :248-252: `absolute z-50 w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto …`; vertical side `placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"` (:249); horizontal `align === "right" ? "right-0" : "left-0"` (:252); closed state `pointer-events-none hidden opacity-0` (:251) — `hidden` (display:none) is the BELL-HELP-POPOVER-OVERFLOW-1 scrollWidth fix (comment :229-237).
- Props: `align = "left"` (:62), `placement = "bottom"` (:63), `compactTrigger` (:67), `learnMore` (:103), `testId`/`rootTestId` (:64-65).
- Interaction contract: mouse-only hover open/close (`e.pointerType === "mouse"`, :167-172), click toggle (:183-186), shared 120ms close timer (`CLOSE_DELAY_MS`, :56), window-level Escape-closes-popover effect (:127-137), Escape CONTAINMENT via `onRootKeyDown` `stopPropagation` on the root div (:156-162) against `ReviewModalShell`'s unconditional document-level listener (ReviewModalShell.tsx:245).
- Focus trap: `lib/a11y/dialogFocus.ts` — `focusableDescendants` enumerates `container.querySelectorAll(FOCUSABLE_SELECTOR)` (:35-39), Tab wrap intercepts only at first/last (:66-72), listener attached ON the panel (:75). A node outside the panel subtree is invisible to the trap AND unreachable mid-trap (Tab from `last` wraps to `first`, so document-order successors of the panel are never reached).
- Consumers (9 files, verified `grep -rln '<HoverHelp' app components`): `app/admin/settings/page.tsx`, `app/admin/needs-attention/page.tsx`, `components/admin/RecentAutoAppliedStrip.tsx`, `components/admin/Dashboard.tsx`, `components/admin/ShowsTable.tsx`, `components/admin/compactAlertHelp.tsx`, `components/admin/settings/DriveConnectionPanel.tsx`, `components/admin/wizard/Step2Verify.tsx`, `components/admin/settings/AdministratorsSection.tsx`.
- Existing tests: `tests/components/admin/HoverHelp.test.tsx` (12 tests; MOSTLY `screen.*` document-scoped, EXCEPT the root contract test which scopes the body through `within(root)` at :140-142 — updated by T2), `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (:70-97), `tests/components/admin/hoverHelpCompactTrigger.test.tsx`; consumer suites using `within(...)` scoping (R1 F4 sweep, all verified to contain `within(`): `Dashboard.test.tsx`, `ShowsTable.test.tsx`, `RecentAutoAppliedStrip.test.tsx`, `tests/components/admin/settings/AdministratorsSection.test.tsx`, `tests/components/admin/settings/DriveConnectionPanel.test.tsx`, `tests/app/admin/settingsHeader.test.tsx`, `tests/app/admin/needsAttentionPage.test.tsx`; e2e `tests/e2e/compact-alert-card-layout.spec.ts`, `tests/e2e/deep-link-walker.spec.ts` (HoverHelp arm :182-199, clicks the trigger then finds the nested link), `tests/e2e/bell-panel-layout.spec.ts` (:895-896 — comment recording the display:none fix), document-scrollWidth pin pattern at `tests/e2e/admin-nav-layout-dimensions.spec.ts:118`.
- Portal precedent: `ReviewModalShell.tsx:710` (`mounted ? createPortal(tree, document.body) : tree`), also `HelpSheet.tsx:80`, `FinalizeButton.tsx:741`, `WizardFooter.tsx:62`.
- Panel transform lifecycle: inline transform set during drag/spring-back (ReviewModalShell.tsx:363-375), cleared at rest (:294).

## §3 Empirical probe — portal Escape topology (ran 2026-07-22, pre-spec)

Per AGENTS.md "empirical spike before speccing stateful/race/framework surfaces". Probe harness: React 19.2.4 + react-dom 19.2.4 (repo versions), esbuild 0.28.0 bundle, served over localhost, driven by real Playwright keypresses. Setup replicated the shipped Escape topology: a native `document`-level bubble-phase Escape listener (mirroring ReviewModalShell.tsx:245), a native `window`-level Escape listener (mirroring HoverHelp.tsx:135), and a component whose root div carries React `onKeyDown` calling `stopPropagation` (mirroring HoverHelp.tsx:156-162), rendered twice — body in-flow vs `createPortal(body, document.body)`.

Results (event log per scenario, real `Escape` keypress):

| Scenario | Focus | In-flow result | Portal result |
|---|---|---|---|
| A | trigger button | `react-onRootKeyDown → stopPropagation` only; document listener SILENT | identical |
| B | link inside popover body | `react-onRootKeyDown → stopPropagation` only; document listener SILENT | **identical — containment PRESERVED** |
| C | document.body (hover-open analog) | `document-native` fires (modal closes) then `window-native` (popover closes) | identical |

**Mechanism (why B-portal holds):** React 19 attaches its delegated listeners to each portal CONTAINER at portal mount. The container (`document.body`) precedes `document` in the native bubble path, so the synthetic dispatch — which follows the REACT tree and therefore reaches the component's root-div `onKeyDown` — runs first, and its `stopPropagation` (applied to the native event) stops propagation before `ReviewModalShell`'s `document`-level listener.

**Applicability to the §4.1 host model (R2):** in the final design the in-modal portal container is the modal PANEL, not `document.body`. The probe's conclusion carries a fortiori: the panel is strictly deeper in the bubble path than `document.body`, so React's portal-container delegation runs even earlier relative to the `document` listener. The body-host case (non-modal pages) matches the probe literally; those pages have no competing document-level Escape closer at all. The probe deliberately did NOT model the focus trap or inert topology — R1 F3 correctly caught that a body-portal breaks them; the §4.1 host model resolves it structurally (the popover stays a panel DESCENDANT), rather than by extending the probe.

**Fragility note:** containment would break against a CAPTURE-phase `document` listener — equally true of the shipped in-flow topology (capture at `document` runs before any bubble-phase delegation); no new fragility class. Structural pin: §6 T1.

## §4 Design

### §4.1 Portal host model (resolves R1 F3)

New module-level React context in HoverHelp.tsx:

```tsx
export const PopoverHostContext = createContext<RefObject<HTMLElement | null> | null>(null);
```

- Provider sites — the complete set of dialogs whose subtree can reach a HoverHelp instance (swept: `ShowReviewSurface` is the only HoverHelp-bearing subtree mounted inside any `role="dialog"`, and exactly two dialogs mount it): `ReviewModalShell` (panel div :618, used by `PublishedReviewModal` and `app/admin/_showReviewModal.tsx`) and `Step3ReviewModal` (its OWN dialog implementation — sheet constants copied from the shell, not composed — rendering `<ShowReviewSurface>` at Step3ReviewModal.tsx:609). Each wraps its children in `<PopoverHostContext.Provider value={panelRef}>` from the panel ref it already holds. Any future dialog that hosts HoverHelp instances does the same; the §6 T1 fixture pins the mechanism, and the plan's class-sweep re-runs the `role="dialog"` × HoverHelp-subtree cross-grep at implementation time.
- `HoverHelp` resolves its portal container: `hostRef?.current ?? document.body`, behind the repo's mounted-gate pattern (ReviewModalShell.tsx:710): `mounted` flips true in a `useEffect`; before that the body renders nothing (server + first client render identical — no hydration mismatch). After mount the portal exists for the component's lifetime; open/close toggles display exactly as today (`hidden` ↔ `block`, preserving the scrollWidth fix and the fade). The body is never reparented while open (no focus-drop, ReviewModalShell.tsx:209 class); host resolution is read once at portal creation.

Why in-panel (not body) for modal-hosted instances — each is a hard requirement, not a preference:
1. **Focus trap** (dialogFocus.ts:35-39, :58): the popover body — including the `learnMore` link — remains a `querySelectorAll` descendant of the panel, so Tab enumeration, wrap-around, and the `offsetParent !== null` visibility filter all keep working with ZERO trap changes. (A body-portal makes the link keyboard-unreachable mid-trap: Tab from `last` wraps to `first`, R1 F3.)
2. **aria-modal subtree:** the popover stays inside the `role="dialog"` element — SRs that honor aria-modal keep announcing it.
3. **Dismiss-time inert:** whatever subtree the shell inerts, the popover is inside it.
4. **Clipping still solved:** the popover's DOM parent is the PANEL — outside the `overflow-y-auto` scroll pane (ShowReviewSurface.tsx:979) whose clipping motivated `BL-HOVERHELP-PORTAL`. The panel's own `overflow-clip` (:618) does clip at panel bounds, which is correct: a modal's popover belongs visually inside the modal, and the §4.2 algorithm positions within the host's bounds by construction.

Non-modal consumers (dashboard, settings, needs-attention, wizard, shows table — no context provider) portal to `document.body`.

### §4.2 Positioning core — a pure function (resolves R1 F1; restructured after R2 F1/F2/F3)

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
**Structural defense (AGENTS.md same-vector calibration):** rounds 1 and 2 both found ordering/state defects in prose math, so the math leaves prose. All placement algebra lives in ONE exported pure function in `lib/popover/position.ts`:

```ts
export type PopoverPlacementInput = {
  trigger: Rect;            // trigger button rect, viewport coords
  naturalSize: { width: number; height: number };   // body measured with NO inline constraints
  wrappedHeightAt: (width: number) => number;       // re-measure hook: body height at a forced width
  bounds: Rect;             // B = intersect(hostRect, viewportRect) inset by VIEWPORT_INSET
  preferredSide: "top" | "bottom";
  align: "left" | "right";
};
export type PopoverPlacement =
  | { kind: "hidden" }      // anchor-gone
  | { kind: "placed"; side: "top" | "bottom"; viewport: { x: number; y: number };
      maxHeight: number | null; maxWidth: number | null };
```

Evaluation order INSIDE the function (each step consumes the previous step's outputs — the R2 F1 class is structurally impossible to reintroduce without editing this one function):
1. **Anchor-gone:** `trigger` does not intersect `bounds` → `{ kind: "hidden" }`.
2. **Width first:** `maxWidth = naturalSize.width > bounds.width ? bounds.width : null`; `effectiveWidth = min(naturalSize.width, bounds.width)`; `height0 = maxWidth === null ? naturalSize.height : wrappedHeightAt(effectiveWidth)` — width shrink re-measures height BEFORE any vertical decision (R2 F1).
3. **Vertical:** `spaceBelow = bounds.bottom − trigger.bottom − GAP`; `spaceAbove = trigger.top − bounds.top − GAP`. Side = preferred if `height0 ≤ space(preferred)`, else other if `height0 ≤ space(other)`, else the larger-space side with `maxHeight = space(chosen)`. `effectiveHeight = min(height0, space(chosen))`. `y = trigger.bottom + GAP` (bottom) or `trigger.top − GAP − effectiveHeight` (top).
4. **Horizontal:** `x = align === "right" ? trigger.right − effectiveWidth : trigger.left`; clamp `x` into `[bounds.left, bounds.right − effectiveWidth]`.

The COMPONENT is a thin shell around this function. Per reposition pass it: (a) clears BOTH previously applied inline `maxHeight` AND `maxWidth` (R2 F2 — no constraint survives into the next measurement), (b) measures `trigger`/body rects and `bounds`, (c) calls the function (`wrappedHeightAt` = apply the width inline, read `scrollHeight`-based height, restore), (d) converts the viewport point to host offsets and writes inline styles.

**Host coordinate conversion (corrected per R2 F3 — two exact formulas, no shared approximation):**
- **Panel host** (containing block = the panel, which is `position: relative`, ReviewModalShell.tsx:618; absolute offsets resolve from the containing block's PADDING box): `left = vx − hostRect.left − host.clientLeft`, `top = vy − hostRect.top − host.clientTop` (clientLeft/Top = border widths; the panel does not scroll — its inner pane does — so no scroll term exists to get wrong).
- **Body host** (body is `position: static` under Tailwind preflight, so the containing block is the INITIAL CONTAINING BLOCK, not the body box): `left = vx + window.scrollX`, `top = vy + window.scrollY`. The body's own margins/offsets are irrelevant because the ICB, not the body, resolves the offsets. A unit assertion pins the precondition (`getComputedStyle(document.body).position === "static"`); T6's functional probe pins the formula end-to-end in a real browser.

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
Constants (single source `lib/popover/position.ts`, exported): `GAP = 6` (today's `+6px`), `VIEWPORT_INSET = 8`. `bounds` construction: `intersect(hostRect, (0,0,innerWidth,innerHeight))` inset by `VIEWPORT_INSET` on all four sides (layout viewport per R8).

**Vertical bounds invariant:** for fits-cases `y ≥ bounds.top` and `y + effectiveHeight ≤ bounds.bottom` hold by construction; for the shrink case `effectiveHeight = space(chosen)` exactly fills trigger-edge→bounds-edge. Pinned by T-PURE's exhaustive table and T3b.

### §4.3 Reposition lifecycle (resolves R1 F6)

Reposition runs:
- (a) `useLayoutEffect` when `open` flips true — this path measures and writes SYNCHRONOUSLY inside the layout effect (NOT via `schedule()`): layout effects run before paint, so the body never paints at stale/default coordinates (R2 F4). Every OTHER trigger below goes through `schedule()`;
- (b) `scroll` via `window.addEventListener("scroll", schedule, { capture: true, passive: true })` — capture catches non-bubbling ancestor-container scrolls (the ShowReviewSurface pane);
- (c) `resize` on `window`;
- (d) a `ResizeObserver` on the trigger button, the body, AND the positioning HOST element (panel resize — e.g. viewport-class change re-sizing the modal — changes `bounds` without any window resize or scroll; R2 F5).

All four call a single `schedule()` that coalesces through `requestAnimationFrame` (≤1 measurement per frame). Lifecycle contract: `schedule()` is a no-op while `open === false`; the rAF id is stored and **cancelled** on close, on unmount, and before scheduling anew; listeners (b)(c) and observer (d) attach when `open` flips true and detach on close/unmount. Therefore no measurement of a `display:none` body, no stale write after close, no null-ref race after unmount (R1 F6). Residual (declared, not silent): a pure TRANSLATION of the trigger without any scroll/resize/size-change (e.g. an ancestor's margin animating) is not observed until the next frame in which any of (b)(c)(d) fires — same approximation floating-ui's `autoUpdate` defaults make (`layoutShift` observation off).

### §4.4 What changes and what does not

Unchanged: trigger markup/tap targets (44px floors, `compactTrigger` 22px box), hover/click/Escape machinery, `CLOSE_DELAY_MS`, learnMore semantics, testids (`<testId>-trigger`/`<testId>-body`, `rootTestId`), all body classes except positioning (`absolute z-50` retained; the two `calc` side classes and `right-0`/`left-0` are replaced by inline coords), z-order inside the panel (popover portals to panel END — after every band, paints above siblings at equal z).

Changed, enumerated (R1 F4 + F9 — each with disposition):

| Observable | Change | Disposition |
|---|---|---|
| Body's DOM location | child of panel (modal) / body (elsewhere), no longer a descendant of the root wrapper | Tests that scope body queries under the wrapper are updated (§6 T2 blast-radius list); `screen.*` queries unaffected |
| `rootTestId` subtree contract | body/link no longer under `[data-testid=rootTestId]` | deep-link-walker HoverHelp arm (:182-199) updated to find the link by `aria-controls`/body testid at document scope after clicking the trigger |
| Native DOM bubbling from body | no longer traverses consumer ancestors | Swept: no consumer attaches native/React listeners on a HoverHelp WRAPPER expecting popover events (verified by grep over the 9 consumers for handlers on the element containing `<HoverHelp`) — none exists; React-tree bubbling (which consumers could observe via React handlers) is preserved by portals by design |
| Ancestor CSS hover-state/descendant selectors | popover no longer inside consumer subtrees | Repo styling is utility-class Tailwind; the only ancestor-state dependency is `group-hover` INSIDE the trigger skin (compactAlertHelp.tsx:137), which targets the trigger, not the body. No stylesheet selector reaches `hover-help`-body through a consumer subtree (grep: no descendant selectors naming it) |
| Inherited styles / `dir` | body inherits from panel/body element, not the card | Popover already carries its own full text/color classes (:248); admin surface is LTR-only. Accepted |
| Print | an open popover prints at its absolute host offset instead of in-flow | Accepted — matches every other portaled overlay in the app (HelpSheet, modals) |
| Tab order on NON-modal pages | body sits at document end instead of adjacent to the trigger | Resolved by the §4.5 Tab bridge |
| `outerHTML` snapshots containing a card subtree | popover body vanishes from the snapshot | `tests/components/admin/stagedCardBaseline.test.tsx:58` snapshot regenerates in the same commit, reviewed for exactly-the-body delta |

### §4.5 Keyboard reachability on body-host pages (completes R1 F3)

In-panel portals need nothing (trap enumerates the link naturally, §4.1). Body-host portals restore adjacency with a local Tab bridge, active only when `host === document.body`, `open`, and `learnMore` is set:

- Tab (no shift) while focus is on the TRIGGER → `preventDefault`, `clearCloseTimer()` (a pending hover-close 120ms timer must not hide the newly focused link — R2 F6), focus the Learn-more link.
- Tab (no shift) while focus is on the LINK → `preventDefault`, close the popover, restore focus to the trigger (the user is done with the popover; the next Tab proceeds naturally from the trigger — no loop, the popover is now closed).
- Shift+Tab while focus is on the LINK → `preventDefault`, focus the trigger (popover stays open).
- Additionally, `focusin` on the body clears the close timer (focus arriving by ANY route keeps the popover open), symmetric with the existing pointerenter behavior.
- All other keys/targets: untouched.

This preserves today's semantic ("the link is reachable via Tab when the popover is open", HoverHelp.tsx:36-37) without global focus-order surgery. Bodies without `learnMore` contain nothing focusable — no bridge needed.

### §4.6 Transition inventory

States: `closed`, `open@bottom`, `open@top`, `open+anchor-hidden` (§4.2 step 2). Pairs and compounds:

| Transition | Treatment |
|---|---|
| closed → open (either side) | position set pre-paint (useLayoutEffect), then the shipped fade (`starting:opacity-0`, `duration-fast`) |
| open → closed | shipped `transition-[opacity,display]` discrete hide — unchanged; pending rAF cancelled (§4.3) |
| open@bottom ↔ open@top (flip mid-open) | INSTANT jump — a tooltip tracking its anchor must not tween; deliberate |
| open ↔ anchor-hidden | `visibility` toggle, instant, open-state untouched |
| open + anchor scrolls (no flip) | instant per-frame tracking (rAF), no animation |
| close/unmount while a reposition frame is pending | rAF cancelled; no write occurs (§4.3) |
| close during fade-in / reopen during fade-out | shipped discrete-transition behavior, unchanged |

### §4.7 Dimensional Invariants

| Invariant | Guarantee | Asserted by |
|---|---|---|
| body width target 18rem, ≤ 80vw | `w-72 max-w-[80vw]` classes (unchanged :248) | T3d (equality, cap engaged) |
| body height ≤ min(60vh, 24rem) | class cap (unchanged); inline `maxHeight` only ever smaller (§4.2 step 4) | T3d |
| trigger↔body gap = 6px on the chosen side (fits-cases) | `GAP` in the §4.2 core | T-PURE numeric pin + T3a/T3b (±0.5px) |
| open body entirely inside `B` (host∩viewport, 8px inset) | side-selection + shrink + horizontal clamp (§4.2) | T3b/T3c/T4 |
| anchor outside `B` → body not visible | §4.2 step 2 | T3e |

### §4.8 Guard conditions

| Input/state | Behavior |
|---|---|
| `placement` absent | preferred side `bottom` (shipped default, :63) |
| pre-mounted (SSR/hydration window) | body not rendered; open impossible (needs JS) |
| trigger rect zero-size but intersecting `B` | degenerate anchor; math well-defined (gap from the zero-size edges) |
| trigger rect outside `B` | body `visibility: hidden` (§4.2 step 2) |
| neither side fits | larger side + inline `maxHeight` shrink (§4.2 step 4) |
| panel narrower than body | inline `maxWidth = B.width` + re-clamp (§4.2 step 5) |
| host unmounts while popover open (modal closing) | popover unmounts with it (same React tree); rAF/listeners cleaned (§4.3) |
| reduced motion | fade is opacity-only + `duration-fast`; unchanged |
| jsdom (unit tests) | zero rects throughout → algorithm runs but asserts nothing geometric; unit tests cover NON-geometric contracts only (§6); all geometry is real-browser |

### §4.9 Flag lifecycle — `placement`

| Field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `placement?: "top" \| "bottom"` | prop | Step2Verify.tsx:638 (only writer; all other consumers omit) | §4.2 step 4 preferred side | preferred vertical side; auto-flip/shrink may override when it does not fit |

Not a zombie: read path and effect both live.

## §5 Out of scope

- Scenario-C dual-close semantics (R4).
- Horizontal auto-flip (align is a fixed anchor + clamp; no consumer needs edge-flip and clamping suffices).
- `visualViewport`/pinch-zoom-aware positioning (R8; `BL-HOVERHELP-VISUAL-VIEWPORT`).
- Portaling `HelpTooltip` (the `<details>`-based in-flow disclosures) or any other popover component.
- The dev gallery z-60 overlay (R7).

## §6 Test plan

**Meta-test inventory (AGENTS.md writing-plans rule):** no NEW registry meta-test. EXTENDED: `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (T1) becomes the structural pin for portal topology. Declared inapplicable: Supabase call-boundary, advisory-lock, admin-alert catalog, sentinel-hiding, mutation-surface registries — pure client presentation change, no DB/auth/catalog/mutation surface.

Anti-tautology: every geometry expectation below derives from measured trigger/host rects and the exported `GAP`/`VIEWPORT_INSET` constants — no hardcoded pixel coordinates. `getBoundingClientRect` alone is BANNED as a visibility proof (BACKLOG.md:33); true-visibility = `document.elementFromPoint` probes.

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
- **T-PURE (unit — the positioning core, NEW `tests/lib/popover/position.test.ts`):** exhaustive decision-table over `computePopoverPlacement`: fits-below / fits-above-only / neither-side (shrink engaged, maxHeight === larger space) / anchor-gone / narrow-bounds width shrink WITH `wrappedHeightAt` returning a LARGER height that flips the vertical decision (the R2 F1 composite, pinned forever) / align-left+right at both bounds edges / clamp saturation / zero-size trigger. Pure algebra — no DOM. Also the independent numeric pins (R2 F9): `expect(GAP).toBe(6)` and `expect(VIEWPORT_INSET).toBe(8)` as spec-literal assertions, so geometry tests may then use the exported constants without the two-sided-drift tautology.
- **T1 (unit — portal topology pins, extends the shipped containment suite):** inside a ReviewModalShell-topology fixture (panel + document-level Escape listener + PopoverHostContext): (i) Escape with focus on the trigger → popover closes, modal listener silent; (ii) Escape with focus on the portaled Learn-more link (event ORIGINATES inside the portal) → same; (iii) Escape with popover closed → modal listener fires; plus the STRUCTURAL pins (R2 F7): (iv) body node satisfies `panel.contains(body)` (trap enumeration + aria-modal subtree both reduce to descendant-ness of the `role="dialog"` element); (v) with NO provider, body's parent is `document.body`. Dismiss-time inert coverage lives in T4b (real browser — jsdom's `inert` support is unreliable).
- **T2 (unit — full jsdom blast radius, R1 F4 + R2 F8):** `HoverHelp.test.tsx` (12 — including rewriting the `within(root)` body assertions at :140-142 to document scope + an explicit portal-location assertion), `hoverHelpCompactTrigger.test.tsx`, the seven `within(`-scoping consumer suites (§2 list), and `stagedCardBaseline.test.tsx` (outerHTML snapshot regenerated; review confirms the only delta is the body's departure). Re-assert: `aria-describedby` target EXISTS in `document` after mount (R6); closed body carries `hidden`; `getComputedStyle(document.body).position === "static"` precondition pin (§4.2).
- **T3 (e2e, real browser — geometry, standalone harness):** fixture grid at controlled offsets in (a) body-host page and (b) panel-host (real ReviewModalShell). Each case asserts via measured rects + the T-PURE-pinned constants:
  - **T3a fits-below:** body top = trigger bottom + GAP (±0.5px).
  - **T3b flip-up + bounds:** `spaceBelow < height ≤ spaceAbove` fixture → body bottom = trigger top − GAP (±0.5px) AND body rect ⊆ B on all four edges.
  - **T3c neither-side shrink:** centered trigger + tall content → body ⊆ B, inline maxHeight === larger space (±0.5px), `scrollHeight > clientHeight` (overflow genuinely engaged).
  - **T3d caps ENGAGED, both directions (R2 F10):** overflow-length content fixture → rendered width === 18rem exactly (w-72 engaged, lower bound) and ≤ 80vw; rendered height === min(60vh, 24rem) exactly at both 390px and 1280px (cap engaged). A missing cap class fails the equality; a missing w-72 fails the lower bound.
  - **T3e anchor-gone:** trigger scrolled out → `visibility: hidden`; back → visible, open state preserved.
  - **T3f placement="top"** honored when it fits; flips down pinned to top edge.
  - **T3g narrow-host width shrink (R2 F1 integration):** panel-host fixture narrower than 18rem → maxWidth applied, content wraps, body still ⊆ B on all edges.
- **T4 (e2e — clipping kill-shot + inert, real modal):** (a) scroll an attention card to the pane's bottom edge, open popover: `document.elementFromPoint` at body center + four inset corners returns the body or a descendant (true visibility through BOTH clipping ancestors; `getBoundingClientRect` banned as proof, BACKLOG.md:33). (b) **dismiss-time inert (R2 F7):** start the modal dismiss; assert the body is inside the inerted subtree (`body.closest('[inert]') !== null`) whenever the panel is.
- **T5 (e2e — overlap kill-shot):** compact warning card positioned so the flip engages: popover rect does NOT intersect the card's guidance-band rect (both measured live).
- **T6 (e2e — scrollWidth + coordinate probes):** closed popovers on /admin at 390px/1280px: `document.documentElement.scrollWidth === clientWidth` (pattern admin-nav-layout-dimensions.spec.ts:118); one OPEN popover at 390px still no horizontal document scroll. Functional coordinate probes for BOTH host formulas (§4.2): place a probe node via each formula at a target viewport point, assert its viewport rect lands there (±0.5px) — including with a nonzero window scroll for the body-host formula.
- **T7 (e2e + unit — reposition lifecycle):** e2e: (i) pane scroll → offset from trigger preserved (±1px) next frame; (ii) window resize while open → repositioned; (iii) body content growth (harness knob) → ResizeObserver reposition; (iv) HOST resize (harness shrinks the panel width — R2 F5) → re-bounded, body ⊆ new B, AND a previously applied maxWidth is CLEARED when the host re-expands (R2 F2 restoration). Unit (jsdom, mocked rAF — R2 F11): close with a frame pending → `cancelAnimationFrame` called with the stored id and no style write occurs; unmount with a frame pending → same, no error.
- **T8 (e2e — keyboard reachability):** body-host page with learnMore: Tab from trigger reaches the link (with a STAGED pending close timer: hover-open, pointer leaves — starting the 120ms timer — then Tab within the window; wait past CLOSE_DELAY_MS; link still visible — R2 F6); Tab from link closes popover, focus returns to trigger; Shift+Tab from link → trigger, popover open. Panel-host: Tab cycles the modal's focusables INCLUDING the link; trap wrap (first↔last) still functions. deep-link-walker green with its updated HoverHelp arm.
- **T9 (full suites):** entire unit + e2e suites green across all 9 consumers; typecheck; eslint; format:check (pre-push gates).

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
**CI wiring (R2 F12 — enumerated, not nominal):** new standalone spec `tests/e2e/hoverhelp-geometry.spec.ts` (+ entry `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`) added to the `tests/e2e/standalone.config.ts` explicit `testMatch` allow-list (:29-35 — absent = DARK) AND a dedicated workflow `.github/workflows/hoverhelp-geometry-e2e.yml` patterned on `attention-anchor-e2e.yml`, with `workflow_dispatch:` enabled and `paths:` covering AT MINIMUM: the spec file, the entry file, `components/admin/HoverHelp.tsx`, `lib/popover/position.ts`, `components/admin/review/ReviewModalShell.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/compactAlertHelp.tsx`, `tests/e2e/standalone.config.ts`, `app/globals.css`, and the workflow file itself; invocation `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts`. Server boot: none (standalone harness self-serves over `node:http` on an ephemeral port with Tailwind-CLI-compiled real CSS, template `compact-alert-card-layout.spec.ts:43` (`createServer`)); readiness gate: hydration sentinel before first assertion; detach-safety: samplers re-query per frame, never hold locators across scrolls. In-modal cases (T4/T7/T8 panel-host) extend the existing review-modal e2e family instead, whose workflows already filter on the modal surfaces.

## §7 Ship bookkeeping

On merge: move `WARNCARD-POPOVER-OVERLAP-1` to DEFERRED-archive.md; mark `BL-HOVERHELP-PORTAL` resolved in BACKLOG.md; add `BL-HOVERHELP-VISUAL-VIEWPORT` (R8) to BACKLOG.md; the R3 supersession stays recorded here only (the show-alert-compact spec remains historical).

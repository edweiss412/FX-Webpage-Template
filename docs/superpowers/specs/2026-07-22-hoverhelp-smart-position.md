# HoverHelp smart positioning — portal + collision-aware placement

**Date:** 2026-07-22 (round 2 — full redesign of §4/§6 after Codex round-1 BLOCKING; host-portal model replaces fixed-to-body)
**Status:** Draft for adversarial review R2
**Closes:** `BL-HOVERHELP-PORTAL` (BACKLOG.md:29), `WARNCARD-POPOVER-OVERLAP-1` (DEFERRED.md:23)
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-22, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

`HoverHelp` (components/admin/HoverHelp.tsx) positions its popover body absolutely IN FLOW below the trigger (`top-[calc(100%+6px)]`, HoverHelp.tsx:249). Two consequences:

1. **Overlap** — on compact alert cards the `?` trigger sits at the message row's end (CompactAlertCard.tsx:112); the popover opens downward over the card's own guidance band — the very text it contextualizes (`WARNCARD-POPOVER-OVERLAP-1`).
2. **Clipping** — inside a scrolling surface the popover is visually clipped by ancestors. Concrete case: attention cards live in the review modal's `overflow-y-auto` pane (ShowReviewSurface.tsx:979) nested in an `overflow-clip` panel (ReviewModalShell.tsx:618); a popover opened near the pane's bottom is cut off, and `getBoundingClientRect()` does not reveal it (`BL-HOVERHELP-PORTAL`).

Goal: an OPEN popover is always fully inside the visible bounds of its positioning host — flipping vertically away from insufficient space, shrinking when neither side fits, and escaping clipping ancestors — with the interaction/a11y regressions enumerated and dispositioned (§4.8), not hand-waved to zero.

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
- Existing tests: `tests/components/admin/HoverHelp.test.tsx` (12 tests, all `screen.*` document-scoped queries), `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (:70-97), `tests/components/admin/hoverHelpCompactTrigger.test.tsx`; consumer suites using `within(...)` scoping (R1 F4 sweep, all verified to contain `within(`): `Dashboard.test.tsx`, `ShowsTable.test.tsx`, `RecentAutoAppliedStrip.test.tsx`, `tests/components/admin/settings/AdministratorsSection.test.tsx`, `tests/components/admin/settings/DriveConnectionPanel.test.tsx`, `tests/app/admin/settingsHeader.test.tsx`, `tests/app/admin/needsAttentionPage.test.tsx`; e2e `tests/e2e/compact-alert-card-layout.spec.ts`, `tests/e2e/deep-link-walker.spec.ts` (HoverHelp arm :182-199, clicks the trigger then finds the nested link), `tests/e2e/bell-panel-layout.spec.ts` (:895-896 — comment recording the display:none fix), document-scrollWidth pin pattern at `tests/e2e/admin-nav-layout-dimensions.spec.ts:118`.
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

### §4.2 Positioning algorithm (resolves R1 F1)

The body uses `position: absolute` with inline `top`/`left` in the HOST's coordinate space — never `position: fixed` (eliminates the fixed-containing-block guard class entirely, R1 F8: there is no assumption to guard). Coordinate scheme, uniform for both hosts:

- `hostRect = host.getBoundingClientRect()` — for `document.body` this is the page box (`hostRect.top === -scrollY` when body has no margins; the formula below does not assume that, it uses the measured rect).
- To place the body's top-left at viewport point `(vx, vy)`: `left = vx − hostRect.left + host.scrollLeft`, `top = vy − hostRect.top + host.scrollTop` (panel `scrollTop` is 0 — it clips, the inner pane scrolls — but the formula stays general).
- Requirement: the host is the body's containing block. True for the panel (`relative`, :618). For `document.body`: absolute coords resolve against the initial containing block when body is `position: static`; the measured-rect formula above is exact in either case because it derives the offset from live geometry, not from assumptions about which box is the containing block — the implementation MUST verify this with T6's functional probe (place a test node at a computed coordinate, assert its viewport rect), not by style inspection.

**Bounds** (the space the popover must fit in): `B = intersect(hostRect, viewportRect)` inset by `VIEWPORT_INSET` on all four sides, where `viewportRect = (0, 0, window.innerWidth, window.innerHeight)` (layout viewport per R8). For body-host, `intersect` degenerates to the viewport; for the panel it is the visible panel area.

Constants (single source, exported for tests): `GAP = 6` (today's `+6px`), `VIEWPORT_INSET = 8`.

Reposition computation, in order:
1. `t = trigger.getBoundingClientRect()` (the BUTTON, not the wrapper).
2. **Anchor-gone check:** if `t` does not intersect `B` at all (trigger scrolled out of the visible bounds), set `visibility: hidden` on the body and stop — an anchored popover with an invisible anchor must not float free (R1 F1's offscreen-anchor case). Clear `visibility` on the next frame where `t` intersects `B` again. Open/close state is NOT touched (hover/click semantics unchanged).
3. Reset any previously applied inline `maxHeight` (so measurement reflects natural size), then `p = body.getBoundingClientRect()`.
4. **Vertical side:** `spaceBelow = B.bottom − t.bottom − GAP`; `spaceAbove = t.top − B.top − GAP`. Preferred side from `placement`. Choose: preferred side if `p.height ≤ space(preferred)`; else the other side if `p.height ≤ space(other)`; else **the side with more space, with `maxHeight = space(chosen)` applied inline** — the body's `overflow-y-auto` then genuinely scrolls and the popover never crosses `B`'s edges (R1 F1's neither-side-fits case; the class cap `max-h-[min(60vh,24rem)]` remains as an upper bound, the inline value only ever shrinks it). After choosing: `vy = t.bottom + GAP` (below) or `vy = t.top − GAP − effectiveHeight` (above), where `effectiveHeight = min(p.height, space(chosen))`.
5. **Horizontal:** `align="right"` → `vx = t.right − p.width`; `align="left"` → `vx = t.left`. Clamp: `vx = min(max(vx, B.left), B.right − p.width)`. If `p.width > B.width` (can only happen for a panel narrower than the popover; `max-w-[80vw]` bounds the viewport case), additionally apply inline `maxWidth = B.width` and re-clamp.
6. Convert `(vx, vy)` to host coordinates per the formula above and write `top`/`left` (and `maxHeight`/`maxWidth` when engaged) as inline styles.

**Vertical clamp invariant:** after step 4, `vy ≥ B.top` and `vy + effectiveHeight ≤ B.bottom` hold by construction for the fits-cases; for the shrink-case they hold because `effectiveHeight = space(chosen)` exactly fills the gap between the trigger edge and `B`'s edge. No post-hoc vertical clamp is needed — asserted, not assumed, by T3b.

### §4.3 Reposition lifecycle (resolves R1 F6)

Reposition runs:
- (a) `useLayoutEffect` when `open` flips true — position set before first paint (the fade never starts at a stale corner);
- (b) `scroll` via `window.addEventListener("scroll", schedule, { capture: true, passive: true })` — capture catches non-bubbling ancestor-container scrolls (the ShowReviewSurface pane);
- (c) `resize` on `window`;
- (d) a `ResizeObserver` on BOTH the trigger button and the body (content growth, font swap, container queries — any size change of either box).

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

### §4.5 Keyboard reachability on body-host pages (completes R1 F3)

In-panel portals need nothing (trap enumerates the link naturally, §4.1). Body-host portals restore adjacency with a local Tab bridge, active only when `host === document.body`, `open`, and `learnMore` is set:

- Tab (no shift) while focus is on the TRIGGER → `preventDefault`, focus the Learn-more link.
- Tab (no shift) while focus is on the LINK → `preventDefault`, close the popover, restore focus to the trigger (the user is done with the popover; the next Tab proceeds naturally from the trigger — no loop, the popover is now closed).
- Shift+Tab while focus is on the LINK → `preventDefault`, focus the trigger (popover stays open).
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
| body width target 18rem, ≤ 80vw | `w-72 max-w-[80vw]` classes (unchanged :248) | T3d |
| body height ≤ min(60vh, 24rem) | class cap (unchanged); inline `maxHeight` only ever smaller (§4.2 step 4) | T3d |
| trigger↔body gap = 6px on the chosen side (fits-cases) | `GAP` in the §4.2 coordinate math | T3a/T3b (±0.5px) |
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

- **T1 (unit — portal Escape containment, extends the shipped suite):** three cases inside a ReviewModalShell-topology fixture (panel + document-level Escape listener + PopoverHostContext): (i) Escape with focus on the trigger → popover closes, modal listener silent; (ii) **Escape with focus on the portaled Learn-more link** → same (this is the R1 F5 gap: the event must ORIGINATE inside the portal); (iii) Escape with popover closed → modal listener fires. Failure mode: any regression in cross-portal React-tree Escape bubbling or in the stopPropagation containment (e.g. moving `onKeyDown` off the root wrapper).
- **T2 (unit — full jsdom blast radius, R1 F4):** `HoverHelp.test.tsx` (12), `hoverHelpCompactTrigger.test.tsx`, and the seven `within(`-scoping consumer suites (§2 list: Dashboard, ShowsTable, RecentAutoAppliedStrip, AdministratorsSection, DriveConnectionPanel, settingsHeader, needsAttentionPage) green with body queries moved to document scope where they scoped through the wrapper. Re-assert explicitly: `aria-describedby` target EXISTS in `document` after mount (R6) and closed body carries `hidden`.
- **T3 (e2e, real browser — geometry, standalone harness):** fixture grid of cards at controlled offsets inside (a) a body-host page and (b) a panel-host (real ReviewModalShell). Cases, each asserting via measured rects + exported constants:
  - **T3a fits-below:** top-region trigger → body top = trigger bottom + GAP (±0.5px).
  - **T3b flip-up + bounds:** bottom-region trigger where `spaceBelow < p.height ≤ spaceAbove` → body bottom = trigger top − GAP (±0.5px) AND body rect ⊆ B (inset respected on all four edges).
  - **T3c neither-side-fits shrink:** centered trigger + tall popover content (fixture-sized so `p.height > max(spaceAbove, spaceBelow)`) → body rect ⊆ B, inline maxHeight === larger space (±0.5px), body scrollHeight > clientHeight (overflow actually engaged).
  - **T3d width/height caps:** body width ≤ min(18rem-rendered, 80vw), height ≤ min(60vh, 24rem) across 390px and 1280px.
  - **T3e anchor-gone:** scroll the trigger fully out of the pane → body `visibility: hidden`; scroll back → visible again, open state preserved.
  - **T3f placement="top" preferred side honored** when it fits (Step2Verify branch); flips down when a fixture pins it to the top edge.
  - **T3g align branches at edges:** align="right" trigger at B.left edge and align="left" trigger at B.right edge → clamped inside B.
- **T4 (e2e — clipping kill-shot, real modal):** in the REAL review-modal harness (pane :979 + panel :618), scroll an attention card to the pane's bottom edge, open its popover: `document.elementFromPoint` at the body's center and four inset corners returns the body or a descendant (true visibility through BOTH clipping ancestors).
- **T5 (e2e — overlap kill-shot):** compact warning card positioned so the flip engages: popover rect does NOT intersect the card's guidance-band rect (both measured live).
- **T6 (e2e — scrollWidth + coordinate-scheme probe):** all popovers closed on /admin at 390px/1280px: `document.documentElement.scrollWidth === clientWidth` (pattern admin-nav-layout-dimensions.spec.ts:118). Open one popover at 390px: still no horizontal document scroll (the clamp keeps it inside — R1 F7's open-state gap). Plus the §4.2 functional coordinate probe: place a test node via the host-coordinate formula, assert its viewport rect lands at the requested point (±0.5px) — replaces any style-enumeration guard (R1 F8).
- **T7 (e2e — reposition lifecycle):** (i) open in the pane, scroll the PANE by a fixture-derived delta → body offset from trigger preserved (±1px) on the next frame; (ii) viewport resize while open → repositioned; (iii) grow the body's content while open (harness knob) → ResizeObserver path repositions/shrinks; (iv) close immediately after a scroll (same tick) → no console error, no visible body (rAF cancel path).
- **T8 (e2e — keyboard reachability):** body-host page with learnMore: Tab from trigger reaches the link; Tab from link closes popover and returns focus to trigger; Shift+Tab from link returns to trigger with popover open. Panel-host: with popover open, repeated Tab cycles through the modal's focusables INCLUDING the link, and the trap wrap still functions (first↔last). deep-link-walker green with its updated HoverHelp arm.
- **T9 (full suites):** entire unit + e2e suites green across all 9 consumers; typecheck; eslint; format:check (pre-push gates).

**CI wiring (named per AGENTS.md e2e harness-readiness):** new standalone spec(s) added to the `tests/e2e/standalone.config.ts` explicit `testMatch` allow-list (:29-35 — a spec absent from it is DARK) AND a dedicated workflow with path filters + `workflow_dispatch`, patterned on `.github/workflows/attention-anchor-e2e.yml` / `modal-header-layout-e2e.yml`. Server boot: none (standalone harness self-serves over `node:http` on an ephemeral port with Tailwind-CLI-compiled real CSS, template `compact-alert-card-layout.spec.ts:43` (`createServer`)); readiness gate: harness exposes a hydration sentinel before first assertion; detach-safety: samplers re-query per frame, never hold locators across scrolls.

## §7 Ship bookkeeping

On merge: move `WARNCARD-POPOVER-OVERLAP-1` to DEFERRED-archive.md; mark `BL-HOVERHELP-PORTAL` resolved in BACKLOG.md; add `BL-HOVERHELP-VISUAL-VIEWPORT` (R8) to BACKLOG.md; the R3 supersession stays recorded here only (the show-alert-compact spec remains historical).

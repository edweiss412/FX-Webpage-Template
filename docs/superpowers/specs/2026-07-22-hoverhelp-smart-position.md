# HoverHelp smart positioning — portal + collision-aware placement

**Date:** 2026-07-22
**Status:** Draft for adversarial review
**Closes:** `BL-HOVERHELP-PORTAL` (BACKLOG.md:29), `WARNCARD-POPOVER-OVERLAP-1` (DEFERRED.md:23)
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-22, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

`HoverHelp` (components/admin/HoverHelp.tsx) positions its popover body absolutely IN FLOW below the trigger (`top-[calc(100%+6px)]`, HoverHelp.tsx:249). Two consequences:

1. **Overlap** — on compact alert cards the `?` trigger sits at the message row's end (CompactAlertCard.tsx:112); the popover opens downward over the card's own guidance band — the very text it contextualizes (`WARNCARD-POPOVER-OVERLAP-1`).
2. **Clipping** — inside a scrolling surface the popover is visually clipped by ancestors. Concrete case: attention cards live in the review modal's `overflow-y-auto` pane (ShowReviewSurface.tsx:979) nested in an `overflow-clip` panel (ReviewModalShell.tsx:618); a popover opened near the pane's bottom is cut off, and `getBoundingClientRect()` does not reveal it (`BL-HOVERHELP-PORTAL`).

Goal: the popover always opens fully visible — flipping vertically away from insufficient space and escaping clipping ancestors — with zero regression to the component's converged interaction/a11y contract.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | Fix ALL 9 consumers by changing shared `HoverHelp`, not a compact-card-local variant | User choice, brainstorming 2026-07-22 ("Fix all 9 consumers") |
| R2 | Mechanism: React portal to `document.body` + JS measurement. NO positioning library (none in deps — verified `package.json` has no floating-ui/popper/radix); CSS anchor positioning REJECTED (needs a heavy polyfill for non-Chromium) | User-approved design, brainstorming 2026-07-22 |
| R3 | This spec SUPERSEDES two ratified postures of `2026-07-20-show-alert-compact`: the §"Spatial note, corrected" overlap acceptance ("CAN paint over the detail, footer, or controls bands… intended tooltip behavior") and amendment A6's descope of placement policy. A6 rejected an **unmeasured prose geometry rule**; this spec replaces it with a **probe-backed, real-browser-tested** policy, which is exactly the escape hatch A6's rationale prescribed ("a spike") | show-alert-compact spec A6 + AGENTS.md spike-before-spec rule; probe transcript §3 |
| R4 | Scenario C (popover open via hover, focus outside the component, Escape) closes BOTH popover and host modal today and continues to after this change. Out of scope. Probe §3 confirmed the portal does not alter this path | Probe transcript §3, scenario C |
| R5 | `placement` prop becomes a PREFERRED-side hint (auto-flip may override); its only writer today is Step2Verify.tsx:638 (`placement="top"`), preserved as the preferred side there | User-approved design |
| R6 | The popover body stays MOUNTED at all times once the client has mounted (display toggled), exactly as today — the portal is not conditionally created per-open. Pre-hydration the body is absent (mounted-gate, §4.1); this narrows the M12.5 "body always in DOM" SR contract to "always in DOM once interactive", which is the same window in which the popover can be opened at all | §4.1; precedent ReviewModalShell.tsx:710 |
| R7 | Dev-only `SwitcherControls` (`fixed top-0 z-60`, AGENTS-noted in DEFERRED.md:11-15) may still paint above the portaled popover. Accepted: build-gated dev instrument | DEFERRED.md ATTN-GALLERY-CONTROLBAR-OVERLAP-1 posture |

## §2 Current state (all citations verified against worktree @ 3ad629108)

- Component: `components/admin/HoverHelp.tsx`. Body div classes at :248-252: `absolute z-50 w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto …`; vertical side `placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"` (:249); horizontal `align === "right" ? "right-0" : "left-0"` (:252); closed state `pointer-events-none hidden opacity-0` (:251) — `hidden` (display:none) is the BELL-HELP-POPOVER-OVERFLOW-1 scrollWidth fix (comment :229-237).
- Props: `align = "left"` (:62), `placement = "bottom"` (:63), `compactTrigger` (:67), `learnMore` (:103), `testId`/`rootTestId` (:64-65).
- Interaction contract: mouse-only hover open/close (`e.pointerType === "mouse"`, :167-172), click toggle (:183-186), shared 120ms close timer (`CLOSE_DELAY_MS`, :56), window-level Escape-closes-popover effect (:127-137), Escape CONTAINMENT via `onRootKeyDown` `stopPropagation` on the root div (:156-162) against `ReviewModalShell`'s unconditional document-level listener (ReviewModalShell.tsx:245).
- Consumers (9 files, verified `grep -rln '<HoverHelp' app components`): `app/admin/settings/page.tsx`, `app/admin/needs-attention/page.tsx`, `components/admin/RecentAutoAppliedStrip.tsx`, `components/admin/Dashboard.tsx`, `components/admin/ShowsTable.tsx`, `components/admin/compactAlertHelp.tsx`, `components/admin/settings/DriveConnectionPanel.tsx`, `components/admin/wizard/Step2Verify.tsx`, `components/admin/settings/AdministratorsSection.tsx`.
- Existing tests: `tests/components/admin/HoverHelp.test.tsx` (12 tests), `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (:70-97, two containment tests), `tests/components/admin/hoverHelpCompactTrigger.test.tsx`, e2e `tests/e2e/compact-alert-card-layout.spec.ts`, `tests/e2e/bell-panel-layout.spec.ts` (:895-896 — comment recording the display:none fix), document-scrollWidth pin pattern at `tests/e2e/admin-nav-layout-dimensions.spec.ts:118`.
- Portal precedent: `ReviewModalShell.tsx:710` (`mounted ? createPortal(tree, document.body) : tree`), also `HelpSheet.tsx:80`, `FinalizeButton.tsx:741`, `WizardFooter.tsx:62`.

## §3 Empirical probe — portal Escape topology (ran 2026-07-22, pre-spec)

Per AGENTS.md "empirical spike before speccing stateful/race/framework surfaces". Probe harness: React 19.2.4 + react-dom 19.2.4 (repo versions), esbuild 0.28.0 bundle, served over localhost, driven by real Playwright keypresses. Setup replicated the shipped topology: a native `document`-level bubble-phase Escape listener (mirroring ReviewModalShell.tsx:245), a native `window`-level Escape listener (mirroring HoverHelp.tsx:135), and a component whose root div carries React `onKeyDown` calling `stopPropagation` (mirroring HoverHelp.tsx:156-162), rendered twice — body in-flow vs `createPortal(body, document.body)`.

Results (event log per scenario, real `Escape` keypress):

| Scenario | Focus | In-flow result | Portal result |
|---|---|---|---|
| A | trigger button | `react-onRootKeyDown → stopPropagation` only; document listener SILENT | identical |
| B | link inside popover body | `react-onRootKeyDown → stopPropagation` only; document listener SILENT | **identical — containment PRESERVED** |
| C | document.body (hover-open analog) | `document-native` fires (modal closes) then `window-native` (popover closes) | identical |

**Mechanism (why B-portal holds):** React 19 attaches its delegated listeners to each portal CONTAINER at portal mount. The container (`document.body`) precedes `document` in the native bubble path, so the synthetic dispatch — which follows the REACT tree and therefore reaches the component's root-div `onKeyDown` — runs first, and its `stopPropagation` (applied to the native event) stops propagation before `ReviewModalShell`'s `document`-level listener. No native capture-phase workaround is needed; the shipped containment handler carries over verbatim.

**Fragility note:** containment would break against a CAPTURE-phase `document` listener — but that is equally true of the shipped in-flow topology (capture at `document` runs before any bubble-phase delegation), so the portal introduces no new fragility class. The structural pin is §6 T1.

## §4 Design

### §4.1 Portal + mounted gate

The body div moves to `createPortal(<body…/>, document.body)` behind the repo's mounted-gate pattern (ReviewModalShell.tsx:710): `mounted` flips true in a `useEffect`; before that the body renders nothing (server + first client render identical — no hydration mismatch). After mount the portal exists permanently for the component's lifetime; open/close toggles display exactly as today (`hidden` ↔ `block`, preserving the scrollWidth fix and the fade via `transition-discrete starting:opacity-0`). The body is never reparented while open (no focus-drop, ReviewModalShell.tsx:209 class).

Consequences handled:
- **SR contract:** `aria-describedby`/`aria-controls` resolve by ID anywhere in the document; pre-mount the reference dangles harmlessly (popover cannot open without JS anyway) — R6.
- **React-tree events:** `onPointerEnter`/`onPointerLeave` on the body div itself and the root-div `onKeyDown` bubbling are React-tree-scoped and DOM-location-independent (probe §3).
- **Root wrapper:** stays `relative inline-flex` div with `rootTestId` — unchanged (the §4.1-R6 span/div validity note in the shipped file becomes moot but the div stays).

### §4.2 Positioning algorithm

Popover becomes `position: fixed` (viewport-coordinate space; `document.body` portal parent has no transform — Tailwind preflight applies none to body; a transformed body would re-anchor `fixed`, noted as a guard in §6 T6). Inline `style` carries `top`/`left`; the classes keep width/appearance (`w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto` etc. unchanged).

Constants (single source, exported from HoverHelp.tsx for tests): `GAP = 6` (today's `+6px`), `VIEWPORT_INSET = 8`.

On each reposition:
1. `t = trigger.getBoundingClientRect()` (the BUTTON, not the wrapper).
2. `p = body.getBoundingClientRect()` for its rendered size (body is display:block whenever measuring — measurement runs only while open).
3. **Vertical:** `spaceBelow = window.innerHeight − t.bottom − GAP − VIEWPORT_INSET`; `spaceAbove = t.top − GAP − VIEWPORT_INSET`. Preferred side from `placement` prop. Use preferred side iff `p.height ≤ space(preferred)`; else use the OTHER side iff `p.height ≤ space(other)`; else use whichever side has MORE space (max-h caps p.height at min(60vh, 24rem), so one side always fits on any viewport ≥ ~480px tall; below that the popover's own overflow-y-auto scrolls).
   - bottom: `top = t.bottom + GAP`; top: `top = t.top − GAP − p.height`.
4. **Horizontal:** `align="right"` → `left = t.right − p.width`; `align="left"` → `left = t.left`. Then clamp: `left = min(max(left, VIEWPORT_INSET), window.innerWidth − p.width − VIEWPORT_INSET)`. (`max-w-[80vw]` guarantees the clamp interval is non-empty.)

Reposition moments: (a) `useLayoutEffect` on `open` becoming true — position is set before first paint so the fade never starts at a stale corner; (b) `scroll` events via `window.addEventListener("scroll", …, { capture: true, passive: true })` — capture catches non-bubbling ancestor-container scrolls (the ShowReviewSurface pane); (c) `resize` on window. (b)+(c) attach only while open, detach on close/unmount, and coalesce through `requestAnimationFrame` (at most one measurement per frame).

### §4.3 What does NOT change

Trigger markup/tap targets (44px floors, `compactTrigger` 22px box), hover/click/Escape interaction machinery, `CLOSE_DELAY_MS`, learnMore disclosure semantics, testids (`<testId>-trigger` / `<testId>-body`, `rootTestId`), all visual classes of the body except its positioning classes (`absolute z-50`, the two `calc` side classes, `right-0/left-0` are replaced by `fixed z-50` + inline coords), the affordance-matrix registration (app/help/_affordanceMatrix.ts — testids unchanged).

Z-order: `ReviewModalShell` portals to body (:710) and the popover's portal mounts LATER in DOM order (HoverHelp instances mount inside the modal tree, so their portal containers append after the modal's); equal `z-50` resolves by DOM order — popover paints above the modal. R7 covers the dev-only z-60 overlay.

### §4.4 Transition inventory

States: `closed`, `open@bottom`, `open@top`. Pairs:

| Transition | Treatment |
|---|---|
| closed → open (either side) | position set pre-paint (useLayoutEffect), then the shipped fade (`starting:opacity-0`, `duration-fast`) |
| open → closed | shipped `transition-[opacity,display]` discrete hide — unchanged |
| open@bottom ↔ open@top (reposition mid-open, e.g. scroll crosses the flip threshold) | INSTANT jump — no animation. A tooltip tracking its anchor must not tween; deliberate |
| open + anchor scrolls (no flip) | instant per-frame tracking (rAF), no animation |
| compound: close during fade-in / reopen during fade-out | shipped discrete-transition behavior, unchanged by this spec |

### §4.5 Dimensional Invariants

The popover has no fixed-dimension parent (it is portaled and `fixed`); its invariants are viewport-relative and each maps to one guarantee:

| Invariant | Guarantee |
|---|---|
| body width ≤ 80vw | `max-w-[80vw]` class (unchanged from shipped :248) |
| body width target 18rem | `w-72` class (unchanged) |
| body height ≤ min(60vh, 24rem) | `max-h-[min(60vh,24rem)]` + `overflow-y-auto` (unchanged) |
| trigger↔body gap = 6px on the chosen side | `GAP` constant in the §4.2 coordinate math (replaces the two `calc(100%+6px)` classes) |
| body stays ≥ 8px inside both viewport edges horizontally | `VIEWPORT_INSET` clamp, §4.2 step 4; interval non-empty because width ≤ 80vw |
| body top ≥ 8px and bottom ≤ viewport−8px when the chosen side fits | §4.2 step 3 side-selection predicate |

Real-browser assertions for these live in §6 T3-T5 (jsdom cannot compute them).

### §4.6 Guard conditions

| Input/state | Behavior |
|---|---|
| `placement` absent | preferred side `bottom` (shipped default, :63) |
| trigger rect all-zero (ancestor display:none) | popover cannot be opened from an invisible trigger by real interaction; if forced open programmatically, coords compute from the zero rect — harmless, not specified further |
| pre-mounted (SSR/hydration window) | body not rendered; open impossible (needs JS) |
| viewport shorter than popover on both sides | pick larger side; body's own `max-h` + `overflow-y-auto` scrolls |
| reduced motion | fade is opacity-only + `duration-fast`; unchanged from shipped behavior |
| jsdom (unit tests) | `getBoundingClientRect` returns zeros → algorithm degrades to `top = GAP`-ish coords; unit tests assert NON-geometric contracts only (§6); all geometry assertions are real-browser |

### §4.7 Flag lifecycle — `placement`

| Field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `placement?: "top" \| "bottom"` | prop | Step2Verify.tsx:638 (only writer; all other consumers omit) | §4.2 step 3 preferred-side | preferred vertical side; auto-flip may override when it does not fit |

Not a zombie: read path and effect both live.

## §5 Out of scope

- Scenario-C dual-close semantics (R4).
- Horizontal flipping (align is a fixed anchor + clamp; no left/right auto-flip — no consumer needs it and clamping suffices).
- Portaling `HelpTooltip` (the `<details>`-based in-flow disclosures) or any other popover component.
- The dev gallery z-60 overlay (R7).

## §6 Test plan

**Meta-test inventory (AGENTS.md writing-plans rule):** no NEW registry meta-test is created. EXTENDED: `tests/components/admin/hoverHelpEscapeContainment.test.tsx` becomes the structural pin for the portal topology (T1). Declared inapplicable: Supabase call-boundary, advisory-lock, admin-alert catalog, sentinel-hiding registries — no DB/auth/catalog surface is touched. Mutation-surface observability: no new mutation surface (pure client presentation change).

Anti-tautology notes are inline per test.

- **T1 (unit, extend containment suite):** the two shipped containment tests re-run against the PORTALED body (RTL renders portals into `document.body`; queries move from `container.*` to `screen.*`/`baseElement` where needed). Failure mode caught: a future refactor that breaks React-tree Escape bubbling across the portal (e.g. moving `onKeyDown` off the root div, or conditionally creating the portal per-open) closes the whole modal on popover-Escape.
- **T2 (unit):** all 12 `HoverHelp.test.tsx` tests + `hoverHelpCompactTrigger.test.tsx` green with body queries adjusted for portal location; explicitly re-assert: body id referenced by `aria-describedby` EXISTS in `document` after mount (SR contract, R6), and closed body has `hidden` class (scrollWidth fix input).
- **T3 (e2e, real browser — collision flip):** harness mounts two cards, one near viewport top, one near bottom (fixture-positioned, not hardcoded pixels: bottom card's trigger placed so `spaceBelow < popover height`). Open each: top card's popover top edge > trigger bottom (opened down); bottom card's popover bottom edge < trigger top (opened up). Derives expectation from measured trigger rects, not constants.
- **T4 (e2e — clipping containment, the BL-HOVERHELP-PORTAL kill-shot):** inside the REAL review modal harness (ShowReviewSurface pane :979 + ReviewModalShell panel :618), scroll an attention card to the pane's bottom edge, open its popover, then assert TRUE visibility: `document.elementFromPoint` at the popover's center and four inset corners returns the popover body or a descendant. `getBoundingClientRect` alone is banned here (BACKLOG.md:33 documents it lying about clipping). Failure mode caught: popover still clipped by either ancestor.
- **T5 (e2e — overlap fix, the WARNCARD kill-shot):** compact warning card with a guidance band, positioned so the flip engages: open popover, assert popover rect does NOT intersect the card's guidance-band rect (both rects measured live; intersection computed, no hardcoded coords). Failure mode caught: popover still covering the guidance it contextualizes.
- **T6 (e2e — scrollWidth + fixed-anchor integrity):** with all popovers closed on /admin at 390px and 1280px: `document.documentElement.scrollWidth === clientWidth` (pattern admin-nav-layout-dimensions.spec.ts:118). Plus a one-shot guard that `getComputedStyle(document.body).transform === "none"` (fixed-positioning anchor assumption, §4.2). Failure modes: reintroduced closed-popover layout box; a future transform on body silently re-anchoring every popover.
- **T7 (e2e — scroll tracking):** open a popover inside the scrollable pane, scroll the PANE (not window) by a fixture-derived delta, assert the popover's offset from its trigger is preserved within 1px on the next frame. Failure mode: scroll listener not capturing container scrolls (bubble-phase listener would miss them).
- **T8 (full suites):** entire existing unit + e2e suites green across all 9 consumers; typecheck; eslint; format:check (pre-push gates).

## §7 Ship bookkeeping

On merge: move `WARNCARD-POPOVER-OVERLAP-1` to DEFERRED-archive.md; mark `BL-HOVERHELP-PORTAL` resolved in BACKLOG.md; note the R3 supersession in the show-alert-compact spec's amendment log is NOT edited (that spec stays historical; this spec is the forward authority — same pattern as prior supersessions).

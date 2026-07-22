# HoverHelp caret + blur-close — spec

Date: 2026-07-22 · Status: draft (R3 repairs applied) · Un-defers `HOVERHELP-CLAMP-CARET-1` (DEFERRED.md:11-15)
Parent spec: `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` (the positioning core this extends)

## §1 Problem

Two folded P3s from the impeccable critique of `hoverhelp-smart-position` (DEFERRED.md:13):

1. **No caret under horizontal clamp.** Step 4 of the placement core clamps the popover's x into bounds (`lib/popover/position.ts:124-125`). When the clamp slides the body away from its trigger, nothing visually ties body to trigger — precisely in the collision cases the smart-position feature serves.
2. **No blur-close.** A keyboard user opens the popover (Enter on the trigger), then Tabs away; the popover lingers with focus elsewhere. Pre-existing, amplified in modals where the portaled body is no longer visually adjacent to the trigger.

## §1.1 Resolved scope — do not relitigate

- **Caret presence never depends on whether clamping occurred** (user-ratified Option A, 2026-07-22 brainstorm; mockup artifact `aa294651`): one code path, no clamped-vs-unclamped visual branch. The sole suppression is the physical degenerate-width guard (§3.3) — a body too narrow to seat the triangle on a straight edge — which is unreachable for every shipped caller (natural body width is 288px, `w-72`, HoverHelp.tsx:514; suppression requires bounds narrower than 36px). "Always" in the ratified decision means "not clamp-conditional," not "rendered even where geometrically impossible."
- **All caret algebra lives in the pure core** `lib/popover/position.ts`. Structural defense ratified in parent spec (position.ts:5-8): two adversarial rounds found ordering/state defects in prose math; the shell only measures and applies. Do not propose shell-side or CSS-custom-property math.
- **Blur-close is pair-scoped, not document-scoped.** Close only when focus *was inside* the trigger/body pair and `relatedTarget` lands outside both. A document-level `focusin` variant (closes hover-open popovers when focus moves anywhere on the page) was considered and rejected — broader than the finding. Probe P4 (§4.0) confirms hover-only popovers never see a pair `focusout`.
- **Blur-close is DISABLED for modal-hosted `learnMore` popovers** (`hostRef !== null && learnMore !== undefined`). The parent spec ratifies that a modal-hosted "Learn more" link is reached through the host panel's Tab order (`2026-07-22-hoverhelp-smart-position.md:149`, §4.5 at :153-163 — no Tab bridge in dialogs); en route, focus is legitimately outside the pair, so blur-close there would set the link `tabIndex=-1` (HoverHelp.tsx:538) and make it unreachable. Reachability outranks tidiness for exactly this quadrant; the other three quadrants (any non-`learnMore` popover in either host; body-host `learnMore`, whose link is reached only via the trigger's Tab bridge) keep blur-close.
- **`relatedTarget === null` is ignored** (window blur, click on non-focusable content). Empirically load-bearing, not just Safari caution: probe P3 (§4.0) shows a click on the popover's own non-focusable text yields `relatedTarget: null` in Chromium — closing on null would dismiss the popover when the user clicks inside it.
- **Blur-close never moves focus.** The user left deliberately; stealing focus back violates their intent. (Contrast Escape, which restores focus to the trigger — `HoverHelp.tsx:194-198` — because dismissal strands focus on a node about to `display:none`.)
- **Caret is `pointer-events-none` and `aria-hidden`.** Hover-bridging across the 6px gap is already handled by the 120ms close delay (`HoverHelp.tsx:81`, rationale at `HoverHelp.tsx:24-25`); the caret adds no interaction surface and no SR content.
- **The critique's P1 (modal Tab adjacency) stays refuted** per parent spec ratification (`2026-07-22-hoverhelp-smart-position.md:149`, recorded in DEFERRED.md:13). Out of scope here.

## §2 Current state (citations verified against worktree @ 108d98244)

- `lib/popover/position.ts` — pure core. Exports `GAP = 6` (line 16), `VIEWPORT_INSET = 8` (line 17), `Rect` (19-26), `PopoverPlacementInput` (28-39), `PopoverPlacement` (41-49: `{kind:"hidden"} | {kind:"placed"; side; viewport:{x,y}; maxHeight; maxWidth}`), `intersectRects` (51), `insetRect` (59), `computePopoverPlacement` (86-128). Step 4 horizontal clamp: lines 123-125 (`x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth)`). `effectiveWidth = Math.min(naturalSize.width, bounds.width)` (line 105); `effectiveHeight = Math.min(height0, space(side))` (line 120); `y = side === "bottom" ? trigger.bottom + GAP : trigger.top - GAP - effectiveHeight` (line 121).
- `components/admin/HoverHelp.tsx` — shell. `measureAndApply` (215-284) gathers rects, calls the core, applies inline styles; host-coordinate conversion formulas at 272-283. Hidden branch 251-266 sets `visibility:hidden` + `data-popover-hidden` and strips `data-popover-side` (264). Placed branch sets `data-popover-side` (271). Root wrapper div (451-457) carries pointer + keydown handlers, currently **no ref**. Portal (503-555) renders exactly one child (the body div). Body classes (514): `rounded-md ... overflow-y-auto ... transition-[opacity,display] duration-fast transition-discrete starting:opacity-0`, open/closed toggles `block opacity-100` vs `pointer-events-none hidden opacity-0` (515). Focus helpers: `focusInsideBody` (176-183), `scheduleClose` (184-191, 120ms via `CLOSE_DELAY_MS` line 81), `closeAndRestoreFocus` (194-198), body-host Tab bridge (386-407), `onBodyFocus` keep-open (410). `learnMore` link `tabIndex` gating at 538.
- `app/globals.css:209` — `--radius-md: 12px`; the body's `rounded-md` corner radius is 12px.
- 15 `<HoverHelp` call sites across `components/` + `app/`; 11 pass `learnMore`. Both hosts are live: modal-hosted instances via `PopoverHostContext` (provider is ReviewModalShell, HoverHelp.tsx:69-77) and body-host instances on non-modal admin pages.
- Existing tests: `tests/lib/popover/position.test.ts` (numeric-pins the core; fixture helper `input()` with 1000x800 pre-inset bounds), `tests/components/admin/HoverHelp.test.tsx`, `tests/components/admin/hoverHelpLifecycle.test.tsx` (jsdom stubbed-rect behavioral geometry incl. host-conversion cases), `tests/components/admin/hoverHelpEscapeContainment.test.tsx`, `tests/e2e/hoverhelp-geometry.spec.ts` (real-engine geometry via standalone config `tests/e2e/standalone.config.ts`; derives expectations from live rects + exported `GAP`/`VIEWPORT_INSET`; bans `getBoundingClientRect` as a *clipping/visibility* proof — position math via rects is the spec's established pattern). CI: `.github/workflows/hoverhelp-geometry-e2e.yml` path-triggers on both `components/admin/HoverHelp.tsx` and `lib/popover/position.ts` (lines 21-22), so the e2e gate fires for this diff with no wiring change.
- New jsdom test files under `tests/components/admin/` are auto-included by `BASE_INCLUDE` (`vitest.projects.ts:34`) and the parallel project glob `tests/components/**` (`vitest.projects.ts:65`) — no config change needed.
- No existing test asserts the portal renders exactly one child (verified: no `firstChild`/child-count queries in the HoverHelp test files), so adding a sibling caret node inside the portal breaks no structural assumption.

## §3 Design — caret

### §3.1 Why a sibling node, not a body child

The body has `overflow-y-auto` (HoverHelp.tsx:514). Per CSS Overflow computation, setting one overflow axis to a scrolling value forces the other from `visible` to `auto` — a child caret absolutely positioned outside the body's border box would be clipped. The caret is therefore a **sibling** of the body inside the same portal (the portal renders a fragment: body div + caret div). The caret is positioned in the same host coordinate space with the same conversion formulas the body uses (HoverHelp.tsx:272-283).

### §3.2 Constants (new exports from `lib/popover/position.ts`)

- `CARET_WIDTH = 12` — base width of the triangle, px.
- `CARET_HEIGHT = 6` — equals `GAP`; the caret exactly fills the trigger↔body gap.
- `CARET_EDGE_INSET = 18` — minimum distance from a body edge to the caret **center**: `--radius-md` (12px, globals.css:209) + `CARET_WIDTH / 2` (6px), so the triangle base always sits on the straight run of the body edge, never on a rounded corner.
- `CARET_INNER_OFFSET = 1.5` — vertical inset of the inner (fill) triangle from the outer (border) triangle, px; also the distance the inner base overhangs the body border to erase the seam. Exported here so shell classes and tests share one definition (it is caret-geometry contract, like the other three).

A comment on `CARET_EDGE_INSET` notes the 12px term mirrors `--radius-md`; test T-C6 (§8) pins the sum numerically.

### §3.3 Core extension

`PopoverPlacement`'s placed variant gains one field:

```ts
| {
    kind: "placed";
    side: "top" | "bottom";
    viewport: { x: number; y: number };
    maxHeight: number | null;
    maxWidth: number | null;
    caret: { x: number; y: number } | null;   // NEW - viewport coords of the caret box's top-left
  }
```

Computed after step 4 (all inputs already in scope):

```
caretCenterX0 = trigger.left + trigger.width / 2
caretCenterX  = clamp(caretCenterX0, x + CARET_EDGE_INSET, x + effectiveWidth - CARET_EDGE_INSET)
caret.x       = caretCenterX - CARET_WIDTH / 2
caret.y       = side === "bottom" ? trigger.bottom : trigger.top - GAP
```

`caret.y` needs no `effectiveHeight` term: for side `"bottom"` the gap spans `[trigger.bottom, trigger.bottom + GAP]` (body top is `trigger.bottom + GAP`, line 121); for side `"top"` the gap spans `[trigger.top - GAP, trigger.top]` (body bottom is `trigger.top - GAP`). The caret occupies the full gap on either side.

**Degenerate-width guard:** `caret` is `null` iff `effectiveWidth < 2 * CARET_EDGE_INSET` (strictly less than 36px: at exactly 36 the valid center span degenerates to the single midpoint and the caret IS placed there). No straight edge long enough to seat the triangle exists below that. `kind: "hidden"` placements carry no caret by construction. Per §1.1 this guard is unreachable for shipped callers; it exists so the core is total over its input domain.

### §3.4 Shell rendering

The portal renders `<>bodyDiv, caretDiv</>`. The caret div:

- `aria-hidden="true"`, `data-testid={`${testId}-caret`}`, `data-popover-side` mirroring the body's.
- Absolutely positioned; `measureAndApply` sets `left`/`top` from `placement.caret` via the same host-conversion formulas as the body (a shared local helper converts a viewport point to host offsets so the two paths cannot drift).
- **Deterministic visual contract (exact, not illustrative):** an outer div of zero content size drawing a 12×6 triangle with CSS borders, plus ONE nested inner div (not a pseudo-element — a real node keeps both triangles inspectable in tests, and the side-keyed class branches stay symmetric between outer and inner):
  - The absolute inner child's containing block is the outer's PADDING BOX — a zero-size point displaced by the outer's own borders (x = 6px both sides; y = 0 for apex-up, y = 6px for apex-down). Offsets below are chosen against that origin, and the resulting BORDER-BOX deltas are the normative contract: `inner.left === outer.left`, and `inner.top - outer.top === CARET_INNER_OFFSET` (apex-up) / `inner.top - outer.top === -CARET_INNER_OFFSET` (apex-down).
  - Side `"bottom"` (body below trigger; caret above the body, apex up): outer `border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid var(--color-border-strong)`. Inner: identical border geometry with `border-bottom-color: var(--color-surface-raised)`, absolutely offset `left: -6px; top: 1.5px` (padding-box origin y = 0, so border-box delta = +1.5px) — exposing a ~1px sliver of the outer triangle along both slanted edges, the inner's base overhanging the body's top border by 1.5px, painting over the 1px `border-border-strong` seam so caret fill and body fill read as one continuous surface.
  - Side `"top"` (apex down): outer `border-top: 6px solid var(--color-border-strong)` (sides transparent as above). Inner offset `left: -6px; bottom: 1.5px` — NOT `top: -1.5px`: the padding-box origin sits 6px below the outer's border-box top, so a top-offset would land the inner 4.5px too low; anchoring from the padding-box bottom (= the outer border-box bottom, since content height is 0) yields border-box delta = −1.5px and the base overhangs the body's bottom border by 1.5px.
  - Tokens are the body's own (`border-border-strong`, `bg-surface-raised`, HoverHelp.tsx:514) via their CSS variables in arbitrary-value border classes.
- `pointer-events-none` always (§1.1).
- `z-50` (same layer as the body, HoverHelp.tsx:514); DOM-after the body so it paints over the body's border seam.
- Open/close: the caret carries the SAME open/close class toggle as the body (`block opacity-100` vs `pointer-events-none hidden opacity-0` plus `transition-[opacity,display] duration-fast transition-discrete starting:opacity-0`) so both fade as one unit.
- Collision-hidden: when the placed→hidden branch runs (HoverHelp.tsx:251-266), the shell sets the caret's `visibility:hidden` alongside the body's, and clears it on the placed branch — the caret must never be visible while the body is hidden. When `placement.caret === null` on a placed result, the caret alone gets `visibility:hidden`.
- Effect cleanup (HoverHelp.tsx:310-327) resets the caret's `visibility` and strips its `data-popover-side` the same way it resets the body's.

### §3.5 Guard conditions (caret)

| Condition | Behavior |
| --- | --- |
| `kind: "hidden"` | No caret data; shell hides caret with body. |
| `effectiveWidth < 36` | `caret: null`; body renders, caret hidden (§1.1: unreachable for shipped callers). |
| `effectiveWidth === 36` | Caret placed at the single valid center (boundary is strict `<`). |
| Trigger center outside body span (deep clamp) | Caret pinned at `CARET_EDGE_INSET` from the nearer body edge — still the closest honest pointer. |
| `maxWidth` active (body clamped to bounds width) | Formulas use `effectiveWidth`, unchanged. |
| Closed popover | Caret has `hidden` class like the body; no box, no scrollWidth contribution (the BELL-HELP-POPOVER-OVERFLOW-1 class, HoverHelp.tsx:490-498, applies identically). |
| SSR / first client render | Caret is inside the same `mounted`-gated portal (HoverHelp.tsx:503); nothing renders before mount. |

## §4 Design — blur-close

### §4.0 Empirical probe — React focusout across the portal (ran 2026-07-22, pre-repair-draft)

Harness: standalone Chromium (Playwright) page loading an esbuild IIFE bundle of a minimal React 19 tree replicating the shell's topology — wrapper div with `onBlur`, `createPortal`'d body div (own `onBlur`) containing non-focusable text + a link, two outside buttons. Results:

| # | Action | Events observed | Consequence for design |
| --- | --- | --- | --- |
| P1 | Focus trigger, press Tab | `ROOT-BLUR target=trigger related=outside-b` | Tab-away delivers a usable `relatedTarget`; blur-close triggers. |
| P2 | Focus portaled link, press Tab (link last in document order) | `BODY-BLUR` **and** `ROOT-BLUR`, same event | **Portal blurs bubble through the React tree to the root wrapper.** One handler on the root wrapper observes both sides of the pair; a second handler on the body would double-fire it. |
| P3 | Focus trigger, click the body's non-focusable text | `ROOT-BLUR related=null`, activeElement null | Null-ignore is load-bearing: closing on null would dismiss the popover when the user clicks inside it. |
| P4 | Focus outside button, Tab across outside controls | no pair events | Hover-only popovers structurally unaffected. |
| P5 | Shift-Tab from trigger | `ROOT-BLUR related=outside-a` | Backward wander also closes. |
| P6 | Programmatic `blur()` (window-blur analogue) | `ROOT-BLUR related=null` | Ignored per null rule. |
| P7 | Focus trigger, then focus the portaled link | `ROOT-BLUR target=trigger related=link` | In-pair move: the containment check must test `bodyRef` (portaled, NOT a DOM descendant of the root) — `rootRef.contains` alone would close. |

### §4.1 Mechanism

Add `rootRef` to the wrapper div (HoverHelp.tsx:451). **One** handler, attached as `onBlur` on the root wrapper only — probe P2 shows portal blurs bubble to it through the React tree, and a duplicate body-side handler would run twice per blur:

```ts
const blurCloseActive = () => !(hostRef !== null && learnMore !== undefined); // §1.1 modal-learnMore carve-out
const onPairBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
  if (!open || !blurCloseActive()) return;
  const rt = e.relatedTarget;
  if (!(rt instanceof Node)) return;            // null: window blur / non-focusable click (probe P3, P6)
  if (rootRef.current?.contains(rt)) return;    // trigger side
  if (bodyRef.current?.contains(rt)) return;    // body side (portaled, NOT a DOM descendant of root - probe P7)
  clearCloseTimer();
  setOpen(false);                               // no focus restore (§1.1)
};
```

`focusout` fires only when focus leaves a node that contained it (probe P4), so hover-only popovers are structurally unaffected.

### §4.2 Interaction matrix (every existing focus path re-checked)

| Path | relatedTarget | Result |
| --- | --- | --- |
| Tab away from trigger, blur-close active (probe P1) | next focusable, outside pair | **closes** — the finding's fix |
| Shift-Tab from trigger to previous control (probe P5) | outside pair | **closes** |
| Modal-hosted `learnMore` popover, Tab from trigger toward the panel-order link | outside pair (en route) | **stays open** — blur-close disabled for this quadrant (§1.1); parent reachability contract holds |
| Trigger → body link via body-host bridge (`onTriggerKeyDown`, HoverHelp.tsx:389-394) | link, inside body (probe P7 shape) | stays open |
| Bridge forward-Tab off link (HoverHelp.tsx:396-407): `setOpen(false)` + focus trigger | trigger, inside root | no double-close; blur handler no-ops |
| Bridge Shift-Tab link → trigger (HoverHelp.tsx:401) | trigger, inside root | stays open |
| Escape with focus in body (`closeAndRestoreFocus`, 194-198): focuses trigger, then closes | trigger, inside root | no interference |
| Collision-hidden with focus in body (251-261): closes + focuses trigger | trigger, inside root | no interference |
| Click on popover text (non-focusable) while trigger focused (probe P3) | `null` | ignored — popover stays open under the user's pointer |
| Window/tab switch (probe P6 analogue) | `null` | ignored; popover stays, Escape/hover-out still close |
| Focus wanders while popover was hover-opened, focus never inside (probe P4) | — | `focusout` never fires on the pair; unchanged |

### §4.3 Ordering note

React invokes `onBlur` after the browser has moved focus; `document.activeElement` is already the new target, so `focusInsideBody()` (176-183) inside a concurrently-pending `scheduleClose` timer sees the post-move state — no ordering hazard. The handler calls `clearCloseTimer()` before `setOpen(false)` so a stale 120ms timer cannot re-fire.

## §5 Mode boundaries

The caret applies identically in both host modes (modal `PopoverHostContext` host and `document.body` fallback, HoverHelp.tsx:69-79): placed in host coordinates by the same formulas (panel-host conversion pinned by T-J4, §8). Blur-close applies in three of the four host × content quadrants; the modal-host `learnMore` quadrant is carved out (§1.1). The body-host Tab **bridge** (386-407) remains body-host-only — unchanged. Default vs `learnMore`/`afterBody` (disclosure) modes share the caret identically; `afterBody` (a non-focusable string, HoverHelp.tsx:130-139) does NOT affect the blur-close carve-out, which keys on `learnMore` alone (the only focusable body content).

## §6 Transition inventory

Caret visual states: **closed**, **placed-visible@bottom**, **placed-visible@top**, **suppressed** (body placed but `caret: null`, or body collision-hidden). Pairs:

| From → To | Treatment |
| --- | --- |
| closed → placed-visible (either side) | fades with body (`transition-discrete` + `starting:opacity-0`, same classes) |
| placed-visible → closed | fades with body (display transition; degrades to instant where unsupported — same degradation as body, HoverHelp.tsx:499-502) |
| placed-visible@bottom ↔ placed-visible@top (side flip on reflow) | instant — position AND triangle orientation change in the same `measureAndApply` call (`data-popover-side` attribute flip selects the mirrored class branch); no animation, matching the body's instant reposition |
| placed-visible → suppressed | instant (`visibility:hidden`) — collision hiding is already instant for the body |
| suppressed → placed-visible | instant — symmetric |
| closed → suppressed / suppressed → closed | invisible → invisible; class flip only, no visual transition |
| position updates while placed, same side | instant per-frame inline-style writes, same as body (parent spec §4.3) |

Compound transitions:

| Compound | Treatment |
| --- | --- |
| Side flip while the open fade is mid-flight | orientation + position swap instantly inside the fade; opacity continues uninterrupted (opacity animates on the class toggle; position/orientation are inline-style + attribute writes) |
| Collision suppression while the open fade is mid-flight | `visibility:hidden` wins instantly over the animating opacity — node vanishes; same behavior the body already has |
| Suppression (or side flip) while a coalesced reposition frame is pending | the pending frame runs `measureAndApply` once; body and caret are written in the same call — no torn frame where one updated and the other did not |
| Blur-close mid-open-fade | `setOpen(false)` flips both nodes' classes in the same commit |
| Blur-close while the 120ms pointer-leave close timer is pending | handler runs `clearCloseTimer()` before `setOpen(false)` — the stale timer cannot fire into a later re-open (T-B10) |

Popover open/close states themselves are unchanged from the parent spec's inventory (`2026-07-22-hoverhelp-smart-position.md` §4.6).

## §7 Dimensional invariants

No fixed-dimension parent with flex/grid children is introduced (the caret is absolutely positioned, zero-size-with-borders). The load-bearing geometric invariants are positional, asserted in the real-engine e2e (§8 T-E1..E3): caret box abuts the body edge (`caretBottom === bodyTop` for side bottom, within 0.5px), caret center x equals the CLAMPED trigger-center formula (never the raw trigger center), caret never overlaps a rounded corner (`caretCenterX ∈ [bodyLeft + CARET_EDGE_INSET, bodyRight - CARET_EDGE_INSET]`).

## §8 Test plan

Every e2e/unit expectation derives from fixture rects + IMPORTED constants (`GAP`, `VIEWPORT_INSET`, `CARET_WIDTH`, `CARET_HEIGHT`, `CARET_EDGE_INSET`). Permitted literal forms in assertions: constant-derived strings (e.g. `` `${CARET_HEIGHT}px` ``), the structural zero (`0` / `"0px"`), and CSS keyword/token strings (`"transparent"`, computed color equality against the body's own computed value). Raw numeric pins live ONLY in T-C6.

Unit — `tests/lib/popover/position.test.ts` (extend):

- **T-C1** unclamped: caret center = trigger center; `caret.y = trigger.bottom` (side bottom).
- **T-C2** shallow clamp: body slides but trigger center still within `[x + CARET_EDGE_INSET, x + effectiveWidth - CARET_EDGE_INSET]` → caret center = trigger center exactly.
- **T-C2b** deep clamp (trigger center outside the valid span): caret center pinned at `x + effectiveWidth - CARET_EDGE_INSET` (right-edge case). Catches: clamp bound arithmetic.
- **T-C3** left-edge clamp mirror (align "right"): deep-clamp pin at `x + CARET_EDGE_INSET`.
- **T-C4** side "top": `caret.y = trigger.top - GAP`.
- **T-C5** degenerate width (`bounds.width < 36`, so `effectiveWidth < 36`): `caret: null`, body still placed.
- **T-C5b** boundary `effectiveWidth === 36`: caret placed, center = `x + CARET_EDGE_INSET` (= the single valid point). Catches: `<` vs `<=` guard drift.
- **T-C5c** `naturalSize.width < 36` with WIDE bounds (`effectiveWidth` = natural width): `caret: null`. Catches: a guard reading `bounds.width` instead of `effectiveWidth`.
- **T-C8** hidden placement (non-overlapping trigger fixture): result is `{kind:"hidden"}` and carries no `caret` key. Catches: caret emitted for hidden placements (the §8 failure-mode claim now has its explicit assertion).
- **T-C6** constants pinned: `CARET_WIDTH === 12`, `CARET_HEIGHT === GAP`, `CARET_EDGE_INSET === 12 + CARET_WIDTH / 2`, `CARET_INNER_OFFSET === 1.5`.
- **T-C7** `maxWidth` active: caret formulas use `effectiveWidth` (caret stays inside the clamped body span).
- Failure modes caught: caret math drifting out of the core, inset regressions letting the caret ride a rounded corner, caret emitted for hidden placements, boundary drift.

Component (jsdom) — a NEW blur-close test file under `tests/components/admin/` (name: hoverHelpBlurClose, created by the plan):

- **T-B1** open via click; dispatch `focusout` on trigger with `relatedTarget` = outside button → closed (`aria-expanded` false, body has `hidden` class). Catches: missing blur-close.
- **T-B2** `relatedTarget` = body link (inside portaled body) → stays open. Catches: containment check missing the portaled body (probe P7).
- **T-B3** `relatedTarget: null` → stays open. Catches: over-eager close on window blur / in-body click (probe P3).
- **T-B4** bridge forward-Tab path still lands focus on trigger with popover closed, no error (regression guard for §4.2 bridge rows).
- **T-B5** hover-open (pointer, focus elsewhere), then move focus between two outside buttons → stays open. Catches: document-scoped listener creep.
- **T-B6** modal-host (`PopoverHostContext` provider) + `learnMore`: focusout with outside `relatedTarget` → **stays open** (carve-out). Catches: reachability regression on the parent-ratified quadrant.
- **T-B7** body-host + `learnMore`: same dispatch → closes. Catches: carve-out over-applied to the wrong quadrant.
- **T-B8** modal-host (provider), NO `learnMore`: same dispatch → **closes**. Catches: carve-out over-broadened to every modal popover.
- **T-B9** modal-host + `afterBodyText` set, NO `learnMore`: same dispatch → **closes**. Catches: carve-out keyed on `narrowed` (HoverHelp.tsx:429) instead of `learnMore` — `afterBody` narrows the description but adds no focusable content.
- **T-B10** stale-timer clearance (fake timers): open, fire `pointerleave` (schedules the 120ms close), then blur-close via focusout, then immediately re-open via click and advance timers past `CLOSE_DELAY_MS` → popover STAYS open. Catches: `clearCloseTimer()` omitted from the blur handler letting the stale hover timer close a reopened popover.
- jsdom is legitimate here: these assert event-handler logic with synthesized `FocusEvent`s, not real focus traversal — that lives in T-E4 and probe §4.0.

Component (jsdom) — `hoverHelpLifecycle.test.tsx` (extend; the stubbed-rect geometry suite):

- **T-J1** caret node exists in portal, `aria-hidden="true"`, `pointer-events-none` class, carries `hidden` class while closed.
- **T-J2** stubbed placed→hidden transition: a previously visible caret gets `visibility:hidden` when the body goes collision-hidden. Catches: stale rendered caret (pure-core tests cannot).
- **T-J3** stubbed placed-with-`caret:null` result: caret alone hidden while body stays visible.
- **T-J4** panel-host stubbed-rect case: caret `left`/`top` reflect host-offset conversion (host rect ≠ viewport), matching the body's conversion. Catches: caret positioned in viewport coords inside a panel host.
- **T-J5** effect cleanup on close: caret `data-popover-side` stripped, `visibility` reset (mirrors body attribute lifecycle).
- **T-J6** structural visual-contract pins (class-string + DOM level, jsdom-legitimate): (a) portal child order is body div THEN caret div (paint order for the seam); (b) the caret has exactly ONE element child (the inner triangle div) and no other children; (c) on a stubbed placed result the caret's `data-popover-side` equals the body's; (d) the caret's `className` contains the same open/close + transition tokens as the body (`transition-[opacity,display]`, `duration-fast`, `transition-discrete`, `starting:opacity-0`, and the `hidden`/`block` toggle) and `z-50` + `pointer-events-none`. Catches: missing inner triangle, divergent fade classes, wrong stacking/order — the R1-F7 permeability class.

Real-engine e2e — `tests/e2e/hoverhelp-geometry.spec.ts` (extend; standalone config):

- **T-E1** unclamped popover: caret center x = trigger center x ± 0.5px; caret bottom = body top ± 0.5px (side bottom); caret top = trigger bottom ± 0.5px (fills the gap).
- **T-E2** clamped fixture: expected caret center computed by applying the §3.3 clamp formula to the LIVE trigger/body rects with imported `CARET_EDGE_INSET` — asserting the formula result, which equals the raw trigger center only when unpinned. If the existing near-edge fixture produces a deep clamp (trigger center outside the valid span), this doubles as the deep-pin integration case; otherwise add a fixture variant that does. Both branches (tracking + pinned) must be exercised across T-E1/T-E2.
- **T-E3** side "top" fixture: caret top = body bottom ± 0.5px; orientation asserted via COMPUTED STYLE — for apex-down, outer caret has `border-top-width` = `` `${CARET_HEIGHT}px` `` and `border-bottom-width` = `"0px"` (and the inverse for apex-up in T-E1). Catches: unflipped triangle passing on attribute alone.
- **T-E4** real Tab-away blur-close, on a fixture WITHOUT `learnMore` (blur-close active; a body-host `learnMore` fixture would instead route Tab through the bridge and stay open by design): focus the trigger, open with Enter, press Tab → popover closes (real-engine confirmation of probe P1 through the shipped component).
- **T-E5** caret regression on scroll reflow: scroll the page, caret tracks the trigger within tolerance after a frame.
- **T-E6** visual contract, both orientations across the T-E1/T-E3 fixtures. Computed style: OUTER `border-left-width` = `border-right-width` = `` `${CARET_WIDTH / 2}px` `` with both side colors computed transparent; apex border (`border-bottom` apex-up / `border-top` apex-down) width `` `${CARET_HEIGHT}px` ``, color equal to the body's computed `border-color`. INNER: same side-border widths `` `${CARET_WIDTH / 2}px` `` with transparent computed side colors; apex border width `` `${CARET_HEIGHT}px` ``, color equal to the body's computed `background-color`. Rendered GEOMETRY (bounding-rect deltas — position math, not a clipping proof): `inner.left = outer.left ± TOL`; `inner.top - outer.top = CARET_INNER_OFFSET` (apex-up) / `-CARET_INNER_OFFSET` (apex-down) ± TOL; seam overhang `inner.bottom - body.top = CARET_INNER_OFFSET ± TOL` (apex-up) / `body.bottom - inner.top = CARET_INNER_OFFSET ± TOL` (apex-down); caret computed `z-index` equals the body's. Catches: missing/uncolored/displaced inner fill (incl. the padding-box containing-block trap), zero or wrong seam offset, token drift, stacking divergence.

Meta-test inventory: none of the candidate registries (Supabase boundaries, sentinel hiding, alert catalog, advisory locks, inline email) applies — pure client geometry + focus behavior; declared here per plan-writing rule.

## §9 Out of scope

- Hover semantics of the caret itself (pointer-events stay none; the 120ms delay already bridges the gap).
- Any change to open/close triggers, Escape containment, the Tab bridge, or the parent spec's placement steps 1-4 (caret is computed strictly after step 4).
- Vertical carets / left-right side placement (the core only places top/bottom; parent spec §4.2).
- `HelpTooltip` (the `<details>`-based in-flow disclosure) — different component, no caret.
- Closing on `relatedTarget === null` (ratified §1.1, probe P3).
- Blur-close for the modal-host `learnMore` quadrant (ratified §1.1 — reachability wins; revisit only if the parent's panel-order contract changes).
- DEFERRED.md: the `HOVERHELP-CLAMP-CARET-1` entry is REMOVED in this change's close-out commit (both folded halves shipped).

## §10 Numeric sweep (self-check)

12 (caret width; radius-md px) · 6 (caret height; GAP; triangle border width) · 1.5 (`CARET_INNER_OFFSET`: inner-triangle border-box delta; seam overhang; defined once in §3.2, pinned in T-C6) · 18 = 12 + 6 (edge inset) · 36 = 2×18 (degenerate floor, strict `<`; boundary case T-C5b) · 288 (`w-72` natural body width, §1.1 unreachability) · 120ms close delay (existing, unchanged) · 0.5px e2e tolerance (existing `TOL`) · 8 `VIEWPORT_INSET` (existing) · 15/11 (call sites / learnMore call sites, §2) · 4 quadrants (host × learnMore; 1 carved out) — each appears with one definition site; formulas and tests reference constants, not literals.

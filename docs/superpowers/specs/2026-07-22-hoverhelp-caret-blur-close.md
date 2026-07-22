# HoverHelp caret + blur-close — spec

Date: 2026-07-22 · Status: draft · Un-defers `HOVERHELP-CLAMP-CARET-1` (DEFERRED.md:11-15)
Parent spec: `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` (the positioning core this extends)

## §1 Problem

Two folded P3s from the impeccable critique of `hoverhelp-smart-position` (DEFERRED.md:13):

1. **No caret under horizontal clamp.** Step 4 of the placement core clamps the popover's x into bounds (`lib/popover/position.ts:124-125`). When the clamp slides the body away from its trigger, nothing visually ties body to trigger — precisely in the collision cases the smart-position feature serves.
2. **No blur-close.** A keyboard user opens the popover (Enter on the trigger), then Tabs away; the popover lingers with focus elsewhere. Pre-existing, amplified in modals where the portaled body is no longer visually adjacent to the trigger.

## §1.1 Resolved scope — do not relitigate

- **Caret is ALWAYS rendered** while the popover is placed (user-ratified Option A, 2026-07-22 brainstorm; mockup artifact `aa294651`). Not clamp-only: one code path, no two-state visual.
- **All caret algebra lives in the pure core** `lib/popover/position.ts`. Structural defense ratified in parent spec (position.ts:5-8): two adversarial rounds found ordering/state defects in prose math; the shell only measures and applies. Do not propose shell-side or CSS-custom-property math.
- **Blur-close is pair-scoped, not document-scoped.** Close only when focus *was inside* the trigger/body pair and `relatedTarget` lands outside both. A document-level `focusin` variant (closes hover-open popovers when focus moves anywhere on the page) was considered and rejected — broader than the finding.
- **`relatedTarget === null` is ignored** (window blur, click on non-focusable content). Deliberate: Safari does not focus buttons on click, so null-relatedTarget closes would fire spuriously mid-pointer-interaction. Conservative by design.
- **Blur-close never moves focus.** The user left deliberately; stealing focus back violates their intent. (Contrast Escape, which restores focus to the trigger — `HoverHelp.tsx:194-198` — because dismissal strands focus on a node about to `display:none`.)
- **Caret is `pointer-events-none` and `aria-hidden`.** Hover-bridging across the 6px gap is already handled by the 120ms close delay (`HoverHelp.tsx:81`, rationale at `HoverHelp.tsx:24-25`); the caret adds no interaction surface and no SR content.
- **The critique's P1 (modal Tab adjacency) stays refuted** per parent spec ratification (`2026-07-22-hoverhelp-smart-position.md:149`, recorded in DEFERRED.md:13). Out of scope here.

## §2 Current state (citations verified against worktree @ 108d98244)

- `lib/popover/position.ts` — pure core. Exports `GAP = 6` (line 16), `VIEWPORT_INSET = 8` (line 17), `Rect` (19-26), `PopoverPlacementInput` (28-39), `PopoverPlacement` (41-49: `{kind:"hidden"} | {kind:"placed"; side; viewport:{x,y}; maxHeight; maxWidth}`), `intersectRects` (51), `insetRect` (59), `computePopoverPlacement` (86-128). Step 4 horizontal clamp: lines 123-125 (`x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth)`). `effectiveWidth = Math.min(naturalSize.width, bounds.width)` (line 105); `effectiveHeight = Math.min(height0, space(side))` (line 120); `y = side === "bottom" ? trigger.bottom + GAP : trigger.top - GAP - effectiveHeight` (line 121).
- `components/admin/HoverHelp.tsx` — shell. `measureAndApply` (215-284) gathers rects, calls the core, applies inline styles; host-coordinate conversion formulas at 272-283. Hidden branch 251-266 sets `visibility:hidden` + `data-popover-hidden` and strips `data-popover-side` (264). Placed branch sets `data-popover-side` (271). Root wrapper div (451-457) carries pointer + keydown handlers, currently **no ref**. Portal (503-555) renders exactly one child (the body div). Body classes (514): `rounded-md ... overflow-y-auto ... transition-[opacity,display] duration-fast transition-discrete starting:opacity-0`, open/closed toggles `block opacity-100` vs `pointer-events-none hidden opacity-0` (515). Focus helpers: `focusInsideBody` (176-183), `scheduleClose` (184-191, 120ms via `CLOSE_DELAY_MS` line 81), `closeAndRestoreFocus` (194-198), body-host Tab bridge (386-407), `onBodyFocus` keep-open (410).
- `app/globals.css:209` — `--radius-md: 12px`; the body's `rounded-md` corner radius is 12px.
- Existing tests: `tests/lib/popover/position.test.ts` (numeric-pins the core), `tests/components/admin/HoverHelp.test.tsx`, `tests/components/admin/hoverHelpLifecycle.test.tsx`, `tests/components/admin/hoverHelpEscapeContainment.test.tsx`, `tests/e2e/hoverhelp-geometry.spec.ts` (real-engine geometry via standalone config `tests/e2e/standalone.config.ts`; derives expectations from live rects + exported `GAP`/`VIEWPORT_INSET`; bans `getBoundingClientRect` as a *clipping/visibility* proof — position math via rects is the spec's established pattern).
- No existing test asserts the portal renders exactly one child (verified: no `firstChild`/child-count queries in the HoverHelp test files), so adding a sibling caret node inside the portal breaks no structural assumption.

## §3 Design — caret

### §3.1 Why a sibling node, not a body child

The body has `overflow-y-auto` (HoverHelp.tsx:514). Per CSS Overflow computation, setting one overflow axis to a scrolling value forces the other from `visible` to `auto` — a child caret absolutely positioned outside the body's border box would be clipped. The caret is therefore a **sibling** of the body inside the same portal (the portal renders a fragment: body div + caret div). The caret is positioned in the same host coordinate space with the same conversion formulas the body uses (HoverHelp.tsx:272-283).

### §3.2 Constants (new exports from `lib/popover/position.ts`)

- `CARET_WIDTH = 12` — base width of the triangle, px.
- `CARET_HEIGHT = 6` — equals `GAP`; the caret exactly fills the trigger↔body gap.
- `CARET_EDGE_INSET = 18` — minimum distance from a body edge to the caret **center**: `--radius-md` (12px, globals.css:209) + `CARET_WIDTH / 2` (6px), so the triangle base always sits on the straight run of the body edge, never on a rounded corner.

A comment on `CARET_EDGE_INSET` notes the 12px term mirrors `--radius-md`; test T-C6 (§6) pins the sum numerically.

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

**Degenerate-width guard:** if `effectiveWidth < 2 * CARET_EDGE_INSET` (body narrower than 36px — no straight edge long enough to seat the triangle), `caret` is `null`. `kind: "hidden"` placements carry no caret by construction.

### §3.4 Shell rendering

The portal renders `<>bodyDiv, caretDiv</>`. The caret div:

- `aria-hidden="true"`, `data-testid={`${testId}-caret`}`.
- Absolutely positioned; `measureAndApply` sets `left`/`top` from `placement.caret` via the same host-conversion formulas as the body (a shared local helper converts a viewport point to host offsets so the two paths cannot drift).
- Visual: a 12×6 triangle pointing at the trigger. Implementation: a zero-size div using CSS borders — for side `"bottom"` (caret above the body, apex up): `border-left/right: 6px solid transparent; border-bottom: 6px solid <border-strong>`, with an after-pseudo-element (or nested div) inset ~1.5px drawing the same triangle in `bg-surface-raised`, so the caret reads as a continuation of the body's 1px `border-border-strong` + fill (both tokens already on the body, HoverHelp.tsx:514). For side `"top"` the borders flip (apex down). Side selection reads `placement.side` — the shell sets `data-popover-side` on the caret too, and Tailwind arbitrary-variant or two class branches keyed on that attribute pick the orientation.
- `pointer-events-none` always (§1.1).
- `z-50` (same layer as the body, HoverHelp.tsx:514); DOM-after the body so it paints over the body's border seam.
- Open/close: the caret carries the SAME open/close class toggle as the body (`block opacity-100` vs `pointer-events-none hidden opacity-0` plus `transition-[opacity,display] duration-fast transition-discrete starting:opacity-0`) so both fade as one unit.
- Collision-hidden: when the placed→hidden branch runs (HoverHelp.tsx:251-266), the shell sets the caret's `visibility:hidden` alongside the body's, and clears it on the placed branch — the caret must never be visible while the body is hidden. When `placement.caret === null` on a placed result, the caret alone gets `visibility:hidden`.
- Effect cleanup (HoverHelp.tsx:310-327) resets the caret's `visibility` the same way it resets the body's.

### §3.5 Guard conditions (caret)

| Condition | Behavior |
| --- | --- |
| `kind: "hidden"` | No caret data; shell hides caret with body. |
| `effectiveWidth < 36` | `caret: null`; body renders, caret hidden. |
| Trigger center outside body span (deep clamp) | Caret pinned at `CARET_EDGE_INSET` from the nearer body edge — still the closest honest pointer. |
| `maxWidth` active (body clamped to bounds width) | Formulas use `effectiveWidth`, unchanged. |
| Closed popover | Caret has `hidden` class like the body; no box, no scrollWidth contribution (the BELL-HELP-POPOVER-OVERFLOW-1 class, HoverHelp.tsx:490-498, applies identically). |
| SSR / first client render | Caret is inside the same `mounted`-gated portal (HoverHelp.tsx:503); nothing renders before mount. |

## §4 Design — blur-close

### §4.1 Mechanism

Add `rootRef` to the wrapper div (HoverHelp.tsx:451). One handler, attached as `onBlur` (React's synthetic wrapper over native bubbling `focusout`) on **both** the root wrapper and the portaled body:

```ts
const onPairBlur = (e: ReactFocusEvent) => {
  if (!open) return;
  const rt = e.relatedTarget;
  if (!(rt instanceof Node)) return;            // null → window blur / non-focusable click: ignore (§1.1)
  if (rootRef.current?.contains(rt)) return;    // trigger side
  if (bodyRef.current?.contains(rt)) return;    // body side (portaled, NOT a DOM descendant of root)
  clearCloseTimer();
  setOpen(false);                               // no focus restore (§1.1)
};
```

`focusout` fires only when focus leaves a node that contained it, so hover-only popovers (focus never inside the pair) are structurally unaffected.

### §4.2 Interaction matrix (every existing focus path re-checked)

| Path | relatedTarget | Result |
| --- | --- | --- |
| Tab away from trigger (modal trap or page) | next focusable, outside pair | **closes** — the finding's fix |
| Shift-Tab from trigger to previous control | outside pair | **closes** |
| Trigger → body link via bridge (`onTriggerKeyDown`, HoverHelp.tsx:389-394) | link, inside body | stays open |
| Bridge forward-Tab off link (HoverHelp.tsx:396-407): `setOpen(false)` + focus trigger | trigger, inside root | no double-close; blur handler no-ops |
| Bridge Shift-Tab link → trigger (401) | trigger, inside root | stays open |
| Escape with focus in body (`closeAndRestoreFocus`, 194-198): focuses trigger, then closes | trigger, inside root | no interference |
| Collision-hidden with focus in body (251-261): closes + focuses trigger | trigger, inside root | no interference |
| Click on popover text (non-focusable) | `null` (or body element outside pair in some engines) | null → ignored; if an engine reports `<body>`, popover closes — acceptable: pointer paths re-open on hover, and click-to-dismiss is a reasonable outcome |
| Window/tab switch | `null` | ignored; popover stays, Escape/hover-out still close |
| Focus wanders while popover was hover-opened (focus never inside) | — | `focusout` never fires on the pair; unchanged |

### §4.3 Ordering note

React invokes `onBlur` after the browser has moved focus; `document.activeElement` is already the new target, so `focusInsideBody()` (176-183) inside a concurrently-pending `scheduleClose` timer sees the post-move state — no ordering hazard. The handler calls `clearCloseTimer()` before `setOpen(false)` so a stale 120ms timer cannot re-fire.

## §5 Mode boundaries

Both features apply identically in both host modes (modal `PopoverHostContext` host and `document.body` fallback, HoverHelp.tsx:69-79): the caret is placed in host coordinates by the same formulas, and blur-close reads only refs. The body-host Tab **bridge** (386-407) remains body-host-only — unchanged. Default vs `learnMore`/`afterBody` (disclosure) modes share the caret and blur-close identically; no per-mode variation.

## §6 Transition inventory

Caret visual states: **closed**, **placed-visible**, **suppressed** (body placed but `caret: null`, or body collision-hidden). Pairs:

| From → To | Treatment |
| --- | --- |
| closed → placed-visible | fades with body (`transition-discrete` + `starting:opacity-0`, same classes) |
| placed-visible → closed | fades with body (display transition; degrades to instant where unsupported — same degradation as body, HoverHelp.tsx:499-502) |
| placed-visible → suppressed | instant (`visibility:hidden`) — collision hiding is already instant for the body |
| suppressed → placed-visible | instant — symmetric |
| closed → suppressed | unreachable as a visual change (both invisible) |
| suppressed → closed | invisible → invisible; class flip only |
| position updates while placed (scroll/resize reflow) | instant per-frame inline-style writes, same as body (§4.3 of parent spec) |

Compound: open fade begins while a reflow frame is pending — both nodes get styles in the same `measureAndApply` call, so they cannot tear. Blur-close mid-open-fade: `setOpen(false)` flips both nodes' classes in the same commit.

Popover open/close states themselves are unchanged from the parent spec's inventory (`2026-07-22-hoverhelp-smart-position.md` §4.6).

## §7 Dimensional invariants

No fixed-dimension parent with flex/grid children is introduced (the caret is absolutely positioned, zero-size-with-borders). The load-bearing geometric invariants are positional, asserted in the real-engine e2e (§8 T-E1..E3): caret box abuts the body edge (`caretBottom === bodyTop` for side bottom, within 0.5px), caret center x equals clamped trigger center x, caret never overlaps a rounded corner (`caretCenterX ∈ [bodyLeft+18, bodyRight-18]`).

## §8 Test plan

Unit — `tests/lib/popover/position.test.ts` (extend):

- **T-C1** unclamped: caret center = trigger center; `caret.y = trigger.bottom` (side bottom).
- **T-C2** right-edge clamp: body slides left; caret center = trigger center while it fits, pinned at `x + effectiveWidth - 18` under deep clamp.
- **T-C3** left-edge clamp mirror (align "right").
- **T-C4** side "top": `caret.y = trigger.top - GAP`.
- **T-C5** degenerate width (`bounds.width < 36`, so `effectiveWidth < 36`): `caret: null`, body still placed.
- **T-C6** constants pinned: `CARET_WIDTH === 12`, `CARET_HEIGHT === GAP`, `CARET_EDGE_INSET === 12 + CARET_WIDTH / 2`.
- **T-C7** `maxWidth` active: caret formulas use `effectiveWidth` (caret stays inside the clamped body span).
- Failure modes caught: caret math drifting out of the core, inset regressions letting the caret ride a rounded corner, caret rendered on hidden placements.

Component (jsdom) — a NEW blur-close test file under `tests/components/admin/` (name: hoverHelpBlurClose, created by the plan):

- **T-B1** open via click; dispatch `focusout` on trigger with `relatedTarget` = outside button → closed (`aria-expanded` false, body has `hidden` class). Catches: missing blur-close.
- **T-B2** `relatedTarget` = body link (inside pair) → stays open. Catches: pair-containment check missing the portaled body.
- **T-B3** `relatedTarget: null` → stays open. Catches: over-eager close on window blur/Safari click.
- **T-B4** bridge forward-Tab path still lands focus on trigger with popover closed, no error (regression guard for §4.2 rows 4-5).
- **T-B5** hover-open (pointer, focus elsewhere), then move focus between two outside buttons → stays open. Catches: document-scoped listener creep.
- jsdom is legitimate here: these assert event-handler logic with synthesized `FocusEvent`s, not real focus traversal — that lives in T-E4.

Component (jsdom) — caret presence in existing shells (`hoverHelpLifecycle.test.tsx` extend): caret node exists in portal, `aria-hidden="true"`, `pointer-events-none` class, carries `hidden` class while closed. (No geometry in jsdom — no layout.)

Real-engine e2e — `tests/e2e/hoverhelp-geometry.spec.ts` (extend; standalone config, expectations derived from live rects + exported constants, never hardcoded):

- **T-E1** unclamped popover: caret center x = trigger center x ± 0.5px; caret bottom = body top ± 0.5px (side bottom).
- **T-E2** clamped-near-edge fixture (the existing clamp scenario): body x pinned to bounds, caret center x still = trigger center x ± 0.5px, and `caretCenterX ≥ bodyLeft + 18`.
- **T-E3** side "top" fixture: caret top = body bottom ± 0.5px, apex orientation attribute (`data-popover-side="top"`) present on the caret.
- **T-E4** real Tab-away blur-close: focus the trigger, open with Enter, press Tab → popover closes (this is the empirical verification of real `focusout`/`relatedTarget` semantics that jsdom cannot provide; satisfies the empirical-probe rule for the focus surface).
- **T-E5** caret regression on scroll reflow: scroll the page, caret tracks the trigger within tolerance after a frame.

Meta-test inventory: none of the candidate registries (Supabase boundaries, sentinel hiding, alert catalog, advisory locks, inline email) applies — pure client geometry + focus behavior; declared here per plan-writing rule.

## §9 Out of scope

- Hover semantics of the caret itself (pointer-events stay none; the 120ms delay already bridges the gap).
- Any change to open/close triggers, Escape containment, the Tab bridge, or the parent spec's placement steps 1-4 (caret is computed strictly after step 4).
- Vertical carets / left-right side placement (the core only places top/bottom; parent spec §4.2).
- `HelpTooltip` (the `<details>`-based in-flow disclosure) — different component, no caret.
- Closing on `relatedTarget === null` (ratified §1.1).
- DEFERRED.md: the `HOVERHELP-CLAMP-CARET-1` entry is REMOVED in this change's close-out commit (both folded halves shipped).

## §10 Numeric sweep (self-check)

12 (caret width; radius-md px) · 6 (caret height; GAP) · 18 = 12 + 6 (edge inset) · 36 = 2×18 (degenerate width floor) · 120ms close delay (existing, unchanged) · 0.5px e2e tolerance (existing `TOL`) · 8 `VIEWPORT_INSET` (existing) — each appears with one definition site; formulas reference constants, not literals.

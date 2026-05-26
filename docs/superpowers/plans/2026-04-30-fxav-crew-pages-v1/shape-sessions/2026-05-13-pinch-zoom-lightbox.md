# Shape brief — Pinch-zoom for the diagrams lightbox

**Cluster**: M9 C6c (closing M7-D4)
**Surface**: `components/diagrams/GalleryLightbox.tsx`
**Register**: product (UI serves the product; lives inside `app/show/[slug]`)
**Authored**: 2026-05-13
**Method**: `/impeccable shape` per AGENTS.md UI invariant 8

## 1. Feature summary

Add pinch-zoom to the existing diagrams lightbox so crew on venue floors can read fine details on stage plots, signal-flow diagrams, and lighting plots from their phones. The lightbox already handles open / dismiss / swipe-to-next-diagram via Embla + framer-motion + WCAG dialog focus; this brief defines the gesture, state-machine, and chrome additions that layer zoom on top without breaking the existing model.

## 2. Primary user action

A crew member on the venue floor pinches two fingers apart on a diagram to zoom in, drags with one finger to pan to the fixture they need to read, and double-taps (or hits the visible "Reset" chip) to return to fit-to-screen.

## 3. Design direction

**Color strategy:** Restrained. The lightbox already uses the project's Restrained palette — tinted-neutral surface (`bg-bg/95 backdrop-blur-sm`), `text-text-strong` chrome, neutral chevrons + close button. The single new chrome element (Reset chip) uses the same neutral chrome language. FXAV orange is reserved for hero brand moments and recovery affordances elsewhere; a frequently-visible zoom-reset would push accent-color ratio past DESIGN.md's restrained budget.

**Theme scene sentence:** A lighting designer at 4pm in a hotel ballroom is squinting at a signal-flow diagram on her phone trying to confirm channel 17 routes to FOH-L; the house lights are still up and the phone is at arm's length. The scene forces dark surface with high contrast — the existing `bg-bg/95` semi-translucent over the dimmed crew page reads correctly here.

**Anchor references:**
- iOS Photos full-screen viewer (pinch + double-tap + pan semantics).
- Apple Preview.app keyboard zoom (+/-/0 conventions).
- macOS trackpad pinch-zoom on images (cmd-scroll fallback).

## 4. Scope

- **Fidelity:** production-ready. Closing C6c is the goal; this ships.
- **Breadth:** single component (`GalleryLightbox.tsx`) plus one new dep (`react-zoom-pan-pinch`).
- **Interactivity:** shipped-quality. Touch, mouse, trackpad, keyboard all bound.
- **Time intent:** polish until it ships. Expected ~2 hours implementation + 1 hour test + 30 min iOS device verification.

## 5. Layout strategy

The lightbox structure stays unchanged: `<header>` (page indicator left, close right) → `<div class="flex flex-1 overflow-hidden">` containing the Embla viewport + flanking chevron buttons. Each Embla slide (the `<figure>` per diagram) becomes the new zoom context.

**One layout addition:** a Reset chip slot directly below the header, centered, visible only when `scale > 1`. Slides in via height + opacity transition (under reduced motion: instant appear). The chip sits in its own row so it never crowds the page indicator or close button; the diagram viewport collapses by the chip's height (~36px) when active, which is acceptable because the diagram remains fully visible and the user already has the focal region they zoomed into.

## 6. Key states

Every state below names what the user needs to see and feel.

| State | Scale | Single-finger drag | Two-finger pinch | Embla swipe-to-next | Reset chip | Chevrons |
|---|---|---|---|---|---|---|
| Default / fit-to-screen | `1` | — (Embla consumes) | activates zoom | enabled | hidden | enabled if multi-image |
| Zooming (active gesture) | `1 < s ≤ 4` | tracks pointer for pan | tracks distance for scale | disabled | visible | enabled (resets zoom on navigate) |
| Zoomed, idle | `1 < s ≤ 4` | pans image (clamped to edges) | continues zoom | disabled | visible | enabled (resets zoom on navigate) |
| Image-load failed (existing branch) | n/a | — | — | enabled | hidden | enabled |
| Diagram navigation while zoomed | `→ 1` | resets to default behavior | — | — | hides | — |

**State transitions:**

- `1×` → `>1×`: triggered by pinch-out OR `+` key OR ctrl/cmd-scroll OR trackpad pinch. Reset chip slides in (220ms opacity + height; reduced motion: instant).
- `>1×` → `1×`: double-tap on image OR tap Reset chip OR `0` key OR chevron-to-next-diagram. Reset chip slides out.
- During the zoomed state, the existing focus trap remains intact (Reset chip is keyboard-focusable, integrated into the tab order between page indicator and close button).
- The lightbox dismiss interactions (Escape, tap-outside header) are UNCHANGED at any zoom level — tap-outside-the-image still closes the lightbox; pinch-pan only happens with the finger ON the image.

## 7. Interaction model

### Gesture coexistence (the central decision)

When `scale > 1`, Embla's horizontal swipe handler is **disabled**. Single-finger horizontal drag pans the image within its zoom container, clamped to the image edges. To navigate to a different diagram while zoomed, the user must:
- Tap a chevron button (always visible, always enabled when applicable) — navigating resets zoom to `1×` for the new diagram.
- Double-tap to reset, then swipe (familiar).
- Press the Reset chip, then swipe.

This is the cleanest mental model and matches iOS Photos. The "pan-until-edge-then-swipe" pattern was rejected because dense diagrams at 4× zoom make the swipe handoff nearly unreachable (user has to drag the image off-screen entirely).

### Per-input mappings

| Input | At `scale = 1` | At `scale > 1` |
|---|---|---|
| One-finger drag horizontal | Embla swipe to prev/next | Pan image |
| Two-finger pinch | Zoom in/out | Continue zoom |
| Double-tap image | Toggle to 2× (preset midpoint) | Reset to 1× |
| Mouse click + drag | (no-op) | Pan image |
| Mouse wheel | (no-op) | Zoom (with ctrl/cmd) |
| Mac trackpad pinch | Zoom in/out | Continue zoom |
| ← / → | Prev / next diagram | Pan image left/right (clamped) |
| ↑ / ↓ | (no-op) | Pan image up/down (clamped) |
| `+` / `=` | Zoom in to 1.5× | Zoom in by 0.5× step (max 4×) |
| `-` / `_` | (no-op) | Zoom out by 0.5× step (min 1×) |
| `0` | (no-op) | Reset to 1× |
| Escape | Close lightbox | Close lightbox (zoom is part of session, not persistent) |
| Tab | Move through chrome focusables (no Reset chip in tab order) | Move through chrome focusables INCLUDING Reset chip |

### Reduced motion

`prefers-reduced-motion: reduce` does NOT disable pinch — direct-manipulation gestures aren't animations in the WCAG 2.3 sense. Under reduced motion:
- Scale tracks pinch distance 1:1 with no interpolation, no spring, no momentum.
- Double-tap snaps instantly (no scale interpolation between 1× and 2×).
- Reset chip slide-in is instant (no opacity/height transition).
- Existing Embla scrub (already 0 under reduced motion) and lightbox entry/exit (already 0 under reduced motion) are unchanged.

### iOS Safari `touch-action` posture

The arbitration between "child handles pinch" vs. "Safari page-zooms the viewport" is solved at the lightbox-root level: the dialog root carries `touch-action: none` only when scale > 1 (so the underlying page is not eligible for browser-handled pinch). At `scale = 1`, `touch-action: pan-x` on the Embla viewport (already implicit via Embla's defaults) is retained so horizontal swipe to next/prev works.

iOS Safari only honors `touch-action: auto` and `manipulation`, NOT `none` or finer-grained values at the dialog root in older Safari versions. The library (`react-zoom-pan-pinch`) handles this via `preventDefault` on `pointerdown`/`pointermove` from the zoomed wrapper specifically — which Safari respects. The dialog root falls back to `touch-action: manipulation` (the iOS-supported value closest to "no double-tap zoom, no pinch-zoom of the viewport"). The library wrapper inside owns gesture priority via JS event-cancellation, not CSS.

### Inter-diagram zoom persistence

Resetting to `1×` on diagram change is the chosen model. Each diagram is its own zoom context.

## 8. Content requirements

| Element | Copy | Notes |
|---|---|---|
| Reset chip text | `Reset` | Single word; localizable. Icon (`↻` Lucide `RotateCcw`) precedes text. |
| Reset chip `aria-label` | `Reset zoom` | More descriptive for SR users. Distinct from the visible "Reset" text. |
| Zoom level announcement | `Zoomed to 2.0×` (etc.) | Live region (polite) updates when scale changes by ≥ 0.5×. Coalesced to one announcement per gesture-end via debounce. |
| Existing page indicator | (unchanged) | Still reads `1 of 5`. |
| Existing close button label | (unchanged) | Still `Close gallery`. |

**Microcopy rationale:** "Reset" is the canonical word in image-viewer chrome (Preview.app, Photoshop "Fit Screen", Lightroom "Reset"). "Fit to screen" would be more specific but uses more characters and crowds the chip. `↻` icon disambiguates without internationalization risk.

## 9. Recommended impeccable references during craft

- `interaction-design.md` — gesture mapping table, state machine, keyboard semantics, focus-trap integration.
- `motion-design.md` — reset-chip slide-in, reduced-motion gating, the no-momentum policy.
- `responsive-design.md` — touch-action arbitration, iOS Safari fallback, viewport behavior on rotation while zoomed.

## 10a. Implementation discovery — keyboard model revised during craft

During craft, react-zoom-pan-pinch v4.0.3 was confirmed to have **no `keyEvents` prop** in its TypeScript signature (verified against `node_modules/react-zoom-pan-pinch/dist/index.d.ts`). All keyboard support in the library is imperative through `useControls()` (`zoomIn`, `zoomOut`, `setTransform`, `resetTransform`). The shape brief §7 originally planned to delegate arrow-pan-when-zoomed to the library; the lightbox now owns the full keymap instead.

**Revised keymap (replaces the §7 per-input table for arrow keys):**

| Input | At `scale = 1` | At `scale > 1` |
|---|---|---|
| ArrowLeft / ArrowRight | Prev / next diagram (Embla) | Prev / next diagram (chevron handler auto-resets scale before scrolling) |

Other keys are unchanged from §7:
- `0` resets zoom (via `controlsSlotRef.current?.resetTransform()`).
- `+` / `=` zoom in by 0.5× step (via `controlsSlotRef.current?.zoomIn(0.5)`).
- `-` / `_` zoom out by 0.5× step (via `controlsSlotRef.current?.zoomOut(0.5)`).
- `Escape` closes the lightbox.

**Trade-off:** keyboard users who zoom in cannot pan via arrow keys. They can still zoom via `+` / `-`, reset via `0`, and navigate diagrams via arrows. Touch/mouse/trackpad users get full pan via drag. This was an acceptable narrowing because the primary use case (crew on venue floor) is touch-driven; keyboard users at desktop will rarely pinch-zoom a diagram in the first place. If we later need arrow-pan-when-zoomed, it can be implemented via `setTransform(currentX + delta, currentY, currentScale)` reading state from `useTransformContext`.

## 10b. Implementation discovery — Playwright synthetic-pinch deferred to manual iOS smoke

The brief's §11 test strategy included a Playwright real-browser test for synthetic multi-touch pinch. During craft, two factors deferred this:

1. **No existing diagram-lightbox e2e fixture.** Adding one requires a seeded show with diagrams + an authenticated session, which is significant scope for a single test.
2. **CDP multi-touch synthesis is brittle.** Playwright's `page.touchscreen` only handles single-touch; multi-touch requires `sendCDPSession('Input.dispatchTouchEvent')` with a custom `touchPoints` array. Synthetic pinch in headless Chromium often diverges from real-device behavior anyway.

The 16-test jsdom suite (`tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx`) pins the lightbox's contract surface (state machine, chrome, keyboard, library prop bag, touch-action posture). The library itself has its own test suite for pinch mechanics. The manual iOS device smoke described in §11 / §14 remains the canonical real-device verification step.

## 10. Open questions for craft

1. **Reset on diagram-change uses Embla's `select` event or a parent-driven prop change?** Implementation choice; the contract is "scale returns to 1 when activeIndex changes." Defer to the library's transform-state API.
2. **Zoom-level announcement debounce window** — 150ms after `gesture-end`? Tunable per real-device testing; not user-facing.
3. **Pinch on the unavailable-image placeholder** — placeholder is a flex div, not an `<img>`. Library should be wrapped at the `<figure>` level so the placeholder is never zoomable. Confirmed: no-op when `item.available && !failedKeys.has(item.key)` is false.
4. **Browser support for `touch-action: none` on the dialog root under iOS Safari 17+** — verify on device. The library handles the JS-level cancellation, but if Safari 17 honors `touch-action: none` more broadly, the CSS posture can simplify. Real-device check answers this.

## 11. Test strategy

- **Unit/structural tests (jsdom):** state machine — `scale === 1` enables Embla, `scale > 1` disables Embla; reset chip visible/hidden gated on scale; reset chip click sets scale to 1; double-tap toggles 1↔2; keyboard mappings; reduced-motion does NOT disable pinch.
- **Real-browser tests (Playwright, Chromium):** synthetic two-pointer pinch sequence on the lightbox image, assert the inner image's `transform: scale()` matches expectation; double-tap event sequence; chevron-while-zoomed resets scale.
- **Dimensional invariants (Playwright, real browser):** lightbox `<figure>` retains full viewport dimensions at scale=1; image fills figure within ±0.5px.
- **iOS Safari device-smoke (manual, ~5 min):** confirm `touch-action` arbitration prevents Safari page-zoom while child pinch works; confirm two-finger pinch doesn't trigger Safari's "two-finger swipe back" navigation gesture; confirm the focus trap is preserved.

## 12. Anti-goals

- Do NOT animate zoom transitions (no spring, no momentum) — direct manipulation only. The existing framer-motion entry/exit is preserved; nothing new gets a `transition` property on `scale`.
- Do NOT add a zoom slider control. Pinch / wheel / keys cover the input space.
- Do NOT add a magnifier-loupe pattern. Crew should pinch the whole image, not chase a virtual lens.
- Do NOT change the lightbox dismiss model. Escape and tap-outside-image still close at any zoom.
- Do NOT persist zoom state across diagram changes (per Round 2 answer).
- Do NOT use `touch-action: none` on the entire dialog root unconditionally — Embla's swipe handler depends on `pan-x` at scale=1.

## 13. Library choice — why `react-zoom-pan-pinch`

- 16k+ stars, weekly downloads in millions, actively maintained.
- iOS Safari blur fix is baked in (a known issue in hand-rolled implementations where Safari rasterizes the zoomed image at 1× DPR and shows blurry pixels).
- Documented React-carousel composition pattern: each carousel slide gets its own `<TransformWrapper>`.
- ~9 KB gzipped; compares favorably to hand-rolled (~150 lines of pointer math + Safari workarounds = roughly the same shipping cost minus the battle-testing).
- API gives us the `scale` value we need to toggle Embla — `useControls()` and `useTransformEffect()` expose state imperatively.

Rejected alternatives:
- **Hand-rolled W3C Pointer Events:** Re-solves the iOS quirk class. More test surface. Defensible only if the dep is a blocker for some reason (it isn't).
- **`react-quick-pinch-zoom`:** Smaller, less battle-tested. Thinner docs on carousel composition.

## 14. Definition of done

- `react-zoom-pan-pinch` added to `package.json`; `pnpm install` clean.
- `GalleryLightbox.tsx` wraps each `<figure>`'s `<img>` in a `<TransformWrapper>` configured with `min=1, max=4, double-tap-step=2`.
- Reset chip rendered in the header region, visible-when-scale>1, accessible (keyboard focusable, `aria-label`, included in dialog focus trap).
- Zoom-level live-region announcement implemented and coalesced.
- Embla swipe disabled at scale > 1 via Embla's `reInit({ watchDrag: scale === 1 })` or the equivalent gesture-handler prop.
- Reduced-motion path verified — pinch works, scale changes are instant.
- Keyboard mappings implemented (+ / - / 0 / arrows-when-zoomed-pan).
- Unit tests pass (state machine, gesture-toggle, reset chip, keyboard).
- Real-browser Playwright tests pass (synthetic pinch → scale assertion).
- iOS Safari device smoke check passes (manual, on a real iPhone iOS 16+).
- `/impeccable critique` + `/impeccable audit` pass on the diff per AGENTS.md invariant 8.
- Cross-model adversarial review (Codex) returns APPROVE.
- Commit message: `feat(diagrams): pinch-zoom on lightbox (M7-D4 / M9 C6c)`.

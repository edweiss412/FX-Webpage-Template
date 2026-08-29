# The attention menu stops opening itself on a phone

**Row:** `BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE` (BACKLOG.md). **Branch:** `fix/attention-autoopen-suppress-phone`. **Filed:** 2026-08-28. **Drafted:** 2026-08-29.

## 1. What is wrong

The published review modal auto-opens its attention menu once per mount when actionable items exist (`docs/superpowers/specs/2026-07-19-published-show-alerts.md:148`, "Auto-open (user requirement): opens once per modal mount when `actionableCount > 0`"). Since the panel became CONTAINED inside the review-modal clip (`fix/attention-panel-left-overflow`, 2026-08-28), it fills the horizontal band its anchor sits in. At 375px that band holds the published toggle.

Probed 2026-08-28 at 375x667, real Chromium, on the published review modal:

```
menu   left 8       right 367     width 359    (contained: clip is 0..375)
clip   left 0       right 375
toggle left 307     right 355     top 497      bottom 525
overlaps: true      pointer events intercepted by an attention monitoring row
```

An operator arriving on a phone finds the primary publish control unreachable until they dismiss a menu they never opened.

The geometry is not the defect, and this is the part worth carrying. A dismissible overlay sitting on top of the publish control is ordinary menu behavior when the operator asked for the menu, because dismissing it is then a step in a flow they started. Nobody asked here. The panel is an index, a navigation aid, and the surface opens it on top of the modal's primary action to tell Doug what the pill already tells him: there are N issues. Moving the panel would relocate the interruption, not remove it.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Suppress auto-open below `sm`; do NOT move the panel.** Repositioning (flip above the anchor at phone widths) was considered and DECLINED. | Eric, 2026-08-29, adopting impeccable design review Assessment A, relayed in this arc's orchestrator brief (untracked, issued outside the repo). The recommendation it adopts, and its reasoning, are on the row: BACKLOG.md, the design-review paragraph dated 2026-08-29 under `BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE`. |
| The prior ruling (accept the overlap, ship as is, standard dismissible-overlay semantics) is SUPERSEDED. | Same decision. The row records the 2026-08-28 bl-orch ruling it replaces. |
| The pill is unchanged. It stays a legible, accented, tappable count, and it is the whole phone-width affordance. | Eric's decision names the pill as what makes suppression acceptable. §6 verifies the count reaches assistive tech; it needs no code change. |
| Desktop behavior is unchanged. At ≥`sm` the menu still auto-opens exactly as `published-show-alerts` §5.2 specifies. | §2. This spec narrows a user requirement by viewport, it does not retire it. |
| The `sm` boundary is 640px and is not re-derived here. | `app/globals.css:318` `--breakpoint-sm: 640px;`, already the modal's own sheet/popup boundary: `isSheet` at `components/admin/review/ReviewModalShell.tsx:386` and `mql` at `components/admin/review/ReviewModalShell.tsx:571`. |
| Suppression is a ONE-SHOT decision taken at the moment the reveal would have fired. It is not a live media subscription, and no resize ever force-closes a menu. | §4. Stated because the obvious alternative (a `matchMedia` change listener that closes the panel when the viewport shrinks) takes away something the operator opened. |
| Escape-transparency, focus rescue, deep-link suppression, and the compound reconciliation that closes the menu when the last actionable item resolves are all untouched. | Scope fence. `onResolved` and `alertScrollFiredRef` in `components/admin/showpage/PublishedReviewModal.tsx`; `escTransparentUntilEngaged` at `components/admin/wizard/WizardAttentionMenu.tsx:102`. |
| No new error code, no §12.4 row, no catalog copy. | Nothing user-visible is added; a panel simply does not open. |

## 2. The predicate

Auto-open fires only when the viewport is NOT positively known to be below `sm`.

```ts
// Phone-width suppression (2026-08-29). Auto-open is a first-arrival reveal;
// at <sm the contained panel covers the published toggle, so the pill is the
// whole affordance and the operator opens the menu by tapping it.
const suppressedByWidth =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 639.98px)").matches;
```

Three properties, each deliberate:

**It is a suppression, so it demands positive evidence.** The query asks "is this a phone?" and suppresses only on `true`. The alternative spelling, `!matchMedia("(min-width: 640px)").matches`, asks the same question backwards and suppresses whenever the answer is unavailable. Auto-open is the shipped behavior and the one the desktop operator wants; an environment that cannot answer should keep it.

**639.98, not 640.** `(max-width: 640px)` and `(min-width: 640px)` both match at exactly 640, so the pair would overlap by one CSS pixel. The 0.02 step is the standard complement and leaves no fractional gap for a viewport at 639.5.

**`typeof window.matchMedia === "function"` is the same jsdom guard the shell already uses** (`components/admin/review/ReviewModalShell.tsx:569`, "Guard: jsdom implements no matchMedia; every target browser does"). This project's jsdom setup installs a stub that answers `matches: false` to every query (`tests/setup.ts:84-95`), so under jsdom the guard passes, the query answers false, and auto-open behaves exactly as it does today. That is the point: every existing jsdom suite that renders an auto-opened menu keeps passing without a stub of its own, and a jsdom test that wants to assert suppression overrides `window.matchMedia` in its own file, which the setup comment already documents as the supported per-file idiom.

### 2.1 Where it goes

Inside the existing auto-open effect in `components/admin/showpage/PublishedReviewModal.tsx` (the `autoOpenFiredRef` effect), as the LAST guard, immediately before `requestAnimationFrame`:

```ts
if (actionable.length === 0) return;              // unchanged, does NOT consume
if (suppressedByWidth) {
  autoOpenFiredRef.current = true;               // a DECISION, so it consumes
  return;
}
const raf = requestAnimationFrame(() => { ... }); // unchanged
```

Placement is load-bearing in both directions:

- **After the `actionable.length === 0` return**, because that return deliberately does not consume the one-shot: the revalidate-on-open `router.refresh()` can stream actionable items in after a prefetched empty first paint, and consuming early would cancel the desktop reveal. Suppression must not change when that guard fires.
- **Before the rAF**, and consuming synchronously, because the rAF's own contract is that a CANCELLED frame leaves the one-shot unconsumed so a re-run can reschedule. A suppression scheduled into a frame that then gets cancelled would be re-decided on every dependency change, which is a subscription by accident. Suppression is a decision, and it joins the two branches above it that already consume when they decide: the deep-link branch (`alertId != null`) and the already-open branch.

The effect's dependency array is unchanged: `[alertId, actionable.length, menuOpen]`. Width is deliberately not a dependency; see §4.

## 3. SSR and first paint

The auto-open lives in a `useEffect`, which never runs on the server, so the server-rendered HTML has always had the menu closed and this change does not move that byte. There is no hydration branch on viewport width, no `window` read during render, and therefore no hydration mismatch to reason about.

First client paint is likewise unchanged: the menu is closed in the initial DOM on every width, and on desktop it opens on the next animation frame exactly as before. The phone case simply stops at "closed", which is the state the markup already ships.

Stated explicitly because the tempting implementation is a `useState` initialized from `window.innerWidth`, which reads the viewport during render and is exactly the shape that produces a hydration mismatch. This spec does not do that; there is no width state.

## 4. Resize across the boundary

Two directions, one rule each, and the rule is the same in both: **auto-open decides once per mount, and a resize never revisits the decision.**

| Situation | Behavior | Why |
| --- | --- | --- |
| Menu auto-opened at ≥`sm`, viewport then shrinks below `sm` (window drag, or a rotate from landscape to portrait) | The menu STAYS OPEN. Nothing force-closes it. | It is on screen; taking it away mid-glance is a second uninvited interruption. Dismissal is already one tap on the pill, the scrim, or Escape. |
| Menu suppressed at <`sm`, viewport then grows to ≥`sm` (rotate to landscape at 667px, or a desktop window widening) | The menu STAYS CLOSED. Auto-open does not fire retroactively. | The one-shot was consumed by the suppression (§2.1). A resize is not an arrival, and popping a panel open under the operator's hands because they turned the phone sideways is the same defect this arc is closing. |
| Operator OPENED the menu by tapping the pill at <`sm`, then resizes either way | Untouched. This spec never closes a menu, and the pill toggle is not gated by width. | Suppression governs the automatic reveal only. |

The mechanism is the dependency array, and it is a code fact rather than a design intention: the effect's deps are `[alertId, actionable.length, menuOpen]`, none of which a resize changes, so a resize alone does not re-run the effect at all. Consuming the one-shot on suppression closes the remaining path, where a LATER dependency change (an item resolving, say) re-runs the effect at a width that has since crossed the boundary. This is why width is not in the dependency array and why there is no `matchMedia` change listener anywhere in the change. The single existing `(min-width: 640px)` listener, `mql` at `components/admin/review/ReviewModalShell.tsx:571`, is drag hygiene and is not extended.

The consequence worth naming: an operator who loads the modal at 375, rotates to landscape, and wants the index taps the pill. That is one tap, on a control the spec keeps deliberately prominent, and it is the same tap they would use at 375.

## 5. Sweep: the other consumer of this shape

`rg -n "autoOpen|auto-open" components app lib` returns exactly two components that auto-open an attention menu:

| Site | Predicate today |
| --- | --- |
| `components/admin/showpage/PublishedReviewModal.tsx`, the `autoOpenFiredRef` effect | `alertId == null && !menuOpen && actionable.length > 0` |
| `components/admin/wizard/Step3ReviewModal.tsx`, the `autoOpenFiredRef` effect | `pillInteractive && !menuOpen && n > 0` (`n` = needs-look count) |

They are the same shape: a one-shot ref, an early return that does not consume, a consuming already-open branch, and a rAF that opens the panel. The wizard copy names the published one as its precedent (`Step3ReviewModal.tsx`, the "Reconciliation, following the published modal's probe-ratified mechanism" comment).

They do NOT share a rationale. The published auto-open is ratified as a user requirement about actionable items (`published-show-alerts` §5.2). The wizard's is ratified separately and differently, on 2026-08-27: "the operator pressed Review to review; the index is the thing they were missing" (`docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md:34`).

**Disposition is decided by probe, not by symmetry.** The class-sweep default is that every instance of one shape is repaired in the same PR, and the wizard is an instance of the shape. What it is not yet known to be is an instance of the DEFECT: the published row's evidence is a measured occlusion of the publish toggle, and no equivalent measurement exists for the wizard modal at 375. So:

- **Probe P-1 (§9) measures the wizard modal at 375x667** with its menu auto-opened: does the panel's rect intersect any interactive control, and does `elementFromPoint` at each control's centre return the panel?
- **If it occludes an interactive control** the wizard is repaired in this same PR, with the identical predicate at the identical position in its effect.
- **If it occludes nothing**, suppressing it anyway would be reversing a product decision ratified two days earlier on grounds this arc has no evidence against. That is class-sweep exception (a), a decision this PR cannot settle, and it files as a `BL-` row naming the probe result and the ratification it would overturn. It does not silently ride along.

Either outcome is recorded here before the implementation lands, so neither is a judgment call made under review pressure.

No other surface consumes this shape. `components/admin/showpage/AttentionMenu.tsx` and `components/admin/wizard/WizardAttentionMenu.tsx` are presentational: they take `open` as a prop and mount nothing on their own.

## 6. Accessibility: the pill carries the count

Suppression makes the pill the only channel for the count at phone widths, so the count has to be in the pill's accessible name. It already is, in visible text nodes rather than an `aria-label`, and no change is required. Verified in `components/admin/showpage/PublishedReviewModal.tsx`:

| Channel | Where |
| --- | --- |
| "N issues" / "1 issue" as real text | the `needsYou.length > 0` segment inside the pill button |
| "K sheet warnings" as real text | the `k > 0` segment, `data-testid="attention-pill-warnings-segment"` |
| "M monitoring" plus the sr-only sentence "clearing on their own, no action needed" | the `selfHeal.length > 0` segment, `data-testid="attention-pill-monitoring-segment"` |
| Exact count past the 99+ visual cap | `<span className="sr-only">({needsYou.length} issues)</span>` and its two siblings |
| Separators announced, not glued | the middots are real `" · "` text nodes, deliberately not `aria-hidden` |
| Disclosure state | `aria-expanded={menuOpen}` and `aria-controls={menuId}` on the pill button |

The tone dot is `aria-hidden` and carries no meaning the text does not (`components/admin/showpage/AttentionMenu.tsx:81-84` pairs each tone with sr-only text on the ROWS, which is the other channel).

Two consequences of suppression, both acceptable and both stated so they are not rediscovered in review:

1. A screen-reader user at <`sm` no longer has focus or a live region announcing the panel on arrival. They did not before either: the auto-open moves no focus (`setMenuOpen(true)` inside a rAF, with the focus-rescue effect only pulling focus back INTO the dialog when data changes strand it), and the panel is not a live region. So the announcement they get on arrival is the modal's, and the pill is in the tab order immediately after it. Nothing regresses.
2. `aria-expanded` reads `false` on arrival at <`sm` instead of `true`. That is now accurate, which it was not the moment the pill was rendered before the rAF fired.

## 7. Transition inventory

The menu has two visual states, open and closed, so there is one pair. This change adds no state and no new pair; it changes only which state a phone-width mount starts in.

| Pair | Treatment |
| --- | --- |
| closed → open (auto, ≥`sm`) | unchanged: motion-safe fade + `scale-95→100` over `duration-fast ease-out-quart`, `motion-reduce:transition-none`, on the frame |
| closed → open (pill tap, any width) | unchanged, same frame animation. This is now the ONLY path at <`sm`. |
| open → closed | unchanged: instant unmount |

Compound cases:

| Compound | Treatment |
| --- | --- |
| Suppressed mount, then the viewport crosses to ≥`sm` mid-mount | Nothing animates. No panel mounts (§4), so there is no transition to compose with. |
| Auto-opened at ≥`sm`, viewport crosses to <`sm` while the open animation is still running | The animation completes normally. Nothing cancels it; the panel is not remounted and its inline styles are untouched by this change. The shell's own `(min-width: 640px)` listener fires only on entering ≥`sm` and only touches drag styles (`ReviewModalShell.tsx:571-582`). |
| Suppressed mount where the last actionable item resolves | The compound reconciliation in `onResolved` closes a menu that is already closed: `setMenuOpen(false)` on `false` is a no-op re-render, not a transition. |
| Suppressed mount with an `alertId` deep link | The deep-link branch consumes the one-shot BEFORE the width guard is reached, so behavior is byte-identical to today at every width. |

## 8. Dimensional invariants

This change adds no element, no layout, and no dimension. It changes one boolean at one moment. The section is here because the relationships below are what the defect is MADE of, and the P-2 probe measures them rather than trusting them.

| Relationship | Guaranteed by | Status |
| --- | --- | --- |
| Panel width and x-position are clamped inside the review-modal clip, never the viewport | `placeWithinVisibleViewport` with `hostRect` set from `hostRef` (`components/admin/showpage/AttentionMenu.tsx`, `measureAndApply`), the `x` clamp at `lib/popover/position.ts:139`. Not `w-[min(400px,calc(100vw-32px))] right-0`, which is what overflowed. | UNCHANGED. This is the containment fix whose consequence created the row. |
| The panel's vertical anchor is the pill's WRAPPER (its `offsetParent`), not the pill | `const anchor = panel.offsetParent` in `measureAndApply`. Anchoring to `pillRef` sits the panel higher and was measured to make the published toggle unclickable. | UNCHANGED, and load-bearing: the probe must not "fix" occlusion by re-anchoring. |
| The pill's tap target is ≥44px tall while its visible box is ~24px | `before:absolute before:inset-x-0 before:-inset-y-3` on the pill button (`components/admin/showpage/PublishedReviewModal.tsx`, the pill's `className`); `-inset-y-3` is 12px per side over a ~24px pill. | UNCHANGED, and newly load-bearing: at <`sm` the pill is the ONLY way to open the menu, so its tap floor stops being a nicety. P-2 asserts the resolved band, not the class. |
| Menu rows are ≥44px tall | `min-h-tap-min` on the row button (`components/admin/showpage/AttentionMenu.tsx:308`) | UNCHANGED. |
| The published toggle receives its own pointer events at 375 when the menu is closed | Nothing structural. It is simply the topmost element there once no panel is painted. | This is the invariant the arc RESTORES. Asserted by `elementFromPoint` at the toggle's centre in P-2, never by a rect comparison alone: two rects can miss each other while a third element sits on top. |

Tailwind v4 does not default `.flex` to `align-items: stretch` in this project, so no relationship above relies on an implicit stretch, and none is introduced.

## 9. Probes

**P-1, the wizard sweep (§5).** Real Chromium at 375x667, wizard review modal with needs-look items, menu auto-opened. Record the panel rect, the rect of every interactive control in the modal, whether they intersect, and `document.elementFromPoint` at each control's centre. Blocks the §5 disposition and nothing else.

**P-2, the fix itself.** Real Chromium at 375x667, published review modal, seeded with actionable items: the modal opens, the menu is CLOSED, the pill is visible and carries its count, and `elementFromPoint` at the toggle's centre returns the toggle (or a descendant of it), not a panel row. This is the assertion that the shipped defect is gone, and it is written as a failing test first.

**P-3, the desktop control.** Same fixture at a desktop width: auto-open still fires. Without it P-2 passes on a component that never auto-opens at all, which is the tautology this repo's anti-tautology rule exists to catch.

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 10. Documented limits

- **A viewport between 639.98 and 640 CSS pixels** is desktop by this predicate and phone by nothing. Fractional viewport widths at exactly this boundary are not reachable on any device the product targets, and the consequence is a menu that opens on a 639.99px-wide window. Not defended.
- **A browser without `matchMedia`** gets today's behavior, including the occlusion. Every target browser has implemented it for over a decade; the guard exists for jsdom, not for a real client.
- **Zoom and text scaling** change the CSS viewport width, so a heavily zoomed desktop window can cross below `sm` and suppress the reveal. That is correct rather than a limit: at that point the layout IS the phone layout, and the toggle IS covered.

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
//
// A FUNCTION, not a value: it is called inside the reveal's animation frame
// (§2.1), so the width it reads is the width the panel would have appeared at.
const suppressedByWidth = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 639.98px)").matches;
```

Three properties, each deliberate:

**It is a suppression, so it demands positive evidence.** The query asks "is this a phone?" and suppresses only on `true`. The alternative spelling, `!matchMedia("(min-width: 640px)").matches`, asks the same question backwards and suppresses whenever the answer is unavailable. Auto-open is the shipped behavior and the one the desktop operator wants; an environment that cannot answer should keep it.

**639.98, not 640.** `(max-width: 640px)` and `(min-width: 640px)` both match at exactly 640, so the pair would overlap by one CSS pixel. The 0.02 step is the standard complement and leaves no fractional gap for a viewport at 639.5.

**`typeof window.matchMedia === "function"` is the same jsdom guard the shell already uses** (`components/admin/review/ReviewModalShell.tsx:569`, "Guard: jsdom implements no matchMedia; every target browser does"). This project's jsdom setup installs a stub that answers `matches: false` to every query (`tests/setup.ts:84-95`), so under jsdom the guard passes, the query answers false, and auto-open behaves exactly as it does today. That is the point: every existing jsdom suite that renders an auto-opened menu keeps passing without a stub of its own, and a jsdom test that wants to assert suppression overrides `window.matchMedia` in its own file, which the setup comment already documents as the supported per-file idiom.

### 2.1 Where it goes

Inside the existing auto-open effect in `components/admin/showpage/PublishedReviewModal.tsx` (the `autoOpenFiredRef` effect), INSIDE the `requestAnimationFrame` callback, as the last thing before `setMenuOpen(true)`:

```ts
if (actionable.length === 0) return;             // unchanged, does NOT consume
const raf = requestAnimationFrame(() => {
  if (suppressedByWidth()) {
    autoOpenFiredRef.current = true;             // a DECISION, so it consumes
    return;
  }
  autoOpenFiredRef.current = true;               // unchanged
  setMenuOpen(true);                             // unchanged
});
return () => cancelAnimationFrame(raf);          // unchanged
```

`suppressedByWidth` is therefore a function called at reveal time, not a value computed at effect time.

Placement is load-bearing in both directions:

- **After the `actionable.length === 0` return**, because that return deliberately does not consume the one-shot: the revalidate-on-open `router.refresh()` can stream actionable items in after a prefetched empty first paint, and consuming early would cancel the desktop reveal. Suppression must not change when that guard fires.
- **Inside the frame, not before it.** The first draft of this spec sampled the width before scheduling and consumed synchronously, reasoning that a decision should not sit inside a cancellable frame. That was wrong, and adversarial review round 1 produced the trace: the effect samples a desktop width, schedules the frame, the viewport crosses below `sm`, and the callback then opens the panel at a width the guard was supposed to forbid. The gap is the whole point of the rAF, which exists precisely because the open is deferred to paint time. Reading the width where the open happens closes it by construction, and there is no window left in which the two can disagree.
- **A cancelled frame leaves the one-shot unconsumed**, which is the existing contract for the open path and is now also the contract for the suppression path. That is correct rather than a leak: a cancelled frame means the effect is about to re-run, and a re-run re-decides at the width that is current then. The decision is still taken exactly once, at the one moment a panel would have appeared.

The consuming branches above are untouched: the deep-link branch (`alertId != null`) and the already-open branch both still consume synchronously, because neither defers anything to a frame.

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
| Mount at <`sm` with NO actionable items, viewport then grows to ≥`sm`, and only THEN do actionable items stream in | The menu auto-opens, at the desktop width, exactly as it does for any desktop arrival. | Raised by adversarial review round 1 against an earlier blanket claim, and it is a real trace: `actionable.length === 0` returns WITHOUT consuming the one-shot (deliberately, so a post-paint refresh can still reveal), so the later dependency change re-runs the effect with nothing suppressed. It is also correct. Suppression never fired on this mount, because there was never a panel to suppress; when the items finally arrive the operator is on a desktop-width viewport, where auto-open is the ratified behavior and nothing is occluded. The row above governs mounts where suppression ACTUALLY FIRED, which is the case the consumed one-shot exists for. |
| Operator OPENED the menu by tapping the pill, then resizes in EITHER direction | Untouched, open, in both directions. This spec never closes a menu, and the pill toggle is not gated by width. | Suppression governs the automatic reveal only. This is the fence the whole design rests on, so §9.3 asserts both directions rather than the one that seemed likelier. |

Three mechanisms carry the table, and none of them is a design intention:

1. The effect's deps are `[alertId, actionable.length, menuOpen]`. A resize changes none of them, so a resize ALONE never re-runs the effect.
2. Suppression consumes the one-shot, so a LATER dependency change (an item resolving, say) cannot re-open a mount that already decided.
3. The width is read inside the reveal's animation frame (§2.1), so no gap exists between the width the guard saw and the width the panel would have appeared at.

Mechanism 3 is what closes the case adversarial review found, which the first two did not reach on their own. Sampling before the frame let a boundary crossing land in between. This is also why width is not in the dependency array and why there is no `matchMedia` change listener anywhere in the change. The single existing `(min-width: 640px)` listener, `mql` at `components/admin/review/ReviewModalShell.tsx:571`, is drag hygiene and is not extended.

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

- **Probe P-1 (§9) measures the wizard modal at 375x667, 375x844 and 390x560** with its menu auto-opened, over the control set §9 defines. The question it answers is the published defect's exact shape: is a control that the operator needs now being hit-tested to something inside the panel?
- **If it occludes such a control** the wizard IS an instance of this defect, and it is repaired in this same PR with the identical predicate at the identical position in its effect.
- **If it occludes nothing at ALL THREE viewports, nothing is filed.** The wizard then shares the one-shot CODE shape but not the BUG shape, and class-sweep governs peers that share the bug (`AGENTS.md`, the class-sweep-before-patching rule). Exception (a) does not apply either: an exception explains why a real instance is deferred, and there is no instance to defer. Its auto-open stays exactly as ratified on 2026-08-27, and the measured negative is recorded in §10 as a documented limit with the viewport it was measured at, so the next arc reads a number instead of re-deriving the question.

This branch was corrected after adversarial review round 1, which was right that the earlier version mandated a `BL-` row in the no-occlusion case and so would have filed a row against a surface with no demonstrated defect. Both outcomes are still fixed here before the implementation lands, so neither is a judgment call made under review pressure.

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

1. A screen-reader user at <`sm` no longer has focus or a live region announcing the panel on arrival. They did not before either, and the chain is worth showing, because the focus-rescue effect is dep-less and reads at a glance as though it might grab focus on every commit:
   - It runs after every commit and DOES call `pillRef.current?.focus()` while the menu is effectively open, but only under `active === document.body || (dialog && !dialog.contains(active))` (`components/admin/showpage/PublishedReviewModal.tsx:465-479`).
   - On arrival that condition is false. The shell puts initial focus on the CLOSE button, `initialFocusRef={closeRef}` (`components/admin/showpage/PublishedReviewModal.tsx:998`), consumed by `useDialogFocus(panelRef, initialFocusRef, mounted)` (`components/admin/review/ReviewModalShell.tsx:216`; the target resolves at `components/admin/review/ReviewModalShell.tsx:234`). The close button is inside the dialog, so the rescue does not fire.
   - Under suppression the same effect takes its `if (!was || interactive) return;` path (`components/admin/showpage/PublishedReviewModal.tsx:482`) and moves nothing either.

   So arrival focus is IDENTICAL with and without suppression, at every width, and the panel was never a live region. The announcement on arrival is the modal's, and the pill is in the tab order. Nothing regresses, and §9's test plan asserts the identity rather than arguing it.
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

### 9.1 The occlusion test both probes use

Adversarial review round 1 killed the first version of P-1 for being unable to answer its own question. The reason generalises, so the test is defined once here and both probes use it.

"Does the panel intersect any interactive control" cannot discriminate, because the panel's own rows are interactive controls (a full-width `<button>` per row, `components/admin/showpage/AttentionMenu.tsx:304`), the scroller is focusable, and the modal's scrim is itself a `<button>` (`components/admin/review/ReviewModalShell.tsx:609`).

All of those necessarily intersect the panel. A test that counts them is positive by construction. A test that demands the hit-test return the panel ELEMENT itself is negative by construction, because what actually intercepts is a row. The published defect's own measurement says so in as many words: "pointer events intercepted by an attention monitoring row".

So:

**The control set.** Every element matching `a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])` inside the modal's CLIP (`[data-review-modal-panel]` published, `[data-step3-review-panel]` wizard), MINUS: any node inside the attention panel subtree; the scrim (`[data-testid$="-backdrop"]`, excluded by selector as well as by root, because "the scrim is outside the clip" is a property of today's tree); the pill itself, which owns the panel; and any element whose rect has zero width or height. What remains is the set of controls an operator could want.

**The raw fact: interception.** For each control `c`, sample its rect centre plus its four quarter points. `c` is INTERCEPTED at a point when `document.elementFromPoint` there returns a node that is neither `c` nor a descendant of `c`. Record which node, and whether that node is inside the attention panel. A `null` return means the point is off-viewport, which is a different problem and is not an interception.

**The dispositive subset: panel occlusion.** An interception whose interceptor is INSIDE the attention panel. The two are separated because round 2 was right that an interception is not by itself this arc's business, twice over:

- The pill paints a 44px hit band with `before:-inset-y-3`, and `elementFromPoint` returns the ORIGINATING element for a pseudo-element, so a neighbour whose sample points land in that band reports the pill as interceptor. True, and true with or without suppression.
- The modal's chip rail is `overflow-x-auto` and its content pane is `overflow-y-auto` (`components/admin/review/ShowReviewSurface.tsx:1013` and `components/admin/review/ShowReviewSurface.tsx:1054`), so a control clipped at a scrollport edge can be hit-tested to ordinary surrounding chrome.

Neither is an anchored-overlay occlusion, and a branch that treated them as one would file against the wrong surface.

**The two probes assert on different subsets, deliberately.** P-1 asks "does the panel occlude anything", which is the panel subset. P-2 asks "is this one named control operable", which is EVERY interception of that control, because an operator whose tap lands anywhere but the toggle does not care what stole it. Stating this is the repair for round 2's finding 3.

**Non-vacuity, per probe rather than inside the helper.** Round 2 found the first version self-contradictory: the helper refused to run unless the panel was open, while P-2's whole claim is that the panel is CLOSED. So the helper guards only what is universal, and each probe guards its own precondition:

- The helper throws when the control set is empty, and when a caller names a control that is not in the set. A result can never come from a harness that rendered nothing, or from a probe that silently lost the control it is about.
- P-1 asserts the panel is open before measuring, because an absent panel occludes nothing and would answer its question `false` for the wrong reason.
- P-2 asserts the panel is absent, and takes its discrimination from the RED run instead: the same probe against the pre-fix build must report an interception of the toggle, and the plan records which node it named. Post-fix `insidePanel` is trivially false for everything, so "no panel occlusion" would be vacuous; "no interception at all, on the toggle" is not.

### 9.2 The probes

**P-1, the wizard sweep (§5).** Real Chromium, wizard review modal with needs-look items, menu auto-opened, run at **375x667, 375x844 and 390x560**. Three cells, not one: vertical placement depends on `spaceAbove`/`spaceBelow`, side selection and fitted height (`lib/popover/position.ts:113-115` and `lib/popover/position.ts:134`), so a shorter phone changes which controls the panel covers, and the sibling row's own probe domain already treats these as three cells (the viewport loop at `tests/e2e/wizard-attention-menu.spec.ts:202-209`). The negative branch of §5 requires a negative in ALL THREE; one positive anywhere makes the wizard an instance. Measured at rest, after the entrance settles on `scale` (the file's containment cases document why `transform` reads "none" throughout). Records the full result and gates the §5 disposition, nothing else.

**P-2, the fix itself.** Real Chromium at 375x667, published review modal, driven with actionable items:

1. the menu is CLOSED one frame past the reveal's rAF, so "closed" is settled rather than measured too early;
2. the pill is visible and its ACCESSIBLE NAME carries the count (not the text of a container that also renders menu rows);
3. the pill's resolved hit band clears 44px, per §8 — newly load-bearing, because the pill is now the only way to open the panel at this width;
4. the published toggle (`strip-publish-toggle`, `components/admin/showpage/StatusStrip.tsx:281`) has ZERO interceptions at all five of its sample points;
5. tapping the pill opens the menu, which is the consequence bound's other half and the thing that makes suppression acceptable rather than a removal;
6. the BOUNDARY pair, 639x667 suppressed and 640x667 auto-opening, which is what pins the cutoff at 640 rather than at any width between 400 and 640;
7. an operator-opened menu survives a resize in both directions.

Written as failing tests first. Item 4 stated through the shared test matters: the pre-fix measurement was an interception by a ROW, so an assertion comparing the toggle's rect against the panel's would have passed on a variant that still stole the taps.

**P-3, the desktop control.** Same fixture at a desktop width: auto-open still fires. Without it P-2 passes on a component that never auto-opens at all, which is the tautology this repo's anti-tautology rule exists to catch.

### 9.3 Obligations: every claim, and the assertion that settles it

Round 2's finding 4 was that §9 had drifted from what the rest of the document promised: §6 said the arrival-focus identity was asserted, §8 said the pill's band was, and the consequence bound needed the phone-width tap path, and §9 carried none of the three. The repair is this table rather than three added sentences, so the next claim added without an assertion is visible as a missing row.

| Claim | Where | Settled by |
| --- | --- | --- |
| Suppressed at <`sm`, with actionable items | §2 | P-2.1; jsdom phone case |
| Auto-opens at ≥`sm` | §2 | P-3; jsdom desktop control |
| The cutoff is 640, not merely "some phone width" | §2 | **P-2 boundary cells at 639x667 (suppressed) and 640x667 (auto-opens).** Round 3's finding: 375 plus a desktop width is satisfied by `(max-width: 400px)` just as well as by the specified query, and that impostor wrongly auto-opens at 500, below the project's `sm`. Only a pair straddling the boundary pins the constant, and the pair also pins the 639.98 complement: at exactly 640 the query must read false. |
| Width is read at REVEAL time, not effect time | §2.1 | jsdom: answer desktop while the effect runs, phone inside the frame, assert closed. NOT a browser case: `page.setViewportSize` crosses CDP asynchronously and would race the frame it must land inside, giving a case that is flaky or vacuous. |
| `actionable.length === 0` still does not consume | §2.1, §4 row 3 | jsdom: empty at phone, widen, then items arrive, assert it opens |
| A CANCELLED frame leaves the one-shot unconsumed | §2.1 | jsdom: at a desktop width, change a dependency so the effect re-runs and cancels its pending frame BEFORE it fires, then let the next frame settle, and assert the menu opens. Round 3's finding: §2.1 calls this load-bearing and nothing asserted it, so an implementation that consumed the ref before scheduling would pass every other row here while silently losing the reveal whenever a dependency changed inside the frame window. |
| No width read during render, so no hydration branch | §3 | NOT ASSERTED, and the row says so rather than implying cover. Round 3 was right that the earlier claim was false: the jsdom harness uses Testing Library's client-only `render` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:177`), which never produces server markup and so cannot discriminate a hydration mismatch at all. The property holds by construction instead: the predicate is a function called only inside the effect's animation frame (§2.1), and effects do not run on the server. An implementation that moved the read into render would be a different design, not a regression this suite could catch, and it would be caught by review of that change. Recorded in §10 as a documented limit. |
| Auto-opened then shrunk STAYS OPEN | §4 row 1 | P-2 sibling case at desktop then phone |
| Suppressed then widened stays closed | §4 row 2 | P-2 sibling case, re-running the effect via an item change |
| An OPERATOR-opened menu survives a resize in either direction | §4 row 4 | P-2 sibling cases: open by tapping the pill at 375, widen past `sm`, assert still open; and open by tapping at desktop, shrink below `sm`, assert still open. §4 promises this in both directions and only the auto-opened shrink was covered. It is the row that pins "this spec never closes a menu", which is the fence the whole design rests on. |
| Pill accessible name carries the count | §6 | P-2.2 |
| Arrival focus identical with and without suppression | §6 | jsdom: `document.activeElement` is the close button in both |
| `aria-expanded` reads false on a suppressed arrival | §6 | jsdom phone case |
| Panel width/x clamped inside the clip | §8 | Unchanged and already covered by `popover-clip-fit.spec.ts` |
| Pill tap band ≥44px | §8 | P-2.3 |
| Menu rows ≥44px | §8 | Unchanged, `popover-clip-fit.spec.ts` |
| Toggle receives its own pointer events | §8 | P-2.4 |
| Pill tap opens the menu at <`sm` | consequence bound | P-2.5 |
| Wizard occlusion status | §5, §10 | P-1, three viewports |
| **If P-1 is positive:** the wizard suppresses at <`sm`, its chip still opens the panel on tap, and its desktop auto-open is unchanged | §5 | **P-4a/b/c, the wizard mirror of P-2.1, P-2.5 and P-3**, added in the same commit as the wizard repair. Round 3's finding: the positive branch changed the wizard's behavior and specified no oracle for the changed state. It also requires editing that file's `openModal` helper (`tests/e2e/wizard-attention-menu.spec.ts:136-150`), which today ASSERTS `aria-expanded="true"` on arrival before dismissing the panel, at 375x667, 375x844 and 390x560. Under suppression that assertion is false at exactly those three viewports, so the helper becomes width-aware: expect auto-open at ≥`sm`, and open by tapping the chip below it. This is the same tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses. |
| **If P-1 is negative:** the wizard is untouched | §5, §10 | No new assertion, by design. The existing wizard suite continues to pass unchanged, which is itself the evidence that nothing moved. |

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 10. Documented limits

- **A viewport between 639.98 and 640 CSS pixels** is desktop by this predicate and phone by nothing. Fractional viewport widths at exactly this boundary are not reachable on any device the product targets, and the consequence is a menu that opens on a 639.99px-wide window. Not defended.
- **A browser without `matchMedia`** gets today's behavior, including the occlusion. Every target browser has implemented it for over a decade; the guard exists for jsdom, not for a real client.
- **"No width is read during render" is not asserted by any test.** It holds by construction, because the predicate is a function called only inside an effect's animation frame and effects do not run on the server. The jsdom harness could not settle it either way: Testing Library's `render` is client-only and produces no server markup to mismatch against. Round 3 caught the earlier version of this spec claiming otherwise. A future change that moved the read into the render path would be a different design and is caught by reviewing that change, not by this suite.
- **The wizard modal's occlusion status at <`sm`**, if probe P-1 comes back negative, is recorded here with the viewport it was measured at, so the next arc to touch that surface reads a measurement instead of re-deriving the question. Filled in when P-1 runs (§5, §9.2).
- **Zoom and text scaling** change the CSS viewport width, so a heavily zoomed desktop window can cross below `sm` and suppress the reveal. That is correct rather than a limit: at that point the layout IS the phone layout, and the toggle IS covered.

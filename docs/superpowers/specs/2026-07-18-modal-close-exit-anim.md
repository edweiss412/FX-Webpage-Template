# Spec — Review-modal close exit animation (MODAL-CLOSE-EXIT-ANIM-1)

**Date:** 2026-07-18 (rebuilt 2026-07-18 against shipped `main`)
**Slug:** `modal-close-exit-anim`
**Status:** draft → self-review → adversarial review
**Un-defers:** `DEFERRED.md` § `MODAL-CLOSE-EXIT-ANIM-1`
**Amends:** admin-show-modal master spec §6.5 transition inventory

---

## 0. Rebuild note — why this spec is small

An earlier draft ran 28 adversarial rounds and grew to ~300 lines. Almost all of that mass existed to manage one state: a **released-but-still-mounted** modal. Because `PublishedReviewModal`'s close was a `router.push` and the shell stayed mounted until the RSC payload landed, the spec needed `closeBehavior`, `releaseOverlay`, `restoreOverlay`, a screen-ownership predicate, and an empirical gate on Next's navigation-race semantics — and each of those spawned defects of its own.

**PR #485 removed that state at the source.** `PublishedReviewModal` now hides client-side first and lets the URL catch up (`PublishedReviewModal.tsx:139-143`, `:238-239`):

```
const [closing, setClosing] = useState(false);
const handleClose = useCallback(() => { setClosing(true); close(); }, [close]);
// …
open={!closing}
onClose={handleClose}
```

Because `open` flips to `false` synchronously, the shell unmounts immediately and its own cleanups restore focus / inert / scroll on the spot. Consequences for this spec, all subtractive:

- **No `closeBehavior` prop.** `onClose` now performs the hide *and* the push, so Published and Step3 share one contract: animate, then call `onClose` at exit-end.
- **No `releaseOverlay` / `restoreOverlay` / failed-close recovery.** Nothing lingers, so there is nothing to release or roll back.
- **No navigation-race gate.** The earlier draft owned that race because `releaseOverlay` created the window. Post-#485 the dashboard is already live while the close push is in flight — that is `main`'s shipped behavior, neither introduced nor worsened here. Same for a failed close leaving a stale `?show=`: already true on `main` (`closing` hides regardless of whether the push lands).

What remains is the original request: play the reverse of the entrance before the modal goes away.

## 1. Problem

Every non-drag close affordance — header **X**, document **Esc**, scrim tap, sheet **grab-strip tap** — calls `onClose` and the panel disappears with **no exit transition**. The only animated close is the sheet drag-past-threshold dismiss, which slides the panel off-screen (`ReviewModalShell.tsx:276-299`). A drag glides out; an X/Esc/scrim/tap snaps out.

#485 made Published's close *instant* rather than laggy, which fixed the perceived-latency half of the complaint but sharpened the asymmetry: the drag animates, nothing else does.

This was originally declined because master spec §6.5 ratified `open → closed | instant unmount`. The `DEFERRED.md` un-defer trigger is now pulled: *"a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition … to BOTH consumers so Step3 parity holds."*

## 2. Goal

Closing via X / Esc / scrim / grab-tap plays the **reverse of the entrance**, then calls `onClose` behind it. Identical in both consumers (`Step3ReviewModal`, `PublishedReviewModal`). Reduced motion collapses to today's instant unmount.

Non-goals: no change to the entrance, the drag dismiss *visual*, the spring-back, #485's instant-hide mechanics, or any DB/route/auth surface. UI-only.

## 3. Design

The shell owns the panel, scrim, Esc handler, grab-tap handler, and the existing drag-dismiss exit machinery (`ReviewModalShell.tsx`), so the exit lives there and both consumers inherit it with no per-consumer motion code.

### 3.1 `requestClose` — the single animated-close entry point

Replaces every direct `onClose` call on the four non-drag affordances:

| Affordance | Today | New |
|---|---|---|
| Scrim tap | `onClick={onClose}` (`:393`) | `onClick={requestClose}` |
| Esc | `onClose()` in keydown (`:180`) | `requestClose()` |
| Grab-strip tap | `onClick={() => …onClose()}` (`:414`) | `requestClose()` (drag-consumed-click guard unchanged) |
| Header **X** | consumer-owned (`PublishedReviewModal.tsx:280`, `Step3ReviewModal.tsx:440`) | `requestClose` via context (§3.3) |

Behavior:

0. **Non-dismissible guard.** If `closeAffordancesDisabled` (§3.4), return immediately — before any state change, inert, or animation.
1. **Re-entrancy guard.** If `dismissingRef.current` (`:206`) is already `true`, return. One exit, one close.
2. **Cancel any active drag.** If `dragRef.current !== null`, release its pointer capture and null it, so the pending `pointerup` early-returns at the existing guard and can never run the spring-back that would overwrite the exiting panel with `translateY(0)`. Also clear `settleTimerRef` (`:208`). Belt-and-suspenders: `handleGrabPointerEnd` early-returns when `dismissingRef.current` is `true`. **Do NOT clear the inline `transform`** — it is the exit's start state (§3.2 start-state normalization); clearing it would snap the panel to `translateY(0)` before the exit begins.
3. **Commit the dismiss — shared `beginDismiss()`.** Set `dismissingRef = true` and `dialogRef.current.inert = true` (the whole `role="dialog"` subtree, `:377`). **Also called by the drag-past-threshold branch** (§3.2), so every affordance inerts at dismiss-commit. This matters because `onClose` is now delayed 120–220ms by the animation while Step3's footer buttons remain wired to `handlePublish`/`handleUnpublish`/`handleApproveResolve`/`handleIgnoreResolve`; a fast click during the exit must not fire an action after dismissal. Today's instant unmount has no such window — the animation creates it, so the guard ships with it. `inert` does not block the transition or `transitionend`.
4. **Reduced motion / null panel → immediate.** If `panelRef.current` is null, or `matchMedia("(prefers-reduced-motion: reduce)")` matches, or `matchMedia` is absent (jsdom): call `onClose()` with no animation. Byte-identical to today.
5. **Animate.** Otherwise neutralize the entrance (`panel.style.animation = "none"`), apply the mode-appropriate exit styles (§3.2), fade the scrim, and call `onClose()` at exit-end — the panel's `transitionend` (transform) or a fallback timer, mirroring the drag path's `finish()` (`:293-299`).

### 3.1a `requestClose` is the ONLY close path

Every close routes through `requestClose` — dismiss gestures (§3.1) **and** Step3's programmatic action-success closes (`Step3ReviewModal.tsx:236`, `:245`, `:299`, which today call `onClose()` directly after an `await`).

**Those handlers CANNOT use the §3.3 context.** They are consumer-owned closures declared at `Step3ReviewModal`'s top level, which sits *above* the shell's provider (§3.3 states this for the X button); a `useReviewModalClose()` call there would read the default no-op and the modal would never close after a successful publish — a worse failure than the race it fixes. The context reaches the `header` slot because that slot is *rendered* inside the provider; it cannot reach the component's own function body.

**Mechanism: `closeApiRef`.** The shell accepts an optional `closeApiRef?: RefObject<(() => void) | null>` and assigns `requestClose` into it from a layout effect (before paint, so it is populated ahead of any user-triggered action), clearing it on unmount. `Step3ReviewModal` owns the ref, passes it to the shell, and its success handlers call:

```
closeApiRef.current?.();
```

**No `?? onClose` fallback (Codex R5).** An earlier draft wrote `(closeApiRef.current ?? onClose)()`, reasoning that an unpopulated ref should still close instantly rather than hang the modal open. That is wrong, because of *when* the ref can be null. It is populated in a layout effect before first paint and cleared only on unmount, so at the moment a success handler runs, `current === null` has exactly one reachable meaning: **the shell has already unmounted, i.e. a close already completed.** The fallback's only live trigger is the slower-than-exit case — action starts, user dismisses, exit completes and unmounts, action resolves — where firing `onClose()` again is a *second* close outside `requestClose`: a duplicate `router.push` on Published, a redundant parent close on Step3. So the fallback is harmful in precisely the case it exists for.

`?.()` is therefore the whole contract: **a resolution that arrives after the modal is gone closes nothing.** The "ref never populated" scenario the fallback was guarding is a wiring bug, and it belongs in CI (§7.6 asserts the ref is populated before any interaction is reachable) rather than in a runtime branch that misfires post-unmount.

A ref is used rather than a render prop or a `children`-as-function because it requires no restructuring of either consumer, and rather than moving the handlers into a descendant component because that would relocate `resolutionPending` / `resolutionError` / `isPublishRunActive` state across the provider boundary for motion reasons alone.

This is a single rule with no exceptions, and it is deliberately not a special-case guard: an "ignore the success close while dismissing" flag would leave two close paths and require every future close site to remember the flag. Routing everything through one entry point makes the §3.1 step 1 re-entrancy guard cover the compound case for free:

- **dismiss committed, action resolves during the exit** → `requestClose` no-ops (step 1); the in-flight exit still owns the close and reaches `onClose` at exit-end. One exit, one close, animation intact.
- **action resolves first, then dismiss** → the success close runs a normal animated exit; the later gesture no-ops on the same guard.

Success closes therefore animate like every other close. That is a behavior change from main (where they are instant), but it is the same change this spec makes to all four dismiss affordances, and the alternative — an un-animated close path racing an animated one — is what produced this finding. Acceptance in §7.5(g).

### 3.2 Exit treatment (mode-aware, JS-inline)

Mode reads `matchMedia("(min-width: 640px)")` — the `sm` boundary the shell already tracks. Exit is driven by **inline styles**, mirroring the drag path, not by new CSS keyframes (§5).

| Mode | Panel exit (reverse of entrance) | Duration | Fallback const |
|---|---|---|---|
| Sheet (`<sm`) | `transform: translateY(100%)` — identical to the drag dismiss | `--duration-normal` (220ms) | `DURATION_NORMAL_FALLBACK_MS` (`:48`) |
| Desktop (`≥sm`) | `opacity: 0; transform: translateY(8px) scale(0.98)` — reverse of `step3-details-pop-in` (`app/globals.css:737`) | `--duration-fast` (120ms) | `DURATION_FAST_FALLBACK_MS` (`:52`) |

`transitionend` keys on `propertyName === "transform"` (present in both modes) — the same predicate the drag path uses (`:296`).

**Start-state normalization (required on EVERY exit).** `requestClose` can fire while the panel is in any of several live motion states, each leaving `transform` / `transition` / `animation` in a different condition. Applying the exit values against an unnormalized start state fails *silently*: the panel jumps to its end state with no interpolation, no `transform` `transitionend`, and the close lands on the fallback timer — visually broken, but still "closed", so endpoint assertions pass.

**Panel motion-state inventory.** This table is exhaustive over the states the shell can produce; a new motion state may not be added to the shell without adding a row here and to the §7.6 audit.

| # | State | How it is detected | Panel condition at entry | Exit treatment |
|---|---|---|---|---|
| S1 | Resting | default | no inline `transform`; stylesheet governs | universal algorithm below |
| S2 | Entering | entrance keyframes running | `animation` running; computed `transform`/`opacity` mid-interpolation | universal algorithm — snapshot **before** neutralizing (see step 1) |
| S3 | Dragging | `dragRef.current !== null` | `transition: "none"` (`:241`); inline `transform: translateY(<dy>px)` | universal algorithm + cancel drag (§3.1 step 2) |
| S4 | Spring-back settling | `settleTimerRef.current !== null` | `dragRef` already null; fast `transition`; `transform` interpolating toward `translateY(0px)`; a live `transitionend` listener + timer pending `clearPanelDragStyles()` | universal algorithm + **settle neutralization** below |
| S5 | Dismissing (drag past threshold) | `dismissingRef.current === true` | exit already in flight | §3.1 step 1 re-entrancy guard returns; no second exit |
| S6 | Tap-released | — | `clearPanelDragStyles()` already ran | identical to S1 |
| S7 | Reduced motion / null panel | `matchMedia` / `panelRef` | n/a | §3.1 step 4 immediate close; no animation |

**Universal algorithm (S1–S4, no per-state branching).** Ordering matters and mirrors what the two existing drag-release paths already do (`:282`, `:304` both set `transition` before mutating `transform`):

1. **Snapshot first.** Read the *computed* `transform` and `opacity` — before touching `animation` or `transition`. This is what makes S2 correct: neutralizing the entrance first would let the panel jump to its resting style before the exit begins.
2. **Neutralize** `animation = "none"` and `transition = "none"`.
3. **Pin the snapshot** as inline `transform`/`opacity` — the exit's start state, whatever produced it.
4. **Force a style flush** (read a layout property) so the start state and exit values land in separate style resolutions; setting both in one frame collapses the transition.
5. **Set the exit transition** — `transform`/`opacity` over the mode's duration with `var(--ease-out-quart)`.
6. **Apply the exit values** (table above).

Snapshotting uniformly means no state needs special-casing: a drag-cancelled exit animates continuously from the dragged offset, an interrupted entrance continues from wherever it had reached, and a resting panel starts from identity.

**Settle neutralization (S4).** A pending spring-back is not merely a start-state problem — it will actively corrupt the exit. `settle()` calls `clearPanelDragStyles()` (`:210-216`), which blanks `transform`, `transition` and `animation`; its only guard is `dragRef.current === null`, which is **true** during an exit, so it would wipe the exit styles mid-flight. Its `transitionend` listener is also still attached and would catch the *exit's* own transform event and fire early. `requestClose` must therefore clear `settleTimerRef` and ensure the settle path cannot run.

**Structural defense:** guard `clearPanelDragStyles()` itself with an early `if (dismissingRef.current) return;`. The panel must never be handed back to stylesheet control while an exit is in flight, from *any* caller — this closes the class at the chokepoint rather than at each call site, and covers the mode-boundary/unmount hygiene effect (`:334-344`) that also calls it.

**Scrim fade (both modes):** a new `scrimRef` (`:394`) lets `requestClose` set `animation = "none"`, `transition = "opacity <dur> ease-out"`, `opacity = "0"`. Cosmetic — it does NOT gate exit-end; if its own `transitionend` never fires that is harmless.

**Drag-past-threshold** keeps its visual slide-down (`:276-299`) and its `onClose`-at-transitionend timing unchanged. Its ONLY change is calling the shared `beginDismiss()` at commit (it already sets `dismissingRef` at `:281`; `beginDismiss` folds that together with the new `inert` — no double-set). It bypasses `requestClose`, so §3.1 step 0/1 guards do not cover it; §3.4 handles it separately.

Entrance is untouched: `step3-details-sheet-rise` (`:717`), `step3-details-pop-in` (`:737`), `step3-details-scrim-in` (`:747`).

### 3.3 Consumer parity — the X button via context

The X sits in each consumer's `header` slot, so the shell cannot wire it directly:

- `ReviewModalCloseContext` (default: no-op) + `useReviewModalClose()`, exported from the review module.
- The shell wraps its rendered tree in the provider, so the `header` slot can read it.
- A shared **`ModalCloseButton`** (`forwardRef`, `components/admin/review/`) consumes the context and renders the X: `aria-label="Close"`, `X` icon, `onClick={requestClose}`, `data-testid` via prop, `className` carried verbatim from the two identical existing buttons. It renders **inside** the provider; a hook call at a consumer's top level would not resolve (it sits above the provider).
- Each consumer swaps its inline `<button>` for `<ModalCloseButton>` and forwards `initialFocusRef` for the initial-focus contract (`:141`).

### 3.4 The skeleton stays non-dismissible where it has no close

`ShowReviewModalSkeleton` now has **two** usages (`ShowReviewModalSkeleton.tsx:26,39`):

| Usage | `onClose` | Required behavior |
|---|---|---|
| Server Suspense fallback (no props) | `() => {}` no-op | affordances must stay **inert no-ops**, exactly as on `main` |
| Client optimistic copy (`ShowsTable`, #485) | real cancel | scrim / Esc / grab **dismiss** the overlay |

Rewiring the affordances to `requestClose` would otherwise regress the first usage: a scrim tap would set `dismissingRef`, inert the subtree, animate the frame off-screen, then call a no-op — leaving the loading frame hidden, inert, and scroll-locked where `main` does nothing at all.

Contract: the shell takes `closeAffordancesDisabled?: boolean` (default `false`). The skeleton passes `closeAffordancesDisabled={onClose === undefined}` — deriving it from the prop it already branches on, so the two usages cannot drift. When set: `requestClose` returns at step 0, **and** `handleGrabPointerDown` early-returns so no drag can start, **and** `beginDismiss` early-returns defensively (the drag branch bypasses `requestClose`, so the step-0 guard alone would not cover it).

`MODAL-SKELETON-CLOSE-1` stays deferred — this adds no close affordance, it preserves current behavior per usage.

## 4. Guard conditions

| Input / state | Behavior |
|---|---|
| `requestClose` while `dismissingRef` already true (double Esc, Esc-then-X, scrim-then-Esc) | no-op — one exit, one close |
| drag in progress when Esc/X fires | drag cancelled (step 2); the pending `pointerup` early-returns → no spring-back over the exiting panel |
| footer button clicked DURING the exit window (120–220ms), any affordance incl. drag | no action fires — subtree `inert` from `beginDismiss` |
| footer action clicked BEFORE dismissal, resolves DURING the exit | its close routes through `requestClose` (§3.1a) and no-ops on the re-entrancy guard; the exit is not truncated and `onClose` fires once, at exit-end. `inert` does not cover this — the click predates it |
| footer action resolves, THEN a dismiss gesture fires | the success close already ran an animated exit; the gesture no-ops on the same guard |
| footer action resolves AFTER exit-end (shell unmounted, `closeApiRef` cleared) | `closeApiRef.current?.()` is a no-op — a resolution arriving after the modal is gone closes nothing. No second `onClose`. Step3-only: Published has no async success close (§3.1a, §7.5(h)) |
| reduced motion, or `matchMedia` absent (jsdom) | immediate `onClose()` — identical to today |
| `panelRef.current` null at fire time | immediate `onClose()` (defensive, mirrors the drag path) |
| Published: close push slower than the animation | irrelevant — #485 already hid the modal via `closing`; the exit plays, then `onClose` sets `closing` and pushes |
| Published: close push fails / never commits | modal hidden, URL keeps `?show=` until the next navigation. **Pre-existing on `main`** (`closing` hides regardless) — not introduced or worsened here |
| skeleton, server fallback usage | scrim / Esc / grab / drag do nothing — no `inert`, no animation, no `onClose` (§3.4) |
| skeleton, client optimistic usage | affordances dismiss with the exit animation, then the real cancel runs |
| viewport crosses `sm` mid-exit | existing matchMedia cleanup guards `!dismissingRef.current` — a committed exit is not yanked back. Unchanged |
| unmount mid-exit | existing cleanup clears the fallback timers — no late `onClose` |

## 5. Design decision — JS-inline, not twinned CSS keyframes

**(a) JS-inline** (chosen) vs **(b) `[data-*-exiting]` keyframes** twinned across `[data-review-modal-*]`/`[data-step3-review-*]`.

(a) wins:
1. **Consistency** — the sheet exit becomes pixel-identical to the drag slide-down, reusing the same machinery.
2. **It does not destabilize the entrance twin-scan.** `reviewModalShell.test.tsx:193-194` asserts `[data-step3-review-*]` receives an animation body in **exactly 3** media contexts and that `[data-review-modal-*]` matches it. CSS exit rules would add contexts and force that count to be re-derived; JS-inline leaves entrance CSS and that test untouched.
3. **The `pageTransitions` pin stays green.** `PublishedReviewModal.tsx` is pinned to a conditional-render count of **1** (`pageTransitions.test.tsx:123`) and to importing no motion library. Exit living in the shell as JS-inline adds no consumer conditional and no import.

Reduced motion is read at fire time via `matchMedia` — no CSS `@media` needed.

## 6. Transition inventory (amends master spec §6.5)

§6.5's row becomes:

> `open → closed (X/scrim/Esc/grab-tap) | exit animation via shell requestClose — reverse of entrance (sheet: translateY(100%); desktop: fade + scale 0.98 + translateY 8px) + scrim fade, then onClose at exit-end. Published's onClose remains #485's instant client-side hide + background URL catch-up. Reduced motion → instant. Back-button unmount is a route change (no requestClose in the popstate path). The Suspense-fallback skeleton stays non-interactive (MODAL-SKELETON-CLOSE-1 still deferred).`

| Transition | Treatment |
|---|---|
| closed → open | entrance, unchanged |
| open → exiting (X/Esc/scrim/grab-tap) | `requestClose`: drag-cancel + `beginDismiss` + mode-aware reverse + scrim fade, JS-inline |
| exiting → closed | `onClose` at panel `transform` transitionend / fallback; unmount clears inline styles |
| open → closed, reduced motion | immediate — no animation |
| open → closed, drag past threshold | **visual unchanged**; adds `beginDismiss` at commit |
| open → closed, browser Back | **unchanged** — route change; `requestClose` not in this path |
| skeleton (server fallback) | **no transition** — affordances are inert no-ops (§3.4) |
| skeleton (client optimistic) | exit animation, then the real cancel |

**Compound transitions:**
- exit committed, then viewport crosses `sm` → matchMedia cleanup guards `!dismissingRef.current`; exit not interrupted.
- **drag held, then X/Esc** (S3) → drag cancelled first, so `pointerup` cannot spring back over the exiting panel. Exit animates from the drag's current transform (continuous). Acceptance in §7.5(d).
- **spring-back in flight, then any close affordance** (S4) → settle timer cleared and `clearPanelDragStyles()` guarded by `dismissingRef`, so the pending settle can neither blank the exit styles nor consume the exit's `transitionend`. Exit animates from the panel's mid-settle position, *not* from the settle's `translateY(0px)` target. Acceptance in §7.5(e).
- **entrance in flight, then any close affordance** (S2) → computed `transform`/`opacity` snapshotted before the entrance animation is neutralized, so the panel continues from where the entrance had reached instead of snapping to its resting style first. Both modes (desktop interpolates opacity *and* transform). Acceptance in §7.5(f).
- **footer action pending, then dismiss, action resolves before exit-end** (§3.1a) → the resolution's `requestClose` no-ops on the step-1 re-entrancy guard; the exit animation is not truncated and `onClose` fires exactly once, at exit-end. Applies to all five affordances including drag. Acceptance in §7.5(g).
- `requestClose` twice fast → second no-ops (S5).

## 7. Test surface

1. **Shell unit** — in jsdom (`matchMedia` absent → immediate path) scrim/Esc/grab route through `requestClose` and call `onClose` exactly once; re-entrancy fires it once for double-Esc/Esc-then-scrim. The entrance twin-scan must stay green at **exactly 3** contexts.
2. **`ModalCloseButton` unit** — reads context, forwards ref, `onClick` calls the provided `requestClose`; default no-op outside a provider.
3. **`pageTransitions.test.tsx`** — `PublishedReviewModal` conditional count stays **1**, no-motion assertions green. Regression guard, no edit expected.
4. **Skeleton dual-usage (§3.4)** — for the **server-fallback** shape (no `onClose`), exercise scrim tap, Esc, grab-tap **and drag-past-threshold** and assert NONE sets `inert` or `dismissingRef`, applies an exit transform, or calls `onClose`; the frame stays visible and in place. Separately, for the **client optimistic** shape (real `onClose`), assert the affordances DO dismiss. Asserting only "no X button" would pass while the regression ships.
5. **Real-browser (`published-review-modal.interactions.spec.ts`)**:
   (a) **exit-animation flip** — the existing "open→closed is an INSTANT unmount" assertions (`:23`, `:254-292`) flip: X / Esc / scrim leave an exit-animated frame (panel carries a non-identity **computed** transform/opacity, scrim opacity → 0) BEFORE the frame leaves the DOM. #485's URL-strip polling is unchanged and must stay green. Reduced-motion run collapses to instant with no exit frame.
   (b) **exit-window action suppression** (`inert` is not enforced in jsdom) — in the Step3 harness, dismiss via **all five** affordances, each in its own run: Esc, X, **scrim tap**, **grab-strip tap**, and drag-past-threshold. Within each exit window attempt to click the variant's footer actions and assert the handler is NOT invoked and the modal still closes exactly once. **The three actions do not coexist:** Publish is in the non-resolution variant; Approve & apply and Ignore are in the resolution variant, and both can be disabled (choice-incomplete, `resolutionPending`, `isPublishRunActive`). Each action therefore needs a positive control proving it is live in the variant its suppression run uses — otherwise "handler not invoked" is satisfied by a button that was absent or disabled, and the run proves nothing about `inert`. All five are enumerated rather than testing Esc/X as representatives: `inert` is the only thing standing between a mid-exit click and a fired mutation, it is unenforceable in jsdom, and the two pointer-driven paths (scrim, grab-tap) reach `requestClose` through different call sites than the keyboard/button paths — the transition-audit scan proves they are *wired*, not that the window is actually inert in a real browser.
   (c) **focus continuity** — `main` already pins focus returning to the trigger across the close path (`7555c0316`). Assert it still holds with the animation interposed: focus lands on the trigger after exit-end, not mid-animation.
   (d) **compound drag-held + Esc** — hold the grab past slop, press Esc, release the pointer AFTER the fallback timer; assert one exit, one close, no `translateY(0)` snap-back frame. **Must assert animated progression, not just the endpoints:** sample the panel's *computed* `transform` at ≥2 points inside the exit window and assert the translateY strictly increases and is at some point strictly between the drag offset and the final `translateY(100%)` — an instant jump satisfies "eventually closed" and "never snapped back", so endpoint-only assertions pass while the regression ships. Assert the `transform` `transitionend` actually fires (exit-end reached by transition, not by the fallback timer). Same progression assertion applies to (a)'s non-drag exits, whose start state is normalized by the same §3.2 contract.

   (e) **close during spring-back (S4)** — drag the grab strip *sub*-threshold (past `DRAG_SLOP_PX`, under `DRAG_DISMISS_THRESHOLD_PX`), release, then close via Esc **inside the 120ms settle window**. Assert: ≥2 computed-transform samples show continuous progression toward `translateY(100%)`; the panel never reads `translateY(0px)` after the close (proving the pending settle neither completed over the exit nor blanked it); inline `transform` is non-empty throughout the exit (proving `clearPanelDragStyles()` did not fire); exactly one `onClose`; exit-end via `transform` `transitionend`, not the fallback timer.

   (f) **close during entrance (S2)** — open the modal and close it inside the entrance window, in **both** sheet and desktop modes. Assert the panel's computed `transform`/`opacity` at the first post-close sample is the entrance's mid-flight value, *not* the resting style (identity transform / `opacity: 1`) — a snapshot-after-neutralize implementation snaps to resting first and fails this. Then assert continuous progression to the exit end state.

   (g) **pending action resolves during the exit (§3.1a)** — in the Step3 harness, click Publish (and separately Approve & apply / Ignore) with a resolution deliberately delayed to land *inside* the exit window; dismiss via Esc, then via drag-past-threshold. Assert: the exit's computed-transform progression continues uninterrupted past the moment the action resolves (proving the resolution did not truncate it); `onClose` fires **exactly once**, at exit-end, not at resolution time; the panel is still mounted when the action resolves. Also assert the reverse order — action resolves first, then a dismiss gesture — produces one animated close and no second `onClose`. A test asserting only "closed exactly once" would pass against a truncated animation, so the progression assertion is load-bearing.

   (h) **resolution arrives AFTER exit-end (§3.1a, Codex R5)** — **Step3 harness only.** The async success handlers that can resolve late are Step3's (`:236`, `:245`, `:299`); `PublishedReviewModal` has no equivalent — its only closes are dismiss gestures, which the step-1 re-entrancy guard already covers, so there is no reachable Published scenario producing two close requests and none is specified. The slower-than-exit case: start Publish (and separately Approve & apply / Ignore) with a resolution delayed past the full exit duration, dismiss, let the exit complete and the shell unmount, *then* let the action resolve. Assert Step3's parent `onClose` fired **exactly once** (at exit-end) and the late resolution produces **no second call**. This is the case the withdrawn `?? onClose` fallback would have failed while (g) still passed, so it is the regression pin for that fallback ever returning.
6. **Transition-audit** — assert all four affordances resolve to `requestClose`, the §3.1 guards exist (step-0 disable, re-entrancy, drag-cancel, reduced-motion/null-panel), and `handleGrabPointerEnd` early-returns on `dismissingRef`. **Motion-state completeness (structural):** assert `clearPanelDragStyles()` early-returns on `dismissingRef.current` (the §3.2 chokepoint guard — the class defense, so it is pinned rather than left to convention), and that the §3.2 state inventory covers every motion state the shell can produce: enumerate the shell's motion-state sources (`dragRef`, `settleTimerRef`, `dismissTimerRef`, `dismissingRef`, the entrance animation) and fail if any lacks an S-row. A new motion state added without an inventory row must fail this test rather than silently inherit unnormalized exit behavior. **Single-close-path guard (§3.1a, structural):** source-scan both consumers and assert **no** call site invokes the shell's `onClose` prop directly — there is no exempt fallback form (§3.1a) — every close goes through `requestClose`. Behavioral tests cannot cover a *future* direct call, so this is a static scan; a new success/error path added with a bare `onClose()` fails here rather than shipping a second, un-animated close that races the exit.

**Provider-boundary guard (§3.1a, structural — the failure mode is silent):** assert `closeApiRef.current` is a populated function *before* any interaction is possible (immediately after mount, pre-paint), and that invoking it runs the shell's `requestClose` — i.e. it inerts, animates, and closes once. Also assert `useReviewModalClose()` called from a consumer's top level returns the **default no-op**, pinning *why* the ref exists: a future refactor that "simplifies" the ref back to a context hook must fail this test rather than silently reinstating a modal that never closes after publish. Assert the ref is cleared on unmount.

## 8. Out of scope

- **`MODAL-SKELETON-CLOSE-1` stays deferred** (§3.4) — its own task, per the separate-track decision.
- **#485's close mechanics are not touched** — `closing`/`handleClose`/`open={!closing}` are the contract this spec animates in front of, not something it reworks.
- **Failed-close stale `?show=`** — pre-existing on `main`; not introduced here.
- **Competing navigation during an in-flight close** — likewise pre-existing post-#485.
- Browser-Back stays an un-animated route change.
- No new tokens — durations reuse `--duration-normal` / `--duration-fast`; both fallback constants already exist (`:48,:52`).
- ~~**Programmatic success-closes stay instant.**~~ **Withdrawn (Codex R3).** This carve-out was the one remaining path that could call `onClose` without going through `requestClose`, and it is reachable *during* an exit: Step3's success handlers `await` their action then call `onClose()` directly (`Step3ReviewModal.tsx:236`, `:299`, `:245`). On main that is harmless — dismissal unmounts instantly, so a late resolution closes nothing. Under this spec the modal stays mounted for the 120–220ms exit, so a fast-resolving publish/approve/ignore can call `onClose` mid-animation, truncating the exit and breaking the one-exit/one-close contract. That is strictly **worse than main**, so it is in scope (§3.1a).

## 9. Files

| File | Change |
|---|---|
| `components/admin/review/ReviewModalShell.tsx` | `requestClose` + shared `beginDismiss()` (`dismissingRef` + `inert`, also called by the drag branch); `closeAffordancesDisabled?: boolean` prop gating step 0, `handleGrabPointerDown`, and `beginDismiss`; `scrimRef` + `dialogRef`; mode-aware exit styles + scrim fade; `ReviewModalCloseContext` + `useReviewModalClose` + provider wrap; `closeApiRef?: RefObject<(() => void) | null>` populated with `requestClose` in a layout effect and cleared on unmount (§3.1a); scrim/Esc/grab → `requestClose`; `handleGrabPointerEnd` early-return on `dismissingRef` |
| `components/admin/review/ModalCloseButton.tsx` | **new** shared X button (forwardRef, context consumer) |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef`. `closing`/`handleClose` untouched |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef`; owns `closeApiRef` and passes it to the shell; action-success closes (`:236`, `:245`, `:299`) call `closeApiRef.current?.()` instead of `onClose()` directly — no fallback (§3.1a) |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | pass `closeAffordancesDisabled={onClose === undefined}` — derived from the existing prop branch |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 row amendment (§6) |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1`; `MODAL-SKELETON-CLOSE-1` stays |
| tests (§7) | shell unit, ModalCloseButton unit, skeleton dual-usage, interactions spec (a–h), transition-audit |

## 10. Invariants

UI-only. No DB, no advisory locks (2 N/A), no email boundary (3 N/A), no sync cursor (4 N/A), no user-visible error codes (5 N/A), no Supabase call boundary (9 N/A), no mutation surface (10 N/A). Invariant 8 (impeccable dual-gate) **applies** — `/impeccable critique` + `/impeccable audit` before cross-model review. Invariants 6 (commit per task) and 7 (spec canonical) apply.

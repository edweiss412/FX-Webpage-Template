# Spec — Review-modal close exit animation (MODAL-CLOSE-EXIT-ANIM-1)

**Date:** 2026-07-18
**Slug:** `modal-close-exit-anim`
**Status:** draft → self-review → adversarial review
**Un-defers:** `DEFERRED.md` § `MODAL-CLOSE-EXIT-ANIM-1` (`DEFERRED.md:26-29`)
**Amends:** admin-show-modal master spec §6.5 transition inventory (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`)

---

## 1. Problem

Every non-drag close affordance of the review modal — the header **X** button, document **Esc**, the scrim tap, and the sheet **grab-strip tap** — funnels through `onClose` and unmounts the panel with **no exit transition**. The only animated close is the sheet **drag-past-threshold** dismiss, which slides the panel off-screen (`ReviewModalShell.tsx:276-299`). The result is asymmetric: a drag glides out, but an X/Esc/scrim/tap snaps out instantly.

For `PublishedReviewModal` the asymmetry is worse: its `onClose` is `useShowModalNav().close` — a `router.push` (`useShowModalNav.ts:30-36`) — so the modal LINGERS on screen until the RSC roundtrip returns, then vanishes with no transition. On venue cellular this reads as laggy/broken.

This was originally **declined as a defect** because the master spec's §6.5 transition inventory explicitly ratified `open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today` (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`). The `DEFERRED.md` un-defer trigger (`DEFERRED.md:29`) is now pulled: *"a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition (play the reverse sheet/pop animation immediately, fire `router.push` behind it) to BOTH consumers so Step3 parity holds."* This spec is that motion pass.

## 2. Goal

Closing the review modal via X / Esc / scrim / grab-tap plays the **reverse of the entrance animation** immediately, then fires `onClose` behind it — an **optimistic** dismiss. Applied identically in **both** consumers (`Step3ReviewModal`, `PublishedReviewModal`) so Step3 chrome parity holds. Reduced motion collapses to the current instant unmount.

Non-goals: no change to the entrance animation, the drag-past-threshold dismiss, the spring-back, the focus/inert/scroll-lock contracts, or any DB/route/auth surface. UI-only.

## 3. Where the exit lives — the shell (`ReviewModalShell`)

The shell already owns the panel, the scrim, the Esc handler, the grab-tap handler, and the drag-dismiss exit machinery (`ReviewModalShell.tsx:81-465`). The exit animation therefore lives in the shell, so both consumers inherit it with no per-consumer motion code.

### 3.1 `requestClose` — the single animated-close entry point

A new shell-internal `requestClose()` replaces every direct `onClose` call on the four non-drag affordances:

| Affordance | Owner today | Today's handler | New handler |
|------------|-------------|-----------------|-------------|
| Scrim tap | shell | `onClick={onClose}` (`:393`) | `onClick={requestClose}` |
| Esc | shell | `onClose()` in keydown (`:180`) | `requestClose()` |
| Grab-strip tap | shell | `onClick={() => …onClose()}` (`:414-417`) | `requestClose()` (drag-consumed-click guard unchanged) |
| Header **X** | **consumer** | `onClick={close}` / `onClick={onClose}` | `onClick={requestClose}` via context (§3.3) |

`requestClose` behavior:

1. **`closeBehavior === "none"` → true no-op.** Return immediately — no animation, no `onClose`, no release. This preserves the deliberately non-interactive skeleton frame (§3.1a; `ShowReviewModalSkeleton.tsx:35` passes a no-op `onClose`). Checked FIRST so the skeleton's Esc/scrim/grab stay dead exactly as today (MODAL-SKELETON-CLOSE-1 stays deferred — this feature must not regress it into an animate-then-trap).
2. **Re-entrancy guard.** If `dismissingRef.current` is already `true`, return (a close is in flight — no double-fire, no re-animate). Reuses the existing `dismissingRef` (`ReviewModalShell.tsx:206`) that the drag-dismiss already sets.
3. **Cancel any active drag (fixes the compound race, §6).** If `dragRef.current !== null`: release its pointer capture and set `dragRef.current = null`. A pointer sequence that was mid-drag when Esc/X fired then finds `dragRef === null` at `pointerup` and early-returns at the existing guard (`ReviewModalShell.tsx:260`), so it can NEVER run the spring-back branch that would overwrite the exiting panel with `translateY(0)`. Belt-and-suspenders: `handleGrabPointerEnd` also early-returns when `dismissingRef.current` is `true`. Also clear any pending `settleTimerRef` (a spring-back settle must not fight the committed exit).
4. **Set `dismissingRef = true`.**
5. **Reduced motion / null panel → immediate close.** If `panelRef.current` is null OR `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (or `matchMedia` is absent, jsdom), fire the close with no animation: `onClose()`, and — in `navigate` mode ONLY — call `releaseOverlay()` **immediately** (a `router.push` may not unmount for a full RSC roundtrip, so a reduced-motion Published user must not be left blocked; Codex R2 medium). In `unmount` mode the immediate `onClose` unmounts synchronously, so no release is needed.
6. **Animate.** Otherwise neutralize the entrance (`panel.style.animation = "none"`; C1 rationale at `:238-243`), apply the mode-appropriate exit inline styles (§3.2), fade the scrim (§3.2). Close per §3.1a: `navigate` fires `onClose()` NOW (push overlaps the animation) and `releaseOverlay()` at exit-end; `unmount` fires `onClose()` at exit-end. The exit-end signal is the panel's `transitionend` (transform) OR a fallback timer — the `finish()` pattern the drag-dismiss uses (`:284-299`), matched to the mode's duration token.

### 3.1a `closeBehavior` — when `onClose` fires + overlay release (fixes the slow-Published-RSC + trap findings)

The three shell consumers' `onClose` are fundamentally different. A new prop `closeBehavior?: "unmount" | "navigate" | "none"` (default `"unmount"`) selects the timing:

| | `"unmount"` (Step3 — default) | `"navigate"` (Published) | `"none"` (skeleton) |
|---|---|---|---|
| What `onClose` does | **synchronous** parent unmount (`Step3ReviewModal`'s host removes the modal) | `useShowModalNav().close` — a `router.push` (async; the route change unmounts later) | a no-op (`() => {}`, `ShowReviewModalSkeleton.tsx:35`) |
| When shell calls `onClose` | at **exit-end** (transitionend/fallback). Calling it at start would unmount the shell instantly and kill the animation. | **immediately** at `requestClose` start — the push overlaps the animation (truly optimistic). | never — `requestClose` returns at step 1 |
| Why not the other timing | early → animation dies (sync unmount) | late → push starts only after the animation, so on a slow RSC the faded-but-mounted overlay traps the page behind an invisible layer (Codex R1) | animating a no-op leaves the loading frame mounted + trapping (Codex R2) |

**`releaseOverlay()` — the anti-trap (navigate only).** In `navigate` mode the shell node lingers until the route lands; `releaseOverlay` neutralizes **every** shell side-effect that could interfere with the restored background, so the lingering node is functionally gone. Runs at exit-end (animated path) OR immediately (reduced-motion/null-panel path). It:

1. restores `document.body.style.overflow` to the value saved at open (lifted to `scrollLockPrevRef`);
2. un-inerts + restores `aria-hidden` on the `[data-inert-root]` background roots (the same restore the first effect's cleanup runs, factored into a shared `restoreBackgroundInert()` using a saved `inertPrevRef` snapshot);
3. neutralizes the fixed overlay itself (`dialogRef`, the `fixed inset-0 z-50` root at `ReviewModalShell.tsx:380` whose scrim is `absolute inset-0 bg-overlay-scrim` at `:394`): sets **`pointer-events: none`** — so background pointer clicks pass THROUGH the transparent overlay/scrim to the page (the unambiguous hit-test disable; `inert`'s pointer-event suppression on a fixed overlay is UA-ambiguous and must NOT be relied on for click pass-through — Codex R3 high) — AND **`inert` + `aria-hidden="true"`** — which removes the whole subtree from keyboard/Tab, focus, and the a11y tree, so the still-mounted `useDialogFocus` Tab-trap (`dialogFocus.ts:75`) cannot cycle focus through the hidden dialog (Codex R2 high). No change to `useDialogFocus`.
4. **gates the document Escape handler off**: the keydown effect's `onKeyDown` early-returns when `overlayReleasedRef.current` is `true`, so an Esc pressed on the restored background is NOT `preventDefault`ed/swallowed by the hidden modal (Codex R3 medium). (`requestClose` would already no-op behind `dismissingRef`, but the un-gated handler's `preventDefault` alone breaks background Esc-driven controls.)
5. restores focus to the trigger: `previouslyFocusedRef.current?.focus()` if still in the DOM — WCAG-correct now that the dialog is `inert` (focus would otherwise fall to `<body>`). `previouslyFocused` is lifted from the first effect's local to `previouslyFocusedRef` so both `releaseOverlay` and the unmount cleanup reach it.

**Side-effect release completeness (comprehensive re-analysis, Codex R1–R3 same-vector).** Every shell side-effect live during the lingering-navigate window is accounted for: (a) background inert → un-inerted (item 2); (b) body scroll lock → restored (item 1); (c) document Esc listener → gated (item 4); (d) fixed overlay + scrim hit-testing → `pointer-events:none` (item 3); (e) `useDialogFocus` Tab-trap → defeated by dialog-root `inert` (item 3); (f) matchMedia `sm`-boundary listener (`:337`) → its `onChange` already guards `!dismissingRef.current` (`:361`) and `dismissingRef` is `true`, so it no-ops; (g) grab/panel pointer + click handlers → unreachable under `pointer-events:none` and guarded by `dismissingRef`. No live side-effect remains un-neutralized.

`releaseOverlay` is idempotent, guarded by `overlayReleasedRef`: whichever fires first (early release OR the unmount cleanups) wins; the other no-ops. The first effect's cleanup, the scroll-lock cleanup, and `useDialogFocus`'s cleanup all still run on real unmount and are safe to double-run (each checks prior state). In `unmount`/`none` modes `releaseOverlay` never runs (the exit-end IS the unmount; the skeleton never closes).

### 3.2 Exit treatment (mode-aware, JS-inline)

Mode is read from `window.matchMedia("(min-width: 640px)").matches` (the `sm` boundary the shell already tracks, `:351`). Exit is driven by **inline styles**, mirroring the drag-dismiss path — NOT by new CSS `@keyframes`/data-attr rules. Rationale in §7.

| Mode | Panel exit (reverse of entrance) | Duration token | Fallback const |
|------|----------------------------------|----------------|----------------|
| Sheet (`<sm`) | `transform: translateY(100%)` (identical to drag-dismiss `:283`) | `--duration-normal` (220ms) | `DURATION_NORMAL_FALLBACK_MS` (`:48`) |
| Desktop (`≥sm`) | `opacity: 0; transform: translateY(8px) scale(0.98)` (reverse of `step3-details-pop-in` `app/globals.css:737-746`) | `--duration-fast` (120ms) | `DURATION_FAST_FALLBACK_MS` (`:52`) |

Panel transition property: sheet = `transform var(--duration-normal) var(--ease-out-quart)`; desktop = `opacity … , transform …` at `--duration-fast`. The `transitionend` listener keys on `propertyName === "transform"` (present in both modes) — the same predicate the drag path uses (`:295-296`).

**Scrim fade (both modes):** a new `scrimRef` lets `requestClose` set `scrim.style.animation = "none"; scrim.style.transition = "opacity <dur> ease-out"; scrim.style.opacity = "0"`, where `<dur>` matches the panel's mode duration. The scrim fade is cosmetic and does NOT gate the exit-end signal (the panel `transform` transitionend / fallback does — which drives `unmount`-mode `onClose` and `navigate`-mode `releaseOverlay`); if the scrim's own transitionend never fires it is harmless.

Entrance is unchanged: `step3-details-sheet-rise` / `step3-details-pop-in` / `step3-details-scrim-in` (`app/globals.css:717-792`) still play on open.

### 3.3 Consumer parity — the X button via context

The header **X** button is rendered inside each consumer's `header` slot (`PublishedReviewModal.tsx:253-262`, `Step3ReviewModal.tsx:436-445`), so the shell cannot wire it directly. A React context carries `requestClose` from the shell to the consumer-owned X:

- `ReviewModalCloseContext` (default value: a no-op) + `useReviewModalClose()` hook, exported from the review module.
- `OpenReviewModalShell` wraps its rendered tree in `<ReviewModalCloseContext.Provider value={requestClose}>` so everything under the panel — including the `header` slot — can read it.
- A shared **`ModalCloseButton`** component (`forwardRef`, in `components/admin/review/`) reads the context and renders the X: `aria-label="Close"`, the `X` icon, `onClick={requestClose}`, `data-testid` via prop, `className` carried verbatim from the two identical existing buttons. Because it renders **inside** the provider (in the header slot), the context resolves correctly — a hook call at the consumer's own top level would NOT (it sits above the provider). Each consumer replaces its inline X `<button>` with `<ModalCloseButton>` and forwards `initialFocusRef` for the initial-focus contract (`ReviewModalShell.tsx:141`).

The shell's `onClose` prop is unchanged: consumers still pass their raw close (`close` / parent-unmount `onClose`). The shell derives `requestClose` from `onClose` internally. `PublishedReviewModal` passes `closeBehavior="navigate"` (§3.1a); `Step3ReviewModal` passes nothing (defaults `"unmount"`); `ShowReviewModalSkeleton` passes `closeBehavior="none"` (affordances stay dead — no X to convert, so it gains no `ModalCloseButton`).

## 4. Guard conditions

| Input / state | Behavior |
|---------------|----------|
| `closeBehavior="none"` (skeleton) Esc/scrim/grab | `requestClose` returns at step 1 — no animation, no `onClose`. Frame stays exactly as today (deliberately non-interactive; MODAL-SKELETON-CLOSE-1 unchanged) |
| `requestClose` fired while `dismissingRef` already true (double Esc, Esc-then-X, scrim-then-Esc) | no-op (§3.1 step 2) — one exit, one close |
| drag in progress when Esc/X fires | `requestClose` releases the drag's pointer capture + nulls `dragRef` (§3.1 step 3); the pending `pointerup` early-returns → NO spring-back overwrite of the exiting panel |
| reduced motion, or `matchMedia` unavailable (jsdom) | immediate close (§3.1 step 5); `navigate` also calls `releaseOverlay()` immediately (jsdom lacks `matchMedia`, guarded like `:350`) |
| `panelRef.current` null at fire time | immediate close (§3.1 step 5); `navigate` releases overlay immediately (defensive, mirrors drag `:275`) |
| **Published (`navigate`): RSC slower than the exit animation** | `onClose` (push) fired at start; panel sits at its exit end-state; at exit-end `releaseOverlay()` restores body scroll, un-inerts the background, sets the dialog root `inert`+`aria-hidden`, and restores focus to the trigger → the invisible node traps neither pointer NOR keyboard/focus. Unmounts when the route lands; `releaseOverlay` idempotent (`overlayReleasedRef`). `close` always strips `show`, so the route always changes. |
| Published (`navigate`): RSC faster than the animation | route change unmounts mid-animation → exit cut short (snappy). Acceptable — optimistic close is best-effort. |
| Step3 (`unmount`): exit-end | `onClose` fires at exit-end → parent unmounts. `releaseOverlay` never runs. |
| viewport crosses `sm` mid-exit | existing matchMedia cleanup (`:337-372`) guards `!dismissingRef.current` before clearing inline styles (`:361`) — a committed exit is not yanked back. Unchanged. |
| unmount mid-exit (parent unmounts before transitionend) | existing unmount cleanup clears the fallback timers (`:368-369`) — no late `onClose` after unmount; `overlayReleasedRef` guards double-release |

## 5. Dimensional invariants

None changed. The panel's `max-h`/`max-w` and internal flex column (`ReviewModalShell.tsx:400-457`) are untouched; exit sets only `transform`/`opacity`/`transition`/`animation` inline, all cleared by unmount.

## 6. Transition inventory (amends master spec §6.5)

The master spec §6.5 row (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`) changes from:

> `open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation); back-button unmount is a route change`

to:

> `open → closed (X/scrim/Esc/grab-tap) | optimistic exit animation via shell requestClose — reverse of entrance (sheet: translateY(100%) slide-down; desktop: fade + scale 0.98 + translateY 8px) + scrim fade. navigate mode (Published): onClose/router.push fires immediately so nav overlaps the animation, and releaseOverlay() (body scroll restore + background un-inert + dialog-root pointer-events:none + inert + Esc-handler gate + focus restore) drops the overlay at exit-end (or immediately under reduced motion) so a slow RSC traps neither pointer, keyboard/Esc, nor focus. unmount mode (Step3): onClose fires at exit-end. Skeleton (closeBehavior="none"): affordances stay dead. Reduced motion → instant close. Back-button unmount is a route change (no requestClose in the popstate path).`

Full inventory for THIS feature's states:

| Transition | Treatment |
|------------|-----------|
| closed → open | entrance (unchanged): `step3-details-sheet-rise` `<sm` / `step3-details-pop-in` `≥sm` + `step3-details-scrim-in` (`app/globals.css:772-792`) |
| open → exiting (X/Esc/scrim/grab-tap) | `requestClose`: cancel active drag (§3.1 step 3) + mode-aware reverse (§3.2) + scrim fade, JS-inline; `onClose` timing per §3.1a |
| exiting → closed | `navigate`: route change unmounts (push fired at start); `releaseOverlay` at exit-end if still mounted. `unmount`: `onClose` at panel `transform` transitionend / fallback (§3.1 step 6). Unmount clears inline styles. |
| open → closed, reduced motion | immediate close — no animation (§3.1 step 5); `navigate` releases the overlay immediately — preserves the ratified reduced-motion collapse without leaving a slow-RSC Published user blocked |
| skeleton (`closeBehavior="none"`) Esc/scrim/grab | **no-op** — deliberately non-interactive frame, unchanged (MODAL-SKELETON-CLOSE-1 stays deferred) |
| open → closed, drag past threshold | **unchanged** — existing slide-down (`ReviewModalShell.tsx:276-299`); scrim not faded (out of scope, §8) |
| open → closed, browser Back | **unchanged** — route change unmounts; `requestClose` is not in this path (no in-app affordance fires) |

**Compound transitions:**
- exit committed, then viewport crosses `sm` → matchMedia cleanup guards `!dismissingRef.current` (`:361`), exit not interrupted. Unchanged.
- **drag in progress, then X/Esc pressed** → `requestClose` cancels the drag first (§3.1 step 2): releases the grab's pointer capture and nulls `dragRef`, so the eventual `pointerup` early-returns at `:260` and CANNOT run the spring-back that would overwrite the exiting panel with `translateY(0)`. The exit animates from the drag's current inline transform (continuous). `dismissingRef` blocks a second `requestClose`. Acceptance (real-browser test, §9.4): hold a mid-drag, press Esc, release the pointer AFTER the fallback timer — the panel exits and closes exactly once, no visible snap-back.
- `requestClose` fired twice fast (Esc, then scrim before unmount) → second is a no-op (guard). One exit.

## 7. Design decision — JS-inline exit, not twinned CSS keyframes

Two mechanisms were considered:

**(a) JS-inline** (chosen): `requestClose` sets `transform`/`opacity`/`transition` on the panel and `opacity`/`transition` on the scrim, exactly as the drag-dismiss already manipulates the panel (`:282-283`). No new CSS.

**(b) CSS `[data-*-exiting]` keyframes**, twinned `[data-review-modal-*]`/`[data-step3-review-*]` like the entrance.

**(a) wins** because:
1. **Consistency** — the sheet exit becomes pixel-identical to the drag-dismiss slide-down (same `translateY(100%)`, same token, same `transitionend`/fallback), because it reuses the same machinery.
2. **It does not destabilize two existing structural pins.** The entrance twin-scan asserts `[data-step3-review-*]` receives an animation body in **exactly 3** media contexts (base, ≥640px, reduced-motion) and `[data-review-modal-*]` mirrors it (`tests/components/admin/review/reviewModalShell.test.tsx:186-197`). CSS exit rules would add contexts and force that count/equality to be re-derived. JS-inline leaves entrance CSS — and that test — untouched.
3. **The `pageTransitions` no-motion pin stays green.** `PublishedReviewModal.tsx` is pinned to a conditional-render count of **1** and "imports no client motion library, no `AnimatePresence`" (`tests/components/admin/showpage/pageTransitions.test.tsx:123,136-141`). Exit living in the shell as JS-inline (not framer, not a new consumer conditional) keeps both assertions true.

Reduced motion is read at fire time via `matchMedia` — no CSS `@media` needed for the collapse.

## 8. Out of scope

- The drag-dismiss path (`:276-299`) is unchanged, including its non-fading scrim. Unifying the drag scrim fade with `requestClose`'s is a possible future follow-up, noted not landed (avoids re-touching a ratified transition).
- Browser-Back close stays an un-animated route change (no in-app affordance to intercept; `requestClose` is not reachable from the popstate path).
- No new tokens (DESIGN.md §10) — durations reuse `--duration-normal` / `--duration-fast`; the fallback constants (`DURATION_NORMAL_FALLBACK_MS`, `DURATION_FAST_FALLBACK_MS`) already exist (`ReviewModalShell.tsx:48,52`).
- **Programmatic success-closes stay instant.** `requestClose` is for user *dismiss* affordances only (X/Esc/scrim/grab-tap). Step3's action-success closes — `handlePublish`/`handleApproveResolve`/`handleIgnoreResolve` calling `onClose()` after a resolved mutation (`Step3ReviewModal.tsx:238,256,309`) — are NOT dismiss gestures (the modal closes because the action landed) and call `onClose` directly, unchanged. Animating them is out of scope; they are not asymmetric with a drag because the user did not gesture a close.

## 9. Test surface

1. **Shell unit (`reviewModalShell.test.tsx`)** — in jsdom (`matchMedia` absent → immediate-close path per §3.1 step 5) scrim/Esc/grab route through `requestClose` and call `onClose` exactly once; re-entrancy guard fires `onClose` once for double-Esc/Esc-then-scrim. `closeBehavior`: `"unmount"`/default call `onClose` once; `"none"` NEVER calls `onClose` (scrim/Esc/grab are inert — the skeleton contract) and never animates; `"navigate"` calls `onClose` once AND runs the `releaseOverlay` restore (assert `[data-inert-root]` un-inerted + body overflow restored) in the immediate path. The entrance twin-scan (`:186-197`) must stay unchanged and green (count === 3).
2. **`ModalCloseButton` unit** — reads context, forwards ref, `onClick` calls the provided `requestClose`; default no-op context when rendered outside a provider.
3. **`pageTransitions.test.tsx`** — `PublishedReviewModal` conditional count stays **1** and no-motion assertions stay green (regression guard, no edit expected).
4. **Skeleton regression (`ShowReviewModalSkeleton`)** — unit test: Esc, scrim tap, and grab tap while the skeleton is mounted do NOT unmount it, do NOT animate, and leave scroll-lock/inert active (the frame stays a live loading state — Codex R2 high). Guards against the `closeBehavior="none"` path regressing.
5. **Real-browser (`published-review-modal.interactions.spec.ts`)** — four groups:
   (a) **exit-animation flip** — the §6.5 assertion flips: X / Esc / scrim leave an exit-animated frame (panel carries a non-identity exit `transform`/`opacity` inline, scrim opacity → 0) BEFORE the modal frame leaves the DOM and the URL strips `show`/`alert_id`. Anti-tautology: sample the panel's *computed* transform/opacity during the exit window and assert non-identity, then assert removal + URL strip. Reduced-motion run collapses to instant (no exit frame).
   (b) **slow-navigation anti-trap** (R1 finding 2 / R2 / R3) — with the route/RSC delayed (e.g. block the `/admin` navigation response), assert that after the exit animation completes the background is fully usable, all BEFORE the route unmount: `[data-inert-root]` no longer `inert`, `document.body.style.overflow` restored, the dialog root has both `inert` AND `pointer-events:none`; **a real background button receives a pointer click** (proves the fixed overlay/scrim no longer swallows clicks, R3 high); **`document.activeElement` is OUTSIDE the dialog (the trigger)** and **Tab reaches a background control** (keyboard/focus trap released, R2 high); **Esc pressed on a focused background control is NOT swallowed** by the hidden modal (its own handler/default fires, R3 medium).
   (c) **reduced-motion slow-navigation** (R2 medium) — reduced-motion emulation + delayed route: assert inert/scroll/focus release happen immediately after the (instant) close, without waiting for the route unmount.
   (d) **compound drag-held + Esc** (R1 finding 1) — press-and-hold the grab past slop, press Esc, release the pointer AFTER the fallback timer; assert the panel exits and the modal closes exactly once with no `translateY(0)` snap-back frame.
6. **Transition-audit** — enumerate the four affordances' handlers all resolve to `requestClose`; assert the §3.1 guards exist (closeBehavior="none" short-circuit, drag-cancel, reduced-motion/null-panel immediate close, `dismissingRef` re-entrancy) and that `handleGrabPointerEnd` early-returns on `dismissingRef`.

## 10. Files

| File | Change |
|------|--------|
| `components/admin/review/ReviewModalShell.tsx` | `requestClose` (+ drag-cancel), `closeBehavior?: "unmount"\|"navigate"\|"none"` prop, `scrimRef` + `dialogRef`, `releaseOverlay()` (body-scroll + background-un-inert + dialog-root `pointer-events:none`/`inert` + Esc-gate + focus) + `overlayReleasedRef`, lift `previouslyFocusedRef`/`scrollLockPrevRef`/`inertPrevRef` from effect locals to refs + `restoreBackgroundInert()` helper, document-Esc `onKeyDown` early-returns on `overlayReleasedRef`, `ReviewModalCloseContext` + `useReviewModalClose`, provider wrap; scrim/Esc/grab → `requestClose`; `handleGrabPointerEnd` early-return on `dismissingRef` |
| `components/admin/review/ModalCloseButton.tsx` | new shared X button (forwardRef, context consumer) |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef`; pass `closeBehavior="navigate"` |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef` (default `unmount`) |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | pass `closeBehavior="none"` (affordances stay dead — no regression to MODAL-SKELETON-CLOSE-1) |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 row amendment (§6 above) |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1` |
| tests (§9) | shell unit, ModalCloseButton unit, skeleton regression, interactions spec (4 groups), transition-audit |

## 11. Invariants

UI-only. No DB, no advisory locks (invariant 2 N/A), no email boundary (3 N/A), no sync cursor (4 N/A), no user-visible error codes (5 N/A), no Supabase call boundary (9 N/A), no mutation surface (10 N/A). Invariant 8 (impeccable dual-gate) **applies** — `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Invariant 6 (commit per task) and 7 (spec canonical — this spec is the ratified amendment to §6.5) apply.

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

1. **Re-entrancy guard.** If `dismissingRef.current` is already `true`, return (a close is in flight — no double-fire, no re-animate). Reuses the existing `dismissingRef` (`ReviewModalShell.tsx:206`) that the drag-dismiss already sets.
2. **Reduced motion.** If `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, set `dismissingRef = true` and call `onClose()` immediately (current instant behavior — the ratified reduced-motion collapse). No animation.
3. **Animate.** Otherwise set `dismissingRef = true`, neutralize the entrance (`panel.style.animation = "none"`; the C1 rationale at `:238-243`), apply the mode-appropriate exit inline styles (§3.2), fade the scrim (§3.2), and call `onClose()` on the panel's `transitionend` (transform) OR a fallback timer — the exact `finish()` pattern the drag-dismiss uses (`:284-299`), matched to the same duration token.

### 3.2 Exit treatment (mode-aware, JS-inline)

Mode is read from `window.matchMedia("(min-width: 640px)").matches` (the `sm` boundary the shell already tracks, `:351`). Exit is driven by **inline styles**, mirroring the drag-dismiss path — NOT by new CSS `@keyframes`/data-attr rules. Rationale in §7.

| Mode | Panel exit (reverse of entrance) | Duration token | Fallback const |
|------|----------------------------------|----------------|----------------|
| Sheet (`<sm`) | `transform: translateY(100%)` (identical to drag-dismiss `:283`) | `--duration-normal` (220ms) | `DURATION_NORMAL_FALLBACK_MS` (`:48`) |
| Desktop (`≥sm`) | `opacity: 0; transform: translateY(8px) scale(0.98)` (reverse of `step3-details-pop-in` `app/globals.css:737-746`) | `--duration-fast` (120ms) | `DURATION_FAST_FALLBACK_MS` (`:52`) |

Panel transition property: sheet = `transform var(--duration-normal) var(--ease-out-quart)`; desktop = `opacity … , transform …` at `--duration-fast`. The `transitionend` listener keys on `propertyName === "transform"` (present in both modes) — the same predicate the drag path uses (`:295-296`).

**Scrim fade (both modes):** a new `scrimRef` lets `requestClose` set `scrim.style.animation = "none"; scrim.style.transition = "opacity <dur> ease-out"; scrim.style.opacity = "0"`, where `<dur>` matches the panel's mode duration. The scrim fade is cosmetic and does NOT gate `onClose` (the panel `transform` transitionend does); if the scrim's own transitionend never fires it is harmless.

Entrance is unchanged: `step3-details-sheet-rise` / `step3-details-pop-in` / `step3-details-scrim-in` (`app/globals.css:717-792`) still play on open.

### 3.3 Consumer parity — the X button via context

The header **X** button is rendered inside each consumer's `header` slot (`PublishedReviewModal.tsx:253-262`, `Step3ReviewModal.tsx:436-445`), so the shell cannot wire it directly. A React context carries `requestClose` from the shell to the consumer-owned X:

- `ReviewModalCloseContext` (default value: a no-op) + `useReviewModalClose()` hook, exported from the review module.
- `OpenReviewModalShell` wraps its rendered tree in `<ReviewModalCloseContext.Provider value={requestClose}>` so everything under the panel — including the `header` slot — can read it.
- A shared **`ModalCloseButton`** component (`forwardRef`, in `components/admin/review/`) reads the context and renders the X: `aria-label="Close"`, the `X` icon, `onClick={requestClose}`, `data-testid` via prop, `className` carried verbatim from the two identical existing buttons. Because it renders **inside** the provider (in the header slot), the context resolves correctly — a hook call at the consumer's own top level would NOT (it sits above the provider). Each consumer replaces its inline X `<button>` with `<ModalCloseButton>` and forwards `initialFocusRef` for the initial-focus contract (`ReviewModalShell.tsx:141`).

The shell's `onClose` prop is unchanged: consumers still pass their raw close (`close` / parent-unmount `onClose`). The shell derives `requestClose` from `onClose` internally. Consumers pass NO new prop.

## 4. Guard conditions

| Input / state | Behavior |
|---------------|----------|
| `requestClose` fired while `dismissingRef` already true (double Esc, Esc-then-X) | no-op (guard 3.1.1) — one exit, one `onClose` |
| reduced motion | instant `onClose`, no animation (guard 3.1.2) |
| `panelRef.current` null at fire time | call `onClose()` immediately (no panel to animate — defensive, mirrors drag `:275`) |
| `matchMedia` unavailable (jsdom) | treat as reduced-motion path → instant `onClose` (jsdom has no `matchMedia`; guarded exactly like `:350`) |
| Published: RSC roundtrip slower than the exit animation | panel already at its exit end-state (`translateY(100%)` / `opacity:0`), `dismissingRef` true → sits invisible, no re-animate, unmounts when the route change lands. `close` always strips `show` so the route always changes. |
| viewport crosses `sm` mid-exit | the existing matchMedia cleanup (`:337-372`) already guards `!dismissingRef.current` before clearing inline styles (`:361`) — a committed exit is not yanked back. Unchanged. |
| unmount mid-exit (parent unmounts before transitionend) | existing unmount cleanup clears the fallback timers (`:368-369`) — no late `onClose` after unmount |

## 5. Dimensional invariants

None changed. The panel's `max-h`/`max-w` and internal flex column (`ReviewModalShell.tsx:400-457`) are untouched; exit sets only `transform`/`opacity`/`transition`/`animation` inline, all cleared by unmount.

## 6. Transition inventory (amends master spec §6.5)

The master spec §6.5 row (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`) changes from:

> `open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation); back-button unmount is a route change`

to:

> `open → closed (X/scrim/Esc/grab-tap) | optimistic exit animation — reverse of entrance (sheet: translateY(100%) slide-down; desktop: fade + scale 0.98 + translateY 8px), scrim fades out, then onClose fires behind it (shell requestClose). Reduced motion → instant unmount. Back-button unmount is a route change (no exit animation — no requestClose in the browser-back path).`

Full inventory for THIS feature's states (N=4: open, exiting, closed, reduced-motion-instant):

| Transition | Treatment |
|------------|-----------|
| closed → open | entrance (unchanged): `step3-details-sheet-rise` `<sm` / `step3-details-pop-in` `≥sm` + `step3-details-scrim-in` (`app/globals.css:772-792`) |
| open → exiting (X/Esc/scrim/grab-tap) | `requestClose`: mode-aware reverse (§3.2) + scrim fade, JS-inline |
| exiting → closed | `onClose` on panel `transform` transitionend or fallback timer (§3.1.3); unmount clears inline styles |
| open → closed, reduced motion | instant `onClose` — no animation (§3.1.2) — preserves the ratified reduced-motion collapse |
| open → closed, drag past threshold | **unchanged** — existing slide-down (`ReviewModalShell.tsx:276-299`); scrim not faded (out of scope, §8) |
| open → closed, browser Back | **unchanged** — route change unmounts; `requestClose` is not in this path (no in-app affordance fires) |

**Compound transitions:**
- exit committed, then viewport crosses `sm` → matchMedia cleanup guards `!dismissingRef.current` (`:361`), exit not interrupted. Unchanged.
- drag in progress, then X/Esc pressed → today Esc unmounts mid-drag; now `requestClose` runs, but a drag sets no `dismissingRef` until past-threshold, so `requestClose` animates from the drag's current inline transform. The guard (3.1.1) prevents a *second* `requestClose`; the drag's own pointer handlers still resolve harmlessly on the departing panel (pointer capture released by the unmount cleanup `:365-370`). Acceptance: no stranded capture, one `onClose`.
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

1. **Shell unit (`reviewModalShell.test.tsx`)** — `requestClose` reduced-motion path (jsdom has no `matchMedia` → instant `onClose`); scrim/Esc/grab route through it (still call `onClose` exactly once in jsdom's instant path); re-entrancy guard fires `onClose` once for double-Esc. The entrance twin-scan (`:186-197`) must stay unchanged and green (count === 3).
2. **`ModalCloseButton` unit** — reads context, forwards ref, `onClick` calls the provided `requestClose`; default no-op context when rendered outside a provider.
3. **`pageTransitions.test.tsx`** — `PublishedReviewModal` conditional count stays **1** and no-motion assertions stay green (regression guard, no edit expected).
4. **Real-browser (`published-review-modal.interactions.spec.ts`)** — the §6.5 assertion flips: X / Esc / scrim now leave an exit-animated frame (panel carries the exit `transform`/`opacity` inline, scrim opacity → 0) BEFORE the URL strips `show`/`alert_id`; reduced-motion run still collapses to instant unmount; drag-dismiss unchanged. This is the anti-tautology gate: assert the panel's computed exit transform/opacity is non-identity during the exit window, then assert unmount + URL strip.
5. **Transition-audit** — enumerate the four affordances' handlers all resolve to `requestClose`; assert reduced-motion + null-panel guards; assert `dismissingRef` re-entrancy.

## 10. Files

| File | Change |
|------|--------|
| `components/admin/review/ReviewModalShell.tsx` | `requestClose`, `scrimRef`, `ReviewModalCloseContext` + `useReviewModalClose`, provider wrap; scrim/Esc/grab → `requestClose` |
| `components/admin/review/ModalCloseButton.tsx` | new shared X button (forwardRef, context consumer) |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef` |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef` |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 row amendment (§6 above) |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1` |
| tests (§9) | shell unit, ModalCloseButton unit, interactions spec flip, transition-audit |

## 11. Invariants

UI-only. No DB, no advisory locks (invariant 2 N/A), no email boundary (3 N/A), no sync cursor (4 N/A), no user-visible error codes (5 N/A), no Supabase call boundary (9 N/A), no mutation surface (10 N/A). Invariant 8 (impeccable dual-gate) **applies** — `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Invariant 6 (commit per task) and 7 (spec canonical — this spec is the ratified amendment to §6.5) apply.

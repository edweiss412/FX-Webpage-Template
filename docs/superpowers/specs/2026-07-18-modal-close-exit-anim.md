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
2. **Cancel any active drag (fixes the compound race, §6).** If `dragRef.current !== null`: release its pointer capture and set `dragRef.current = null`. A pointer sequence that was mid-drag when Esc/X fired then finds `dragRef === null` at `pointerup` and early-returns at the existing guard (`ReviewModalShell.tsx:260`), so it can NEVER run the spring-back branch that would overwrite the exiting panel with `translateY(0)`. Belt-and-suspenders: `handleGrabPointerEnd` also early-returns when `dismissingRef.current` is `true`. Also clear any pending `settleTimerRef` (a spring-back settle must not fight the committed exit).
3. **Commit the dismiss (shared `beginDismiss()` routine).** Set `dismissingRef = true` AND make the overlay inert: `dialogRef.current.inert = true` (the whole `role="dialog"` subtree — scrim, panel, grab, footer). **This exact `beginDismiss()` step is shared with — and invoked at the start of — the drag-past-threshold branch (§3.1b), NOT only `requestClose`**; every close affordance (X/Esc/scrim/grab-tap AND drag) inerts the subtree at the instant its dismiss commits, so the exit-window mutation suppression below holds on all of them (Codex R7 high — the R6 fix inerted only the `requestClose` paths; the drag path also delays `onClose` 120–220ms in `unmount` mode and lingers until `releaseOverlay` in `navigate` mode, and without this shared inert its footer/action controls stayed live). The suppression it provides: a *dismissed* modal cannot fire a late action — critical in `unmount` mode (Step3), where `onClose` is delayed 120–220ms and the footer buttons are still wired to `handlePublish`/`handleUnpublish`/`handleApproveResolve`/`handleIgnoreResolve` (`Step3ReviewModal.tsx`); a fast click/keypress during the exit must NOT publish/unpublish/approve/ignore after dismissal (today's instant unmount has no such window — Codex R6/R7 high). Applies to every mode (in reduced-motion/immediate paths the window is ~0, harmless). `inert` does not block the CSS exit transition or `transitionend`. Focus blurred by `inert` is restored to the trigger at close (unmount cleanup / `releaseOverlay`). In `navigate` mode `releaseOverlay`'s `display:none` later supersedes it; unmount removes it in `unmount` mode.
4. **Reduced motion / null panel → immediate close.** If `panelRef.current` is null OR `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (or `matchMedia` is absent, jsdom), fire the close with no animation: `onClose()`, and — in `navigate` mode ONLY — call `releaseOverlay()` **immediately** (a `router.push` may not unmount for a full RSC roundtrip, so a reduced-motion Published/skeleton user must not be left blocked; Codex R2 medium). In `unmount` mode the immediate `onClose` unmounts synchronously, so no release is needed.
5. **Animate.** Otherwise neutralize the entrance (`panel.style.animation = "none"`; C1 rationale at `:238-243`), apply the mode-appropriate exit inline styles (§3.2), fade the scrim (§3.2). Close per §3.1a: `navigate` fires `onClose()` NOW (push overlaps the animation) and `releaseOverlay()` at exit-end; `unmount` fires `onClose()` at exit-end. The exit-end signal is the panel's `transitionend` (transform) OR a fallback timer — the `finish()` pattern the drag-dismiss uses (`:284-299`), matched to the mode's duration token.

### 3.1a `closeBehavior` — when `onClose` fires + overlay release (fixes the slow-Published-RSC + trap findings)

The shell consumers' `onClose` are fundamentally different. A new prop `closeBehavior?: "unmount" | "navigate"` (default `"unmount"`) selects the timing. There is deliberately NO `"none"`/inert mode — every consumer is closeable (the skeleton included, §3.4 — Codex R5 high: a dead skeleton is the MODAL-SKELETON-CLOSE-1 trap, which this task's un-defer trigger explicitly names):

| | `"unmount"` (Step3 — default) | `"navigate"` (Published + skeleton) |
|---|---|---|
| What `onClose` does | **synchronous** parent unmount (`Step3ReviewModal`'s host removes the modal) | `useShowModalNav().close` — a `router.push` (async; the route change unmounts later) |
| When shell calls `onClose` | at **exit-end** (transitionend/fallback). Calling it at start would unmount the shell instantly and kill the animation. | **immediately** at `requestClose` start — the push overlaps the animation (truly optimistic). |
| Why not the other timing | early → animation dies (sync unmount) | late → push starts only after the animation, so on a slow RSC the faded-but-mounted overlay traps the page behind an invisible layer (Codex R1) |

**`releaseOverlay()` — the anti-trap (navigate only).** In `navigate` mode the shell node lingers until the route lands; `releaseOverlay` neutralizes **every** shell side-effect that could interfere with the restored background, so the lingering node is functionally gone. Runs at exit-end (animated path) OR immediately (reduced-motion/null-panel path). It:

1. restores `document.body.style.overflow` to the value saved at open (lifted to `scrollLockPrevRef`);
2. un-inerts + restores `aria-hidden` on the `[data-inert-root]` background roots (the same restore the first effect's cleanup runs, factored into a shared `restoreBackgroundInert()` using a saved `inertPrevRef` snapshot);
3. **hides the fixed overlay entirely — `dialogRef.style.display = "none"`** (the dialog root is the `fixed inset-0 z-50` overlay at `ReviewModalShell.tsx:380`, scrim `absolute inset-0 bg-overlay-scrim` at `:394`). `display:none` removes the whole subtree from **rendering AND hit-testing** in one unambiguous move: background pointer clicks reach the page (no reliance on `inert`'s UA-ambiguous pointer semantics — Codex R3 high), the panel/scrim are visually gone (also covers the drag path's non-faded scrim, §3.1b), and the subtree leaves the focus order + a11y tree so the still-mounted `useDialogFocus` Tab-trap (`dialogFocus.ts:75`) has nothing to cycle (Codex R2 high). No change to `useDialogFocus`.
4. **gates the document Escape handler off**: the keydown effect's `onKeyDown` early-returns when `overlayReleasedRef.current` is `true`, so an Esc pressed on the restored background is NOT `preventDefault`ed/swallowed by the hidden modal (Codex R3 medium). (The document listener is independent of `display:none`, so it must be gated explicitly; `requestClose` would already no-op behind `dismissingRef`, but the un-gated handler's `preventDefault` alone breaks background Esc-driven controls.)
5. restores focus to the trigger: `previouslyFocusedRef.current?.focus()` if still in the DOM — WCAG-correct now that the dialog is `display:none` (focus would otherwise fall to `<body>`). `previouslyFocused` is lifted from the first effect's local to `previouslyFocusedRef` so both `releaseOverlay` and the unmount cleanup reach it.

**Unmount focus-restore must not steal the user's background focus (Codex R5 medium).** After `releaseOverlay` runs, the background is usable, so the user can click or Tab into a background control BEFORE the delayed route finally unmounts. The unmount focus-restores must not then yank focus back to the stale trigger. Both restore sites are gated on `overlayReleasedRef.current`: (a) the shell's first-effect inert cleanup (`ReviewModalShell.tsx:133-135`) wraps its `previouslyFocused.focus()` in `if (!overlayReleasedRef.current)`; (b) `useDialogFocus` gains an optional `shouldRestoreFocus?: () => boolean` param (default `() => true`, so `GalleryLightbox`/`AgendaSheet` are unchanged) — the shell passes `() => !overlayReleasedRef.current`. When the overlay was released, neither restores focus, so the user's chosen background target keeps focus. (When NOT released — `unmount` mode, or a fast route — both restore to the trigger exactly as today, preserving the memory-#437 declaration-order contract.)

**Side-effect release completeness (comprehensive re-analysis, Codex R1–R4).** Every shell side-effect live during the lingering-navigate window — reached from BOTH the `requestClose` paths (X/Esc/scrim/grab-tap) AND the drag-past-threshold path (§3.1b) — is accounted for: (a) background inert → un-inerted (item 2); (b) body scroll lock → restored (item 1); (c) document Esc listener → gated (item 4); (d) fixed overlay + scrim rendering/hit-testing → `display:none` (item 3); (e) `useDialogFocus` Tab-trap → nothing to trap once the subtree is `display:none` (item 3); (f) matchMedia `sm`-boundary listener (`:337`) → its `onChange` already guards `!dismissingRef.current` (`:361`) and `dismissingRef` is `true`, so it no-ops; (g) grab/panel pointer + click handlers → unreachable once `display:none` and guarded by `dismissingRef`; (h) consumer footer/action handlers during the exit window (any mode) → the dialog subtree is `inert` from the shared `beginDismiss()` at dismiss-commit (§3.1 step 3), invoked by **all five** close affordances — the four `requestClose` ones (X/Esc/scrim/grab-tap) AND drag-past-threshold (§3.1b) — so no button can be activated after dismissal on ANY of them (Codex R6/R7). No live side-effect or interactive control remains reachable, on any close affordance.

### 3.1b Drag-past-threshold dismiss shares the exit-commit contract

The existing sheet drag-dismiss (`ReviewModalShell.tsx:276-299`) is a real Published close affordance whose `onClose` is also `router.push`, so it needs the SAME anti-trap as `requestClose` — leaving it out would reopen the exact slow-RSC trap on mobile drag (Codex R4 high). Its **visual** slide-down (`translateY(100%)` over `--duration-normal`) is unchanged; only its close-commit timing joins the `closeBehavior` contract:

| Phase | `navigate` (Published) | `unmount` (Step3) |
|-------|------------------------|-------------------|
| dismiss commits (release past threshold) | **`beginDismiss()` (inert the subtree, §3.1 step 3)** + `onClose()` (push) fires **now** — nav overlaps the slide-out | **`beginDismiss()` (inert the subtree)** (no early `onClose`) |
| slide-out `transitionend` / fallback | `releaseOverlay()` | `onClose()` (as today) |

Implementation: the past-threshold branch (`:276-299`) calls the **same `beginDismiss()`** (§3.1 step 3) at the instant it commits — so the drag path inerts the subtree exactly like the four `requestClose` affordances, closing the exit-window mutation hole on drag too (Codex R7 high). The branch's `finish()` (`:285-294`) is then unified with `requestClose`'s exit-end handling into one mode-aware close-commit routine, so both animated Published closes fire the push at commit and `releaseOverlay` at end. `unmount` mode is byte-for-byte today's behavior for `onClose` timing (`onClose` at `transitionend`) — the ONLY addition is the `beginDismiss()` inert, invisible unless a footer action is attempted mid-exit. (The drag path already set `dismissingRef = true` at `:276`; `beginDismiss()` folds that existing set together with the new `inert`, so the drag path calls `beginDismiss()` in place of its bare `dismissingRef` set — no double-set.)

`releaseOverlay` is idempotent, guarded by `overlayReleasedRef`: whichever fires first (early release OR the unmount cleanups) wins; the other no-ops. The first effect's cleanup, the scroll-lock cleanup, and `useDialogFocus`'s cleanup all still run on real unmount and are safe to double-run (each checks prior state). In `unmount` mode `releaseOverlay` never runs (the exit-end IS the unmount).

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

The shell's `onClose` prop is unchanged: consumers still pass their raw close (`close` / parent-unmount `onClose`). The shell derives `requestClose` from `onClose` internally. `PublishedReviewModal` and `ShowReviewModalSkeleton` (§3.4) pass `closeBehavior="navigate"` (§3.1a); `Step3ReviewModal` passes nothing (defaults `"unmount"`). All three render a `ModalCloseButton`.

### 3.4 Skeleton close (resolves MODAL-SKELETON-CLOSE-1)

`ShowReviewModalSkeleton` is the Suspense fallback that mounts the shell while `PublishedReviewModal`'s loader streams. Today it passes `onClose={() => {}}` and renders NO close control (`ShowReviewModalSkeleton.tsx:35,52` — a placeholder `<Skeleton>` where the X goes), so on a slow load the body-scroll-locked, background-inerted frame can only be escaped with browser-Back (the `DEFERRED.md:31-34` MODAL-SKELETON-CLOSE-1 trap). This task's un-defer trigger is literally "the next ReviewModalShell/skeleton task," so leaving the frame dead would ratify the trap while shipping close-affordance work (Codex R5 high). Resolved here:

- The skeleton is already a client component, so it calls `useShowModalNav()` itself and passes `onClose={close}` + `closeBehavior="navigate"` — identical to `PublishedReviewModal`. Its Esc/scrim/grab/X now close the modal (strip `?show`) with the exit animation + `releaseOverlay`, so a slow-streaming load is never a trap.
- The header's placeholder close block (`:52`) becomes a real `<ModalCloseButton>` wired to a `closeRef` passed as `initialFocusRef` — initial focus lands on it, matching the loaded modal (the swap is seamless: same `testIdBase`, same close position). **The real close button MUST NOT sit under an `aria-hidden` ancestor.** Today the title row wrapper carries `aria-hidden="true"` (`ShowReviewModalSkeleton.tsx:48`) and the placeholder close `<Skeleton>` sits inside it; a focusable close button there would be discoverable by focus yet hidden from the a11y tree — the exact screen-reader trap the skeleton fix must not create (Codex R7 medium). Restructure the title row so ONLY the decorative loading blocks keep `aria-hidden="true"` (the title-bar `<Skeleton>` at `:50`, the strip-row blocks at `:55-58`) and the real `<ModalCloseButton>` is a **sibling outside** any `aria-hidden` subtree — e.g. split the current single `aria-hidden` wrapper into an `aria-hidden` title-bar block + the (un-hidden) close button in the same flex row. `useDialogFocus` moves initial focus to it, so the focused element has no `aria-hidden` ancestor.
- **Spec amendment:** admin-show-modal §4's "open, non-interactive modal frame" for the skeleton is relaxed to "open, **content**-non-interactive frame that is closeable" (the loading BLOCKS stay inert `aria-hidden`; only the close affordances go live). `DEFERRED.md` MODAL-SKELETON-CLOSE-1 is resolved (not re-deferred).

## 4. Guard conditions

| Input / state | Behavior |
|---------------|----------|
| skeleton (`navigate`) Esc/scrim/grab/X during a slow Suspense load | closes the modal (`useShowModalNav().close`) with exit animation + `releaseOverlay` — no stuck-loading trap (§3.4; resolves MODAL-SKELETON-CLOSE-1) |
| `requestClose` fired while `dismissingRef` already true (double Esc, Esc-then-X, scrim-then-Esc) | no-op (§3.1 step 1) — one exit, one close |
| drag in progress when Esc/X fires | `requestClose` releases the drag's pointer capture + nulls `dragRef` (§3.1 step 2); the pending `pointerup` early-returns → NO spring-back overwrite of the exiting panel |
| fast click / keypress on a footer button DURING the exit window (esp. Step3 `unmount`, 120–220ms) — dismissed via ANY affordance incl. drag-past-threshold | no action fires — the overlay subtree is `inert` from the shared `beginDismiss()` at dismiss-commit (§3.1 step 3), invoked by all four `requestClose` affordances AND the drag path (§3.1b), so `handlePublish`/`handleUnpublish`/`handleApproveResolve`/`handleIgnoreResolve` cannot be activated after dismissal (Codex R6/R7 high) |
| reduced motion, or `matchMedia` unavailable (jsdom) | immediate close (§3.1 step 4); `navigate` also calls `releaseOverlay()` immediately (jsdom lacks `matchMedia`, guarded like `:350`) |
| `panelRef.current` null at fire time | immediate close (§3.1 step 4); `navigate` releases overlay immediately (defensive, mirrors drag `:275`) |
| **Published (`navigate`): RSC slower than the exit animation** | `onClose` (push) fired at start; panel sits at its exit end-state; at exit-end `releaseOverlay()` restores body scroll, un-inerts the background, sets the dialog root `display:none`, gates the Esc handler, and restores focus to the trigger → the hidden node traps neither pointer, keyboard/Esc, NOR focus. Unmounts when the route lands; `releaseOverlay` idempotent (`overlayReleasedRef`). `close` always strips `show`, so the route always changes. |
| Published (`navigate`): RSC faster than the animation | route change unmounts mid-animation → exit cut short (snappy). Acceptable — optimistic close is best-effort. |
| Step3 (`unmount`): exit-end | `onClose` fires at exit-end → parent unmounts. `releaseOverlay` never runs. |
| viewport crosses `sm` mid-exit | existing matchMedia cleanup (`:337-372`) guards `!dismissingRef.current` before clearing inline styles (`:361`) — a committed exit is not yanked back. Unchanged. |
| unmount mid-exit (parent unmounts before transitionend) | existing unmount cleanup clears the fallback timers (`:368-369`) — no late `onClose` after unmount; `overlayReleasedRef` guards double-release |

## 5. Dimensional invariants

None changed. The panel's `max-h`/`max-w` and internal flex column (`ReviewModalShell.tsx:400-457`) are untouched; exit sets only `transform`/`opacity`/`transition`/`animation` inline on the panel + scrim, `requestClose` sets `inert` on the dialog root (interaction-only, no layout effect), and `releaseOverlay` sets `display:none` on the dialog root — all cleared by unmount.

## 6. Transition inventory (amends master spec §6.5)

The master spec §6.5 row (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`) changes from:

> `open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation); back-button unmount is a route change`

to:

> `open → closed (X/scrim/Esc/grab-tap) | optimistic exit animation via shell requestClose — reverse of entrance (sheet: translateY(100%) slide-down; desktop: fade + scale 0.98 + translateY 8px) + scrim fade. navigate mode (Published): onClose/router.push fires immediately so nav overlaps the animation, and releaseOverlay() (body scroll restore + background un-inert + dialog-root display:none + Esc-handler gate + focus restore) drops the overlay at exit-end (or immediately under reduced motion) so a slow RSC traps neither pointer, keyboard/Esc, nor focus. The drag-past-threshold dismiss shares this navigate contract (push at commit, releaseOverlay at slide-out end). unmount mode (Step3): onClose fires at exit-end. Skeleton uses navigate too (closeable — resolves MODAL-SKELETON-CLOSE-1, §3.4). Reduced motion → instant close. Back-button unmount is a route change (no requestClose in the popstate path).`

Full inventory for THIS feature's states:

| Transition | Treatment |
|------------|-----------|
| closed → open | entrance (unchanged): `step3-details-sheet-rise` `<sm` / `step3-details-pop-in` `≥sm` + `step3-details-scrim-in` (`app/globals.css:772-792`) |
| open → exiting (X/Esc/scrim/grab-tap) | `requestClose`: cancel active drag (§3.1 step 2) + mode-aware reverse (§3.2) + scrim fade, JS-inline; `onClose` timing per §3.1a |
| exiting → closed | `navigate`: route change unmounts (push fired at start); `releaseOverlay` at exit-end if still mounted. `unmount`: `onClose` at panel `transform` transitionend / fallback (§3.1 step 5). Unmount clears inline styles. |
| open → closed, reduced motion | immediate close — no animation (§3.1 step 4); `navigate` releases the overlay immediately — preserves the ratified reduced-motion collapse without leaving a slow-RSC Published/skeleton user blocked |
| skeleton (`closeBehavior="navigate"`) Esc/scrim/grab/X | closes the modal with exit animation + `releaseOverlay` (§3.4) — resolves MODAL-SKELETON-CLOSE-1 (no longer a stuck-loading trap) |
| open → closed, drag past threshold | **visual unchanged** — existing `translateY(100%)` slide-down (`ReviewModalShell.tsx:276-299`); close-commit now honors `closeBehavior` (§3.1b): `navigate` pushes at commit + `releaseOverlay` at slide-out end; `unmount` = today's `onClose` at transitionend |
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

- The drag-dismiss path's **visual** slide-down (`:276-299`) is unchanged (no scrim fade added to it — its scrim is instead hidden wholesale by `releaseOverlay`'s `display:none` at slide-out end, §3.1b). Its close-commit timing IS brought under the `closeBehavior` contract (§3.1b) — that is in scope, because leaving it out reopened the trap (Codex R4).
- Browser-Back close stays an un-animated route change (no in-app affordance to intercept; `requestClose` is not reachable from the popstate path).
- No new tokens (DESIGN.md §10) — durations reuse `--duration-normal` / `--duration-fast`; the fallback constants (`DURATION_NORMAL_FALLBACK_MS`, `DURATION_FAST_FALLBACK_MS`) already exist (`ReviewModalShell.tsx:48,52`).
- **Programmatic success-closes stay instant.** `requestClose` is for user *dismiss* affordances only (X/Esc/scrim/grab-tap). Step3's action-success closes — `handlePublish`/`handleApproveResolve`/`handleIgnoreResolve` calling `onClose()` after a resolved mutation (`Step3ReviewModal.tsx:238,256,309`) — are NOT dismiss gestures (the modal closes because the action landed) and call `onClose` directly, unchanged. Animating them is out of scope; they are not asymmetric with a drag because the user did not gesture a close.

## 9. Test surface

1. **Shell unit (`reviewModalShell.test.tsx`)** — in jsdom (`matchMedia` absent → immediate-close path per §3.1 step 4) scrim/Esc/grab route through `requestClose` and call `onClose` exactly once; re-entrancy guard fires `onClose` once for double-Esc/Esc-then-scrim. `closeBehavior`: `"unmount"`/default call `onClose` once; `"navigate"` calls `onClose` once AND runs the `releaseOverlay` restore (assert `[data-inert-root]` un-inerted, body overflow restored, dialog root `display:none`) in the immediate path, AND — with `overlayReleasedRef` set — the unmount cleanup does NOT re-focus the trigger (finding R5 guard). The entrance twin-scan (`:186-197`) must stay unchanged and green (count === 3).
2. **`ModalCloseButton` unit** — reads context, forwards ref, `onClick` calls the provided `requestClose`; default no-op context when rendered outside a provider.
3. **`pageTransitions.test.tsx`** — `PublishedReviewModal` conditional count stays **1** and no-motion assertions stay green (regression guard, no edit expected).
4. **Skeleton close (`ShowReviewModalSkeleton`)** — the skeleton renders a real `ModalCloseButton` (initial focus lands on it) and passes `closeBehavior="navigate"`; a unit/real-browser test asserts Esc / scrim / X during a mounted (delayed-Suspense) skeleton call `useShowModalNav().close` and release the overlay — no stuck-loading trap (§3.4; resolves MODAL-SKELETON-CLOSE-1, Codex R5 high). **Accessibility (Codex R7 medium):** assert the skeleton close is discoverable by role+name (`getByRole("button", { name: /close/i })`) and that the focused close element has **no `aria-hidden` ancestor** (walk `closest('[aria-hidden="true"]')` → null) — proves the restructure moved the real button out of the decorative `aria-hidden` title-row subtree.
5. **Real-browser (`published-review-modal.interactions.spec.ts`)** — groups:
   (a) **exit-animation flip** — the §6.5 assertion flips: X / Esc / scrim leave an exit-animated frame (panel carries a non-identity exit `transform`/`opacity` inline, scrim opacity → 0) BEFORE the modal frame leaves the DOM and the URL strips `show`/`alert_id`. Anti-tautology: sample the panel's *computed* transform/opacity during the exit window and assert non-identity, then assert removal + URL strip. Reduced-motion run collapses to instant (no exit frame).
   (b) **slow-navigation anti-trap** (R1 finding 2 / R2 / R3) — with the route/RSC delayed (e.g. block the `/admin` navigation response), assert that after the exit animation completes the background is fully usable, all BEFORE the route unmount: `[data-inert-root]` no longer `inert`, `document.body.style.overflow` restored, the dialog root is `display:none`; **a real background button receives a pointer click** (proves the fixed overlay/scrim no longer swallows clicks, R3 high); **`document.activeElement` is OUTSIDE the dialog (the trigger)** and **Tab reaches a background control** (keyboard/focus trap released, R2 high); **Esc pressed on a focused background control is NOT swallowed** by the hidden modal (its own handler/default fires, R3 medium).
   (c) **reduced-motion slow-navigation** (R2 medium) — reduced-motion emulation + delayed route: assert inert/scroll/focus release happen immediately after the (instant) close, without waiting for the route unmount.
   (d) **compound drag-held + Esc** (R1 finding 1) — press-and-hold the grab past slop, press Esc, release the pointer AFTER the fallback timer; assert the panel exits and the modal closes exactly once with no `translateY(0)` snap-back frame.
   (e) **drag-past-threshold slow-navigation anti-trap** (R4 high) — with the route delayed, drag the grab past the 110px threshold and release; assert the SAME release contract as (b) before route unmount (background button clickable, scroll restored, `[data-inert-root]` un-inerted, dialog root `display:none`, focus outside dialog, background Esc not swallowed). Proves the drag path is not a trap window.
   (f) **post-route focus not stolen** (R5 medium) — after release, move focus to a background control, THEN let the delayed route finish and unmount the modal; assert `document.activeElement` STILL the user's background control (the unmount focus-restores were gated by `overlayReleasedRef`, not yanking focus to the stale trigger).
   (g) **skeleton close during slow load** (R5 high, §3.4) — open the modal so the skeleton mounts (delayed loader), press Esc / tap scrim / click the skeleton's X; assert the modal closes (`?show` stripped) and the overlay releases — the loading frame is never a trap.
   (h) **exit-window action suppression** (R6/R7 high, real-browser — `inert` is not enforced in jsdom) — in the Step3 modal harness, dismiss via Esc/X **AND, as a separate case, via drag-past-threshold** (grab past the 110px threshold + release), then within each exit window attempt to click the Publish / Approve & apply / Ignore footer button; assert the mutation handler is NOT invoked (overlay `inert` from the shared `beginDismiss()`, §3.1b) and the modal still unmounts at exit-end exactly once. The drag case is the R7 addition — proves `beginDismiss` runs on the drag path, not only `requestClose`.
6. **Transition-audit** — enumerate the four affordances' handlers all resolve to `requestClose`; assert the §3.1 guards exist (drag-cancel, reduced-motion/null-panel immediate close, `dismissingRef` re-entrancy) and that `handleGrabPointerEnd` early-returns on `dismissingRef`.

## 10. Files

| File | Change |
|------|--------|
| `components/admin/review/ReviewModalShell.tsx` | shared `beginDismiss()` (`dismissingRef=true` + `dialogRef.inert=true`) called by BOTH `requestClose` AND the drag-past-threshold branch (§3.1b) so the exit-window interaction suppression covers every affordance (R6/R7); `requestClose` (+ drag-cancel), `closeBehavior?: "unmount"\|"navigate"` prop, `scrimRef` + `dialogRef`, `releaseOverlay()` (body-scroll + background-un-inert + dialog-root `display:none` + Esc-gate + focus) + `overlayReleasedRef`, lift `previouslyFocusedRef`/`scrollLockPrevRef`/`inertPrevRef` from effect locals to refs + `restoreBackgroundInert()` helper, document-Esc `onKeyDown` early-returns on `overlayReleasedRef`, gate first-effect inert-cleanup focus restore on `!overlayReleasedRef`, mode-aware close-commit shared by `requestClose` AND the drag-past-threshold branch (§3.1b), `ReviewModalCloseContext` + `useReviewModalClose`, provider wrap; scrim/Esc/grab → `requestClose`; `handleGrabPointerEnd` early-return on `dismissingRef` |
| `lib/a11y/dialogFocus.ts` | add optional `shouldRestoreFocus?: () => boolean` param (default `() => true`; gates the unmount focus-restore — R5 medium). `GalleryLightbox`/`AgendaSheet` callers unchanged. |
| `components/admin/review/ModalCloseButton.tsx` | new shared X button (forwardRef, context consumer) |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef`; pass `closeBehavior="navigate"` |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef` (default `unmount`) |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | real close: `useShowModalNav()` + `onClose={close}` + `closeBehavior="navigate"`; placeholder close block → `<ModalCloseButton>` on a `closeRef`/`initialFocusRef`; **restructure the title row so the real close button is NOT under the `aria-hidden="true"` wrapper (`:48`) — only decorative loading blocks stay `aria-hidden`** (Codex R7 medium) (resolves MODAL-SKELETON-CLOSE-1, §3.4) |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 row amendment (§6 above) + §4 skeleton "non-interactive"→"content-non-interactive, closeable" (§3.4) |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1` AND `MODAL-SKELETON-CLOSE-1` (§3.4) |
| tests (§9) | shell unit, ModalCloseButton unit, skeleton close, interactions spec (8 groups a–h), transition-audit |

## 11. Invariants

UI-only. No DB, no advisory locks (invariant 2 N/A), no email boundary (3 N/A), no sync cursor (4 N/A), no user-visible error codes (5 N/A), no Supabase call boundary (9 N/A), no mutation surface (10 N/A). Invariant 8 (impeccable dual-gate) **applies** — `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Invariant 6 (commit per task) and 7 (spec canonical — this spec is the ratified amendment to §6.5) apply.

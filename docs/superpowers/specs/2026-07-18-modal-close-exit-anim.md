# Spec — Review-modal close exit animation (MODAL-CLOSE-EXIT-ANIM-1)

**Date:** 2026-07-18
**Slug:** `modal-close-exit-anim`
**Status:** draft → self-review → adversarial review
**Un-defers:** `DEFERRED.md` § `MODAL-CLOSE-EXIT-ANIM-1` (`DEFERRED.md:26-29`)
**Amends:** admin-show-modal master spec §6.5 transition inventory (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`)

---

## 0. Scope note — descoped at R21 (read this first)

Rounds R1–R20 of adversarial review produced a spec roughly twice this size. 13 of those 20 rounds found defects not in the exit animation, but in machinery added by two decisions: (a) bundling `MODAL-SKELETON-CLOSE-1` (the skeleton close) into this motion pass, which required a `ShowReviewModalSlot` above the Suspense boundary, a dismissal context, remount-nonce keying, and hash listeners; and (b) attempting to fully close the "URL says open, UI says closed" gap that the anti-trap released window inherently creates. Each fix was correct and each spawned the next — the signature of an over-complex design, not of convergence.

**This revision returns the spec to the requested feature.** Removed: `ShowReviewModalSlot`, `ShowModalDismissContext`, `reportDismissed`/`reportReleased`, `onDismissStart`/`onOverlayReleased`, the remount nonce, the `hashchange`/`popstate` reset, full-identity keying, and URL reconciliation. `MODAL-SKELETON-CLOSE-1` **stays deferred** (§8) — it was scope this spec added, not part of the request. Keeping it deferred honestly required ONE change to the skeleton: passing `closeBehavior="none"` (§3.1a), because rewiring the shell's affordances to `requestClose` would otherwise animate the loading frame off-screen and inert it (Codex R22). That prop preserves `main`'s behavior; it does not add a close.

Kept, because they are inherent to the feature and were earned across R1–R11: the drag/close compound race fix, `closeBehavior`, `releaseOverlay` and its side-effect completeness, exit-window `inert`, and post-release cleanup ownership.

**Added back at R21, after review correctly rejected a deferral:** §3.1d bounded rollback for a close navigation that never commits. The descoped draft deferred this as "not worse than `main`"; that was wrong — `main` leaves a failed close **visible and retryable**, whereas optimistic close leaves it **hidden with the URL saying open** and unrecoverable without a refresh. Descoping removes scope this spec added; it does not license shipping a regression the spec itself creates.

## 1. Problem

Every non-drag close affordance of the review modal — the header **X** button, document **Esc**, the scrim tap, and the sheet **grab-strip tap** — funnels through `onClose` and unmounts the panel with **no exit transition**. The only animated close is the sheet **drag-past-threshold** dismiss, which slides the panel off-screen (`ReviewModalShell.tsx:276-299`). The result is asymmetric: a drag glides out, but an X/Esc/scrim/tap snaps out instantly.

For `PublishedReviewModal` the asymmetry is worse: its `onClose` is `useShowModalNav().close` — a `router.push` (`useShowModalNav.ts:30-36`) — so the modal LINGERS on screen until the RSC roundtrip returns, then vanishes with no transition. On venue cellular this reads as laggy/broken.

This was originally **declined as a defect** because the master spec's §6.5 transition inventory explicitly ratified `open → closed (X/scrim/Esc/back) | instant unmount` (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`). The `DEFERRED.md` un-defer trigger (`DEFERRED.md:29`) is now pulled: *"a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition (play the reverse sheet/pop animation immediately, fire `router.push` behind it) to BOTH consumers so Step3 parity holds."* This spec is that motion pass.

## 2. Goal

Closing the review modal via X / Esc / scrim / grab-tap plays the **reverse of the entrance animation** immediately, then fires `onClose` behind it — an **optimistic** dismiss. Applied identically in **both** consumers (`Step3ReviewModal`, `PublishedReviewModal`) so Step3 chrome parity holds. Reduced motion collapses to the current instant unmount.

Non-goals: no change to the entrance animation, the drag-past-threshold dismiss *visual*, the spring-back, or any DB/route/auth surface. UI-only.

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

0. **Non-dismissible guard.** If `closeBehavior === "none"`, return immediately — before any state change, inert, or animation (§3.1a). This keeps `ShowReviewModalSkeleton` behaviourally identical to `main` while `MODAL-SKELETON-CLOSE-1` stays deferred (Codex R22).
1. **Re-entrancy guard.** If `dismissingRef.current` is already `true`, return (a close is in flight — no double-fire, no re-animate). Reuses the existing `dismissingRef` (`ReviewModalShell.tsx:206`) that the drag-dismiss already sets.
2. **Cancel any active drag (fixes the compound race, §6).** If `dragRef.current !== null`: release its pointer capture and set `dragRef.current = null`. A pointer sequence that was mid-drag when Esc/X fired then finds `dragRef === null` at `pointerup` and early-returns at the existing guard (`:260`), so it can NEVER run the spring-back branch that would overwrite the exiting panel with `translateY(0)`. Belt-and-suspenders: `handleGrabPointerEnd` also early-returns when `dismissingRef.current` is `true`. Also clear any pending `settleTimerRef`.
3. **Commit the dismiss (shared `beginDismiss()` routine).** Set `dismissingRef = true` AND make the overlay inert: `dialogRef.current.inert = true` (the whole `role="dialog"` subtree — scrim, panel, grab, footer). **`beginDismiss()` early-returns when `closeBehavior === "none"`** (§3.1a — the drag path calls it directly, so the step-0 guard alone would not cover the skeleton). **`beginDismiss()` is shared with, and invoked at the start of, the drag-past-threshold branch (§3.1b) — not only `requestClose`**; every close affordance (X/Esc/scrim/grab-tap AND drag) inerts the subtree the instant its dismiss commits (Codex R7). Why it matters: a *dismissed* modal must not fire a late action. In `unmount` mode (Step3) `onClose` is delayed 120–220ms while the footer buttons are still wired to `handlePublish`/`handleUnpublish`/`handleApproveResolve`/`handleIgnoreResolve` (`Step3ReviewModal.tsx`); a fast click during the exit must NOT publish/approve/ignore after dismissal (today's instant unmount has no such window — Codex R6). `inert` does not block the CSS exit transition or `transitionend`.
4. **Reduced motion / null panel → immediate close.** If `panelRef.current` is null OR `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (or `matchMedia` is absent, jsdom), fire the close with no animation: `onClose()`, and — in `navigate` mode ONLY — call `releaseOverlay()` **immediately** (a `router.push` may not unmount for a full RSC roundtrip, so a reduced-motion Published user must not be left blocked; Codex R2). In `unmount` mode the immediate `onClose` unmounts synchronously, so no release is needed.
5. **Animate.** Otherwise neutralize the entrance (`panel.style.animation = "none"`; C1 rationale at `:238-243`), apply the mode-appropriate exit inline styles (§3.2), fade the scrim (§3.2). Close per §3.1a: `navigate` fires `onClose()` NOW (push overlaps the animation) and `releaseOverlay()` at exit-end; `unmount` fires `onClose()` at exit-end. The exit-end signal is the panel's `transitionend` (transform) OR a fallback timer — the `finish()` pattern the drag-dismiss uses (`:284-299`), matched to the mode's duration token.

### 3.1a `closeBehavior` — when `onClose` fires + overlay release

The consumers' `onClose` are fundamentally different. A new prop `closeBehavior?: "unmount" | "navigate" | "none"` (default `"unmount"`) selects the timing.

**`"none"` — non-dismissible, required by the skeleton deferral (Codex R22).** `requestClose` returns immediately when `closeBehavior === "none"`: no `beginDismiss`, no `inert`, no animation, no `onClose`. This exists because rewiring scrim/Esc/grab to `requestClose` applies to **every** shell consumer, including `ShowReviewModalSkeleton`, which mounts the shell with `onClose={() => {}}`. Without `"none"`, a skeleton scrim tap would set `dismissingRef`, inert the subtree, animate the frame off-screen, and then call a no-op — leaving the loading frame **hidden and inert with body scroll still locked and the background still inert**, until the RSC load resolves. On `main` those same interactions do nothing at all. That is a new stuck/hidden state, i.e. a regression this spec would introduce, so it is fixed in scope even though `MODAL-SKELETON-CLOSE-1` stays deferred (§8). `"none"` reproduces `main`'s behavior exactly: the affordances are inert no-ops.

An earlier revision argued against a `"none"` mode on the grounds that every consumer should be closeable. That reasoning applied when the skeleton was getting a real close; with skeleton close deferred, `"none"` is precisely what preserves the deferral honestly.

**`"none"` must gate the DRAG path too — the `requestClose` step-0 guard alone is insufficient.** The drag-past-threshold branch calls `beginDismiss()` **directly** (§3.1b), bypassing `requestClose` entirely, so a step-0 guard would leave the skeleton's mobile sheet draggable: a drag past 110px would still commit a dismiss, slide the frame off-screen, inert it, and call the no-op `onClose` — the identical regression via a different entry point. Two guards, matching the existing belt-and-suspenders pattern:

1. **`handleGrabPointerDown` early-returns when `closeBehavior === "none"`** — no drag ever starts, so there is no slop tracking, no live transform, and no spring-back on the skeleton. This is the primary guard and preserves `main` (where the grab strip drags but its dismiss calls a no-op — see the note below).
2. **`beginDismiss()` itself early-returns when `closeBehavior === "none"`** — defensive, so no future caller can commit a dismiss on a non-dismissible shell. `beginDismiss` is the single commit point for all five affordances (§3.1 step 3), which makes it the correct chokepoint.

*Behavioral note vs `main`:* on `main` the skeleton's grab strip is draggable and its past-threshold dismiss calls the no-op `onClose`, so the sheet slides out and stays out with the frame still mounted. Guard 1 makes the strip non-draggable instead. This is a deliberate, minor divergence in the *safer* direction — it removes a gesture that currently produces a stuck off-screen frame — and it is the only behavior on the skeleton that this spec does not leave byte-identical. §9.4 asserts the new behavior explicitly.

| | `"unmount"` (Step3 — default) | `"navigate"` (Published) | `"none"` (skeleton) |
|---|---|---|---|
| What `onClose` does | **synchronous** parent unmount | `useShowModalNav().close` — a `router.push` (async) | nothing — `requestClose` returns before any state change |
| When shell calls `onClose` | at **exit-end** (transitionend/fallback). Calling it at start would unmount the shell instantly and kill the animation. | **immediately** at `requestClose` start — the push overlaps the animation (truly optimistic) |
| Why not the other timing | early → animation dies (sync unmount) | late → push starts only after the animation, so on a slow RSC the faded-but-mounted overlay traps the page behind an invisible layer (Codex R1) |

**`releaseOverlay()` — the anti-trap (navigate only).** In `navigate` mode the shell node lingers until the route lands; `releaseOverlay` neutralizes **every** shell side-effect that could interfere with the restored background, so the lingering node is functionally gone. Runs at exit-end (animated path) OR immediately (reduced-motion/null-panel path). It:

1. restores `document.body.style.overflow` to the value saved at open (lifted to `scrollLockPrevRef`);
2. un-inerts + restores `aria-hidden` on the `[data-inert-root]` background roots (factored into a shared `restoreBackgroundInert()` using a saved `inertPrevRef` snapshot);
3. **hides the fixed overlay entirely — `dialogRef.style.display = "none"`** (dialog root `fixed inset-0 z-50` at `:380`, scrim at `:394`). `display:none` removes the subtree from **rendering AND hit-testing** in one move: background pointer clicks reach the page (no reliance on `inert`'s UA-ambiguous pointer semantics — Codex R3), the panel/scrim are visually gone (also covers the drag path's non-faded scrim), and the subtree leaves the focus order + a11y tree so the still-mounted `useDialogFocus` Tab-trap (`dialogFocus.ts:75`) has nothing to cycle (Codex R2). No change to `useDialogFocus`'s trap itself. *(Chosen over rendering `null`: same visible outcome, but it preserves child state and was already reasoned through for hit-testing and a11y-tree removal.)*
4. **gates the document Escape handler off**: the keydown effect's `onKeyDown` early-returns when `overlayReleasedRef.current` is `true`, so an Esc pressed on the restored background is NOT `preventDefault`ed/swallowed by the hidden modal (Codex R3). The document listener is independent of `display:none`, so it must be gated explicitly.
5. restores focus to the trigger: `previouslyFocusedRef.current?.focus()` if still in the DOM — WCAG-correct now that the dialog is `display:none`.

**Unmount focus-restore must not steal the user's background focus (Codex R5).** After `releaseOverlay`, the user can click or Tab into a background control BEFORE the delayed route unmounts; the unmount focus-restores must not yank focus back to the stale trigger. Both restore sites are gated on `overlayReleasedRef.current`: (a) the first-effect inert cleanup (`:133-135`) wraps its `previouslyFocused.focus()` in `if (!overlayReleasedRef.current)`; (b) `useDialogFocus` gains an optional `shouldRestoreFocus?: () => boolean` (default `() => true`, so `GalleryLightbox`/`AgendaSheet` are unchanged) — the shell passes `() => !overlayReleasedRef.current`. When NOT released (`unmount` mode, or a fast route) both restore to the trigger exactly as today, preserving the memory-#437 declaration-order contract.

**Side-effect release completeness (comprehensive re-analysis, Codex R1–R4).** Every shell side-effect live during the lingering-navigate window — reached from BOTH the `requestClose` paths AND the drag path (§3.1b) — is accounted for: (a) background inert → un-inerted (item 2); (b) body scroll lock → restored (item 1); (c) document Esc listener → gated (item 4); (d) fixed overlay + scrim rendering/hit-testing → `display:none` (item 3); (e) `useDialogFocus` Tab-trap → nothing to trap once `display:none` (item 3); (f) matchMedia `sm`-boundary listener (`:337`) → its `onChange` already guards `!dismissingRef.current` (`:361`), so it no-ops; (g) grab/panel pointer + click handlers → unreachable once `display:none` and guarded by `dismissingRef`; (h) consumer footer/action handlers during the exit window (any mode) → the subtree is `inert` from `beginDismiss()` (§3.1 step 3), invoked by **all five** close affordances (Codex R6/R7). No live side-effect or interactive control remains reachable, on any close affordance.

### 3.1b Drag-past-threshold dismiss shares the exit-commit contract

The existing sheet drag-dismiss (`:276-299`) is a real Published close affordance whose `onClose` is also `router.push`, so it needs the SAME anti-trap as `requestClose` — leaving it out would reopen the slow-RSC trap on mobile drag (Codex R4). Its **visual** slide-down (`translateY(100%)` over `--duration-normal`) is unchanged; only its close-commit timing joins the `closeBehavior` contract:

| Phase | `navigate` (Published) | `unmount` (Step3) |
|-------|------------------------|-------------------|
| dismiss commits (release past threshold) | **`beginDismiss()`** + `onClose()` (push) fires **now** — nav overlaps the slide-out | **`beginDismiss()`** (no early `onClose`) |
| slide-out `transitionend` / fallback | `releaseOverlay()` | `onClose()` (as today) |

Implementation: the past-threshold branch calls the **same `beginDismiss()`** at the instant it commits, closing the exit-window mutation hole on drag too (Codex R7). Its `finish()` (`:285-294`) is unified with `requestClose`'s exit-end handling into one mode-aware close-commit routine. `unmount` mode is byte-for-byte today's `onClose` timing — the ONLY addition is the `beginDismiss()` inert, invisible unless a footer action is attempted mid-exit. (The drag path already set `dismissingRef = true` at `:276`; `beginDismiss()` folds that existing set together with the new `inert` — no double-set.)

`releaseOverlay` is idempotent, guarded by `overlayReleasedRef`. In `unmount` mode it never runs (the exit-end IS the unmount).

**Post-release cleanup ownership — released side-effects are NOT re-restored at unmount (Codex R11).** "Safe to double-run" is the wrong contract: the released window is precisely when the background becomes usable, so the user can open another modal/lightbox that sets its own scroll lock and `[data-inert-root]` inert. When the delayed route lands and the old shell unmounts, an ungated cleanup would restore **this shell's stale pre-open snapshot** — unlocking body scroll and un-inerting the background *underneath the newly opened modal*. Contract: **`overlayReleasedRef` is the single-ownership token for every side-effect restore.** All three unmount cleanups (background-inert restore, scroll-lock restore, `useDialogFocus` focus restore) early-return when it is `true`, because `releaseOverlay` already performed that restore at a moment when this shell provably still owned the state (the background is inert until `releaseOverlay` runs, so no newer modal can pre-exist it). One rule, uniformly applied.

### 3.1d Close-navigation failure recovery — bounded rollback (Codex R21)

An earlier draft accepted "failed close leaves the modal hidden behind a stale `?show=`" as no worse than `main`. **That was wrong and is retracted.** On `main` a failed close leaves the modal **visible and retryable** — the user clicks X again. Optimistic close + `releaseOverlay` instead leaves it **invisible while the route state says open**, and because a same-identity reopen produces no navigation, the user cannot recover without a refresh or manual URL repair. That is a strictly worse degraded-dependency failure, created by this spec, and it needs a contract rather than a deferral.

**Contract: if the close navigation does not commit, roll back to open.** `releaseOverlay` is what makes the modal invisible; the recovery is its inverse, `restoreOverlay()`, and it lives entirely in the shell — no slot, no context, no cross-component state:

- **Detection.** In `navigate` mode a *successful* close unmounts the shell (the route change removes it). So: if the shell is **still mounted** `CLOSE_NAV_TIMEOUT_MS` after `releaseOverlay` ran, the navigation failed, was cancelled, or is indefinitely stalled.
- **`restoreOverlay()` reverses the ENTIRE dismiss, not just `releaseOverlay` (Codex R23).** Defining it as "the inverse of the five release duties" was wrong: the close path *also* inerted the dialog in `beginDismiss` (§3.1 step 3) and left the exit inline styles from step 5 on the panel and scrim — neither is a `releaseOverlay` duty, so clearing only `display:none` would reveal a dialog that is **still `inert`, still translated off-screen, and still transparent**. The rollback would then recreate the very unrecoverable state it exists to fix. It must clear all three layers, in order:
  1. **Local dismiss state:** clear `dialogRef.current.inert`, reset `dismissingRef` and `overlayReleasedRef` to `false`.
  2. **Exit inline styles:** clear `transform`, `opacity`, `transition`, and `animation` on **both** the panel and the scrim, returning them to their open-state rest values (not the entrance keyframes — the modal is already open; it must simply be visible and at rest).
  3. **The five `releaseOverlay` inverses:** clear `dialogRef.style.display`; re-apply the body scroll lock; re-apply background `inert`/`aria-hidden` from the saved `inertPrevRef` snapshot; un-gate the document Esc handler.
  Then focus returns to the panel's initial-focus target, as on a normal open. **Acceptance is behavioral, not structural:** the modal must be *usably* back — visible, non-inert, at rest, and closable — which §9.5(i) proves by performing a real successful close afterward.
- **Why restoring is correct, not a compromise.** The URL says the modal is open. If the close never landed, the modal *should* be on screen. The user can dismiss again — which retries the navigation. Client state and URL reconverge instead of diverging permanently.
- **Timeout value.** `CLOSE_NAV_TIMEOUT_MS` is generous (**8000ms**) so that a merely *slow* — but eventually successful — RSC roundtrip is never rolled back. A slow success that does land after rollback simply unmounts the restored modal, which is self-correcting; the visible cost is a brief reappearance, strictly better than a permanent dead end.
- The timer is cleared on unmount alongside the existing fallback timers (`:368-369`), so a normal close never fires it.

**Rollback must not reclaim global side-effects another surface now owns (Codex R22).** The released window is exactly when the user can open **another** modal or lightbox (§3.1b, §4) — that surface then owns `document.body.style.overflow` and `[data-inert-root]`. If the close ALSO stalls, an unconditional `restoreOverlay()` would redisplay the stale review modal, re-lock scroll, re-inert the background, and steal focus **on top of the newer overlay**. That compounds two in-scope cases and breaks latest-user-action ownership. Contract — an ownership check, extending the R11 single-token principle to the rollback direction:

- `releaseOverlay` records what it left the globals as (`document.body.style.overflow` and the `[data-inert-root]` inert/`aria-hidden` state it restored).
- `restoreOverlay` runs **only if those globals still match** what `releaseOverlay` left. If body scroll is locked again, or the roots are inert again, **another surface has taken ownership → skip the rollback entirely** and stay hidden.
- **Rationale for skipping rather than forcing:** the user is actively working in the newer surface; stealing it back would be the worse failure. The stale `?show=` then resolves on the next navigation or refresh. This deliberately prefers "do not clobber the newer surface" over "always recover the URL" — the same latest-action-wins principle §3.1c applies to navigation.
- Consequence: rollback recovers the common failure (close stalls, nothing else opened) and provably never fights a newer overlay.

### 3.1c Competing navigations in the released window — empirical gate (Codex R12–R16)

Releasing the background before the close route lands means the user can start a **second** navigation while the close push is in flight. The clobber mechanism is broader than "the modal reopens": `close()` snapshots `searchParams` at hook-render time and pushes **all of them** minus `show`/`alert_id` (`useShowModalNav.ts:31-36`), so a stale close can **actively revert any other query param changed during the released window** — switching the dashboard bucket, then having the in-flight close land, would restore the old `bucket`.

Background URL surfaces reachable once released:

| Surface | Param mutated |
|---------|---------------|
| `DashboardBucketSegmentedControl.tsx:54,74` | `?bucket=active\|archived` |
| `ShowsTable.tsx:481` | `?show=` (`openHref`) |
| `ArchivedShowRow.tsx:77` | `?bucket=archived&show=` |
| `BellPanel.tsx:454`, `PreviewBanner.tsx:116` | `?show=` |
| `NeedsAttentionInbox.tsx:128` | `?show=<slug>&alert_id=<id>` |
| `lib/adminAlerts/alertActions.ts:51,114` | `?show=<slug>#share-access` / `#overview` |
| `StagedReviewCard.tsx:360` | `?show=` (`router.push`) |

**Required behavior: the latest navigation wins, for every surface above.** Whatever the user navigated to last survives; the stale close must not revert a param they changed or unmount a modal they just opened.

**No speculative mitigation ships.** Two designs were proposed and rejected across R13/R14 and are recorded so they are not re-proposed: (i) an **invocation-time URL guard** inside `close()` — non-viable, since the condition is evaluated before the competing navigation exists and a fire-and-forget `router.push` cannot be guarded against a *later* event; (ii) **per-hook `intentRef` reconciliation** — non-viable, because the primary open path is a bare `<Link>` (`ShowsTable.tsx:481`) that runs no hook code, and deep link / refresh / back-forward produce no intent event at all, so any "intent disagrees with URL ⇒ rewrite" rule breaks canonical `/admin?show=<slug>` entry.

**§9.5(j) is therefore an EARLY, BLOCKING implementation gate.** It runs FIRST, before dependent work, and measures what Next 16's App Router actually does when a newer push supersedes an in-flight one.
- **If (j) passes** (expected — the App Router serializes navigations and discards superseded ones): **no mechanism is added.** Zero new surface. (j) remains as a regression test.
- **If (j) fails:** this is a **genuine unresolvable ambiguity — STOP and escalate.** Any mitigation must then be designed against the *measured* failure and satisfy: (a) a single shared intent owner reachable from **every** surface above, including the bare `Link`; (b) explicit semantics for cold load, refresh, deep link, back/forward — none treated as stale; (c) correctness in **both** settle orders; (d) it must not rewrite a URL the user actually navigated to.

This race is **new surface created by this spec**: today the background stays inert and scroll-locked until unmount, so no competing navigation is possible. `releaseOverlay` makes the window reachable and is non-negotiable (it is the R1/R2/R3 anti-trap). So the race must be *answered* — by measurement, not by pre-committing to an unvalidated design.

### 3.2 Exit treatment (mode-aware, JS-inline)

Mode is read from `window.matchMedia("(min-width: 640px)").matches` (the `sm` boundary the shell already tracks, `:351`). Exit is driven by **inline styles**, mirroring the drag-dismiss path — NOT by new CSS `@keyframes`/data-attr rules. Rationale in §7.

| Mode | Panel exit (reverse of entrance) | Duration token | Fallback const |
|------|----------------------------------|----------------|----------------|
| Sheet (`<sm`) | `transform: translateY(100%)` (identical to drag-dismiss `:283`) | `--duration-normal` (220ms) | `DURATION_NORMAL_FALLBACK_MS` (`:48`) |
| Desktop (`≥sm`) | `opacity: 0; transform: translateY(8px) scale(0.98)` (reverse of `step3-details-pop-in`, `app/globals.css:737-746`) | `--duration-fast` (120ms) | `DURATION_FAST_FALLBACK_MS` (`:52`) |

Panel transition property: sheet = `transform var(--duration-normal) var(--ease-out-quart)`; desktop = `opacity …, transform …` at `--duration-fast`. The `transitionend` listener keys on `propertyName === "transform"` (present in both modes) — the same predicate the drag path uses (`:295-296`).

**Scrim fade (both modes):** a new `scrimRef` lets `requestClose` set `scrim.style.animation = "none"; scrim.style.transition = "opacity <dur> ease-out"; scrim.style.opacity = "0"`, `<dur>` matching the panel's mode duration. The scrim fade is cosmetic and does NOT gate the exit-end signal (the panel `transform` transitionend / fallback does); if the scrim's own transitionend never fires it is harmless.

Entrance is unchanged: `step3-details-sheet-rise` / `step3-details-pop-in` / `step3-details-scrim-in` (`app/globals.css:717-792`) still play on open.

### 3.3 Consumer parity — the X button via context

The header **X** is rendered inside each consumer's `header` slot (`PublishedReviewModal.tsx:253-262`, `Step3ReviewModal.tsx:436-445`), so the shell cannot wire it directly. A React context carries `requestClose` from the shell to the consumer-owned X:

- `ReviewModalCloseContext` (default: a no-op) + `useReviewModalClose()` hook, exported from the review module.
- `OpenReviewModalShell` wraps its rendered tree in `<ReviewModalCloseContext.Provider value={requestClose}>` so everything under the panel — including the `header` slot — can read it.
- A shared **`ModalCloseButton`** (`forwardRef`, in `components/admin/review/`) reads the context and renders the X: `aria-label="Close"`, the `X` icon, `onClick={requestClose}`, `data-testid` via prop, `className` carried verbatim from the two identical existing buttons. It renders **inside** the provider (in the header slot), so the context resolves — a hook call at the consumer's own top level would NOT (it sits above the provider). Each consumer replaces its inline X `<button>` with `<ModalCloseButton>` and forwards `initialFocusRef` for the initial-focus contract (`:141`).

`PublishedReviewModal` passes `closeBehavior="navigate"`; `Step3ReviewModal` passes nothing (defaults `"unmount"`). Both pass their raw close as `onClose`, unchanged.

## 4. Guard conditions

| Input / state | Behavior |
|---------------|----------|
| `requestClose` fired while `dismissingRef` already true (double Esc, Esc-then-X, scrim-then-Esc) | no-op (§3.1 step 1) — one exit, one close |
| drag in progress when Esc/X fires | `requestClose` releases the drag's pointer capture + nulls `dragRef` (§3.1 step 2); the pending `pointerup` early-returns → NO spring-back overwrite of the exiting panel |
| fast click / keypress on a footer button DURING the exit window (esp. Step3 `unmount`, 120–220ms) — dismissed via ANY affordance incl. drag | no action fires — the subtree is `inert` from `beginDismiss()` (§3.1 step 3), so `handlePublish`/`handleUnpublish`/`handleApproveResolve`/`handleIgnoreResolve` cannot be activated after dismissal (Codex R6/R7) |
| reduced motion, or `matchMedia` unavailable (jsdom) | immediate close (§3.1 step 4); `navigate` also calls `releaseOverlay()` immediately |
| `panelRef.current` null at fire time | immediate close (§3.1 step 4); `navigate` releases overlay immediately (defensive, mirrors drag `:275`) |
| **Published (`navigate`): RSC slower than the exit animation** | `onClose` (push) fired at start; panel sits at its exit end-state; at exit-end `releaseOverlay()` restores body scroll, un-inerts the background, sets the dialog root `display:none`, gates the Esc handler, and restores focus → the hidden node traps neither pointer, keyboard/Esc, NOR focus. Unmounts when the route lands |
| Published (`navigate`): RSC faster than the animation | route change unmounts mid-animation → exit cut short (snappy). Acceptable — optimistic close is best-effort |
| **Published (`navigate`): user opens another modal during the released window, then the delayed route lands** | the newer modal's scroll lock / inert / focus all survive — the old shell's three unmount restores early-return on `overlayReleasedRef` (§3.1b; Codex R11) |
| **Published (`navigate`): user mutates any other `/admin` query param (e.g. bucket) during the released window** | latest navigation wins — the stale close must not revert it (§3.1c; proven by §9.5(j3)) |
| **Published (`navigate`): user re-opens the SAME show/alert before the close push lands** | the URL never changed, so nothing re-renders and the modal does not reopen until the close lands — then it works normally. **Accepted, documented, self-healing** (§8): the overlay is already gone, scroll/inert/focus are restored, and the page is fully usable throughout |
| **Published (`navigate`): the close navigation fails or never commits** (offline / aborted RSC) | **bounded rollback** — the shell is still mounted `CLOSE_NAV_TIMEOUT_MS` (8000ms) after release, so `restoreOverlay()` reverses all five release duties and the modal returns to a fully interactive, closable state matching the URL. Dismissing again retries the navigation. NOT deferred: leaving it hidden would be strictly worse than `main`, where a failed close leaves the modal visible and retryable (§3.1d; Codex R21) |
| **Skeleton (`closeBehavior="none"`): scrim tap / Esc / grab-tap / drag** | nothing happens — `requestClose` returns immediately, no `beginDismiss`, no `inert`, no animation, no `onClose`. The DRAG path is covered separately: `handleGrabPointerDown` early-returns so no drag starts, and `beginDismiss` early-returns defensively — the drag branch bypasses `requestClose`, so the step-0 guard alone would miss it (§3.1a). Byte-identical to `main`. Without this the frame would animate off-screen and go inert while scroll stays locked (§3.1a; Codex R22 high) |
| **Published (`navigate`): close stalls AND the user opened another overlay during the released window** | rollback is SKIPPED — `restoreOverlay` runs only if the globals still match what `releaseOverlay` left them as; a newer surface owning body-scroll/inert means the stale modal must not reclaim them (§3.1d; Codex R22 high) |
| Step3 (`unmount`): exit-end | `onClose` fires at exit-end → parent unmounts. `releaseOverlay` never runs |
| viewport crosses `sm` mid-exit | existing matchMedia cleanup (`:337-372`) guards `!dismissingRef.current` (`:361`) — a committed exit is not yanked back. Unchanged |
| unmount mid-exit (parent unmounts before transitionend) | existing unmount cleanup clears the fallback timers (`:368-369`) — no late `onClose`; `overlayReleasedRef` guards double-release |

## 5. Dimensional invariants

None changed. The panel's `max-h`/`max-w` and internal flex column (`:400-457`) are untouched; exit sets only `transform`/`opacity`/`transition`/`animation` inline on the panel + scrim, `beginDismiss` sets `inert` on the dialog root (interaction-only, no layout effect), and `releaseOverlay` sets `display:none` — all cleared by unmount.

## 6. Transition inventory (amends master spec §6.5)

The master spec §6.5 row (`docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`) changes from:

> `open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation); back-button unmount is a route change`

to:

> `open → closed (X/scrim/Esc/grab-tap) | optimistic exit animation via shell requestClose — reverse of entrance (sheet: translateY(100%) slide-down; desktop: fade + scale 0.98 + translateY 8px) + scrim fade. navigate mode (Published): onClose/router.push fires immediately so nav overlaps the animation, and releaseOverlay() (body scroll restore + background un-inert + dialog-root display:none + Esc-handler gate + focus restore) drops the overlay at exit-end (or immediately under reduced motion) so a slow RSC traps neither pointer, keyboard/Esc, nor focus. The drag-past-threshold dismiss shares this navigate contract (push at commit, releaseOverlay at slide-out end). unmount mode (Step3): onClose fires at exit-end. Reduced motion → instant close. Back-button unmount is a route change (no requestClose in the popstate path). The Suspense skeleton is unchanged and remains non-interactive (MODAL-SKELETON-CLOSE-1 still deferred).`

Full inventory for THIS feature's states:

| Transition | Treatment |
|------------|-----------|
| closed → open | entrance (unchanged): `step3-details-sheet-rise` `<sm` / `step3-details-pop-in` `≥sm` + `step3-details-scrim-in` (`app/globals.css:772-792`) |
| open → exiting (X/Esc/scrim/grab-tap) | `requestClose`: cancel active drag + `beginDismiss()` + mode-aware reverse (§3.2) + scrim fade, JS-inline; `onClose` timing per §3.1a |
| exiting → closed | `navigate`: route change unmounts (push fired at start); `releaseOverlay` at exit-end if still mounted. `unmount`: `onClose` at panel `transform` transitionend / fallback. Unmount clears inline styles |
| open → closed, reduced motion | immediate close — no animation (§3.1 step 4); `navigate` releases the overlay immediately |
| open → closed, drag past threshold | **visual unchanged** — existing `translateY(100%)` slide-down (`:276-299`); close-commit now honors `closeBehavior` (§3.1b) and calls `beginDismiss()` |
| open → closed, browser Back | **unchanged** — route change unmounts; `requestClose` is not in this path |
| Suspense skeleton open/close | **no transition** — `closeBehavior="none"` makes scrim/Esc/grab/drag inert no-ops, identical to `main`. Explicitly NOT an exit animation: the frame must not animate out into a hidden inert state (MODAL-SKELETON-CLOSE-1 deferred, §8; Codex R22) |

**Compound transitions:**
- exit committed, then viewport crosses `sm` → matchMedia cleanup guards `!dismissingRef.current` (`:361`), exit not interrupted. Unchanged.
- **drag in progress, then X/Esc pressed** → `requestClose` cancels the drag first (§3.1 step 2), so the eventual `pointerup` early-returns at `:260` and CANNOT run the spring-back that would overwrite the exiting panel. The exit animates from the drag's current inline transform (continuous). Acceptance in §9.5(d).
- `requestClose` fired twice fast (Esc, then scrim before unmount) → second is a no-op. One exit.

## 7. Design decision — JS-inline exit, not twinned CSS keyframes

**(a) JS-inline** (chosen): `requestClose` sets `transform`/`opacity`/`transition` on the panel and `opacity`/`transition` on the scrim, exactly as the drag-dismiss already manipulates the panel (`:282-283`). No new CSS.
**(b) CSS `[data-*-exiting]` keyframes**, twinned `[data-review-modal-*]`/`[data-step3-review-*]` like the entrance.

**(a) wins** because:
1. **Consistency** — the sheet exit becomes pixel-identical to the drag-dismiss slide-down (same `translateY(100%)`, same token, same `transitionend`/fallback), reusing the same machinery.
2. **It does not destabilize two existing structural pins.** The entrance twin-scan asserts `[data-step3-review-*]` receives an animation body in **exactly 3** media contexts and `[data-review-modal-*]` mirrors it (`tests/components/admin/review/reviewModalShell.test.tsx:186-197`). CSS exit rules would add contexts and force that count to be re-derived. JS-inline leaves entrance CSS — and that test — untouched.
3. **The `pageTransitions` no-motion pin stays green.** `PublishedReviewModal.tsx` is pinned to a conditional-render count of **1** and "imports no client motion library, no `AnimatePresence`" (`tests/components/admin/showpage/pageTransitions.test.tsx:123,136-141`). Exit living in the shell as JS-inline keeps both assertions true.

Reduced motion is read at fire time via `matchMedia` — no CSS `@media` needed for the collapse.

## 8. Out of scope

- **`MODAL-SKELETON-CLOSE-1` remains DEFERRED.** `ShowReviewModalSkeleton` keeps `onClose={() => {}}` and gains exactly one prop — `closeBehavior="none"` — which makes its scrim/Esc/grab/drag inert no-ops, i.e. behaviourally identical to `main`. That prop is REQUIRED, not optional: without it the shell-wide `requestClose` rewiring would leave the loading frame hidden, inert, and scroll-locked — a regression this spec would introduce (Codex R22 high). It still adds no close affordance. This spec neither fixes nor worsens it; the frame is as escapable (or not) as on `main`. Bundling it here required a slot above the Suspense boundary, a dismissal context, remount-nonce keying, and hash listeners, and generated 13 of 20 review rounds' worth of defects (§0). It deserves its own task where that machinery can be designed and reviewed on its own terms.
- **Same-identity reopen during a slow close** (§4): re-opening the SAME show+alert before the close push lands does not reopen the modal until it does. Narrow, self-healing, page fully usable. Documented; a new `DEFERRED.md` entry records it.
- ~~Failed/never-committing close navigation~~ — **NO LONGER out of scope (Codex R21).** An earlier revision deferred this on the claim it was "not worse than `main`"; that claim was wrong (`main` leaves the modal visible and retryable, this design left it hidden and unrecoverable without a refresh). It is now handled in scope by the §3.1d bounded rollback, and gets no `DEFERRED.md` entry.
- The drag-dismiss **visual** slide-down is unchanged (no scrim fade added; its scrim is hidden wholesale by `releaseOverlay` at slide-out end). Its close-commit timing IS in scope (§3.1b).
- Browser-Back close stays an un-animated route change.
- No new tokens (DESIGN.md §10) — durations reuse `--duration-normal` / `--duration-fast`; the fallback constants already exist (`:48,52`).
- **Programmatic success-closes stay instant.** Step3's action-success closes (`Step3ReviewModal.tsx:238,256,309`) are NOT dismiss gestures and call `onClose` directly, unchanged.

## 9. Test surface

1. **Shell unit (`reviewModalShell.test.tsx`)** — in jsdom (`matchMedia` absent → immediate-close path) scrim/Esc/grab route through `requestClose` and call `onClose` exactly once; re-entrancy guard fires `onClose` once for double-Esc/Esc-then-scrim. `closeBehavior`: `"unmount"`/default call `onClose` once; `"navigate"` calls `onClose` once AND runs the `releaseOverlay` restore (assert `[data-inert-root]` un-inerted, body overflow restored, dialog root `display:none`) in the immediate path, AND — with `overlayReleasedRef` set — the unmount cleanups do NOT re-restore (R11) and do NOT re-focus the trigger (R5). The entrance twin-scan (`:186-197`) must stay unchanged and green (count === 3).
2. **`ModalCloseButton` unit** — reads context, forwards ref, `onClick` calls the provided `requestClose`; default no-op context when rendered outside a provider.
3. **`pageTransitions.test.tsx`** — `PublishedReviewModal` conditional count stays **1** and no-motion assertions stay green (regression guard, no edit expected).
4. **Skeleton non-dismissibility (§3.1a `"none"`)** — assert the skeleton behaves exactly as on `main`. NOT just "no header X": explicitly exercise **scrim tap, Esc, grab-strip tap, AND drag-past-threshold** on a mounted skeleton and assert NONE of them sets `inert`, sets `dismissingRef`, applies an exit transform, releases the overlay, or calls `onClose`; body scroll stays locked and the frame stays visible and in place. The weaker "no X button" form of this test would pass while the regression R22 identified ships. Pins the §8 deferral.
5. **Real-browser (`published-review-modal.interactions.spec.ts`)** — groups:
   (a) **exit-animation flip** — the §6.5 assertion flips: X / Esc / scrim leave an exit-animated frame (panel carries a non-identity exit `transform`/`opacity` inline, scrim opacity → 0) BEFORE the modal frame leaves the DOM and the URL strips `show`/`alert_id`. Anti-tautology: sample the panel's *computed* transform/opacity during the exit window and assert non-identity, then assert removal + URL strip. Reduced-motion run collapses to instant (no exit frame).
   (b) **slow-navigation anti-trap** (R1/R2/R3) — with the route/RSC delayed, assert that after the exit animation completes the background is fully usable, all BEFORE the route unmount: `[data-inert-root]` no longer `inert`, `document.body.style.overflow` restored, dialog root `display:none`; **a real background button receives a pointer click** (R3); **`document.activeElement` is OUTSIDE the dialog** and **Tab reaches a background control** (R2); **Esc on a focused background control is NOT swallowed** (R3).
   (c) **reduced-motion slow-navigation** (R2) — reduced-motion emulation + delayed route: assert inert/scroll/focus release happen immediately after the instant close, without waiting for route unmount.
   (d) **compound drag-held + Esc** (R1) — press-and-hold the grab past slop, press Esc, release the pointer AFTER the fallback timer; assert the panel exits and the modal closes exactly once with no `translateY(0)` snap-back frame.
   (e) **drag-past-threshold slow-navigation anti-trap** (R4) — with the route delayed, drag past the 110px threshold and release; assert the SAME release contract as (b) before route unmount.
   (f) **post-route focus not stolen** (R5) — after release, move focus to a background control, THEN let the delayed route finish; assert `document.activeElement` is STILL the user's background control.
   (g) **exit-window action suppression** (R6/R7 — `inert` is not enforced in jsdom) — in the Step3 harness, dismiss via Esc/X **AND, separately, via drag-past-threshold**, then within each exit window attempt to click Publish / Approve & apply / Ignore; assert the mutation handler is NOT invoked and the modal still unmounts at exit-end exactly once.
   (h) **post-release cleanup does not clobber a newer modal** (R11) — with the route delayed, close Published and wait for `releaseOverlay`; open ANOTHER modal/lightbox in the released window; THEN let the route land. Assert the newer modal's scroll lock, `[data-inert-root]` inert, and focus survive. Anti-tautology: assert the old shell actually unmounted.
   (i) **failed-close bounded rollback** (R21, §3.1d) — three cases on the loaded Published path: (a) the `/admin` close response is **aborted/errored**; (b) it is left **indefinitely pending**; (c) the browser is **offline**. In each, after `CLOSE_NAV_TIMEOUT_MS` assert `restoreOverlay()` reversed **all three layers** (§3.1d): (1) the dialog root is **NOT `inert`** and `dismissingRef`/`overlayReleasedRef` are cleared; (2) the panel and scrim carry **no residual exit styles** — assert **computed** `opacity` is 1 and the transform is identity, not merely that inline properties were unset; (3) body scroll is re-locked, `[data-inert-root]` re-inerted, Esc handler live. Then assert the modal is **usably** back by performing a **real successful close** afterward (click X → it dismisses and navigates). Anti-tautology: assert the URL still reads `show=<slug>` at rollback time — if the close actually committed, the failure path was never exercised. Checking computed visibility and a working retry (rather than inline-property absence) is what catches the R23 defect where rollback revealed a still-inert, still-translated dialog.
   (i2) **compound: stalled close + newer overlay → rollback SKIPPED** (R22, §3.1d) — with the route delayed, close Published and wait for `releaseOverlay`; open ANOTHER modal/lightbox in the released window; then stall the close past `CLOSE_NAV_TIMEOUT_MS`. Assert `restoreOverlay` did NOT run: the stale review modal does not reappear, the newer overlay keeps its scroll lock / `[data-inert-root]` inert / focus, and nothing is stolen. Anti-tautology: assert the rollback timer genuinely elapsed (advance past 8000ms and confirm the shell is still mounted), so the case cannot pass merely by the timeout never firing. This is the compound of (h) and (i) — neither alone catches it.
   (j) **navigation race — EARLY BLOCKING GATE (§3.1c), runs FIRST.** With `/admin` delayed, close Published, then navigate again before the close commits. Required cases, each in **both settle orders** (stale close resolving before AND after the newer navigation): **(j1/j2)** open a DIFFERENT show; **(j3)** mutate a non-modal param via the bucket control; **(j4)** open the **SAME show with a DIFFERENT `alert_id`** via a `NeedsAttentionInbox` (`:128`) or `BellPanel` entry — a distinct modal identity, and a likely real path. j4 is not covered by j1/j2: a stale close deletes BOTH `show` and `alert_id`, so it can clobber a newer alert navigation on the same slug while a different-show gate passes (Codex R21). Assert the final URL preserves the newer `show`+`alert_id` pair and the rendered modal reflects that alert. **(j5)** click a Bell **action link carrying a hash** (`lib/adminAlerts/alertActions.ts:51,114` — `?show=<slug>#share-access` and `#overview`); assert the final search params **and the hash** survive the stale close, and the requested section is the one shown. j5 closes the last gap between the §3.1c surface table and the gate: the table declares hash action-links reachable in the released window, and a stale close push that omits the hash could clobber that navigation while j1–j4 all pass (Codex R23). Assert the final URL reflects the latest navigation and the stale close reverted nothing. Anti-tautology: assert the stale close genuinely committed (not merely pending), and that the "after" order did not silently degrade into the "before" order. If any case fails → **STOP and escalate** (§3.1c); do NOT implement either rejected design.
6. **Transition-audit** — enumerate that the four affordances' handlers all resolve to `requestClose`; assert the §3.1 guards exist (drag-cancel, reduced-motion/null-panel immediate close, `dismissingRef` re-entrancy) and that `handleGrabPointerEnd` early-returns on `dismissingRef`.

## 10. Files

| File | Change |
|------|--------|
| `components/admin/review/ReviewModalShell.tsx` | shared `beginDismiss()` (`dismissingRef=true` + `dialogRef.inert=true`) called by BOTH `requestClose` AND the drag branch (§3.1b); `requestClose` (+ drag-cancel); `closeBehavior?: "unmount"\|"navigate"` prop; `scrimRef` + `dialogRef`; `releaseOverlay()` (body-scroll + background-un-inert + dialog-root `display:none` + Esc-gate + focus) + `overlayReleasedRef`; `restoreOverlay()` + `CLOSE_NAV_TIMEOUT_MS` (8000) bounded rollback when the close navigation never commits — reverses local dismiss state (inert, refs), panel/scrim exit inline styles, AND the five release duties, gated on an ownership check (R21/R22/R23, §3.1d); lift `previouslyFocusedRef`/`scrollLockPrevRef`/`inertPrevRef` to refs + `restoreBackgroundInert()`; document-Esc `onKeyDown` early-returns on `overlayReleasedRef`; gate **all three** unmount restores on `!overlayReleasedRef` (R11); mode-aware close-commit shared by `requestClose` and the drag branch; `ReviewModalCloseContext` + `useReviewModalClose` + provider wrap; scrim/Esc/grab → `requestClose`; `handleGrabPointerEnd` early-return on `dismissingRef` |
| `lib/a11y/dialogFocus.ts` | add optional `shouldRestoreFocus?: () => boolean` (default `() => true`; gates the unmount focus-restore — R5). `GalleryLightbox`/`AgendaSheet` callers unchanged |
| `components/admin/review/ModalCloseButton.tsx` | **new** shared X button (forwardRef, context consumer) |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef`; pass `closeBehavior="navigate"` |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; forward `closeRef` (default `unmount`) |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | add `closeBehavior="none"` ONLY — preserves `main` behavior under the shell-wide `requestClose` rewiring (§3.1a, Codex R22). No close affordance added; `MODAL-SKELETON-CLOSE-1` stays deferred |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 row amendment (§6 above). §4 skeleton wording UNCHANGED (still non-interactive) |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1`; **`MODAL-SKELETON-CLOSE-1` stays**; add an entry for the same-identity reopen window only (§8) — the failed-close path is handled in scope by §3.1d, NOT deferred |
| tests (§9) | shell unit, ModalCloseButton unit, skeleton-unchanged regression, interactions spec (14 groups: a–i, i2 + j1–j5), transition-audit |

## 11. Invariants

UI-only. No DB, no advisory locks (invariant 2 N/A), no email boundary (3 N/A), no sync cursor (4 N/A), no user-visible error codes (5 N/A), no Supabase call boundary (9 N/A), no mutation surface (10 N/A). Invariant 8 (impeccable dual-gate) **applies** — `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Invariants 6 (commit per task) and 7 (spec canonical — this spec is the ratified amendment to §6.5) apply.

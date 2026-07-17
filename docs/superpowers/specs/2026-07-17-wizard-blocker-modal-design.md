# Spec — Wizard step-3 publish blockers as a modal

**Date:** 2026-07-17
**Slug:** `wizard-blocker-modal`
**Surface:** admin onboarding wizard, step 3 (publish)
**Register:** product (admin UI)
**Owner request:** Doug flagged the inline blocker panel growing the sticky footer / shifting layout. Move the finalize terminal blocker/error panels into a modal.

---

## 1. Problem

On wizard step 3, the finalize state machine's terminal recovery panels render **inline in the footer-center slot**. When finalize returns a blocking result the panel appears in-flow and grows the sticky `WizardFooter`, causing the layout shift Doug flagged (the same class of problem the D5 soft-confirm already dodged by floating as an anchored popover — `Step3ReviewWithFinalize.tsx:162-171`).

Concretely, three terminal states render via `FinalizeStatusRegion` (`components/admin/FinalizeButton.tsx:572-685`):

| State (`ButtonState.kind`) | testid | Heading copy | Recovery affordance |
| --- | --- | --- | --- |
| `race_row` | `wizard-finalize-race-row` | "Some sheets need another look before we can publish." | per-row re-apply `<Link>` (`wizard-finalize-reapply-<dfid>`) + `HelpAffordance` |
| `cas_per_row` | `wizard-finalize-cas-per-row` | "Some sheets are blocking the final publish step." | `RescanSheetButton` (RESCANNABLE) **or** `BlockedRowResolver` + `HelpAffordance` |
| `error` | `wizard-finalize-error` | Doug-facing copy via `renderEmphasis(state.copy)` | `HelpAffordance code={state.code}` |
| `complete` | `wizard-finalize-publish-complete` | "Setup is complete. Your shows are live for crew now." | none (announcement, then `router.refresh()`) |

The screenshot Doug sent is the `cas_per_row` panel (archived-show blocker → `BlockedRowResolver`'s "Unarchive & retry").

**`complete` is not a blocker** and does not grow the footer meaningfully (one line, then the page refreshes to the dashboard). It stays inline. Only `race_row`, `cas_per_row`, and `error` move to the modal.

---

## 2. Live-code grounding (citations verified against the worktree)

- `FinalizeStatusRegion` renders all four terminal branches inline; focus moves onto the alert region via a local `alertRef` + focus-on-entry effect (`FinalizeButton.tsx:578-583`).
- `ButtonState` union: `idle | running | race_row | cas_per_row | error | complete` (`FinalizeButton.tsx:97-107`).
- `useFinalizeRun` owns `state` via `useState<ButtonState>` and internal `setState`; it returns `{ state, isRunning, buttonDisabled, confirmOpen, setConfirmOpen, onPrimaryClick, runLoop, liveMessage, idleLabel, runningLabel, uncheckedCleanCount, uncheckedCleanNames, wizardSessionId }` (`FinalizeButton.tsx:481-495`). It exposes **no reset-to-idle** today — this spec adds one.
- Consumers of the terminal panels:
  1. Combined `<FinalizeButton>` (`FinalizeButton.tsx:693-719`) — renders `<FinalizeStatusRegion run={run} />`. This is the **primary test harness** (`tests/components/admin/FinalizeButton.test.tsx` renders `<FinalizeButton>` directly ~30×). No production route renders the combined component (grep: no `<FinalizeButton` outside tests).
  2. `Step3ReviewWithFinalize` → `Step3FooterCenter` (`Step3ReviewWithFinalize.tsx:216-219`) renders `<FinalizeStatusRegion run={run} />` in the footer-center `else` branch. **This is the production footer.**
- Canonical modal shell precedent: `Step3ReviewModal.tsx` — the rendered shell (`role="dialog" aria-modal aria-labelledby`, `fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6`, scrim button `bg-overlay-scrim`) at `:557-587`; and the a11y wiring `useDialogFocus(panelRef, closeRef)` at `:284`, body-scroll-lock at `:288-294`, document-Escape (`event.preventDefault(); onClose()`) at `:299-308`. `ReportModal.tsx:449-467` is the same shell + `motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)] motion-reduce:animate-none`.
- `useDialogFocus(containerRef, initialFocusRef?)` — saves previously-focused element, sets initial focus (prefers `initialFocusRef`, else first focusable), traps Tab, restores focus on unmount (`lib/a11y/dialogFocus.ts:42-83`). Esc is the dialog's responsibility.
- `useHasMounted()` exists (`lib/a11y/useHasMounted.ts`) and is the established gate for portaling fixed overlays out of the `PageTransition` transformed subtree (`WizardFooter.tsx:12-23` portals its fixed tab bar to `document.body` for exactly this reason).
- Tokens: `--color-overlay-scrim` (`globals.css:77,291,340,359`), `sheet-rise` keyframe (`globals.css:708-714`), `--duration-normal` 220ms.
- Recovery-affordance component props (unchanged; this spec passes NO new props to any of them — cited from the type definitions for accuracy):
  - `BlockedRowResolver` — full prop type `{ driveFileId, wizardSessionId, code, displayName?, rebuildExhausted?, disabled?, onResolved }` (`components/admin/BlockedRowResolver.tsx:40-48`); current callsite passes all but `disabled` (`FinalizeButton.tsx:643-652`). The modal preserves the callsite verbatim.
  - `RescanSheetButton` — `{ driveFileId, wizardSessionId, resultPlacement?, disabled? }` (callsite `FinalizeButton.tsx:638-641`).
  - `HelpAffordance` — full prop type `{ code, params?, route? }` (`components/admin/HelpAffordance.tsx:45-64`); the finalize callsites pass only `code`. `HelpAffordance` returns `null` for a null/empty/unknown code (`HelpAffordance.tsx:72-73`) — the error-state guard relies on this.
  - `RESCANNABLE_CAS_CODES` gate unchanged (`FinalizeButton.tsx:69-72`).

---

## 3. Scope

**In:** move `race_row`, `cas_per_row`, `error` terminal panels into a dialog rendered by a new presentational component `FinalizeBlockerModal`; add a `dismiss()` (reset-to-idle) to `useFinalizeRun`; keep `complete` inline; preserve every existing testid and per-row recovery affordance; wire dismiss semantics per §5.

**Out:** the `running` progress surfaces (`ProgressPanel`, `Step3CompactTracking`) — unchanged. The D5 soft-confirm popover — unchanged. The finalize state machine, streaming loop, endpoint sequence, per-row failure branching — unchanged. `Step3ReviewModal` (the review/re-apply modal) — unchanged. No DB, RPC, migration, advisory-lock, or telemetry surface is touched.

---

## 4. Architecture

### 4.1 Single-lever refactor

`FinalizeStatusRegion` is the one component both consumers route through. It is refactored to render:

1. `<FinalizeBlockerModal run={run} />` — a self-gating dialog that renders **only** when `state.kind ∈ { race_row, cas_per_row, error }`, else `null`.
2. The inline `complete` note — unchanged markup (`role="status"`, `wizard-finalize-publish-complete`), rendered when `state.kind === 'complete'`.

Because both the combined `<FinalizeButton>` and `Step3FooterCenter` already render `<FinalizeStatusRegion run={run} />`, **no host rewiring is required** beyond the internal refactor. The `alertRef` focus-on-entry logic (`FinalizeButton.tsx:578-583`) moves into the modal (superseded by `useDialogFocus`).

`Step3FooterCenter`'s ternary is unchanged in shape: `running → tracking`, `idle → hint/stale-note`, `else → <FinalizeStatusRegion>`. For a blocker/error state the `else` branch renders `FinalizeStatusRegion`, which now contributes a **fixed, zero-flow modal** (no footer growth) instead of an in-flow panel; the scrim covers the footer, so the empty center behind it is never seen. For `complete` the `else` branch still renders the inline note in the center.

### 4.2 `FinalizeBlockerModal` contract

```
FinalizeBlockerModal({ run }: { run: FinalizeRun })
```

- **What it does:** renders a modal dialog carrying the race_row / cas_per_row / error content when the run is in one of those states; renders `null` otherwise.
- **How you use it:** render once per host, passing the shared `run`. Idempotent — safe to mount unconditionally.
- **Depends on:** `run.state`, `run.runLoop`, `run.dismiss`, `run.wizardSessionId`; `useDialogFocus`, `useHasMounted`, `createPortal`; `BlockedRowResolver` / `RescanSheetButton` / `HelpAffordance` / `renderEmphasis` / `lookupDougFacing`.

**Mount strategy:** `createPortal(<dialog/>, document.body)` gated on `useHasMounted()` (returns `null` until mounted → SSR-safe, no hydration mismatch). Portaling to `document.body` is **required** (not defensive) for a concrete, verified reason — the §7a compound stacking, not a transform claim:

- The production footer is itself rendered via `createPortal(<div className="fixed inset-x-0 bottom-0 z-40">…</div>, document.body)` (`WizardFooter.tsx:62-92`). `FinalizeStatusRegion` sits in that footer's `center` slot, so it lives inside a **`z-40` fixed stacking context**.
- The per-card `Step3ReviewModal` is `fixed … z-50` mounted from a sheet card in the app-root subtree, and can be OPEN while a publish run is in flight (§7a, `step3Page.transitions.test.tsx:183-209`).
- A blocker modal rendered as a plain footer child would be trapped inside the footer's `z-40` context and could NOT paint above the root-level `z-50` review modal — no child z-index escapes an ancestor stacking context. Only a modal portaled to `document.body` (a later body sibling than app-root, at `z-50`) paints above BOTH the footer and the review modal.
- Secondary benefit: `FinalizeStatusRegion` is host-shared (footer AND the combined `<FinalizeButton>`); a body portal pins the panel to the viewport regardless of host. The §8 Playwright assertion proves viewport pinning + that opening the modal does not grow the footer.

(This supersedes the earlier transform-confinement framing: the production footer is already body-level via WizardFooter's own portal, so PageTransition's transform is not the operative reason — the z-context trap above is.)

### 4.3 `useFinalizeRun` change

Add `dismiss: () => setState({ kind: "idle" })` to the returned object. This is the ONLY state-machine addition. It is called by the modal's dismiss/back controls (§5). Resetting to `idle` returns the footer to its calm hint and re-enables the Publish trigger for a retry. It never fires while `state.kind === 'running'` (the modal is not mounted then).

Row-resolution affordances behave EXACTLY as today (verified against the live cas_per_row branch, `FinalizeButton.tsx:637-653`):

- **`BlockedRowResolver`** (non-rescannable codes) — `onResolved` continues the loop, BUT guarded against a late resolve after dismissal. `BlockedRowResolver.handleClick` calls `onResolved()` AFTER `await fetch` on success (`BlockedRowResolver.tsx:163-166`). If the operator clicks **Back** while that request is in flight, the modal unmounts but the resolver's captured `onResolved` closure still fires on the late success — calling `run.runLoop()` would restart publish AFTER a dismissal (a race the new Back control introduces; the old inline panel had no dismiss). Guard: the modal holds a per-mount `dismissedRef` (`useRef(false)`), Back/dismiss sets `dismissedRef.current = true` BEFORE `run.dismiss()`, and the callback is `onResolved={() => { if (!dismissedRef.current) void run.runLoop(); }}`. The `dismissedRef` object is captured by the resolver's closure, so a late success reads `true` and no-ops. (A fresh mount gets a fresh `dismissedRef=false`.) On the non-dismissed happy path it transitions `state` to `running`, the modal unmounts, and `Step3CompactTracking` takes over. Covered by §10.13.
- **`RescanSheetButton`** (RESCANNABLE codes) is passed only `{ driveFileId, wizardSessionId }` — it has NO resolve callback and, on success, calls its own `router.refresh()` (`RescanSheetButton.tsx:123-135`). It does **not** call `runLoop`. `run.state` is client state that survives a soft `router.refresh()`, so the modal **remains** in `cas_per_row` after a re-scan (identical to today's inline panel, which also persists until the operator re-clicks Publish or dismisses). The operator then either hits **Back** (→ idle) or re-clicks Publish (which re-runs finalize against the refreshed data). This spec does NOT change that flow.

---

## 5. Dismiss matrix (guard conditions per state)

| State | Blocking? | Backdrop click | Escape key | Explicit control | On dismiss |
| --- | --- | --- | --- | --- | --- |
| `error` | no | dismisses → `run.dismiss()` | dismisses → `run.dismiss()` | **Close** (X) button, `aria-label="Close"` → `run.dismiss()` | state → `idle`; footer shows calm hint; trigger re-enabled for retry |
| `race_row` | yes | **inert** (no dismiss) | **inert** (no dismiss) | **Back** button (visible, labelled) → `run.dismiss()`; per-row re-apply `<Link>` navigates away | Back → `idle`; re-apply link → route change |
| `cas_per_row` | yes | **inert** (no dismiss) | **inert** (no dismiss) | **Back** button → `run.dismiss()`; per-row `BlockedRowResolver` → `run.runLoop()` on resolve; per-row `RescanSheetButton` → its own `router.refresh()` (no state change) | Back → `idle`; `BlockedRowResolver` resolve → `running` (modal unmounts); `RescanSheetButton` success → modal STAYS `cas_per_row` (refresh only, matches today) |

- **Blocking states are action-only**: no backdrop/Escape dismiss, but a visible **Back** control always exists so the operator is never trapped (keyboard-complete exit). This satisfies the owner's "action-only, otherwise Back" instruction.
- **Backdrop element differs by state (a11y — do NOT blindly copy `Step3ReviewModal`'s labelled-button scrim, `Step3ReviewModal.tsx:570-577`):**
  - `error` (dismissible): the backdrop IS an interactive `<button aria-label="Close" tabIndex={-1} onClick={dismiss}>` (kept out of the tab order; Escape + the explicit Close button are the keyboard exits) — matching the `Step3ReviewModal` scrim.
  - `race_row` / `cas_per_row` (blocking): the backdrop is a **non-interactive `<div aria-hidden="true">`** — NO `button`, NO `onClick`, NO accessible "Close" label. It must never expose a control that does nothing (the finding). The only exits are the explicit **Back** button and the per-row actions.
  - `wizard-finalize-blocker-backdrop` testid is on whichever element renders; §10.3 asserts the blocking backdrop is non-interactive (a click does not dismiss AND it exposes no button role).
- **`error` is dismissible**: backdrop, Escape, and an explicit Close all reset to idle.
- **Guard — empty failure list:** `race_row`/`cas_per_row` are only ever entered with ≥1 failure (`FinalizeButton.tsx:368-374,422-425`); the modal still renders its heading + Back if the list were somehow empty (defensive: `.map` over `[]` yields just heading + Back, never a blank dialog).
- **Guard — null `display_name`:** falls back to `drive_file_id` (unchanged, `FinalizeButton.tsx:600,631`).
- **Guard — null `state.code` (error):** `HelpAffordance` already tolerates null; copy falls back to `GENERIC_ERROR` (unchanged).

---

## 6. A11y / focus

- `role="dialog"`, `aria-modal="true"`. Accessible name: the primary text of each state is promoted to an `<h2 id={titleId}>` and the dialog carries `aria-labelledby={titleId}`. Concretely: race_row's "Some sheets need another look…" and cas_per_row's "Some sheets are blocking…" (today `<p className="font-semibold">`, `FinalizeButton.tsx:594,627`) become the `<h2>`; the `error` state (today `renderEmphasis(state.copy)` in a `<p>`, no heading, `FinalizeButton.tsx:668`) gets its copy `<p>` given the `titleId` so the Doug-facing sentence IS the accessible name (an `<h2>` wrapper is not required — `aria-labelledby` may point at any element). Every state therefore has exactly one labelling element; no state ships an unnamed dialog.
- `useDialogFocus(panelRef, dismissRef)` where `dismissRef` is the **Close (error) or Back (blocking)** button — initial focus lands on the exit control, Tab is trapped, focus restores to the previously-focused element on unmount (`lib/a11y/dialogFocus.ts` contract).
- Body scroll lock while mounted (`document.body.style.overflow = 'hidden'`, restored on unmount) — matches `Step3ReviewModal.tsx:288-294`.
- Background made `inert` + `aria-hidden` while mounted (§7a) — guarantees exactly one exposed modal root even when a `Step3ReviewModal` is open underneath, and hard-blocks background focus/pointer.
- The dialog panel retains `role="alert"` semantics for the content region? **No** — a `role="dialog"` with `aria-modal` that receives focus is the correct pattern; the alert-region `tabIndex=-1` focus is retired (superseded by dialog focus). The blocker headings are announced by the dialog's accessible name on open. Per-row copy remains readable in-flow.
- Escape listener is attached on `document` (caught wherever focus sits) but **only calls `dismiss` for the `error` state**; for blocking states the handler is a no-op (still `preventDefault` so Escape doesn't bubble to any parent).

---

## 7. Transition inventory

The 6 `ButtonState` kinds are `{idle, running, race_row, cas_per_row, error, complete}`. The modal is mounted **iff** state ∈ {race_row, cas_per_row, error} (the "blocker set"). Only transitions that CROSS the modal-mounted boundary (or change modal content) carry a motion treatment; all others are no-modal, unchanged, and instant. Full pair matrix (from → to), 6×5 = 30 ordered pairs; grouped:

| From \ To | idle | running | race_row | cas_per_row | error | complete |
| --- | --- | --- | --- | --- | --- | --- |
| **idle** | — | no modal (trigger→tracking, unchanged) | modal ENTERS¹ | modal ENTERS¹ | modal ENTERS¹ | inline note (no modal) |
| **running** | n/a² | progress update, no modal | modal ENTERS¹ | modal ENTERS¹ | modal ENTERS¹ | inline note (no modal) |
| **race_row** | modal EXITS³ (Back) | modal EXITS³ (re-apply link = route change) | — | n/a⁴ | n/a⁴ | n/a⁴ |
| **cas_per_row** | modal EXITS³ (Back) | modal EXITS³ (resolve→runLoop) | n/a⁴ | — | n/a⁴ | n/a⁴ |
| **error** | modal EXITS³ (dismiss) | modal EXITS³ (retry via trigger→runLoop) | n/a⁴ | n/a⁴ | — | n/a⁴ |
| **complete** | n/a² | n/a² | n/a⁴ | n/a⁴ | n/a⁴ | — (terminal; router.refresh) |

- ¹ **ENTERS:** scrim fades in via the EXISTING grounded keyframe `step3-details-scrim-in` (`app/globals.css:726`, opacity 0→1), applied as `motion-safe:animate-[step3-details-scrim-in_var(--duration-normal)_ease-out]`; the panel uses the single EXISTING `sheet-rise` keyframe (`app/globals.css:708`) on ALL breakpoints, applied as `motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)]`. Duration + ease consume the DESIGN.md tokens `--duration-normal` (`globals.css:216`) and `--ease-out-quart` (`globals.css:219`) — NO hardcoded ms literal (DESIGN.md token rule; the reduced-motion block collapses `--duration-normal` to 0ms at `globals.css:408`). `motion-reduce:animate-none` on BOTH scrim and panel is the belt-and-suspenders instant path. No new `@keyframes` and no invented `scrim-fade`. The shell layout still differs by breakpoint (bottom sheet `items-end` mobile / centered `sm:items-center`), but the ENTRANCE keyframe is the single shared `sheet-rise` — there is no separate "desktop pop".
- ⁵ **cas_per_row → cas_per_row (RescanSheetButton success):** NOT a modal transition — the re-scan `router.refresh()`es and `run.state` is unchanged (§4.3), so the modal stays mounted with no enter/exit. No animation.
- ² **n/a²:** the machine never transitions a terminal `complete`/idle back into `running` without a fresh user click that first re-enters `running` from `idle`; `idle→running` and `running→idle(dismiss)` are the only crossings and are covered.
- ³ **EXITS:** instant unmount, NO exit animation — matches every modal in the repo (`Step3ReviewModal`, `ReportModal`, D5 soft-confirm all lack exit keyframes). React removes the portal node; any in-flight enter animation is discarded (the only compound-animation case, and unmount-wins needs no coordination).
- ⁴ **n/a⁴:** one terminal per finalize run — the machine never moves blocker→blocker or blocker→error/complete without passing through `running` (resolve) or `idle` (dismiss) first. Not reachable.

### 7a. Compound: review modal open while a blocker fires

`Step3ReviewModal` (a separate `aria-modal` dialog opened per sheet card) is reachable WHILE a publish run is in flight (`tests/components/admin/wizard/step3Page.transitions.test.tsx:183-209`, T8-b). If finalize then reaches a blocker/error terminal, `FinalizeBlockerModal` mounts on top of the open review modal. Defined behavior (no suppression — the two are independent surfaces owned by different components):

- **Z-order:** the blocker modal portals to `document.body` and therefore appends AFTER the review modal in DOM order; both use `z-50`, so equal z-index + later-in-DOM ⇒ the blocker paints on top. Its own `bg-overlay-scrim` layers over the review modal's scrim (acceptable — the topmost actionable surface wins).
- **Focus:** `useDialogFocus` moves focus INTO the blocker panel on mount; the review modal's Tab-trap listener is bound to the review modal's own container, and focus now lives in the blocker's separate portal subtree, so the review trap does not fire while the blocker owns focus. On blocker unmount, `useDialogFocus` restores focus to the element focused before the blocker mounted (which is inside the still-open review modal) — the review modal regains focus ownership cleanly.
- **Escape:** `Step3ReviewModal`'s Escape listener is a **bubble-phase `document` listener** (`Step3ReviewModal.tsx:299-308`). A `stopPropagation()` from a second bubble-phase `document` listener would NOT reliably preempt it — both are on the same target, and the review modal (mounted first) is registered first, so it fires first. Therefore the blocker registers its Escape handler on `document` in the **capture phase** (`addEventListener('keydown', handler, true)`) and calls `event.stopImmediatePropagation()` + `event.preventDefault()`. A capture-phase `document` listener runs before ALL bubble-phase `document` listeners, and stopping propagation there prevents the event from reaching the bubble phase, so the review modal's `onClose` never fires. For the `error` state the capture handler additionally calls `dismiss`; for blocking states it is inert (swallows Escape) but still preempts. When no review modal is open the same handler simply owns Escape for the blocker (correct in both cases). A component test asserts the review modal's testid is still present after Escape while the blocker is open (§10.11).
- **Scroll lock:** each modal saves `document.body.style.overflow` at its own mount and restores it at unmount (`Step3ReviewModal.tsx:288-294` pattern). Blocker mounts second: it captures `'hidden'` (set by the review modal) and restores `'hidden'` on unmount; the review modal later restores the true original. No lock leak.
- **Single exposed modal root (AT — resolves the two-`aria-modal` concern):** on mount the blocker applies `inert` + `aria-hidden="true"` to every DIRECT child of `document.body` EXCEPT its own portal container (the standard "modal makes the rest inert" pattern; `inert` is a native HTML attribute — this repo has no prior DOM-`inert` modal implementation to copy, so the mechanism is written fresh and unit-tested here). On unmount it restores each node's prior `inert`/`aria-hidden` state. Because `Step3ReviewModal` renders inside the app-root subtree (a sibling body child of the blocker's portal), the review modal — including its `aria-modal="true"` — falls inside an `inert`/`aria-hidden` subtree while the blocker is open, so AT sees exactly ONE modal root (the blocker). This also hard-blocks focus/pointer from reaching the background, subsuming the focus-trap in the compound case. When no other modal is open, the same mechanism simply inerts the page behind the blocker (correct for a standalone modal too).
- **Cleanup ORDER (focus continuity):** `useDialogFocus` restores focus to the previously-focused element (inside the review modal) during ITS cleanup (`lib/a11y/dialogFocus.ts:75-83`). If the background were still `inert` at that moment, `.focus()` on an inert element silently fails and focus drops to `<body>`. React runs effect cleanups in REVERSE declaration order, so the inert effect MUST be declared AFTER the `useDialogFocus` call — then on unmount the inert-cleanup runs FIRST (un-inerts the review modal), and the `useDialogFocus` cleanup runs SECOND (restores focus into the now-focusable review modal). This ordering is load-bearing and stated as an implementation constraint.
- This compound is exercised by a component test (§10.11), which asserts (a) both dialog nodes exist in the DOM, (b) the review modal's body node carries `inert`/`aria-hidden` while the blocker is open and loses it on close, (c) Escape does not close the review modal, and (d) after the blocker closes, `document.activeElement` is a node INSIDE the review modal (focus continuity — proves the cleanup ordering).

---

## 8. Dimensional invariants + real-browser assertion

The modal panel is a `flex flex-col` inside `fixed inset-0 flex items-end justify-center sm:items-center`. Fixed-dimension parent → children relationships:

| Parent | Child | Guarantee |
| --- | --- | --- |
| `fixed inset-0` overlay | panel | `items-end` (mobile bottom sheet) / `sm:items-center` — panel sized by content, capped `max-h-[85vh]`, `w-full sm:max-w-md` |
| panel (`flex flex-col`) | header / body / footer | `items-stretch` stated explicitly (Tailwind v4 in this repo does NOT default `.flex` to `align-items:stretch` — DESIGN.md §7) |

**Real-browser Playwright task (mandatory, jsdom insufficient) — proves the two things Doug's bug and §7a require:**

1. **No footer growth (the actual regression):** measure `wizard-footer-inner`'s `getBoundingClientRect().height` with the run idle, then drive to `cas_per_row`; assert the footer height is unchanged within 0.5px (the modal is out of flow — the layout shift is gone). This is the acceptance test for the reported bug.
2. **Viewport-pinned + top-of-stack:** with the blocker open, assert the portaled panel's rect is within the viewport (`top ≥ 0`, `bottom ≤ innerHeight + 0.5`), and that `document.elementFromPoint(centerX, centerY)` of the panel resolves to a node INSIDE `wizard-finalize-blocker-modal` (proves it paints on top, incl. over an open `Step3ReviewModal` in the §7a compound). Bounds derived from `window.innerHeight`, never hardcoded.

Rendered in a production-representative host: the panel mounted through `FinalizeStatusRegion` inside a real `WizardFooter` (its own body portal, `z-40`), with an open `Step3ReviewModal` for the stack test.

---

## 9. Testids preserved (regression contract)

Every existing testid stays on the same content, now inside the dialog: `wizard-finalize-race-row`, `wizard-finalize-cas-per-row`, `wizard-finalize-error`, `wizard-finalize-reapply-<dfid>`, `wizard-finalize-publish-complete` (inline, unchanged). RTL `render` queries `document.body` as `baseElement`, so `getByTestId` resolves portaled content — existing `getByTestId`/`findByTestId` assertions keep passing.

**New testids:** `wizard-finalize-blocker-modal` (dialog container), `wizard-finalize-blocker-backdrop` (scrim), `wizard-finalize-blocker-dismiss` (Close/Back control).

**Intentional test breakages (two classes — both are strict improvements, enumerated so the plan tasks them, not silent):**

1. **Focus assertions.** `FinalizeButton.test.tsx:1298` asserts `document.activeElement === getByTestId('wizard-finalize-error')`. With the dialog, initial focus lands on the dismiss control (`useDialogFocus`), so this becomes `document.activeElement === getByTestId('wizard-finalize-blocker-dismiss')`. Any analogous race_row/cas_per_row focus assertion updates the same way.

2. **Invariant-5 `container.textContent` negatives (the portal consequence).** Because the modal portals to `document.body`, it leaves the RTL `render` `container` subtree. Assertions that read `container.textContent` (positive OR negative) about the moved panels must be **rescoped to the panel's own element** (`getByTestId('wizard-finalize-<state>').textContent`), NOT to `baseElement`. This KEEPS the teeth: a raw-§12.4-code negative (`…not.toContain('STAGED_PARSE_RESULT_CORRUPT')`) still inspects the actual rendered modal content, and is now MORE precise than the container scope (which also swept the trigger). Rescoping to `baseElement`/`document.body` would be acceptable but weaker; the panel element is the anti-tautology-correct scope. Affected `container.textContent` raw-code negatives (verified): `FinalizeButton.test.tsx:478, 575-576` and the analogous negatives at `607-620, 649-662, 1109-1118, 1126-1140, 1153-1167, 1211-1218`. (Positive `text = getByTestId(...).textContent` assertions like `:570-573` already query the panel and keep passing.) `getByTestId(...).textContent` positive assertions (e.g. `:474, 490, 518`) already query `baseElement` and keep passing unchanged. This rescope is a dedicated TDD task (§10.12).

---

## 10. Test plan (TDD tasks derive from these; anti-tautology noted)

1. **`dismiss()` reset** (unit, `useFinalizeRun`): drive to `error`, call `run.dismiss()`, assert `state.kind === 'idle'`. Failure mode caught: a dismiss that no-ops or leaves a stale terminal state.
2. **error dismissible** (component): reach `error`; Escape → modal gone + trigger enabled; backdrop click → gone; Close button → gone. Failure mode: error trapping the operator.
3. **blocking action-only** (component): reach `cas_per_row`; Escape → modal STILL present; backdrop click → STILL present; Back button → gone (idle). Failure mode: a blocker dismissable by mis-click, losing the recovery surface.
4. **resolve + rescan paths intact** (component): (a) `cas_per_row` with a non-rescannable code → click `BlockedRowResolver` resolve → `runLoop` fires (assert against the `fetch`/`runLoop` spy, not the DOM container — anti-tautology) → modal unmounts, tracking mounts. (b) `cas_per_row` with a RESCANNABLE code → assert `RescanSheetButton` is rendered (no resolve callback) and that a successful re-scan leaves the modal STILL mounted in `cas_per_row` (matches today; §4.3). Failure mode: modal swallowing the resolve action, OR a re-scan wrongly auto-dismissing the blocker.
5. **dialog semantics** (component): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` resolves to the heading text; body `overflow:hidden` while open, restored on close. Failure mode: non-modal dialog / scroll-lock leak.
6. **focus + trap** (component): on open, `document.activeElement === dismiss control`; Tab from the last focusable cycles to the first and Shift+Tab from the first cycles to the last (assert for a multi-control blocker state, e.g. race_row with re-apply links + Back — use the jsdom `offsetParent` stub pattern from `Step3ReviewModal.test.tsx:403-429` so `useDialogFocus`'s `focusableDescendants` visibility filter works under jsdom); on close, focus restored (or body). Update `FinalizeButton.test.tsx:1298` et al.
7. **layout-dimensions** (Playwright, real browser): §8 — (a) footer height unchanged when the blocker opens (the no-layout-shift regression proof), and (b) panel viewport-pinned + top-of-stack via `elementFromPoint`. Bounds derived from `window.innerHeight`, never hardcoded. (No "transformed ancestor" framing — the production footer is body-level; §4.2.)
8. **transition-audit** (component): assert the panel carries `motion-safe:animate-[sheet-rise…]` + `motion-reduce:animate-none`; assert the SCRIM element carries `motion-safe:animate-[step3-details-scrim-in…]` + `motion-reduce:animate-none`; assert that keyframe name EXISTS in `app/globals.css` (grep guard so a rename can't silently no-op the fade); assert no exit animation (instant unmount — the panel has no exit keyframe class). Extends `Step3TransitionAudit.test.tsx`.
9. **`complete` stays inline** (component): reach `complete`; assert `wizard-finalize-publish-complete` is NOT inside `wizard-finalize-blocker-modal` and no `role="dialog"` from this component is mounted.
10. **testid regression**: existing race_row/cas_per_row/error/reapply testid + copy assertions (`FinalizeButton.test.tsx` §Phase B/D lists) still pass (content now queried via `getByTestId`, which resolves the portal). Note: the error-retry test at `FinalizeButton.test.tsx:1221-1243` clicks the publish trigger while `error` is present — under §5 the user path is Close/Escape/backdrop → idle → retry. jsdom does not enforce `inert` pointer-blocking, so a programmatic click keeps working, but the test is updated to route through dismiss-then-retry so it exercises the real path (not a click against an inert background).
11. **compound: review modal open** (component, §7a): open `Step3ReviewModal` while a run is in flight, drive the run to `cas_per_row`; assert BOTH dialogs are in the DOM, focus is inside the blocker panel, Escape does NOT close the review modal (its testid still present) and (for `error`) DOES dismiss the blocker, and body `overflow` is still `hidden` after the blocker unmounts. Failure mode caught: dual-focus-trap fight, Escape closing the wrong surface, scroll-lock leak.
12. **invariant-5 negative rescope** (test-refactor, §9.2): rescope every `container.textContent` assertion about the moved panels to `getByTestId('wizard-finalize-<state>').textContent`. Verify each rescoped negative still FAILS if a raw code were injected (assert the negative is non-vacuous by also asserting the panel textContent is non-empty). Failure mode caught: a portal silently voiding invariant-5 coverage.
13. **dismiss-during-pending-resolver race** (component, §4.3): enter `cas_per_row` (non-rescannable); make the resolver's `/api/admin/onboarding/resolve-blocker` fetch a DEFERRED promise; click the row's resolve action (fetch now pending); click **Back** (→ idle, modal unmounts); THEN resolve the deferred fetch as `{ok:true}`. Assert NO `/api/admin/onboarding/finalize` POST fires afterward (spy on `fetch`) and `run.state` stays `idle`. Failure mode caught: a late resolver success restarting publish after the operator dismissed.

---

## 11. Meta-test inventory

- **None created.** No new Supabase call boundary, admin-alert code, advisory-lock surface, RPC-gated table, tile sentinel, or inline-email path. This is a pure client-presentation refactor.
- **Extended:** the existing `Step3TransitionAudit.test.tsx` gains the modal's enter/exit rows; `FinalizeButton.test.tsx` focus assertions updated (§9). No `pg_advisory*` touched → no advisory-lock topology section.

---

## 12. Invariant compliance (AGENTS.md)

- **1 (TDD):** every task failing-test-first (§10).
- **2 (advisory lock):** untouched — no mutation path changes.
- **5 (no raw error codes):** copy still routes through `lookupDougFacing` / `messageFor`; `HelpAffordance` unchanged. The modal renders the SAME Doug-facing strings.
- **6 (commit per task):** conventional commits, scope `crew-page`/`admin`/`wizard` as appropriate.
- **8 (impeccable dual-gate):** UI surface (`components/**`, possibly `app/globals.css`) → `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`.
- **9 (Supabase call-boundary):** no Supabase calls added.
- **10 (mutation-surface telemetry):** no mutation surface added (presentational only).

---

## 13. Out of scope / do-not-relitigate

- Keeping `complete` inline is deliberate (owner decision: "all blockers + error → modal"; complete is a success announcement + refresh, not a blocker) — do not relitigate into the modal.
- Portaling to `document.body` (vs. `Step3ReviewModal`/`ReportModal` which render fixed-inline) is deliberate and REQUIRED: `FinalizeStatusRegion` lives in the `WizardFooter`'s own `z-40` body portal, so a footer-nested modal would be trapped below the per-card `Step3ReviewModal` (`z-50`) in the §7a compound. Only a body portal paints above both (§4.2). Do not "simplify" by removing the portal — the §8 stack assertion + §10.11 compound test pin it. (It is NOT justified by a PageTransition transform — the footer is already body-level; the reason is the z-context trap.)
- The D5 soft-confirm remains an anchored popover, NOT this modal — separate surface, separate owner decision (`Step3ReviewWithFinalize.tsx:162`).
- No exit animation is intentional (matches every existing modal in the repo).

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
- Canonical modal shell precedent: `Step3ReviewModal.tsx:557-587` (`role="dialog" aria-modal aria-labelledby`, `fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6`, scrim button `bg-overlay-scrim`, `useDialogFocus(panelRef, closeRef)`, document-Escape, body-scroll-lock) and `ReportModal.tsx:449-467` (same shell + `motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)] motion-reduce:animate-none`).
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

**Mount strategy:** `createPortal(<dialog/>, document.body)` gated on `useHasMounted()` (returns `null` until mounted → SSR-safe, no hydration mismatch). Portaling is **required** here (not merely defensive): the production host is inside `<PageTransition>`, whose settled `transform` opens a stacking context that confines `position: fixed` descendants (`WizardFooter.tsx:12-23`). A real-browser Playwright assertion (§8) proves the panel is viewport-pinned, not confined.

### 4.3 `useFinalizeRun` change

Add `dismiss: () => setState({ kind: "idle" })` to the returned object. This is the ONLY state-machine addition. It is called by the modal's dismiss/back controls (§5). Resetting to `idle` returns the footer to its calm hint and re-enables the Publish trigger for a retry. It never fires while `state.kind === 'running'` (the modal is not mounted then).

Row-resolution affordances continue to call `run.runLoop()` (`BlockedRowResolver.onResolved`) — this transitions `state` to `running`, the modal unmounts (state no longer in the blocker set), and `Step3CompactTracking` takes over in the footer center exactly as today.

---

## 5. Dismiss matrix (guard conditions per state)

| State | Blocking? | Backdrop click | Escape key | Explicit control | On dismiss |
| --- | --- | --- | --- | --- | --- |
| `error` | no | dismisses → `run.dismiss()` | dismisses → `run.dismiss()` | **Close** (X) button, `aria-label="Close"` → `run.dismiss()` | state → `idle`; footer shows calm hint; trigger re-enabled for retry |
| `race_row` | yes | **inert** (no dismiss) | **inert** (no dismiss) | **Back** button (visible, labelled) → `run.dismiss()`; per-row re-apply `<Link>` navigates away | Back → `idle`; re-apply link → route change |
| `cas_per_row` | yes | **inert** (no dismiss) | **inert** (no dismiss) | **Back** button → `run.dismiss()`; per-row `RescanSheetButton` / `BlockedRowResolver` → `run.runLoop()` on resolve | Back → `idle`; resolve → `running` (modal unmounts) |

- **Blocking states are action-only**: no backdrop/Escape dismiss, but a visible **Back** control always exists so the operator is never trapped (keyboard-complete exit). This satisfies the owner's "action-only, otherwise Back" instruction.
- **`error` is dismissible**: backdrop, Escape, and an explicit Close all reset to idle.
- **Guard — empty failure list:** `race_row`/`cas_per_row` are only ever entered with ≥1 failure (`FinalizeButton.tsx:368-374,422-425`); the modal still renders its heading + Back if the list were somehow empty (defensive: `.map` over `[]` yields just heading + Back, never a blank dialog).
- **Guard — null `display_name`:** falls back to `drive_file_id` (unchanged, `FinalizeButton.tsx:600,631`).
- **Guard — null `state.code` (error):** `HelpAffordance` already tolerates null; copy falls back to `GENERIC_ERROR` (unchanged).

---

## 6. A11y / focus

- `role="dialog"`, `aria-modal="true"`. Accessible name: the primary text of each state is promoted to an `<h2 id={titleId}>` and the dialog carries `aria-labelledby={titleId}`. Concretely: race_row's "Some sheets need another look…" and cas_per_row's "Some sheets are blocking…" (today `<p className="font-semibold">`, `FinalizeButton.tsx:594,627`) become the `<h2>`; the `error` state (today `renderEmphasis(state.copy)` in a `<p>`, no heading, `FinalizeButton.tsx:668`) gets its copy `<p>` given the `titleId` so the Doug-facing sentence IS the accessible name (an `<h2>` wrapper is not required — `aria-labelledby` may point at any element). Every state therefore has exactly one labelling element; no state ships an unnamed dialog.
- `useDialogFocus(panelRef, dismissRef)` where `dismissRef` is the **Close (error) or Back (blocking)** button — initial focus lands on the exit control, Tab is trapped, focus restores to the previously-focused element on unmount (`lib/a11y/dialogFocus.ts` contract).
- Body scroll lock while mounted (`document.body.style.overflow = 'hidden'`, restored on unmount) — matches `Step3ReviewModal.tsx:288-294`.
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

- ¹ **ENTERS:** scrim fades in (`motion-safe:animate-[scrim-fade_…]`/opacity transition), panel rises on mobile / pops on desktop (`motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)]`). `motion-reduce:animate-none` on BOTH scrim and panel → instant, at-rest (reduced-motion).
- ² **n/a²:** the machine never transitions a terminal `complete`/idle back into `running` without a fresh user click that first re-enters `running` from `idle`; `idle→running` and `running→idle(dismiss)` are the only crossings and are covered.
- ³ **EXITS:** instant unmount, NO exit animation — matches every modal in the repo (`Step3ReviewModal`, `ReportModal`, D5 soft-confirm all lack exit keyframes). React removes the portal node; any in-flight enter animation is discarded (the only compound-animation case, and unmount-wins needs no coordination).
- ⁴ **n/a⁴:** one terminal per finalize run — the machine never moves blocker→blocker or blocker→error/complete without passing through `running` (resolve) or `idle` (dismiss) first. Not reachable.

### 7a. Compound: review modal open while a blocker fires

`Step3ReviewModal` (a separate `aria-modal` dialog opened per sheet card) is reachable WHILE a publish run is in flight (`tests/components/admin/wizard/step3Page.transitions.test.tsx:183-209`, T8-b). If finalize then reaches a blocker/error terminal, `FinalizeBlockerModal` mounts on top of the open review modal. Defined behavior (no suppression — the two are independent surfaces owned by different components):

- **Z-order:** the blocker modal portals to `document.body` and therefore appends AFTER the review modal in DOM order; both use `z-50`, so equal z-index + later-in-DOM ⇒ the blocker paints on top. Its own `bg-overlay-scrim` layers over the review modal's scrim (acceptable — the topmost actionable surface wins).
- **Focus:** `useDialogFocus` moves focus INTO the blocker panel on mount; the review modal's Tab-trap listener is bound to the review modal's own container, and focus now lives in the blocker's separate portal subtree, so the review trap does not fire while the blocker owns focus. On blocker unmount, `useDialogFocus` restores focus to the element focused before the blocker mounted (which is inside the still-open review modal) — the review modal regains focus ownership cleanly.
- **Escape:** the blocker's Escape handler always calls `event.stopPropagation()` (and `preventDefault()`), so `Step3ReviewModal`'s document-level Escape listener (`Step3ReviewModal.tsx:299-308`) does NOT also fire and close the review modal underneath. For the `error` state Escape additionally calls `dismiss`; for blocking states it is inert but still stops propagation.
- **Scroll lock:** each modal saves `document.body.style.overflow` at its own mount and restores it at unmount (`Step3ReviewModal.tsx:288-294` pattern). Blocker mounts second: it captures `'hidden'` (set by the review modal) and restores `'hidden'` on unmount; the review modal later restores the true original. No lock leak.
- This compound is exercised by a component test (§10.11).

---

## 8. Dimensional invariants + real-browser assertion

The modal panel is a `flex flex-col` inside `fixed inset-0 flex items-end justify-center sm:items-center`. Fixed-dimension parent → children relationships:

| Parent | Child | Guarantee |
| --- | --- | --- |
| `fixed inset-0` overlay | panel | `items-end` (mobile bottom sheet) / `sm:items-center` — panel sized by content, capped `max-h-[85vh]`, `w-full sm:max-w-md` |
| panel (`flex flex-col`) | header / body / footer | `items-stretch` stated explicitly (Tailwind v4 in this repo does NOT default `.flex` to `align-items:stretch` — DESIGN.md §7) |

**Real-browser Playwright task (mandatory, jsdom insufficient):** render the modal in a `race_row`/`cas_per_row` state under a `PageTransition`-transformed ancestor; assert via `getBoundingClientRect()` that the portaled panel's rect is within the viewport (top ≥ 0, bottom ≤ innerHeight + tolerance) and NOT offset by the transformed ancestor's scroll — i.e. `fixed` positioning is honored. This is the proof that portaling defeats the transform confinement (§4.2).

---

## 9. Testids preserved (regression contract)

Every existing testid stays on the same content, now inside the dialog: `wizard-finalize-race-row`, `wizard-finalize-cas-per-row`, `wizard-finalize-error`, `wizard-finalize-reapply-<dfid>`, `wizard-finalize-publish-complete` (inline, unchanged). RTL `render` queries `document.body` as `baseElement`, so `getByTestId` resolves portaled content — existing `getByTestId`/`findByTestId` assertions keep passing.

**New testids:** `wizard-finalize-blocker-modal` (dialog container), `wizard-finalize-blocker-backdrop` (scrim), `wizard-finalize-blocker-dismiss` (Close/Back control).

**Intentional test breakages (two classes — both are strict improvements, enumerated so the plan tasks them, not silent):**

1. **Focus assertions.** `FinalizeButton.test.tsx:1298` asserts `document.activeElement === getByTestId('wizard-finalize-error')`. With the dialog, initial focus lands on the dismiss control (`useDialogFocus`), so this becomes `document.activeElement === getByTestId('wizard-finalize-blocker-dismiss')`. Any analogous race_row/cas_per_row focus assertion updates the same way.

2. **Invariant-5 `container.textContent` negatives (the portal consequence).** Because the modal portals to `document.body`, it leaves the RTL `render` `container` subtree. Assertions that read `container.textContent` (positive OR negative) about the moved panels must be **rescoped to the panel's own element** (`getByTestId('wizard-finalize-<state>').textContent`), NOT to `baseElement`. This KEEPS the teeth: a raw-§12.4-code negative (`…not.toContain('STAGED_PARSE_RESULT_CORRUPT')`) still inspects the actual rendered modal content, and is now MORE precise than the container scope (which also swept the trigger). Rescoping to `baseElement`/`document.body` would be acceptable but weaker; the panel element is the anti-tautology-correct scope. Affected `container.textContent` sites (verified): `FinalizeButton.test.tsx:478, 570-571` and the analogous negatives at `607-620, 649-662, 1109-1118, 1126-1140, 1153-1167, 1211-1218`. `getByTestId(...).textContent` positive assertions (e.g. `:474, 490, 518`) already query `baseElement` and keep passing unchanged. This rescope is a dedicated TDD task (§10.12).

---

## 10. Test plan (TDD tasks derive from these; anti-tautology noted)

1. **`dismiss()` reset** (unit, `useFinalizeRun`): drive to `error`, call `run.dismiss()`, assert `state.kind === 'idle'`. Failure mode caught: a dismiss that no-ops or leaves a stale terminal state.
2. **error dismissible** (component): reach `error`; Escape → modal gone + trigger enabled; backdrop click → gone; Close button → gone. Failure mode: error trapping the operator.
3. **blocking action-only** (component): reach `cas_per_row`; Escape → modal STILL present; backdrop click → STILL present; Back button → gone (idle). Failure mode: a blocker dismissable by mis-click, losing the recovery surface.
4. **resolve path intact** (component): `cas_per_row` → click `BlockedRowResolver` resolve → `runLoop` fires → modal unmounts, tracking mounts. Assert against the `fetch`/`runLoop` spy, not the DOM container (anti-tautology). Failure mode: modal swallowing the resolve action.
5. **dialog semantics** (component): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` resolves to the heading text; body `overflow:hidden` while open, restored on close. Failure mode: non-modal dialog / scroll-lock leak.
6. **focus** (component): on open, `document.activeElement === dismiss control`; on close, focus restored (or body). Update `FinalizeButton.test.tsx:1298` et al.
7. **layout-dimensions** (Playwright, real browser): §8 viewport-pinned assertion under a transformed ancestor. Derive expected bounds from `window.innerHeight`, never hardcode.
8. **transition-audit** (component): assert the panel carries `motion-safe:animate-[sheet-rise…]` + `motion-reduce:animate-none`; assert the SCRIM element carries its fade animation class + `motion-reduce:animate-none`; assert no exit animation (instant unmount — the panel has no exit keyframe class). Extends `Step3TransitionAudit.test.tsx`.
9. **`complete` stays inline** (component): reach `complete`; assert `wizard-finalize-publish-complete` is NOT inside `wizard-finalize-blocker-modal` and no `role="dialog"` from this component is mounted.
10. **testid regression**: existing race_row/cas_per_row/error/reapply testid + copy assertions (`FinalizeButton.test.tsx` §Phase B/D lists) still pass (content now queried via `getByTestId`, which resolves the portal).
11. **compound: review modal open** (component, §7a): open `Step3ReviewModal` while a run is in flight, drive the run to `cas_per_row`; assert BOTH dialogs are in the DOM, focus is inside the blocker panel, Escape does NOT close the review modal (its testid still present) and (for `error`) DOES dismiss the blocker, and body `overflow` is still `hidden` after the blocker unmounts. Failure mode caught: dual-focus-trap fight, Escape closing the wrong surface, scroll-lock leak.
12. **invariant-5 negative rescope** (test-refactor, §9.2): rescope every `container.textContent` assertion about the moved panels to `getByTestId('wizard-finalize-<state>').textContent`. Verify each rescoped negative still FAILS if a raw code were injected (assert the negative is non-vacuous by also asserting the panel textContent is non-empty). Failure mode caught: a portal silently voiding invariant-5 coverage.

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
- Portaling to `document.body` (vs. `Step3ReviewModal`/`ReportModal` which don't portal) is deliberate: those modals mount from surfaces that may not sit under the wizard's `PageTransition` transform; this one provably does (§4.2). Do not "simplify" by removing the portal — the Playwright assertion (§8) pins it.
- The D5 soft-confirm remains an anchored popover, NOT this modal — separate surface, separate owner decision (`Step3ReviewWithFinalize.tsx:162`).
- No exit animation is intentional (matches every existing modal in the repo).

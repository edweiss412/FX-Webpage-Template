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
- Recovery-affordance component props (unchanged, cited for the modal body):
  - `BlockedRowResolver` — `{ driveFileId, wizardSessionId, code, displayName?, rebuildExhausted?, onResolved }` (`FinalizeButton.tsx:643-652`).
  - `RescanSheetButton` — `{ driveFileId, wizardSessionId, resultPlacement?, disabled? }` (`FinalizeButton.tsx:638-641`).
  - `HelpAffordance` — `{ code }`.
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

States that can mount/unmount the modal: `{running, race_row, cas_per_row, error, idle, complete}`. Modal is present iff state ∈ {race_row, cas_per_row, error}.

| Transition | Treatment |
| --- | --- |
| running → race_row / cas_per_row / error | modal **enters**: scrim fades in, panel rises (`motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)]`; desktop centered variant may pop — tuned under impeccable). Reduced-motion: `motion-reduce:animate-none` — instant, at-rest. |
| race_row/cas_per_row/error → idle (dismiss/Back) | modal **unmounts**: instant removal (no exit animation — matches `Step3ReviewModal` which has no exit keyframe; the D5/Report modals are instant-exit too). |
| cas_per_row → running (resolve → runLoop) | modal unmounts instant; `Step3CompactTracking` mounts in footer center (unchanged). |
| any blocker/error → complete | not reachable directly (complete only follows `running` success); N/A. |
| idle ↔ idle, running progress updates | no modal; unchanged. |
| error → error (copy change) | not reachable (one terminal per run). |

Compound: dismissing `error` while the scrim is still mid-fade-in — unmount wins (React removes the node; the running animation is discarded). No compound animation state to manage (no exit transition).

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

**Focus-assertion updates (the only test breakages, intentional):** `FinalizeButton.test.tsx:1298` asserts `document.activeElement === getByTestId('wizard-finalize-error')`. With the dialog, initial focus lands on the dismiss control (`useDialogFocus`), so this becomes `document.activeElement === getByTestId('wizard-finalize-blocker-dismiss')`. Any analogous race_row/cas_per_row focus assertion updates the same way.

---

## 10. Test plan (TDD tasks derive from these; anti-tautology noted)

1. **`dismiss()` reset** (unit, `useFinalizeRun`): drive to `error`, call `run.dismiss()`, assert `state.kind === 'idle'`. Failure mode caught: a dismiss that no-ops or leaves a stale terminal state.
2. **error dismissible** (component): reach `error`; Escape → modal gone + trigger enabled; backdrop click → gone; Close button → gone. Failure mode: error trapping the operator.
3. **blocking action-only** (component): reach `cas_per_row`; Escape → modal STILL present; backdrop click → STILL present; Back button → gone (idle). Failure mode: a blocker dismissable by mis-click, losing the recovery surface.
4. **resolve path intact** (component): `cas_per_row` → click `BlockedRowResolver` resolve → `runLoop` fires → modal unmounts, tracking mounts. Assert against the `fetch`/`runLoop` spy, not the DOM container (anti-tautology). Failure mode: modal swallowing the resolve action.
5. **dialog semantics** (component): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` resolves to the heading text; body `overflow:hidden` while open, restored on close. Failure mode: non-modal dialog / scroll-lock leak.
6. **focus** (component): on open, `document.activeElement === dismiss control`; on close, focus restored (or body). Update `FinalizeButton.test.tsx:1298` et al.
7. **layout-dimensions** (Playwright, real browser): §8 viewport-pinned assertion under a transformed ancestor. Derive expected bounds from `window.innerHeight`, never hardcode.
8. **transition-audit** (component): assert the panel carries `motion-safe:animate-[sheet-rise…]` + `motion-reduce:animate-none`; no exit animation expected (instant unmount).
9. **`complete` stays inline** (component): reach `complete`; assert `wizard-finalize-publish-complete` is NOT inside `wizard-finalize-blocker-modal` and no dialog is mounted.
10. **testid regression**: existing race_row/cas_per_row/error/reapply testid + copy assertions (`FinalizeButton.test.tsx` §Phase B/D lists) still pass unchanged.

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
</content>
</invoke>

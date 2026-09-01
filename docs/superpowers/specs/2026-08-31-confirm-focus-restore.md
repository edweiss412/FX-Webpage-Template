# Confirm-path focus restore for two-tap destructive controls

**Row:** `BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS` (BACKLOG.md, product-facing)
**Branch:** `fix/confirm-focus-restore` · **Filed from:** the `SHARELINK-CUE-FOCUS-OBSCURED-1` probe on `fix/sharelink-cue-focus` (PR #956, merged `e306dc9e3`)

## 1. What is wrong

Confirming a destructive two-tap action drops `document.activeElement` to `<body>`. The operator is returned to the top of the document with no focus anywhere in the surface they were working in, so a keyboard or switch user has to tab back in from the start of the page. The action itself is announced through the admin layout's live region, so the outcome is not silent; the focus position is.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **`ArchiveShowButton` is OUT OF SCOPE and must not be touched.** It was measured and REFUTED, not assumed correct. | §2.3, and the mechanism at `components/admin/showpage/ShareHub.tsx:648-668` |
| The class is **three** controls, not the five the filing named. Five filed → one unrendered → four reachable → one refuted. | §2.1, §2.3 |
| `ResetPickerEpochButton` was **deleted**, not repaired. It was imported by no source file. | commit `fa5d3fffb`; bl-orch ruling 2026-08-31 |
| The repair must handle **two different blur timings**, not one. | §2.2 |
| Evidence is measurement, not derivation. A `restoreFocusRef`-writer derivation predicted four defects; the probe overturned one. | §2 |
| `resetPickerEpoch` (the Server Action) stays. Only its dead wrapper went. | `app/admin/show/[slug]/PickerResetControl.tsx` still calls it |

## 2. Evidence

Measured in a real browser at 390x560, mobile-safari, by `tests/e2e/confirm-focus-probe.spec.ts`. Rotate was measured separately on the merged arc and is recorded in `docs/superpowers/specs/ci/probes/2026-08-31-sharelink-cue-focus-probe.md`.

### 2.1 The reachable class

The filing derived the class from the writers of one flag: `grep -rn "restoreFocusRef.current = " app/ components/` returns five two-tap destructive controls, and no confirm or submit handler writes the flag anywhere in the repo. Two corrections came from measurement rather than from that derivation:

- The reset-picker-epoch wrapper under `app/admin/show/[slug]/` was **imported by no source file** — it rendered on no route, its only e2e reference sat inside a `test.skip`, and its jsdom test mounted it directly. Deleted in `fa5d3fffb`.
- `ArchiveShowButton` is **refuted** (§2.3).

### 2.2 Confirmed — three controls, two timings

| control | after confirm settles | cancel-path control | blur timing |
| --- | --- | --- | --- |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx` | `BODY` | restores to trigger | synchronous |
| `app/admin/show/[slug]/PickerResetControl.tsx` | `BODY` | restores to trigger, fully visible | synchronous |
| `app/admin/settings/admins/RevokeRowButton.tsx` | `BODY` | restores to trigger, fully visible | one tick later |

**The two timings are the reason a single repair shape is not obviously enough.**

- *Synchronous.* The confirm handler sets `ui = "resolving"` and the confirm button carries `disabled={isResolving}`, so the button the operator just activated is disabled in the same commit and the browser blurs it immediately. Rotate names that handler `onConfirmClick` (`app/admin/show/[slug]/RotateShareTokenButton.tsx:179-182`, button at `app/admin/show/[slug]/RotateShareTokenButton.tsx:370-371`); picker reset names it `onConfirm` (`app/admin/show/[slug]/PickerResetControl.tsx:160-163`, button at `app/admin/show/[slug]/PickerResetControl.tsx:247`). The handler names differ, the shape does not.
- *One tick later.* `RevokeRowButton` disables on `isPending` instead (`app/admin/settings/admins/RevokeRowButton.tsx:390`), because it is a form submitter and the synchronous disable cancelled the native submit outright — its own comment at `app/admin/settings/admins/RevokeRowButton.tsx:381-389` records that bug. The probe caught focus still on `admin-allowlist-revoke-confirm-button` one step after the click, then on `BODY` once settled. **A repair must not re-introduce the submit cancellation that fix exists to prevent.**

Why the restore never fires: it is gated on `restoreFocusRef`, written only inside `closeConfirm()` — `RotateShareTokenButton.tsx:123-132`, `PickerResetControl.tsx:81-86`, `RevokeRowButton.tsx:112-118` — whose callers are Cancel and the arm-expiry timer. The consuming effect (`RotateShareTokenButton.tsx:145-150` and siblings) therefore sees `false` on every confirm.

### 2.3 Refuted — `ArchiveShowButton`

After its confirm settles, focus is on `share-hub-kebab`: `insideRoot: true`, a real focusable control, not `<body>`.

**The mechanism is a shipped repair, not luck and not an adjacent-focusable fallthrough.** `components/admin/showpage/ShareHub.tsx:648-668` runs a `useLayoutEffect` on the lifecycle axis that closes the popover and calls `openerRef.current?.focus()` (`components/admin/showpage/ShareHub.tsx:667`); `openerRef` holds whichever trigger opened the hub (`components/admin/showpage/ShareHub.tsx:619`), which is the kebab in the probe's path. Its comment states the defect and the fix in the codebase's own words: the archive axis "flips from a control INSIDE it", so when the operator confirms, the action commits and `archived` flips on the refresh, "the panel disappears out from under their focus. Without this, focus falls to `<body>`" and a keyboard or screen-reader user has to tab from the top of the modal, which it attributes to an impeccable audit P1.

**Consequence for the design.** A container-level rescue already solved this class once, for one control, at the surface that owns the unmount. That is a live design precedent the repair should weigh against a per-control restore — not a reason to widen the container hook, which today keys on `published`/`archived` and knows nothing about rotate, picker-reset or revoke.

## 3. Requirements

- **R1.** After a confirm resolves, focus lands on a control inside the surface the operator was working in, for each of the three controls in §2.2.
- **R2.** The Cancel path keeps its current behavior exactly. It already restores to the trigger and is the control arm of every measurement.
- **R3.** `RevokeRowButton`'s submit must still fire. The repair may not disable the submitter synchronously in its own `onClick` (`app/admin/settings/admins/RevokeRowButton.tsx:381-389`).
- **R4.** No change to `ArchiveShowButton` or to `ShareHub`'s lifecycle effect.
- **R5.** The restore target must exist at the moment it is focused, in every arm the control renders.

## 4. Guard conditions

| condition | required behavior |
| --- | --- |
| Confirm resolves OK, trigger re-renders | focus the trigger |
| Confirm REFUSED (`result.ok === false`) | focus the trigger; the refused banner is announced separately |
| Action throws (network death) | same as refused — the catch path already settles through the refused banner (`RotateShareTokenButton.tsx:196-210`, the catch that settles through the refused banner) |
| Component unmounts before the restore runs | no focus call; a ref to a detached node is a no-op, and this must not throw |
| Arm-expiry timer fires during resolving | unchanged; `closeConfirm()` already guards `prev === "confirm"` only |
| Cancel pressed | unchanged (R2) |

## 5. Transition inventory

States: `idle`, `confirm`, `resolving`. Pairs:

| transition | focus treatment |
| --- | --- |
| idle → confirm | Cancel is focused (C3, `app/admin/show/[slug]/RotateShareTokenButton.tsx:134-137`) — unchanged |
| confirm → idle (Cancel / arm expiry) | trigger refocused via `restoreFocusRef` — unchanged |
| confirm → resolving | **in scope**: focus must not be stranded when the activated control is disabled |
| resolving → idle (ok / refused / throw) | **in scope**: trigger refocused |
| idle → resolving | unreachable — `resolving` is only entered from `confirm` |
| Compound: arm-expiry fires while resolving | `setUi` guard makes it a no-op; no focus movement |

## 5.1 Dimensional invariants

N/A — this change moves focus, not layout. It adds no element, changes no
fixed-dimension parent, and alters no flex or grid relationship. The only
measurements the probe takes are focus rects read against a root, and they are
diagnostic output, not a rendered contract.

## 6. Documented limits

- The probe measures `mobile-safari` at one viewport. WebKit cannot tab between buttons without macOS Full Keyboard Access, so keyboard-journey coverage for the confirm path is Chromium-only; the shipped e2e asserts the focus outcome, not the tab route.
- `ArchiveShowButton`'s correctness rests on a container-level effect keyed on `published`/`archived`. A future control that unmounts its own surface on some other axis would not be covered by it, and this spec does not widen it.

## 7. Out of scope

Widening `ShareHub`'s lifecycle effect; any change to the announce channel; the orphan-detector gap recorded at `tests/components/_orphanedComponents.ts` (documented limit, not a row).

# Confirm-path focus restore for two-tap destructive controls

**Row:** `BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS` (BACKLOG.md, product-facing)
**Branch:** `fix/confirm-focus-restore` · **Filed from:** the `SHARELINK-CUE-FOCUS-OBSCURED-1` probe on `fix/sharelink-cue-focus` (PR #956, merged `e306dc9e3`)

## 1. What is wrong

Confirming a destructive two-tap action drops `document.activeElement` to `<body>`. The operator is returned to the top of the document with no focus anywhere in the surface they were working in, so a keyboard or switch user has to tab back in from the start of the page. Each control announces its outcome, so the outcome is not silent; the focus position is. The CHANNEL differs per control and this spec changes none of them: rotate calls `announce(...)` into the admin layout's region, picker reset owns an `sr-only role="status"` region inside the component (`app/admin/show/[slug]/PickerResetControl.tsx:193`), and revoke renders one hoisted string into both its visible card and its announcement (`app/admin/settings/admins/RevokeRowButton.tsx:56-63`).

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **`ArchiveShowButton` is OUT OF SCOPE and must not be touched.** It was measured and REFUTED, not assumed correct. | §2.3, and the mechanism at `components/admin/showpage/ShareHub.tsx:648-668` |
| The class is **three** controls, not the five the filing named. Five filed → one unrendered → four reachable → one refuted. | §2.1, §2.3 |
| `ResetPickerEpochButton` was **deleted**, not repaired. It was imported by no source file. | commit `fa5d3fffb`; bl-orch ruling 2026-08-31 |
| The repair must handle **two different blur timings**, not one. | §2.2 |
| **Revoke-success focus target is the section heading**, `tabIndex={-1}`, scroll nearest-only, announcement NOT merged into it. | bl-orch ruling 2026-08-31, recorded in §2.4 |
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

## 2.4 The three controls do not share one shape

Round 1 established that the spec's first draft treated them as one. They are
not, and every requirement below is stated per control.

| | rotate | picker reset | revoke admin |
| --- | --- | --- | --- |
| states | `idle \| confirm \| resolving` (`app/admin/show/[slug]/RotateShareTokenButton.tsx:51`) | `idle \| confirm \| resolving` (`app/admin/show/[slug]/PickerResetControl.tsx:31`) | **four**: `idle \| confirm \| resolving \| couldnt_confirm` (`app/admin/settings/admins/RevokeRowButton.tsx:72`) |
| success/failure model | `result.ok` boolean | `outcome.kind` union (`app/admin/show/[slug]/PickerResetControl.tsx:123`) | `result.kind` union (`app/admin/settings/admins/RevokeRowButton.tsx:158`) |
| thrown action | caught locally, settles through the refused banner (`app/admin/show/[slug]/RotateShareTokenButton.tsx:196-210`) | caught locally (`app/admin/show/[slug]/PickerResetControl.tsx:177`) | **not** caught locally for unknown/gate failures — propagates to the route error boundary |
| does the trigger survive a SUCCESS? | yes | yes | **no** — the revoked row leaves the active list |
| extra machinery | — | — | a 12s watchdog (`app/admin/settings/admins/RevokeRowButton.tsx:52`) flips `resolving → couldnt_confirm` (`app/admin/settings/admins/RevokeRowButton.tsx:189`), and `effectiveUi` (`app/admin/settings/admins/RevokeRowButton.tsx:162`) can render the idle branch while `ui` is still `resolving` |

**The revoke-success case has no trigger to return to.** Round 1 found this
first: the revoked row unmounts, so "focus the trigger" named an element that no
longer exists. **RATIFIED 2026-08-31 (bl-orch): the section heading.**

`#admin-settings-admins-heading` (`components/admin/settings/AdministratorsSection.tsx:64` and `components/admin/settings/AdministratorsSection.tsx:86`) takes `tabIndex={-1}`
and is focused programmatically. The reasons are recorded so they are not
re-derived:

- It is the only candidate that exists **unconditionally** after the unmount.
  Every next-row or adjacent-control scheme dies on the last-row case, and the
  last-admin-revoked case is therefore covered by this same target rather than
  needing one of its own.
- It reorients a screen-reader user by naming where they are, which a focusable
  list container does not.
- It matches the attention-anchor precedent already in the codebase
  (`tabIndex={-1}` as a programmatic focus target).

Two constraints ride with the ruling. Scroll movement on that focus is
**nearest-only**. And the revoke OUTCOME announcement **stays on the announce
channel**: heading focus gives position, the announcement gives result, and the
two are not merged.

## 3. Requirements

- **R1 (rotate, picker reset).** When the confirm resolves and the trigger
  re-renders, focus returns to the trigger.
- **R2 (revoke admin, success).** The row is gone, so focus moves to the section
  heading with `tabIndex={-1}`, scrolled nearest-only. Never `<body>`. The
  last-admin-revoked case uses this same target. The outcome announcement stays
  on the announce channel and is not merged into the focus move.
- **R3 (revoke admin, non-success).** On a refused `result.kind`, on
  `couldnt_confirm`, and on any branch where `effectiveUi` renders idle while
  `ui` is still `resolving`, focus goes to the control that branch renders, named here rather than deferred: the REVOKE TRIGGER for a refused result and for the `effectiveUi`-renders-idle case (both re-render the idle row), and the REFRESH control for `couldnt_confirm`.
- **R4.** The Cancel path is unchanged on all three.
- **R5.** `RevokeRowButton`'s submit must still fire: no synchronous disable of
  the submitter in its own `onClick` (`app/admin/settings/admins/RevokeRowButton.tsx:381-389`).
- **R6.** No change to `ArchiveShowButton` or to ShareHub's lifecycle effect.
- **R7.** Requirements are proved by DIFFERENT evidence, and this spec says which
  by which rather than claiming one assertion covers all:
  - R1, R2 and R3 identity — an assertion on the focused element, against a
    target captured from the DOM BEFORE the action
    (`tests/e2e/helpers/confirmFocusProbe.ts`, decided without a browser by
    `tests/e2e/helpers/confirmFocusProbe.decide.test.ts`).
  - R2's `tabIndex={-1}` and nearest-only scroll — a rendered-attribute assertion
    plus a scroll-position assertion; focus identity cannot show either.
  - R2's announcement-channel separation — an assertion that the announcement
    region's content is unchanged by the focus move.
  - R4 (Cancel unchanged) — the exact trigger, not merely non-`BODY`.
  - R5 (submit still fires) — evidence the action ran, not a focus reading.
  - R6 (Archive and ShareHub untouched) — structural: those files absent from the
    diff.
  - The in-flight contract in §5 — a reading taken at the `confirm → resolving`
    moment, which the settled reading cannot stand in for.

## 4. Guard conditions, per control

| control | condition | required behavior |
| --- | --- | --- |
| rotate | `result.ok === true` | focus the trigger |
| rotate | `result.ok === false`, or the local catch sets the refused result | focus the trigger |
| picker reset | `outcome.kind === "ok"` | focus the trigger |
| picker reset | `outcome.kind !== "ok"`, or the local catch fires | focus the trigger |
| revoke | `result.kind === "ok"` | focus the surviving target (R2); the row is unmounted |
| revoke | `result.kind !== "ok"` (refused) | focus the control the refused branch renders |
| revoke | watchdog fires, `resolving → couldnt_confirm` | focus the Refresh control that branch renders (`app/admin/settings/admins/RevokeRowButton.tsx:253-293`) |
| revoke | a late result arrives while `couldnt_confirm` is sticky | no focus movement; `couldnt_confirm` outranks (`app/admin/settings/admins/RevokeRowButton.tsx:159-162`) |
| all | component unmounts before the restore runs | no focus call; a ref to a detached node is a no-op and must not throw |
| all | Cancel or arm-expiry | unchanged (R4) |

## 5. Transition inventory

Nothing here animates: every transition is **instant — no animation needed**, so
the column that carries meaning is focus. Pairs are UNORDERED, with both
directions named in the row, because a directional list makes the count
disagree with the rule.

**rotate and picker reset** — 3 states, so 3 unordered pairs:

| pair | animation | focus |
| --- | --- | --- |
| idle ↔ confirm | instant | → Cancel focused (C3). ← trigger refocused. Both unchanged |
| confirm ↔ resolving | instant | → **in scope**: the activated button is disabled in the same commit, so focus must move to the trigger AT THAT MOMENT, not merely by the time the action resolves. ← unreachable |
| idle ↔ resolving | instant | → unreachable (`resolving` is only entered from `confirm`). ← **in scope**: trigger refocused (R1) |

**revoke admin** — 4 states, so 6 unordered pairs:

| pair | animation | focus |
| --- | --- | --- |
| idle ↔ confirm | instant | → Cancel focused. ← trigger refocused. Both unchanged |
| confirm ↔ resolving | instant | → **in scope**: the submitter is disabled one tick later, on `isPending`; focus must move to the trigger when that disable lands. ← unreachable |
| confirm ↔ couldnt_confirm | instant | both directions unreachable: `couldnt_confirm` is entered only from `resolving` (`app/admin/settings/admins/RevokeRowButton.tsx:189`), and left only by a full refresh |
| idle ↔ resolving | instant | → unreachable. ← **in scope, SUCCESS**: the row unmounts, so focus goes to the heading (R2) |
| idle ↔ couldnt_confirm | instant | → unreachable. ← out of scope: a full refresh replaces the surface |
| resolving ↔ couldnt_confirm | instant | → **in scope**: the 12s watchdog fires and the Refresh control is what that branch renders, so focus goes there. ← unreachable |

Compound transitions:

| compound | behavior |
| --- | --- |
| arm-expiry fires while resolving | `setUi` guard makes it a no-op; no focus movement |
| a late **non-OK** result arrives while `couldnt_confirm` is sticky | `couldnt_confirm` outranks; no focus movement |
| a late **OK** result arrives while `couldnt_confirm` is sticky | distinct from the row above and NOT collapsed with it: the revoke succeeded, so the row will leave the list on the next refresh. Focus stays on the Refresh control; it must not chase the unmount |
| the action THROWS on revoke | unknown and gate failures propagate to the route error boundary rather than a local catch, so no focus contract applies — the surface is replaced. Distinct from rotate and picker, which catch locally |
| **refused, then retried** | after a refused revoke `result` stays non-OK, so re-entering `confirm` and pressing Confirm again must still not disable the submitter synchronously (R5). The retry path is where a naive repair re-introduces the submit cancellation |
| `effectiveUi` renders idle while `ui` is `resolving` | focus follows the RENDERED branch, not `ui` |

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

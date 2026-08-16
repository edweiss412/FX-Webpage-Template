# theme-persistence-note — closeout

Unit: `docs/superpowers/plans/2026-08-15-theme-persistence-note/`
Branch: `feat/theme-persistence-note` · Spec: `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md`

## Shipped

| Task | What landed |
| --- | --- |
| N1 | `persistFailed` on `useAppliedTheme` (both `AppliedTheme` variants); the mount effect became a functional update so a pre-mount blocked write survives it; the OS-change listener preserves the flag rather than claiming anything about persistence. |
| N2 | `ThemeToggle` wrapper (`relative inline-flex`) + always-mounted `role="status"` anchored bubble with chrome on the inner span; the shared copy const; `tests/e2e/theme-persistence-note.spec.ts` and its enrollment surfaces. |
| N3 | The same note in the avatar-menu popover, as a sibling of the `role="menu"` element. |
| N4 | Merge, full gates, impeccable dual gate, ledger archive, cross-model diff review, CI, merge. |

## Test evidence

- `tests/components/layout/useAppliedThemePersistFailure.test.ts` — 5 cases (AC-1, AC-3, repeated failure, AC-9 pre-effect window, OS-change untouched).
- `tests/components/layout/themeToggleNote.test.ts` — 8 cases (AC-4, AC-1, AC-2, AC-5, AC-10a).
- `tests/components/auth/avatarMenu.test.tsx` — 5 added cases (AC-4, AC-1, AC-6, popover re-open, recovery); file green at 37.
- `tests/e2e/theme-persistence-note.spec.ts` — 4 cases, observed RED (missing note locator, both routes rendering) before implementation and GREEN after: `4 passed (4.0m)`, desktop-chromium.
- Enrollment: `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` 15/15 (its executed-count check re-derives the threshold of 4 from live per-project resolution) and `tests/ci/_metaE2eWorkflowCoverage.test.ts` 97/97.

## Spec amendment: the avatar-menu placement conflict

Spec §2.2 places the avatar-menu note "immediately AFTER the `role="menu"` element". While this branch was in flight, `origin/main` shipped the switch-person failure alert (`BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`) into the same popover, and its §4.3 placement contract is pinned executably as BOTH the menu's immediate next sibling and the popover's last child (`tests/components/auth/avatarMenu.test.tsx`). Two regions cannot both be last. The note therefore sits immediately ABOVE the menu: an alert about the action the user just took keeps the slot nearest the control, and a polite device status yields it. AC-6 pins non-descendance from `role="menu"`, which is unchanged and still asserted.

Because the spec is canonical (invariant 7), this is recorded as a dated AMENDMENT in spec §2.2 itself, not as a closeout-only note — a rationale living only here would leave the canonical artifact contradicting the shipped code (cross-model diff review R1 finding 1).

## §12 — impeccable dual gate (invariant 8)

Both halves ran on the implementation diff (`components/layout/useAppliedTheme.ts`, `components/layout/ThemeToggle.tsx`, `components/auth/AvatarMenu.tsx`) with the canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the product register read. Critique ran its two assessments as isolated sub-agents (not degraded). Browser visualization was SKIPPED in both halves for a stated reason: the machine was under a strict single-run e2e mutex, and a second dev server would have collided with a live capture.

Deterministic detector: `detect.mjs` over both component files returned `[]`, exit 0.

| # | Tier | Finding | Disposition |
| --- | --- | --- | --- |
| C1 | P1 | Critique: the bubble has no dismiss or expiry, so a permanently-blocked session keeps it overlaying whatever sits under the toggle for the rest of the visit. | **DEFERRED: `THEMENOTE-BUBBLE-DISMISS-1` in `DEFERRED.md`,** with the queue row `BL-THEME-NOTE-NO-DISMISS-AFFORDANCE`. Spec §4 limit 5 ratified the trade before implementation and the plan states there is no auto-hide; a dismiss affordance is a product decision (a control, its copy, its tap target, its own a11y contract), disposition (a). |
| C2 | P2 | Critique: `text-right` on copy the spec's own width math wraps to three lines at 320px; right-aligned multi-line body copy reads worse. | **Filed, not silently fixed.** `text-right` is in the spec §2.2 chrome class list, and invariant 7 makes the spec canonical — a class-level change to a ratified visual contract is not an implementer's call mid-arc. `BL-THEME-NOTE-BUBBLE-TEXT-ALIGN`. |
| C3/A2 | P2 | Both halves: `text-text-subtle` on `bg-surface-raised` was an unpinned ground for body copy; AGENTS.md's pre-code checklist requires a contrast pin for a new pairing. | **FIXED in-branch.** DESIGN.md §1.2 gains the row (light 6.76:1, dark 5.97:1, both AA body) and `tests/styles/status-token-contrast.test.ts` pins both themes, so a retune of either token fails there. |
| A1 | P1 | Audit: in the avatar menu the region unmounts with the popover, so a re-open mounts the container with its text already present and announces nothing to AT. | **DEFERRED: `THEMENOTE-POPOVER-REANNOUNCE-1` in `DEFERRED.md`.** Spec §2.3 (compound row) and §4 limit 3 state this exact behavior and accept it — the user already heard it at failure time, sighted parity holds, and a screen-reader user re-opening the menu reads the menu contents anyway — so the deferral records reason (b) and the trigger that would un-defer it. |
| C4 | P3 | Critique: the shipped avatar-menu placement contradicts spec §2.2's "immediately after". | **FIXED in the canonical artifact.** Spec §2.2 now carries the dated amendment recording the conflict, the executable pin that forced it, and the unchanged normative requirement (AC-6). See "Spec amendment" above. |
| A3 | P3 | Audit: the two note implementations are near-identical but not shared (`<span className="block">` vs `<p>`). | **Accepted.** The two grounds differ (an anchored bubble with its own chrome vs an inset line inside a popover), so a shared component would carry both variants as props for two call sites. Noted for the next surface that needs one. |

P0: none. P1: two, both ratified documented limits and both carried as explicit `DEFERRED.md` entries — `THEMENOTE-BUBBLE-DISMISS-1` and `THEMENOTE-POPOVER-REANNOUNCE-1`, each with its un-defer trigger. A spec-documented limit is not a substitute for the entry the invariant asks for (cross-model diff review R1 findings 2 and 3); the invariant-8 fixed-or-deferred gate is satisfied by the entries, not by the spec text.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

## Documented limits carried forward

Spec §4 in full: per-instance and per-page-session; no telemetry; popover re-open renders without re-announcing; repeated failures do not re-announce; the bubble overlays what sits under the toggle while the failed state persists; both controls would track failure independently if they could ever render at once.

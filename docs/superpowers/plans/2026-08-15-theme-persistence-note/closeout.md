# theme-persistence-note — closeout

Unit: `docs/superpowers/plans/2026-08-15-theme-persistence-note/`
Branch: `feat/theme-persistence-note` · Spec: `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md`

## Shipped

| Task | What landed |
| --- | --- |
| N1 | `persistFailed` on `useAppliedTheme` (both `AppliedTheme` variants); mount effect is a functional update so a pre-mount blocked write survives it; the OS-change listener preserves the flag rather than claiming anything about persistence. |
| N2 | `ThemeToggle` wrapper (`relative inline-flex`) + always-mounted `role="status"` anchored bubble, chrome on the inner span; the shared copy const; the new Playwright geometry spec and its five enrollment surfaces. |
| N3 | The same note in the avatar-menu popover, as a SIBLING of the `role="menu"` element. |
| N4 | Gates, impeccable dual gate, ledger archive, cross-model diff review, CI, merge. |

## §12 — impeccable dual gate (invariant 8)

_Filled at N4.1._

impeccable-gate: critique=PENDING audit=PENDING p0=0 p1=0 dispositions=none

## Documented limits carried forward

Spec §4 (per-instance and per-page-session; no telemetry; popover re-open renders without
re-announcing; repeated failures do not re-announce; the bubble overlays what sits under the toggle
while the failed state persists; both controls would track failure independently if they could ever
render at once).

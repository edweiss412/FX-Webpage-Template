# HoverHelp caret + blur-close — close-out record

Feature: spec `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md` (cross-model APPROVE R4) · plan `docs/superpowers/plans/2026-07-22-hoverhelp-caret-blur-close.md` (cross-model APPROVE R4) · un-defers `HOVERHELP-CLAMP-CARET-1`.

## Transition audit (plan Task 4)

Verified 2026-07-22 against the shipped tests. `AnimatePresence` count in `components/admin/HoverHelp.tsx`: 0. No `transition-all` (both body and caret scope transitions via `transition-[opacity,display]`, so the imperative border/orientation swap on `data-popover-side` is instant by construction).

| Spec §6 row | Executable coverage (verified present) |
| --- | --- |
| closed → placed-visible (fade) | T-A1 (class flip both nodes); CSS fade declarative, parity locked by T-J1/T-J6d |
| placed-visible → closed | T-A1 close half |
| placed@bottom ↔ placed@top | T-A2 (live flip, one coalesced frame, both nodes) |
| placed-visible ↔ suppressed | T-J2 (hide) + T-A3 (recovery) + T-J3 (caret-only) |
| closed ↔ suppressed | T-J3 (enter suppressed) + T-J5 (close FROM suppressed resets visibility + side attr) |
| position updates same side | T-E5 (scrolly fixture, style-stability + live-rect asserts) + existing u5 coalescing |
| side flip mid-fade | T-A2 asserts open classes intact through the flip |
| suppression mid-fade | T-J2 (visibility wins while open classes present) |
| pending-frame atomicity | T-A2/T-A6 (single `runPendingFrames()` updates both nodes consistently) |
| blur-close mid-open-fade | T-B1 (single commit closes; body class asserted) |
| blur-close with pending 120ms timer | T-B10 (act-wrapped timer advance) |

All rows resolved; no gaps found, no fixes required.

## Impeccable dual-gate (invariant 8)

_Populated by plan Task 5._

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

Both gates ran 2026-07-22 with the canonical v3 setup (context.mjs PRODUCT.md+DESIGN.md load, product register reference).

**Critique** (dual-agent A/B; snapshot `.impeccable/critique/2026-07-22T23-38-02Z__components-admin-hoverhelp-tsx.md`): 37/40, 0 P0, 0 P1. Detector: 0 findings. Real-Chromium evidence: T-E1/T-E3/T-E6 pass (tokens, seam, both orientations). Findings + dispositions:

- P2 caret lacks shadow-tile (side=top caret hangs below the body's shadowed edge; dark-theme pasted-on risk). ACCEPTED-NOT-FIXED: a drop-shadow filter on the triangle risks double-darkening at the deliberate seam overlap; cosmetic and speculative (dark mode only). Un-defer trigger: visual QA report that the top-side caret reads detached.
- P3 null-relatedTarget click leaves popover open. Ratified spec 2026-07-22-hoverhelp-caret-blur-close §1.1 (probe P3: closing on null would dismiss on in-body clicks). No action.
- P3 modal+learnMore quadrant keeps no-blur-close. Ratified §1.1 reachability carve-out. No action.

**Audit**: 0 P0, 0 P1, no new findings beyond the critique set. A11y: caret inert (aria-hidden + pointer-events-none), no new focusables, blur-close never moves focus. Performance: caret is write-only inside the existing coalesced rAF measure pass (no added layout reads/observers/filters). Theming: runtime tokens only (border-strong / surface-raised), both themes inherit. Responsive: closed caret is display:none (no scrollWidth contribution - the BELL-HELP-POPOVER-OVERFLOW-1 class is avoided). Reduced motion: duration tokens collapse to 0ms globally (app/globals.css:409); the discrete fade degrades to instant.

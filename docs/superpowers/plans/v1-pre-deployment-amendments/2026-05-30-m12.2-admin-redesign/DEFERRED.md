# DEFERRED — M12.2 admin redesign (B1 + later sub-milestones)

Per-plan deferrals: items that WILL be done with a concrete trigger (distinct from BACKLOG.md, which is speculative/project-wide). See `[[feedback_deferral_discipline]]`.

## Open

### B1-D1 — Per-show `<AdminPageHeader>` density at the 720px flex-row boundary

**Status:** Open. **Trigger:** live measurement during the M12 UX-validation walk (or the next per-show eyeball) of `/admin/show/[slug]` with a long show title at viewports straddling 720px.

**Source:** M12.2 B1 impeccable v3 dual-gate (critique, P2), 2026-06-01 (external subagent attestation).
**Description:** The per-show header renders the `text-2xl` title + Published/Archived pill + the full crew-link chip (label + share code + copy button) in one `AdminPageHeader` flex row. On a long show title at the desktop/mobile boundary these may compete for horizontal space. The Task 9.1 real-browser layout-dimensions sweep asserts no horizontal overflow and no track collapse across `[600,719,720,860,1024,1280]` at the seeded fixture's title length, so there is no *measured* overflow today — but a longer real-world title was not exercised. Matches the Phase-A title-collapse memory pattern: **measure before prescribing a breakpoint/wrap fix** (`[[feedback_layout_gate_band_sweep_and_constant_width_heuristic]]`).
**Resolution (when triggered):** if a long title competes, wrap the chip below the title at the boundary (or truncate the title with a tooltip) — token-only, verified by extending the Task 9.1 sweep with a long-title fixture. Do NOT introduce a global `md` breakpoint.

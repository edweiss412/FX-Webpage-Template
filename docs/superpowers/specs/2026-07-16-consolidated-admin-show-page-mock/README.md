# Design mock — consolidated admin show page

Verbatim snapshot of the Claude Design reference mock (project `FXAV Crew Pages Admin Console`,
file `Admin Show Page.dc.html`, fetched 2026-07-16 via DesignSync). Standing rule: this directory
is a reference fixture — never edit it to satisfy lint/design hooks; the spec and DESIGN.md govern
where they disagree.

Spec: `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page.md`

## Known deltas (spec/DESIGN.md win)

1. **Rail lists "Diagrams" as a separate section.** Spec §5.2: diagrams render as a sub-block
   inside Rooms (`step3ReviewSections.tsx:3557-3566`); the rail has NO Diagrams item.
2. **"✓ all clear" strip state uses teal `#74C3BB`.** Off-palette — DESIGN.md §1 allows no teal.
   Implementation uses a neutral (`--color-text-subtle`) check treatment.
3. **Mobile chip rail shows a truncated "Contac" chip and omits later chips.** Canvas-width
   artifact of the mock, not a design decision: the real chip rail is a full horizontal
   scroll container with every section chip (spec §7/§8 invariant 3).
4. **Fixture copy** (show name, alert text, crew names/phones, share URL) is illustrative only.
5. **Strip variant (b) shows an Unarchive button in the strip.** Overridden: spec §4 caps the strip
   at two actions (publish toggle, copy link); `UnarchiveShowButton` renders in the Overview section
   (spec §6).

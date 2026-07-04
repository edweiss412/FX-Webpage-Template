# Variant B review-modal mock — reference snapshot

Verbatim snapshot of the Claude Design project sources this feature is ported from
(project `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd`, fetched 2026-07-01 via DesignSync):

- `modal-b.jsx` — the production Variant B modal (index rail + detail pane + footer)
- `sections.jsx` — shared section-body renderers + icon set the mock uses
- `data.jsx` — the mock's SECTIONS registry / GROUP_ORDER / sample show data
- `style.css` — mock tokens + component styles (Variant A/B/C share this)
- `step3.css` — Variant B production layer (modal sizing, container-query responsive, phone sheet, drag)
- `step3-app.jsx` — the wizard-page harness that mounts the modal (page redesign DEFERRED — reference only)

**The spec is the implementation contract** (`../2026-07-02-step3-review-modal-redesign.md`);
this snapshot is the VISUAL ground truth it was written from. Spec §14 lists every deliberate
deviation (tokens, breakpoints, avatars, icons, a11y hardening, 44px targets). Where the mock
and spec conflict outside §14, the spec wins — flag it, don't silently follow the mock.
The mock's canvas/tweaks scaffolding and its 12-hue avatar palette are explicitly NOT ported.

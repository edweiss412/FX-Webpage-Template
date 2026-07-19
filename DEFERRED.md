# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-18 (BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 opened from the bell-meta-align impeccable pass; ALERT-COPY-EMDASH-1 shipped via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 shipped via alert-surface-ui ARC-2 → archive).

---

### BELL-HELP-POPOVER-OVERFLOW-1 — [P2, pre-existing] `/admin` help popovers render 104-143px past the viewport's right edge

Measured in a real browser during the bell-meta-align impeccable pass, at merge-base as well as on the branch: `document.documentElement.scrollWidth - clientWidth` is 139px @390px and 143px @1280px, and the offenders are the dashboard's `absolute z-50 w-72 max-w-[80vw]` help popovers — `shows-help-body` (right edge 529.1 vs a 390px viewport), `ignored-sheets-help-body`, `recent-auto-applied-help-body` — plus their inner children. `w-72` (288px) wins over the `max-w-[80vw]` cap at 390px, and nothing constrains their horizontal position. No bell element appears in the offender list. This is why `tests/e2e/bell-panel-layout.spec.ts`'s document-level overflow assertions fail locally on a clean checkout.
**Why it survived this long:** `bell-panel-layout.spec.ts` runs in NO CI workflow — the `desktop-chromium` project is only invoked by `.github/workflows/step3-live-bundle.yml` for `step3-review-modal.interactions.spec.ts`. The gate is dark.
**Un-defer trigger:** the next `/admin` dashboard layout task, or wiring `bell-panel-layout.spec.ts` into CI (whichever lands first) — anchor the popovers (`right-0` / collision-aware placement) so they stay inside the viewport, then restore the document-level assertions in both bell layout tests.

### BELL-SLOT-WIDTH-1 — [P1→deferred] The reserved chevron slot spends a 44px tap-target box to buy a 16px glyph's alignment

`ActiveRow`/`HistoryRow` reserve `size-tap-min` (44px) + a `gap-2` (8px) on every chevron-less row so all timestamps share one right edge. Measured at 390px: that removes 52px from a 221.56px title column (13.3% of the viewport) on exactly the rows with the longest titles (global + health alerts, which never carry a chevron). 44px is the WCAG _target_ floor for the interactive chevron; it is not the _alignment_ unit, and a non-interactive spacer does not need it. Impeccable critique flagged this P1; the alignment itself is verified exact (0.0px delta at 390px and 1280px) so the column is correct — only its cost is open.
**Not fixed now because:** no counterfactual render was measured (both seeded titles already wrap to 2 lines WITH the slot; whether they'd drop to 1 without it is unknown), and the alternatives — a header `grid grid-cols-[1fr_auto_var(--spacing-tap-min)]`, or letting the chevron bleed into the row's `px-4` via a negative margin — each destabilize geometry that is currently verified green. Guessing costs more than measuring.
**Un-defer trigger:** measure the counterfactual (render the same seeded rows with the slot width forced to 0 and diff title line counts at 390px). If any realistic title drops a line, convert the header to the grid template and reclaim the difference; if none does, close this as won't-fix and record the measurement.

### MODAL-CLOSE-EXIT-ANIM-1 — [P1→ratified] X/Esc/scrim close is an instant unmount (no exit animation) while drag-dismiss animates out

From impeccable critique of the admin-show-modal branch (33/40): every non-drag close affordance funnels through `useShowModalNav().close` (a `router.push`), so the modal lingers until the RSC roundtrip returns, then unmounts with no exit transition — asymmetric with the drag-dismiss slide-out, and can read as laggy on venue cellular. **Declined as a defect: the spec's transition inventory explicitly ratifies "open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation)" (docs/superpowers/specs/2026-07-18-admin-show-modal.md:147), preserving Step3 chrome parity.**
**Un-defer trigger:** user feedback that closing feels laggy/broken, or a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition (play the reverse sheet/pop animation immediately, fire `router.push` behind it) to BOTH consumers so Step3 parity holds.

### MODAL-SKELETON-CLOSE-1 — [P2] Suspense skeleton frame has a no-op onClose — Esc/scrim dead while the loader streams

`ShowReviewModalSkeleton` mounts the shell with `onClose={() => {}}` and no live close control (spec §4 ratifies an "open, non-interactive modal frame"). On a slow load the user's only escape is browser-back; body scroll is locked and the background inert. Skeleton is a client component, so it COULD wire `useShowModalNav().close` without crossing the RSC boundary.
**Un-defer trigger:** any report of a stuck loading modal, or the next ReviewModalShell/skeleton task — wire the skeleton's onClose to `useShowModalNav().close` and render a real close button in place of the placeholder block (spec amendment: relax "non-interactive" to "content-non-interactive").

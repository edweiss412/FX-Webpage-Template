# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-19 (BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 both SHIPPED via the 28px chevron gutter + HoverHelp display:none fix → archive; ALERT-COPY-EMDASH-1 shipped via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 shipped via alert-surface-ui ARC-2 → archive).

---

### MODAL-CLOSE-EXIT-ANIM-1 — [P1→ratified] X/Esc/scrim close is an instant unmount (no exit animation) while drag-dismiss animates out

From impeccable critique of the admin-show-modal branch (33/40): every non-drag close affordance funnels through `useShowModalNav().close` (a `router.push`), so the modal lingers until the RSC roundtrip returns, then unmounts with no exit transition — asymmetric with the drag-dismiss slide-out, and can read as laggy on venue cellular. **Declined as a defect: the spec's transition inventory explicitly ratifies "open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation)" (docs/superpowers/specs/2026-07-18-admin-show-modal.md:147), preserving Step3 chrome parity.**
**Un-defer trigger:** user feedback that closing feels laggy/broken, or a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition (play the reverse sheet/pop animation immediately, fire `router.push` behind it) to BOTH consumers so Step3 parity holds.

### MODAL-SKELETON-CLOSE-1 — [P2] Suspense skeleton frame has a no-op onClose — Esc/scrim dead while the loader streams

`ShowReviewModalSkeleton` mounts the shell with `onClose={() => {}}` and no live close control (spec §4 ratifies an "open, non-interactive modal frame"). On a slow load the user's only escape is browser-back; body scroll is locked and the background inert. Skeleton is a client component, so it COULD wire `useShowModalNav().close` without crossing the RSC boundary.
**Un-defer trigger:** any report of a stuck loading modal, or the next ReviewModalShell/skeleton task — wire the skeleton's onClose to `useShowModalNav().close` and render a real close button in place of the placeholder block (spec amendment: relax "non-interactive" to "content-non-interactive").

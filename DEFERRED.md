# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-19 (BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 both SHIPPED via the 28px chevron gutter + HoverHelp display:none fix → archive; ALERT-COPY-EMDASH-1 shipped via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 shipped via alert-surface-ui ARC-2 → archive).

---

### ~~MODAL-CLOSE-EXIT-ANIM-1~~ — RESOLVED (exit animation shipped)

From impeccable critique of the admin-show-modal branch (33/40): every non-drag close affordance funnels through `useShowModalNav().close` (a `router.push`), so the modal lingers until the RSC roundtrip returns, then unmounts with no exit transition — asymmetric with the drag-dismiss slide-out, and can read as laggy on venue cellular. **Declined as a defect: the spec's transition inventory explicitly ratifies "open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation)" (docs/superpowers/specs/2026-07-18-admin-show-modal.md:147), preserving Step3 chrome parity.**
**Resolved:** the un-defer trigger fired (motion pass touching `ReviewModalShell`). `ReviewModalShell` now owns a `requestClose` that plays the mode-aware reverse of the entrance and calls `onClose` at exit-end, on all five affordances in BOTH consumers; reduced motion keeps the instant unmount. Master spec §6.5 amended at `docs/superpowers/specs/2026-07-18-admin-show-modal.md:147`. Spec + plan: `docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md`, `docs/superpowers/plans/2026-07-18-modal-close-exit-anim/`. **`MODAL-SKELETON-CLOSE-1` below stays deferred** — separate task; §3.4 of the new spec preserves the skeleton's current per-usage behavior and adds no close affordance.

### MODAL-SKELETON-CLOSE-1 — [P2] Suspense skeleton frame has a no-op onClose — Esc/scrim dead while the loader streams

`ShowReviewModalSkeleton` mounts the shell with `onClose={() => {}}` and no live close control (spec §4 ratifies an "open, non-interactive modal frame"). On a slow load the user's only escape is browser-back; body scroll is locked and the background inert. Skeleton is a client component, so it COULD wire `useShowModalNav().close` without crossing the RSC boundary.
**Un-defer trigger:** any report of a stuck loading modal, or the next ReviewModalShell/skeleton task — wire the skeleton's onClose to `useShowModalNav().close` and render a real close button in place of the placeholder block (spec amendment: relax "non-interactive" to "content-non-interactive").

### STRIP-MOBILE-WRAP-1 — [P2] the control strip wraps to a second row at 390px (44px → 80px)

From the impeccable close-out of `modal-header-reconciliation`. §4.5 collapses the sync/edited stack to one line, trading height for WIDTH; §4.3 simultaneously adds a Re-sync trigger to the same row. Below `sm` the strip's `flex-wrap` is live and the row breaks: **44px → 80px** at 390px (`sm:flex-nowrap` leaves ≥sm untouched, so desktop is unaffected). Spec and plan both costed the height saving and neither anticipated the width cost.

**Accepted, not fixed.** Wrapping is the correct responsive behavior here and the alternatives are worse for the actual user: Doug is on a venue floor, one-handed, mid-show, and every control in the band is one he reaches for — truncating or horizontally scrolling a live publish toggle, a Re-sync, or the copy-crew-link button to protect 36px of vertical space is the wrong trade. The band is chrome, not content; the modal body still scrolls independently. The wrap is also already partly designed for: the `·` control divider is `hidden sm:block`, so it does not orphan onto row two.

**Un-defer trigger:** user feedback that the mobile modal header feels tall or that controls jump between rows as status text changes length (the wrap point is data-dependent — it moves with the relative-time strings). The fix is then a deliberate mobile reflow — status line dropped to its own row by explicit `basis-full` rather than incidental wrapping — NOT tightening spacing to squeeze one row.

### STRIP-SKELETON-MOBILE-BAND-1 — [P2] skeleton control band cannot match the loaded band at 390px (73px vs 149px)

Direct consequence of `STRIP-MOBILE-WRAP-1`, surfaced by Task 9's band-parity spec. At ≥sm the skeleton and loaded subheader bands match exactly (**E = 0.00px at 1280**), and the header→subheader seam — the invariant that actually causes the visible load-time snap — matches at **D = 0.30px at BOTH viewports** (bound ≤8px; it failed red at 45.70px/9.70px pre-fix). At 390px the loaded strip wraps to three rows (149px) against the skeleton's single-row 73px.

**Accepted, not fixed, and the tolerance was NOT widened** (the plan explicitly forbids that). The plan nominated skeleton bar heights as the lever, but they cannot close this: the wrap point is a function of rendered DATA, since the status line's width depends on its relative-time strings. Sizing placeholders to reproduce one fixture's 3-row wrap was rejected as overfitting — it would go green while asserting nothing about any real show. The 390px case therefore asserts an honest weaker clause (band reserves ≥ one tap row + `py-2`, never exceeds the loaded band) and the ≤4px strictness is kept at ≥sm where its "single control row" premise actually holds.

**Un-defer trigger:** resolving `STRIP-MOBILE-WRAP-1` (a deliberate mobile reflow makes the loaded mobile band deterministic, at which point exact parity becomes assertable again), or user reports of a visible header jump on mobile loads.

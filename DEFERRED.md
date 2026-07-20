# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-19 (MODAL-SKELETON-CLOSE-1 SHIPPED via `2026-07-19-modal-skeleton-close` — skeleton default nav-close at dismiss-commit + real X; the already-resolved MODAL-CLOSE-EXIT-ANIM-1 block moved to the archive in the same pass. Earlier same day: BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 shipped via the 28px chevron gutter + HoverHelp display:none fix; ALERT-COPY-EMDASH-1 via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 via alert-surface-ui ARC-2.)

---

### WARNCARD-GUIDANCE-LENGTH-1 — [P2] two guidance rows read as paragraphs, not at-a-glance lines

From the impeccable critique of `warning-card-copy-restore` (2026-07-20). Spec §4.2 rows 7 (CREW_COLUMN_POSITIONAL_FALLBACK, 241 ch) and 33 (PULL_SHEET_OVERRIDE_CONTENT_CHANGED, 245 ch) render ~5-6 lines at 320px; the median row (~175 ch) reads as intended. Cap is 300 so the meta-test passes; copy tightening, not a defect. Deferred because the copy table is the ratified §4.2 canonical (frozen fixture + §12.4 lockstep) and the impeccable tier is P2 (dual-gate mandates P0/P1 only).

**Un-defer trigger:** any future §4.2 copy edit touching these codes — tighten both rows toward ~180 ch in that same lockstep commit.

### WARNCARD-POPOVER-OVERLAP-1 — [P3] right-aligned help popover opens over the guidance line it contextualizes

Impeccable critique note (2026-07-20): the `?` popover (align="right", opens below the trigger) can cover the inline guidance while open. Acceptable tooltip behavior — spec `2026-07-20-show-alert-compact` ratified the overlap posture explicitly. Same critique, cosmetic P3s folded here: row 24's double-semicolon chain; "as-is" hyphen wrap at 400px.

**Un-defer trigger:** user reports the popover hiding the guidance they were reading.

### STRIP-MOBILE-WRAP-1 — [P2] the control strip wraps to a second row at 390px (44px → 80px)

From the impeccable close-out of `modal-header-reconciliation`. §4.5 collapses the sync/edited stack to one line, trading height for WIDTH; §4.3 simultaneously adds a Re-sync trigger to the same row. Below `sm` the strip's `flex-wrap` is live and the row breaks: **44px → 80px** at 390px (`sm:flex-nowrap` leaves ≥sm untouched, so desktop is unaffected). Spec and plan both costed the height saving and neither anticipated the width cost.

**Accepted, not fixed.** Wrapping is the correct responsive behavior here and the alternatives are worse for the actual user: Doug is on a venue floor, one-handed, mid-show, and every control in the band is one he reaches for — truncating or horizontally scrolling a live publish toggle, a Re-sync, or the copy-crew-link button to protect 36px of vertical space is the wrong trade. The band is chrome, not content; the modal body still scrolls independently. The wrap is also already partly designed for: the `·` control divider is `hidden sm:block`, so it does not orphan onto row two.

**Un-defer trigger:** user feedback that the mobile modal header feels tall or that controls jump between rows as status text changes length (the wrap point is data-dependent — it moves with the relative-time strings). The fix is then a deliberate mobile reflow — status line dropped to its own row by explicit `basis-full` rather than incidental wrapping — NOT tightening spacing to squeeze one row.

### STRIP-SKELETON-MOBILE-BAND-1 — [P2] skeleton control band cannot match the loaded band at 390px (73px vs 149px)

Direct consequence of `STRIP-MOBILE-WRAP-1`, surfaced by Task 9's band-parity spec. At ≥sm the skeleton and loaded subheader bands match exactly (**E = 0.00px at 1280**), and the header→subheader seam — the invariant that actually causes the visible load-time snap — matches at **D = 0.30px at BOTH viewports** (bound ≤8px; it failed red at 45.70px/9.70px pre-fix). At 390px the loaded strip wraps to three rows (149px) against the skeleton's single-row 73px.

**Accepted, not fixed, and the tolerance was NOT widened** (the plan explicitly forbids that). The plan nominated skeleton bar heights as the lever, but they cannot close this: the wrap point is a function of rendered DATA, since the status line's width depends on its relative-time strings. Sizing placeholders to reproduce one fixture's 3-row wrap was rejected as overfitting — it would go green while asserting nothing about any real show. The 390px case therefore asserts an honest weaker clause (band reserves ≥ one tap row + `py-2`, never exceeds the loaded band) and the ≤4px strictness is kept at ≥sm where its "single control row" premise actually holds.

**Un-defer trigger:** resolving `STRIP-MOBILE-WRAP-1` (a deliberate mobile reflow makes the loaded mobile band deterministic, at which point exact parity becomes assertable again), or user reports of a visible header jump on mobile loads.

### SHAREHUB-ROW-ANATOMY-1 — [P1] the two destructive rows inside the hub have different shapes

From the impeccable critique of `share-hub` (Assessment A, heuristic 4 "Consistency and standards", scored 2/4). Inside one 308px popover, the two irreversible controls render with different anatomies: `RotateShareTokenButton` in `compact` mode is label-left / button-right (`RotateShareTokenButton.tsx:281-284`), while `PickerResetControl` is a heading over a full-width button (`PickerResetControl.tsx:212-270`). The user-approved mock drew both as the same icon + title + subtitle row (`ActionBarMenu-1d.dc.html:111,123).

**Deferred, not accepted as correct.** The fix is a new compact row variant on `PickerResetControl`, which is NOT hub-local: `components/admin/wizard/step3ReviewSections.tsx` renders the same component in the onboarding wizard, where the current full-width anatomy is right for a wider column. Doing it properly means a variant axis plus its own tests on both surfaces — a larger change than this PR's remaining scope, and one that touches a shipped surface the share-hub work otherwise does not.

Both rows individually satisfy the §15 tier-2 guard ladder (two-tap, 4s auto-revert, safe-control focus, busy-gated dismissal), so this is a visual-consistency defect, not a safety one.

**Un-defer trigger:** the next change that touches `PickerResetControl`'s presentation for any reason, or user feedback that the hub's Careful section reads as two unrelated controls. The fix is a `compact` variant matching the rotate row, applied in the hub only, with `step3ReviewSections` explicitly opting out.

# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### SETTINGS-DEVROW-GALLERY-RESIDUE-1 — [P2/P3 ×4] impeccable residue on the settings Developer-tools row

From the impeccable dual-gate of `settings-attention-gallery-link` (PR #544). Zero P0/P1; four P2/P3 findings were deferred with spec-freeze rationales and recorded ONLY in `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md:47-52` — never in this queue. Filed here 2026-07-24 by a PR-body-vs-ledger reconciliation sweep; all four re-verified live against `components/admin/settings/DevToolsRow.tsx` at that date.

1. **[P2] "Open" label ambiguous beside a named sibling.** `DevToolsRow.tsx:53` renders `Open` next to `Attention gallery` (`:61`) in the same control cluster, so an SR link list reads a bare "Open". Deferred: renaming existing copy conflicts with spec §1.1 "row copy unchanged"; WCAG 2.4.4 is satisfied by the in-context row heading.
2. **[P2] Link label vs destination heading mismatch.** The link reads "Attention gallery"; the destination `<h1>` reads "Attention modal gallery" (`app/admin/dev/attention-gallery/page.tsx:54`). Deferred: the label is ratified in spec §1.1/§3 (user-approved) and the h1 gives immediate confirmation on arrival.
3. **[P3] `devLinkClass` diverges from its sibling secondary button.** `DevToolsRow.tsx:16-17` omits `transition-colors duration-fast` (and a ring offset) that `DriveConnectionPanel.tsx:244` carries. Deferred: the literal was carried verbatim per spec §3 ("className identical to the Open link"); aligning both is cross-component polish. **Fix shape corrected 2026-07-24:** close this on the `transition-colors duration-fast` half only. The offset half is superseded by the two-tier focus recipe shipped in PR #558 — DESIGN.md §1.1 now bans bare `focus-visible:ring-offset-2` (an offset MUST carry a container-matched `ring-offset-<backdrop>`, and popover surfaces reserve offsets for armed destructive confirm-go). Adding a bare offset here would introduce the dark-mode white-gap defect, not parity; the two `DriveConnectionPanel` siblings (`:244`, `:277`) carry bare offsets and are the pre-existing drift to reconcile in the same pass.
4. **[P3] Row description does not mention the gallery action.** "Fixture tester and parse diagnostics. Hidden from normal use." (`DevToolsRow.tsx:48`) predates the second link. Deferred: spec §1.1 freezes the row description copy.

**Un-defer trigger:** any spec amendment reopening the settings dev-row copy (closes 1, 2, 4), or the next cross-component focus/transition parity pass on admin settings buttons (closes 3 plus the `DriveConnectionPanel` bare-offset drift). Items 1, 2 and 4 need owner copy ratification; item 3 does not.

### STRIP-MOBILE-WRAP-1 — [P2] the control strip wraps to a second row at 390px (44px → 80px)

From the impeccable close-out of `modal-header-reconciliation`. §4.5 collapses the sync/edited stack to one line, trading height for WIDTH; §4.3 simultaneously adds a Re-sync trigger to the same row. Below `sm` the strip's `flex-wrap` is live and the row breaks: **44px → 80px** at 390px (`sm:flex-nowrap` leaves ≥sm untouched, so desktop is unaffected). Spec and plan both costed the height saving and neither anticipated the width cost.

**Accepted, not fixed.** Wrapping is the correct responsive behavior here and the alternatives are worse for the actual user: Doug is on a venue floor, one-handed, mid-show, and every control in the band is one he reaches for — truncating or horizontally scrolling a live publish toggle, a Re-sync, or the copy-crew-link button to protect 36px of vertical space is the wrong trade. The band is chrome, not content; the modal body still scrolls independently. The wrap is also already partly designed for: the `·` control divider is `hidden sm:block`, so it does not orphan onto row two.

**Un-defer trigger:** user feedback that the mobile modal header feels tall or that controls jump between rows as status text changes length (the wrap point is data-dependent — it moves with the relative-time strings). The fix is then a deliberate mobile reflow — status line dropped to its own row by explicit `basis-full` rather than incidental wrapping — NOT tightening spacing to squeeze one row.

### STRIP-SKELETON-MOBILE-BAND-1 — [P2] skeleton control band cannot match the loaded band at 390px (73px vs 149px)

Direct consequence of `STRIP-MOBILE-WRAP-1`, surfaced by Task 9's band-parity spec. At ≥sm the skeleton and loaded subheader bands match exactly (**E = 0.00px at 1280**), and the header→subheader seam — the invariant that actually causes the visible load-time snap — matches at **D = 0.30px at BOTH viewports** (bound ≤8px; it failed red at 45.70px/9.70px pre-fix). At 390px the loaded strip wraps to three rows (149px) against the skeleton's single-row 73px.

**Accepted, not fixed, and the tolerance was NOT widened** (the plan explicitly forbids that). The plan nominated skeleton bar heights as the lever, but they cannot close this: the wrap point is a function of rendered DATA, since the status line's width depends on its relative-time strings. Sizing placeholders to reproduce one fixture's 3-row wrap was rejected as overfitting — it would go green while asserting nothing about any real show. The 390px case therefore asserts an honest weaker clause (band reserves ≥ one tap row + `py-2`, never exceeds the loaded band) and the ≤4px strictness is kept at ≥sm where its "single control row" premise actually holds.

**Un-defer trigger:** resolving `STRIP-MOBILE-WRAP-1` (a deliberate mobile reflow makes the loaded mobile band deterministic, at which point exact parity becomes assertable again), or user reports of a visible header jump on mobile loads.

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Sheet-warnings panel (titled "Parse warnings" until
`feat/warning-trim-undefer`) and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

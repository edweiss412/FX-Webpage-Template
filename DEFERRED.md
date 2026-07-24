# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-23 (SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE graduated to the archive — P2 focus-ring inconsistency RESOLVED by `feat/sharehub-focus-pass` (two-tier recipe, spec `2026-07-23-sharehub-focus-pass` §2: rows/cancels/triggers plain ring, armed destructive confirms carry the surface-offset pair); P3 caret shadow RATIFIED no-shadow. Earlier: 2026-07-22 four warning-panel-polish critique deferrals RESOLVED by the warning-announcer-copy bundle and graduated to the archive, replaced by the VOICEOVER-ANNOUNCER-SPOTCHECK owner action. Earlier same day: seven warning-surface-trim items RESOLVED by the warning-panel-polish bundle and graduated to the archive; the six stay-parked items re-confirmed by 2026-07-21 owner decisions. Same day: WARNCARD-POPOVER-OVERLAP-1 graduated to the archive — resolved by `feat/hoverhelp-smart-position` collision-aware placement; and ATTN-GALLERY-CONTROLBAR-OVERLAP-1 SHIPPED via `2026-07-21-gallery-switcher-slim-bar` — slim single-row switcher bar, footnotes behind a collapsed disclosure; entry graduated to the archive. Earlier: 2026-07-21 SHAREHUB-ROW-ANATOMY-1 graduated to the archive — it was already marked RESOLVED-in-queue by `share-hub-fidelity-fixes`; the SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE cross-reference was repointed from "above" to the archive. Earlier: 2026-07-19 MODAL-SKELETON-CLOSE-1 SHIPPED via `2026-07-19-modal-skeleton-close` — skeleton default nav-close at dismiss-commit + real X; the already-resolved MODAL-CLOSE-EXIT-ANIM-1 block moved to the archive in the same pass. Earlier same day: BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 shipped via the 28px chevron gutter + HoverHelp display:none fix; ALERT-COPY-EMDASH-1 via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 via alert-surface-ui ARC-2.)

---

### CREWWARN-UNDERROW-INDENT-1 — [P1, partially fixed] under-row warning card binds to its member by spacing only, not indent

From the impeccable critique of `feat/crew-warning-attachment` (Assessment A P1a, 2026-07-23). Measured: the under-row card sat 8px below its member's row but only ~10px above the NEXT row, full card width, zero left indent — proximity alone is a weak binding. **Fixed in the branch:** spacing asymmetry (hosting `<li>` now `pt-1 pb-2`, so the below-gap is visibly larger than the `mt-2` above-gap). **Deferred:** the indent-to-name-column half (`pl-13` = avatar 40px + gap 12px). `CrewUnderRowStack` is SHARED with attention alert banners whose full-card-width "card-with-attached-banner" shape is the ratified published-show-alerts §5.4 mock — indenting warning cards means either indenting ratified alert banners too or splitting the stack's layout per node kind. Spec beats critique (standing rule).

**Un-defer trigger:** any milestone touching `CrewUnderRowStack` layout or the published-show-alerts banner design; decide indent-for-both vs per-kind layout there.

### CREWWARN-UNDERROW-COPY-CONDENSE-1 — [P2] under-row card repeats the group card's full generic copy

Assessment A P2a, same critique. The under-row card and the fallback group card render the identical heading+body; when both appear in one panel it scans like a render bug, and under a member's row the who/where is already carried by placement. Condensing the under-row variant (title + controls, explainer behind the existing "?" HoverHelp) touches the warning-card copy layer (warning-card-copy-restore §4.2 lockstep) — a copy-layer change out of scope for a placement diff.

**Un-defer trigger:** next milestone touching warning-card copy or WARNING_CARD_COPY_CODES.

### CREWWARN-INCARD-MOBILE-EYEBROW-1 — [P2] in-card group eyebrow truncates at 390px

Assessment A P2b, same critique. Inside the padded panel card the group loses ~2x `p-tile-pad` of width; at 390px the eyebrow ellipsizes ("PHONE OR EMAIL WE COUL...") and the "Ignore all 2" chip wraps to two lines (no overlap, still legible). Fix lands in shared `BulkIgnoreControls` (eyebrow wrap instead of truncate, or shorter chip copy) whose other call sites (wizard step3 groups) would also reflow — beyond this diff's blast radius.

**Un-defer trigger:** any BulkIgnoreControls change, or user feedback on the truncated eyebrow.

### CREWWARN-CAP-FIXTURE-1 — [P3] no visual fixture for the 3-warnings-one-member cap state

Assessment A P3, same critique. The 2-visible + "N more" cap state has unit coverage (crewUnderRowCards node granularity) but no harness page, so the capped stack has never been LOOKED at with warning cards in it. Add a `crewWarningsCapped` harness variant when next touching the e2e harness.

**Un-defer trigger:** next change to `_publishedReviewModalHarness.tsx` or `CrewUnderRowStack`.

### STRIP-MOBILE-WRAP-1 — [P2] the control strip wraps to a second row at 390px (44px → 80px)

From the impeccable close-out of `modal-header-reconciliation`. §4.5 collapses the sync/edited stack to one line, trading height for WIDTH; §4.3 simultaneously adds a Re-sync trigger to the same row. Below `sm` the strip's `flex-wrap` is live and the row breaks: **44px → 80px** at 390px (`sm:flex-nowrap` leaves ≥sm untouched, so desktop is unaffected). Spec and plan both costed the height saving and neither anticipated the width cost.

**Accepted, not fixed.** Wrapping is the correct responsive behavior here and the alternatives are worse for the actual user: Doug is on a venue floor, one-handed, mid-show, and every control in the band is one he reaches for — truncating or horizontally scrolling a live publish toggle, a Re-sync, or the copy-crew-link button to protect 36px of vertical space is the wrong trade. The band is chrome, not content; the modal body still scrolls independently. The wrap is also already partly designed for: the `·` control divider is `hidden sm:block`, so it does not orphan onto row two.

**Un-defer trigger:** user feedback that the mobile modal header feels tall or that controls jump between rows as status text changes length (the wrap point is data-dependent — it moves with the relative-time strings). The fix is then a deliberate mobile reflow — status line dropped to its own row by explicit `basis-full` rather than incidental wrapping — NOT tightening spacing to squeeze one row.

### STRIP-SKELETON-MOBILE-BAND-1 — [P2] skeleton control band cannot match the loaded band at 390px (73px vs 149px)

Direct consequence of `STRIP-MOBILE-WRAP-1`, surfaced by Task 9's band-parity spec. At ≥sm the skeleton and loaded subheader bands match exactly (**E = 0.00px at 1280**), and the header→subheader seam — the invariant that actually causes the visible load-time snap — matches at **D = 0.30px at BOTH viewports** (bound ≤8px; it failed red at 45.70px/9.70px pre-fix). At 390px the loaded strip wraps to three rows (149px) against the skeleton's single-row 73px.

**Accepted, not fixed, and the tolerance was NOT widened** (the plan explicitly forbids that). The plan nominated skeleton bar heights as the lever, but they cannot close this: the wrap point is a function of rendered DATA, since the status line's width depends on its relative-time strings. Sizing placeholders to reproduce one fixture's 3-row wrap was rejected as overfitting — it would go green while asserting nothing about any real show. The 390px case therefore asserts an honest weaker clause (band reserves ≥ one tap row + `py-2`, never exceeds the loaded band) and the ≤4px strictness is kept at ≥sm where its "single control row" premise actually holds.

**Un-defer trigger:** resolving `STRIP-MOBILE-WRAP-1` (a deliberate mobile reflow makes the loaded mobile band deterministic, at which point exact parity becomes assertable again), or user reports of a visible header jump on mobile loads.

### warning-panel-polish (2026-07-22) — impeccable critique deferrals

All four critique deferrals recorded here on 2026-07-22 (bulk double
announcement; state-vs-action live region; apology-first elsewhere copy;
dead-end "and N more.") were RESOLVED by the warning-announcer-copy bundle
(spec `docs/superpowers/specs/2026-07-22-warning-announcer-copy-design.md`,
owner decisions ratified 2026-07-22) — full entries archived in
[DEFERRED-archive.md](./DEFERRED-archive.md) under "Warning announcer +
elsewhere copy (2026-07-22)".

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Parse-warnings panel and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

## warning-surface-trim (2026-07-21) — remaining deferrals after the 2026-07-22 polish bundle

Seven of the thirteen items recorded here on 2026-07-21 were RESOLVED by the
warning-panel-polish bundle (`docs/superpowers/specs/2026-07-22-warning-panel-polish-design.md`, owner-ratified 2026-07-21) — their full
entries are archived in [DEFERRED-archive.md](./DEFERRED-archive.md) under
"Warning panel polish (2026-07-22)". The six below stay parked, each
re-confirmed by an explicit owner decision on 2026-07-21 (spec §1.1 records the
ratifications).

- **[P1] Heading count reads no "(0)" in the Silent state (suppression carve-out).** Owner
  re-confirmed 2026-07-21: keep the suppression; the heading count does NOT include the
  routed-card bucket, and the rail semantics are unchanged (trim spec §3.3; polish spec §1.1
  item 1). Un-defer trigger: a future owner decision to redefine §3.3's count semantics.

- **[P3] The panel is still titled "Parse warnings".** Owner re-confirmed 2026-07-21 (polish
  spec §1.1 item 2). **Noted, not changed.**

- **[MEDIUM] The staged-mode byte-identical guarantee rests on a leaf render plus a card-level
  snapshot.** `tests/components/admin/stagedCardBaseline.test.tsx` renders `StagedReviewCard`
  directly and snapshots the card `<li>` elements, so a change to the surrounding wizard chrome,
  to card ordering relative to other content, or to a wizard-only prop is invisible to it. The
  polish bundle's gate-off ABSENCE assertions (polish spec §8.7) narrow but do not close this.
  **Noted, not changed.** Un-defer trigger: any change that touches the wizard's Step-3
  composition rather than only the shared registry (polish spec §1.1 item 6).

- **[MEDIUM] The alert cut is discoverable only through the bell.** Owner accepted bell-only on
  2026-07-21 (polish spec §1.1 item 3), with the sharpening fact that role-flag DELTAS remain
  visible on the show modal via the Sheet changes feed rows built in
  `lib/sync/changeLog/fieldChanges.ts:154-181`; only the first-publish data-gaps digest is
  bell-only, by the ratified intent of `2026-07-04-alert-audience-split` §3. **Noted, not
  changed.** Un-defer trigger: an owner decision to rehome the data-gaps digest onto the show
  modal.

- **[P2] The correction sentence is reachable twice on one screen in the List state.** Owner
  chose keep-both on 2026-07-21 (polish spec §1.1 item 5): each site covers a state the other
  cannot — cards exist without the callout in the Silent state; the callout covers info rows
  that never become cards; the overlap is List-state-only and the popover copy is on-demand.
  **Noted, not changed.**

- **[MEDIUM] `published-show-alerts` §5.4's in-row crew banner has zero producers.** Owner chose
  to leave it dormant on 2026-07-21 (polish spec §1.1 item 4): no code change, and the placement
  test at `tests/e2e/published-show-attention.spec.ts:126` stays SKIPPED (not deleted) as the
  contract that un-skips the moment a crew-routed, non-health, actionable code carrying a
  `crewName` exists. Sharpening fact: role-flag deltas already reach the modal via the Sheet
  changes feed, so banner dormancy loses event visibility on no surface. **Noted, not changed.**

## modal-state-coverage (2026-07-22) — class 6 deferral

- **[MEDIUM] Action-outcome states (pending/error/success on modal controls) are not
  demonstrable in the dev attention-gallery.** The 2026-07-22 modal-state sweep's class 6:
  re-sync overlays (error / shrink-hold confirm / success), publish-toggle refusal popover,
  Mi11 gate errors, resolve-button errors, bulk-ignore partial/fail alerts, crew-row reset
  outcome banners. These mount only from server action responses, so demonstrating them needs
  outcome-stubbing infrastructure (a gallery action layer returning scripted results), a
  different mechanism from the static scenario fields shipped by
  `docs/superpowers/specs/2026-07-22-modal-state-coverage-design.md` (classes 1-5). Owner
  deferred on 2026-07-22 ("1-5: all static states, 6 to deferred.md"). Un-defer trigger: an
  owner ask to review action-outcome UX in the gallery, at which point the gallery's client
  action closures gain a scripted-outcome mode per control.

  **Un-deferred 2026-07-23** by `docs/superpowers/specs/2026-07-23-gallery-action-outcomes-design.md`
  (this PR): all six surfaces plus share-token rotate, everyone-reset, and archive outcomes are
  click-demonstrable via the scripted-outcome layer (tier-2 `actionOutcomes` scenarios, scripted
  `GalleryWriteGuard` responses, and the null-default dev action override seam).

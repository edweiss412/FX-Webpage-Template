# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-22 (seven warning-surface-trim items RESOLVED by the warning-panel-polish bundle and graduated to the archive; the six stay-parked items re-confirmed by 2026-07-21 owner decisions. Same day: WARNCARD-POPOVER-OVERLAP-1 graduated to the archive — resolved by `feat/hoverhelp-smart-position` collision-aware placement; and ATTN-GALLERY-CONTROLBAR-OVERLAP-1 SHIPPED via `2026-07-21-gallery-switcher-slim-bar` — slim single-row switcher bar, footnotes behind a collapsed disclosure; entry graduated to the archive. Earlier: 2026-07-21 SHAREHUB-ROW-ANATOMY-1 graduated to the archive — it was already marked RESOLVED-in-queue by `share-hub-fidelity-fixes`; the SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE cross-reference was repointed from "above" to the archive. Earlier: 2026-07-19 MODAL-SKELETON-CLOSE-1 SHIPPED via `2026-07-19-modal-skeleton-close` — skeleton default nav-close at dismiss-commit + real X; the already-resolved MODAL-CLOSE-EXIT-ANIM-1 block moved to the archive in the same pass. Earlier same day: BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 shipped via the 28px chevron gutter + HoverHelp display:none fix; ALERT-COPY-EMDASH-1 via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 via alert-surface-ui ARC-2.)

---

### HOVERHELP-CLAMP-CARET-1 — [P3] no caret under horizontal clamp; no blur-close while focus wanders

From the impeccable critique of `hoverhelp-smart-position` (2026-07-22, Assessment A 34/40). Two folded P3s: (1) when the §4.2 horizontal clamp slides the popover body away from its trigger there is no caret/pointer affordance tying body to trigger — precisely in the collision cases the feature serves; (2) the popover stays open while keyboard focus wanders elsewhere (no blur-close) — pre-existing behavior, unchanged by the portal work, slightly amplified in modals where the body is no longer visually adjacent. Both cosmetic-tier; the dual-gate mandates P0/P1 only. The critique's P1 (modal Tab adjacency) was refuted by spec ratification (spec 2026-07-22-hoverhelp-smart-position:149) and is recorded in the critique snapshot, not here.

**Un-defer trigger:** user reports losing track of which trigger an open popover belongs to (caret), or confusion from a popover lingering after tabbing away (blur-close).

### STRIP-MOBILE-WRAP-1 — [P2] the control strip wraps to a second row at 390px (44px → 80px)

From the impeccable close-out of `modal-header-reconciliation`. §4.5 collapses the sync/edited stack to one line, trading height for WIDTH; §4.3 simultaneously adds a Re-sync trigger to the same row. Below `sm` the strip's `flex-wrap` is live and the row breaks: **44px → 80px** at 390px (`sm:flex-nowrap` leaves ≥sm untouched, so desktop is unaffected). Spec and plan both costed the height saving and neither anticipated the width cost.

**Accepted, not fixed.** Wrapping is the correct responsive behavior here and the alternatives are worse for the actual user: Doug is on a venue floor, one-handed, mid-show, and every control in the band is one he reaches for — truncating or horizontally scrolling a live publish toggle, a Re-sync, or the copy-crew-link button to protect 36px of vertical space is the wrong trade. The band is chrome, not content; the modal body still scrolls independently. The wrap is also already partly designed for: the `·` control divider is `hidden sm:block`, so it does not orphan onto row two.

**Un-defer trigger:** user feedback that the mobile modal header feels tall or that controls jump between rows as status text changes length (the wrap point is data-dependent — it moves with the relative-time strings). The fix is then a deliberate mobile reflow — status line dropped to its own row by explicit `basis-full` rather than incidental wrapping — NOT tightening spacing to squeeze one row.

### STRIP-SKELETON-MOBILE-BAND-1 — [P2] skeleton control band cannot match the loaded band at 390px (73px vs 149px)

Direct consequence of `STRIP-MOBILE-WRAP-1`, surfaced by Task 9's band-parity spec. At ≥sm the skeleton and loaded subheader bands match exactly (**E = 0.00px at 1280**), and the header→subheader seam — the invariant that actually causes the visible load-time snap — matches at **D = 0.30px at BOTH viewports** (bound ≤8px; it failed red at 45.70px/9.70px pre-fix). At 390px the loaded strip wraps to three rows (149px) against the skeleton's single-row 73px.

**Accepted, not fixed, and the tolerance was NOT widened** (the plan explicitly forbids that). The plan nominated skeleton bar heights as the lever, but they cannot close this: the wrap point is a function of rendered DATA, since the status line's width depends on its relative-time strings. Sizing placeholders to reproduce one fixture's 3-row wrap was rejected as overfitting — it would go green while asserting nothing about any real show. The 390px case therefore asserts an honest weaker clause (band reserves ≥ one tap row + `py-2`, never exceeds the loaded band) and the ≤4px strictness is kept at ≥sm where its "single control row" premise actually holds.

**Un-defer trigger:** resolving `STRIP-MOBILE-WRAP-1` (a deliberate mobile reflow makes the loaded mobile band deterministic, at which point exact parity becomes assertable again), or user reports of a visible header jump on mobile loads.

### SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE — [P1/P2/P3] impeccable critique of the fidelity-fix diff

From the invariant-8 dual-gate on the share-hub-fidelity-fixes diff (Assessment A, 31/40).
`SHAREHUB-ROW-ANATOMY-1` (the run's primary P1) is RESOLVED (archived in
[DEFERRED-archive.md](./DEFERRED-archive.md)). The remaining findings
are recorded here with dispositions; none is a P0 and none blocks merge. (One refuted
finding — "Careful rows carry no visual weight" — is not a deferral and lives in
[DEFERRED-archive.md](./DEFERRED-archive.md) under Share hub.)

- **[P1] Caret is anchored to the kebab, not the trigger that opened the popover.** ~~Deferred.~~
  **RESOLVED (fix/sharehub-caret-anchor).** A `useLayoutEffect` in `ShareHub.tsx` now measures
  the opening trigger's centre against the group's right edge and sets the caret's `right`
  inline (`caretRightPx`), so the caret anchors under whichever trigger opened the popover;
  `right-[17px]` remains the kebab-centred fallback (SSR/jsdom, and the correct value when the
  kebab is the opener). Recomputed on resize while open. Spec §5's `right-[17px]` is preserved
  as that fallback, not removed. Proof: `T-HUB-CARET` (inverted — opened from primary, caret
  centres on primary, explicitly NOT the kebab) + new `T-HUB-CARET-KEBAB` in
  `published-review-modal.interactions.spec.ts`.

- **[P2] Focus-ring inconsistency within the popover** (reset carries `ring-offset-2`, rotate
  and the mailto rows do not). Spec §4.1 RATIFIES retaining reset's offset pair verbatim,
  precisely so a destructive control's focus treatment is not silently changed by this diff.
  The tension (three focus renders in one group) is real but the spec chose retention; the
  spec wins over the critique (impeccable is not authoritative vs a ratified spec). **Noted,
  not changed.** Un-defer trigger: a deliberate focus-treatment pass across the whole popover.

- **[P3] Caret lacks `shadow-popover`.** A drop shadow on a rotated 10px diamond casts an odd
  smudge rather than continuing the panel's elevation; the caret reads as continuous with the
  panel via matching `bg-surface` + border + same `z-40`. **Noted, not changed.**

### warning-panel-polish (2026-07-22) — impeccable critique deferrals

Dual-gate run on the polish diff: critique 34/40, audit 20/20, zero P0/P1 (dispositions in
`docs/superpowers/plans/2026-07-22-warning-panel-polish/handoff.md` §12). Audit's three
comment-accuracy P3s were fixed in-branch; these four critique findings stay open:

- **[P2] Bulk ignore produces two polite announcements in one refresh.** The bulk chip's own
  `role="status"` (`components/admin/BulkIgnoreControls.tsx:175`) and the panel's new
  count-tuple live region both change on the same server round trip, so a screen reader queues
  two status messages for one action. Polite regions queue rather than clobber, so nothing is
  lost — but the pairing is chatty. **Noted, not changed.** Un-defer trigger: an accessibility
  pass composing the modal's live regions (same trigger family as the original live-region
  deferral this bundle resolved).

- **[P2] The live region announces background count changes.** `role="status"` speaks on ANY
  text change, including a realtime refresh (#505) altering counts mid-task. This gives
  screen-reader users parity with sighted users (who see counts change silently) — but the
  state-vs-action choice was inherited, not ratified. **Noted, not changed.** Un-defer trigger:
  an owner decision on whether the panel's live region reports STATE (current behavior) or only
  Doug-initiated ACTIONS.

- **[P3] The elsewhere sentence opens with an apology before the action.** "Nothing else to
  note here." precedes the tappable pointer; the actionable half should arguably lead.
  Re-opens spec-authored copy (§3.5 kept the ratified frame). **Noted, not changed.**

- **[P3] "and N more." is a dead end.** Non-interactive, and a label-resolution miss silently
  folds into N (the defensive guard has no live producer today — every elsewhere section is a
  rendered registry section). **Noted, not changed.** Un-defer trigger: a section registry
  change that makes label misses producible.

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

# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-22 (WARNCARD-POPOVER-OVERLAP-1 graduated to the archive — resolved by `feat/hoverhelp-smart-position` collision-aware placement. Earlier: 2026-07-21 SHAREHUB-ROW-ANATOMY-1 graduated to the archive — it was already marked RESOLVED-in-queue by `share-hub-fidelity-fixes`; the SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE cross-reference was repointed from "above" to the archive. Earlier: 2026-07-19 MODAL-SKELETON-CLOSE-1 SHIPPED via `2026-07-19-modal-skeleton-close` — skeleton default nav-close at dismiss-commit + real X; the already-resolved MODAL-CLOSE-EXIT-ANIM-1 block moved to the archive in the same pass. Earlier same day: BELL-HELP-POPOVER-OVERFLOW-1 + BELL-SLOT-WIDTH-1 shipped via the 28px chevron gutter + HoverHelp display:none fix; ALERT-COPY-EMDASH-1 via EMDASH-1; ALERT-COPY-IDENTITY-BOLD-1 / ALERT-CHEVRON-HINT-1 / ALERT-MULTI-CHANGE-TONE-1 / PERSHOW-LINK-TAPTARGET-1 via alert-surface-ui ARC-2.)

---

### ATTN-GALLERY-CONTROLBAR-OVERLAP-1 — [P2] switcher control bar overlaps the modal's constant header

From the impeccable critique of `attention-modal-switcher-gallery` (2026-07-21). The switcher's control bar (`components/admin/dev/SwitcherControls.tsx`, `fixed top-0 z-60`) sits above the real modal (`z-50`) by design (spec §3.4, so it escapes the inert root), and on desktop covers the modal's top ~90px; on a 390px viewport the wrapped bar covers more. What it covers is the modal's CONSTANT fake-show header ("Gallery Preview Show" title + subline) — the modal's close X (top-right) and all scenario-specific attention content stay fully visible and operable (e2e-verified: `tests/e2e/attention-modal-gallery.spec.ts` operability + close tests). Deferred: this is a dev-only instrument (`app/admin/dev/`, build-gated), the obscured content carries no scenario information, and the impeccable tier is P2 (the dual-gate mandates P0/P1 only).

**Un-defer trigger:** if the gallery gains a per-scenario modal header (non-constant title), or a real operator reports losing the modal's close affordance — then offset the modal below the bar or make the bar a single collapsible row.

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

## warning-surface-trim (2026-07-21) — impeccable critique

- **[P1] The heading count reads "(0)" in the Silent state while cards render below it.**
  Spec §3.3 ratifies the rail count as "the rows the panel renders", with extras signalled
  separately. The critique argues the heading count is a different surface from the rail and
  should include the `here` bucket, since those cards sit inside the same `<section>`. Both
  readings are defensible and they disagree about a ratified number, so the count is left as
  specified rather than changed unilaterally at implementation time. The self-contradiction the
  critique actually named, "(0)" wearing an amber "Needs a look" pill in one text run, IS fixed:
  the pill now derives from the ACTIVE bucket count. **Noted, not changed.** Un-defer trigger:
  an owner decision on whether the heading count and the rail count may diverge.

- **[P3] The panel is still titled "Parse warnings" though it now holds info-severity
  leftovers.** Ratified user decision, spec §1.1 ("a published-only rename splits the rail label
  between staged and published for a panel whose identity is unchanged"). **Noted, not changed.**

- **[P2] The popover renders two sentences as one run, not two paragraphs.** `HoverHelp` renders
  its body in a plain `<div>` with no `whitespace-pre-line` (`components/admin/HoverHelp.tsx:254`),
  so a real break would mean changing the SHARED popover body and every other popover on the
  surface. The composed text is honest prose either way. **Noted, not changed.** Un-defer trigger:
  a deliberate typographic pass on the shared popover.

### warning-surface-trim — impeccable audit (2026-07-21)

- **[P2] No live region announces the panel's state change.** Ignoring or un-ignoring a row
  re-renders the panel through a server round trip, so the empty-state line mounts or unmounts
  with nothing announced. Pre-existing on this surface (the panel had no live region before the
  trim either), and the correct fix is an always-mounted `role="status"` sibling carrying the
  current state, matching `components/admin/BulkIgnoreControls.tsx:174-177`. **Noted, not
  changed.** Un-defer trigger: an accessibility pass on the show modal's dynamic regions.

- **[P2] The follow-up sentence enters every card's accessible description.** `HoverHelp` keeps
  its popover body in the DOM for `aria-describedby`, so a 12-card section repeats the same
  sentence 12 times in screen-reader output, where the retired panel callout said it once. The
  per-card placement is ratified in spec §4 (it exists only where a warning exists, which is what
  killed the status-strip alternative), and moving it to a per-GROUP eyebrow is a design change
  that spec §4.1 did not consider. **Noted, not changed.** Un-defer trigger: an owner decision on
  per-card versus per-group placement.

- **[P2] "…are in their own sections" names no section.** Spec §3.4 authored copy. Naming the
  sections would make the line variable-length and unbounded; a jump affordance is the better fix
  and is out of scope. **Noted, not changed.**

- **[P3] The extras `border-t` reads as a heading underline when the card is suppressed**
  (`components/admin/showpage/sectionWarningExtras.tsx:126`). Cosmetic, only in the Silent state.
  **Noted, not changed.**

- **[P3] `data-warning-index` comment still says "FULL-array index"** though `i` now indexes the
  trimmed rows (`components/admin/wizard/step3ReviewSections.tsx:2573-2576`). Harmless today: the
  only consumer is the staged jump path, which is never gated. **Noted, not changed.**

### warning-surface-trim — whole-diff cross-model review (2026-07-21)

- **[MEDIUM] The staged-mode byte-identical guarantee rests on a leaf render plus a card-level
  snapshot.** `tests/components/admin/stagedCardBaseline.test.tsx` renders `StagedReviewCard`
  directly and snapshots the card `<li>` elements, so a change to the surrounding wizard chrome,
  to card ordering relative to other content, or to a wizard-only prop is invisible to it. The
  ungated assertions in the other suites use PUBLISHED data with the gate off, which exercises
  the ungated code path but not the staged surface. **Noted, not changed.** A real staged-surface
  snapshot needs a wizard-session fixture (staged sessions, use-raw decisions, rescan state) that
  no current suite builds, and this diff's staged path is one boolean that is false there.
  Un-defer trigger: any change that touches the wizard's Step-3 composition rather than only the
  shared registry.

- **[MEDIUM] The alert cut is discoverable only through the bell.** `SHOW_FIRST_PUBLISHED` and
  `ROLE_FLAGS_NOTICE` leave the modal's attention surface, and while the underlying STATE stays
  visible (Published in the status strip, roles in Crew), the EVENT and its point-in-time
  data-gaps digest exist only in the bell feed. An operator who only ever opens show modals can
  miss both. This is the ratified intent of `2026-07-04-alert-audience-split` §3 rather than a
  regression — the codes are info-severity and not actionable by default — but the dependency on
  the operator noticing a separate surface is real. **Noted, not changed.** Un-defer trigger: an
  owner decision to rehome the data-gaps digest onto the show modal.

### warning-surface-trim — impeccable re-gate on the repair diff (2026-07-21)

- **[P2] The correction sentence is reachable twice on one screen in the List state.** The panel
  callout renders it visibly whenever the published body still lists info rows, and each active
  warn card carries it on demand in its `?` popover. Versus `origin/main` this is strictly less
  callout rendering, not more, so it is not a regression — but it is a partial un-retirement of
  what spec §3.5 removed. The alternatives are worse: dropping it for info rows is the P0 this
  repair fixed, and suppressing the per-card copy when the panel body is non-empty would require
  teaching `sectionWarningExtras` about the panel's body state, which is exactly the cross-layer
  coupling the context-threaded gate exists to avoid. **Noted, not changed.** Un-defer trigger: an
  owner decision on whether the panel callout or the per-card popover is the canonical site.

- **[P3] The callout renders even when the only listed info row needs no action** (e.g. a sheet
  whose sole warning is `TYPO_NORMALIZED`). Its copy is conditional ("Fixed it in the sheet?"), so
  it asserts nothing false; scoping it to actionable info codes would mean a per-code registry for
  one sentence. **Noted, not changed.**

### warning-surface-trim — the in-row crew banner has no live producer (2026-07-21)

- **[MEDIUM] `published-show-alerts` §5.4's in-row crew banner is now unreachable in production.**
  A crew banner requires a `crewKey`, which requires a `crewName`
  (`lib/admin/attentionItems.ts:257`). `crewNameFor`
  (`lib/adminAlerts/fetchPerShowAlerts.ts:63`) produces one from exactly two sources: a
  special case for `ROLE_FLAGS_NOTICE`, and a "Crew"-labeled identity segment. This change cuts
  `ROLE_FLAGS_NOTICE` from the modal, and every other crew-routed code carrying a Crew segment
  (`OAUTH_IDENTITY_CLAIMED`) is a health code already filtered upstream at
  `fetchPerShowAlerts.ts:103`. So the feature is intact but has zero producers — the same zombie
  shape that motivated change 3 in the first place, arrived at from the other direction.

  Found at the final gate by a failing e2e, not by the spec: spec §5's impact table enumerated the
  two dropped codes and their routes but did not ask what else consumed them.

  **Noted, not changed.** The placement test at
  `tests/e2e/published-show-attention.spec.ts:126` is SKIPPED rather than deleted, because its
  assertions remain the correct contract and it should un-skip the moment a crew-routed,
  non-health, actionable code carrying a `crewName` exists. Un-defer trigger: an owner decision on
  whether any crew-routed notice should reach the show modal — the options are re-including
  `ROLE_FLAGS_NOTICE` (contradicting the audience split), reclassifying a health code, or
  accepting that crew-routed alerts live only in the bell.

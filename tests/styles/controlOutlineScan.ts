/**
 * The control-outline census — the enumerated set of elements TWO arcs swapped
 * onto `border-text-faint` — 21 from `border-border-strong` on 2026-08-16, and
 * 36 more from `border-border` on 2026-08-18 (57 rows; the swap sets overlap at
 * one element), and a resolver that reads
 * each one back through the interactive-element scanner.
 *
 * This is a REGRESSION PIN, not a cover and not a classifier. It answers exactly
 * one question — "did the elements these PRs changed stay changed" — about a
 * closed set the PR itself defines. It therefore needs no notion of what a
 * switch track is, no cascade reasoning, and no structural inference.
 *
 * Spec: docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md
 *   §4.2 (the 21 rows), §5.2 (why the classifier was CUT), §5.3 (self-proof).
 *
 * DO NOT grow a predicate here. Deciding "is this element a switch track" from
 * the scanner's projection was attempted in five forms across five review rounds
 * and escaped structurally each time (spec §5.2's table). An implementer who
 * finds themselves writing a function that decides whether an ARBITRARY element
 * is a toggle has left the plan.
 */

import { scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

export type CensusRow = {
  /** Repo-relative path, exactly as `scanInteractiveElements` reports it. */
  readonly file: string;
  /** 1-based ELEMENT line, exactly as `scanInteractiveElements` reports it. */
  readonly line: number;
  /**
   * Which outline token this row wears TODAY. Absent means `text-faint`, the
   * token both swaps moved to and what all but three rows still wear.
   *
   * Added 2026-08-25 (`BL-CONTROL-OUTLINE-ON-TINTED-PLATES`, design doc
   * 2026-08-25-ui-polish-class-sweep-design.md D2). Three of these controls
   * stand on a TINTED plate, where `text-faint` measures 2.79-3.04 and misses
   * the 3:1 non-text floor in one theme per plate; they now wear a plate-only
   * token. Recording it on the row keeps this file the record of where each
   * swept control ENDED UP. The alternative — dropping the three rows — would
   * lose the fact that they were part of the 2026-08-16/18 swaps at all, which
   * is the one thing this census exists to remember.
   */
  readonly outline?: "text-faint" | "control-outline-tinted";
};

/**
 * Spec §4.2 rows 1-21 — the §3 census (24 elements carrying
 * `border-border-strong` on 2026-08-16) minus the three cover-visible switch
 * tracks, which are §3 rows 13, 14 and 15 and are OUT by the user's ruling (§2).
 *
 * Identity is `file` PLUS `line`: file alone is not unique. `RoleMappingRow`,
 * `BellPanel`, `StagedReviewCard`, `Step3ReviewModal` and `step3ReviewSections`
 * each contribute two rows out of 6-21 interactive elements in the same file.
 */
export const CENSUS: readonly CensusRow[] = [
  // spec §4.2 row 1 — the edit button, on the neutral row card. Shared the
  // file-local `outlineBtn` constant with row 2 until 2026-08-25, when the
  // outline COLOUR was lifted out of that constant so each call site could
  // supply the one its ground needs; the rest of the treatment is still shared.
  { file: "app/admin/settings/roles/RoleMappingRow.tsx", line: 218 },
  // spec §4.2 row 2 — the remove-confirm button, INSIDE the `bg-warning-bg`
  // confirm card. Moved to the plate token 2026-08-25; no longer moves with
  // row 1, which is why the colour left the shared constant.
  {
    file: "app/admin/settings/roles/RoleMappingRow.tsx",
    line: 361,
    outline: "control-outline-tinted",
  },
  // spec §4.2 row 3 — only its `compact` branch carries the token (§6: the
  // non-compact branch stays `border-border bg-surface` at 1.27:1)
  { file: "app/admin/show/[slug]/ResetPickerEpochButton.tsx", line: 178 },
  // spec §4.2 row 4 — two-arm ternary, BOTH arms carry the token
  { file: "components/admin/ArchiveShowButton.tsx", line: 365 },
  // spec §4.2 row 5
  { file: "components/admin/BellPanel.tsx", line: 858 },
  // spec §4.2 row 6
  { file: "components/admin/BellPanel.tsx", line: 1080 },
  // spec §4.2 row 7 — reject branch
  { file: "components/admin/Mi11GateActions.tsx", line: 69 },
  // spec §4.2 row 8
  { file: "components/admin/RoleRecognizeControl.tsx", line: 225 },
  // spec §4.2 row 9 — picker Link, transparent on `bg-warning-bg` (§4.4). Its
  // `bg-transparent` fill makes BOTH edges the plate, so it was the sharpest
  // instance of the tinted-plate problem; moved to the plate token 2026-08-25.
  {
    file: "components/admin/StagedPreviewBanner.tsx",
    line: 79,
    outline: "control-outline-tinted",
  },
  // spec §4.2 row 10
  { file: "components/admin/StagedReviewCard.tsx", line: 656 },
  // spec §4.2 row 11
  { file: "components/admin/StagedReviewCard.tsx", line: 667 },
  // spec §4.2 row 12
  { file: "components/admin/UnignoreButton.tsx", line: 57 },
  // spec §4.2 row 13 — two-arm ternary, BOTH arms carry the token, and both
  // also carry `max-sm:border-border`, a DIFFERENT token that must survive
  { file: "components/admin/showpage/ShareHub.tsx", line: 781 },
  // spec §4.2 row 14
  { file: "components/admin/telemetry/HealthAlertResolveButton.tsx", line: 24 },
  // spec §4.2 row 15 — Link
  // Line moved 256 -> 257 on 2026-08-27 by feat/telemetry-fallback-retry, which added one
  // import to this file. The ELEMENT is untouched: same `<Link>`, same `border-text-faint`.
  { file: "components/admin/telemetry/HealthAlertsPanel.tsx", line: 257 },
  // spec §4.2 row 16
  { file: "components/admin/wizard/Step3ReviewModal.tsx", line: 797 },
  // spec §4.2 row 17
  { file: "components/admin/wizard/Step3ReviewModal.tsx", line: 883 },
  // spec §4.2 row 18 — spec cites 4121; the live line is 4151 after the
  // 2026-08-16 sibling merges, the last of them #817 (`feat/mutation-section-order`,
  // 11c4fb6ca), which added one net line above both rows. Line numbers are
  // locators, the census is the contract (spec §4.2 closing note): the swap
  // itself survived every one of those merges untouched, and what moved is
  // where it sits. The suite RED that caught this drift is the pin working —
  // `resolveCensus` returns `null` rather than dropping the row.
  // Line moved 4367 -> 4386 on 2026-08-27 by this arc's own Task 4, which added 27 lines
  // and removed 2 above both rows (the placeholder name span and the anchor focus ring),
  // then -39 again when the tile geometry moved out to `diagramTileGeometry.ts`.
  // The ELEMENT is untouched: same `<button>`, same `border-text-faint bg-surface` recipe,
  // and the scanner reports exactly two elements in the window, one per row.
  // Then 4438/4495 -> 4455/4512 when the announce-log import block landed; the `<button>`
  // openers were located again rather than bumped.
  // Then 4455 -> 4471 on 2026-08-28: the diagram-tile chrome ruling replaced the tile anchor's
  // comment block far above, adding 16 lines. Then 4471 -> 4472 later the same day, when diff
  // review R4 corrected a tense error in that same comment and it grew one more line — a COMMENT
  // edit moves these rows exactly as a code edit does, which is the whole hazard of keying by line.
  // LOCATED by the `<button>` opener itself both times, per the instruction two comments up, never
  // by adding a delta.
  //
  // Then 4472 -> 4672 on the wizard-ignore merge. BOTH parents moved this row — main to 4472 for
  // the tile-chrome comment growth, this branch to 4655 for the warnings panel's partition block,
  // dq controls and Ignored (N) disclosure — so NEITHER parent's number describes the merged tree,
  // which is the third time this row has hit that exact situation. Resolved the way the two notes
  // above prescribe and the way the 6441d5e4c merge did: by locating the `<button>` opener on the
  // MERGED file, never by adding the two sides' deltas.
  //
  // Then 4687 -> 4684 on the 2026-08-29 three-way absorb of #940/#941/#942. Same method, and this
  // time with a second discriminator, because the file now holds TWO elements carrying
  // `aria-expanded={expanded}` — the agenda `show-all` toggle at 3600 and this one. The anchor text
  // alone would have been ambiguous; the row was resolved by running the scanner and matching
  // `data-testid={`wizard-step3-card-${dfid}-report-toggle`}`, which is unique.
  // Then 4684 -> 4697 on the R1 repair commit. Same `wizard-step3-card-${dfid}-report-toggle`
  // testid on the merged tree, located by running the scanner.
  // Then 4697 -> 4703 on the R2 repair (the reportShowId prop and its comment).
  // Same report-toggle testid, located by the scanner.
  // Then 4703 -> 4747 -> 4791 on fix/wizard-report-draft-escape, which added the
  // draft storage helpers above ReportIssueSection and then, at diff review R1,
  // a detached-submit guard above them again. Located each time by the unique
  // `wizard-step3-card-${dfid}-report-toggle` testid and its `<button>` opener,
  // per the method the notes above prescribe — never by adding the delta.
  //
  // Then 4791 -> 4813 at diff review R2, which added the surrogate-safe cap.
  // FOUR re-keys in one branch, which is the real lesson: re-key LAST. The first
  // three were each done while the branch still had edits coming, and each was
  // stale within the hour. Every adversarial round that touches this component
  // moves both rows again, so the re-key belongs after the final source edit of
  // the round, not alongside the fix that prompted it.
  // Then 4813 -> 4827 documenting the store-versus-state invariant. Fifth.
  // Then 4827 -> 4778 when the draft-storage helpers were EXTRACTED to
  // lib/admin/reportDraftStore.ts, which is the first move of this arc that went
  // UP. Sixth re-key on one branch.
  // Then 4778 -> 4729, removing the docblocks the extraction orphaned. SEVENTH
  // re-key on one branch, and the count is the point: this row moves on almost
  // every commit that touches the component, so the ONLY safe time to re-key is
  // after the final source edit of a change, immediately before the run that
  // reads it.
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4729 },
  // spec §4.2 row 19 — spec cites 4178; live 4213, same reason as row 18 plus
  // the 2026-08-25 tinted-plate comment above `ArchivedTabRescanNeeded`
  // Line moved 4424 -> 4443 on 2026-08-27 by this arc's own Task 4, which added 27 lines
  // and removed 2 above both rows (the placeholder name span and the anchor focus ring),
  // then -39 again when the tile geometry moved out to `diagramTileGeometry.ts`.
  // The ELEMENT is untouched: same `<button>`, same `border-text-faint bg-surface` recipe,
  // and the scanner reports exactly two elements in the window, one per row.
  // Then the merge of origin/main (6441d5e4c): main moved both rows too, so neither
  // parent's number describes the merged tree. LOCATED on the merged tree by the
  // `<button>` openers themselves (4438 and 4495), then confirmed by the scanner —
  // not by adding the two sides' deltas, which is what put them 5 lines short.
  // Then 4512 -> 4528, then 4528 -> 4529 on 2026-08-28, same causes and same method as the row
  // above. Then 4529 -> 4744 on the wizard-ignore merge, both parents having moved it, located on
  // the merged file by its own `<button>` opener — same cause and same method as row 18. (This
  // note read 4729 until 2026-08-29; the ROW was always 4744 and the guards were green on it, so
  // the stale number was in the prose only. Recorded rather than quietly overwritten, because a
  // comment trail that can drift from its own row is worth knowing about.)
  //
  // Then 4744 -> 4741 on the 2026-08-29 three-way absorb of #940/#941/#942, located by the
  // `disabled={draft.trim()...}` opener on the merged file.
  // Then 4741 -> 4754 on the R1 repair commit, located by its own
  // `disabled={draft.trim()...}` opener.
  // Then 4754 -> 4760 on the R2 repair, same `disabled={draft.trim()...}` opener.
  // Then 4760 -> 4807 on fix/wizard-report-draft-escape. Same
  // `disabled={draft.trim()...}` opener, located on the branch tree. Note the two
  // rows did NOT move by the same amount (row 18 moved 44, this one 47): the draft
  // write in the textarea's onChange sits BETWEEN them, which is exactly why the
  // notes above forbid resolving either row by applying the other's delta.
  // Then 4807 -> 4823 -> 4873 on the same branch: first the impeccable P1 repair
  // added the persistence-guarantee line under the trigger (which moved this row
  // and NOT row 18, since the new element sits below that row's `<button>`), then
  // the R1 detached-submit guard moved both. So the two rows diverged, converged
  // and diverged again inside one branch, which is the case that makes applying
  // one row's delta to the other actively wrong rather than merely lazy.
  // Then 4873 -> 4895 at diff review R2, same cause as row 18.
  // Located by the `disabled={draft.trim()...}` opener on the final tree, every time.
  // Then 4895 -> 4909, same cause. Fifth for this row too.
  // Then 4909 -> 4860, same extraction.
  // Then 4860 -> 4811, same removal.
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4811 },
  // spec §4.2 row 20 — reset chip on `bg-surface-raised` (§4.3)
  { file: "components/diagrams/GalleryLightbox.tsx", line: 728 },
  // spec §4.2 row 21
  // Inside the start-fresh `bg-warning-bg` plate: moved to the plate token
  // 2026-08-25. Its sibling at :675 is on a neutral ground and did not move.
  {
    file: "components/shared/ReportModal.tsx",
    line: 622,
    outline: "control-outline-tinted",
  },

  // ---------------------------------------------------------------------------
  // 2026-08-18 arc — the `border-border` half of the same §1.2a predicate.
  //
  // Spec: docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md
  // 36 ADDITIONS, not 37: the swap set is 37 elements but
  // `ResetPickerEpochButton.tsx:178` is ALREADY row 2 of the 2026-08-16 census
  // above — it is the half-swapped control whose compact branch moved then and
  // whose non-compact branch moves now. Adding it twice breaks the
  // identity-distinct assertion. 21 + 36 = 57.
  //
  // Class A (29) — a full resting outline on one of the four neutral ground
  // tokens. Class B (8) — a full resting outline with NO fill, which §1.2a
  // reaches through its ratified "or left unfilled" clause and the element-level
  // cover never could, because that cover requires a `bg-` token.
  //
  // NOT here, and each absence is a decision: five DIVIDERS (`border-t`/`-b`/
  // `-l`, no resting outline to raise — pinned as non-members below), and
  // ShareHub's `max-sm:` elements. Those were fenced out under class-sweep
  // exception (b) and their token moved anyway on 2026-08-25 (design doc
  // 2026-08-25-ui-polish-class-sweep-design.md D1, closing
  // BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT). They stay OUT OF THIS
  // CENSUS deliberately: `CENSUS` is the record of what the 2026-08-16 and
  // 2026-08-18 swaps moved, and adding a row here would claim ShareHub was
  // part of a swap it was fenced out of. The `adjacent tokens survive the
  // swap` case in the suite still covers them, now asserting the token they
  // moved TO.
  // ---------------------------------------------------------------------------
  { file: "app/admin/show/[slug]/PickerResetControl.tsx", line: 255 },
  { file: "app/admin/show/[slug]/ResetPickerEpochButton.tsx", line: 260 },
  { file: "app/admin/show/[slug]/RotateShareTokenButton.tsx", line: 379 },
  { file: "app/me/meShowSections.tsx", line: 174 },
  { file: "app/me/meShowSections.tsx", line: 213 },
  { file: "app/me/meShowSections.tsx", line: 258 },
  { file: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", line: 240 },
  { file: "app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", line: 109 },
  { file: "app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", line: 127 },
  { file: "components/admin/ArchiveShowButton.tsx", line: 333 },
  { file: "components/admin/HoverHelp.tsx", line: 562 },
  { file: "components/admin/NeedsAttentionInbox.tsx", line: 101 },
  { file: "components/admin/NeedsAttentionInbox.tsx", line: 130 },
  { file: "components/admin/NeedsAttentionInbox.tsx", line: 198 },
  { file: "components/admin/NeedsAttentionInbox.tsx", line: 224 },
  { file: "components/admin/NeedsAttentionSummaryCard.tsx", line: 36 },
  { file: "components/admin/ShowRowActions.tsx", line: 821 },
  { file: "components/admin/UnarchiveShowButton.tsx", line: 67 },
  { file: "components/admin/dev/MaterializeCard.tsx", line: 73 },
  { file: "components/admin/dev/SwitcherControls.tsx", line: 83 },
  { file: "components/admin/dev/SwitcherControls.tsx", line: 92 },
  { file: "components/admin/dev/SwitcherControls.tsx", line: 142 },
  { file: "components/admin/nav/UserMenu.tsx", line: 51 },
  // :814 / :993 until 2026-08-27 — the isWarnSeverity import line (spec §2.1).
  // :815 / :994 until 2026-08-27 — the attentionJump effect gained the
  // details-opening loop (spec §4.4), 11 lines above both.
  { file: "components/admin/review/ShowReviewSurface.tsx", line: 838 },
  { file: "components/admin/review/ShowReviewSurface.tsx", line: 1019 },
  // :979 until 2026-08-27 — the sheetWarnings memo and navigateWarning sit
  // above the pill button (spec §4.1/§4.4).
  { file: "components/admin/showpage/PublishedReviewModal.tsx", line: 1083 },
  { file: "components/admin/telemetry/AutoRefreshControl.tsx", line: 119 },
  { file: "components/admin/wizard/CrewRowActions.tsx", line: 339 },
  { file: "components/agenda/AgendaEmbed.tsx", line: 83 },
  { file: "components/agenda/AgendaPdfViewer.tsx", line: 198 },
  { file: "components/crew/SectionChipLink.tsx", line: 48 },
  { file: "components/crew/primitives/PersonRow.tsx", line: 196 },
  { file: "components/crew/primitives/PersonRow.tsx", line: 213 },
  { file: "components/layout/ThemeToggle.tsx", line: 92 },
  { file: "components/shared/ReportButton.tsx", line: 142 },
  { file: "components/shared/ReportModal.tsx", line: 675 },
];

/**
 * The five DIVIDERS, pinned as NON-members of the census (spec §3.3).
 *
 * Each paints ONE side as a rule between stacked content, so none has a resting
 * outline to raise and the 2026-08-18 ruling's words do not reach any of them —
 * §1.2a preserves the border tokens for dividers by name. Only the first sits
 * inside the published derived cover; the other four were never in it, because
 * they carry no neutral fill token.
 *
 * The suite asserts THREE things per row, not one. Absence from CENSUS alone
 * would stay green if a later arc deleted the token from a divider, which would
 * violate the exclusion while looking clean (plan review R1 F2).
 */
export const DIVIDERS: readonly CensusRow[] = [
  { file: "components/admin/BellPanel.tsx", line: 1221 },
  { file: "components/admin/RecentAutoAppliedStrip.tsx", line: 447 },
  // :189 until 2026-08-27. The needs-you row moved into the exported
  // AttentionMenuRow (spec §5) so the wizard index renders the same row; the
  // divider recipe itself is byte-identical, pinned by the committed baseline.
  { file: "components/admin/showpage/AttentionMenu.tsx", line: 304 },
  // :85 until 2026-08-26. The control-outline-cover sweep gave `FilterTextInput`
  // its own outline recipe and a `cn` import, which moved every element below
  // it. The divider itself is untouched; what moved is where it sits.
  { file: "components/admin/telemetry/EventFilters.tsx", line: 97 },
  { file: "components/crew/primitives/KeyTimesStrip.tsx", line: 191 },
];

export type ResolvedCensusRow = {
  readonly row: CensusRow;
  /** The scanned element at that `file`+`line`, or `null` if none is there. */
  readonly element: ScanElement | null;
};

/**
 * Read every census row back out of the live tree.
 *
 * A row that no longer resolves comes back `null` rather than dropping out of
 * the result, so the suite can RED on it. Silently shrinking the iteration is
 * the failure mode that makes an enumerated pin worthless (spec §5.3).
 */
export function resolveCensus(rootDir: string): readonly ResolvedCensusRow[] {
  const scanned = scanInteractiveElements(rootDir);
  return CENSUS.map((row) => ({
    row,
    element: scanned.find((e) => e.file === row.file && e.line === row.line) ?? null,
  }));
}

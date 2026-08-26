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
  { file: "components/admin/telemetry/HealthAlertsPanel.tsx", line: 256 },
  // spec §4.2 row 16
  { file: "components/admin/wizard/Step3ReviewModal.tsx", line: 604 },
  // spec §4.2 row 17
  { file: "components/admin/wizard/Step3ReviewModal.tsx", line: 688 },
  // spec §4.2 row 18 — spec cites 4121; the live line is 4151 after the
  // 2026-08-16 sibling merges, the last of them #817 (`feat/mutation-section-order`,
  // 11c4fb6ca), which added one net line above both rows. Line numbers are
  // locators, the census is the contract (spec §4.2 closing note): the swap
  // itself survived every one of those merges untouched, and what moved is
  // where it sits. The suite RED that caught this drift is the pin working —
  // `resolveCensus` returns `null` rather than dropping the row.
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4201 },
  // spec §4.2 row 19 — spec cites 4178; live 4213, same reason as row 18 plus
  // the 2026-08-25 tinted-plate comment above `ArchivedTabRescanNeeded`
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4258 },
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
  { file: "components/admin/review/ShowReviewSurface.tsx", line: 814 },
  { file: "components/admin/review/ShowReviewSurface.tsx", line: 993 },
  { file: "components/admin/showpage/PublishedReviewModal.tsx", line: 979 },
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
  { file: "components/admin/showpage/AttentionMenu.tsx", line: 189 },
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

/**
 * The control-outline census — the enumerated set of elements this arc swapped
 * from `border-border-strong` to `border-text-faint`, and a resolver that reads
 * each one back through the interactive-element scanner.
 *
 * This is a REGRESSION PIN, not a cover and not a classifier. It answers exactly
 * one question — "did the 21 elements this PR changed stay changed" — about a
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
  // spec §4.2 row 1 — shares the file-local `outlineBtn` constant with row 2
  { file: "app/admin/settings/roles/RoleMappingRow.tsx", line: 211 },
  // spec §4.2 row 2 — same constant as row 1; ONE source edit moves both
  { file: "app/admin/settings/roles/RoleMappingRow.tsx", line: 343 },
  // spec §4.2 row 3 — only its `compact` branch carries the token (§6: the
  // non-compact branch stays `border-border bg-surface` at 1.27:1)
  { file: "app/admin/show/[slug]/ResetPickerEpochButton.tsx", line: 178 },
  // spec §4.2 row 4 — two-arm ternary, BOTH arms carry the token
  { file: "components/admin/ArchiveShowButton.tsx", line: 365 },
  // spec §4.2 row 5
  { file: "components/admin/BellPanel.tsx", line: 850 },
  // spec §4.2 row 6
  { file: "components/admin/BellPanel.tsx", line: 1072 },
  // spec §4.2 row 7 — reject branch
  { file: "components/admin/Mi11GateActions.tsx", line: 69 },
  // spec §4.2 row 8
  { file: "components/admin/RoleRecognizeControl.tsx", line: 225 },
  // spec §4.2 row 9 — picker Link, transparent on `bg-warning-bg` (§4.4)
  { file: "components/admin/StagedPreviewBanner.tsx", line: 72 },
  // spec §4.2 row 10
  { file: "components/admin/StagedReviewCard.tsx", line: 649 },
  // spec §4.2 row 11
  { file: "components/admin/StagedReviewCard.tsx", line: 660 },
  // spec §4.2 row 12
  { file: "components/admin/UnignoreButton.tsx", line: 57 },
  // spec §4.2 row 13 — two-arm ternary, BOTH arms carry the token, and both
  // also carry `max-sm:border-border`, a DIFFERENT token that must survive
  { file: "components/admin/showpage/ShareHub.tsx", line: 777 },
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
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4151 },
  // spec §4.2 row 19 — spec cites 4178; live 4208, same reason as row 18
  { file: "components/admin/wizard/step3ReviewSections.tsx", line: 4208 },
  // spec §4.2 row 20 — reset chip on `bg-surface-raised` (§4.3)
  { file: "components/diagrams/GalleryLightbox.tsx", line: 693 },
  // spec §4.2 row 21
  { file: "components/shared/ReportModal.tsx", line: 622 },
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

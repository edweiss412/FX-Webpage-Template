/**
 * Single-predicate count for the published Sheet warnings panel (spec §2.3).
 *
 * `panelCount = visibleInfoRows + activeHere`, where:
 *   - `visibleInfoRows` = `visibleWarningRows(warnings, gate).length` (info-only
 *     under the published gate), and
 *   - `activeHere` = `routedWarnings.here` (ACTIVE warnings-homed cards; ignored
 *     cards are excluded by construction, matching today's rail semantics).
 *
 * `elsewhere` is never counted here — the pointer sentence names those sections.
 *
 * Both readers use this one function (single-predicate rule, trim spec §3.2):
 *   - the heading count chip (`step3ReviewSections.tsx` WarningsBreakdown branch), and
 *   - the `railCount` closure for the `warnings` row (`step3ReviewSections.tsx:4218-4225`).
 */
export function sheetWarningsPanelCount(args: {
  visibleInfoRows: number;
  activeHere: number;
}): number {
  return args.visibleInfoRows + args.activeHere;
}

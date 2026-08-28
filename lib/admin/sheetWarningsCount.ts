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

/**
 * Single-predicate count for the WIZARD Sheet warnings panel
 * (wizard-warning-ignore-controls §2.4).
 *
 * `wizardPanelCount = rows - ignoredWarnRows`, where `rows` is the visible list under
 * the wizard gate (both severities) and `ignoredWarnRows` is the ignored partition's
 * size. No control path can create an info-row fingerprint — the panel renders controls
 * on warn rows only (§1.1.4) — so the subtraction only ever removes warn rows.
 *
 * Both readers use this one function, exactly as the published branch above does:
 *   - the heading count chip (`step3ReviewSections.tsx` WarningsBreakdown), and
 *   - the `railCount` closure for the `warnings` row.
 * A rail and a heading that disagree is the defect this shape exists to prevent.
 */
export function wizardPanelCount(args: { rows: number; ignoredWarnCount: number }): number {
  return Math.max(0, args.rows - args.ignoredWarnCount);
}

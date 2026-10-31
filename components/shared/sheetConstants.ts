/**
 * components/shared/sheetConstants.ts — bottom-sheet drag thresholds.
 *
 * Shared by the admin review sheet (`components/admin/review/ReviewModalShell.tsx`)
 * and the crew section sheet, which uses the admin sheet's thresholds (crew page
 * redesign spec §5.2). Behavioral thresholds, not rendered visual values — they
 * never paint a px.
 */

/** Sheet-mode drag distance past which release dismisses the sheet. */
export const DRAG_DISMISS_THRESHOLD_PX = 110;
/** Max pointer travel still treated as a tap (click) rather than a drag. */
export const DRAG_SLOP_PX = 6;

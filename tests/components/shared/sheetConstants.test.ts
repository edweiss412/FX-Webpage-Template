/**
 * The bottom-sheet drag thresholds have one home, shared by the admin review
 * sheet and the crew section sheet (crew page redesign spec §5.2, "Drag to
 * dismiss uses the admin sheet's thresholds").
 *
 * The admin module keeps re-exporting them, so every existing importer of
 * `ReviewModalShell` or `Step3ReviewModal` resolves the same values; these
 * cases pin both the values and that the re-exports are the shared constants,
 * not copies that could drift.
 */
import { describe, expect, it } from "vitest";
import { DRAG_DISMISS_THRESHOLD_PX, DRAG_SLOP_PX } from "@/components/shared/sheetConstants";
import * as shell from "@/components/admin/review/ReviewModalShell";
import * as step3 from "@/components/admin/wizard/Step3ReviewModal";

describe("sheet drag constants", () => {
  it("keeps the admin sheet's values", () => {
    expect(DRAG_DISMISS_THRESHOLD_PX).toBe(110);
    expect(DRAG_SLOP_PX).toBe(6);
  });

  it("is what ReviewModalShell and Step3ReviewModal re-export", () => {
    expect(shell.DRAG_DISMISS_THRESHOLD_PX).toBe(DRAG_DISMISS_THRESHOLD_PX);
    expect(shell.DRAG_SLOP_PX).toBe(DRAG_SLOP_PX);
    expect(step3.DRAG_DISMISS_THRESHOLD_PX).toBe(DRAG_DISMISS_THRESHOLD_PX);
    expect(step3.DRAG_SLOP_PX).toBe(DRAG_SLOP_PX);
  });
});

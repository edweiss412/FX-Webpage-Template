import { describe, expect, test } from "vitest";
import { staleBannerFor } from "@/app/show/[slug]/[shareToken]/staleBanner";
import { getCrewFacing } from "@/lib/messages/lookup";

describe("staleBannerFor (per-crew reset banner mapping)", () => {
  test("selection_reset maps to the epoch-stale crew banner (accurate re-pick copy)", () => {
    expect(staleBannerFor("selection_reset")).toBe("PICKER_EPOCH_STALE_BANNER");
    // Anti-tautology: assert the mapped code carries the re-pick crew copy (data source, not a literal).
    expect(getCrewFacing("PICKER_EPOCH_STALE_BANNER")).toBeTruthy();
    // selection_reset shares epoch_stale's banner (both are "Doug reset — pick again").
    expect(staleBannerFor("selection_reset")).toBe(staleBannerFor("epoch_stale"));
    // ...and is NOT the misleading claimed-after-pick banner.
    expect(staleBannerFor("selection_reset")).not.toBe(
      staleBannerFor("identity_invalidated"),
    );
  });

  test("other stale kinds keep their existing banners", () => {
    expect(staleBannerFor("epoch_stale")).toBe("PICKER_EPOCH_STALE_BANNER");
    expect(staleBannerFor("removed_from_roster")).toBe("PICKER_REMOVED_FROM_ROSTER_BANNER");
    expect(staleBannerFor("identity_invalidated")).toBe("PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER");
  });
});

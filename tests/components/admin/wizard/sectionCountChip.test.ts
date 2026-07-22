/**
 * tests/components/admin/wizard/sectionCountChip.test.ts
 * (unread-callout-dedup spec §3, Fix B)
 *
 * `shouldShowSectionCount` gates the section-heading "(count)" chip. Exhaustive
 * over the decision variables so every branch of the count-suppression rule is
 * pinned, not just the one bug that motivated it.
 */
import { describe, expect, it } from "vitest";
import { shouldShowSectionCount } from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

describe("shouldShowSectionCount (Fix B count-suppression)", () => {
  it("suppresses the chip for a counted section that is flagged with zero body rows", () => {
    // The motivating bug: '(0)' beside 'Needs a look' reads as a broken tile.
    expect(shouldShowSectionCount(0, "rooms", true)).toBe(false);
  });

  it("keeps the chip for a counted section with a zero count that is NOT flagged", () => {
    expect(shouldShowSectionCount(0, "contacts", false)).toBe(true);
  });

  it("keeps the chip for a counted section flagged with a non-zero count", () => {
    expect(shouldShowSectionCount(3, "crew", true)).toBe(true);
    expect(shouldShowSectionCount(3, "crew", false)).toBe(true);
  });

  it("never shows a chip for a non-counted section, regardless of count/flag", () => {
    expect(shouldShowSectionCount(0, "event", true)).toBe(false);
    expect(shouldShowSectionCount(5, "venue", false)).toBe(false);
  });

  it("never shows a chip for a null count (agenda) or a sub-block with no sectionId", () => {
    expect(shouldShowSectionCount(null, "agenda", false)).toBe(false);
    expect(shouldShowSectionCount(5, undefined, false)).toBe(false);
  });

  it("covers every counted section under the flagged-zero carve-out", () => {
    const counted: SectionId[] = ["crew", "contacts", "rooms", "warnings"];
    for (const id of counted) {
      expect(shouldShowSectionCount(0, id, true)).toBe(false);
      expect(shouldShowSectionCount(2, id, true)).toBe(true);
    }
  });
});

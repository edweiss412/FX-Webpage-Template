import { describe, expect, it } from "vitest";

import {
  bellAccessibleName,
  bellAnnounceableCount,
  navBadgeArrivalAnnouncement,
} from "@/components/admin/nav/navArrivalAnnounce";

/**
 * Task 1 of the nav-badge arrival announcement (spec §3.3, §3.6).
 *
 * Expected strings are LITERALS on purpose. Deriving them from each case's own
 * numbers would make the test reimplement the function, which is the tautology
 * the anti-tautology rule forbids. The copy is the contract, so the literal is
 * the assertion.
 */
describe("navBadgeArrivalAnnouncement", () => {
  it("joins both halves, bell first", () => {
    // Catches: wrong order, wrong join, a missing half.
    expect(navBadgeArrivalAnnouncement(3, 2)).toBe(
      "3 unseen notifications. 2 items need attention.",
    );
  });

  it("uses the singular noun on both halves at a count of 1", () => {
    // Catches: a plural-only implementation.
    expect(navBadgeArrivalAnnouncement(1, 1)).toBe(
      "1 unseen notification. 1 item needs attention.",
    );
  });

  // The two cases below are the reason (1,1) and (3,2) are not enough. A mutant
  // that picks each half's grammar from the OTHER argument agrees with both of
  // them, and passed all twelve cases of an earlier revision of this table.
  it("picks the bell's grammar from the bell count, not the attention count", () => {
    expect(navBadgeArrivalAnnouncement(1, 2)).toBe(
      "1 unseen notification. 2 items need attention.",
    );
  });

  it("picks the attention grammar from the attention count, not the bell count", () => {
    expect(navBadgeArrivalAnnouncement(3, 1)).toBe(
      "3 unseen notifications. 1 item needs attention.",
    );
  });

  it("drops a zero attention half", () => {
    // Catches: a zero leaking into the sentence.
    expect(navBadgeArrivalAnnouncement(3, 0)).toBe("3 unseen notifications.");
  });

  it("drops a zero bell half", () => {
    expect(navBadgeArrivalAnnouncement(0, 2)).toBe("2 items need attention.");
  });

  it("returns null when both halves are zero", () => {
    // Catches: announcing an empty or whitespace-only sentence.
    expect(navBadgeArrivalAnnouncement(0, 0)).toBeNull();
  });

  it("returns null when both halves are null", () => {
    // Catches: a pending read treated as zero.
    expect(navBadgeArrivalAnnouncement(null, null)).toBeNull();
  });

  it("speaks a non-integer count, because the contract is total", () => {
    // Catches: Number.isInteger substituted for Number.isFinite. Neither loader
    // can produce a fraction; spec §3.6 specifies the function as total anyway.
    expect(navBadgeArrivalAnnouncement(2.5, null)).toBe("2.5 unseen notifications.");
  });

  it("drops NaN", () => {
    expect(navBadgeArrivalAnnouncement(NaN, 2)).toBe("2 items need attention.");
  });

  it("drops a negative count", () => {
    // Catches: `> 0` written as `>= 0`, and unfiltered negatives.
    expect(navBadgeArrivalAnnouncement(-1, 2)).toBe("2 items need attention.");
  });

  it("drops Infinity", () => {
    expect(navBadgeArrivalAnnouncement(Infinity, 2)).toBe("2 items need attention.");
  });

  it("speaks the true bell count above the 9+ display cap", () => {
    expect(navBadgeArrivalAnnouncement(12, null)).toBe("12 unseen notifications.");
  });

  it("speaks the true attention count above the 9+ display cap", () => {
    // AC-8 ranges over BOTH halves; the bell case alone left this unpinned.
    expect(navBadgeArrivalAnnouncement(null, 12)).toBe("12 items need attention.");
  });
});

describe("bellAnnounceableCount", () => {
  it("returns null under degraded, even with a retained count", () => {
    // The degraded branch renders no numeric badge, so the count is real state
    // but is not DISPLAYED, and what is not displayed is not spoken (spec §3.2).
    expect(bellAnnounceableCount(4, true)).toBeNull();
  });

  it("returns the count when not degraded", () => {
    // Negative control for the row above: a selector returning null
    // unconditionally would pass every degraded case vacuously.
    expect(bellAnnounceableCount(4, false)).toBe(4);
  });

  it("returns a non-integer count unchanged", () => {
    expect(bellAnnounceableCount(2.5, false)).toBe(2.5);
  });
});

describe("bellAccessibleName", () => {
  it("interpolates the true count above the display cap", () => {
    expect(bellAccessibleName(12, false)).toBe("Notifications: 12 unseen");
  });

  it("omits the count entirely at zero", () => {
    expect(bellAccessibleName(0, false)).toBe("Notifications");
  });
});

// tests/admin/warningsPanelStatus.test.ts
/** Spec §3.2 copy table. Catches: a transition that changes one bucket but not
 *  the text (injectivity over single-bucket changes), and wrong grammar at n=1. */
import { describe, expect, it } from "vitest";
import { warningsPanelStatusSentence } from "@/lib/admin/warningsPanelStatus";

describe("warningsPanelStatusSentence (spec §3.2)", () => {
  it("exact strings per part and grammatical number", () => {
    expect(warningsPanelStatusSentence(0, 0, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(1, 0, 0)).toBe("1 warning listed.");
    expect(warningsPanelStatusSentence(2, 0, 0)).toBe("2 warnings listed.");
    expect(warningsPanelStatusSentence(0, 1, 0)).toBe("1 warning needs a look below.");
    expect(warningsPanelStatusSentence(0, 3, 0)).toBe("3 warnings need a look below.");
    expect(warningsPanelStatusSentence(0, 0, 1)).toBe("1 warning needs a look in its own section.");
    expect(warningsPanelStatusSentence(0, 0, 4)).toBe(
      "4 warnings need a look in their own sections.",
    );
    expect(warningsPanelStatusSentence(2, 1, 3)).toBe(
      "2 warnings listed. 1 warning needs a look below. 3 warnings need a look in their own sections.",
    );
  });

  it("invalid inputs normalize to zero, never render literally", () => {
    expect(warningsPanelStatusSentence(Number.NaN, 0, 0)).toBe(
      "Nothing needs a look on this sheet.",
    );
    expect(warningsPanelStatusSentence(-2, 0, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(Number.POSITIVE_INFINITY, 0, 0)).toBe(
      "Nothing needs a look on this sheet.",
    );
    expect(warningsPanelStatusSentence(2.7, 0, 0)).toBe("2 warnings listed.");
    // Same four failure classes for the OTHER two arguments (review IIa-2).
    expect(warningsPanelStatusSentence(0, Number.NaN, -1)).toBe(
      "Nothing needs a look on this sheet.",
    );
    expect(warningsPanelStatusSentence(0, Number.POSITIVE_INFINITY, Number.NaN)).toBe(
      "Nothing needs a look on this sheet.",
    );
    expect(warningsPanelStatusSentence(0, 1.9, 0)).toBe("1 warning needs a look below.");
    expect(warningsPanelStatusSentence(0, 0, 2.2)).toBe(
      "2 warnings need a look in their own sections.",
    );
    expect(warningsPanelStatusSentence(0, -3, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(0, 0, Number.POSITIVE_INFINITY)).toBe(
      "Nothing needs a look on this sheet.",
    );
  });

  it("single-bucket changes always change the text (production ignore transitions)", () => {
    const base = warningsPanelStatusSentence(2, 2, 2);
    expect(warningsPanelStatusSentence(1, 2, 2)).not.toBe(base);
    expect(warningsPanelStatusSentence(2, 1, 2)).not.toBe(base);
    expect(warningsPanelStatusSentence(2, 2, 1)).not.toBe(base);
  });
});

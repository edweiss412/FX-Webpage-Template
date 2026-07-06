import { describe, expect, it } from "vitest";
import {
  tierForItem,
  allowedActionsFor,
  actionLabel,
  expectedRenameValue,
} from "@/lib/admin/step3ReviewItemTiers";
import type { TriggeredReviewItem } from "@/lib/parser/types";

const item = (o: Record<string, unknown>) => o as unknown as TriggeredReviewItem;

describe("tierForItem (spec §4.4 rule, not enumeration)", () => {
  it("≥2 allowed actions → tier3 radio (MI-12/13/14)", () => {
    for (const inv of ["MI-12", "MI-13", "MI-14"] as const) {
      const it2 = item({ id: "i", invariant: inv, removed_name: "A", added_name: "B", email: "e" });
      expect(allowedActionsFor(it2).length).toBeGreaterThanOrEqual(2);
      expect(tierForItem(it2)).toBe("tier3_radio");
    }
  });
  it("1 action + pure-context invariant → tier1", () => {
    expect(tierForItem(item({ id: "i", invariant: "ONBOARDING_SCAN_REVIEW" }))).toBe("tier1_context");
    expect(tierForItem(item({ id: "i", invariant: "FIRST_SEEN_REVIEW" }))).toBe("tier1_context");
  });
  it("1 action + other invariant → tier2 diagnostic (MI-6, orphans, DIAGRAMS_*)", () => {
    for (const inv of ["MI-6", "MI-13-orphan-remove", "DIAGRAMS_EMBEDDED_NONE_FOUND"] as const) {
      const it2 = item({ id: "i", invariant: inv });
      expect(allowedActionsFor(it2).length).toBe(1);
      expect(tierForItem(it2)).toBe("tier2_diagnostic");
    }
  });
});

describe("labels + rename target preserved verbatim on extraction", () => {
  it("wizard-mode apply → 'Approve'; live-mode → 'Apply this change'", () => {
    const mi6 = item({ id: "i", invariant: "MI-6" });
    expect(actionLabel("apply", mi6, true)).toBe("Approve");
    expect(actionLabel("apply", mi6, false)).toBe("Apply this change");
  });
  it("rename target from added_name (MI-13)", () => {
    const mi13 = item({ id: "i", invariant: "MI-13", removed_name: "A", added_name: "B" });
    expect(expectedRenameValue(mi13)).toBe("B");
    expect(actionLabel("rename", mi13, true)).toBe('Rename to "B"');
  });
});

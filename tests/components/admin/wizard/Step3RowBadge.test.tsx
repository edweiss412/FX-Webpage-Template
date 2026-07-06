import { describe, expect, it } from "vitest";
import { badgeForDisplayState } from "@/components/admin/wizard/Step3Review";
import type { Step3DisplayState } from "@/lib/admin/step3DisplayState";

describe("badgeForDisplayState (spec §4.2 badge tones — derived, never reaches back to raw status)", () => {
  it("ready_to_publish → positive tone, 'Ready to publish'", () => {
    const b = badgeForDisplayState("ready_to_publish");
    expect(b.label).toBe("Ready to publish");
    expect(b.tone).toBe("ok");
  });
  it("held → neutral tone, 'Held'", () => {
    const b = badgeForDisplayState("held");
    expect(b.label).toBe("Held");
    expect(b.tone).toBe("info");
  });
  it("live → accent tone, 'Live'", () => {
    expect(badgeForDisplayState("live")).toEqual({ label: "Live", tone: "ok" });
  });
  it("distinct copy for set_aside vs skipped (plan-R1)", () => {
    expect(badgeForDisplayState("set_aside").label).toBe("Set aside for this setup");
    expect(badgeForDisplayState("skipped").label).toBe("Skipped (not a sheet)");
  });
  it("ready → idle 'Ready'", () => {
    expect(badgeForDisplayState("ready")).toEqual({ label: "Ready", tone: "info" });
  });
  it("all three needs_review_* → 'Needs review' warn", () => {
    for (const s of ["needs_review_other", "needs_review_reapply", "needs_review_no_details"] as const) {
      expect(badgeForDisplayState(s)).toEqual({ label: "Needs review", tone: "warn" });
    }
  });
  it("total: every Step3DisplayState resolves to a badge (no fallthrough undefined)", () => {
    const all: Step3DisplayState[] = [
      "needs_review_other",
      "needs_review_reapply",
      "needs_review_no_details",
      "set_aside",
      "skipped",
      "live",
      "ready_to_publish",
      "held",
      "ready",
    ];
    for (const s of all) {
      const b = badgeForDisplayState(s);
      expect(typeof b.label).toBe("string");
      expect(["ok", "warn", "info", "blocked"]).toContain(b.tone);
    }
  });
});

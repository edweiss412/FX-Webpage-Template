import { describe, it, expect } from "vitest";
import { __ALLOW_LISTS__, gearBucketFor } from "@/lib/parser/gearClassification";

describe("gear classification registry — cross-discipline collision guard (spec §3.2)", () => {
  it("no keyword appears in more than one discipline allow-list", () => {
    const seen = new Map<string, string>();
    for (const [disc, kws] of Object.entries(__ALLOW_LISTS__))
      for (const k of kws) {
        const prev = seen.get(k);
        expect(prev, `'${k}' in both ${prev} and ${disc}`).toBeUndefined();
        seen.set(k, disc);
      }
  });
  it("discipline-consistency: a bucket-setter keyword that is also an allow-list keyword is the SAME discipline", () => {
    // SOUND SYSTEM is intentionally both the audio bucket-setter AND an audio allow-list keyword.
    expect(gearBucketFor("SOUND SYSTEM")).toBe("audio");
    expect(__ALLOW_LISTS__.audio).toContain("SOUND SYSTEM");
    // and it must NOT be in any other discipline's list:
    for (const d of ["video", "lighting", "scenic"] as const)
      expect(__ALLOW_LISTS__[d]).not.toContain("SOUND SYSTEM");
  });
});

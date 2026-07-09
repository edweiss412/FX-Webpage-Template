import { describe, expect, test } from "vitest";
import { STRIP_KINDS } from "@/lib/admin/loadRecentAutoApplied";
import { MONITOR_AUTO_APPLY_KINDS } from "@/lib/notify/monitorDigest";

// Flow 6.2 §13.3: the email digest's auto-applied query MUST use the SAME
// change-kind allow-list as the in-app strip (loadRecentAutoApplied) — a re-typed
// copy would let the two surfaces drift on a security-relevant filter.
describe("monitor auto-apply filter parity", () => {
  test("monitor uses the SAME change-kind allow-list as the in-app strip", () => {
    expect([...MONITOR_AUTO_APPLY_KINDS]).toEqual([...STRIP_KINDS]);
  });
});

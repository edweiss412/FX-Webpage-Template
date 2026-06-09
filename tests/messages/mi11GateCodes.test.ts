/**
 * Task 3.8 — catalog VERIFICATION-ONLY.
 *
 * The four typed result codes the MI-11 gate RPCs + server actions surface are added by a SINGLE
 * Phase 1 catalog task (resolution #12, full §12.4 three-lockstep there). Phase 3 only REFERENCES
 * them: this asserts each already resolves to non-null, non-empty copy via lib/messages (invariant 5,
 * no raw codes in UI). It does NOT add codes or run the three-lockstep.
 */
import { describe, expect, it } from "vitest";

import { messageFor } from "@/lib/messages/lookup";

const MI11_GATE_CODES = [
  "MI11_TARGET_MOVED",
  "MI11_DRIVE_RECHECK_FAILED",
  "MI11_HOLD_ALREADY_RESOLVED",
  "IDENTITY_WOULD_COLLIDE",
] as const;

describe("MI-11 gate result codes resolve to non-null copy (Task 3.8, verification-only)", () => {
  it.each(MI11_GATE_CODES)("messageFor(%s) returns a non-empty title", (code) => {
    const entry = messageFor(code);
    expect(entry).toBeTruthy();
    expect(typeof entry.title).toBe("string");
    expect(entry.title.length).toBeGreaterThan(0);
  });
});

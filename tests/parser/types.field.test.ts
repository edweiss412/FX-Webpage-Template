/**
 * blockRef.field — per-field warning anchor (spec 2026-07-07-ambiguity-warnings-v1 §5).
 *
 * Ambiguity warnings point at a specific field within a block (a room's `dims`
 * vs `name`, a hotel cell's `guests`, a DATES block's `order`) so the wizard can
 * render "which part we made a judgment call on". This is a type-level proof: the
 * optional `field` member must be assignable on ParseWarning.blockRef.
 */
import { describe, it, expect } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";

describe("blockRef.field", () => {
  it("blockRef accepts a field anchor", () => {
    const w: ParseWarning = {
      severity: "warn",
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      message: "x",
      blockRef: { kind: "rooms", name: "LASALLE", field: "dims" },
    };
    expect(w.blockRef?.field).toBe("dims");
  });
});

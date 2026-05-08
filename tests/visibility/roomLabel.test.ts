/**
 * Tests for `lib/visibility/roomLabel.ts` — display-label helper for a
 * `RoomRow` (M4 catch-up review, Important 4).
 *
 * Was three identical inline copies in AudioScopeTile / VideoScopeTile /
 * LightingScopeTile; now a single source of truth here. The label rule
 * (verbatim from the original copies):
 *   - kind: 'gs'         → room.name || "General Session"
 *   - kind: 'breakout'   → room.name || "Breakout"
 *   - kind: 'additional' → room.name || "Additional"
 *
 * Empty-string names fall through to the kind-default (treated as
 * "no name supplied"), matching the original `||` short-circuit
 * semantics.
 */
import { describe, expect, test } from "vitest";
import { roomLabel } from "@/lib/visibility/roomLabel";
import type { RoomRow } from "@/lib/parser/types";

function makeRoom(partial: Partial<RoomRow> & { kind: RoomRow["kind"] }): RoomRow {
  return {
    kind: partial.kind,
    name: partial.name ?? "",
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };
}

describe("roomLabel", () => {
  test("kind: 'gs' with a name → returns the name verbatim", () => {
    expect(roomLabel(makeRoom({ kind: "gs", name: "Grand Ballroom" }))).toBe("Grand Ballroom");
  });

  test("kind: 'gs' with empty-string name → falls back to 'General Session'", () => {
    expect(roomLabel(makeRoom({ kind: "gs", name: "" }))).toBe("General Session");
  });

  test("kind: 'breakout' with a name → returns the name verbatim", () => {
    expect(roomLabel(makeRoom({ kind: "breakout", name: "Salon A" }))).toBe("Salon A");
  });

  test("kind: 'breakout' with empty-string name → falls back to 'Breakout'", () => {
    expect(roomLabel(makeRoom({ kind: "breakout", name: "" }))).toBe("Breakout");
  });

  test("kind: 'additional' with a name → returns the name verbatim", () => {
    expect(roomLabel(makeRoom({ kind: "additional", name: "Green Room" }))).toBe("Green Room");
  });

  test("kind: 'additional' with empty-string name → falls back to 'Additional'", () => {
    expect(roomLabel(makeRoom({ kind: "additional", name: "" }))).toBe("Additional");
  });
});

import { describe, it, expect } from "vitest";
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";

const EXPECTED = ["dimensions", "floor", "setup", "set_time", "show_time", "strike_time"];
// Fields that EXIST on RoomRow but are deliberately NOT in this list (Decision 4).
const EXCLUDED = [
  "power",
  "digital_signage",
  "notes",
  "audio",
  "video",
  "lighting",
  "scenic",
  "other",
  "name",
  "kind",
];

describe("ROOM_DETAIL_FIELDS", () => {
  it("lists exactly the six BL-ROOM-DETAIL keys, in order, distinct", () => {
    const keys = ROOM_DETAIL_FIELDS.map((f) => f.key);
    expect(keys).toEqual(EXPECTED);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has a non-empty label", () => {
    for (const f of ROOM_DETAIL_FIELDS) expect(f.label.trim().length).toBeGreaterThan(0);
  });

  it("excludes the out-of-scope room fields (no scope creep)", () => {
    const keys = new Set<string>(ROOM_DETAIL_FIELDS.map((f) => f.key));
    for (const k of EXCLUDED) expect(keys.has(k), `${k} must NOT be surfaced here`).toBe(false);
  });
});

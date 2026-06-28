import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";

// gear-parser-fidelity Task 6: an unlabeled GS continuation row (empty col0, value in
// col1 — east-coast `| | (2) Lekos for Stage Wash (6) Blizzard LED Uplights |`) is
// routed by classification to its own discipline column instead of bleeding into the
// preceding labeled field (GS Scenic).
// NOTE: ParsedSheet.rooms is top-level (RoomRow[]); ShowRow has no `rooms` field
// (lib/parser/types.ts:96, :368). Plan wrote `p.show.rooms`; corrected to `p.rooms`.
describe("GS orphan-continuation-row classification (gear-parser-fidelity Task 6)", () => {
  it("east-coast GS lighting captured from the unlabeled continuation row; not in scenic", () => {
    const p = parseSheet(
      readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8"),
      "e.md",
    );
    const gs = p.rooms.find((r) => r.kind === "gs" || /general session|mabel 1/i.test(r.name))!;
    expect(gs.lighting ?? "").toMatch(/Lekos|Blizzard/i);
    expect(gs.scenic ?? "").not.toMatch(/Lekos|Blizzard/i);
  });
});

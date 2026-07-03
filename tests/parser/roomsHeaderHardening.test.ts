/**
 * Room-header hardening (audit idx23 + idx22) — splitRoomHeader edge cases that
 * are NOT in the current 7-show corpus but are PROBABLE real-world inputs a venue
 * would author. Each is probe-confirmed to produce wrong crew-visible output on
 * the pre-fix parser.
 *
 * Tested through the public `parseRooms(md, version)` entry (splitRoomHeader is
 * internal). The GS block shape mirrors the production exporter: a room-header row
 * followed by Setup / Set Time / Show Time / Strike Time rows.
 *
 * idx23 — non-ordinal floor designations ("Ground Floor", "Main Floor", …). The
 *   floor regex was ordinal-only (`\d+(st|nd|rd|th) Floor`), so a non-ordinal floor
 *   was never extracted: with dims present it LEAKED into the dimensions string; with
 *   no dims the qualifier word ("Ground"/"Main") glued onto the room NAME and the
 *   floor was lost.
 * idx22 — an unfilled height cell leaves a dangling trailing "x" in the dims
 *   ("75' x 37' x"), which reaches the crew card verbatim (confirmed on the LIVE
 *   fintech sheet: `ADLER BALLROOM ⏎ 75' x 37' x  ⏎ 15th Floor`).
 */
import { describe, it, expect } from "vitest";
import { parseRooms } from "@/lib/parser/blocks/rooms";

function gsBlock(header: string): string {
  return [
    `| ${header} | ${header} | ${header} |`,
    `| Setup | Rounds for 100 |`,
    `| Set Time | 1/1 @ 8am |`,
    `| Show Time | 1/2 @ 9am |`,
    `| Strike Time | 1/2 @ 5pm |`,
  ].join("\n");
}

const gsOf = (header: string) => {
  const rooms = parseRooms(gsBlock(header), "v4");
  const gs = rooms.find((r) => r.kind === "gs") ?? rooms[0]!;
  return { name: gs.name, dimensions: gs.dimensions, floor: gs.floor };
};

describe("splitRoomHeader — idx23 non-ordinal floors", () => {
  it("extracts 'Ground Floor' as the floor (not leaked into dims) when dims are present", () => {
    expect(gsOf("GENERAL SESSION GRAND BALLROOM 82' x 94' x 14' Ground Floor")).toEqual({
      name: "GRAND BALLROOM",
      dimensions: "82' x 94' x 14'",
      floor: "Ground Floor",
    });
  });

  it("extracts 'Main Floor' as the floor (not glued to the name) when there are no dims", () => {
    expect(gsOf("GENERAL SESSION GRAND BALLROOM Main Floor")).toEqual({
      name: "GRAND BALLROOM",
      dimensions: null,
      floor: "Main Floor",
    });
  });

  it("handles other non-ordinal floor qualifiers (Lobby / Mezzanine / Lower)", () => {
    expect(gsOf("GENERAL SESSION ATRIUM Lobby Floor").floor).toBe("Lobby Floor");
    expect(gsOf("GENERAL SESSION ATRIUM Mezzanine Floor").floor).toBe("Mezzanine Floor");
    expect(gsOf("GENERAL SESSION ATRIUM Lower Floor").floor).toBe("Lower Floor");
  });
});

describe("splitRoomHeader — idx22 dangling dimension token", () => {
  it("drops a trailing dangling 'x' from an unfilled height cell (LIVE fintech shape)", () => {
    expect(gsOf("GENERAL SESSION ADLER BALLROOM 75' x 37' x 15th Floor")).toEqual({
      name: "ADLER BALLROOM",
      dimensions: "75' x 37'",
      floor: "15th Floor",
    });
  });
});

describe("splitRoomHeader — regression guards (existing corpus shapes unchanged)", () => {
  it("keeps ordinal floors working (7th Floor)", () => {
    expect(gsOf("GENERAL SESSION FOO 10' x 10' x 10' 7th Floor")).toEqual({
      name: "FOO",
      dimensions: "10' x 10' x 10'",
      floor: "7th Floor",
    });
  });

  it("preserves the rpas GS shape (A/B stays in name; TOTAL:/A/B: dims; 8th Floor)", () => {
    expect(
      gsOf(
        "GENERAL SESSION GRAND BALLROOM A/B TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14' 8th Floor",
      ),
    ).toEqual({
      name: "GRAND BALLROOM A/B",
      dimensions: "TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14'",
      floor: "8th Floor",
    });
  });

  it("does not treat the 'Dimensions Floor' placeholder pair as a floor", () => {
    // consultants LUNCH ROOM stub: both template placeholder words unfilled.
    const rooms = parseRooms(
      [
        `| LUNCH ROOM BALLROOM C Dimensions Floor | LUNCH ROOM BALLROOM C Dimensions Floor |`,
        `| Setup | Rounds with stage |`,
        `| Show Time | 1/2 @ 8am |`,
      ].join("\n"),
      "v4",
    );
    const lunch = rooms.find((r) => r.name.includes("BALLROOM C"));
    expect(lunch?.name).toBe("BALLROOM C");
    expect(lunch?.floor).toBeNull();
    expect(lunch?.dimensions).toBeNull();
  });
});

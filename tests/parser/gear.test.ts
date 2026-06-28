import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hasGearDateGrid, parseGearTab } from "@/lib/parser/blocks/gear";
import { parseSheet, mergeGearIntoRooms } from "@/lib/parser/index";
import type { RoomRow } from "@/lib/parser/types";

const md = (f: string) => readFileSync(`fixtures/shows/${f}`, "utf8");
const room = (rs: ReturnType<typeof parseGearTab>, re: RegExp) => rs.find((r) => re.test(r.name));

describe("hasGearDateGrid (shared signature, spec §3.1)", () => {
  it("true for exporter rpas/fixed-income/consultants; false for ria (INFO-inline, no grid)", () => {
    expect(hasGearDateGrid(md("exporter-xlsx/rpas.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/fixed-income.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/consultants.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/ria.md"))).toBe(false);
  });
  it("false for a Rental Dates row with NO Item/date header (R5-M2 negative)", () => {
    expect(hasGearDateGrid("| Rental Dates | Rental Dates |\n| foo | bar |")).toBe(false);
  });
  it("false for the raw family — its Item header is NOT doubled (| Item | | dates), R8-M2", () => {
    expect(hasGearDateGrid(md("raw/2026-03-rpas-central-four-seasons.md"))).toBe(false);
  });
});

describe("parseGearTab — rpas (prod path)", () => {
  const rooms = parseGearTab(md("exporter-xlsx/rpas.md"));
  it("GS room: audio has QU32, video has BARCO, lighting has LEKO/BLIZZARD, scenic has SPANDEX", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    expect(gs.audio).toMatch(/QU32/);
    expect(gs.video).toMatch(/BARCO|EIKI/);
    expect(gs.lighting).toMatch(/LEKO|BLIZZARD/);
    expect(gs.scenic).toMatch(/SPANDEX/);
  });
  it("tabletop mic qty extracted from the date column → (17)", () => {
    expect(room(rooms, /GRAND BALLROOM/i)!.audio).toMatch(/\(17\)[^|]*TABLETOP/i);
  });
  it("no duplicated leading quantity (R3-M1): (2) KLA SPEAKERS not (2) (2) KLA SPEAKERS", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    for (const v of [gs.audio, gs.video, gs.lighting, gs.scenic, gs.other])
      expect(v ?? "").not.toMatch(/(\(\d+\)\s*){2}/); // no two consecutive (N) prefixes
    expect(gs.audio).toMatch(/\(2\)\s*KLA/i); // single qty prefix preserved
  });
  it("breakout rooms get projector/screen/laptop into video", () => {
    const bo = room(rooms, /STATE A/i)!;
    expect(bo.video).toMatch(/EIKI|PROJECTOR/);
    expect(bo.audio).toBeNull();
  });
  it("preserves unmatched gear in 'other' (R2-M3): MOUNTING HARDWARE (top-level, no bucket) → other", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    expect(gs.other ?? "").toMatch(/MOUNTING HARDWARE/i);
  });
  it("real '* PACKAGE' gear is NOT dropped (R5-HIGH): ZOOM LAPTOP / PTZ CAMERA PACKAGE → video", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    expect(gs.video ?? "").toMatch(/ZOOM|PTZ/i);
  });
});

describe("parseGearTab — consultants variants (R1/R2/R8)", () => {
  const rooms = parseGearTab(md("exporter-xlsx/consultants.md"));
  it("tolerates the :---: row between Rental Dates and Item (consultants:139-141)", () => {
    expect(rooms.length).toBeGreaterThan(0);
  });
  it("classification precedence: BARCO/screen/countdown → video despite SOUND SYSTEM PACKAGE region", () => {
    const gs = room(rooms, /GRAND BALLROOM A\/B/i)!;
    expect(gs.video).toMatch(/BARCO/);
    expect(gs.video).toMatch(/COUNTDOWN|SCREEN/);
    expect(gs.audio ?? "").not.toMatch(/BARCO|COUNTDOWN/);
  });
  it("lunch-room: SMALL SOUND SYSTEM + KLA + CABLING + AUDIO MIXER QU16 all in audio", () => {
    const lunch = room(rooms, /BALLROOM C/i)!;
    expect(lunch.audio).toMatch(/SMALL SOUND SYSTEM/i);
    expect(lunch.audio).toMatch(/CABLING/i);
    expect(lunch.audio).toMatch(/QU16/i);
    expect(lunch.other ?? "").not.toMatch(/SOUND SYSTEM|CABLING/i);
  });
  it("bare FOYER opens a room; unnumbered BREAKOUT SESSION rooms parse", () => {
    expect(room(rooms, /^FOYER/i)).toBeDefined();
    expect(rooms.filter((r) => r.kind === "breakout").length).toBeGreaterThanOrEqual(4);
  });
});

describe("parseGearTab — raw family is out of scope (anti-corruption, R1-M2 + R8-M2)", () => {
  it("mangled raw GEAR grid returns ZERO rooms (not even all-null ones)", () => {
    // hasGearDateGrid is false for raw (Item header not doubled) → parseGearTab returns [].
    expect(parseGearTab(md("raw/2026-03-rpas-central-four-seasons.md"))).toEqual([]);
  });
  it("end-to-end: parseSheet(raw) appends NO gear-only room (no NO_HEADER pollution)", () => {
    const p = parseSheet(md("raw/2026-03-rpas-central-four-seasons.md"), "r.md");
    // NOTE: ParsedSheet.rooms is top-level (RoomRow[]); ShowRow has no `rooms` field
    // (lib/parser/types.ts:96, :368). Plan wrote `p.show.rooms`; corrected to `p.rooms`.
    expect(p.rooms.some((r) => /NO_HEADER/i.test(r.name))).toBe(false);
  });
});

describe("parseGearTab — general-session kind (R1-M3)", () => {
  it("the GS gear room carries kind 'gs', not 'general'", () => {
    const gs = room(parseGearTab(md("exporter-xlsx/rpas.md")), /GRAND BALLROOM/i)!;
    expect(gs.kind).toBe("gs");
  });
});

// ---- Task 3: mergeGearIntoRooms via parseSheet + differentiating unit tests ----
// NOTE: ParsedSheet.rooms is top-level (RoomRow[]); ShowRow has no `rooms` field
// (lib/parser/types.ts:96, :368). Plan wrote `p.show.rooms`; corrected to `p.rooms`.

describe("mergeGearIntoRooms via parseSheet — rpas end-to-end", () => {
  const p = parseSheet(md("exporter-xlsx/rpas.md"), "rpas.md");
  it("GS room scope is populated from GEAR (was 0/0/0 before)", () => {
    const gs = p.rooms.find((r) => /GRAND BALLROOM/i.test(r.name))!;
    expect(gs.audio).toMatch(/QU32/);
    expect(gs.lighting).toMatch(/LEKO|BLIZZARD/);
  });
  it("room count does not double (GEAR rooms matched onto INFO rooms by name token)", () => {
    const names = p.rooms.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("'other' column survives the merge into rooms (R2-M3 end-to-end preservation)", () => {
    const gs = p.rooms.find((r) => /GRAND BALLROOM/i.test(r.name))!;
    expect(gs.other ?? "").toMatch(/MOUNTING HARDWARE/i);
  });
});

// R1-HIGH: differentiating unit test — index-matching would attach LASALLE gear to
// DELAWARE. The real consultants LASALLE/DELAWARE GEAR blocks are IDENTICAL, so a
// fixture-only assertion is tautological; use DISTINCT per-room gear with swapped
// index-vs-name ordering. Requires `mergeGearIntoRooms` exported from lib/parser/index.ts.
const emptyRoom = (kind: RoomRow["kind"], name: string): RoomRow => ({
  kind,
  name,
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
});

describe("mergeGearIntoRooms — name-token match, NOT breakout index (R1-HIGH)", () => {
  it("LASALLE gear lands on LASALLE even when INFO/GEAR breakout indices are swapped", () => {
    const info = [emptyRoom("breakout", "DELAWARE"), emptyRoom("breakout", "LASALLE")]; // INFO 1=DELAWARE, 2=LASALLE
    const gear = [
      {
        kind: "breakout" as const,
        name: "LASALLE",
        audio: null,
        video: "LASALLE-ONLY-PROJECTOR",
        lighting: null,
        scenic: null,
        other: null,
      }, // GEAR 1=LASALLE
      {
        kind: "breakout" as const,
        name: "DELAWARE",
        audio: null,
        video: "DELAWARE-ONLY-SCREEN",
        lighting: null,
        scenic: null,
        other: null,
      }, // GEAR 2=DELAWARE
    ];
    const merged = mergeGearIntoRooms(info, gear);
    expect(merged.find((r) => /LASALLE/i.test(r.name))!.video).toBe("LASALLE-ONLY-PROJECTOR");
    expect(merged.find((r) => /DELAWARE/i.test(r.name))!.video).toBe("DELAWARE-ONLY-SCREEN");
    // index-matching would have swapped these → both asserts catch the corruption.
  });
  it("does NOT cross kinds: same name token, different kind → gear stays within its kind (R8-H1)", () => {
    const info = [emptyRoom("additional", "BALLROOM C"), emptyRoom("breakout", "BALLROOM C")];
    const gear = [
      {
        kind: "breakout" as const,
        name: "BALLROOM C",
        audio: null,
        video: "BREAKOUT-ONLY-PROJECTOR",
        lighting: null,
        scenic: null,
        other: null,
      },
    ];
    const merged = mergeGearIntoRooms(info, gear);
    expect(merged.find((r) => r.kind === "breakout" && /BALLROOM C/i.test(r.name))!.video).toBe(
      "BREAKOUT-ONLY-PROJECTOR",
    );
    expect(
      merged.find((r) => r.kind === "additional" && /BALLROOM C/i.test(r.name))!.video,
    ).toBeNull(); // not crossed
  });
  it("skips all-null GearRooms (never appends an empty room, R8-M2)", () => {
    const merged = mergeGearIntoRooms(
      [],
      [
        {
          kind: "additional" as const,
          name: "NO_HEADER",
          audio: null,
          video: null,
          lighting: null,
          scenic: null,
          other: null,
        },
      ],
    );
    expect(merged).toEqual([]);
  });
  it("fill-don't-clobber: a non-null INFO column is preserved over GEAR", () => {
    const info = [{ ...emptyRoom("gs", "GRAND BALLROOM"), audio: "INFO-AUDIO" }];
    const gear = [
      {
        kind: "gs" as const,
        name: "GRAND BALLROOM",
        audio: "GEAR-AUDIO",
        video: "GEAR-VIDEO",
        lighting: null,
        scenic: null,
        other: null,
      },
    ];
    const merged = mergeGearIntoRooms(info, gear);
    expect(merged[0]!.audio).toBe("INFO-AUDIO"); // not clobbered
    expect(merged[0]!.video).toBe("GEAR-VIDEO"); // filled (was null)
  });
  it("appended FOYER room (no INFO peer) has gear but null times → no schedule bookend", () => {
    const merged = mergeGearIntoRooms(
      [],
      [
        {
          kind: "additional" as const,
          name: "FOYER",
          audio: null,
          video: null,
          lighting: null,
          scenic: null,
          other: "(2) Stanchions",
        },
      ],
    );
    const foyer = merged.find((r) => /^FOYER/i.test(r.name))!;
    expect(foyer.other).toMatch(/Stanchions/);
    expect(foyer.strike_time).toBeNull();
    expect(foyer.set_time).toBeNull();
  });
});

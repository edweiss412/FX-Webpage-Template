import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hasGearDateGrid, parseGearTab } from "@/lib/parser/blocks/gear";
import { parseSheet } from "@/lib/parser/index";

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

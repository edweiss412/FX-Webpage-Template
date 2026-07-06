import { describe, it, expect } from "vitest";
import {
  roomHeaderNameShape,
  headerDayMarker,
  isRoomHeaderShape,
  roomBaseName,
  dayRangeOf,
  roomGroupKey,
} from "@/lib/parser/blocks/rooms";

describe("room shape predicates (spec §2.2/§2.3)", () => {
  it("roomHeaderNameShape: proper name yes; dims-leading/field-label/day-only no", () => {
    expect(roomHeaderNameShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(roomHeaderNameShape("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true); // commas (R21)
    expect(roomHeaderNameShape("Hotel Ballroom DAY 1 & 2")).toBe(true); // compound (R33)
    expect(roomHeaderNameShape("4' X 8' RISER")).toBe(false); // dims-leading
    expect(roomHeaderNameShape("HOTEL DAY 1 & 2")).toBe(false); // exact section token (R33)
    expect(roomHeaderNameShape("FOYER DAY 1 & 2")).toBe(false); // FOYER token via base (R32)
    expect(roomHeaderNameShape("Grand Foyer DAY 1 & 2")).toBe(true); // compound ≠ FOYER
    expect(roomHeaderNameShape("BO Setup")).toBe(false); // field label (item 3)
    expect(roomHeaderNameShape("DAY 1")).toBe(false); // empty base (R36)
    expect(roomHeaderNameShape("DAYS 1 & 2")).toBe(false);
  });
  it("headerDayMarker: trailing-last-content only", () => {
    expect(headerDayMarker("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("MERIDIAN&#10;DAY 1 & 2&#10;60' x 45'")).toBe(true); // dims after DAY ok
    expect(headerDayMarker("SPECIAL DAY 1 NOTES")).toBe(false); // word after number (R26)
    expect(headerDayMarker("SPECIAL DAY 1&#10;NOTES")).toBe(false); // prose line after (R35)
    expect(headerDayMarker("FOH POSITION&#10;Downstage")).toBe(false);
  });
  it("isRoomHeaderShape composes both", () => {
    expect(isRoomHeaderShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(isRoomHeaderShape("PROJECTION SCREEN&#10;5' x 9'")).toBe(false);
  });
  it("roomBaseName strips trailing inline DAY, uppercases", () => {
    expect(roomBaseName("SALON ABCD DAY 1 & 2")).toBe("SALON ABCD");
    expect(roomBaseName("MABEL 1")).toBe("MABEL 1");
    expect(roomBaseName("DAY 1")).toBe("");
  });
  it("dayRangeOf normalizes the trailing range from any line", () => {
    expect(dayRangeOf("MABEL 1&#10;DAY 1 & 2")).toBe("1&2");
    expect(dayRangeOf("SALON ABCD DAY 1")).toBe("1");
  });
  it("roomGroupKey merges same name+day, splits distinct days", () => {
    const k = (c: string) => roomGroupKey(c, c.replace(/&#10;/g, "\n").split("\n")[0]!.trim());
    expect(k("SALON ABCD DAY 1 & 2")).toBe(k("SALON ABCD&#10;DAY 1 & 2")); // R27 merge
    expect(k("SALON ABCD DAY 1")).not.toBe(k("SALON ABCD DAY 2")); // R34 split
  });
});

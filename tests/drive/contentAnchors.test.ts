import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { extractContentAnchors, visibleTabGids } from "@/lib/drive/contentAnchors";
import { travelHeaderIndices } from "@/lib/parser/blocks/travelFlights";
import { buildXlsx } from "@/tests/helpers/buildXlsx";

const INFO = [
  ["CREW", ""],
  ["Alice", "A1"],
  ["", ""],
  ["MYSTERY SECTION", ""],
  ["thing", "value"],
  ["", ""],
  ["AGENDA", ""],
  ["AGENDA LINK - Day 1", "agenda day1.pdf"],
];
const TRAVEL = [
  ["NAME", "FLIGHT DETAILS", "FLIGHT BOOKED"],
  ["Alice", "AA 100", "Y"],
];
// Same header text as INFO's mystery row, on a hidden tab: must contribute nothing.
const HIDDEN = [
  ["MYSTERY SECTION", ""],
  ["NAME", "FLIGHT DETAILS", "OK TO BOOK?"],
];

const at = (rows: string[][], text: string, title: string, gid: number) => {
  const r = rows.findIndex((row) => row[0] === text);
  expect(r, `premise: ${text} is in the ${title} fixture`).toBeGreaterThan(-1);
  return { title, gid, a1: XLSX.utils.encode_cell({ r, c: 0 }), scope: "cell" as const };
};

const buffer = buildXlsx([
  { name: "INFO", grid: INFO },
  { name: "TRAVEL", grid: TRAVEL },
  { name: "OLD INFO", grid: HIDDEN, hidden: true },
  { name: "LOOKUP", grid: HIDDEN, hidden: 2 },
  { name: "NO GID", grid: [["MYSTERY SECTION", ""]] },
]);
const gids = new Map([
  ["INFO", 0],
  ["TRAVEL", 7],
  ["OLD INFO", 8],
  ["LOOKUP", 9],
]);

describe("visibleTabGids", () => {
  it("keeps visible tabs that have a gid, and drops hidden, very hidden, and gid-less tabs", () => {
    expect([...visibleTabGids(buffer, gids)].sort()).toEqual([
      ["INFO", 0],
      ["TRAVEL", 7],
    ]);
  });
});

describe("extractContentAnchors", () => {
  const anchors = extractContentAnchors(buffer, gids);

  it("visibleTabs is the visibleTabGids map", () => {
    expect(anchors.visibleTabs).toEqual(visibleTabGids(buffer, gids));
  });

  it("indexes each row's first cell by its normalized text, at the cell's own address", () => {
    const hits = anchors.rowLabels.filter((l) => l.label === "mystery section");
    // One hit: the hidden and very hidden copies and the gid-less tab add none.
    expect(hits.map((h) => h.anchor)).toEqual([at(INFO, "MYSTERY SECTION", "INFO", 0)]);
  });

  it("agendaLinks holds only rows isAgendaLinkRow accepts (a bare AGENDA header has no value)", () => {
    expect(anchors.agendaLinks).toEqual([at(INFO, "AGENDA LINK - Day 1", "INFO", 0)]);
  });

  it("travelHeaders holds the NAME cell of each TRAVEL header row on a visible tab", () => {
    expect(anchors.travelHeaders).toEqual([at(TRAVEL, "NAME", "TRAVEL", 7)]);
  });
});

describe("travelHeaderIndices (the parser's TRAVEL header signature)", () => {
  it("accepts NAME + FLIGHT DETAILS + a booking sibling, in any case", () => {
    expect(travelHeaderIndices(["NAME", "x", "FLIGHT DETAILS", "OK TO BOOK?"])).toEqual({
      nameIdx: 0,
      flightIdx: 2,
    });
    expect(travelHeaderIndices(["name", "flight details", "flight booked"])).not.toBeNull();
  });

  it("refuses a row missing any one of the three", () => {
    expect(travelHeaderIndices(["NAME", "FLIGHT DETAILS"])).toBeNull();
    expect(travelHeaderIndices(["NAME", "FLIGHT BOOKED"])).toBeNull();
    expect(travelHeaderIndices(["CREW", "FLIGHT DETAILS", "FLIGHT BOOKED"])).toBeNull();
  });
});

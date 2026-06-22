import { it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";

function buf(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

it("single-block region → its row range", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [["CLIENT", "ACME"], [], ["VENUE", "Four Seasons"], ["Hotel Address", "525 N"]],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.venue).toEqual({ title: "INFO", gid: 0, a1: "A3:B4" }); // VENUE block union incl. address row
});

it("union-with-overreach for a multi-label region (financials)", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["COI", "Sent"],
        ["Proposal", "Sent - $17,500"],
        ["PO#", ""],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.financials).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("drops a region whose tab is NOT allowlisted (no CLIENT anchor)", () => {
  const b = buf([{ name: "CLIENT", rows: [["VENUE", "x"]] }]);
  const a = extractSourceAnchors(b, new Map([["CLIENT", 7]]));
  expect(a.venue).toBeUndefined();
});

it("zero matches → region omitted", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT", "ACME"]] }]);
  expect(extractSourceAnchors(b, new Map([["INFO", 0]])).rooms).toBeUndefined();
});

it("schedule = whole AGENDA tab (cross-tab: INFO dates excluded)", () => {
  const b = buf([
    { name: "INFO", rows: [["DATES"], ["Travel", "5/13"]] },
    {
      name: "AGENDA",
      rows: [
        ["NAME", "START", "FINISH"],
        ["", "7:15 AM", "7:30 AM"],
      ],
    },
  ]);
  const a = extractSourceAnchors(
    b,
    new Map([
      ["INFO", 0],
      ["AGENDA", 99],
    ]),
  );
  expect(a.schedule).toEqual({ title: "AGENDA", gid: 99, a1: "A1:C2" }); // whole used range
});

it("contacts = row-label union (global scan, no header)", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["CLIENT", "x"],
        ["Hotal Contact Info", "ashley@x"],
        ["In House AV", "mark@y"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.contacts).toEqual({ title: "INFO", gid: 0, a1: "A2:B3" });
});

it("transportation = header-block (header → terminator)", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["TRANSPORTATION", "Van"],
        ["Driver", "James"],
        ["Parking", "#45"],
        ["HOTEL", "Four Seasons"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.transportation).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // stops before HOTEL terminator
});

it("flights aliases the crew anchor", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["TECH", "PHONE"],
        ["Doug - Lead", "917"],
        ["Eric - A1", "508"],
        ["HOTEL", "x"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.flights).toEqual(a.crew); // same anchor as crew
  expect(a.crew?.title).toBe("INFO");
});

it("gear_packlist = whole PULL SHEET tab; falls back to GEAR when PULL SHEET absent", () => {
  const b1 = buf([
    {
      name: "PULL SHEET",
      rows: [
        ["QTY", "ITEM"],
        ["2", "QU32"],
      ],
    },
  ]);
  expect(extractSourceAnchors(b1, new Map([["PULL SHEET", 7]])).gear_packlist).toEqual({
    title: "PULL SHEET",
    gid: 7,
    a1: "A1:B2",
  });
  const b2 = buf([
    {
      name: "GEAR",
      rows: [
        ["QTY", "ITEM"],
        ["1", "Eiki"],
      ],
    },
  ]);
  expect(extractSourceAnchors(b2, new Map([["GEAR", 8]])).gear_packlist).toEqual({
    title: "GEAR",
    gid: 8,
    a1: "A1:B2",
  });
});

it("rooms = row-label union of GS/BO scope rows", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["GS Audio", "(1) QU32"],
        ["GS Video", "(2) Eiki"],
        ["BO Audio", "NONE"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.rooms).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("header-block: header row is NOT its own terminator (crew spans header+data)", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["CREW", "NAME"],
        ["Doug - Lead", "917"],
        ["VENUE", "Four Seasons"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.crew).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // CREW header + 1 data row, stops at VENUE — NOT an empty/one-row block
});

it("header-block: a region's own data row sharing the header prefix does NOT terminate (hotels keeps 'Hotel Address')", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["HOTEL", "Four Seasons"],
        ["Hotel Address", "525 N"],
        ["DATES", "5/13"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.hotels).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // includes 'Hotel Address', stops at exact DATES header
});

it("header-block: details keeps a 'Details note' data row (exact-match terminators)", () => {
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["EVENT DETAILS", "x"],
        ["LED", "NO"],
        ["Details note", "keep me"],
        ["CREW", "NAME"],
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.details).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // LED + 'Details note' included, stops at CREW
});

it("non-A1 origin: absolute coordinates preserved when sheet data starts at C5", () => {
  // Build a sheet whose !ref starts at C5 (col=2, row=4), not A1.
  // aoa_to_sheet({origin:"C5"}) loses the offset after XLSX round-trip (write→read
  // normalises to A1), so we set cell addresses and !ref manually so the buffer
  // faithfully preserves the C5:D6 range.
  const ws: XLSX.WorkSheet = {
    C5: { v: "VENUE", t: "s" },
    D5: { v: "Four Seasons", t: "s" },
    C6: { v: "Hotel Address", t: "s" },
    D6: { v: "525 N", t: "s" },
    "!ref": "C5:D6",
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const b = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  // header-block for venue must return ABSOLUTE C5:D6, not zero-indexed A1:B2
  expect(a.venue).toEqual({ title: "INFO", gid: 0, a1: "C5:D6" });
});

it("venue header-block does NOT overreach into a later HOTEL block (regression: row-label-union /Hotel Address/ matched both)", () => {
  // VENUE block: rows 1-2 (A1:B2). Gap row 3. HOTEL block: rows 4-5 (A4:B5).
  // With the old row-label-union strategy, /Hotel Address/ matched the HOTEL block's
  // "Hotel Address" row (row 5), causing venue's union to span from A1 all the way to A5.
  // With header-block bounded by BLOCK_TERMINATORS, venue stops at the HOTEL header (row 4).
  const b = buf([
    {
      name: "INFO",
      rows: [
        ["VENUE", "Marriott Grand"], // row 1 — VENUE header
        ["Hotel Address", "123 Main St"], // row 2 — venue data row
        [], // row 3 — blank gap
        ["HOTEL", "Four Seasons"], // row 4 — HOTEL block header (terminator)
        ["Hotel Address", "57 E 57th St"], // row 5 — hotel data row
      ],
    },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  // venue must stop before the HOTEL terminator row (row 4, index 3)
  expect(a.venue, "venue anchor must be defined").toBeDefined();
  const venueRange = XLSX.utils.decode_range(a.venue!.a1!);
  // The HOTEL header is at row index 3 (0-based); venue must end before it
  expect(venueRange.e.r, "venue must not extend into HOTEL block rows").toBeLessThan(3);
  // Also assert hotels anchor exists and is distinct from venue
  expect(a.hotels, "hotels anchor must be defined").toBeDefined();
  const hotelsRange = XLSX.utils.decode_range(a.hotels!.a1!);
  expect(hotelsRange.s.r, "hotels must start at its own header row").toBe(3);
});

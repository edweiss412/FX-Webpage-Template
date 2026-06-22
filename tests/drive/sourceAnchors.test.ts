import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";

function buf(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

it("single-block region → its row range", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","ACME"], [], ["VENUE","Four Seasons"], ["Hotel Address","525 N"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.venue).toEqual({ title: "INFO", gid: 0, a1: "A3:B4" }); // VENUE block union incl. address row
});

it("union-with-overreach for a multi-label region (financials)", () => {
  const b = buf([{ name: "INFO", rows: [["COI","Sent"], ["Proposal","Sent - $17,500"], ["PO#",""]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.financials).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("drops a region whose tab is NOT allowlisted (no CLIENT anchor)", () => {
  const b = buf([{ name: "CLIENT", rows: [["VENUE","x"]] }]);
  const a = extractSourceAnchors(b, new Map([["CLIENT", 7]]));
  expect(a.venue).toBeUndefined();
});

it("zero matches → region omitted", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","ACME"]] }]);
  expect(extractSourceAnchors(b, new Map([["INFO", 0]])).rooms).toBeUndefined();
});

it("schedule = whole AGENDA tab (cross-tab: INFO dates excluded)", () => {
  const b = buf([
    { name: "INFO", rows: [["DATES"], ["Travel","5/13"]] },
    { name: "AGENDA", rows: [["NAME","START","FINISH"], ["","7:15 AM","7:30 AM"]] },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0], ["AGENDA", 99]]));
  expect(a.schedule).toEqual({ title: "AGENDA", gid: 99, a1: "A1:C2" }); // whole used range
});

it("contacts = row-label union (global scan, no header)", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","x"], ["Hotal Contact Info","ashley@x"], ["In House AV","mark@y"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.contacts).toEqual({ title: "INFO", gid: 0, a1: "A2:B3" });
});

it("transportation = header-block (header → terminator)", () => {
  const b = buf([{ name: "INFO", rows: [["TRANSPORTATION","Van"], ["Driver","James"], ["Parking","#45"], ["HOTEL","Four Seasons"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.transportation).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // stops before HOTEL terminator
});

it("flights aliases the crew anchor", () => {
  const b = buf([{ name: "INFO", rows: [["TECH","PHONE"], ["Doug - Lead","917"], ["Eric - A1","508"], ["HOTEL","x"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.flights).toEqual(a.crew); // same anchor as crew
  expect(a.crew?.title).toBe("INFO");
});

it("gear_packlist = whole PULL SHEET tab; falls back to GEAR when PULL SHEET absent", () => {
  const b1 = buf([{ name: "PULL SHEET", rows: [["QTY","ITEM"], ["2","QU32"]] }]);
  expect(extractSourceAnchors(b1, new Map([["PULL SHEET", 7]])).gear_packlist).toEqual({ title: "PULL SHEET", gid: 7, a1: "A1:B2" });
  const b2 = buf([{ name: "GEAR", rows: [["QTY","ITEM"], ["1","Eiki"]] }]);
  expect(extractSourceAnchors(b2, new Map([["GEAR", 8]])).gear_packlist).toEqual({ title: "GEAR", gid: 8, a1: "A1:B2" });
});

it("rooms = row-label union of GS/BO scope rows", () => {
  const b = buf([{ name: "INFO", rows: [["GS Audio","(1) QU32"], ["GS Video","(2) Eiki"], ["BO Audio","NONE"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.rooms).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("header-block: header row is NOT its own terminator (crew spans header+data)", () => {
  const b = buf([{ name: "INFO", rows: [["CREW","NAME"], ["Doug - Lead","917"], ["VENUE","Four Seasons"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.crew).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // CREW header + 1 data row, stops at VENUE — NOT an empty/one-row block
});

it("header-block: a region's own data row sharing the header prefix does NOT terminate (hotels keeps 'Hotel Address')", () => {
  const b = buf([{ name: "INFO", rows: [["HOTEL","Four Seasons"], ["Hotel Address","525 N"], ["DATES","5/13"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.hotels).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // includes 'Hotel Address', stops at exact DATES header
});

it("header-block: details keeps a 'Details note' data row (exact-match terminators)", () => {
  const b = buf([{ name: "INFO", rows: [["EVENT DETAILS","x"], ["LED","NO"], ["Details note","keep me"], ["CREW","NAME"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.details).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // LED + 'Details note' included, stops at CREW
});

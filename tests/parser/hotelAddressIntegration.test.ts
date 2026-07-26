// tests/parser/hotelAddressIntegration.test.ts
//
// Whole-diff review R2 finding 3: every address test so far exercised either the
// PURE splitter or the emitter called DIRECTLY. Nothing drove an address warning
// through `parseHotels`, which is precisely why a real misattribution bug
// (R1 f1/f3) stayed green through a whole review round.
import { describe, it, expect } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";

const addrWarnings = (md: string, v: "v1" | "v2" | "v4" = "v4") => {
  const agg = newAggregator();
  const hotels = parseHotels(md, v, agg);
  return {
    hotels,
    warnings: agg.warnings.filter((w) => w.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS"),
  };
};

/** Structured table with one Hotel Name / Address cell per slot. */
const table = (cells: (string | null)[]) => {
  const rows = [
    "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
    "| :---: | :---: | :---: | :---: |",
  ];
  for (let i = 0; i < cells.length; i += 2) {
    const l = cells[i] ?? "-";
    const r = cells[i + 1] ?? "-";
    rows.push(
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      `|  | ${l} |  | ${r} |`,
      "|  | Names on Reservation |  | Names on Reservation |",
      `|  | Guest ${i + 1} |  | Guest ${i + 2} |`,
    );
  }
  return rows.join("\n");
};

// A cell the splitter leaves whole while a padded read still finds an address.
const UNSPLIT = "Hyatt Place Chicago 71 Chicago, IL 60601";

describe("address ambiguity through parseHotels", () => {
  it("emits for a structured LEFT slot, anchored at its final index", () => {
    const { warnings } = addrWarnings(table([UNSPLIT, null]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.blockRef).toMatchObject({ kind: "hotels", field: "address", index: 0 });
    expect(warnings[0]!.severity).toBe("warn");
  });

  it("emits for a structured RIGHT slot", () => {
    const { warnings } = addrWarnings(table(["Clean Hotel", UNSPLIT]));
    expect(warnings).toHaveLength(1);
    // Index 1: the right slot is the SECOND surviving reservation. A caller that
    // stashed onto a fixed slot, or an overlay anchored at 0, lands here.
    expect(warnings[0]!.blockRef?.index).toBe(1);
  });

  it("emits one warning PER ambiguous reservation, each at its own index", () => {
    const { hotels, warnings } = addrWarnings(table([UNSPLIT, UNSPLIT]));
    expect(hotels).toHaveLength(2);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.blockRef?.index).sort()).toEqual([0, 1]);
  });

  it("stays silent for a clean corpus-shaped cell", () => {
    const { warnings } = addrWarnings(
      table(["Westin Michigan Ave 909 Michigan Ave, Chicago, IL 60611", null]),
    );
    expect(warnings).toHaveLength(0);
  });

  it("never warns for a reservation truncated by the cardinality cap", () => {
    // Five slots with explicit RESERVATION headers; only the FIFTH is ambiguous.
    // It is dropped by the cap, so a warning for it would point at a hotel the
    // operator never sees.
    const fiveSlots = [
      "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | Hotel One |  | Hotel Two |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | Alice Brown |  | Bob Carter |",
      "|  | RESERVATION \\#3 |  | RESERVATION \\#4 |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | Hotel Three |  | Hotel Four |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | Carol Diaz |  | Dave Evans |",
      "|  | RESERVATION \\#5 |  |  |",
      "|  | Hotel Name / Address |  |  |",
      `|  | ${UNSPLIT} |  |  |`,
      "|  | Names on Reservation |  |  |",
      "|  | Erin Fox |  |  |",
    ].join("\n");
    const { hotels, warnings } = addrWarnings(fiveSlots);
    expect(hotels).toHaveLength(4);
    expect(warnings).toHaveLength(0);
  });
});

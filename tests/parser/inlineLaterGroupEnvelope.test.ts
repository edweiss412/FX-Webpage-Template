import { describe, expect, it } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import {
  newAggregator,
  HOTEL_INLINE_GROUP_OWN_HOTEL,
  HOTEL_INLINE_GROUP_HOTEL_SUSPECTED,
} from "@/lib/parser/warnings";
import { fieldLabelFor } from "@/lib/admin/step3Buckets";
import { normalizeLaterSegmentText } from "@/lib/parser/blocks/hotels";

/**
 * Envelope + stash-order oracles for the two HOTEL_INLINE_GROUP_* codes.
 * Spec: docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md
 * §6.2 (envelope), §7 (copy), §8.1 (rows).
 *
 * The `rawSnippet` asserts are the load-bearing ones: they pin that the PERSISTED
 * bytes are the row's RAW segment, never the D1-normalized text the detector reads
 * internally. Each D1-affected input carries an `&#10;` entity AND a doubled space,
 * so raw !== normalized is observable.
 */

const HEAD = "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 ";
const cell = (later: string) => `| Hotel Stays | ${HEAD}${later} |`;
const wholeCell = (text: string) => `| Hotel Stays | ${text} |`;
const parse = (cellText: string) => {
  const agg = newAggregator();
  const rows = parseHotels(cellText, "v1", agg);
  return { rows, warnings: agg.warnings };
};

const C_OWN_1 = (raw: string) =>
  `Hotel line "${raw}" lists more than one hotel, so this reservation was given its own hotel rather than the line's first hotel; double-check its hotel, guests, and dates. To skip the guesswork, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.`;
const C_SUS_1 = (raw: string) =>
  `Hotel line "${raw}" may put this reservation under the wrong hotel; double-check it. To fix it, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.`;

describe("exported code constants (API + spelling)", () => {
  it("both constants are exported and spelled exactly", () => {
    expect(HOTEL_INLINE_GROUP_OWN_HOTEL).toBe("HOTEL_INLINE_GROUP_OWN_HOTEL");
    expect(HOTEL_INLINE_GROUP_HOTEL_SUSPECTED).toBe("HOTEL_INLINE_GROUP_HOTEL_SUSPECTED");
  });
});

describe("full envelope, code OWN", () => {
  const RAW_SEGMENT =
    "Marriott&#10;Downtown  200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26";

  it("emits exactly one OWN with the RAW segment as rawSnippet", () => {
    const { warnings } = parse(cell(RAW_SEGMENT));
    const own = warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_OWN_HOTEL);
    expect(own.length).toBe(1);
    const w = own[0]!;
    expect(w.severity).toBe("warn");
    expect(w.blockRef).toEqual({
      kind: "hotels",
      index: 1,
      field: "address",
      name: "Marriott Downtown",
    });
    // The persisted bytes are the sheet's, entity and doubled space intact.
    expect(w.rawSnippet).toBe(RAW_SEGMENT);
    expect(w.rawSnippet).not.toBe(normalizeLaterSegmentText(RAW_SEGMENT));
    // Neither key exists at all — not merely undefined (R43 finding 3).
    expect(Object.keys(w)).not.toContain("resolution");
    expect(Object.keys(w)).not.toContain("roleToken");
    // collapse() folds the doubled space but LEAVES the entity literal — this
    // discriminates collapse() from D1, which would erase the entity.
    expect(w.message).toBe(
      C_OWN_1(
        "Marriott&#10;Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
      ),
    );
  });
});

describe("full envelope, code SUSPECTED", () => {
  const RAW_SEGMENT = "Marriott&#10;Downtown  Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26";

  it("emits exactly one SUSPECTED with the RAW segment as rawSnippet", () => {
    const { warnings } = parse(cell(RAW_SEGMENT));
    const suspected = warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED);
    expect(suspected.length).toBe(1);
    const w = suspected[0]!;
    expect(w.severity).toBe("warn");
    expect(w.blockRef).toEqual({
      kind: "hotels",
      index: 1,
      field: "address",
      name: "Hyatt Regency 100",
    });
    expect(w.rawSnippet).toBe(RAW_SEGMENT);
    expect(w.rawSnippet).not.toBe(normalizeLaterSegmentText(RAW_SEGMENT));
    expect(Object.keys(w)).not.toContain("resolution");
    expect(Object.keys(w)).not.toContain("roleToken");
    expect(w.message).toBe(
      C_SUS_1("Marriott&#10;Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26"),
    );
  });
});

describe("null group-0 baseName envelope", () => {
  it("omits the blockRef `name` key entirely when the inherited hotel is null", () => {
    const { warnings } = parse(
      wholeCell(
        "John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 " +
          "Marriott Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
      ),
    );
    const suspected = warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.blockRef).toEqual({ kind: "hotels", index: 1, field: "address" });
    expect(Object.keys(suspected[0]!.blockRef!)).not.toContain("name");
  });
});

describe("attribution: each stash carries its OWN segment's bytes", () => {
  it("a degraded LATER segment's SUSPECTED quotes that segment, not the whole cell", () => {
    const SEG_1 =
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 " +
      "Hilton Midtown 300 Pine St, Seattle, WA 98101 Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26";
    const { warnings } = parse(cell(SEG_1));
    const suspected = warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.blockRef?.index).toBe(1);
    expect(suspected[0]!.rawSnippet).toBe(SEG_1);
    expect(warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_OWN_HOTEL).length).toBe(0);
  });

  it("an inheriting row's SUSPECTED quotes ITS segment, not the tier-1 predecessor's", () => {
    const { warnings } = parse(
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
          "Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
      ),
    );
    const suspected = warnings.filter((w) => w.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.rawSnippet).toBe("Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26");
  });
});

describe("stash order, OWN slot", () => {
  it("per-row emit order on the tier-1 kept row is guest, own-hotel, address", () => {
    // probe B6: the kept hotel `Hotel 71 Chicago, IL 60601` takes the
    // address-shape-unsplit split path, so all three stashes land on row 1.
    const { warnings } = parse(
      cell("Hotel 71 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26"),
    );
    const onRow1 = warnings.filter((w) => w.blockRef?.index === 1).map((w) => w.code);
    expect(onRow1).toEqual([
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      HOTEL_INLINE_GROUP_OWN_HOTEL,
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    ]);
  });
});

describe("field label renders as hotel, never room", () => {
  it("every new-code emit uses field `address`", () => {
    const cells = [
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
      ),
      cell("Marriott Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26"),
    ];
    for (const c of cells) {
      const { warnings } = parse(c);
      const ours = warnings.filter(
        (w) =>
          w.code === HOTEL_INLINE_GROUP_OWN_HOTEL || w.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED,
      );
      expect(ours.length).toBeGreaterThan(0);
      for (const w of ours) {
        expect(w.blockRef?.field).toBe("address");
        expect(fieldLabelFor(w.blockRef?.field)).toBe("hotel name and address");
        expect(fieldLabelFor(w.blockRef?.field)).not.toBe("room name");
      }
    }
  });
});

describe("emission order vs cardinality", () => {
  it("all surviving-row ambiguities precede HOTEL_CARDINALITY_EXCEEDED", () => {
    const { warnings } = parse(
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
          "Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26 " +
          "Carol Fox - 1004 Check In: 3/7/26 Check Out: 3/8/26 " +
          "Dan Poe - 1005 Check In: 3/9/26 Check Out: 3/10/26",
      ),
    );
    const capIndex = warnings.findIndex((w) => w.code === "HOTEL_CARDINALITY_EXCEEDED");
    expect(capIndex).toBeGreaterThan(-1);
    const ourIndices = warnings
      .map((w, i) => ({ code: w.code, i }))
      .filter(
        (x) =>
          x.code === HOTEL_INLINE_GROUP_OWN_HOTEL || x.code === HOTEL_INLINE_GROUP_HOTEL_SUSPECTED,
      )
      .map((x) => x.i);
    expect(ourIndices.length).toBeGreaterThan(0);
    for (const i of ourIndices) expect(i).toBeLessThan(capIndex);
    // Truncated rows emit nothing (parent R4): no warning anchors past the cap.
    for (const w of warnings) {
      if (w.blockRef?.index !== undefined) expect(w.blockRef.index).toBeLessThan(4);
    }
  });
});

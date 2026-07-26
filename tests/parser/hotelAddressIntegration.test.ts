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

// Whole-diff review R3 finding 3: every reachable caller of
// `splitHotelNameAddress` gets a FULL-payload oracle at the parseHotels level,
// so a caller that stashes the wrong raw text, the wrong parsed fields, or an
// un-stripped replacement cannot ship green on code presence alone. (The inline
// no-guest caller with a conf token is unreachable — see the propagation
// meta-test header — its P3(b) no-conf shape is covered below.)
describe("full resolution payload at each reachable caller", () => {
  const P3B = "Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601";
  const P3B_PAYLOAD = {
    resolvable: true,
    contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    parsed: {
      kind: "hotel-name",
      hotelName: "Hotel",
      hotelAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
    },
    replacement: { kind: "hotel-name", hotelName: P3B, hotelAddress: null },
  };

  it("structured slot caller: parsed mirrors the slot, replacement is the raw cell", () => {
    const { hotels, warnings } = addrWarnings(table([P3B, null]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.rawSnippet).toBe(P3B);
    expect(warnings[0]!.resolution).toEqual(P3B_PAYLOAD);
    expect(hotels[0]!.hotel_name).toBe("Hotel");
  });

  it("stripHotelNameConf caller: the replacement is conf-token-STRIPPED", () => {
    // Inline, no "Check In", a trailing "- #999901" conf token: the only path
    // to the split is the final privacy pass. The parse-level oracle for the P0
    // class — an emitter-level test cannot see a caller that hands the
    // UN-stripped cell to the emitter.
    const cell = `${P3B} Eric Weiss - #999901`;
    const agg = newAggregator();
    parseHotels(`| Hotel Reservations | ${cell} |`, "v2", agg);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    expect(w).toHaveLength(1);
    const res = w[0]!.resolution as {
      resolvable: boolean;
      replacement: { hotelName: string };
      parsed: { hotelName: string };
    };
    expect(res.resolvable).toBe(true);
    expect(res.replacement.hotelName).toBe(`${P3B} Eric Weiss`);
    // The ZIP survives (it is address text); the #-conf token must not.
    expect(res.replacement.hotelName).not.toMatch(/#\s*\d/);
    expect(res.parsed.hotelName).toBe("Hotel");
  });

  it("undo restores the SPLITTER'S INPUT, never the booking fragment (R6 f1)", () => {
    // Dates and a post-checkout guest live in the fragment but were never part
    // of the text the splitter judged. A replacement built from the fragment
    // persists "Check In: 5/1 Check Out: 5/2 Eric Weiss" into crew-readable
    // hotel_name the moment the operator clicks undo.
    const cell = `${P3B} Check In: 5/1 Check Out: 5/2 Eric Weiss`;
    const agg = newAggregator();
    parseHotels(`| Hotel Reservations | ${cell} |`, "v2", agg);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    expect(w).toHaveLength(1);
    const res = w[0]!.resolution as { replacement: { hotelName: string } };
    expect(res.replacement.hotelName).toBe(P3B);
    // The invalidation key still tracks the sheet-visible fragment.
    expect(w[0]!.rawSnippet).toBe(cell);
  });

  it("inline no-guest caller: full payload, judging no guest boundary", () => {
    const agg = newAggregator();
    const hotels = parseHotels(`| Hotel Reservations | ${P3B} |`, "v2", agg);
    expect(hotels[0]!.names).toEqual([]);
    expect(agg.warnings.filter((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS")).toHaveLength(0);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    expect(w).toHaveLength(1);
    expect(w[0]!.resolution).toEqual(P3B_PAYLOAD);
  });

  // Spec §8.1 "First-stash-wins is pinned by CONTENT, not count" (R9 f3; whole-diff
  // R4 f2): `71 Wacker Drive 72 Main St…` yields P3(b) at the build split, then
  // re-splitting the retained name `71 Wacker Drive` yields P3(a) via position-0
  // padding — so the two stashes COEXIST WITH DIFFERENT CONTENT and last-wins is
  // observable: it silently downgrades a resolvable card to a disabled one while
  // every count-only oracle stays green. One test per `??=` merge site.
  //
  // Mutation status (probe-verified, not assumed): flipping every `??=` to `=`
  // fails the single-group and fallback rows. The multi-group row does NOT
  // discriminate that mutant: inside a multi-group segment the "Check In" tail
  // keeps the build's hotel_name GLUED (learn-K does not fire there), so the
  // build stash and the row-0 re-split stash carry the SAME P3(b) content and
  // first-wins vs last-wins agree for every input we could construct. That row
  // still pins the observable contract at the site: one warning, index 0,
  // resolvable, never downgraded by the re-split.
  describe.each([
    ["single-group caller", "71 Wacker Drive 72 Main St Chicago, IL 60601"],
    [
      "multi-date fallback caller",
      "71 Wacker Drive 72 Main St Chicago, IL 60601 check in early check in late",
    ],
    [
      "multi-group caller",
      "71 Wacker Drive 72 Main St Chicago, IL 60601 Mary Smith - 1001 John Smith - 1002 " +
        "Check In: 3/1 Check Out: 3/2 Jane Doe - 1003 Check In: 3/3 Check Out: 3/4",
    ],
  ])("first-stash-wins by content — %s", (_label, cell) => {
    it("keeps the resolvable P3(b) stash, not the re-split's P3(a)", () => {
      const agg = newAggregator();
      parseHotels(`| Hotel Reservations | ${cell} |`, "v2", agg);
      const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
      expect(w).toHaveLength(1);
      expect(w[0]!.blockRef?.index).toBe(0);
      const res = w[0]!.resolution as { resolvable: boolean; reason?: string };
      // Last-wins yields { resolvable: false, reason: "no-split-to-undo" } here.
      expect(res.resolvable).toBe(true);
      expect(w[0]!.message).toContain("in more than one place");
    });
  });

  it("two distinct resolvable cells produce distinct hashes AND distinct replacements", () => {
    // The R3 f2 corruption precondition was a SHARED hash letting one decision
    // rewrite several reservations. Two structured slots with different P3(b)
    // text must never collide — by hash or by replacement.
    const OTHER = "Hotel 72 Main Street 5 W Madison St Chicago, IL 60602";
    const { warnings } = addrWarnings(table([P3B, OTHER]));
    expect(warnings).toHaveLength(2);
    const res = warnings.map(
      (x) =>
        x.resolution as {
          resolvable: boolean;
          contentHash: string;
          replacement: { hotelName: string };
        },
    );
    expect(res.every((r) => r.resolvable)).toBe(true);
    expect(new Set(res.map((r) => r.contentHash)).size).toBe(2);
    expect(new Set(res.map((r) => r.replacement.hotelName)).size).toBe(2);
    expect(warnings.map((w) => w.blockRef?.index).sort()).toEqual([0, 1]);
  });
});

// Whole-diff review R3 finding 2, closed structurally with spec §3.1 row 7:
// in a multi-group inline cell every row's hotel_name is assigned by
// INHERITANCE from group 0's baseName, so the only reservation whose name the
// splitter actually judged is reservation 0. A later-row address warning is
// incoherent by construction — its parsed payload describes baseName (text
// from segment 0) while its raw fragment is a guest-only segment that never
// contained that text, so its "undo" replacement corrupts the row (the R3 f2
// probe: one decision rewrote every reservation to the whole booking line).
// Multi-group cells therefore carry AT MOST ONE address warning, anchored at
// index 0, with segment 0 as its raw fragment.
describe("multi-group inline cells anchor the address warning at row 0", () => {
  const SEGMENT_0 = "Hyatt Place Chicago 71 Chicago, IL 60601 John Smith - 1001";
  const TWO_AMBIGUOUS =
    `${SEGMENT_0} Check In: 3/1 Check Out: 3/2 ` +
    "Marriott Place Chicago 72 Chicago, IL 60602 Jane Doe - 1002 Check In: 3/3 Check Out: 3/4";

  it("emits exactly ONE warning, at index 0, with segment 0 as its fragment", () => {
    const agg = newAggregator();
    const hotels = parseHotels(`| Hotel Reservations | ${TWO_AMBIGUOUS} |`, "v2", agg);
    expect(hotels.length).toBeGreaterThan(1);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    expect(w, "row 7: later rows inherit, only row 0's split was judged").toHaveLength(1);
    expect(w[0]!.blockRef?.index).toBe(0);
    // The fragment is EXACTLY group 0's segment (cut inclusive of its own
    // "Check Out"), pinned by content, not by exclusions — a mutant passing any
    // shorter slice of segment 0 would survive a not-the-parent-cell check
    // while its use-raw replacement rewrote hotel_name to that slice
    // (whole-diff R5 f3).
    expect(w[0]!.rawSnippet).toBe(`${SEGMENT_0} Check In: 3/1 Check Out: 3/2`);
  });

  it("never lets a later guest-only fragment become an undo replacement", () => {
    // Group 0 ambiguous, group 1 a bare inherited guest (the consultants shape).
    const cell =
      `${SEGMENT_0} Check In: 3/1 Check Out: 3/2 ` +
      "----- Eric Weiss - 2035937 Check In: 3/3 Check Out: 3/4";
    const agg = newAggregator();
    parseHotels(`| Hotel Reservations | ${cell} |`, "v2", agg);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    expect(w).toHaveLength(1);
    expect(w[0]!.blockRef?.index).toBe(0);
    // Pinned exactly (whole-diff R5 f3): the fragment is segment 0 verbatim,
    // and this P3(a) shape is unresolvable — so there is no replacement that
    // COULD carry the later guest-only fragment into hotel_name.
    expect(w[0]!.rawSnippet).toBe(`${SEGMENT_0} Check In: 3/1 Check Out: 3/2`);
    expect(w[0]!.resolution).toEqual({ resolvable: false, reason: "no-split-to-undo" });
  });
});

// tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts
//
// S4 red step. On an unlabeled inline hotel line nothing separates the hotel
// from the first guest, so the parser ALWAYS judges that boundary. Spec review
// killed five successive attempts to detect "did it judge?" from the parser's
// OUTPUT, so the predicate is an enumeration over the parser's EXITS.
//
// Every case here is probe-verified against the live parser.
import { describe, it, expect } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";

const guestWarnings = (md: string, version: "v1" | "v2" | "v4" = "v2") => {
  const agg = newAggregator();
  const hotels = parseHotels(md, version, agg);
  return {
    hotels,
    warnings: agg.warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS"),
  };
};
const inline = (cell: string) => `| Hotel Reservations | ${cell} |`;

describe("inline hotel guest ambiguity", () => {
  // THE discriminator. Both inputs parse to `names: []` and have OPPOSITE
  // requirements, so they are the only pair that separates the ratified design
  // from the two predicates spec review rejected:
  //   `groupIndex === 0 && names.length > 0`  fails the first
  //   "warn on every group-0 final return"    fails the second
  // Neither wrong predicate fails any other test in this file.
  describe("the row 5 / row 6 discriminator pair", () => {
    it("WARNS when a guest region was examined and yielded nothing (row 5)", () => {
      const { hotels, warnings } = guestWarnings(
        inline("Hyatt Place Check In: 5/1 Check Out: 5/2 Eric"),
      );
      expect(hotels[0]!.names, "precondition: the guest was dropped").toEqual([]);
      expect(
        warnings,
        "a silently dropped guest is the harm this feature exists to surface",
      ).toHaveLength(1);
    });

    it("stays SILENT when no guest region existed at all (row 6)", () => {
      const { hotels, warnings } = guestWarnings(
        inline("Hyatt Place Check In: 5/1 Check Out: 5/2"),
      );
      expect(hotels[0]!.names).toEqual([]);
      expect(warnings, "no boundary was judged, so no warning is owed").toHaveLength(0);
    });
  });

  describe("fires once per producing exit", () => {
    it.each([
      [
        "learn-k-peel",
        "Four Seasons Fort Lauderdale Doug--- 103317 Carl –- 103316 Eric W--- 110525",
      ],
      ["legacy-dash-pattern", "Hyatt Regency Eric Weiss - 110525"],
      [
        "titlecase-pairing",
        "Four Seasons Chicago Eric Weiss 2004173 In on the 6th out on the 10th",
      ],
    ])("%s", (_label, cell) => {
      const { warnings } = guestWarnings(inline(cell));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.resolution).toEqual({
        resolvable: false,
        reason: "raw-not-guest-scoped",
      });
    });
  });

  // Each of these is a live mis-parse that some rejected predicate let through.
  describe("the counterexamples that killed the narrower predicates", () => {
    it.each([
      // two corroborating later guests still cannot validate the FIRST guest
      "Hyatt Regency Mary Ann Smith - 110525 John Smith - 103316 Jane Doe - 103317",
      // an explicit `Guests:` label does not delimit one guest from another
      "Hyatt Place 123 Main St Check In: 5/1 Check Out: 5/2 Guests: Mary Ann Smith John Doe",
      // no delimiter at all: "Hyatt Place" itself is read as a person
      "Hyatt Place Check In: 5/1 Eric Weiss John Smith",
    ])("warns on %s", (cell) => {
      expect(guestWarnings(inline(cell)).warnings).toHaveLength(1);
    });
  });

  describe("stays silent where no boundary was judged", () => {
    it("no-guest split path (row 2)", () => {
      const { hotels, warnings } = guestWarnings(inline("Hyatt Regency - 1515 Madison Ave"));
      expect(hotels[0]!.names).toEqual([]);
      expect(warnings).toHaveLength(0);
    });

    it("the structured path is untouched by this predicate", () => {
      const structured = [
        "| HOTEL | RESERVATION \\#1 |",
        "| :---: | :---: |",
        "|  | Hotel Name / Address |",
        "|  | Hotel One |",
        "|  | Names on Reservation |",
        "|  | Douglas Larson - \\#2069854 |",
      ].join("\n");
      expect(guestWarnings(structured, "v4").warnings).toHaveLength(0);
    });
  });

  // Whole-diff review R1 finding 4. Keying the inheritance rule on group INDEX
  // silenced any later group that HAS its own hotel text. Probe-verified: both
  // reservations below mis-parse ("Main St John Smith" as a guest name, and the
  // second inheriting the wrong hotel) and only ONE warning fired.
  describe("later groups", () => {
    it("WARN when the group carries its own hotel text", () => {
      const { warnings } = guestWarnings(
        inline(
          "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1 Check Out: 3/2 " +
            "Marriott Downtown 200 Oak Ave Jane Doe - 1002 Check In: 3/3 Check Out: 3/4",
        ),
      );
      expect(warnings, "each group judged its own hotel/guest boundary").toHaveLength(2);
    });

    it("stay SILENT when the group is a divider + guest that inherits the hotel", () => {
      // The consultants shape: group 2 is "----- Eric Weiss—2035937 Check In…".
      const { warnings } = guestWarnings(
        inline(
          "Four Seasons Chicago 120 E Delaware Pl Doug Larson—2035940 Check In: 10/7 Check Out: 10/10 " +
            "------------------------- Eric Weiss—2035937 Check In: 10/7 Check Out: 10/9",
        ),
      );
      expect(warnings, "the later group judged nothing — it inherited the hotel").toHaveLength(1);
    });
  });

  it("carries the full warning envelope", () => {
    const cell = "Hyatt Regency Eric Weiss - 110525";
    const { warnings } = guestWarnings(inline(cell));
    const w = warnings[0]!;
    expect(w.severity).toBe("warn");
    expect(w.blockRef).toMatchObject({ kind: "hotels", field: "guests", index: 0 });
    expect(w.rawSnippet).toBe(cell);
    expect(w.message).toBe(
      `Hotel line "${cell}" runs the hotel and the booking details together in one cell, so we had to work out where each part starts; double-check this reservation.`,
    );
  });
});

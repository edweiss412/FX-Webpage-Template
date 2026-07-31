import { describe, expect, it } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";

/**
 * §8.4 copy oracles. Every string is a LITERAL here, never imported from the catalog
 * (parent spec §8.5 rule) — a test that reads the catalog for both sides asserts
 * nothing. Row ids are the spec §7 table's.
 */

const OWN = "HOTEL_INLINE_GROUP_OWN_HOTEL";
const SUSPECTED = "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED";

const catalogEntry = (code: string) =>
  (MESSAGE_CATALOG as Record<string, Record<string, unknown>>)[code];

describe("§7 normative copy — HOTEL_INLINE_GROUP_OWN_HOTEL", () => {
  const e = () => catalogEntry(OWN);

  it("C-OWN-2 title", () => {
    expect(e()!.title).toBe("A hotel line may book more than one hotel");
  });

  it("C-OWN-3 dougFacing", () => {
    expect(e()!.dougFacing).toBe(
      "A hotel line in _<sheet-name>_ seems to book more than one hotel; check each reservation's hotel against your sheet. Moving the bookings into the HOTEL table, one per RESERVATION column, keeps them from running together.",
    );
  });

  it("C-OWN-4 triggerContext", () => {
    expect(e()!.triggerContext).toBe(
      "Appears when one hotel line seems to book more than one hotel.",
    );
  });

  it("C-OWN-5 helpfulContext (294 chars, cap 300)", () => {
    const expected =
      "One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of the line's first one. Check its hotel name, address, guests, and dates against your sheet. To avoid this, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.";
    expect(e()!.helpfulContext).toBe(expected);
    expect(expected.length).toBe(294);
  });

  it("C-OWN-6 longExplanation", () => {
    expect(e()!.longExplanation).toBe(
      "One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of sharing the line's first one. Spot-check this reservation's hotel name, address, guests, and dates. This cannot be fixed in the app: if the hotel is wrong, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
    );
  });

  it("C-OWN-7 crewFacing is null", () => {
    expect(e()!.crewFacing).toBeNull();
  });

  it("C-OWN-8 followUp", () => {
    expect(e()!.followUp).toBe("Doug → spot-check hotel reservations");
  });

  it("C-OWN-10 helpHref", () => {
    expect(e()!.helpHref).toBe("/help/errors#HOTEL_INLINE_GROUP_OWN_HOTEL");
  });

  it("C-OWN-9 / C-OWN-9p gap-class label and plural", () => {
    const gap = GAP_CLASSES.find((g) => g.code === OWN);
    expect(gap).toBeDefined();
    expect(gap!.label).toBe("reservation given its own hotel from a shared line");
    expect(gap!.plural).toBe("reservations given their own hotel from a shared line");
  });
});

describe("§7 normative copy — HOTEL_INLINE_GROUP_HOTEL_SUSPECTED", () => {
  const e = () => catalogEntry(SUSPECTED);

  it("C-SUS-2 title", () => {
    expect(e()!.title).toBe("A reservation may show the wrong hotel");
  });

  it("C-SUS-3 dougFacing", () => {
    expect(e()!.dougFacing).toBe(
      "A hotel line in _<sheet-name>_ may show a reservation under the wrong hotel; check it against your sheet. Moving the bookings into the HOTEL table, one per RESERVATION column, fixes this.",
    );
  });

  it("C-SUS-4 triggerContext", () => {
    expect(e()!.triggerContext).toBe(
      "Appears when a reservation on a shared hotel line may be under the wrong hotel.",
    );
  });

  it("C-SUS-5 helpfulContext (247 chars)", () => {
    const expected =
      "A reservation on a shared hotel line may be under the wrong hotel. Check it against your sheet. This cannot be fixed in the app: move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.";
    expect(e()!.helpfulContext).toBe(expected);
    expect(expected.length).toBe(247);
  });

  it("C-SUS-6 longExplanation", () => {
    expect(e()!.longExplanation).toBe(
      "A reservation on a shared hotel line may be showing the wrong hotel. Spot-check it against your sheet. This cannot be fixed in the app: move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
    );
  });

  it("C-SUS-7 crewFacing is null", () => {
    expect(e()!.crewFacing).toBeNull();
  });

  it("C-SUS-8 followUp", () => {
    expect(e()!.followUp).toBe("Doug → fix the sheet: one booking per HOTEL RESERVATION column");
  });

  it("C-SUS-10 helpHref", () => {
    expect(e()!.helpHref).toBe("/help/errors#HOTEL_INLINE_GROUP_HOTEL_SUSPECTED");
  });

  it("C-SUS-9 / C-SUS-9p gap-class label and plural", () => {
    const gap = GAP_CLASSES.find((g) => g.code === SUSPECTED);
    expect(gap).toBeDefined();
    expect(gap!.label).toBe("reservation may show the wrong hotel");
    expect(gap!.plural).toBe("reservations may show the wrong hotel");
  });
});

describe("INTERNAL_CODE_ENUMS membership", () => {
  // Regeneration alone proves nothing: this fails if either emitter carries the code
  // through a constant instead of a LITERAL `code: "..."` property, because the
  // extractor only recognizes literals — and serializeParseWarning would then blank
  // the code at the telemetry boundary.
  for (const code of [OWN, SUSPECTED]) {
    it(`${code} is registered with source parse_warnings.code`, () => {
      expect(INTERNAL_CODE_ENUMS).toHaveProperty(code);
      expect((INTERNAL_CODE_ENUMS as Record<string, { source: string }>)[code]?.source).toBe(
        "parse_warnings.code",
      );
    });
  }
});

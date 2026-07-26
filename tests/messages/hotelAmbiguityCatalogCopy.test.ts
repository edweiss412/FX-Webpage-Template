// tests/messages/hotelAmbiguityCatalogCopy.test.ts
//
// Byte-for-byte oracles for the hotel-ambiguity catalog copy (spec §8.5 over
// the normative copy table, whole-diff R4 f3). The registry trigger-context
// check and the generic hygiene meta-tests do NOT pin these: a
// generic-but-wrong title, a wrong /help/errors# anchor, a wrong `code` value,
// or an extra catalog property all pass those while shipping false copy.
// Copy rule: strings never assert mechanism (spec "copy discipline", R6).
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";

describe("hotel-ambiguity catalog copy — byte-for-byte", () => {
  it("HOTEL_ADDRESS_SPLIT_AMBIGUOUS is EXACTLY the spec's nine-key row (C9–C16, C19)", () => {
    // toEqual on the whole object also rejects any extra property.
    expect(MESSAGE_CATALOG.HOTEL_ADDRESS_SPLIT_AMBIGUOUS).toEqual({
      code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      dougFacing:
        "A hotel line in _<sheet-name>_ may have its name and street address run together; check the hotel name and address against your sheet.",
      crewFacing: null,
      followUp: "Doug → spot-check hotel name and address",
      helpfulContext:
        "A hotel line's name and street address may not have been separated correctly. Check the hotel name and address in case part of one landed in the other.",
      triggerContext:
        "Appears when a hotel line's name and street address may not have been separated correctly.",
      title: "A hotel name and address may be split wrong",
      longExplanation:
        "A hotel line's name and street address may not have been separated correctly. We kept every word rather than dropping any, so nothing is lost, but the dividing point may be off: part of the address may be sitting in the hotel name, or part of the name in the address. Spot-check both against your sheet.",
      helpHref: "/help/errors#HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    });
  });

  it("HOTEL_GUEST_SPLIT_AMBIGUOUS carries the edited C4–C8 strings verbatim", () => {
    const row = MESSAGE_CATALOG.HOTEL_GUEST_SPLIT_AMBIGUOUS;
    expect(row.dougFacing).toBe(
      "A hotel line in _<sheet-name>_ may not have been read correctly; check who is on the hotel reservation against your sheet.",
    );
    expect(row.title).toBe("A hotel line may be read wrong");
    expect(row.triggerContext).toBe("Appears when a hotel line could be read more than one way.");
    expect(row.helpfulContext).toBe(
      "A hotel line could be read more than one way, so we made a judgment call. Check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.",
    );
    expect(row.longExplanation).toBe(
      "A hotel line could be read more than one way, so we made a judgment call about where each part starts and ends. Spot-check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.",
    );
    expect(row.crewFacing).toBeNull();
    expect(row.followUp).toBe("Doug → spot-check hotel guests");
  });

  it("GAP_CLASSES labels match C20 and C21 verbatim", () => {
    const byCode = Object.fromEntries(GAP_CLASSES.map((g) => [g.code, g.label]));
    expect(byCode.HOTEL_ADDRESS_SPLIT_AMBIGUOUS).toBe("hotel name and address may be split wrong");
    expect(byCode.HOTEL_GUEST_SPLIT_AMBIGUOUS).toBe("hotel line may be read wrong");
  });
});

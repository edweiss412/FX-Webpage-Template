/**
 * lib/crew/quickFacts.ts — selection, gates and the per-night hotel rule.
 *
 * Spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.5.
 * Every expected value is read back from the fixture that produced it, so a
 * case cannot pass on a literal the code happens to also contain.
 */
import { describe, expect, it } from "vitest";
import type { HotelReservationRow } from "@/lib/parser/types";
import {
  DEFAULT_QUICK_FACT_ORDER,
  QUICK_FACT_LIMIT,
  reservationForNight,
  selectQuickFacts,
  type QuickFactViewer,
} from "@/lib/crew/quickFacts";
import { makeShowForViewer } from "../fixtures/showForViewer";

const CREW: QuickFactViewer = {
  personal: true,
  datesSuppressed: false,
  transportVisible: true,
  tonightIso: "2026-11-03",
};
const ADMIN: QuickFactViewer = { ...CREW, personal: false };
const SUPPRESSED: QuickFactViewer = { ...CREW, datesSuppressed: true };

function reservation(over: Partial<HotelReservationRow>): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: "Hotel One",
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: "2026-11-02",
    check_out: "2026-11-04",
    notes: null,
    ...over,
  };
}

/** A show where every fact resolves for a crew viewer. */
function fullShow() {
  return makeShowForViewer({
    show: {
      venue: {
        name: "Grand Hall",
        address: "1 Plaza Way",
        loadingDock: "Dock B off Elm St",
        googleLink: "https://maps.example.com/grand-hall",
      },
      event_details: { internet: "SSID: Hyatt_Meeting code: FITS2025", dress_code: "Show blacks" },
    },
    hotelReservations: [reservation({ confirmation_no: "CONF-77" })],
    contacts: [
      {
        kind: "venue",
        name: "Pat Venue",
        email: "pat@venue.example",
        phone: "(555) 010-2020",
        notes: null,
      },
    ],
    transportation: { parking: "Garage level 2" } as never,
  });
}

describe("DEFAULT_QUICK_FACT_ORDER", () => {
  it("is the spec order, exactly", () => {
    expect(DEFAULT_QUICK_FACT_ORDER).toEqual([
      "wifi",
      "hotel",
      "dock",
      "contact",
      "parking",
      "dressCode",
      "address",
    ]);
  });
});

describe("selectQuickFacts", () => {
  it("resolves every source on its own, with its label and value from the fixture", () => {
    const show = fullShow();
    const expected = {
      wifi: ["Wi-Fi", "Hyatt_Meeting"],
      hotel: ["Hotel", show.hotelReservations[0]!.hotel_name],
      dock: ["Loading dock", show.show.venue!.loadingDock],
      contact: ["Who to call", show.contacts[0]!.name],
      parking: ["Parking", show.transportation!.parking],
      dressCode: ["Dress code", show.show.event_details.dress_code],
      address: ["Venue", show.show.venue!.name],
    } as const;
    for (const id of DEFAULT_QUICK_FACT_ORDER) {
      const [fact] = selectQuickFacts([id], show, CREW);
      const [label, firstLine] = expected[id];
      expect(fact?.label, id).toBe(label);
      expect(fact?.lines[0]?.text, id).toBe(firstLine);
    }
  });

  it("keeps the order and stops at the limit", () => {
    const facts = selectQuickFacts(DEFAULT_QUICK_FACT_ORDER, fullShow(), CREW);
    expect(facts.map((f) => f.id)).toEqual(DEFAULT_QUICK_FACT_ORDER.slice(0, QUICK_FACT_LIMIT));
  });

  it("skips an empty or sentinel source and takes the next id", () => {
    const show = fullShow();
    show.show.event_details["internet"] = "TBD";
    show.show.venue!.loadingDock = null;
    const facts = selectQuickFacts(DEFAULT_QUICK_FACT_ORDER, show, CREW);
    expect(facts.map((f) => f.id)).toEqual(["hotel", "contact", "parking", "dressCode"]);
  });

  it("returns nothing for a show with no fact sources", () => {
    expect(
      selectQuickFacts(
        DEFAULT_QUICK_FACT_ORDER,
        makeShowForViewer({ show: { venue: null } }),
        CREW,
      ),
    ).toEqual([]);
  });

  it("omits parking when the transport gate excludes the viewer", () => {
    const facts = selectQuickFacts(["parking"], fullShow(), { ...CREW, transportVisible: false });
    expect(facts).toEqual([]);
  });

  it("never selects the client contact", () => {
    const show = fullShow();
    show.contacts = [];
    show.show.client_contact = {
      name: "Client Person",
      email: "c@client.example",
      phone: "5550001111",
    } as never;
    expect(selectQuickFacts(["contact"], show, CREW)).toEqual([]);
  });

  it("omits the hotel for a plain admin viewer", () => {
    expect(selectQuickFacts(["hotel"], fullShow(), ADMIN)).toEqual([]);
  });

  it("omits the hotel for a date-suppressed viewer", () => {
    expect(selectQuickFacts(["hotel"], fullShow(), SUPPRESSED)).toEqual([]);
  });

  it("shows tonight's hotel and confirmation, and copies the confirmation", () => {
    const show = fullShow();
    const row = show.hotelReservations[0]!;
    const [fact] = selectQuickFacts(["hotel"], show, CREW);
    expect(fact?.lines).toEqual([
      { text: row.hotel_name },
      { label: "Confirmation", text: row.confirmation_no },
    ]);
    expect(fact?.actions).toEqual([
      { kind: "copy", label: "Copy hotel confirmation number", value: row.confirmation_no },
    ]);
  });
});

describe("Wi-Fi fact", () => {
  it("copies the password when the Venue split finds one", () => {
    const [fact] = selectQuickFacts(["wifi"], fullShow(), CREW);
    const password = fact?.lines.find((l) => l.label === "Password")?.text;
    expect(password).toBeTruthy();
    expect(fact?.actions).toEqual([
      { kind: "copy", label: "Copy Wi-Fi password", value: password },
    ]);
  });

  it("shows and copies the whole text when the split finds no password", () => {
    const show = fullShow();
    const raw = "Hardline from Encore at FOH";
    show.show.event_details["internet"] = raw;
    const [fact] = selectQuickFacts(["wifi"], show, CREW);
    expect(fact?.lines).toEqual([{ text: raw }]);
    expect(fact?.actions).toEqual([{ kind: "copy", label: "Copy Wi-Fi details", value: raw }]);
  });

  it("falls back to the raw text when a split field is a sentinel, as the Venue section does", () => {
    const show = fullShow();
    const raw = "SSID: TBD";
    show.show.event_details["internet"] = raw;
    const [fact] = selectQuickFacts(["wifi"], show, CREW);
    expect(fact?.lines).toEqual([{ text: raw }]);
  });
});

describe("contact fact actions follow field validity", () => {
  it("offers Call, Text and Email for a full contact", () => {
    const [fact] = selectQuickFacts(["contact"], fullShow(), CREW);
    expect(fact?.actions.map((a) => a.kind)).toEqual(["call", "text", "email"]);
    expect(fact?.actions[0]).toEqual({ kind: "call", href: "tel:5550102020" });
  });

  it("offers Email alone when the phone is a sentinel", () => {
    const show = fullShow();
    show.contacts[0]!.phone = "TBD";
    const [fact] = selectQuickFacts(["contact"], show, CREW);
    expect(fact?.actions.map((a) => a.kind)).toEqual(["email"]);
  });

  it("falls back to the kind label for a nameless contact", () => {
    const show = fullShow();
    show.contacts[0]!.name = null;
    const [fact] = selectQuickFacts(["contact"], show, CREW);
    expect(fact?.lines).toEqual([{ text: "Venue contact" }]);
  });

  // Spec §4.5: the value is the "name and kind label". The kind is why a crew
  // member calls this person, so a named contact keeps it as a second line.
  it.each([
    ["venue", "Venue contact"],
    ["in_house_av", "In-house AV"],
  ] as const)("names a %s contact and keeps its kind label as a second line", (kind, label) => {
    const show = fullShow();
    show.contacts[0]!.kind = kind;
    const name = show.contacts[0]!.name!;
    const [fact] = selectQuickFacts(["contact"], show, CREW);
    expect(fact?.lines).toEqual([{ text: name }, { text: label }]);
  });
});

describe("address fact", () => {
  it("links Directions only for a parseable map URL", () => {
    const show = fullShow();
    const [withLink] = selectQuickFacts(["address"], show, CREW);
    expect(withLink?.actions).toEqual([{ kind: "directions", href: show.show.venue!.googleLink }]);

    show.show.venue!.googleLink = "not a url";
    const [withoutLink] = selectQuickFacts(["address"], show, CREW);
    expect(withoutLink?.actions).toEqual([]);
  });
});

describe("reservationForNight", () => {
  const first = reservation({
    ordinal: 1,
    hotel_name: "First",
    check_in: "2026-11-01",
    check_out: "2026-11-03",
  });
  const second = reservation({
    ordinal: 2,
    hotel_name: "Second",
    check_in: "2026-11-03",
    check_out: "2026-11-05",
  });

  it("includes the check-in night", () => {
    expect(reservationForNight([first, second], second.check_in!)?.hotel_name).toBe(
      second.hotel_name,
    );
  });

  it("excludes the check-out night", () => {
    expect(reservationForNight([first], first.check_out!)).toBeNull();
  });

  it("breaks an overlap by ordinal, not by array position", () => {
    const overlapA = reservation({ ordinal: 2, hotel_name: "Later ordinal" });
    const overlapB = reservation({ ordinal: 1, hotel_name: "Earlier ordinal" });
    expect(reservationForNight([overlapA, overlapB], "2026-11-02")?.hotel_name).toBe(
      overlapB.hotel_name,
    );
  });

  it("returns null rather than the first reservation when no night matches", () => {
    expect(reservationForNight([first, second], "2026-12-25")).toBeNull();
  });

  it("skips a reservation missing either date", () => {
    expect(reservationForNight([reservation({ check_out: null })], "2026-11-02")).toBeNull();
  });
});

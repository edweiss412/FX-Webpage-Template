// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
/**
 * tests/components/crew/sections/HomeSection.test.tsx — the composed home's
 * server body (crew page redesign plan Task 11): what the Today section renders
 * under the day row, the pass and the run-of-show card. It replaced
 * `TodaySection`; each retired Today block's successor is listed in the plan's
 * Task 11 table, and the cases that pinned a kept block moved here with their
 * failure modes (show notes, the Dress code card, the client-contact ban, the
 * admin fetch-failure blocks).
 *
 * Expected values are read back from the fixture that produced them.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

import { HomeSection } from "@/components/crew/sections/HomeSection";
import { buildQuickFacts, DEFAULT_QUICK_FACT_ORDER } from "@/lib/crew/quickFacts";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { DateRestriction, HotelReservationRow } from "@/lib/parser/types";
import * as todayRows from "@/components/crew/sections/todayRows";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const SHOW_ID = "show-abc";
/** Noon UTC is mid-morning in the show timezone, so the show-tz date is the ISO date. */
const at = (iso: string): Date => new Date(`${iso}T15:00:00Z`);
const TODAY_ISO = "2026-05-14";
const TODAY = at(TODAY_ISO);
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const ADMIN: Viewer = { kind: "admin" };

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function home(data: ShowForViewer, viewer: Viewer = CREW, today: Date = TODAY) {
  return render(
    <HomeSection {...ledgerProp()} data={data} viewer={viewer} today={today} showId={SHOW_ID} />,
  );
}

function reservation(over: Partial<HotelReservationRow>): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: "Hotel One",
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: "2026-05-13",
    check_out: "2026-05-15",
    notes: null,
    ...over,
  };
}

/** Everything the home body shows: facts, notes from two sources, and a dress code. */
function fullHome(): ShowForViewer {
  return makeShowForViewer({
    show: {
      venue: { name: "Center Hall", address: "5 Ave", notes: "VENUE_NOTE" },
      event_details: {
        internet: "SSID: Hall_Crew code: HALL2026",
        dress_code: "Business casual",
      },
    },
    hotelReservations: [reservation({ hotel_name: "Hyatt", confirmation_no: "HY-1" })],
    contacts: [
      { kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: "CONTACT_NOTE" },
    ],
  });
}

const RETIRED_CARD_IDS = ["today-tonight", "today-where", "today-contact", "today-key-times"];
const RETIRED_TEST_IDS = [
  "today-quick-cards",
  "today-card-tonight",
  "today-card-where",
  "today-card-need-something",
  "today-need-something",
  "today-key-times",
  "today-mode-b-grid",
  "today-day-context",
  "key-times-strip",
];

describe("home: the composed body (spec §3.2, AC-1)", () => {
  test("home: the body renders quick facts, then show notes, then the Dress code card, under section-today", () => {
    const { container } = home(fullHome());
    const root = container.querySelector('[data-testid="section-today"]')!;
    expect(root).not.toBeNull();
    const facts = root.querySelector('[data-testid="crew-quick-facts"]')!;
    const notes = root.querySelector('[data-card-id="today-notes"]')!;
    const dress = root.querySelector('[data-card-id="today-dress"]')!;
    for (const el of [facts, notes, dress]) expect(el).not.toBeNull();
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(facts, notes), "show notes follow quick facts").toBe(true);
    expect(follows(notes, dress), "the Dress code card follows show notes").toBe(true);
    // The pass, the day row and the run card mount from the controller, never here.
    for (const id of ["crew-pass", "crew-day-row", "today-run-of-show"]) {
      expect(root.querySelector(`[data-testid="${id}"]`), id).toBeNull();
    }
  });

  test("home: no retired Today card or test id renders; their facts live in the quick facts and the pass", () => {
    const { container } = home(fullHome());
    for (const id of RETIRED_CARD_IDS) {
      expect(container.querySelector(`[data-card-id="${id}"]`), id).toBeNull();
    }
    for (const id of RETIRED_TEST_IDS) {
      expect(container.querySelector(`[data-testid="${id}"]`), id).toBeNull();
    }
    // POSITIVE CONTROL: the hotel, venue and contact the retired cards showed are
    // on the page, as quick facts.
    const data = fullHome();
    const facts = container.querySelector('[data-testid="crew-quick-facts"]')!;
    expect(facts.textContent).toContain(data.hotelReservations[0]!.hotel_name);
    expect(facts.textContent).toContain(data.contacts[0]!.name);
  });

  test("home: the quick facts are the server-built facts for this viewer, in order", () => {
    const data = fullHome();
    const { container } = home(data);
    const ids = [...container.querySelectorAll('[data-testid="crew-quick-fact"]')].map((t) =>
      t.getAttribute("data-fact"),
    );
    expect(ids).toEqual(buildQuickFacts({ data, viewer: CREW, today: TODAY }).map((f) => f.id));
    expect(ids.length).toBeGreaterThan(0);
  });

  test("home: with no fact, note or dress code the body renders nothing at all", () => {
    const data = makeShowForViewer({ show: { venue: null }, contacts: [] });
    // PREMISE: nothing resolves.
    expect(buildQuickFacts({ data, viewer: CREW, today: TODAY })).toEqual([]);
    const { container } = home(data);
    const root = container.querySelector('[data-testid="section-today"]')!;
    expect(root.childElementCount).toBe(0);
    expect(root).toHaveClass("empty:hidden");
    expect(container.textContent).not.toContain("Quick facts");
  });

  test("home: the notes and dress cards keep their card ids and header actions", () => {
    const { container } = home(fullHome());
    for (const id of ["today-notes", "today-dress"]) {
      const card = container.querySelector(`[data-card-id="${id}"]`)!;
      expect(card, id).not.toBeNull();
      expect(card.getAttribute("data-testid"), id).toBe(id);
    }
    // The Dress code card carries the source link and the report trigger (spec §6.4).
    const dress = container.querySelector('[data-card-id="today-dress"]')!;
    expect(dress.querySelector('[data-slot="section-card-action"]')).not.toBeNull();
  });
});

describe("home: kept blocks (spec §6.2 crew-only content)", () => {
  test("home: show notes aggregate all 5 sources in order; the transport note follows the transport gate", () => {
    const data = makeShowForViewer({
      show: { venue: { name: "V", address: "A", notes: "VENUE_NOTE" } },
      hotelReservations: [reservation({ hotel_name: "H", notes: "HOTEL_NOTE" })],
      rooms: [{ id: "r1", kind: "gs", name: "GS", notes: "ROOM_NOTE" }],
      transportation: {
        driver_name: null,
        driver_phone: null,
        driver_email: null,
        vehicle: null,
        license_plate: null,
        color: null,
        parking: null,
        schedule: [],
        notes: "TRANSPORT_NOTE",
      },
      contacts: [
        { kind: "venue", name: "C", notes: "CONTACT_NOTE", phone: "555-0000", email: null },
      ],
    });
    const admin = home(data, ADMIN);
    const notes = admin.container.querySelector('[data-testid="today-notes"]')!;
    const order = ["VENUE_NOTE", "HOTEL_NOTE", "ROOM_NOTE", "TRANSPORT_NOTE", "CONTACT_NOTE"].map(
      (s) => notes.textContent!.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
    cleanup();
    // c1 is on the roster with no transport assignment: the gate is closed.
    const crew = home(data, CREW);
    expect(crew.container.querySelector('[data-testid="today-notes"]')!.textContent).not.toContain(
      "TRANSPORT_NOTE",
    );
  });

  // Audit P3-3: a note that fits is plain text. A disclosure that opens nothing
  // is a dead tab stop announced as expandable, so only a cut note is one.
  test("home: only a truncated show note is a disclosure; a note that fits is plain text", () => {
    const long = `LONG_NOTE ${"x".repeat(todayRows.TRUNCATE_AT)}`;
    const data = makeShowForViewer({
      show: { venue: { name: "V", address: "A", notes: "SHORT_NOTE" } },
      contacts: [{ kind: "venue", name: "C", notes: long, phone: "555-0000", email: null }],
    });
    const notes = home(data, ADMIN).container.querySelector('[data-testid="today-notes"]')!;
    const rows = [...notes.querySelectorAll("li[data-source]")];
    const short = rows.find((li) => li.textContent!.includes("SHORT_NOTE"))!;
    const cut = rows.find((li) => li.textContent!.includes("LONG_NOTE"))!;
    // PREMISE: the fixture produced one note under the cap and one over it.
    expect(short.hasAttribute("data-truncated")).toBe(false);
    expect(cut.getAttribute("data-truncated")).toBe("true");

    expect(short.querySelector("details, summary")).toBeNull();
    expect(within(short as HTMLElement).queryByRole("button")).toBeNull();
    expect(short).toHaveTextContent("SHORT_NOTE");

    const summary = cut.querySelector("details > summary");
    expect(summary, "a cut note keeps its disclosure").not.toBeNull();
    expect(cut.querySelector("details")!.textContent).toContain(long);
  });

  test("home: the client contact never appears; Who to call names the deterministic actionable primary", () => {
    const data = makeShowForViewer({
      show: {
        client_contact: { name: "CLIENT_REP", phone: "555-999-0000", email: "rep@client.com" },
      },
      contacts: [
        { kind: "venue", name: "Unactionable", phone: null, email: null, notes: null },
        { kind: "in_house_av", name: "AV_LEAD", phone: "555-222-3333", email: null, notes: null },
      ],
    });
    const { container } = home(data);
    expect(container.textContent).not.toContain("CLIENT_REP");
    expect(container.textContent).not.toContain("555-999-0000");
    const contact = container.querySelector('[data-fact="contact"]')!;
    expect(contact.textContent).toContain("AV_LEAD");
  });

  test("home: the dock fact hides a sentinel and takes the next source", () => {
    const data = fullHome();
    data.show.venue!.loadingDock = "TBD";
    const { container } = home(data);
    expect(container.querySelector('[data-fact="dock"]')).toBeNull();
    expect(container.textContent).not.toContain("TBD");
  });

  test("home: the Dress code card renders each phase as a term over its attire", () => {
    const data = makeShowForViewer({
      show: {
        event_details: {
          dress_code:
            "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
            "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
        },
      },
    });
    const { getByTestId } = home(data);
    const card = within(getByTestId("today-dress"));
    expect(card.getAllByRole("term").map((el) => el.textContent)).toEqual(["Set/Strike", "Show"]);
    expect(card.getAllByRole("definition")[1]?.textContent).toBe(
      "Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
    );
  });
});

describe("home: degraded states keep their audience (spec §5.1 L241)", () => {
  for (const domain of ["rooms", "hotel", "contacts"] as const) {
    test(`home: a ${domain} fetch failure shows an admin its degraded block, above the quick facts; crew see omission`, () => {
      const data = fullHome();
      data.tileErrors = { [domain]: "boom" };
      const admin = home(data, ADMIN).container;
      const block = admin.querySelector(`[data-testid="section-tile-error-${domain}"]`);
      expect(block).not.toBeNull();
      expect(block!.textContent ?? "").not.toContain("boom");
      const facts = admin.querySelector('[data-testid="crew-quick-facts"]');
      if (facts) {
        expect(block!.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }
      cleanup();
      const crew = home(data, CREW).container;
      expect(crew.querySelector(`[data-testid="section-tile-error-${domain}"]`)).toBeNull();
    });
  }

  test("home: a throwing derivation renders the fallback in place of the body and records crew:today:notes", () => {
    vi.spyOn(todayRows, "todayRows").mockImplementation(() => {
      throw new Error("planted home derivation fault");
    });
    const ledger = createTileRenderLedger();
    const { container } = render(
      <HomeSection
        ledger={ledger}
        data={fullHome()}
        viewer={CREW}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    expect(container.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="crew-quick-facts"]')).toBeNull();
    expect(container.querySelector('[data-card-id="today-notes"]')).toBeNull();
    expect(ledger.attempted.has("crew:today:notes")).toBe(true);
    expect([...ledger.failed.keys()]).toContain("crew:today:notes");
  });
});

describe("home: the quick facts' client props (harness rule Client props, AC-6, AC-7)", () => {
  /** A show whose hotel covers tonight with a confirmation, and whose venue has every field. */
  function withRestriction(restriction: DateRestriction): ShowForViewer {
    const data = fullHome();
    data.show.dates = {
      travelIn: "2026-05-12",
      set: "2026-05-13",
      showDays: ["2026-05-14", "2026-05-15"],
      travelOut: "2026-05-16",
    } as ShowForViewer["show"]["dates"];
    data.hotelReservations = [
      reservation({
        hotel_name: "Hyatt Tonight",
        confirmation_no: "HY-42",
        check_in: "2026-05-12",
        check_out: "2026-05-16",
      }),
    ];
    data.crewMembers = [{ ...data.crewMembers[0]!, dateRestriction: restriction }];
    return data;
  }
  const withheld = (data: ShowForViewer) => [
    data.show.dates!.travelIn!,
    data.show.dates!.set!,
    ...data.show.dates!.showDays,
    data.show.dates!.travelOut!,
    ...data.hotelReservations.flatMap((h) => [h.check_in!, h.check_out!]),
    data.hotelReservations[0]!.hotel_name!,
    data.hotelReservations[0]!.confirmation_no!,
  ];

  test("home: a date-suppressed viewer's quick facts props carry no show date, no hotel date and no hotel", () => {
    const data = withRestriction({ kind: "unknown_asterisk", days: null });
    const json = JSON.stringify(buildQuickFacts({ data, viewer: CREW, today: TODAY }));
    for (const value of withheld(data)) expect(json, value).not.toContain(value);
    // POSITIVE CONTROL: an unrestricted viewer's props carry tonight's hotel.
    const open = withRestriction({ kind: "none" });
    const control = JSON.stringify(buildQuickFacts({ data: open, viewer: CREW, today: TODAY }));
    expect(control).toContain(open.hotelReservations[0]!.hotel_name!);
    expect(control).toContain(open.hotelReservations[0]!.confirmation_no!);
  });

  test("home: a viewer the transport gate excludes gets no transport field in the quick facts props", () => {
    const data = fullHome();
    data.transportation = {
      driver_name: "Drive Er",
      driver_phone: "555-777-8888",
      driver_email: null,
      vehicle: "Sprinter",
      license_plate: "PLATE9",
      color: "White",
      parking: "Lot C behind the dock",
      schedule: [],
      notes: "TRANSPORT_NOTE",
      loadout_name: "Load Outer",
      loadout_phone: "555-333-4444",
      loadout_email: null,
    } satisfies NonNullable<ShowForViewer["transportation"]>;
    // Make parking reachable inside the 4-fact cap: no Wi-Fi, hotel or dock.
    data.show.event_details = { dress_code: "Business casual" };
    data.hotelReservations = [];
    data.show.venue!.loadingDock = null;
    const transport = data.transportation!;
    const fields = [
      transport.driver_name!,
      transport.driver_phone!,
      transport.vehicle!,
      transport.license_plate!,
      transport.parking!,
      transport.notes!,
      transport.loadout_name!,
      transport.loadout_phone!,
    ];
    const json = JSON.stringify(buildQuickFacts({ data, viewer: CREW, today: TODAY }));
    for (const value of fields) expect(json, value).not.toContain(value);
    // POSITIVE CONTROL: an admin passes the gate and gets the parking fact.
    const admin = buildQuickFacts({ data, viewer: ADMIN, today: TODAY });
    expect(admin.map((f) => f.id)).toContain("parking");
    expect(JSON.stringify(admin)).toContain(transport.parking!);
  });

  test("home: the hotel fact names the reservation covering the server's night, never the first", () => {
    const data = fullHome();
    data.hotelReservations = [
      reservation({
        ordinal: 1,
        hotel_name: "First Night Inn",
        check_in: "2026-05-12",
        check_out: "2026-05-14",
      }),
      reservation({
        ordinal: 2,
        hotel_name: "Second Leg Hotel",
        check_in: "2026-05-14",
        check_out: "2026-05-16",
      }),
    ];
    const tonight = data.hotelReservations[1]!.hotel_name!;
    const { container } = home(data, CREW, TODAY);
    const hotel = container.querySelector('[data-fact="hotel"]')!;
    expect(hotel.textContent).toContain(tonight);
    expect(hotel.textContent).not.toContain(data.hotelReservations[0]!.hotel_name!);
    cleanup();
    // A night no reservation covers omits the fact rather than falling back.
    const { container: none } = home(data, CREW, at("2026-05-20"));
    expect(none.querySelector('[data-fact="hotel"]')).toBeNull();
  });

  test("home: a plain admin gets no personal hotel fact", () => {
    const facts = buildQuickFacts({ data: fullHome(), viewer: ADMIN, today: TODAY });
    expect(facts.map((f) => f.id)).not.toContain("hotel");
    expect(facts.length).toBeGreaterThan(0);
    expect(DEFAULT_QUICK_FACT_ORDER).toContain("hotel");
  });
});

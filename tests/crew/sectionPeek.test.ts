/**
 * lib/crew/sectionPeek.ts: the one-line peek under each "All sections" row.
 *
 * Spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.6 and
 * §11 (L475). A peek reads only what its section renders for the viewer, each
 * through the section's own gate. Every expected value is read back from the
 * fixture that produced it, and every gate's verdict comes from calling that
 * gate, so a case cannot pass on a literal the module also contains. Each
 * absence check carries a positive control over a viewer allowed to see the
 * value.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crewSectionsFor, type CrewSectionId } from "@/lib/crew/crewSections";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { sectionPeek, type SectionPeekViewer } from "@/lib/crew/sectionPeek";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { formatIsoDate } from "@/lib/format/date";
import type {
  HotelReservationRow,
  TransportScheduleEntry,
  TransportationRow,
  WorkPhase,
} from "@/lib/parser/types";
import { venueDisplay } from "@/lib/venue/venueLocation";
import { isPackListVisibleToday, todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { financialsVisible, transportTileVisible } from "@/lib/visibility/scopeTiles";
import { makeShowForViewer } from "../fixtures/showForViewer";

type Member = ShowForViewer["crewMembers"][number];

const TRAVEL_IN = "2026-11-01";
const SET_DAY = "2026-11-02";
const SHOW_DAYS = ["2026-11-03", "2026-11-04", "2026-11-05"];
const TRAVEL_OUT = "2026-11-06";

const PHASES: Record<string, WorkPhase[]> = {
  [TRAVEL_IN]: ["Load In"],
  [SET_DAY]: ["Set"],
  [SHOW_DAYS[0]!]: ["Show"],
  [SHOW_DAYS[1]!]: ["Show"],
  [SHOW_DAYS[2]!]: ["Show", "Strike"],
  [TRAVEL_OUT]: ["Load Out"],
};

function member(id: string, name: string, over: Partial<Member> = {}): Member {
  return {
    id,
    name,
    email: null,
    phone: null,
    role: "",
    roleFlags: [],
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
    ...over,
  };
}

const ROSTER: Member[] = [
  member("c-plain", "Plain Crew"),
  member("c-lead", "Lead Crew", { roleFlags: ["LEAD"] }),
  member("c-asterisk", "Asterisk Crew", {
    dateRestriction: { kind: "unknown_asterisk", days: null },
  }),
  member("c-explicit", "Explicit Crew", {
    dateRestriction: { kind: "explicit", days: [SHOW_DAYS[1]!] },
  }),
  member("c-strike", "Strike Crew", { stageRestriction: { kind: "explicit", stages: ["Strike"] } }),
  member("c-set", "Set Crew", { stageRestriction: { kind: "explicit", stages: ["Set"] } }),
  member("c-rider", "Riley Rider"),
];

const ADMIN: Viewer = { kind: "admin" };
const crew = (id: string): Viewer => ({ kind: "crew", crewMemberId: id });

function reservation(over: Partial<HotelReservationRow>): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: "Harbor Inn",
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: TRAVEL_IN,
    check_out: TRAVEL_OUT,
    notes: null,
    ...over,
  };
}

/** Legs the Travel section renders: each has at least one non-sentinel field. */
const CONTENT_LEGS: TransportScheduleEntry[] = [
  { stage: "Arrival", date: TRAVEL_IN, time: "2:00 PM", assigned_names: ["Riley Rider"] },
  { stage: "Load Out", date: TRAVEL_OUT, time: "9:00 AM", assigned_names: [] },
];
/** A leg the Travel section drops: every field is a sentinel or empty. */
const BLANK_LEG: TransportScheduleEntry = {
  stage: "TBD",
  date: null,
  time: "N/A",
  assigned_names: [],
};

function transport(schedule: TransportScheduleEntry[]): TransportationRow {
  return {
    driver_name: "Morgan Wheel",
    driver_phone: "555-010-3030",
    driver_email: null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: "Sprinter van",
    license_plate: "FXAV-1",
    color: null,
    parking: "Garage level 2",
    schedule,
    notes: null,
  };
}

/** The venue contacts the Contacts section lists (never the client contact). */
const CONTACTS: ShowForViewer["contacts"] = [
  { kind: "venue", name: "Vic Venue", email: null, phone: "555-0120", notes: null },
  { kind: "in_house_av", name: null, email: "av@venue.example", phone: null, notes: null },
];

/** A show where every section has something to peek at. */
function fullShow(): ShowForViewer {
  return makeShowForViewer({
    crewMembers: ROSTER,
    show: {
      venue: { name: "Grand Hall", address: "1 Plaza Way" },
      dates: { travelIn: TRAVEL_IN, set: SET_DAY, showDays: SHOW_DAYS, travelOut: TRAVEL_OUT },
      schedule_phases: PHASES,
    },
    hotelReservations: [reservation({})],
    transportation: transport([...CONTENT_LEGS, BLANK_LEG]),
    pullSheet: Array.from({ length: 14 }, (_, i) => ({ caseLabel: `Case ${i + 1}`, items: [] })),
    financials: { po: "PO-4471", proposal: null, invoice: null, invoice_notes: null },
    contacts: CONTACTS,
  });
}

/** Midday in the show's timezone on `iso`, the request clock the sections receive. */
function middayOn(iso: string): Date {
  return new Date(`${iso}T17:00:00Z`);
}

/** The per-viewer fields the projection fills, as getShowForViewer does. */
function project(base: ShowForViewer, viewer: Viewer): ShowForViewer {
  if (viewer.kind === "admin") {
    return { ...base, viewerId: null, viewerName: null, viewerNameAliases: [] };
  }
  const row = base.crewMembers.find((c) => c.id === viewer.crewMemberId)!;
  return { ...base, viewerId: row.id, viewerName: row.name, viewerNameAliases: [row.name] };
}

function peekViewer(data: ShowForViewer, viewer: Viewer, today: Date): SectionPeekViewer {
  return { ...resolveViewerContext(viewer, data), today };
}

function peek(
  id: CrewSectionId,
  base: ShowForViewer,
  viewer: Viewer,
  today: Date = middayOn(SET_DAY),
): string | null {
  const data = project(base, viewer);
  return sectionPeek(id, data, peekViewer(data, viewer, today));
}

/** Every peek of every section this viewer is listed, as the list would carry them. */
function allPeeks(base: ShowForViewer, viewer: Viewer, today = middayOn(SET_DAY)) {
  const data = project(base, viewer);
  const ctx = resolveViewerContext(viewer, data);
  return crewSectionsFor(data, ctx).map((s) => ({
    id: s.id,
    peek: sectionPeek(s.id, data, { ...ctx, today }),
  }));
}

describe("sectionPeek (peek, spec §4.6)", () => {
  it("peek: venue is the name the Venue section's Venue row shows", () => {
    const venue = {
      name: "Four Seasons Hotel Chicago",
      address: "120 E Delaware Pl, Chicago, IL 60611",
    };
    const show = makeShowForViewer({ crewMembers: ROSTER, show: { venue } });
    const shown = venueDisplay(venue).name ?? venue.name;
    // Premise: the Venue row strips the redundant city, so the case tells the two apart.
    expect(shown).not.toBe(venue.name);
    expect(peek("venue", show, crew("c-plain"))).toBe(shown);
    expect(peek("venue", fullShow(), crew("c-plain"))).toBe(fullShow().show.venue!.name);
  });

  it("peek: crew counts the roster the Crew section lists", () => {
    const show = fullShow();
    expect(peek("crew", show, crew("c-plain"))).toBe(`${show.crewMembers.length} people`);
    const solo = makeShowForViewer({ crewMembers: [ROSTER[0]!] });
    expect(solo.crewMembers).toHaveLength(1);
    expect(peek("crew", solo, crew("c-plain"))).toBe("1 person");
  });

  it("peek: contacts counts the contacts the Contacts section lists, never the client contact, null at zero", () => {
    const client = { name: "Dana Clientside", phone: "555-0100", email: null };
    const show = makeShowForViewer({
      crewMembers: ROSTER,
      contacts: CONTACTS,
      show: { client_contact: client },
    });
    expect(peek("contacts", show, crew("c-plain"))).toBe(`${CONTACTS.length} contacts`);
    const solo = makeShowForViewer({ crewMembers: ROSTER, contacts: [CONTACTS[0]!] });
    expect(peek("contacts", solo, crew("c-plain"))).toBe("1 contact");
    // A client contact alone is not a contact the section lists.
    const clientOnly = makeShowForViewer({
      crewMembers: ROSTER,
      contacts: [],
      show: { client_contact: client },
    });
    expect(peek("contacts", clientOnly, ADMIN)).toBeNull();
  });

  it("peek: gear counts a pack list only on the days its phase and stage gates show it", () => {
    const show = fullShow();
    const cases = show.pullSheet!.length;
    for (const viewerId of ["c-plain", "c-strike", "c-set"]) {
      const restriction = ROSTER.find((m) => m.id === viewerId)!.stageRestriction;
      const outcomes = new Set<boolean>();
      for (const iso of Object.keys(PHASES)) {
        const today = middayOn(iso);
        // Premise: the clock lands on the fixture day in the show's timezone.
        expect(todayIsoInShowTimezone(show.show, today)).toBe(iso);
        const visible = isPackListVisibleToday({ show: show.show, restriction, today });
        outcomes.add(visible);
        expect(peek("gear", show, crew(viewerId), today), `${viewerId} on ${iso}`).toBe(
          visible ? `${cases} cases` : null,
        );
      }
      // Premise: each viewer meets the gate both open and closed across the fixture days.
      expect([...outcomes].sort(), viewerId).toEqual([false, true]);
    }
  });

  it("peek: gear counts one case in the singular and an absent or empty pack list as nothing", () => {
    const one = fullShow();
    one.pullSheet = [one.pullSheet![0]!];
    expect(peek("gear", one, crew("c-plain"))).toBe("1 case");
    for (const pullSheet of [null, []]) {
      const show = fullShow();
      show.pullSheet = pullSheet;
      expect(peek("gear", show, crew("c-plain")), JSON.stringify(pullSheet)).toBeNull();
    }
  });

  it("peek: a transport leg never feeds the Transport peek for a viewer the transport gate excludes, and never the Hotels peek", () => {
    // PR B Task 9: Travel's peek ("<hotel> · N rides") split into the Hotels peek
    // (the hotel part) and the Transport peek (the rides part).
    const withTransport = fullShow();
    const withoutTransport = fullShow();
    withoutTransport.transportation = null;
    const hotel = withTransport.hotelReservations[0]!.hotel_name!;

    const gate = (viewer: Viewer) => {
      const data = project(withTransport, viewer);
      return transportTileVisible({
        transportation: data.transportation,
        viewerId: data.viewerId,
        transportationOwnerIds: data.transportationOwnerIds,
        viewerName: data.viewerName,
        viewerNameAliases: data.viewerNameAliases,
        isAdmin: resolveViewerContext(viewer, data).isAdmin,
      });
    };

    // Excluded: no ride count, exactly the transport-free peek; the hotel is the Hotels peek's.
    expect(gate(crew("c-plain"))).toBe(false);
    expect(peek("transport", withTransport, crew("c-plain"))).toBeNull();
    expect(peek("transport", withTransport, crew("c-plain"))).toBe(
      peek("transport", withoutTransport, crew("c-plain")),
    );
    expect(peek("hotels", withTransport, crew("c-plain"))).toBe(hotel);

    // Positive control: the admin and a rider on a leg see the legs the section renders,
    // which leaves out the all-sentinel leg; the Hotels peek is the same either way.
    expect(withTransport.transportation!.schedule).toHaveLength(CONTENT_LEGS.length + 1);
    for (const viewer of [ADMIN, crew("c-rider")]) {
      expect(gate(viewer)).toBe(true);
      expect(peek("transport", withTransport, viewer)).toBe(`${CONTENT_LEGS.length} rides`);
      expect(peek("transport", withTransport, viewer)).not.toBe(
        peek("transport", withoutTransport, viewer),
      );
      expect(peek("hotels", withTransport, viewer)).toBe(hotel);
    }
  });

  it("peek: hotels names a single hotel, counts several, and skips a sentinel name, with no transport row", () => {
    const two = fullShow();
    two.transportation = null;
    two.hotelReservations = [
      reservation({ ordinal: 2, hotel_name: "Second Lodge" }),
      reservation({ ordinal: 1 }),
    ];
    expect(peek("hotels", two, crew("c-plain"))).toBe(`${two.hotelReservations.length} hotels`);

    const sentinel = fullShow();
    sentinel.transportation = null;
    sentinel.hotelReservations = [reservation({ hotel_name: "TBA" })];
    expect(peek("hotels", sentinel, crew("c-plain"))).toBeNull();
  });

  it("peek: hotels names a single hotel, counts several, skips a sentinel name, and is withheld under date suppression (PR B Task 9)", () => {
    const show = fullShow();
    const name = show.hotelReservations[0]!.hotel_name!;
    // The transport row never feeds the Hotels peek, for any viewer.
    for (const viewer of [ADMIN, crew("c-rider"), crew("c-plain")])
      expect(peek("hotels", show, viewer), viewer.kind).toBe(name);
    const two = fullShow();
    two.hotelReservations = [
      reservation({ ordinal: 2, hotel_name: "Second Lodge" }),
      reservation({ ordinal: 1 }),
    ];
    expect(peek("hotels", two, crew("c-plain"))).toBe("2 hotels");
    const sentinel = fullShow();
    sentinel.hotelReservations = [reservation({ hotel_name: "TBA" })];
    expect(peek("hotels", sentinel, crew("c-plain"))).toBeNull();
    expect(peek("hotels", show, crew("c-asterisk"))).toBeNull();
  });

  it("peek: transport counts the rides its body shows a viewer the gate admits, a stageless leg included, and nothing for another (PR B Task 9)", () => {
    const show = fullShow();
    show.transportation = transport([
      ...CONTENT_LEGS,
      BLANK_LEG,
      { stage: "", date: null, time: "6:30 PM", assigned_names: ["Riley Rider"] },
    ]);
    for (const viewer of [ADMIN, crew("c-rider")])
      expect(peek("transport", show, viewer), viewer.kind).toBe(`${CONTENT_LEGS.length + 1} rides`);
    expect(peek("transport", show, crew("c-plain"))).toBeNull();
    // The hotel never feeds the Transport peek.
    const noLegs = fullShow();
    noLegs.transportation = transport([]);
    expect(peek("transport", noLegs, ADMIN)).toBeNull();
  });

  it("peek: no date reaches a peek for a date-suppressed viewer", () => {
    const show = fullShow();
    const d = show.show.dates;
    const isoDates = [
      d.travelIn,
      d.set,
      ...d.showDays,
      d.travelOut,
      ...show.hotelReservations.flatMap((r) => [r.check_in, r.check_out]),
      ...show.transportation!.schedule.map((leg) => leg.date),
    ].filter((iso): iso is string => typeof iso === "string");
    const needles = isoDates.flatMap((iso) => [
      iso,
      formatIsoDate(iso, "short"),
      formatIsoDate(iso, "weekday-short"),
    ]);
    const hotel = show.hotelReservations[0]!.hotel_name!;

    const suppressedCtx = resolveViewerContext(
      crew("c-asterisk"),
      project(show, crew("c-asterisk")),
    );
    expect(suppressesDates(suppressedCtx.dateRestriction)).toBe(true);
    const suppressed = JSON.stringify(allPeeks(show, crew("c-asterisk")));
    for (const needle of needles) expect(suppressed, needle).not.toContain(needle);
    expect(suppressed).not.toContain(hotel);

    // Positive control: the same search over an unrestricted viewer finds the values.
    const open = JSON.stringify(allPeeks(show, crew("c-plain")));
    expect(open).toContain(formatIsoDate(d.showDays[0]!, "short"));
    expect(open).toContain(hotel);
  });

  it("peek: schedule names only an explicit viewer's own show days", () => {
    const show = fullShow();
    const short = (iso: string) => formatIsoDate(iso, "short");
    const explicit = ROSTER.find((m) => m.id === "c-explicit")!.dateRestriction;
    if (explicit.kind !== "explicit") throw new Error("fixture: c-explicit must be explicit");
    const own = SHOW_DAYS.filter((iso) => explicit.days.includes(iso));
    const others = SHOW_DAYS.filter((iso) => !explicit.days.includes(iso));
    expect(own).toHaveLength(1);
    expect(others.length).toBeGreaterThan(0);

    const restricted = peek("schedule", show, crew("c-explicit"));
    expect(restricted).toBe(`1 show day, ${short(own[0]!)}`);
    for (const iso of others) expect(restricted, iso).not.toContain(short(iso));

    // Positive control: an unrestricted viewer's peek spans every show day.
    expect(peek("schedule", show, crew("c-plain"))).toBe(
      `${SHOW_DAYS.length} show days, ${short(SHOW_DAYS[0]!)} to ${short(SHOW_DAYS.at(-1)!)}`,
    );
  });

  it("peek: billing shows the PO only to a viewer financialsVisible admits", () => {
    const show = fullShow();
    const po = show.financials!.po!;
    for (const viewer of [ADMIN, crew("c-lead"), crew("c-plain")]) {
      const ctx = resolveViewerContext(viewer, project(show, viewer));
      const entitled = financialsVisible(ctx.viewerFlags, ctx.isAdmin);
      expect(peek("billing", show, viewer), JSON.stringify(viewer)).toBe(
        entitled ? `PO ${po}` : null,
      );
    }
    const plain = resolveViewerContext(crew("c-plain"), project(show, crew("c-plain")));
    expect(financialsVisible(plain.viewerFlags, plain.isAdmin)).toBe(false);
  });

  it("peek: billing is null when the financials fetch failed or the PO is a sentinel", () => {
    const failed = fullShow();
    failed.tileErrors = { financials: "financials read failed" };
    expect(failed.financials?.po).toBeTruthy();
    expect(peek("billing", failed, crew("c-lead"))).toBeNull();

    const sentinel = fullShow();
    sentinel.financials = { po: "N/A", proposal: null, invoice: null, invoice_notes: null };
    expect(peek("billing", sentinel, crew("c-lead"))).toBeNull();
  });

  it("peek: every section's peek is null, never placeholder text, when its source is empty or a sentinel", () => {
    const empty = makeShowForViewer({ crewMembers: [], show: { venue: null } });
    const sentinel = makeShowForViewer({
      crewMembers: [],
      show: {
        venue: { name: "TBD", address: "TBD" },
        dates: { travelIn: null, set: null, showDays: [], travelOut: null },
        schedule_phases: PHASES,
      },
      hotelReservations: [reservation({ hotel_name: "TBA" })],
      transportation: transport([BLANK_LEG]),
      pullSheet: [],
      financials: { po: "N/A", proposal: null, invoice: null, invoice_notes: null },
    });
    for (const [name, show] of [
      ["empty", empty],
      ["sentinel", sentinel],
    ] as const) {
      const peeks = allPeeks(show, ADMIN);
      expect(peeks.map((p) => p.id)).toContain("billing");
      for (const { id, peek: line } of peeks) expect(line, `${name} ${id}`).toBeNull();
    }

    // Positive control: on a full show every listed section has a non-empty peek.
    for (const { id, peek: line } of allPeeks(fullShow(), ADMIN)) {
      expect(line, id).toBeTypeOf("string");
      expect(line!.trim().length, id).toBeGreaterThan(0);
    }
  });

  it("peek: each gate is the section's own helper, imported rather than restated", () => {
    const src = readFileSync("lib/crew/sectionPeek.ts", "utf8");
    expect(src).toMatch(
      /import \{[^}]*\bisPackListVisibleToday\b[^}]*\} from "@\/lib\/visibility\/packList"/,
    );
    expect(src).toMatch(
      /import \{[^}]*\btransportTileVisible\b[^}]*\} from "@\/lib\/visibility\/scopeTiles"/,
    );
    expect(src).toMatch(
      /import \{[^}]*\bfinancialsVisible\b[^}]*\} from "@\/lib\/visibility\/scopeTiles"/,
    );
    expect(src).toMatch(
      /import \{[^}]*\bsuppressesDates\b[^}]*\} from "@\/lib\/crew\/dateSuppression"/,
    );
    // The gates' own inputs never appear here, which a restated copy would need.
    for (const restated of [
      "schedule_phases",
      "PACK_LIST_VISIBLE_PHASES",
      "unknown_asterisk",
      '"LEAD"',
      '"FINANCIALS"',
      "namesRefer",
    ]) {
      expect(src, restated).not.toContain(restated);
    }
  });
});

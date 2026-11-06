/**
 * lib/crew/crewSections.ts: which sections the "All sections" list and the
 * wide nav offer a crew viewer in PR A.
 *
 * Spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.6 and
 * §5.1. Expected ids come from `CREW_SECTION_IDS`, the billing gate from
 * `financialsVisible` itself, labels from the one label source and the fetch
 * domains from the projection's own writers, so no case passes on a literal the
 * module under test also happens to contain.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CREW_ALWAYS_SECTION_IDS,
  CREW_SECTION_LABELS,
  crewNavRuns,
  crewSectionEntitled,
  crewSectionsFor,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import {
  CREW_SECTION_IDS,
  resolveActiveSection,
  type SectionId,
} from "@/lib/crew/resolveActiveSection";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { RoleFlag, WorkPhase } from "@/lib/parser/types";
import { SHOW_SECTIONS, showSection } from "@/lib/showSections/registry";
import { isPackListVisibleToday, PACK_LIST_VISIBLE_PHASES } from "@/lib/visibility/packList";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { makeShowForViewer } from "../fixtures/showForViewer";

type Member = ShowForViewer["crewMembers"][number];

function member(id: string, name: string, roleFlags: RoleFlag[]): Member {
  return {
    id,
    name,
    email: null,
    phone: null,
    role: "",
    roleFlags,
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
  };
}

const ROSTER: Member[] = [
  member("c-plain", "Plain Crew", ["A1"]),
  member("c-lead", "Lead Crew", ["LEAD"]),
  member("c-fin", "Money Crew", ["FINANCIALS"]),
];

/** Every viewer kind the shell can render, over every roster flag shape. */
const VIEWERS: Array<{ name: string; viewer: Viewer }> = [
  { name: "admin", viewer: { kind: "admin" } },
  ...ROSTER.flatMap((m) => [
    { name: `crew ${m.id}`, viewer: { kind: "crew", crewMemberId: m.id } as Viewer },
    {
      name: `admin_preview ${m.id}`,
      viewer: { kind: "admin_preview", crewMemberId: m.id } as Viewer,
    },
  ]),
];

/** A show with every domain populated, as a healthy fetch returns it. */
function healthyShow(): ShowForViewer {
  return makeShowForViewer({
    crewMembers: ROSTER,
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Harbor Inn",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: "2026-11-02",
        check_out: "2026-11-04",
        notes: null,
      },
    ],
    rooms: [{ id: "r1", kind: "gs", name: "Ballroom" }],
    contacts: [{ kind: "venue", name: "Pat Venue", email: null, phone: null, notes: null }],
    financials: { po: "PO-1", proposal: null, invoice: null, invoice_notes: null },
  });
}

/**
 * The crew ids every viewer is listed on `healthyShow`: all of them but the four
 * gated ones, billing, transport, agenda and packlist (PR B Task 9; `healthyShow`
 * has no transport row and no flight, so only an admin is listed Transport there;
 * PR B Task 10: it has no agenda link, so its Agenda is entitled and listed for none;
 * PR C Task 6: it has no work phase today, so no one is entitled to its Pack list).
 */
const GATED: readonly string[] = ["billing", "transport", "agenda", "packlist"];
const BASE_LISTED = CREW_SECTION_IDS.filter((id) => !GATED.includes(id));

/** The request's clock: the pack list's gate reads the day it lands on. */
const TODAY = new Date("2026-05-14T15:00:00Z");
/** `TODAY` in the show's timezone. */
const TODAY_ISO = "2026-05-14";

function ctxFor(viewer: Viewer, data: ShowForViewer, today: Date = TODAY) {
  return { ...resolveViewerContext(viewer, data), today };
}

/** The set `CrewShell` resolves `?s=` against: the home plus every entitled id. */
function entitledSet(data: ShowForViewer, ctx: ReturnType<typeof ctxFor>): ReadonlySet<SectionId> {
  return new Set<SectionId>([
    "today",
    ...CREW_SECTION_IDS.filter((id) => crewSectionEntitled(id, data, ctx)),
  ]);
}

describe("crewSectionEntitled (plan decision 1, PR A's rule)", () => {
  it("entitled: billing exactly when financialsVisible holds, every other id and today always", () => {
    const data = healthyShow();
    const outcomes = new Set<boolean>();
    for (const { name, viewer } of VIEWERS) {
      const ctx = ctxFor(viewer, data);
      const fin = financialsVisible(ctx.viewerFlags, ctx.isAdmin);
      outcomes.add(fin);
      expect(crewSectionEntitled("billing", data, ctx), name).toBe(fin);
      expect(crewSectionEntitled("today", data, ctx), name).toBe(true);
      for (const id of BASE_LISTED)
        expect(crewSectionEntitled(id, data, ctx), `${name} ${id}`).toBe(true);
    }
    premiseHolds("the viewer set exercises the billing gate both ways", outcomes.size === 2);
  });

  it("entitled: the skeleton's always table is exactly the ids every viewer is listed, in nav order", () => {
    const data = healthyShow();
    const lists = VIEWERS.map(({ viewer }) =>
      crewSectionsFor(data, ctxFor(viewer, data)).map((s) => s.id),
    );
    const everyone = CREW_SECTION_IDS.filter((id) => lists.every((ids) => ids.includes(id)));
    premise("ids no viewer is refused", everyone.length, 0);
    premise("ids some viewer is refused", CREW_SECTION_IDS.length - everyone.length, 0);
    expect([...CREW_ALWAYS_SECTION_IDS]).toEqual(everyone);
  });
});

describe("crewSectionsFor (sections, PR A membership)", () => {
  it("sections: lists every always-entitled section without the home, in nav order", () => {
    const data = healthyShow();
    const ctx = ctxFor({ kind: "crew", crewMemberId: "c-plain" }, data);
    // Premise: this viewer is one the billing gate refuses, so the list is the base set.
    expect(financialsVisible(ctx.viewerFlags, ctx.isAdmin)).toBe(false);
    expect(BASE_LISTED.length).toBeGreaterThan(0);
    expect(crewSectionsFor(data, ctx).map((s) => s.id)).toEqual(BASE_LISTED);
  });

  it("sections: billing is listed, last, exactly when financialsVisible holds", () => {
    const data = healthyShow();
    const outcomes = new Set<boolean>();
    for (const { name, viewer } of VIEWERS) {
      const ctx = ctxFor(viewer, data);
      const entitled = financialsVisible(ctx.viewerFlags, ctx.isAdmin);
      outcomes.add(entitled);
      // Transport, on a show with no transport row and no flight, is the admin's alone;
      // Agenda, on a show with no agenda link, is no one's to list (PR B Task 10).
      const expected = CREW_SECTION_IDS.filter((id) =>
        id === "billing"
          ? entitled
          : id === "transport"
            ? ctx.isAdmin
            : (id as string) === "agenda" || (id as string) === "packlist"
              ? false
              : true,
      );
      expect(
        crewSectionsFor(data, ctx).map((s) => s.id),
        name,
      ).toEqual(expected);
    }
    // Premise: the viewer set exercises the gate both on and off.
    expect([...outcomes].sort()).toEqual([false, true]);
  });

  it("sections: every listed id is one the shell's resolver opens for that viewer, and the only one it opens unlisted is a content-less Agenda", () => {
    // Plan decision 1: entitlement and membership are two predicates, and Agenda's
    // content rule is the one difference between them. `healthyShow` has no agenda
    // link, so every viewer here (none date-suppressed) opens an Agenda it is not
    // listed. Pack list's rule is a gate, so it never opens unlisted (PR C decision 1).
    const data = healthyShow();
    premiseHolds(
      "healthyShow carries no agenda link with a file",
      !data.show.agenda_links.some((l) => Boolean(l.fileId)),
    );
    for (const { name, viewer } of VIEWERS) {
      const ctx = ctxFor(viewer, data);
      const entitled = entitledSet(data, ctx);
      const opens = CREW_SECTION_IDS.filter((id) => resolveActiveSection(id, entitled) === id);
      const listed = crewSectionsFor(data, ctx).map((s) => s.id);
      expect(listed, name).toEqual(opens.filter((id) => (id as string) !== "agenda"));
      expect(opens as readonly string[], name).toContain("agenda");
    }
  });

  it("sections: CREW_SECTION_IDS is the registry's ids in the registry's order, and every label is the registry's (AC-10)", () => {
    expect([...CREW_SECTION_IDS]).toEqual(SHOW_SECTIONS.map((s) => s.id));
    for (const id of CREW_SECTION_IDS) {
      expect(CREW_SECTION_LABELS[id], id).toBe(showSection(id).label);
    }
    // Spec line 238: `schedule` is the case the crew used to name itself.
    expect(CREW_SECTION_LABELS.schedule).toBe("Crew schedule");
  });

  it("sections: each label comes from CREW_SECTION_LABELS, and no other module keeps its own label table", () => {
    const ctx = ctxFor({ kind: "admin" }, healthyShow());
    const sections = crewSectionsFor(healthyShow(), ctx);
    expect(sections.map((s) => s.id)).toContain("billing");
    for (const section of sections) {
      expect(section.label, section.id).toBe(CREW_SECTION_LABELS[section.id]);
    }
    // The one source: a second `"<label>"` literal anywhere in the product tree is a
    // copy that can drift (the retired sub-nav kept one; so did both loading skeletons
    // until they read this module, and the crew's own table until PR C Task 9). Walked
    // from disk, so a new file is covered by default. The canary is the one label the
    // registry alone says: no group or heading shares "Crew schedule".
    const files = execFileSync("git", ["ls-files", "app", "components", "lib"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(f));
    expect(files.length, "the walk saw the product tree").toBeGreaterThan(100);
    const literal = `"${CREW_SECTION_LABELS.schedule}"`;
    const copies = files.filter((f) => readFileSync(f, "utf8").includes(literal));
    expect(copies).toEqual(["lib/showSections/registry.ts"]);
  });

  it("sections: contacts sits right after crew, entitled and listed for every viewer kind, with or without contacts (PR B Task 7)", () => {
    // Spec line 240: every moved registry section other than the gated three is
    // always a member, showing its empty state when empty; spec line 304 moves
    // the contacts out of the Crew section into their own.
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("contacts")).toBe(ids.indexOf("crew") + 1);
    const contacts = "contacts" as CrewSectionId;
    expect(CREW_SECTION_LABELS[contacts]).toBe(showSection("contacts").label);
    const kinds = new Set<string>();
    for (const data of [healthyShow(), makeShowForViewer({ crewMembers: ROSTER, contacts: [] })]) {
      for (const { name, viewer } of VIEWERS) {
        kinds.add(viewer.kind);
        const ctx = ctxFor(viewer, data);
        expect(crewSectionEntitled(contacts, data, ctx), name).toBe(true);
        expect(
          crewSectionsFor(data, ctx).map((s) => s.id),
          `${name} with ${data.contacts.length} contacts`,
        ).toContain(contacts);
      }
    }
    premiseHolds("every viewer kind is exercised", kinds.size === 3);
  });

  it("sections: a domain whose fetch failed keeps every section listed for every viewer", () => {
    // Derived from the projection's own writers, so a new fetch domain is covered by default.
    const projection = readFileSync("lib/data/getShowForViewer.ts", "utf8");
    const domains = [
      ...new Set([...projection.matchAll(/tileErrors\["([a-z_]+)"\]\s*=/g)].map((m) => m[1]!)),
    ];
    // Premise: the walk saw known members, including the one the billing body reads.
    expect(domains).toContain("financials");
    expect(domains).toContain("hotel");

    const failures: Array<Record<string, string>> = [
      ...domains.map((d) => ({ [d]: `${d} read failed` })),
      Object.fromEntries(domains.map((d) => [d, `${d} read failed`])),
    ];
    for (const tileErrors of failures) {
      // A failed read leaves its domain fail-soft empty: no financials key, empty arrays.
      const degraded = makeShowForViewer({ crewMembers: ROSTER, tileErrors });
      expect(degraded.financials).toBeUndefined();
      for (const { name, viewer } of VIEWERS) {
        const healthy = crewSectionsFor(healthyShow(), ctxFor(viewer, healthyShow()));
        expect(
          crewSectionsFor(degraded, ctxFor(viewer, degraded)),
          `${name} with ${Object.keys(tileErrors).join("+")} failed`,
        ).toEqual(healthy);
      }
    }
  });
});

describe("hotels and transport replace travel (PR B Task 9, spec line 240, plan decision 1)", () => {
  /** A ground-transport row whose one leg names `rider`. */
  function transportFor(rider: string): NonNullable<ShowForViewer["transportation"]> {
    return {
      driver_name: "Marta Kestrel",
      driver_phone: "215-555-0177",
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: "White Transit 350",
      license_plate: "KTR5521",
      color: null,
      parking: "Lot C",
      schedule: [{ stage: "Shuttle", date: "2026-11-03", time: "2:00pm", assigned_names: [rider] }],
      notes: null,
    };
  }

  /** The show as the projection returns it to one viewer: their name and their own flight. */
  function showFor(opts: {
    viewerName: string;
    flight: string | null;
    rider: string;
    restriction?: Member["dateRestriction"];
  }): ShowForViewer {
    const roster = ROSTER.map((m) =>
      m.name === opts.viewerName && opts.restriction !== undefined
        ? { ...m, dateRestriction: opts.restriction }
        : m,
    );
    return makeShowForViewer({
      crewMembers: roster,
      transportation: transportFor(opts.rider),
      viewerName: opts.viewerName,
      viewerNameAliases: [opts.viewerName],
      viewerFlightInfo: opts.flight,
    });
  }

  const FLIGHT = "4/19 AA2201 LGA - ORD 9:05am - 10:50am";
  /** A rider on no roster: the name-aware gate matches surnames, so no "... Crew". */
  const RIDER = "Riley Rider";

  it("sections: hotels then transport take travel's slot in nav order; travel is no id", () => {
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids).not.toContain("travel");
    // Travel's slot was right after schedule; Agenda (PR B Task 10) sits between them now.
    expect(ids.indexOf("hotels")).toBe(ids.indexOf("agenda") + 1);
    expect(ids.indexOf("transport")).toBe(ids.indexOf("hotels") + 1);
    expect(ids.indexOf("rooms")).toBe(ids.indexOf("transport") + 1);
    for (const id of ["hotels", "transport"] as const) {
      expect(CREW_SECTION_LABELS[id as CrewSectionId], id).toBe(showSection(id).label);
    }
  });

  it("sections: rooms comes before packlist in nav order, every viewer is listed it, with its registry label", () => {
    const rooms: CrewSectionId = "rooms";
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("packlist")).toBe(ids.indexOf("rooms") + 1);
    expect(CREW_SECTION_LABELS[rooms]).toBe(showSection("rooms").label);
    expect(CREW_ALWAYS_SECTION_IDS as readonly string[]).toContain(rooms);
  });

  it("sections: event follows venue in nav order, every viewer is listed it, with its registry label", () => {
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("event")).toBe(ids.indexOf("venue") + 1);
    expect(CREW_SECTION_LABELS.event).toBe(showSection("event").label);
    expect(CREW_ALWAYS_SECTION_IDS).toContain("event");
  });

  it("transport: entitled and listed for an admin, a viewer the transport gate admits and a flight-only viewer; neither for a viewer with no flight and no ride, whose ?s=transport resolves home", () => {
    const transport = "transport" as CrewSectionId;
    const cases: Array<{ name: string; viewer: Viewer; data: ShowForViewer; listed: boolean }> = [
      {
        name: "admin, no transport row and no flight",
        viewer: { kind: "admin" },
        data: makeShowForViewer({ crewMembers: ROSTER }),
        listed: true,
      },
      {
        name: "crew on the leg, no flight",
        viewer: { kind: "crew", crewMemberId: "c-lead" },
        data: showFor({ viewerName: "Lead Crew", flight: null, rider: "Lead Crew" }),
        // (the only case whose viewer rides; every other leg names a stranger)
        listed: true,
      },
      {
        name: "admin_preview with a flight, not on the leg",
        viewer: { kind: "admin_preview", crewMemberId: "c-plain" },
        data: showFor({ viewerName: "Plain Crew", flight: FLIGHT, rider: RIDER }),
        listed: true,
      },
      {
        name: "crew with no flight and no ride",
        viewer: { kind: "crew", crewMemberId: "c-plain" },
        data: showFor({ viewerName: "Plain Crew", flight: null, rider: RIDER }),
        listed: false,
      },
      {
        name: "admin_preview with no flight and no ride",
        viewer: { kind: "admin_preview", crewMemberId: "c-fin" },
        data: showFor({ viewerName: "Money Crew", flight: null, rider: RIDER }),
        listed: false,
      },
    ];
    for (const { name, viewer, data, listed } of cases) {
      const ctx = ctxFor(viewer, data);
      expect(crewSectionEntitled(transport, data, ctx), name).toBe(listed);
      expect(
        crewSectionsFor(data, ctx).map((s) => s.id),
        name,
      ).toEqual(
        listed ? expect.arrayContaining([transport]) : expect.not.arrayContaining([transport]),
      );
      expect(resolveActiveSection("transport", entitledSet(data, ctx)), name).toBe(
        listed ? "transport" : "today",
      );
    }
  });

  it("transport: a flight withheld whole by date suppression does not entitle a viewer with no ride", () => {
    // An unparseable (dateless) itinerary line renders raw, and date suppression
    // withholds every raw row (flightCard), so this viewer's "Your flight" card is
    // empty: the section has nothing it may show them.
    const raw = "Charter pending";
    const suppressed = showFor({
      viewerName: "Plain Crew",
      flight: raw,
      rider: RIDER,
      restriction: { kind: "unknown_asterisk", days: null },
    });
    const open = showFor({ viewerName: "Plain Crew", flight: raw, rider: RIDER });
    const viewer: Viewer = { kind: "crew", crewMemberId: "c-plain" };
    // Positive control: the same flight entitles the viewer whose dates are confirmed.
    expect(crewSectionEntitled("transport" as CrewSectionId, open, ctxFor(viewer, open))).toBe(
      true,
    );
    expect(
      crewSectionEntitled("transport" as CrewSectionId, suppressed, ctxFor(viewer, suppressed)),
    ).toBe(false);
  });

  it("hotels: entitled and listed for every viewer kind, with or without reservations", () => {
    const hotels = "hotels" as CrewSectionId;
    const kinds = new Set<string>();
    for (const data of [
      healthyShow(),
      makeShowForViewer({ crewMembers: ROSTER, hotelReservations: [] }),
    ]) {
      for (const { name, viewer } of VIEWERS) {
        kinds.add(viewer.kind);
        const ctx = ctxFor(viewer, data);
        expect(crewSectionEntitled(hotels, data, ctx), name).toBe(true);
        expect(
          crewSectionsFor(data, ctx).map((s) => s.id),
          name,
        ).toContain(hotels);
      }
    }
    premiseHolds("every viewer kind is exercised", kinds.size === 3);
  });
});

describe("agenda: its own section, entitled and listed apart (PR B Task 10, spec lines 240 and 488, plan decision 1)", () => {
  const agenda = "agenda" as CrewSectionId;
  /** One agenda PDF the shell can embed: a link carrying a Drive file id. */
  const FILE_LINK = { label: "AGENDA", fileId: "agenda-file-1" };
  /** A link the sheet wrote as a bare URL: no file, so nothing to embed or read. */
  const URL_LINK = { label: "AGENDA", url: "https://example.test/agenda" };

  /** The roster with `c-plain`'s days unconfirmed, so every date of hers is suppressed. */
  function rosterWith(restriction: Member["dateRestriction"]): Member[] {
    return ROSTER.map((m) => (m.id === "c-plain" ? { ...m, dateRestriction: restriction } : m));
  }

  function showWith(
    links: ShowForViewer["show"]["agenda_links"],
    restriction: Member["dateRestriction"] = { kind: "none" },
  ): ShowForViewer {
    return makeShowForViewer({
      crewMembers: rosterWith(restriction),
      show: { agenda_links: links },
    });
  }

  it("sections: agenda takes the slot after schedule in nav order, labelled from the registry", () => {
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("agenda")).toBe(ids.indexOf("schedule") + 1);
    expect(ids.indexOf("hotels")).toBe(ids.indexOf("agenda") + 1);
    expect(CREW_SECTION_LABELS[agenda]).toBe(showSection("agenda").label);
  });

  it("agenda: listed exactly when the show has an agenda link with a file and the viewer's dates are not suppressed; entitled whenever they are not", () => {
    const UNKNOWN = { kind: "unknown_asterisk", days: null } as const;
    const cases: Array<{
      name: string;
      data: ShowForViewer;
      viewer: Viewer;
      entitled: boolean;
      listed: boolean;
    }> = [];
    for (const { name, viewer } of VIEWERS) {
      cases.push(
        {
          name: `${name}, a file link`,
          data: showWith([FILE_LINK]),
          viewer,
          entitled: true,
          listed: true,
        },
        {
          name: `${name}, a file link and a url link`,
          data: showWith([URL_LINK, FILE_LINK]),
          viewer,
          entitled: true,
          listed: true,
        },
        { name: `${name}, no link`, data: showWith([]), viewer, entitled: true, listed: false },
        {
          name: `${name}, a url link only`,
          data: showWith([URL_LINK]),
          viewer,
          entitled: true,
          listed: false,
        },
      );
    }
    // A suppressed viewer is entitled to no Agenda, with or without a file to show.
    for (const kind of ["crew", "admin_preview"] as const) {
      const viewer = { kind, crewMemberId: "c-plain" } as Viewer;
      cases.push(
        {
          name: `${kind} c-plain suppressed, a file link`,
          data: showWith([FILE_LINK], UNKNOWN),
          viewer,
          entitled: false,
          listed: false,
        },
        {
          name: `${kind} c-plain suppressed, no link`,
          data: showWith([], UNKNOWN),
          viewer,
          entitled: false,
          listed: false,
        },
      );
    }
    const seen = new Set<string>();
    for (const { name, data, viewer, entitled, listed } of cases) {
      const ctx = ctxFor(viewer, data);
      seen.add(`${entitled}/${listed}`);
      expect(crewSectionEntitled(agenda, data, ctx), name).toBe(entitled);
      const ids = crewSectionsFor(data, ctx).map((s) => s.id);
      expect(ids.includes(agenda), name).toBe(listed);
      expect(resolveActiveSection("agenda", entitledSet(data, ctx)), name).toBe(
        entitled ? "agenda" : "today",
      );
    }
    premiseHolds("all three outcomes are exercised", seen.size === 3);
  });

  it("agenda: a viewer whose dates are suppressed by an explicit restriction keeps the Agenda; only an unconfirmed one loses it", () => {
    // Positive control for the gate's input: an explicit day list restricts which
    // days are hers but withholds no date, so the Agenda stays hers.
    const viewer: Viewer = { kind: "crew", crewMemberId: "c-plain" };
    const explicit = showWith([FILE_LINK], { kind: "explicit", days: ["2026-11-03"] });
    expect(crewSectionEntitled(agenda, explicit, ctxFor(viewer, explicit))).toBe(true);
    expect(crewSectionsFor(explicit, ctxFor(viewer, explicit)).map((s) => s.id)).toContain(agenda);
  });

  it("agenda: the skeleton never shows the Agenda row, since no viewer is listed it by default", () => {
    expect(CREW_ALWAYS_SECTION_IDS as readonly string[]).not.toContain("agenda");
  });
});

/**
 * PR C plan decision 1 and Task 6: `packlist` is an entitlement gate, not a content
 * rule (spec lines 240, 488). The gate is `isPackListVisibleToday`, today's rule,
 * unchanged: it reads the day's phases and the viewer's stages, for an admin as for
 * crew, and nothing about the pull sheet.
 */
describe("packlist: the pack list's entitlement gate (PR C Task 6)", () => {
  const packlist = "packlist" as CrewSectionId;
  const STRIKE_ONLY: Member = {
    ...member("c-strike", "Strike Crew", ["A1"]),
    stageRestriction: { kind: "explicit", stages: ["Strike"] },
  };

  function onPhases(
    phases: readonly WorkPhase[],
    overrides: Parameters<typeof makeShowForViewer>[0] = {},
  ): ShowForViewer {
    return makeShowForViewer({
      crewMembers: [...ROSTER, STRIKE_ONLY],
      show: { schedule_phases: { [TODAY_ISO]: [...phases] } },
      pullSheet: [{ caseLabel: "FOH Rack", items: [] }],
      ...overrides,
    });
  }

  function assertGate(data: ShowForViewer, viewer: Viewer, expected: boolean, name: string): void {
    const ctx = ctxFor(viewer, data);
    expect(crewSectionEntitled(packlist, data, ctx), name).toBe(expected);
    expect(
      crewSectionsFor(data, ctx)
        .map((s) => s.id)
        .includes(packlist),
      name,
    ).toBe(expected);
    expect(resolveActiveSection("packlist", entitledSet(data, ctx)), name).toBe(
      expected ? "packlist" : "today",
    );
  }

  const VISIBLE = [...PACK_LIST_VISIBLE_PHASES];
  premise("the phases the gate admits", VISIBLE.length, 0);

  it.each(VISIBLE)("packlist: every viewer kind is entitled and listed on a %s day", (phase) => {
    const data = onPhases([phase]);
    for (const { name, viewer } of VIEWERS) assertGate(data, viewer, true, `${phase}: ${name}`);
  });

  it.each(["Show", "Load In"] as const)(
    "packlist: no viewer, a plain admin included, is entitled or listed on a %s day",
    (phase) => {
      premiseHolds(`${phase} is outside the gate's set`, !PACK_LIST_VISIBLE_PHASES.has(phase));
      const data = onPhases([phase]);
      for (const { name, viewer } of VIEWERS) assertGate(data, viewer, false, `${phase}: ${name}`);
    },
  );

  it("packlist: a compound day opens it when one of its phases is the gate's", () => {
    const data = onPhases(["Show", "Strike"]);
    assertGate(data, { kind: "crew", crewMemberId: "c-plain" }, true, "Show and Strike");
  });

  it("packlist: a day with no work phase entitles no one", () => {
    const data = onPhases([], { show: { schedule_phases: {} } });
    assertGate(data, { kind: "admin" }, false, "no phase");
  });

  it("packlist: a viewer's stages narrow the gate, each way", () => {
    const viewer: Viewer = { kind: "crew", crewMemberId: "c-strike" };
    assertGate(onPhases(["Set"]), viewer, false, "stages exclude the Set day");
    assertGate(onPhases(["Strike"]), viewer, true, "stages hold the Strike day");
    // Positive control: an unrestricted viewer on the Set day that excluded her.
    assertGate(onPhases(["Set"]), { kind: "crew", crewMemberId: "c-plain" }, true, "unrestricted");
  });

  it("packlist: the gate reads the request's clock, not the day the fixture was built for", () => {
    const data = onPhases(["Set"]);
    const viewer: Viewer = { kind: "crew", crewMemberId: "c-plain" };
    const tomorrow = new Date(TODAY.getTime() + 24 * 60 * 60 * 1000);
    expect(crewSectionEntitled(packlist, data, ctxFor(viewer, data, tomorrow))).toBe(false);
    expect(crewSectionEntitled(packlist, data, ctxFor(viewer, data, TODAY))).toBe(true);
  });

  it("packlist: the gate is isPackListVisibleToday, so the two agree on every viewer and phase", () => {
    const outcomes = new Set<boolean>();
    for (const phase of [...VISIBLE, "Show", "Load In"] as const) {
      const data = onPhases([phase]);
      for (const { name, viewer } of [
        ...VIEWERS,
        { name: "strike", viewer: { kind: "crew", crewMemberId: "c-strike" } as Viewer },
      ]) {
        const ctx = ctxFor(viewer, data);
        const visible = isPackListVisibleToday({
          show: data.show,
          restriction: ctx.stageRestriction,
          today: ctx.today,
        });
        outcomes.add(visible);
        expect(crewSectionEntitled(packlist, data, ctx), `${phase}: ${name}`).toBe(visible);
      }
    }
    premiseHolds("the gate is exercised both ways", outcomes.size === 2);
  });

  it("packlist: there is no content rule: a member with no pull sheet stays listed", () => {
    for (const pullSheet of [null, []]) {
      const data = onPhases(["Set"], { pullSheet });
      assertGate(data, { kind: "crew", crewMemberId: "c-plain" }, true, JSON.stringify(pullSheet));
    }
  });

  it("packlist: membership reads no fetch, so a failed domain leaves the list as it was", () => {
    const data = onPhases(["Set"], { tileErrors: { rooms: "planted" } as never });
    assertGate(data, { kind: "crew", crewMemberId: "c-plain" }, true, "a failed rooms fetch");
  });

  it("packlist: its slot is after rooms, and the skeleton never shows it", () => {
    expect(CREW_SECTION_IDS as readonly string[]).toContain("packlist");
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("packlist")).toBe(ids.indexOf("rooms") + 1);
    expect(CREW_ALWAYS_SECTION_IDS as readonly string[]).not.toContain("packlist");
  });

  it("packlist: it reads its label from the registry", () => {
    expect(CREW_SECTION_LABELS[packlist]).toBe(showSection("packlist").label);
  });
});

describe("crewNavRuns: the wide nav's runs (PR C plan decision 11)", () => {
  const run = (group: string | undefined, ...ids: string[]) => ({
    group,
    items: ids.map((id) => ({ id, ...(group === undefined ? {} : { group }) })),
  });

  it("a run starts where an item's group differs from the one before it, and an item with no group stands apart", () => {
    const items = [
      { id: "today" },
      { id: "venue", group: "The show" },
      { id: "event", group: "The show" },
      { id: "crew", group: "People" },
    ];
    expect(crewNavRuns(items)).toEqual([
      run(undefined, "today"),
      run("The show", "venue", "event"),
      run("People", "crew"),
    ]);
  });

  it("a group with no member has no run, whatever the group list holds", () => {
    const runs = crewNavRuns(
      SHOW_SECTIONS.filter((s) => s.id !== "billing").map(({ id, group }) => ({ id, group })),
    );
    premiseHolds(
      "billing is the only section in its group",
      SHOW_SECTIONS.filter((s) => s.group === showSection("billing").group).length === 1,
    );
    expect(runs.map((r) => r.group)).not.toContain(showSection("billing").group);
  });

  it("no item falls out of the nav: every item lands in one run, in entry order, even when a group returns", () => {
    const items = [
      { id: "a", group: "One" },
      { id: "b", group: "Two" },
      { id: "c", group: "One" },
      { id: "d" },
      { id: "e" },
    ];
    expect(crewNavRuns(items).flatMap((r) => r.items)).toEqual(items);
    expect(crewNavRuns(items).map((r) => r.group)).toEqual(["One", "Two", "One", undefined]);
  });

  it("no items, no runs", () => {
    expect(crewNavRuns([])).toEqual([]);
  });
});

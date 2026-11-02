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
  CREW_MOVED_IDS,
  CREW_SECTION_LABELS,
  crewSectionEntitled,
  crewSectionsFor,
  isCrewMovedSection,
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
import type { RoleFlag } from "@/lib/parser/types";
import { showSection } from "@/lib/showSections/registry";
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
 * The crew ids every viewer is listed on `healthyShow`: all of them but the two
 * gated ones, billing and transport (PR B Task 9; `healthyShow` has no transport
 * row and no flight, so only an admin is listed Transport there).
 */
const GATED: readonly string[] = ["billing", "transport"];
const BASE_LISTED = CREW_SECTION_IDS.filter((id) => !GATED.includes(id));

function ctxFor(viewer: Viewer, data: ShowForViewer) {
  return resolveViewerContext(viewer, data);
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
      // Transport, on a show with no transport row and no flight, is the admin's alone.
      const expected = CREW_SECTION_IDS.filter((id) =>
        id === "billing" ? entitled : id === "transport" ? ctx.isAdmin : true,
      );
      expect(
        crewSectionsFor(data, ctx).map((s) => s.id),
        name,
      ).toEqual(expected);
    }
    // Premise: the viewer set exercises the gate both on and off.
    expect([...outcomes].sort()).toEqual([false, true]);
  });

  it("sections: every listed id is one the shell's resolver opens for that viewer, and none is missing", () => {
    const data = healthyShow();
    for (const { name, viewer } of VIEWERS) {
      const ctx = ctxFor(viewer, data);
      const entitled = entitledSet(data, ctx);
      const opens = CREW_SECTION_IDS.filter((id) => resolveActiveSection(id, entitled) === id);
      expect(
        crewSectionsFor(data, ctx).map((s) => s.id),
        name,
      ).toEqual(opens);
    }
  });

  it("sections: each label comes from CREW_SECTION_LABELS, and no other module keeps its own label table", () => {
    const ctx = ctxFor({ kind: "admin" }, healthyShow());
    const sections = crewSectionsFor(healthyShow(), ctx);
    expect(sections.map((s) => s.id)).toContain("billing");
    for (const section of sections) {
      expect(section.label, section.id).toBe(CREW_SECTION_LABELS[section.id]);
    }
    // The one source: a second `schedule: "<label>"` table anywhere in the product
    // tree is a copy that can drift (the retired sub-nav kept one; so did both
    // loading skeletons until they read this module). Walked from disk, so a new
    // file is covered by default. The canary is a section the crew still names
    // itself: `venue` read its label from the registry from PR B Task 5 on, so the
    // crew's table no longer holds it, and `schedule` never moves in PR B
    // (decision 2).
    premiseHolds("schedule keeps its crew label", !isCrewMovedSection("schedule"));
    const files = execFileSync("git", ["ls-files", "app", "components", "lib"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(f));
    expect(files.length, "the walk saw the product tree").toBeGreaterThan(100);
    const pattern = new RegExp(`\\bschedule:\\s*"${CREW_SECTION_LABELS.schedule}"`);
    const copies = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(copies).toEqual(["lib/crew/crewSections.ts"]);
  });

  it("sections: contacts is a moved crew id right after crew, entitled and listed for every viewer kind, with or without contacts (PR B Task 7)", () => {
    // Spec line 240: every moved registry section other than the gated three is
    // always a member, showing its empty state when empty; spec line 304 moves
    // the contacts out of the Crew section into their own.
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids.indexOf("contacts")).toBe(ids.indexOf("crew") + 1);
    expect(CREW_MOVED_IDS as readonly string[]).toContain("contacts");
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

  it("sections: hotels then transport take travel's slot in nav order, both moved ids; travel is no id", () => {
    const ids: readonly string[] = CREW_SECTION_IDS;
    expect(ids).not.toContain("travel");
    expect(ids.indexOf("hotels")).toBe(ids.indexOf("schedule") + 1);
    expect(ids.indexOf("transport")).toBe(ids.indexOf("hotels") + 1);
    expect(ids.indexOf("gear")).toBe(ids.indexOf("transport") + 1);
    for (const id of ["hotels", "transport"] as const) {
      expect(CREW_MOVED_IDS as readonly string[], id).toContain(id);
      expect(CREW_SECTION_LABELS[id as CrewSectionId], id).toBe(showSection(id).label);
    }
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

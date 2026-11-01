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
import type { RoleFlag } from "@/lib/parser/types";
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

/** The crew ids every viewer is listed: all of them but the billing the gate decides. */
const BASE_LISTED = CREW_SECTION_IDS.filter((id) => id !== "billing");

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
      const expected: CrewSectionId[] = entitled ? [...BASE_LISTED, "billing"] : [...BASE_LISTED];
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
    // The one source: a second `venue: "<label>"` table anywhere in the product
    // tree is a copy that can drift (the retired sub-nav kept one; so did both
    // loading skeletons until they read this module). Walked from disk, so a new
    // file is covered by default.
    const files = execFileSync("git", ["ls-files", "app", "components", "lib"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(f));
    expect(files.length, "the walk saw the product tree").toBeGreaterThan(100);
    const pattern = new RegExp(`\\bvenue:\\s*"${CREW_SECTION_LABELS.venue}"`);
    const copies = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(copies).toEqual(["lib/crew/crewSections.ts"]);
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

// @vitest-environment jsdom
/**
 * tests/components/crew/crewShellSections.test.tsx (client-section-toggle)
 *
 * The contract under client-side section toggle is "ALL entitled section bodies
 * are RENDERED SERVER-SIDE and HANDED to the CrewSections controller" — not "all
 * are in the DOM" (the controller mounts only the active one via AnimatePresence
 * mode="wait"). So we capture the props CrewShell passes to <CrewSections> and
 * assert:
 *
 *   - `sectionNodes` keys === the entitled set:
 *       admin        → today + every CREW_SECTION_IDS id
 *       LEAD viewer  → the same minus transport (no flight, no ride), billing PRESENT
 *       NON-lead     → the lead's minus billing, NO billing key
 *     and the listed sections are those keys minus the home and minus Agenda,
 *     which these fixtures entitle (no viewer's dates are suppressed) but do not
 *     list (no agenda link): PR B Task 10, plan decision 1.
 *   - `initialSection` === the server-resolved active (a non-lead ?s=budget →
 *     today).
 *   - PER-ID body correctness (anti-tautology — keys alone can pass with a
 *     mis-wired body): each section component is mocked to a distinct marker
 *     `<div data-testid="section-<id>" />`, and for EVERY entitled id we render
 *     `sectionNodes[id]` and assert it shows `section-<id>` — proving today→
 *     HomeSection, schedule→ScheduleSection, …, not a swapped wiring.
 *   - a small integration assertion (CrewSections UNmocked) that the INITIAL
 *     active body renders and `data-testid="crew-shell"` is present.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import type { WorkPhase } from "@/lib/parser/types";

/**
 * Every body a fully entitled viewer gets on these fixtures: the home plus every
 * crew section but Pack list, whose gate needs a work phase on the day and whose own
 * block below seeds one (PR C Task 6).
 */
const ALL_KEYS: SectionId[] = [
  "today",
  ...CREW_SECTION_IDS.filter((id) => (id as string) !== "packlist"),
];
/**
 * What a crew lead gets on these fixtures: everything but Transport, whose gate
 * (PR B Task 9) admits an admin, a rider or a viewer with a flight, and the
 * fixtures give the crew viewer none of the three.
 */
const LEAD_KEYS: SectionId[] = ALL_KEYS.filter((id) => id !== "transport");
/** What a viewer the billing gate refuses gets (and, on these fixtures, the transport gate). */
const NON_LEAD_KEYS: SectionId[] = LEAD_KEYS.filter((id) => id !== "billing");
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

// Pin the server clock so the producer's `await nowDate()` is deterministic.
const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-05-14T15:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// ---- Capture the props CrewShell hands to the CrewSections controller -------
const captured = vi.hoisted(
  () =>
    ({ value: null }) as {
      value: {
        initialSection: SectionId;
        sections: ReadonlyArray<{ id: string; label: string; peek: string | null }>;
        sectionNodes: Partial<Record<SectionId, ReactNode>>;
      } | null;
    },
);
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: (props: {
    initialSection: SectionId;
    sections: ReadonlyArray<{ id: string; label: string; peek: string | null }>;
    sectionNodes: Partial<Record<SectionId, ReactNode>>;
  }) => {
    captured.value = props;
    // Render the initial active body so the integration assertion (real
    // section markers) can observe it in the DOM.
    return (
      <div data-testid="mock-crew-sections" data-initial-section={props.initialSection}>
        {props.sectionNodes[props.initialSection] ?? null}
      </div>
    );
  },
}));

// ---- Mock the rest of the page CHROME --------------------------------------
vi.mock("@/components/layout/Header", () => ({
  Header: ({ identityChip, statusPill }: { identityChip?: ReactNode; statusPill?: ReactNode }) => (
    <header data-testid="mock-header">
      {statusPill !== undefined && statusPill !== null ? statusPill : null}
      {identityChip !== undefined && identityChip !== null ? identityChip : null}
    </header>
  ),
}));

vi.mock("@/components/auth/IdentityChip", () => ({
  IdentityChip: () => <span data-testid="mock-identity-chip" />,
}));

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => <div data-testid="mock-realtime-bridge" />,
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="mock-footer" />,
}));

// ---- Mock every section to a distinct marker (per-id wiring proof) ----------
const sectionMarker = (testid: string) => {
  const MockSection = () => <section data-testid={testid} />;
  MockSection.displayName = `MockSection(${testid})`;
  return MockSection;
};
// Search is not this suite's subject: its section mocks are component-only
// factories and its fixtures are thin, so the real index builder would read
// rows the mocks do not stand in for, or throw on the thin projection
// (plan Task 19). tests/components/crew/crewShellSearch.test.tsx covers the
// real builder through the shell.
vi.mock("@/lib/search/buildSearchIndex", () => ({ buildSearchIndex: () => ({ entries: [] }) }));

vi.mock("@/components/crew/sections/HomeSection", () => ({
  HomeSection: sectionMarker("section-today"),
}));
vi.mock("@/components/crew/sections/ScheduleSection", () => ({
  ScheduleSection: sectionMarker("section-schedule"),
}));
vi.mock("@/components/crew/sections/VenueSection", () => ({
  VenueSection: sectionMarker("section-venue"),
}));
vi.mock("@/components/crew/sections/HotelsSection", () => ({
  HotelsSection: sectionMarker("section-hotels"),
}));
vi.mock("@/components/crew/sections/TransportSection", () => ({
  TransportSection: sectionMarker("section-transport"),
}));
vi.mock("@/components/crew/sections/CrewSection", () => ({
  CrewSection: sectionMarker("section-crew"),
}));
vi.mock("@/components/crew/sections/BillingSection", () => ({
  BillingSection: sectionMarker("section-billing"),
}));
vi.mock("@/components/crew/sections/AgendaSection", () => ({
  AgendaSection: sectionMarker("section-agenda"),
}));
vi.mock("@/components/crew/sections/PackListSection", () => ({
  PackListSection: sectionMarker("section-packlist"),
}));

beforeEach(() => {
  captured.value = null;
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ---- Render helper ----------------------------------------------------------
async function renderShell(props: {
  data: ShowForViewer;
  viewer: Viewer;
  showId?: string;
  rawSection?: string | undefined;
}) {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: props.data,
    viewer: props.viewer,
    showId: props.showId ?? "show-1",
    rawSection: props.rawSection,
    slug: "acme-2026",
  });
  render(element);
}

const CREW_ID = "c1";

function populated(overrides?: Parameters<typeof makeShowForViewer>[0]): ShowForViewer {
  return makeShowForViewer({
    show: {
      dates: {
        travelIn: "2026-05-12",
        set: "2026-05-13",
        showDays: ["2026-05-14", "2026-05-15"],
        travelOut: "2026-05-16",
      },
      venue: { name: "Center Arena", address: "5 Avenue", notes: null },
      coi_status: "Approved",
      event_details: {},
    },
    rooms: [
      { id: "r1", kind: "gs", name: "Main", audio: "2x SM58", video: "1x PTZ", lighting: "8x par" },
    ],
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Grand Hyatt",
        hotel_address: "1 Hotel Rd",
        check_in: "2026-05-13",
        check_out: "2026-05-16",
        names: [],
        confirmation_no: "CONF-9",
        notes: null,
      },
    ],
    contacts: [
      { kind: "venue", name: "Sam Venue", phone: "555-111-2222", email: null, notes: null },
    ],
    ...overrides,
  });
}

const adminViewer: Viewer = { kind: "admin" };
const crewViewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };

function leadData(): ShowForViewer {
  return populated({
    financials: { po: "PO-7", proposal: "P", invoice: "I", invoice_notes: "N" },
    crewMembers: [
      {
        id: CREW_ID,
        name: "Lena Lead",
        email: null,
        phone: null,
        role: "",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  });
}

// ============================================================================
// sectionNodes keys === the entitled set, and the listed sections are exactly it (billing gated)
// ============================================================================
describe("CrewShell builds sectionNodes for the entitled set", () => {
  /** The ids the "All sections" card and the wide nav receive. */
  const listed = () => captured.value!.sections.map((x) => x.id).sort();
  /**
   * The keys a viewer is listed: every body but the home's and the content-less
   * Agenda's (`populated` carries no agenda link; plan decision 1).
   */
  const listable = (keys: readonly string[]) =>
    keys.filter((k) => k !== "today" && k !== "agenda").sort();

  it("a LEAD viewer gets every key but transport (billing included)", async () => {
    await renderShell({ data: leadData(), viewer: crewViewer, rawSection: "today" });
    expect(captured.value).not.toBeNull();
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...LEAD_KEYS].sort());
    expect(listed()).toEqual(listable(keys));
    expect(listed()).toContain("billing");
  });

  it("a NON-lead viewer gets EXACTLY the base keys, no billing key", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "today" });
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...NON_LEAD_KEYS].sort());
    expect(keys).not.toContain("billing");
    expect(listed()).toEqual(listable(keys));
    expect(listed()).not.toContain("billing");
  });

  it("a real admin gets every key, transport and billing included", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "today" });
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...ALL_KEYS].sort());
    expect(listed()).toEqual(listable(keys));
    expect(listed()).toContain("billing");
  });
});

// ============================================================================
// The Transport body exists only for a viewer it entitles (PR B Task 9, decision 1)
// ============================================================================
describe("CrewShell builds the Transport body only for an entitled viewer (PR B Task 9)", () => {
  const FLIGHT = "4/19 AA2201 LGA - ORD 9:05am - 10:50am";
  const listed = () => captured.value!.sections.map((x) => x.id);

  it("transport: a crew viewer with no flight and no ride gets no transport body or row, and ?s=transport resolves home", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "transport" });
    const keys = Object.keys(captured.value!.sectionNodes);
    expect(keys).toContain("hotels");
    expect(keys).not.toContain("transport");
    expect(listed()).not.toContain("transport");
    expect(captured.value!.initialSection).toBe("today");
  });

  it("transport: a flight-only crew viewer gets the transport body and row, and ?s=transport opens it", async () => {
    await renderShell({
      data: populated({ viewerFlightInfo: FLIGHT }),
      viewer: crewViewer,
      rawSection: "transport",
    });
    expect(Object.keys(captured.value!.sectionNodes)).toContain("transport");
    expect(listed()).toContain("transport");
    expect(captured.value!.initialSection).toBe("transport");
  });

  it("hotels: ?s=travel resolves to hotels for a crew viewer", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "travel" });
    expect(captured.value!.initialSection).toBe("hotels");
  });
});

// ============================================================================
// The Agenda body exists for every entitled viewer, content or not (PR B Task 10)
// ============================================================================
describe("CrewShell builds the Agenda body for every viewer whose dates are not suppressed (PR B Task 10)", () => {
  const listed = () => captured.value!.sections.map((x) => x.id);
  const UNCONFIRMED = { kind: "unknown_asterisk", days: null } as const;
  const AGENDA_LINK = { label: "AGENDA", fileId: "agenda-file-1" };

  function crewData(opts: {
    links: ShowForViewer["show"]["agenda_links"];
    suppressed: boolean;
  }): ShowForViewer {
    const base = populated();
    return populated({
      show: { ...base.show, agenda_links: opts.links },
      crewMembers: base.crewMembers.map((m) =>
        m.id === CREW_ID && opts.suppressed ? { ...m, dateRestriction: UNCONFIRMED } : m,
      ),
    });
  }

  it("agenda: an entitled viewer with no agenda link gets the Agenda body but no row, and ?s=agenda opens it", async () => {
    await renderShell({
      data: crewData({ links: [], suppressed: false }),
      viewer: crewViewer,
      rawSection: "agenda",
    });
    expect(Object.keys(captured.value!.sectionNodes)).toContain("agenda");
    expect(listed()).not.toContain("agenda");
    expect(captured.value!.initialSection).toBe("agenda");
  });

  it("agenda: a viewer with an agenda file gets the body and the row, in its slot after schedule", async () => {
    await renderShell({
      data: crewData({ links: [AGENDA_LINK], suppressed: false }),
      viewer: crewViewer,
      rawSection: "today",
    });
    expect(Object.keys(captured.value!.sectionNodes)).toContain("agenda");
    const ids = listed();
    expect(ids.indexOf("agenda")).toBe(ids.indexOf("schedule") + 1);
  });

  it("agenda: a date-suppressed viewer gets no Agenda body and no row, with or without an agenda file, and ?s=agenda resolves home", async () => {
    for (const links of [[AGENDA_LINK], []]) {
      await renderShell({
        data: crewData({ links, suppressed: true }),
        viewer: crewViewer,
        rawSection: "agenda",
      });
      const keys = Object.keys(captured.value!.sectionNodes);
      // PREMISE: the rest of the page is built, so the missing key is the gate's doing.
      expect(keys).toContain("schedule");
      expect(keys, JSON.stringify(links)).not.toContain("agenda");
      expect(listed()).not.toContain("agenda");
      expect(captured.value!.initialSection).toBe("today");
      cleanup();
      captured.value = null;
    }
  });
});

// ============================================================================
// The Pack list body exists only on a day its gate admits (PR C Task 6, decision 1)
// ============================================================================
describe("CrewShell builds the Pack list body only for an entitled viewer (PR C Task 6)", () => {
  /** The pinned clock's day in the show's timezone. */
  const TODAY_ISO = "2026-05-14";
  const onPhase = (phase: WorkPhase, stages?: WorkPhase[]) =>
    populated({
      show: { schedule_phases: { [TODAY_ISO]: [phase] } },
      pullSheet: [{ caseLabel: "FOH Rack", items: [] }],
      crewMembers: [
        {
          id: CREW_ID,
          name: "Pat Packer",
          email: null,
          phone: null,
          role: "",
          roleFlags: [],
          dateRestriction: { kind: "none" },
          stageRestriction: stages ? { kind: "explicit", stages } : { kind: "none" },
        },
      ],
    });
  const listed = () => captured.value!.sections.map((x) => x.id);

  it("pack list: on a Set day the body is built, the row carries its peek, and ?s=packlist opens it", async () => {
    await renderShell({ data: onPhase("Set"), viewer: crewViewer, rawSection: "packlist" });
    expect(Object.keys(captured.value!.sectionNodes)).toContain("packlist");
    expect(captured.value!.sections.find((x) => x.id === "packlist")?.peek).toBe("1 case");
    expect(captured.value!.initialSection).toBe("packlist");
    expect(screen.getByTestId("section-packlist")).toBeTruthy();
  });

  it("pack list: on a Show day no body and no row are built, for crew or a plain admin, and ?s=packlist resolves home", async () => {
    for (const viewer of [crewViewer, adminViewer]) {
      await renderShell({ data: onPhase("Show"), viewer, rawSection: "packlist" });
      const keys = Object.keys(captured.value!.sectionNodes);
      // PREMISE: the rest of the page is built, so the missing key is the gate's doing.
      expect(keys).toContain("venue");
      expect(keys, viewer.kind).not.toContain("packlist");
      expect(listed(), viewer.kind).not.toContain("packlist");
      expect(captured.value!.initialSection).toBe("today");
      cleanup();
      captured.value = null;
    }
  });

  it("pack list: a viewer's stages that exclude the day's phase refuse the body, and ones that hold it keep it", async () => {
    await renderShell({
      data: onPhase("Set", ["Strike"]),
      viewer: crewViewer,
      rawSection: "packlist",
    });
    expect(Object.keys(captured.value!.sectionNodes)).not.toContain("packlist");
    expect(captured.value!.initialSection).toBe("today");
    cleanup();
    captured.value = null;
    await renderShell({
      data: onPhase("Set", ["Set"]),
      viewer: crewViewer,
      rawSection: "packlist",
    });
    expect(Object.keys(captured.value!.sectionNodes)).toContain("packlist");
    expect(captured.value!.initialSection).toBe("packlist");
  });

  it("pack list: the gate reads the shell's clock, so the next day is no member", async () => {
    nowDate.mockResolvedValueOnce(new Date("2026-05-15T15:00:00Z"));
    await renderShell({ data: onPhase("Set"), viewer: crewViewer, rawSection: "packlist" });
    expect(Object.keys(captured.value!.sectionNodes)).not.toContain("packlist");
    expect(captured.value!.initialSection).toBe("today");
  });

  it("pack list: the id wires to its own section component", async () => {
    await renderShell({ data: onPhase("Set"), viewer: adminViewer, rawSection: "today" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { unmount } = render(<>{captured.value!.sectionNodes.packlist}</>, { container: host });
    expect(host.querySelector('[data-testid="section-packlist"]')).not.toBeNull();
    unmount();
    host.remove();
  });
});

// ============================================================================
// initialSection === the server-resolved active (billing-gated, the old budget id an alias)
// ============================================================================
describe("CrewShell resolves initialSection server-side (billing-gated)", () => {
  it("a non-lead ?s=billing and ?s=budget resolve to today", async () => {
    for (const raw of ["billing", "budget"]) {
      await renderShell({ data: populated(), viewer: crewViewer, rawSection: raw });
      expect(captured.value!.initialSection, raw).toBe("today");
      cleanup();
      captured.value = null;
    }
  });

  it("a lead ?s=billing and ?s=budget (the alias) resolve to billing", async () => {
    for (const raw of ["billing", "budget"]) {
      await renderShell({ data: leadData(), viewer: crewViewer, rawSection: raw });
      expect(captured.value!.initialSection, raw).toBe("billing");
      cleanup();
      captured.value = null;
    }
  });

  it("?s=venue resolves to venue; absent ?s resolves to today", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "venue" });
    expect(captured.value!.initialSection).toBe("venue");
    cleanup();
    captured.value = null;
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: undefined });
    expect(captured.value!.initialSection).toBe("today");
  });
});

// ============================================================================
// PER-ID body correctness (anti-tautology — each id → its OWN section)
// ============================================================================
describe("CrewShell wires each entitled id to its OWN section component", () => {
  it("every entitled body renders the matching section-<id> marker", async () => {
    // The admin: the one viewer these fixtures entitle to every section, Transport included.
    await renderShell({ data: leadData(), viewer: adminViewer, rawSection: "today" });
    const nodes = captured.value!.sectionNodes;
    for (const id of ALL_KEYS) {
      const node = nodes[id];
      expect(node, `sectionNodes is missing the "${id}" body`).toBeTruthy();
      // Render each body into ITS OWN isolated container + query within it, so a
      // sibling render (or the controller stub's initial body) can't satisfy a
      // different id (anti-tautology).
      const host = document.createElement("div");
      document.body.appendChild(host);
      const { unmount } = render(<>{node}</>, { container: host });
      expect(
        host.querySelector(`[data-testid="section-${id}"]`),
        `body for "${id}" did not render section-${id} (mis-wired section component)`,
      ).not.toBeNull();
      unmount();
      host.remove();
    }
  });
});

// ============================================================================
// Integration: the controller mounts and the initial active body renders
// ============================================================================
describe("CrewShell mounts CrewSections with crew-shell present", () => {
  it("crew-shell wrapper present + initial active body rendered", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "venue" });
    expect(screen.getByTestId("crew-shell")).toBeTruthy();
    // The capturing CrewSections stub renders the initial active body.
    expect(screen.getByTestId("section-venue")).toBeTruthy();
  });
});

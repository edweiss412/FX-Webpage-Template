// @vitest-environment jsdom
/**
 * tests/crew/crewRegistryConsumption.test.tsx
 * (crew page redesign PR B plan, Task 4, "Single-source claims carry a
 * consumption proof", decisions 2 and 3; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §5.1 line 238)
 *
 * The claim: for every crew section (`CREW_SECTION_IDS`), every crew surface that
 * names or draws the section reads its label and glyph FROM
 * lib/showSections/registry.ts: `crewSectionLabel`, `SECTION_ICON`, the "All
 * sections" row, the wide nav item, the sheet's title and its close button's name,
 * the crew panel card's h3 and chip, and the search results' chip and group heading.
 * The wide nav's group label reads the same record. A literal equal to the registry's
 * value ("Billing & docs") passes any equality test, so the registry accessor is
 * mocked to return probe values no literal can hold, distinct per id, and every
 * reader has to follow them.
 *
 * The home has no record: under the same mock `today` keeps `CREW_TODAY_LABEL` and
 * `HomeIcon`, and `showSection` is never asked for it (PR C plan Task 9).
 *
 * The cases iterate `CREW_SECTION_IDS`, so a new section is covered with no edit here.
 * The one exception is the panel card: `schedule` takes the registry's label and glyph
 * but no shared body (spec line 305), so that loop reads `SHARED_PANEL_IDS`.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const probe = await vi.hoisted(async () => {
  const { createElement } = await import("react");
  const icons = new Map<string, unknown>();
  return {
    label: (id: string) => `Probe Label ${id}`,
    /** One distinct glyph per id, drawing an svg the cases can find by id. */
    icon: (id: string) => {
      let icon = icons.get(id);
      if (icon === undefined) {
        icon = Object.assign(
          (props: { className?: string }) =>
            createElement("svg", { "data-probe-icon": id, className: props.className }),
          { displayName: `ProbeIcon(${id})` },
        );
        icons.set(id, icon);
      }
      return icon;
    },
  };
});

vi.mock("@/lib/showSections/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/showSections/registry")>();
  return {
    ...actual,
    showSection: (id: string) => ({
      id,
      label: probe.label(id),
      group: "Probe group",
      icon: probe.icon(id) as LucideIcon,
    }),
  };
});

const nav = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/spring-gala/tok123",
  useSearchParams: () => nav.searchParams,
}));

// The shell harness (panel card case): the same seams the static-preview suite mocks.
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-05-14T15:00:00Z"),
  now: async () => "2026-05-14T15:00:00.000Z",
}));
vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({ ShowRealtimeBridge: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));

import { CrewSections } from "@/components/crew/CrewSections";
import { CrewSearchField } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider } from "@/components/crew/search/CrewSearchProvider";
import { CrewSearchResults } from "@/components/crew/search/CrewSearchResults";
import { HomeIcon } from "@/components/crew/icons/sectionIcons";
import { SectionControllerContext } from "@/components/crew/sectionController";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import {
  CREW_TODAY_LABEL,
  crewSectionEntries,
  crewSectionLabel,
  type CrewSectionEntry,
} from "@/lib/crew/crewSections";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const ADMIN: Viewer = { kind: "admin" };
const TODAY = new Date("2026-05-14T15:00:00Z");

/** Every section entitled and with content, so every shared section renders its card. */
function fullData(): ShowForViewer {
  return makeShowForViewer({
    // The Agenda is listed, and draws its panel card, only over an agenda link with
    // a file (PR B Task 10); Event details draws its panel only over a field to show
    // (PR C Task 5); Pack list is a member only on a pack-list phase, and draws its
    // panel only over a pull sheet (PR C Task 6); Rooms draws its panel only over a
    // room (PR C Task 7).
    show: {
      agenda_links: [{ label: "AGENDA", fileId: "agenda-file-9" }],
      event_details: { stage_size: "8 x 24" },
      schedule_phases: { "2026-05-14": ["Set"] },
    },
    pullSheet: [{ caseLabel: "Road Case 1", items: [] }],
    rooms: [{ id: "r1", kind: "gs", name: "Grand Ballroom", audio: "Two lavs" }],
    financials: { po: "PO-9", proposal: "PR-9", invoice: "INV-9", invoice_notes: "Net 9" },
    // The Contacts section draws its panel card only over contacts (PR B Task 7).
    contacts: [{ kind: "venue", name: "Vic Venue", email: null, phone: "555-0120", notes: null }],
    // Hotels and Transport draw theirs only over a reservation and a transport row
    // (PR B Task 9); the admin passes the transport gate.
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Harbor Inn",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: null,
        check_out: null,
        notes: null,
      },
    ],
    transportation: {
      driver_name: "Dee Driver",
      driver_phone: null,
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: null,
    },
  });
}

function entries(): CrewSectionEntry[] {
  const data = fullData();
  return crewSectionEntries(data, { ...resolveViewerContext(ADMIN, data), today: TODAY });
}

/**
 * The sections with a shared panel: every id but `schedule`, which keeps its own
 * `DayCard` and `SectionCard` (spec line 305).
 */
const SHARED_PANEL_IDS = CREW_SECTION_IDS.filter((id) => id !== "schedule");

function stubMatchMedia(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? true : query.includes("1024px") && wide,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderController(initialSection: SectionId = "today") {
  const list = entries();
  const nodes: Partial<Record<SectionId, ReactNode>> = { today: <p>today</p> };
  for (const e of list) nodes[e.id] = <p>body {e.id}</p>;
  return render(
    <CrewSections initialSection={initialSection} sections={list} sectionNodes={nodes} />,
  );
}

beforeEach(() => {
  nav.searchParams = new URLSearchParams();
  window.history.replaceState(null, "", "/show/spring-gala/tok123");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("every crew section reads the registry; the home keeps its own name", () => {
  test("crewSectionLabel and SECTION_ICON follow the registry for every crew id", () => {
    premise("crew sections", CREW_SECTION_IDS.length, 0);
    for (const id of CREW_SECTION_IDS) {
      expect(crewSectionLabel(id), id).toBe(probe.label(id));
      expect(SECTION_ICON[id], id).toBe(probe.icon(id));
    }
  });

  test("today keeps the crew's label and glyph under the same mock: the home has no record", () => {
    expect(crewSectionLabel("today")).toBe(CREW_TODAY_LABEL);
    expect(SECTION_ICON.today).toBe(HomeIcon);
  });

  test('the "All sections" row shows the probe label and glyph for every crew id', () => {
    renderController();
    const list = screen.getByTestId("crew-all-sections");
    for (const id of CREW_SECTION_IDS) {
      const row = list.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
      premiseHolds(`the ${id} row is listed`, row !== null);
      expect(row, id).toHaveTextContent(probe.label(id));
      expect(row!.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
    }
  });

  test("the wide nav item shows the probe label and glyph for every crew id, under the probe group", () => {
    stubMatchMedia(true);
    renderController();
    const navEl = screen.getByTestId("crew-wide-nav");
    for (const id of CREW_SECTION_IDS) {
      const item = navEl.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
      premiseHolds(`the ${id} nav item is listed`, item !== null);
      expect(item, id).toHaveTextContent(probe.label(id));
      expect(item!.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
    }
    // Every section is mocked to one group, so one run holds them all: the group's
    // consumption proof, since nothing in the nav filters on the real group list.
    const labels = within(navEl).getAllByTestId("crew-wide-nav-group");
    expect(labels.map((el) => el.textContent)).toEqual(["Probe group"]);
  });

  test.each(CREW_SECTION_IDS.map((id) => [id]))(
    "the sheet's title and its close button's name follow the registry (%s)",
    (id) => {
      renderController(id);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent(probe.label(id));
      expect(
        within(dialog).getByRole("button", { name: `Close ${probe.label(id).toLowerCase()}` }),
      ).toBeInTheDocument();
    },
  );

  test("the search results' chip and group heading follow the registry for every crew id", () => {
    const index = {
      entries: CREW_SECTION_IDS.map(
        (id): SearchEntry => ({
          id: `${id}:probe:1`,
          section: id,
          group: "Group",
          label: "Field",
          value: "zanzibar",
          context: [],
          copy: null,
        }),
      ),
    };
    render(
      <SectionControllerContext.Provider value={{ openSectionAndReveal: vi.fn() }}>
        <CrewSearchProvider
          slug="spring-gala"
          index={index}
          showId="show-1"
          cardReport={null}
          missLogging={false}
        >
          <CrewSearchField />
          <CrewSearchResults />
        </CrewSearchProvider>
      </SectionControllerContext.Provider>,
    );
    const input = screen.getByRole("searchbox", { name: "Search this show" });
    act(() => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "zanzibar" } });
    });
    const chipNav = screen.getByRole("navigation", { name: "Filter results by section" });
    for (const id of CREW_SECTION_IDS) {
      expect(
        within(chipNav).getByRole("button", { name: new RegExp(probe.label(id)) }),
      ).toBeInTheDocument();
      const group = screen
        .getAllByTestId("crew-search-group")
        .find((g) => g.getAttribute("data-section") === id);
      premiseHolds(`the ${id} result group renders`, group !== undefined);
      const heading = within(group!).getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent(probe.label(id));
      expect(heading.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
    }
  });
});

describe("the crew panel card of every shared section reads the registry", () => {
  test("each shared section's panel card h3 and chip carry the probe label and glyph; Schedule holds no panel card", async () => {
    const captured: { nodes: Partial<Record<SectionId, ReactNode>> } = { nodes: {} };
    vi.doMock("@/components/crew/CrewSections", () => ({
      CrewSections: (props: { sectionNodes: Partial<Record<SectionId, ReactNode>> }) => {
        captured.nodes = props.sectionNodes;
        return (
          <div>
            {Object.entries(props.sectionNodes).map(([id, node]) => (
              <div key={id} data-testid={`node-${id}`}>
                {node}
              </div>
            ))}
          </div>
        );
      },
    }));
    vi.resetModules();
    const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
    const element = await CrewShell({
      data: fullData(),
      viewer: ADMIN,
      showId: "show-1",
      rawSection: undefined,
      slug: "spring-gala",
    });
    render(element);
    vi.doUnmock("@/components/crew/CrewSections");
    for (const id of SHARED_PANEL_IDS) {
      const node = screen.getByTestId(`node-${id}`);
      const cards = [...node.querySelectorAll('[data-testid="crew-panel-card"]')];
      premise(`${id} panel cards rendered`, cards.length, 0);
      for (const card of cards) {
        expect(card.querySelector("h3"), id).toHaveTextContent(probe.label(id));
        expect(card.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
      }
    }
    // The exception, pinned: Schedule draws its own cards, so its node holds content
    // and no panel. An empty node would pass the absence, so the premise reads it first.
    const schedule = screen.getByTestId("node-schedule");
    premiseHolds("the Schedule node renders content", (schedule.textContent ?? "") !== "");
    expect(schedule.querySelector('[data-testid="crew-panel-card"]')).toBeNull();
  });
});

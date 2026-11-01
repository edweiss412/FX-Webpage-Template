// @vitest-environment jsdom
/**
 * tests/crew/crewRegistryConsumption.test.tsx
 * (crew page redesign PR B plan, Task 4, "Single-source claims carry a
 * consumption proof", decisions 2 and 3; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §5.1 line 238)
 *
 * The claim: for every section the crew page has moved onto a shared body
 * (`CREW_MOVED_IDS`), every crew surface that names or draws the section reads
 * its label and glyph FROM lib/showSections/registry.ts: `crewSectionLabel`,
 * `SECTION_ICON`, the "All sections" row, the wide nav item, the sheet's title
 * and its close button's name, the crew panel card's h3 and chip, and the search
 * results' chip and group heading. A literal equal to the registry's value
 * ("Billing & docs") passes any equality test, so the registry accessor is
 * mocked to return probe values no literal can hold, distinct per id, and every
 * reader has to follow them.
 *
 * The converse is pinned under the same mock: a section not yet moved keeps its
 * crew label and glyph (so `schedule` stays "Schedule", not the registry's "Crew
 * schedule", and `gear` stays "Gear", plan decision 2).
 *
 * The cases iterate `CREW_MOVED_IDS`, so each later section task's ids are
 * covered with no edit here.
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
import { SectionControllerContext } from "@/components/crew/sectionController";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import {
  CREW_MOVED_IDS,
  crewSectionEntries,
  crewSectionLabel,
  type CrewSectionEntry,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const ADMIN: Viewer = { kind: "admin" };
const TODAY = new Date("2026-05-14T15:00:00Z");

/** Every section entitled and with content, so every moved section renders its card. */
function fullData(): ShowForViewer {
  return makeShowForViewer({
    financials: { po: "PO-9", proposal: "PR-9", invoice: "INV-9", invoice_notes: "Net 9" },
  });
}

function entries(): CrewSectionEntry[] {
  const data = fullData();
  return crewSectionEntries(data, { ...resolveViewerContext(ADMIN, data), today: TODAY });
}

const NOT_MOVED: CrewSectionId[] = CREW_SECTION_IDS.filter(
  (id) => !(CREW_MOVED_IDS as readonly string[]).includes(id),
);

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

describe("moved sections read the registry; the rest keep their crew names", () => {
  test("crewSectionLabel and SECTION_ICON follow the registry for every moved id", () => {
    premise("moved crew sections", CREW_MOVED_IDS.length, 0);
    for (const id of CREW_MOVED_IDS) {
      expect(crewSectionLabel(id), id).toBe(probe.label(id));
      expect(SECTION_ICON[id], id).toBe(probe.icon(id));
    }
  });

  test("a section not yet moved keeps its crew label and glyph under the same mock", () => {
    premise("crew sections not yet moved", NOT_MOVED.length, 0);
    for (const id of NOT_MOVED) {
      expect(crewSectionLabel(id), id).not.toBe(probe.label(id));
      expect(SECTION_ICON[id], id).not.toBe(probe.icon(id));
    }
    // Plan decision 2: `schedule` keeps its crew name, not the registry's.
    expect(NOT_MOVED).toContain("schedule");
    expect(crewSectionLabel("schedule")).toBe("Schedule");
  });

  test('the "All sections" row shows the probe label and glyph for every moved id', () => {
    renderController();
    const list = screen.getByTestId("crew-all-sections");
    for (const id of CREW_MOVED_IDS) {
      const row = list.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
      premiseHolds(`the ${id} row is listed`, row !== null);
      expect(row, id).toHaveTextContent(probe.label(id));
      expect(row!.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
    }
    for (const id of NOT_MOVED) {
      const row = list.querySelector(`[data-section="${id}"]`);
      expect(row?.textContent ?? "", id).not.toContain(probe.label(id));
    }
  });

  test("the wide nav item shows the probe label and glyph for every moved id", () => {
    stubMatchMedia(true);
    renderController();
    const navEl = screen.getByTestId("crew-wide-nav");
    for (const id of CREW_MOVED_IDS) {
      const item = navEl.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
      premiseHolds(`the ${id} nav item is listed`, item !== null);
      expect(item, id).toHaveTextContent(probe.label(id));
      expect(item!.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
    }
  });

  test.each(CREW_MOVED_IDS.map((id) => [id]))(
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

  test("the search results' chip and group heading follow the registry for every moved id", () => {
    const index = {
      entries: CREW_MOVED_IDS.map(
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
    for (const id of CREW_MOVED_IDS) {
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

describe("the crew panel card of every moved section reads the registry", () => {
  test("each moved section's panel card h3 and chip carry the probe label and glyph", async () => {
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
    for (const id of CREW_MOVED_IDS) {
      const node = screen.getByTestId(`node-${id}`);
      const cards = [...node.querySelectorAll('[data-testid="crew-panel-card"]')];
      premise(`${id} panel cards rendered`, cards.length, 0);
      for (const card of cards) {
        expect(card.querySelector("h3"), id).toHaveTextContent(probe.label(id));
        expect(card.querySelector(`svg[data-probe-icon="${id}"]`), id).not.toBeNull();
      }
    }
  });
});

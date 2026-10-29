// @vitest-environment jsdom
/**
 * tests/components/crew/search/CrewSearchResults.test.tsx (crew show search, Task 17)
 *
 * Grouped results (spec §6.3 to §6.8, §10): chips with counts, the 5-per-section
 * and 50-per-section caps, rows (group · label, highlighted value snippet, alias
 * note), copy buttons and the copied toast, the report row, No match, the result
 * count live region, opening a row, and a realtime refresh under a query.
 *
 * Expected hit sets come from the matcher run on the same index (the matcher has
 * its own suite); every user-visible string is typed here LITERALLY from spec
 * §10, and this file never imports lib/search/copy.ts.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { FactRows } from "@/components/crew/primitives/FactRows";
import { CrewSearchField } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider, useCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { CrewSearchResults } from "@/components/crew/search/CrewSearchResults";
import type { CardReportContext } from "@/lib/crew/cardReportContext";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { prepareIndex, searchIndex } from "@/lib/search/match";
import type { SearchEntry, SearchIndex } from "@/lib/search/types";
import { premise, premiseHolds } from "../../../_shared/premise";
import { buildEntries, entryWhere, FIXTURE_INDEX } from "../../../search/_fixtureIndex";

const openSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/crew/sectionController", () => ({
  useSectionController: () => ({ openSectionAndReveal: openSpy }),
}));

const reportProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/components/shared/ReportModal", () => ({
  ReportModal: (props: Record<string, unknown>) => {
    reportProps.push(props);
    return props.open ? <div data-testid="report-modal" /> : null;
  },
}));

const LABEL: Record<SectionId, string> = {
  today: "Today",
  schedule: "Schedule",
  venue: "Venue",
  travel: "Travel",
  crew: "Crew",
  gear: "Gear",
  budget: "Budget",
};

const CREW_REPORT: CardReportContext = {
  surface: "crew",
  surfaceIdScope: "crew-card",
  extraContext: {},
};
const SHOW_ID = "show-123";

let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openSpy.mockReset();
  reportProps.length = 0;
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

function Probe() {
  const { phase } = useCrewSearch();
  return <output data-testid="phase">{phase}</output>;
}

function tree(index: SearchIndex, cardReport: CardReportContext | null = CREW_REPORT) {
  return (
    <CrewSearchProvider
      slug="spring-gala"
      index={index}
      showId={SHOW_ID}
      cardReport={cardReport}
      missLogging={false}
    >
      <CrewSearchField />
      <CrewSearchResults />
      <Probe />
    </CrewSearchProvider>
  );
}

function renderResults(index: SearchIndex = FIXTURE_INDEX, cardReport?: CardReportContext | null) {
  const view = render(tree(index, cardReport === undefined ? CREW_REPORT : cardReport));
  return view;
}

function search(query: string) {
  const input = screen.getByRole("searchbox", { name: "Search this show" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
}

const match = (index: SearchIndex, query: string) => searchIndex(prepareIndex(index), query);
const chipNav = () => screen.getByRole("navigation", { name: "Filter results by section" });
const chips = () => within(chipNav()).getAllByRole("button");
const pressed = () => chips().filter((c) => c.getAttribute("aria-pressed") === "true");
const groups = () => screen.queryAllByTestId("crew-search-group");
const rowsIn = (group: HTMLElement) => within(group).getAllByTestId("crew-search-row");
function rowFor(entry: SearchEntry): HTMLElement {
  const row = screen
    .getAllByTestId("crew-search-row")
    .find((r) => r.getAttribute("data-entry-id") === entry.id);
  if (!row) throw new Error(`no row for ${entry.id}`);
  return row;
}

/** 60 Gear lines sharing "cable", plus one Venue line, so the caps are reachable. */
const CAP_INDEX: SearchIndex = {
  entries: buildEntries([
    ...Array.from({ length: 60 }, (_, i) => ({
      section: "gear" as const,
      region: "gear-scope-audio",
      group: "Audio",
      label: `Room ${i + 1}`,
      value: `Cable run ${i + 1}`,
    })),
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Dock",
      value: "Cable ramp at the dock",
    },
  ]),
};

describe("chips (spec §6.3)", () => {
  it("All first, then one chip per section with hits in result order, with counts; All pressed", () => {
    renderResults();
    search("wifi");
    const expected = match(FIXTURE_INDEX, "wifi");
    premise("the query hits several sections", expected.sections.length, 1);
    expect(chips().map((c) => c.textContent)).toEqual([
      `All ${expected.total}`,
      ...expected.sections.map((s) => `${LABEL[s.section]} ${s.rows.length}`),
    ]);
    expect(pressed().map((c) => c.textContent)).toEqual([`All ${expected.total}`]);
    expect(chips().every((c) => c.getAttribute("aria-pressed") !== null)).toBe(true);
  });

  it("All view caps each section at 5 rows with a Show all button that selects the chip", () => {
    renderResults(CAP_INDEX);
    search("cable");
    const gear = match(CAP_INDEX, "cable").sections.find((s) => s.section === "gear")!;
    premise("the query hits more than 50 Gear lines", gear.rows.length, 50);
    const gearGroup = groups().find((g) => g.getAttribute("data-section") === "gear")!;
    expect(rowsIn(gearGroup)).toHaveLength(5);
    const showAll = within(gearGroup).getByRole("button", {
      name: `Show all ${gear.rows.length} in Gear`,
    });
    // A section with 5 or fewer rows has no Show all.
    const venueGroup = groups().find((g) => g.getAttribute("data-section") === "venue")!;
    expect(within(venueGroup).queryByRole("button", { name: /^Show all/ })).toBeNull();

    fireEvent.click(showAll);
    expect(pressed().map((c) => c.textContent)).toEqual([`Gear ${gear.rows.length}`]);
    expect(groups().map((g) => g.getAttribute("data-section"))).toEqual(["gear"]);
  });

  it("Show all moves focus to the chip it selects, so focus does not fall to the page", () => {
    renderResults(CAP_INDEX);
    search("cable");
    const gear = match(CAP_INDEX, "cable").sections.find((s) => s.section === "gear")!;
    const gearGroup = groups().find((g) => g.getAttribute("data-section") === "gear")!;
    const showAll = within(gearGroup).getByRole("button", {
      name: `Show all ${gear.rows.length} in Gear`,
    });
    act(() => showAll.focus());
    expect(document.activeElement).toBe(showAll);

    fireEvent.click(showAll);

    // Premise: the button that held focus is gone, so focus had to go somewhere.
    expect(showAll.isConnected).toBe(false);
    const gearChip = chips().find((c) => c.getAttribute("data-section") === "gear")!;
    expect(gearChip).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toBe(gearChip);
  });

  it("section view caps at 50 rows with the narrowing note", () => {
    renderResults(CAP_INDEX);
    search("cable");
    fireEvent.click(chips().find((c) => c.textContent?.startsWith("Gear "))!);
    expect(rowsIn(groups()[0]!)).toHaveLength(50);
    expect(screen.getByText("Showing the first 50. Add a word to narrow it.")).toBeInTheDocument();
  });

  it("a section of 50 or fewer rows shows no note in section view", () => {
    renderResults(CAP_INDEX);
    search("cable");
    fireEvent.click(chips().find((c) => c.textContent?.startsWith("Venue "))!);
    expect(screen.queryByText("Showing the first 50. Add a word to narrow it.")).toBeNull();
  });

  it("a changed query resets the chip to All, even when its section still has hits", () => {
    renderResults(CAP_INDEX);
    search("cable");
    fireEvent.click(chips().find((c) => c.textContent?.startsWith("Gear "))!);
    search("cable run");
    premiseHolds(
      "Gear still has hits for the new query",
      match(CAP_INDEX, "cable run").sections.some((s) => s.section === "gear"),
    );
    expect(pressed()[0]!.textContent).toMatch(/^All /);
  });

  it("chip labels are the sub-nav's section labels, read from both renders", () => {
    const zebra: SearchIndex = {
      entries: buildEntries(
        (Object.keys(LABEL) as SectionId[]).map((section) => ({
          section,
          region: "none",
          group: "",
          label: "Zebra",
          value: `Zebra line in ${section}`,
        })),
      ),
    };
    renderResults(zebra);
    search("zebra");
    const { container } = render(
      <CrewSubNav activeSection="today" budgetVisible onSelect={() => {}} />,
    );
    const desktopNav = container.querySelector("nav")!;
    const chipSections = chips()
      .map((c) => c.getAttribute("data-section"))
      .filter((s): s is SectionId => s !== null && s !== "all");
    expect(chipSections).toHaveLength(7);
    for (const section of chipSections) {
      const chip = chips().find((c) => c.getAttribute("data-section") === section)!;
      const chipLabel = chip.querySelector("[data-chip-label]")!.textContent;
      const tabLabel = desktopNav.querySelector(`[data-section="${section}"]`)!.textContent;
      expect(chipLabel).toBe(tabLabel);
    }
  });
});

describe("rows (spec §6.4)", () => {
  it("first line is group and label joined by ' · ', with matched words in <mark>", () => {
    renderResults();
    search("password");
    const entry = entryWhere({ section: "venue", label: "Wi-Fi password" });
    const row = rowFor(entry);
    expect(within(row).getByTestId("crew-search-row-meta").textContent).toBe(
      "Facilities · Wi-Fi password",
    );
    expect([...row.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["password"]);
    expect(within(row).getByTestId("crew-search-row-value").textContent).toBe("ORDTG.");
  });

  it("a null label shows the group alone; an empty group shows the label alone", () => {
    const index: SearchIndex = {
      entries: buildEntries([
        { section: "today", region: "none", group: "", label: "Crew call", value: "6:30 AM" },
        {
          section: "venue",
          region: "venue-diagrams",
          group: "Diagrams",
          label: null,
          value: "Stage plot",
        },
      ]),
    };
    renderResults(index);
    search("crew call");
    expect(screen.getByTestId("crew-search-row-meta").textContent).toBe("Crew call");
    search("stage plot");
    expect(screen.getByTestId("crew-search-row-meta").textContent).toBe("Diagrams");
  });

  it("values of 40 characters or less use the semibold value style; longer ones body style", () => {
    renderResults();
    search("dock");
    const dock = entryWhere({ section: "venue", label: "Dock" });
    premise("the dock line is longer than 40 characters", dock.value.length, 40);
    expect(within(rowFor(dock)).getByTestId("crew-search-row-value")).not.toHaveClass(
      "font-semibold",
    );
    search("ordtg");
    const pw = entryWhere({ section: "venue", label: "Wi-Fi password" });
    expect(within(rowFor(pw)).getByTestId("crew-search-row-value")).toHaveClass("font-semibold");
  });

  it("a long value shows a snippet around the first match, never rewriting its words", () => {
    const long =
      "Load in through the north freight corridor past the kitchen, then follow the blue tape on the floor all the way to the service elevator, which goes to the ballroom level only";
    premise("the value is over the 140-character snippet budget", long.length, 140);
    const index: SearchIndex = {
      entries: buildEntries([
        {
          section: "venue",
          region: "venue-facilities",
          group: "Facilities",
          label: "Dock",
          value: long,
        },
      ]),
    };
    renderResults(index);
    search("elevator");
    const value = screen.getByTestId("crew-search-row-value").textContent!;
    expect(value.startsWith("…")).toBe(true);
    expect(long.includes(value.replace(/^…/, "").replace(/…$/, ""))).toBe(true);
    expect(
      [...screen.getByTestId("crew-search-row-value").querySelectorAll("mark")].map(
        (m) => m.textContent,
      ),
    ).toEqual(["elevator"]);
  });

  it("an alias-only match shows the Matched note quoting the line's own word", () => {
    renderResults();
    search("wifi");
    const row = rowFor(entryWhere({ section: "gear", group: "Other" }));
    expect(within(row).getByText('Matched "Internet"')).toBeInTheDocument();
    const pw = rowFor(entryWhere({ section: "venue", label: "Wi-Fi password" }));
    expect(within(pw).queryByText(/^Matched /)).toBeNull();
  });

  it("tapping a row opens its line and ends search, keeping the query", () => {
    renderResults();
    search("dock");
    const dock = entryWhere({ section: "venue", label: "Dock" });
    fireEvent.click(within(rowFor(dock)).getByTestId("crew-search-row-open"));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("venue", dock.id);
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");
    expect(screen.getByRole("searchbox", { name: "Search this show" })).toHaveValue("dock");
  });
});

describe("copy (spec §6.4, §6.5)", () => {
  it("copy buttons only where copy is set, 44 px, with the spec labels", () => {
    renderResults();
    search("wifi");
    expect(
      within(rowFor(entryWhere({ label: "Wi-Fi network" }))).getByRole("button", {
        name: "Copy Wi-Fi network",
      }),
    ).toHaveClass("size-tap-min");
    expect(
      within(rowFor(entryWhere({ label: "Wi-Fi password" }))).getByRole("button", {
        name: "Copy Wi-Fi password",
      }),
    ).toHaveClass("size-tap-min");
    expect(
      within(rowFor(entryWhere({ section: "gear", group: "Other" }))).queryByRole("button", {
        name: /^Copy/,
      }),
    ).toBeNull();

    search("confirmation");
    const flight = entryWhere({ section: "travel", group: "Your flight", label: "Confirmation" });
    const hotel = entryWhere({ section: "travel", group: "Hotels", label: "Confirmation" });
    expect(
      within(rowFor(flight)).getByRole("button", { name: "Copy flight confirmation" }),
    ).toBeInTheDocument();
    expect(
      within(rowFor(hotel)).getByRole("button", { name: "Copy hotel confirmation" }),
    ).toBeInTheDocument();
  });

  // Impeccable critique A2: on the page, a value someone types back character by
  // character (Wi-Fi password, hotel and flight confirmation) carries the
  // code treatment, the slashed zero. The result row keeps it, so a zero in a
  // copied-by-hand code does not read as O. The class is READ from the page's
  // own row primitive, not typed here.
  it("copyable codes keep the page's code style; the network name and other lines do not", () => {
    const page = render(
      <FactRows
        rows={[
          { k: "Code", v: "C0DE", code: true },
          { k: "Plain", v: "PLA1N" },
        ]}
      />,
    );
    const classesOf = (text: string) => new Set(page.getByText(text).classList);
    const plain = classesOf("PLA1N");
    const codeClasses = [...classesOf("C0DE")].filter((c) => !plain.has(c));
    premiseHolds("FactRows adds exactly one class for a code row", codeClasses.length === 1);
    const codeClass = codeClasses[0]!;
    page.unmount();

    renderResults();
    const value = (entry: SearchEntry) =>
      within(rowFor(entry)).getByTestId("crew-search-row-value");

    search("wifi");
    expect(value(entryWhere({ label: "Wi-Fi password" }))).toHaveClass(codeClass);
    expect(value(entryWhere({ label: "Wi-Fi network" }))).not.toHaveClass(codeClass);
    expect(value(entryWhere({ section: "gear", group: "Other" }))).not.toHaveClass(codeClass);

    search("confirmation");
    const flight = entryWhere({ section: "travel", group: "Your flight", label: "Confirmation" });
    const hotel = entryWhere({ section: "travel", group: "Hotels", label: "Confirmation" });
    expect(value(flight)).toHaveClass(codeClass);
    expect(value(hotel)).toHaveClass(codeClass);
  });

  it("copies the exact text and shows the kind's toast for 2000 ms", async () => {
    vi.useFakeTimers();
    renderResults();
    search("wifi");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(clipboardWrite).toHaveBeenCalledWith("ORDTG.");
    const toast = screen.getByTestId("crew-search-toast");
    expect(toast).toHaveTextContent("Password copied");
    expect(toast.closest('[role="status"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Password copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("crew-search-toast")).toBeNull();
  });

  it("a second copy replaces the first toast and restarts its timer", async () => {
    vi.useFakeTimers();
    renderResults();
    search("wifi");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi network" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Network name copied");
    act(() => vi.advanceTimersByTime(1500));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(screen.getAllByTestId("crew-search-toast")).toHaveLength(1);
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Password copied");
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Password copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("crew-search-toast")).toBeNull();
  });

  it("a confirmation copy says Confirmation copied", async () => {
    renderResults();
    search("confirmation");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy hotel confirmation" }));
    });
    expect(clipboardWrite).toHaveBeenCalledWith("83920174");
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Confirmation copied");
  });

  it("a flight confirmation copy says Confirmation copied too", async () => {
    renderResults();
    search("confirmation");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy flight confirmation" }));
    });
    expect(clipboardWrite).toHaveBeenCalledWith("QX7RTP");
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Confirmation copied");
  });

  it("names a confirmation by its copy kind, never by the line's card", () => {
    // The regions are swapped against the kinds on purpose: a label read from the
    // entry id's region would name each of these the other way round.
    renderResults({
      entries: buildEntries([
        {
          section: "travel",
          region: "travel-hotels",
          group: "Hotels",
          label: "Booking",
          value: "ZK4410",
          copy: { kind: "flightConfirmation", text: "ZK4410" },
        },
        {
          section: "travel",
          region: "travel-flight",
          group: "Your flight",
          label: "Booking",
          value: "ZK4411",
          copy: { kind: "hotelConfirmation", text: "ZK4411" },
        },
      ]),
    });
    search("booking");
    const rows = screen.getAllByTestId("crew-search-row");
    premiseHolds("both swapped lines render as rows", rows.length === 2);
    const nameIn = (value: string) =>
      within(rows.find((r) => r.textContent?.includes(value))!)
        .getByTestId("crew-search-copy")
        .getAttribute("aria-label");
    expect(nameIn("ZK4410")).toBe("Copy flight confirmation");
    expect(nameIn("ZK4411")).toBe("Copy hotel confirmation");
  });

  it("a rejected write shows the failure toast", async () => {
    clipboardWrite.mockRejectedValue(new Error("NotAllowedError"));
    renderResults();
    search("wifi");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(
      "Couldn't copy. Tap the line, then press and hold the text.",
    );
  });

  it("a missing clipboard API shows the failure toast", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    renderResults();
    search("wifi");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi network" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(
      "Couldn't copy. Tap the line, then press and hold the text.",
    );
  });

  // Impeccable critique A6 / audit U4: the failure toast is an 11-word
  // instruction, so it holds for 6000 ms instead of the 2000 ms "copied" window.
  // Both durations are typed from spec §6.5, never imported.
  it("the failure toast holds for 6000 ms", async () => {
    vi.useFakeTimers();
    clipboardWrite.mockRejectedValue(new Error("NotAllowedError"));
    renderResults();
    search("wifi");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    const FAILED = "Couldn't copy. Tap the line, then press and hold the text.";
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(FAILED);
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(FAILED);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("crew-search-toast")).toBeNull();
  });

  it("each toast keeps its own window when one replaces the other", async () => {
    vi.useFakeTimers();
    clipboardWrite.mockRejectedValueOnce(new Error("NotAllowedError"));
    renderResults();
    search("wifi");
    const FAILED = "Couldn't copy. Tap the line, then press and hold the text.";

    // A failure, then a success: the success gets the short window.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(FAILED);
    act(() => vi.advanceTimersByTime(1000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent("Password copied");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByTestId("crew-search-toast")).toBeNull();

    // A success, then a failure: the failure gets the long window from its own start.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi network" }));
    });
    act(() => vi.advanceTimersByTime(1000));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(FAILED);
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByTestId("crew-search-toast")).toHaveTextContent(FAILED);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("crew-search-toast")).toBeNull();
  });
});

describe("no match and the report row (spec §6.7, §10)", () => {
  it("No match shows its text and the report row", () => {
    renderResults();
    search("qzxv");
    expect(screen.getByText("No matches. Try dock, hotel, or a name.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Filter results by section" })).toBeNull();
    const report = screen.getByTestId("crew-search-report");
    expect(report).toHaveTextContent("Not what you need?");
    expect(report).toHaveTextContent("Tell Doug what's missing from the sheet.");
    expect(within(report).getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("the report row is the last block in Results", () => {
    renderResults();
    search("dock");
    const report = screen.getByTestId("crew-search-report");
    const blocks = [...screen.getByTestId("crew-search-results").children].filter(
      (el) => el.getAttribute("role") !== "status",
    );
    expect(blocks[blocks.length - 1]).toBe(report);
  });

  it("Report opens ReportModal with the card report context, card id search", () => {
    renderResults();
    search("qzxv");
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByTestId("report-modal")).toBeInTheDocument();
    const props = reportProps[reportProps.length - 1]!;
    expect(props).toMatchObject({
      open: true,
      surface: "crew",
      surfaceId: "crew-card-search-show-123",
      showId: "show-123",
      autocapture: { viewerVisibleSection: "search", rawSnippet: 'Searched for "qzxv"' },
    });
    act(() => (props.onOpenChange as (open: boolean) => void)(false));
    expect(screen.queryByTestId("report-modal")).toBeNull();
  });

  it("a preview-as report keeps the admin surface and the crewPreview capture", () => {
    const preview: CardReportContext = {
      surface: "admin",
      surfaceIdScope: "admin-preview-card-cm-7",
      extraContext: { crewPreview: { crewMemberId: "cm-7", name: "Maria Chen", role: "A1" } },
    };
    renderResults(FIXTURE_INDEX, preview);
    search("qzxv");
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(reportProps[reportProps.length - 1]).toMatchObject({
      surface: "admin",
      surfaceId: "admin-preview-card-cm-7-search-show-123",
      autocapture: {
        crewPreview: { crewMemberId: "cm-7", name: "Maria Chen", role: "A1" },
        viewerVisibleSection: "search",
        rawSnippet: 'Searched for "qzxv"',
      },
    });
  });

  it("renders no report row when the shell turns reporting off", () => {
    renderResults(FIXTURE_INDEX, null);
    search("qzxv");
    expect(screen.getByText("No matches. Try dock, hotel, or a name.")).toBeInTheDocument();
    expect(screen.queryByTestId("crew-search-report")).toBeNull();
  });

  it("renders nothing visible in the Hint state", () => {
    renderResults();
    search("d");
    expect(screen.queryByTestId("crew-search-report")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Filter results by section" })).toBeNull();
  });
});

describe("result count live region (spec §6.8)", () => {
  it("announces the count 300 ms after the last change", () => {
    vi.useFakeTimers();
    renderResults();
    const region = screen.getByTestId("crew-search-count");
    expect(region).toHaveAttribute("role", "status");
    const total = match(FIXTURE_INDEX, "wifi").total;
    premise("wifi has more than one hit", total, 1);
    search("wi");
    act(() => vi.advanceTimersByTime(200));
    search("wifi");
    act(() => vi.advanceTimersByTime(299));
    expect(region).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(1));
    expect(region).toHaveTextContent(`${total} results`);
  });

  it("re-announces an unchanged count after the query changes: the region clears, then speaks", () => {
    // A status region only speaks when its text CHANGES. Two queries with the same count would
    // otherwise set the same string twice, React would skip the second update, and the new
    // query would never be announced.
    vi.useFakeTimers();
    renderResults();
    const first = match(FIXTURE_INDEX, "wifi").total;
    const second = match(FIXTURE_INDEX, "hotel").total;
    premise("wifi has more than one hit", first, 1);
    premiseHolds("wifi and hotel hit the same number of lines", first === second);
    const region = screen.getByTestId("crew-search-count");
    search("wifi");
    act(() => vi.advanceTimersByTime(300));
    expect(region).toHaveTextContent(`${first} results`);

    // Cleared on the query change, so the same string set 300 ms later is a real change.
    search("hotel");
    expect(region.textContent).toBe("");
    act(() => vi.advanceTimersByTime(299));
    expect(region.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(region.textContent).toBe(`${second} results`);
  });

  it("says 1 result and No matches", () => {
    vi.useFakeTimers();
    renderResults();
    premiseHolds("ordtg hits exactly one line", match(FIXTURE_INDEX, "ordtg").total === 1);
    search("ordtg");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("crew-search-count")).toHaveTextContent(/^1 result$/);
    search("qzxv");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("crew-search-count")).toHaveTextContent(/^No matches$/);
  });
});

describe("a realtime refresh under a query (spec §6.10)", () => {
  const extraVenue: SearchEntry = {
    id: "venue:venue-facilities:extra",
    section: "venue",
    group: "Facilities",
    label: "Backup Wi-Fi",
    value: "FXAV-Backup",
    context: [],
    copy: null,
  };

  it("keeps the query, recomputes, keeps a chip whose section still has hits, else falls back to All", () => {
    const view = renderResults();
    search("wifi");
    const venueCount = match(FIXTURE_INDEX, "wifi").sections.find((s) => s.section === "venue")!
      .rows.length;
    fireEvent.click(chips().find((c) => c.textContent?.startsWith("Venue "))!);

    const grown: SearchIndex = { entries: [...FIXTURE_INDEX.entries, extraVenue] };
    view.rerender(tree(grown));
    expect(screen.getByRole("searchbox", { name: "Search this show" })).toHaveValue("wifi");
    expect(pressed().map((c) => c.textContent)).toEqual([`Venue ${venueCount + 1}`]);
    expect(rowsIn(groups()[0]!)).toHaveLength(venueCount + 1);

    const noVenueWifi: SearchIndex = {
      entries: FIXTURE_INDEX.entries.filter(
        (e) => !(e.section === "venue" && e.label?.startsWith("Wi-Fi")),
      ),
    };
    premiseHolds(
      "the shrunken index has no Venue hits for wifi",
      !match(noVenueWifi, "wifi").sections.some((s) => s.section === "venue"),
    );
    view.rerender(tree(noVenueWifi));
    expect(pressed()[0]!.textContent).toMatch(/^All /);
    expect(chips().some((c) => c.textContent?.startsWith("Venue "))).toBe(false);
  });

  const noVenueWifi = (): SearchIndex => ({
    entries: FIXTURE_INDEX.entries.filter(
      (e) => !(e.section === "venue" && e.label?.startsWith("Wi-Fi")),
    ),
  });

  it("a focused chip whose section loses its last hit moves focus to All, selected or not", () => {
    premiseHolds(
      "the shrunken index has no Venue hits for wifi but still has hits",
      !match(noVenueWifi(), "wifi").sections.some((s) => s.section === "venue") &&
        match(noVenueWifi(), "wifi").total > 0,
    );
    const allChip = () => chips().find((c) => c.getAttribute("data-section") === "all")!;
    const venueChip = () => chips().find((c) => c.getAttribute("data-section") === "venue");

    // Selected and focused.
    const view = renderResults();
    search("wifi");
    fireEvent.click(venueChip()!);
    act(() => venueChip()!.focus());
    expect(document.activeElement).toBe(venueChip());
    view.rerender(tree(noVenueWifi()));
    expect(venueChip()).toBeUndefined();
    expect(document.activeElement).toBe(allChip());
    view.unmount();

    // Focused but not selected (All is pressed).
    const again = renderResults();
    search("wifi");
    act(() => venueChip()!.focus());
    expect(allChip()).toHaveAttribute("aria-pressed", "true");
    again.rerender(tree(noVenueWifi()));
    expect(venueChip()).toBeUndefined();
    expect(document.activeElement).toBe(allChip());
  });

  it("a chip that lost focus before the refresh does not pull focus back to All", () => {
    const view = renderResults();
    search("wifi");
    const venueChip = () => chips().find((c) => c.getAttribute("data-section") === "venue");
    act(() => venueChip()!.focus());
    // The viewer moves on to a Gear row, which the refresh keeps.
    const gearRow = within(
      groups().find((g) => g.getAttribute("data-section") === "gear")!,
    ).getAllByTestId("crew-search-row-open")[0]!;
    act(() => gearRow.focus());
    view.rerender(tree(noVenueWifi()));
    expect(venueChip()).toBeUndefined();
    expect(gearRow.isConnected).toBe(true);
    expect(document.activeElement).toBe(gearRow);
  });

  it("a refresh that keeps the focused chip's section leaves focus where it is", () => {
    const view = renderResults();
    search("wifi");
    const gearChip = () => chips().find((c) => c.getAttribute("data-section") === "gear")!;
    premiseHolds(
      "Gear still has wifi hits after the refresh",
      match(noVenueWifi(), "wifi").sections.some((s) => s.section === "gear"),
    );
    act(() => gearChip().focus());
    view.rerender(tree(noVenueWifi()));
    expect(document.activeElement).toBe(gearChip());
  });

  it("a refresh that empties the only section with hits moves focus from its chip, or All, to the field", () => {
    const oneSection: SearchIndex = {
      entries: buildEntries([
        {
          section: "venue",
          region: "venue-facilities",
          group: "Facilities",
          label: "Dock",
          value: "Loading dock on Wacker",
        },
        {
          section: "gear",
          region: "gear-scope-audio",
          group: "Audio",
          label: "Console",
          value: "Yamaha CL5",
        },
      ]),
    };
    const emptied = (): SearchIndex => ({
      entries: oneSection.entries.filter((e) => e.section !== "venue"),
    });
    premiseHolds(
      "dock hits Venue alone before the refresh and nothing after it",
      match(oneSection, "dock")
        .sections.map((s) => s.section)
        .join() === "venue" && match(emptied(), "dock").total === 0,
    );
    const input = () => screen.getByRole("searchbox", { name: "Search this show" });
    const chip = (section: string) =>
      chips().find((c) => c.getAttribute("data-section") === section)!;

    for (const focused of ["venue", "all"]) {
      const view = renderResults(oneSection);
      search("dock");
      act(() => chip(focused).focus());
      expect(document.activeElement).toBe(chip(focused));
      view.rerender(tree(emptied()));
      expect(screen.getByTestId("phase")).toHaveTextContent("nomatch");
      expect(screen.queryByRole("navigation", { name: "Filter results by section" })).toBeNull();
      expect(document.activeElement).toBe(input());
      view.unmount();
    }
  });
});

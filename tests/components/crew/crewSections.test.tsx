// @vitest-environment jsdom
/**
 * tests/components/crew/crewSections.test.tsx: the crew section controller
 * (crew page redesign spec §5.2, §5.3, §10, §11).
 *
 * `CrewSections` renders the compact home (the Today block plus the "All
 * sections" list) with sections in a bottom sheet, and the wide layout (left
 * nav plus every section stacked), from the same server-rendered
 * `sectionNodes`. It never fetches: every body arrives as a prop (freshness
 * invariant), and opening, closing and switching are history calls, never
 * `router.push`.
 *
 * The §5.2 history table is pinned row by row below ("realtime refresh removes
 * the open section" is Task 12's). Two paths no PR A page can trigger, an
 * in-sheet section link and `openSectionAndReveal` (search's entry point,
 * unmerged), run here against fixture section nodes; their browser versions
 * land with their first real caller.
 *
 * Expected labels come from `CREW_SECTION_LABELS`, hrefs from
 * `buildSectionHref`, so no case passes on a literal the controller also holds.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewSections, useSectionController } from "@/components/crew/CrewSections";
import {
  CREW_SECTION_LABELS,
  crewSectionEntries,
  type CrewSectionEntry,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import { LEGACY_SECTION_ALIASES, type SectionId } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { formatIsoDate } from "@/lib/format/date";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "../../fixtures/showForViewer";

const PATH = "/show/spring-gala/tok123";

const routerPush = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerPush, refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

function stubMatchMedia({ wide, reduced = true }: { wide: boolean; reduced?: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reduced
        : query.includes("min-width: 1024px")
          ? wide
          : false,
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

/** Sets the URL and state without going through the spies below. */
function setLocation(search: string, state: unknown = null) {
  History.prototype.replaceState.call(window.history, state, "", `${PATH}${search}`);
}

let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;
let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  routerPush.mockReset();
  nav.pathname = PATH;
  nav.searchParams = new URLSearchParams();
  setLocation("");
  stubMatchMedia({ wide: false });
  pushSpy = vi.spyOn(window.history, "pushState");
  replaceSpy = vi.spyOn(window.history, "replaceState");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
  scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

/** Browser Back/Forward: the URL and state move, then `popstate` fires. */
function popTo(search: string, state: unknown = null) {
  setLocation(search, state);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

function entries(billing: boolean): CrewSectionEntry[] {
  const ids: CrewSectionId[] = ["schedule", "venue", "hotels", "crew", "rooms"];
  if (billing) ids.push("billing");
  return ids.map((id) => ({
    id,
    label: CREW_SECTION_LABELS[id],
    peek: id === "crew" ? null : `peek for ${id}`,
  }));
}

function body(id: string, extra?: ReactNode): ReactNode {
  return (
    <div data-testid={`body-${id}`}>
      body {id}
      {extra}
    </div>
  );
}

function nodes(billing: boolean, over: Partial<Record<SectionId, ReactNode>> = {}) {
  const n: Partial<Record<SectionId, ReactNode>> = {
    today: body("today"),
    schedule: body("schedule"),
    venue: body("venue"),
    hotels: body("hotels"),
    crew: body("crew"),
    rooms: body("rooms"),
  };
  if (billing) n.billing = body("billing");
  return { ...n, ...over };
}

function renderController(
  initialSection: SectionId = "today",
  opts: {
    billing?: boolean;
    over?: Partial<Record<SectionId, ReactNode>>;
    extra?: ReactNode;
    /** Development's double effect run (mount, cleanup, mount), as `next dev` renders. */
    strict?: boolean;
  } = {},
) {
  const billing = opts.billing ?? false;
  const controller = (
    <CrewSections
      initialSection={initialSection}
      sections={entries(billing)}
      sectionNodes={nodes(billing, opts.over)}
    >
      {opts.extra}
    </CrewSections>
  );
  return render(opts.strict ? <StrictMode>{controller}</StrictMode> : controller);
}

/** Resolves after the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sheet(): HTMLElement | null {
  return screen.queryByRole("dialog");
}

function row(id: CrewSectionId): HTMLElement {
  return within(screen.getByTestId("crew-all-sections")).getByRole("link", {
    name: new RegExp(`^${CREW_SECTION_LABELS[id]}\\b`),
  });
}

function closeButton(id: CrewSectionId): HTMLElement {
  return screen.getByRole("button", { name: `Close ${CREW_SECTION_LABELS[id].toLowerCase()}` });
}

describe("CrewSections, compact: home and sheet (spec §5.2)", () => {
  it("sheet: ?s=today renders the home (Today block and All sections) with no sheet", () => {
    renderController("today");
    expect(screen.getByTestId("body-today")).toBeInTheDocument();
    expect(screen.getByTestId("crew-all-sections")).toBeInTheDocument();
    expect(sheet()).toBeNull();
    // Compact never renders the wide nav.
    expect(screen.queryByTestId("crew-wide-nav")).toBeNull();
  });

  it('sheet: the list is headed "All sections" and its rows are the membership in order, with peeks', () => {
    renderController("today", { billing: true });
    const list = screen.getByTestId("crew-all-sections");
    expect(within(list).getByRole("heading", { name: "All sections" })).toBeInTheDocument();
    const rows = within(list).getAllByTestId("crew-all-sections-row");
    expect(rows.map((r) => r.getAttribute("data-section"))).toEqual(entries(true).map((e) => e.id));
    for (const e of entries(true)) {
      const r = rows.find((x) => x.getAttribute("data-section") === e.id)!;
      expect(within(r).getByText(e.label)).toBeInTheDocument();
      const peek = within(r).queryByTestId("crew-all-sections-peek");
      if (e.peek === null) expect(peek, `${e.id} has no peek line`).toBeNull();
      else expect(peek).toHaveTextContent(e.peek);
    }
  });

  it("sheet: every row clears the tap floor and carries its section's icon", () => {
    renderController("today", { billing: true });
    for (const r of screen.getAllByTestId("crew-all-sections-row")) {
      expect(r.className, r.getAttribute("data-section") ?? "").toMatch(/\bmin-h-tap-min\b/);
      expect(r.querySelector("svg"), r.getAttribute("data-section") ?? "").not.toBeNull();
    }
  });

  it("sheet: each row is a buildSectionHref link that keeps an allow-listed gate and drops the rest", () => {
    nav.searchParams = new URLSearchParams("gate=skip&token=leak&evil=1");
    renderController("today");
    for (const e of entries(false)) {
      const href = row(e.id).getAttribute("href");
      expect(href).toBe(buildSectionHref(PATH, nav.searchParams, e.id));
      expect(href).toContain("gate=skip");
      expect(href).not.toContain("token");
      expect(href).not.toContain("evil");
    }
  });

  it("sheet: opening a row from home pushes s with the crewSheet marker and opens the sheet, never router.push", () => {
    setLocation("", { __NA: true });
    renderController("today");
    fireEvent.click(row("venue"));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const [state, , url] = pushSpy.mock.calls[0]!;
    // Next's own key is left out: Next's patched pushState skips any state that
    // carries it, and would then never move the router's URL, so the next
    // router.refresh() would replace this entry with the URL without `s`
    // (plan Task 12, measured in the compound refresh case). Next copies its
    // keys back itself.
    expect(state).toEqual({ crewSheet: true });
    expect(url).toBe(buildSectionHref(PATH, nav.searchParams, "venue"));
    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(within(sheet()!).getByTestId("body-venue")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("sheet: an in-sheet link replaces history, swaps the body and resets its scroll; the next close lands on home", async () => {
    const link = (
      <a data-testid="in-sheet-link" href={buildSectionHref(PATH, nav.searchParams, "crew")}>
        Crew roster
      </a>
    );
    renderController("today", { over: { venue: body("venue", link) } });
    fireEvent.click(row("venue"));
    const sheetBody = screen.getByTestId("crew-section-sheet-body");
    let scrollTop = 240;
    Object.defineProperty(sheetBody, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    const pushedState = pushSpy.mock.calls[0]![0];

    fireEvent.click(screen.getByTestId("in-sheet-link"));
    expect(pushSpy).toHaveBeenCalledTimes(1); // no second entry
    const replace = replaceSpy.mock.calls.at(-1)!;
    expect(replace[2]).toBe(buildSectionHref(PATH, nav.searchParams, "crew"));
    expect(replace[0]).toEqual(pushedState);
    expect(sheet()).toHaveAttribute("data-section", "crew");
    expect(await within(sheet()!).findByTestId("body-crew")).toBeInTheDocument();
    expect(scrollTop, "the sheet body starts at the top of the new section").toBe(0);

    // The marker rode along, so the close goes back to the home entry beneath.
    fireEvent.click(closeButton("crew"));
    expect(backSpy).toHaveBeenCalledTimes(1);
    popTo("");
    await waitFor(() => expect(sheet()).toBeNull());
    expect(screen.getByTestId("crew-all-sections")).toBeInTheDocument();
  });

  it("sheet: closing with the marker set calls history.back, and the popstate that follows closes it", async () => {
    renderController("today");
    fireEvent.click(row("crew"));
    const replacesBefore = replaceSpy.mock.calls.length;
    fireEvent.click(closeButton("crew"));
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy.mock.calls.length).toBe(replacesBefore);
    // Not closed until the popstate lands.
    expect(sheet()).not.toBeNull();
    popTo("");
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it("sheet: closing with the marker absent (deep link) replaces the URL without s or the marker", async () => {
    nav.searchParams = new URLSearchParams("s=venue&gate=skip");
    setLocation("?s=venue&gate=skip", { __NA: true });
    renderController("venue");
    expect(sheet()).toHaveAttribute("data-section", "venue");
    fireEvent.click(closeButton("venue"));
    expect(backSpy).not.toHaveBeenCalled();
    const [state, , url] = replaceSpy.mock.calls.at(-1)!;
    expect(url).toBe(`${PATH}?gate=skip`);
    // No marker, and no Next key either (see the push case above).
    expect(state).toEqual({});
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it("sheet: closing a deep-linked sheet focuses that section's All sections row, never <body> (audit P2-5)", async () => {
    // A deep link opens the sheet with nothing focused, so there is no opener to
    // go back to. The row that opens the same section is where a tap would have
    // started, and it is on the page the close lands on.
    nav.searchParams = new URLSearchParams("s=venue");
    setLocation("?s=venue");
    renderController("venue");
    expect(sheet()).toHaveAttribute("data-section", "venue");
    fireEvent.click(closeButton("venue"));
    await waitFor(() => expect(sheet()).toBeNull());
    expect(document.activeElement).toBe(row("venue"));
  });

  it("sheet: closing a deep-linked sheet brings the focused row into view, a row it opened from stays put (UI-gate re-run P2-1)", async () => {
    // jsdom has no layout and no scrollIntoView; a recorder stands in for it.
    const intoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: intoView,
    });
    try {
      // The fallback row was never on screen: the page sat at its top under the
      // sheet while the row was 800 to 1100px down, so focus went out of sight.
      nav.searchParams = new URLSearchParams("s=venue");
      setLocation("?s=venue");
      // Under Strict Mode, as `next dev` renders: a sheet opened after the home
      // has mounted (here by Forward to a sheet entry, which leaves no opener)
      // runs its effect, the cleanup and the effect again. That cleanup focuses
      // the fallback row with no close, and must not scroll the page behind the
      // sheet that is opening; the second run must not take that row for an
      // opener either, or the real close would skip the scroll.
      const strict = renderController("today", { strict: true });
      popTo("?s=venue", { crewSheet: true });
      expect(sheet()).toHaveAttribute("data-section", "venue");
      await nextFrame();
      await nextFrame();
      expect(intoView, "an opening sheet never scrolls the page behind it").not.toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Venue" }));
      popTo("");
      await waitFor(() => expect(sheet()).toBeNull());
      expect(document.activeElement).toBe(row("venue"));
      await waitFor(() => expect(intoView.mock.calls).toEqual([[{ block: "nearest" }]]));
      expect(intoView.mock.contexts).toEqual([row("venue")]);
      strict.unmount();
      intoView.mockClear();

      const first = renderController("venue");
      fireEvent.click(closeButton("venue"));
      await waitFor(() => expect(sheet()).toBeNull());
      expect(document.activeElement).toBe(row("venue"));
      await waitFor(() => expect(intoView.mock.calls).toEqual([[{ block: "nearest" }]]));
      expect(intoView.mock.contexts).toEqual([row("venue")]);
      first.unmount();

      // A real opener was on screen when it was tapped: focus goes back to it
      // with the page where it was, so nothing scrolls.
      intoView.mockClear();
      nav.searchParams = new URLSearchParams();
      setLocation("");
      renderController("today");
      row("crew").focus();
      fireEvent.click(row("crew"));
      expect(sheet()).toHaveAttribute("data-section", "crew");
      fireEvent.click(closeButton("crew"));
      popTo(""); // the marker was set, so the close went back
      await waitFor(() => expect(sheet()).toBeNull());
      expect(document.activeElement).toBe(row("crew"));
      await nextFrame();
      expect(intoView).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("sheet: popstate to an entry without s closes the sheet", async () => {
    nav.searchParams = new URLSearchParams("s=rooms");
    setLocation("?s=rooms");
    renderController("rooms");
    expect(sheet()).toHaveAttribute("data-section", "rooms");
    popTo("");
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it("sheet: popstate to an entry whose s is entitled opens the sheet on it", () => {
    renderController("today");
    expect(sheet()).toBeNull();
    popTo("?s=schedule", { crewSheet: true });
    expect(sheet()).toHaveAttribute("data-section", "schedule");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("sheet: popstate to an unknown or non-entitled s replaces the URL without s and closes", async () => {
    for (const bad of ["bogus", "budget", "billing", "today"]) {
      const { unmount } = renderController("venue");
      replaceSpy.mockClear();
      popTo(`?s=${bad}`);
      await waitFor(() => expect(sheet(), bad).toBeNull());
      if (bad !== "today") {
        // `today` means home, an entitled destination with nothing to rewrite.
        const [, , url] = replaceSpy.mock.calls.at(-1)!;
        expect(url, bad).toBe(PATH);
      }
      unmount();
    }
  });

  it("sheet: a realtime refresh with fresh sectionNodes keeps the sheet open and shows the fresh body", () => {
    const { rerender } = renderController("today");
    fireEvent.click(row("hotels"));
    rerender(
      <CrewSections
        initialSection="today"
        sections={entries(false)}
        sectionNodes={nodes(false, {
          hotels: <div data-testid="body-hotels">FRESH hotels content</div>,
        })}
      />,
    );
    expect(sheet()).toHaveAttribute("data-section", "hotels");
    expect(within(sheet()!).getByText("FRESH hotels content")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("sheet: openSectionAndReveal in compact opens the sheet, scrolls the target inside its body and highlights it", async () => {
    function SearchResult() {
      const { openSectionAndReveal } = useSectionController();
      return (
        <button type="button" onClick={() => openSectionAndReveal("venue", "venue-dock")}>
          Dock result
        </button>
      );
    }
    const target = <p data-search-target="venue-dock">Dock door 3</p>;
    renderController("today", {
      over: { venue: body("venue", target) },
      extra: <SearchResult />,
    });
    fireEvent.click(screen.getByRole("button", { name: "Dock result" }));
    expect(pushSpy.mock.calls[0]![0]).toMatchObject({ crewSheet: true });
    expect(sheet()).toHaveAttribute("data-section", "venue");

    const sheetBody = screen.getByTestId("crew-section-sheet-body");
    const el = sheetBody.querySelector<HTMLElement>('[data-search-target="venue-dock"]')!;
    let scrollTop = 0;
    Object.defineProperty(sheetBody, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    Object.defineProperty(sheetBody, "clientHeight", { configurable: true, value: 300 });
    sheetBody.getBoundingClientRect = () => ({ top: 100, height: 300 }) as DOMRect;
    el.getBoundingClientRect = () => ({ top: 500, height: 20 }) as DOMRect;

    await waitFor(() => expect(el).toHaveAttribute("data-search-reveal"));
    // Centred inside the body: 0 + (500 - 100) - (300 - 20) / 2.
    expect(scrollTop).toBe(260);
    expect(document.activeElement).toBe(el);
    expect(scrollToSpy, "the page behind does not scroll").not.toHaveBeenCalled();
  });

  it("sheet: no sections renders no All sections card, and the Today block still renders (spec §11)", () => {
    // Positive control: the same render with members does show the card.
    const { unmount } = renderController("today");
    expect(screen.getByTestId("crew-all-sections")).toBeInTheDocument();
    unmount();
    render(<CrewSections initialSection="today" sections={[]} sectionNodes={nodes(false)} />);
    expect(screen.getByTestId("body-today")).toBeInTheDocument();
    expect(screen.queryByTestId("crew-all-sections")).toBeNull();
  });

  it("sheet: without matchMedia the controller behaves as compact (spec §11)", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderController("today");
    expect(screen.getByTestId("crew-all-sections")).toBeInTheDocument();
    expect(screen.queryByTestId("crew-wide-nav")).toBeNull();
    fireEvent.click(row("venue"));
    expect(pushSpy.mock.calls[0]![0]).toMatchObject({ crewSheet: true });
    expect(sheet()).toHaveAttribute("data-section", "venue");
  });

  it("sheet: the controller root carries the readiness attribute once mounted", () => {
    renderController("today");
    expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
    );
  });

  it("sheet: the controller root names the section on screen, for the saved-copy bar (offline spec 4.7.4)", () => {
    // The saved-copy bar reads `data-active-section` once on a saved copy and
    // puts it in the URL's `s`, so the URL says what the copy shows. Failure
    // modes: no attribute (the bar leaves a stale `s`), a value that does not
    // follow the open sheet, or "today" missing for the home.
    renderController("venue");
    const root = screen.getByTestId("crew-shell-sections");
    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(root).toHaveAttribute("data-active-section", "venue");

    // A deep link's close replaces `s` away and closes at once; the sheet's exit
    // slide may still hold the dialog, but the home is what the page shows.
    fireEvent.click(closeButton("venue"));
    expect(root).toHaveAttribute("data-active-section", "today");

    fireEvent.click(row("schedule"));
    expect(sheet()).toHaveAttribute("data-section", "schedule");
    expect(root).toHaveAttribute("data-active-section", "schedule");
  });
});

describe("CrewSections, wide: nav and stacked sections (spec §5.3)", () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, reduced: false });
  });

  it("wide nav: lists Today then the sections in membership order, each text exactly its label", () => {
    renderController("today", { billing: true });
    const navEl = screen.getByTestId("crew-wide-nav");
    const items = within(navEl).getAllByRole("link");
    expect(items.map((i) => i.textContent)).toEqual([
      "Today",
      ...entries(true).map((e) => e.label),
    ]);
    // Wide never renders the list or the sheet; every section is stacked.
    expect(screen.queryByTestId("crew-all-sections")).toBeNull();
    expect(sheet()).toBeNull();
    for (const e of entries(true)) {
      expect(screen.getByTestId(`body-${e.id}`)).toBeInTheDocument();
    }
  });

  it("wide nav: only the active item carries aria-current, and every item and row clears the tap floor", () => {
    // Carried over from the retired sub-nav suite: aria-current on the active
    // item alone, a per-section svg icon, and the 44px tap-target class.
    renderController("today", { billing: true });
    const items = within(screen.getByTestId("crew-wide-nav")).getAllByRole("link");
    expect(items.filter((i) => i.getAttribute("aria-current") !== null)).toEqual([items[0]]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    for (const item of items) {
      expect(item.className, item.textContent ?? "").toMatch(/\bmin-h-tap-min\b/);
      expect(item.querySelector("svg"), item.textContent ?? "").not.toBeNull();
    }
    // The billing gate: the item is there for an entitled viewer and gone otherwise.
    expect(items.map((i) => i.getAttribute("data-section"))).toContain("billing");
    cleanup();
    renderController("today", { billing: false });
    const unentitled = within(screen.getByTestId("crew-wide-nav")).getAllByRole("link");
    expect(unentitled.map((i) => i.getAttribute("data-section"))).not.toContain("billing");
  });

  it("wide nav: no sections renders no nav, and the Today block still renders (spec §11)", () => {
    // Positive control: the same render with members does show the nav.
    const { unmount } = renderController("today");
    expect(screen.getByTestId("crew-wide-nav")).toBeInTheDocument();
    unmount();
    render(<CrewSections initialSection="today" sections={[]} sectionNodes={nodes(false)} />);
    expect(screen.getByTestId("body-today")).toBeInTheDocument();
    expect(screen.queryByTestId("crew-wide-nav")).toBeNull();
  });

  it("wide nav: a click scrolls to the section, focuses its heading and replaces history, never pushes", () => {
    renderController("today");
    const section = screen.getByTestId("body-venue").closest<HTMLElement>("[data-section]")!;
    section.getBoundingClientRect = () => ({ top: 640, height: 400 }) as DOMRect;
    fireEvent.click(
      within(screen.getByTestId("crew-wide-nav")).getByRole("link", { name: "Venue" }),
    );

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 640, behavior: "smooth" });
    const heading = within(section).getByRole("heading", { name: CREW_SECTION_LABELS.venue });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(heading);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy.mock.calls.at(-1)![2]).toBe(
      buildSectionHref(PATH, nav.searchParams, "venue"),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("wide nav: Today focuses the Today block itself, a visible target, never the visually hidden heading (audit P2-6)", () => {
    renderController("venue");
    fireEvent.click(
      within(screen.getByTestId("crew-wide-nav")).getByRole("link", { name: "Today" }),
    );
    const block = screen.getByTestId("crew-today-block");
    // The 1px `sr-only` heading drew its focus ring on a clipped box. The block
    // carries the ring instead, and keeps its name from that heading.
    expect(document.activeElement).toBe(block);
    expect(block).toHaveAttribute("tabindex", "-1");
    expect(block).toHaveAccessibleName("Today");
    expect(block.className.split(/\s+/)).not.toContain("sr-only");
  });

  it("wide nav: a click under reduced motion scrolls instantly", () => {
    stubMatchMedia({ wide: true, reduced: true });
    renderController("today");
    const section = screen.getByTestId("body-crew").closest<HTMLElement>("[data-section]")!;
    section.getBoundingClientRect = () => ({ top: 900, height: 400 }) as DOMRect;
    fireEvent.click(
      within(screen.getByTestId("crew-wide-nav")).getByRole("link", { name: "Crew" }),
    );
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 900, behavior: "auto" });
  });

  it("wide nav: popstate scrolls to the entry's section without moving focus", async () => {
    renderController("today");
    const section = screen.getByTestId("body-rooms").closest<HTMLElement>("[data-section]")!;
    section.getBoundingClientRect = () => ({ top: 1200, height: 400 }) as DOMRect;
    const before = document.activeElement;
    popTo("?s=rooms", { crewSheet: true });
    await waitFor(() =>
      expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 1200, behavior: "smooth" }),
    );
    expect(document.activeElement).toBe(before);
    popTo("");
    await waitFor(() =>
      expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" }),
    );
  });

  it("wide nav: openSectionAndReveal scrolls the page to the target and highlights it", async () => {
    function SearchResult() {
      const { openSectionAndReveal } = useSectionController();
      return (
        <button type="button" onClick={() => openSectionAndReveal("crew", "crew-dana")}>
          Dana result
        </button>
      );
    }
    renderController("today", {
      over: { crew: body("crew", <p data-search-target="crew-dana">Dana Ortiz</p>) },
      extra: <SearchResult />,
    });
    const el = document.querySelector<HTMLElement>('[data-search-target="crew-dana"]')!;
    el.getBoundingClientRect = () => ({ top: 1500, height: 20 }) as DOMRect;
    fireEvent.click(screen.getByRole("button", { name: "Dana result" }));
    await waitFor(() => expect(el).toHaveAttribute("data-search-reveal"));
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1500, behavior: "smooth" });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();
  });
});

/**
 * Compound transitions the controller decides (crew page redesign spec §7,
 * plan Task 12). The browser half, with real breakpoints, real refreshes and
 * real nested dialogs, is in tests/e2e/crew-section-toggle.spec.ts and
 * tests/e2e/crew-wide-nav.spec.ts (titles carry "compound").
 */
describe("CrewSections compound transitions (spec §7)", () => {
  /** A refresh: the shell re-renders with fresh props while the controller stays mounted. */
  function refreshed(billing: boolean, over: Partial<Record<SectionId, ReactNode>> = {}) {
    return (
      <CrewSections
        initialSection="today"
        sections={entries(billing)}
        sectionNodes={nodes(billing, over)}
      />
    );
  }

  it("compound: a refresh that takes the open section's body away closes the sheet in that commit, with no exit slide, and goes back over the marker", () => {
    // Full motion, so an exit slide would hold the departing sheet (and its
    // Billing body) for 220ms.
    stubMatchMedia({ wide: false, reduced: false });
    const { rerender } = render(refreshed(true));
    fireEvent.click(row("billing"));
    expect(sheet()).toHaveAttribute("data-section", "billing");
    expect(window.history.state).toMatchObject({ crewSheet: true });

    rerender(refreshed(false));

    expect(sheet(), "no departing sheet left in the DOM").toBeNull();
    expect(screen.queryByTestId("body-billing")).toBeNull();
    expect(screen.queryByTestId("crew-section-sheet")).toBeNull();
    expect(backSpy, "the close row: back over the marker").toHaveBeenCalledTimes(1);
  });

  it("compound: a lost entitlement on a deep-linked sheet replaces s away instead", () => {
    nav.searchParams = new URLSearchParams("s=billing");
    // A deep link: Next's keys on the entry, no marker.
    setLocation("?s=billing", { __NA: true });
    stubMatchMedia({ wide: false, reduced: false });
    const { rerender } = render(
      <CrewSections initialSection="billing" sections={entries(true)} sectionNodes={nodes(true)} />,
    );
    expect(sheet()).toHaveAttribute("data-section", "billing");

    rerender(
      <CrewSections initialSection="today" sections={entries(false)} sectionNodes={nodes(false)} />,
    );

    expect(sheet()).toBeNull();
    expect(backSpy).not.toHaveBeenCalled();
    const [state, , url] = replaceSpy.mock.calls.at(-1)!;
    expect(url).toBe(PATH);
    expect(state).toEqual({});
  });

  it("compound: a section that leaves the list while its body stays keeps the sheet open on its fresh body", () => {
    const { rerender } = render(refreshed(false));
    fireEvent.click(row("venue"));
    const pushes = pushSpy.mock.calls.length;
    const replaces = replaceSpy.mock.calls.length;

    // Venue is no longer listed, but the server still built its (fresh) body.
    rerender(
      <CrewSections
        initialSection="today"
        sections={entries(false).filter((e) => e.id !== "venue")}
        sectionNodes={nodes(false, {
          venue: <div data-testid="body-venue">FRESH empty venue</div>,
        })}
      />,
    );

    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(sheet()).toHaveAccessibleName(CREW_SECTION_LABELS.venue);
    expect(within(sheet()!).getByText("FRESH empty venue")).toBeInTheDocument();
    expect(backSpy).not.toHaveBeenCalled();
    expect(pushSpy.mock.calls.length).toBe(pushes);
    expect(replaceSpy.mock.calls.length).toBe(replaces);
  });

  it("compound: a refresh that replaced the pushed entry's state with Next's alone gets the marker back", () => {
    const { rerender } = render(refreshed(false));
    fireEvent.click(row("crew"));
    expect(window.history.state).toMatchObject({ crewSheet: true });
    // What Next's HistoryUpdater does after a refresh: the entry's state becomes
    // Next's own, custom keys gone (preserveCustomHistoryState is false for it).
    setLocation(`?s=crew`, { __NA: true });

    rerender(refreshed(false, { crew: <div data-testid="body-crew">FRESH crew</div> }));

    expect(window.history.state).toMatchObject({ crewSheet: true });
    expect(sheet()).toHaveAttribute("data-section", "crew");
    // So the close still goes back to the home entry beneath.
    fireEvent.click(closeButton("crew"));
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("compound: crossing from wide into compact opens no sheet and replaces s and the marker away", () => {
    let wide = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        get matches() {
          return query.includes("prefers-reduced-motion") ? false : wide;
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      })),
    );
    nav.searchParams = new URLSearchParams("s=venue");
    setLocation("?s=venue", { crewSheet: true });
    render(
      <CrewSections initialSection="venue" sections={entries(false)} sectionNodes={nodes(false)} />,
    );
    expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
    expect(sheet()).toBeNull();

    wide = false;
    act(() => {
      for (const cb of listeners) cb();
    });

    expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "compact");
    expect(sheet(), "no sheet opens on the way into compact").toBeNull();
    const [state, , url] = replaceSpy.mock.calls.at(-1)!;
    expect(url).toBe(PATH);
    expect(state).toEqual({});
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });
});

/**
 * PR B plan decision 1, rules c to e: the controller opens exactly the ids that
 * have a body, whether or not the list shows them. PR B's first such id is a
 * content-less Agenda, entitled and unlisted (Task 10); fixture nodes stand in
 * for it here. `UNLISTED` has a body and no list row; `BODILESS` has a list row
 * and no body, the shape of a section the viewer is not entitled to.
 */
describe("CrewSections opens the ids that have a body (plan decision 1)", () => {
  const UNLISTED: CrewSectionId = "venue";
  const BODILESS: CrewSectionId = "rooms";

  function listed(): CrewSectionEntry[] {
    return entries(false).filter((e) => e.id !== UNLISTED);
  }

  function bodies(over: Partial<Record<SectionId, ReactNode>> = {}) {
    const n = nodes(false, over);
    delete n[BODILESS];
    return n;
  }

  function renderSplit(
    initialSection: SectionId = "today",
    opts: { over?: Partial<Record<SectionId, ReactNode>>; extra?: ReactNode } = {},
  ) {
    const sections = listed();
    const sectionNodes = bodies(opts.over);
    premiseHolds(
      "the fixture splits the list from the bodies both ways",
      !sections.some((s) => s.id === UNLISTED) &&
        Object.hasOwn(sectionNodes, UNLISTED) &&
        sections.some((s) => s.id === BODILESS) &&
        !Object.hasOwn(sectionNodes, BODILESS),
    );
    return render(
      <CrewSections initialSection={initialSection} sections={sections} sectionNodes={sectionNodes}>
        {opts.extra}
      </CrewSections>,
    );
  }

  /** The `data-section` values inside an element (list rows, nav items, stacked sections). */
  function sectionIds(root: HTMLElement): string[] {
    return [...root.querySelectorAll("[data-section]")].map(
      (el) => el.getAttribute("data-section")!,
    );
  }

  it("decision 1: an id with a body and no list row opens from initialSection, and shows in no list, nav or stack", () => {
    renderSplit(UNLISTED);
    expect(sheet()).toHaveAttribute("data-section", UNLISTED);
    expect(sheet()).toHaveAccessibleName(CREW_SECTION_LABELS[UNLISTED]);
    const list = sectionIds(screen.getByTestId("crew-all-sections"));
    premise("list rows", list.length, 0);
    expect(list).not.toContain(UNLISTED);
    cleanup();

    stubMatchMedia({ wide: true, reduced: false });
    renderSplit();
    const navIds = sectionIds(screen.getByTestId("crew-wide-nav"));
    const stackIds = sectionIds(screen.getByTestId("crew-wide-stack"));
    premise("nav items", navIds.length, 0);
    premise("stacked sections", stackIds.length, 0);
    expect(navIds).not.toContain(UNLISTED);
    expect(stackIds).not.toContain(UNLISTED);
  });

  it("decision 1: a legacy alias opens the id that replaced it, from initialSection, popstate and a link, and popstate keeps the alias", () => {
    const aliases = Object.entries(LEGACY_SECTION_ALIASES);
    premise("legacy aliases", aliases.length, 0);
    premiseHolds(
      "the aliases hold gear (PR C Task 8)",
      Object.hasOwn(LEGACY_SECTION_ALIASES, "gear"),
    );
    for (const [alias, id] of aliases) {
      const first = renderController(alias as SectionId, { billing: true });
      expect(sheet(), `initialSection ${alias}`).toHaveAttribute("data-section", id);
      first.unmount();

      const second = renderController("today", { billing: true });
      replaceSpy.mockClear();
      popTo(`?s=${alias}`, { crewSheet: true });
      expect(sheet(), `popstate ${alias}`).toHaveAttribute("data-section", id);
      expect(replaceSpy, "an alias the viewer may open is not stripped").not.toHaveBeenCalled();
      second.unmount();

      setLocation("");
      pushSpy.mockClear();
      renderController("today", {
        billing: true,
        extra: (
          <div onClick={(e) => e.preventDefault()}>
            <a href={`${PATH}?s=${alias}`}>Alias link</a>
          </div>
        ),
      });
      fireEvent.click(screen.getByRole("link", { name: "Alias link" }));
      expect(sheet(), `link ${alias}`).toHaveAttribute("data-section", id);
      const [, , url] = pushSpy.mock.calls.at(-1)!;
      expect(url, "the pushed entry carries the current id").toBe(
        buildSectionHref(PATH, nav.searchParams, id as CrewSectionId),
      );
      cleanup();
    }
  });

  it("decision 1: an id listed with no body does not open from initialSection", () => {
    renderSplit(BODILESS);
    expect(sheet()).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(backSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("decision 1: popstate to an id with a body opens it; to a listed id with no body replaces s away", async () => {
    const first = renderSplit();
    replaceSpy.mockClear();
    popTo(`?s=${UNLISTED}`, { crewSheet: true });
    expect(sheet()).toHaveAttribute("data-section", UNLISTED);
    expect(replaceSpy, "an openable s is not stripped").not.toHaveBeenCalled();
    first.unmount();

    renderSplit();
    replaceSpy.mockClear();
    popTo(`?s=${BODILESS}`);
    await waitFor(() => expect(sheet()).toBeNull());
    const [, , url] = replaceSpy.mock.calls.at(-1)!;
    expect(url).toBe(PATH);
  });

  it("decision 1: a link to an id with a body opens in place; a link to a listed id with no body goes to the server", () => {
    // Records whether the controller's capture handler took the click, then
    // keeps jsdom from navigating.
    const prevented: boolean[] = [];
    renderSplit("today", {
      extra: (
        <div
          onClick={(e) => {
            prevented.push(e.defaultPrevented);
            e.preventDefault();
          }}
        >
          <a href={`${PATH}?s=${UNLISTED}`}>Unlisted link</a>
          <a href={`${PATH}?s=${BODILESS}`}>Bodiless link</a>
        </div>
      ),
    });

    fireEvent.click(screen.getByRole("link", { name: "Bodiless link" }));
    expect(prevented).toEqual([false]);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Unlisted link" }));
    expect(prevented).toEqual([false, true]);
    expect(sheet()).toHaveAttribute("data-section", UNLISTED);
    const [state, , url] = pushSpy.mock.calls.at(-1)!;
    expect(state).toMatchObject({ crewSheet: true });
    expect(url).toBe(buildSectionHref(PATH, nav.searchParams, UNLISTED));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("decision 1: openSectionAndReveal opens an id with a body and reveals the line; a listed id with no body opens nothing", async () => {
    function SearchResults() {
      const { openSectionAndReveal } = useSectionController();
      return (
        <>
          <button type="button" onClick={() => openSectionAndReveal(BODILESS, "gear-case")}>
            Bodiless result
          </button>
          <button type="button" onClick={() => openSectionAndReveal(UNLISTED, "venue-dock")}>
            Unlisted result
          </button>
        </>
      );
    }
    renderSplit("today", {
      over: { [UNLISTED]: body(UNLISTED, <p data-search-target="venue-dock">Dock door 3</p>) },
      extra: <SearchResults />,
    });

    fireEvent.click(screen.getByRole("button", { name: "Bodiless result" }));
    expect(sheet()).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unlisted result" }));
    expect(sheet()).toHaveAttribute("data-section", UNLISTED);
    const el = within(sheet()!).getByText("Dock door 3");
    await waitFor(() => expect(el).toHaveAttribute("data-search-reveal"));
  });

  it("decision 1 rule d: a wide landing is a stacked section's top less its scroll margin, else the page top with the spy on Today", () => {
    stubMatchMedia({ wide: true, reduced: false });
    renderSplit("today", { extra: <a href={`${PATH}?s=${UNLISTED}`}>Unlisted link</a> });
    const root = screen.getByTestId("crew-shell-sections");
    const section = screen.getByTestId("body-crew").closest<HTMLElement>("[data-section]")!;
    section.getBoundingClientRect = () => ({ top: 640, height: 400 }) as DOMRect;
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) =>
      el === section ? ({ scrollMarginTop: "24px" } as CSSStyleDeclaration) : computed(el, pseudo),
    );

    fireEvent.click(
      within(screen.getByTestId("crew-wide-nav")).getByRole("link", { name: "Crew" }),
    );
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 640 - 24, behavior: "smooth" });
    expect(root).toHaveAttribute("data-active-section", "crew");

    fireEvent.click(screen.getByRole("link", { name: "Unlisted link" }));
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    expect(root).toHaveAttribute("data-active-section", "today");
    expect(replaceSpy.mock.calls.at(-1)![2]).toBe(
      buildSectionHref(PATH, nav.searchParams, UNLISTED),
    );
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("decision 1 rule d: crossing into wide with a sheet open on a section with no stacked element scrolls to the top", () => {
    let wide = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        get matches() {
          return query.includes("prefers-reduced-motion") ? false : wide;
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      })),
    );
    const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 900 });
    try {
      nav.searchParams = new URLSearchParams(`s=${UNLISTED}`);
      setLocation(`?s=${UNLISTED}`, { crewSheet: true });
      renderSplit(UNLISTED);
      expect(sheet()).toHaveAttribute("data-section", UNLISTED);
      scrollToSpy.mockClear();

      wide = true;
      act(() => {
        for (const cb of listeners) cb();
      });

      expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
      expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
      expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-active-section",
        "today",
      );
    } finally {
      if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
      else delete (window as { scrollY?: number }).scrollY;
    }
  });

  it("decision 1 rule e: closing a sheet on a section with no list row focuses the Today block, never <body>", async () => {
    nav.searchParams = new URLSearchParams(`s=${UNLISTED}`);
    setLocation(`?s=${UNLISTED}`);
    renderSplit(UNLISTED);
    expect(sheet()).toHaveAttribute("data-section", UNLISTED);
    fireEvent.click(closeButton(UNLISTED));
    await waitFor(() => expect(sheet()).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("crew-today-block"));
  });

  it("decision 1 rule e: a listed section's sheet leaving with its row (a crossing into wide) never sends focus or the page to the Today block", async () => {
    // Wide unmounts the list with the sheet, so the row is gone though the
    // section is listed. The Today fallback is for a section with no row at
    // all: here it would scroll the page back up past the section the crossing
    // just landed on.
    const intoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: intoView,
    });
    let wide = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        get matches() {
          return query.includes("prefers-reduced-motion") ? true : wide;
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      })),
    );
    try {
      nav.searchParams = new URLSearchParams("s=crew");
      setLocation("?s=crew", { crewSheet: true });
      renderSplit("crew");
      expect(sheet()).toHaveAttribute("data-section", "crew");

      wide = true;
      act(() => {
        for (const cb of listeners) cb();
      });
      expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
      await nextFrame();
      await nextFrame();

      expect(document.activeElement).not.toBe(screen.getByTestId("crew-today-block"));
      expect(intoView).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

describe("CrewSections client props (harness rule: Client props)", () => {
  const SHOW_DAYS = ["2026-11-03", "2026-11-04"];
  const DATES = {
    travelIn: "2026-11-01",
    set: "2026-11-02",
    showDays: SHOW_DAYS,
    travelOut: "2026-11-05",
  };

  function show(): ShowForViewer {
    const member = (id: string, over: object = {}) => ({
      id,
      name: id,
      email: null,
      phone: null,
      role: "",
      roleFlags: [],
      dateRestriction: { kind: "none" as const },
      stageRestriction: { kind: "none" as const },
      ...over,
    });
    return makeShowForViewer({
      crewMembers: [
        member("c-plain"),
        member("c-suppressed", { dateRestriction: { kind: "unknown_asterisk", days: null } }),
      ],
      show: { venue: { name: "Grand Hall", address: "1 Plaza Way" }, dates: DATES },
      hotelReservations: [
        {
          ordinal: 1,
          hotel_name: "Harbor Inn",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: DATES.travelIn,
          check_out: DATES.travelOut,
          notes: null,
        },
      ],
      transportation: {
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
        schedule: [
          { stage: "Arrival", date: DATES.travelIn, time: "2:00 PM", assigned_names: [] },
          { stage: "Load Out", date: DATES.travelOut, time: "9:00 AM", assigned_names: [] },
        ],
        notes: null,
      },
    });
  }

  function project(viewer: Viewer): ShowForViewer {
    const base = show();
    return viewer.kind === "admin"
      ? { ...base, viewerId: null, viewerName: null, viewerNameAliases: [] }
      : {
          ...base,
          viewerId: viewer.crewMemberId,
          viewerName: viewer.crewMemberId,
          viewerNameAliases: [viewer.crewMemberId],
        };
  }

  /** The props the shell hands the controller's list, serialized as the RSC payload carries them. */
  function propsFor(viewer: Viewer): string {
    const data = project(viewer);
    const ctx = resolveViewerContext(viewer, data);
    return JSON.stringify(
      crewSectionEntries(data, { ...ctx, today: new Date(`${DATES.set}T17:00:00Z`) }),
    );
  }

  it("sheet: the list's props carry no date for a suppressed viewer and no transport value for an excluded one", () => {
    const needles = [DATES.travelIn, DATES.set, ...SHOW_DAYS, DATES.travelOut].flatMap((iso) => [
      iso,
      formatIsoDate(iso, "short"),
    ]);

    const suppressed: Viewer = { kind: "crew", crewMemberId: "c-suppressed" };
    expect(
      suppressesDates(resolveViewerContext(suppressed, project(suppressed)).dateRestriction),
    ).toBe(true);
    const s = propsFor(suppressed);
    for (const n of needles) expect(s, n).not.toContain(n);
    expect(s).not.toContain("Harbor Inn");

    // The plain crew member is outside the transport gate: no ride count reaches the list.
    const plain: Viewer = { kind: "crew", crewMemberId: "c-plain" };
    const plainData = project(plain);
    expect(
      transportTileVisible({
        transportation: plainData.transportation,
        viewerId: plainData.viewerId,
        transportationOwnerIds: plainData.transportationOwnerIds,
        viewerName: plainData.viewerName,
        viewerNameAliases: plainData.viewerNameAliases,
        isAdmin: false,
      }),
    ).toBe(false);
    expect(propsFor(plain)).not.toMatch(/\brides?\b/);

    // Positive control: the admin, whom neither gate excludes, gets both.
    const a = propsFor({ kind: "admin" });
    expect(a).toContain(formatIsoDate(SHOW_DAYS[0]!, "short"));
    expect(a).toContain("Harbor Inn");
    expect(a).toMatch(/\brides?\b/);
  });
});

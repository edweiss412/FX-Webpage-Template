// @vitest-environment jsdom
/**
 * tests/components/crew/CrewSections.search.test.tsx (crew show search, Task 16;
 * migrated to the crew page redesign's controller on the merge of the two arcs)
 *
 * The section controller under search (search spec §6.2, §6.6, §6.8, §9.1;
 * redesign spec §1.2, §5.2, §5.3):
 * - while search is active, the wide nav and the page body carry `hidden` and
 *   the results slot renders in their place; ending search un-hides them, and an
 *   open `<details>` in the body is still open (the body was hidden, never
 *   unmounted). Both layouts.
 * - `useSectionController().openSectionAndReveal(section, id)`: compact opens
 *   that section's sheet (the §5.2 push with the `crewSheet` marker) and centres
 *   the line inside the sheet body; wide replaces `s`, never pushes, and scrolls
 *   the page to the line. Both wait for the target to mount, open every
 *   `<details>` around AND inside it, focus it and set `data-search-reveal`.
 * - a target that never mounts is announced after 1500 ms, in a status region
 *   the sheet's inert sweep leaves live; the highlight clears after 1600 ms, or
 *   after 2000 ms under reduced motion, where the stylesheet holds the tint
 *   without animating.
 *
 * Every duration is typed here from the spec, never imported from the
 * component, so a constant that drifts fails.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { CrewSections, useSectionController } from "@/components/crew/CrewSections";
import { CrewSearchField } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider } from "@/components/crew/search/CrewSearchProvider";
import { CREW_SECTION_LABELS, type CrewSectionEntry } from "@/lib/crew/crewSections";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { FIXTURE_INDEX } from "../../search/_fixtureIndex";

const PATH = "/show/spring-gala/tok123";

const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

type Mode = "compact" | "wide";

function stubMatchMedia({ mode, reduced }: { mode: Mode; reduced: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reduced
        : query.includes("min-width: 1024px")
          ? mode === "wide"
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

let pushStateSpy: ReturnType<typeof vi.spyOn>;
let replaceStateSpy: ReturnType<typeof vi.spyOn>;
let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  nav.searchParams = new URLSearchParams();
  History.prototype.replaceState.call(window.history, null, "", PATH);
  stubMatchMedia({ mode: "compact", reduced: false });
  pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

/** The controller, captured from inside the CrewSections tree. */
const controllerRef: { current: ReturnType<typeof useSectionController> | null } = {
  current: null,
};
function Capture() {
  const controller = useSectionController();
  useEffect(() => {
    controllerRef.current = controller;
  });
  return null;
}

const VENUE_TARGET = "venue:venue-facilities:k3x9";
const TODAY_TARGET = "today:today-notes:p01";

function entries(): CrewSectionEntry[] {
  return (["schedule", "venue", "travel", "crew", "gear"] as const).map((id) => ({
    id,
    label: CREW_SECTION_LABELS[id],
    peek: null,
  }));
}

function nodes(): Partial<Record<SectionId, ReactNode>> {
  return {
    today: (
      <div data-testid="body-today">
        <Capture />
        <details data-testid="today-details">
          <summary>More</summary>
          folded text
        </details>
        <p data-search-target={TODAY_TARGET} data-testid="today-target">
          Stage left door sticks
        </p>
      </div>
    ),
    venue: (
      <div data-testid="body-venue">
        <Capture />
        <details data-testid="outer-details">
          <summary>Facilities</summary>
          <div data-search-target={VENUE_TARGET} data-testid="venue-target">
            Wi-Fi password ORDTG.
            <details data-testid="inner-details">
              <summary>Full note</summary>
              the full note
            </details>
          </div>
        </details>
      </div>
    ),
    schedule: <div data-testid="body-schedule">schedule</div>,
    travel: <div data-testid="body-travel">travel</div>,
    crew: <div data-testid="body-crew">crew</div>,
    gear: <div data-testid="body-gear">gear</div>,
  };
}

function renderShell(
  initialSection: SectionId = "today",
  over: Partial<Record<SectionId, ReactNode>> = {},
) {
  render(
    <CrewSearchProvider
      slug="spring-gala"
      index={FIXTURE_INDEX}
      missLogging={false}
      showId="show-1"
      cardReport={null}
    >
      <CrewSearchField />
      <CrewSections
        initialSection={initialSection}
        sections={entries()}
        sectionNodes={{ ...nodes(), ...over }}
      />
    </CrewSearchProvider>,
  );
}

const REVEAL_GONE = "That line isn't on the page anymore.";

/**
 * Frames on the timer clock, so a test can step them under fake timers. The
 * real-timer cases use it too: jsdom's own frame loop runs on a timer, and a
 * fake-timer case in this file leaves that loop parked on the fake clock, so a
 * later case waiting on jsdom's frames would wait on a frame that never comes.
 */
function frameOnTimers() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
}

function searchBox(): HTMLElement {
  return screen.getByRole("searchbox", { name: "Search this show" });
}

/** The open sheet's dialog, or null. */
function sheet(): HTMLElement | null {
  return screen.queryByRole("dialog");
}

/** The wide layout's stacked section for an id. */
function wideSection(id: SectionId): HTMLElement {
  return screen
    .getByTestId("crew-wide-stack")
    .querySelector<HTMLElement>(`[data-section="${id}"]`)!;
}

describe.each(["compact", "wide"] as const)("CrewSections while search is active (%s)", (mode) => {
  beforeEach(() => stubMatchMedia({ mode, reduced: false }));

  it("hides the section nav and the body, renders the results slot, and keeps body state", () => {
    renderShell();
    const body = screen.getByTestId("page-container");
    const details = screen.getByTestId("today-details") as HTMLDetailsElement;
    details.open = true;
    expect(body).not.toHaveAttribute("hidden");
    expect(screen.queryByTestId("crew-search-panel")).toBeNull();
    // Premise: the layout's section navigation is on the page before search starts.
    const sectionNav =
      mode === "wide"
        ? screen.getByTestId("crew-wide-nav")
        : screen.getByTestId("crew-all-sections");
    expect(sectionNav.closest("[hidden]")).toBeNull();

    // Search starts on the first typed character (one character is the Hint
    // state), never on focus alone (WCAG 3.2.1; the next case).
    fireEvent.change(searchBox(), { target: { value: "w" } });

    expect(body).toHaveAttribute("hidden");
    expect(sectionNav.closest("[hidden]")).not.toBeNull();
    const panel = screen.getByTestId("crew-search-panel");
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel.closest("[hidden]")).toBeNull();
    expect(panel).toHaveTextContent("Search Wi-Fi, the dock, rooms, gear, people and more.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("crew-search-panel")).toBeNull();
    expect(screen.getByTestId("page-container")).toBe(body);
    expect(body).not.toHaveAttribute("hidden");
    expect(sectionNav.closest("[hidden]")).toBeNull();
    // Hidden, never unmounted: the same element, still open.
    expect(screen.getByTestId("today-details")).toBe(details);
    expect(details.open).toBe(true);
  });

  // Impeccable audit U1 (WCAG 3.2.1 On Focus): tabbing or tapping into the field
  // must not hide the page.
  it("while the field only has focus, keeps the nav and the body visible and renders no results slot", () => {
    renderShell();
    const input = searchBox();
    act(() => input.focus());
    fireEvent.focus(input);
    fireEvent.click(input);

    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId("page-container")).not.toHaveAttribute("hidden");
    if (mode === "wide") expect(screen.getByTestId("crew-wide-nav")).not.toHaveAttribute("hidden");
    expect(screen.queryByTestId("crew-search-panel")).toBeNull();
  });
});

describe("openSectionAndReveal, compact: the section's sheet", () => {
  it("pushes the sheet entry, then opens, centres inside the sheet body, focuses and marks the target", async () => {
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    const [state, , url] = pushStateSpy.mock.calls[0]!;
    expect(state).toMatchObject({ crewSheet: true });
    expect(url).toBe(buildSectionHref(PATH, nav.searchParams, "venue"));
    expect(sheet()).toHaveAttribute("data-section", "venue");

    const sheetBody = screen.getByTestId("crew-section-sheet-body");
    const target = within(sheetBody).getByTestId("venue-target");
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
    target.getBoundingClientRect = () => ({ top: 500, height: 20 }) as DOMRect;

    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect((screen.getByTestId("outer-details") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByTestId("inner-details") as HTMLDetailsElement).open).toBe(true);
    // Centred inside the body: 0 + (500 - 100) - (300 - 20) / 2.
    expect(scrollTop).toBe(260);
    expect(scrollToSpy, "the page behind the sheet does not scroll").not.toHaveBeenCalled();
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(target);
  });

  it("reveals a Today line on the home without pushing a history entry", async () => {
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("today", TODAY_TARGET));
    const target = screen.getByTestId("today-target");
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(target);
  });

  it("does not take a natively focusable target out of the tab order", async () => {
    frameOnTimers();
    const button = (
      <div data-testid="body-today">
        <Capture />
        <button type="button" data-search-target={TODAY_TARGET} data-testid="button-target">
          Grand Ballroom floor plan
        </button>
      </div>
    );
    renderShell("today", { today: button });
    act(() => controllerRef.current!.openSectionAndReveal("today", TODAY_TARGET));
    const target = screen.getByTestId("button-target");
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect(target).not.toHaveAttribute("tabindex");
    expect(document.activeElement).toBe(target);
  });

  it("announces a gone line over the open sheet, from a status region the sheet leaves live", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    fireEvent.change(searchBox(), { target: { value: "ordtg" } });
    const row = screen.getByTestId("crew-search-row-open");
    act(() => row.focus());
    fireEvent.click(row);
    // Premise: the result opened the sheet, and the tapped line is not in it.
    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(
      screen.getByTestId("crew-section-sheet-body").querySelector("[data-search-reveal]"),
    ).toBeNull();

    const status = screen.getByTestId("crew-reveal-status");
    // Premise: the sheet's inert sweep ran (the page body behind it is inert).
    expect(screen.getByTestId("page-container").closest("[inert]")).not.toBeNull();
    expect(status.closest("[inert]"), "an inert live region is never announced").toBeNull();

    act(() => vi.advanceTimersByTime(1499));
    expect(status).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(1));
    expect(status).toHaveTextContent(REVEAL_GONE);
    // Focus never fell to the page: the sheet took it on open (redesign spec §5.2).
    expect(sheet()!.contains(document.activeElement)).toBe(true);
  });
});

describe("openSectionAndReveal, wide: the page scrolls to the line", () => {
  beforeEach(() => stubMatchMedia({ mode: "wide", reduced: false }));

  it("replaces s (never pushes), scrolls the page to the target, opens, focuses and marks it", async () => {
    frameOnTimers();
    renderShell("today");
    const target = within(wideSection("venue")).getByTestId("venue-target");
    target.getBoundingClientRect = () => ({ top: 1500, height: 20 }) as DOMRect;
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      buildSectionHref(PATH, nav.searchParams, "venue"),
    );
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect((screen.getByTestId("outer-details") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByTestId("inner-details") as HTMLDetailsElement).open).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1500, behavior: "smooth" });
    expect(sheet()).toBeNull();
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(target);
    expect(
      screen.getByTestId("crew-wide-nav").querySelector('[data-section="venue"]'),
    ).toHaveAttribute("aria-current", "true");
  });

  // Whole-diff review round 2, 2A-3: a Today reveal wrote no history in wide, so
  // the previous section's `s` stayed in the URL and a reload went back there.
  it("Venue then Today: each reveal replaces the URL once (never pushes), and Today's leaves it at home with Next's keys left out", async () => {
    frameOnTimers();
    const NEXT_KEYS = ["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"];
    const NEXT_STATE = { __NA: true, _N: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: {} };
    // The entry as Next leaves it: its own keys plus one of the page's.
    History.prototype.replaceState.call(window.history, { ...NEXT_STATE, keep: "x" }, "", PATH);
    // Writes land, with Next's keys copied back as its patched method does, so
    // each reveal reads the entry the one before it left.
    replaceStateSpy.mockImplementation(
      (state: unknown, unused: string, url?: string | URL | null) =>
        History.prototype.replaceState.call(
          window.history,
          { ...(state as object), ...NEXT_STATE },
          unused,
          url,
        ),
    );
    renderShell("today");

    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    await waitFor(() =>
      expect(within(wideSection("venue")).getByTestId("venue-target")).toHaveAttribute(
        "data-search-reveal",
      ),
    );
    // PREMISE: the Venue reveal put `s` in the URL, so there is something to leave.
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get("s")).toBe("venue");

    act(() => controllerRef.current!.openSectionAndReveal("today", TODAY_TARGET));
    await waitFor(() =>
      expect(screen.getByTestId("today-target")).toHaveAttribute("data-search-reveal"),
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledTimes(2);
    const [state, , url] = replaceStateSpy.mock.calls[1]!;
    expect(url).toBe(PATH);
    expect(new URLSearchParams(window.location.search).has("s")).toBe(false);
    for (const key of NEXT_KEYS) expect(state as Record<string, unknown>).not.toHaveProperty(key);
    expect(state).toEqual({ keep: "x" });
  });

  it("announces a target that never mounts after 1500 ms, and stops looking", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", "venue:venue-facilities:gone"));
    const status = screen.getByTestId("crew-reveal-status");
    expect(status).toHaveAttribute("role", "status");

    act(() => vi.advanceTimersByTime(1499));
    expect(status).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(1));
    expect(status).toHaveTextContent(REVEAL_GONE);
    // The frame loop ended with the wait: nothing is left scheduled. Focus moved to the body
    // (spec §6.8), and jsdom's focus() queues a selectionchange task with a zero delay, which the
    // fake clock runs after 1 ms, as Node does. A frame the loop left pending is 16 ms out, so a
    // 1 ms tick does not run it and it still counts here.
    act(() => vi.advanceTimersByTime(1));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a tapped result whose line is gone moves focus to the opened section after the wait", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    fireEvent.change(searchBox(), { target: { value: "ordtg" } });
    const row = screen.getByTestId("crew-search-row-open");
    act(() => row.focus());
    fireEvent.click(row);
    // Premise: the tapped row went with the search panel, and its line is not in the page.
    expect(row.isConnected).toBe(false);
    expect(screen.getByTestId("page-container").querySelector("[data-search-reveal]")).toBeNull();

    act(() => vi.advanceTimersByTime(1499));
    expect(document.activeElement).toBe(document.body);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent(REVEAL_GONE);
    const section = wideSection("venue");
    expect(document.activeElement).toBe(section);
    expect(section).toHaveAttribute("tabindex", "-1");
  });

  it("the gone-line fallback never takes focus from something the viewer moved to", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    const input = searchBox();
    fireEvent.change(input, { target: { value: "ordtg" } });
    const row = screen.getByTestId("crew-search-row-open");
    act(() => row.focus());
    fireEvent.click(row);
    act(() => vi.advanceTimersByTime(500));
    act(() => input.focus());

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent(REVEAL_GONE);
    expect(document.activeElement).toBe(input);
    expect(wideSection("venue")).not.toHaveAttribute("tabindex");
  });

  it("a new reveal replaces a pending one, so the first never announces", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", "venue:venue-facilities:gone"));
    act(() => vi.advanceTimersByTime(800));
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    act(() => vi.advanceTimersByTime(16));
    expect(within(wideSection("venue")).getByTestId("venue-target")).toHaveAttribute(
      "data-search-reveal",
    );
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent("");
  });

  it("clears the highlight 1600 ms after it is set", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    const target = within(wideSection("venue")).getByTestId("venue-target");
    act(() => vi.advanceTimersByTime(16));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1599));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1));
    expect(target).not.toHaveAttribute("data-search-reveal");
  });

  it("under reduced motion, holds the highlight for 2000 ms", () => {
    stubMatchMedia({ mode: "wide", reduced: true });
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    const target = within(wideSection("venue")).getByTestId("venue-target");
    act(() => vi.advanceTimersByTime(16));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1999));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1));
    expect(target).not.toHaveAttribute("data-search-reveal");
  });
});

describe("the [data-search-reveal] stylesheet rules (app/globals.css)", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  function rulesFor(selector: string, source: string): string[] {
    const escaped = selector.replace(/[[\]]/g, "\\$&");
    return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]!);
  }

  it("fades a tint over 1600 ms when motion is allowed", () => {
    const keyframes = css.match(/@keyframes search-reveal-flash\s*\{[\s\S]*?\n\}/);
    expect(keyframes?.[0]).toContain("var(--color-warning-bg)");
    expect(rulesFor("[data-search-reveal]", css)[0]).toMatch(
      /animation:\s*search-reveal-flash 1600ms/,
    );
  });

  it("holds the tint without animating under reduced motion", () => {
    const reduced = [
      ...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g),
    ]
      .map((m) => m[1]!)
      .find((block) => block.includes("[data-search-reveal]"));
    expect(reduced).toBeDefined();
    const rule = rulesFor("[data-search-reveal]", reduced!)[0]!;
    expect(rule).toMatch(/animation:\s*none/);
    expect(rule).toMatch(/background-color:\s*var\(--color-warning-bg\)/);
  });
});

describe("useSectionController", () => {
  it("throws outside CrewSections, naming the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/CrewSections/);
  });
});

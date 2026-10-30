// @vitest-environment jsdom
/**
 * tests/components/crew/CrewSections.search.test.tsx (crew show search, Task 16)
 *
 * The section controller under search (spec §6.2, §6.6, §9.1):
 * - while search is active, the sub-nav and the section body carry `hidden` and
 *   the results slot renders in their place; ending search un-hides them, and an
 *   open `<details>` in the body is still open (the body was hidden, never
 *   unmounted);
 * - `useSectionController().openSectionAndReveal(section, id)` switches the
 *   section the way a tab tap does (shallow pushState to the section href), waits
 *   for the target to mount, opens every `<details>` around AND inside it,
 *   scrolls it to centre, focuses it and sets `data-search-reveal`;
 * - a target that never mounts is announced after 1500 ms; the highlight clears
 *   after 1600 ms, or after 2000 ms under reduced motion, where the stylesheet
 *   holds the tint without animating.
 *
 * Every duration is typed here from the spec, never imported from the
 * component, so a constant that drifts fails.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CrewSections, useSectionController } from "@/components/crew/CrewSections";
import { CrewSearchField } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider } from "@/components/crew/search/CrewSearchProvider";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { FIXTURE_INDEX } from "../../search/_fixtureIndex";

const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduced,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

let pushStateSpy: ReturnType<typeof vi.spyOn>;
let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nav.searchParams = new URLSearchParams();
  stubMatchMedia(false);
  pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
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

function renderShell(initialSection: SectionId = "today") {
  render(
    <CrewSearchProvider
      slug="spring-gala"
      index={FIXTURE_INDEX}
      missLogging={false}
      showId="show-1"
      cardReport={null}
    >
      <CrewSearchField />
      <CrewSections initialSection={initialSection} budgetVisible={false} sectionNodes={nodes()} />
    </CrewSearchProvider>,
  );
}

const REVEAL_GONE = "That line isn't on the page anymore.";

/** Frames on the (fake) timer clock, so a test can step them. */
function frameOnTimers() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
}

describe("CrewSections while search is active", () => {
  it("hides the sub-nav and the body, renders the results slot, and keeps body state", () => {
    renderShell();
    const body = screen.getByTestId("page-container");
    const details = screen.getByTestId("today-details") as HTMLDetailsElement;
    details.open = true;
    expect(body).not.toHaveAttribute("hidden");
    expect(screen.queryByTestId("crew-search-panel")).toBeNull();

    // Search starts on the first typed character (one character is the Hint
    // state), never on focus alone (WCAG 3.2.1; the next case).
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this show" }), {
      target: { value: "w" },
    });

    expect(body).toHaveAttribute("hidden");
    expect(screen.getByTestId("crew-sub-nav").closest("[hidden]")).not.toBeNull();
    const panel = screen.getByTestId("crew-search-panel");
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel).toHaveTextContent("Search Wi-Fi, the dock, rooms, gear, people and more.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("crew-search-panel")).toBeNull();
    expect(screen.getByTestId("page-container")).toBe(body);
    expect(body).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("crew-sub-nav").closest("[hidden]")).toBeNull();
    // Hidden, never unmounted: the same element, still open.
    expect(screen.getByTestId("today-details")).toBe(details);
    expect(details.open).toBe(true);
  });
});

describe("CrewSections while the search field only has focus", () => {
  // Impeccable audit U1 (WCAG 3.2.1 On Focus): tabbing or tapping into the field
  // must not hide the page.
  it("keeps the sub-nav and the body visible and renders no results slot", () => {
    renderShell();
    const input = screen.getByRole("searchbox", { name: "Search this show" });
    act(() => input.focus());
    fireEvent.focus(input);
    fireEvent.click(input);

    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId("page-container")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("crew-sub-nav").closest("[hidden]")).toBeNull();
    expect(screen.queryByTestId("crew-search-panel")).toBeNull();
  });
});

describe("openSectionAndReveal", () => {
  it("switches section with a shallow pushState, then opens, scrolls, focuses and marks the target", async () => {
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]![2]).toContain("?s=venue");

    // The venue body mounts only after the outgoing section's exit animation.
    const target = await screen.findByTestId("venue-target");
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect((screen.getByTestId("outer-details") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByTestId("inner-details") as HTMLDetailsElement).open).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(target);
    expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "venue",
    );
  });

  it("reveals in the section already open without pushing a history entry", async () => {
    renderShell("today");
    act(() => controllerRef.current!.openSectionAndReveal("today", TODAY_TARGET));
    const target = screen.getByTestId("today-target");
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
  });

  it("does not take a natively focusable target out of the tab order", async () => {
    const button = (
      <div data-testid="body-today">
        <Capture />
        <button type="button" data-search-target={TODAY_TARGET} data-testid="button-target">
          Grand Ballroom floor plan
        </button>
      </div>
    );
    render(
      <CrewSearchProvider
        slug="spring-gala"
        index={FIXTURE_INDEX}
        missLogging={false}
        showId="show-1"
        cardReport={null}
      >
        <CrewSections
          initialSection="today"
          budgetVisible={false}
          sectionNodes={{ ...nodes(), today: button }}
        />
      </CrewSearchProvider>,
    );
    act(() => controllerRef.current!.openSectionAndReveal("today", TODAY_TARGET));
    const target = screen.getByTestId("button-target");
    await waitFor(() => expect(target).toHaveAttribute("data-search-reveal"));
    expect(target).not.toHaveAttribute("tabindex");
    expect(document.activeElement).toBe(target);
  });

  it("announces a target that never mounts after 1500 ms, and stops looking", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
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

  it("a tapped result whose line is gone moves focus to the opened section's body after the wait", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this show" }), {
      target: { value: "ordtg" },
    });
    const row = screen.getByTestId("crew-search-row-open");
    act(() => row.focus());
    fireEvent.click(row);
    // Premise: the tapped row went with the search panel, and its line is not in the body.
    expect(row.isConnected).toBe(false);
    expect(screen.getByTestId("page-container").querySelector("[data-search-reveal]")).toBeNull();

    act(() => vi.advanceTimersByTime(1499));
    expect(document.activeElement).toBe(document.body);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent(REVEAL_GONE);
    const body = screen.getByTestId("page-container");
    expect(document.activeElement).toBe(body);
    expect(body).toHaveAttribute("tabindex", "-1");
  });

  it("the gone-line fallback never takes focus from something the viewer moved to", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
    const input = screen.getByRole("searchbox", { name: "Search this show" });
    fireEvent.change(input, { target: { value: "ordtg" } });
    const row = screen.getByTestId("crew-search-row-open");
    act(() => row.focus());
    fireEvent.click(row);
    act(() => vi.advanceTimersByTime(500));
    act(() => input.focus());

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent(REVEAL_GONE);
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId("page-container")).not.toHaveAttribute("tabindex");
  });

  it("a new reveal replaces a pending one, so the first never announces", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
    act(() => controllerRef.current!.openSectionAndReveal("venue", "venue:venue-facilities:gone"));
    act(() => vi.advanceTimersByTime(800));
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    act(() => vi.advanceTimersByTime(16));
    expect(screen.getByTestId("venue-target")).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByTestId("crew-reveal-status")).toHaveTextContent("");
  });

  it("clears the highlight 1600 ms after it is set", () => {
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    const target = screen.getByTestId("venue-target");
    act(() => vi.advanceTimersByTime(16));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1599));
    expect(target).toHaveAttribute("data-search-reveal");
    act(() => vi.advanceTimersByTime(1));
    expect(target).not.toHaveAttribute("data-search-reveal");
  });

  it("under reduced motion, holds the highlight for 2000 ms", () => {
    stubMatchMedia(true);
    vi.useFakeTimers();
    frameOnTimers();
    renderShell("venue");
    act(() => controllerRef.current!.openSectionAndReveal("venue", VENUE_TARGET));
    const target = screen.getByTestId("venue-target");
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

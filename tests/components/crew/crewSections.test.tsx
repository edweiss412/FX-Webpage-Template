// @vitest-environment jsdom
/**
 * tests/components/crew/crewSections.test.tsx — the CrewSections client
 * controller (client-section-toggle).
 *
 * CrewSections owns `activeSection` client state over SERVER-RENDERED section
 * bodies (`sectionNodes`). It toggles VISIBILITY only — it never fetches,
 * derives, or caches section data. The freshness invariant (NON-NEGOTIABLE) is
 * that section content always flows from the `sectionNodes` prop; a
 * `router.refresh()`-style re-render with NEW `sectionNodes` shows the new
 * content while `active` survives.
 *
 * What this pins (cases a–f):
 *   (a) initial render shows the initial section body; data-active-section is set.
 *   (b) tapping a tab swaps the body + sets data-active-section + updates the URL
 *       via history.pushState (?s=<id>) + scrollTo(0,0) — and NEVER router.push
 *       (no server round-trip).
 *   (c) popstate re-reads ?s= and restores the section without a fetch.
 *   (d) a non-entitled section (budgetVisible=false, no budget node) has no
 *       Budget tab; an initial ?s=budget resolves to today.
 *   (e) FRESHNESS: a re-render with NEW sectionNodes shows the new content while
 *       `active` stays put (data flows from the prop, not a client cache).
 *   (f) CLAMP CONSISTENCY: initialSection="budget" with sectionNodes lacking a
 *       budget key → effectiveActive falls back to "today" and the
 *       data-active-section attr, the CrewSubNav active tab (aria-current), AND
 *       the rendered body ALL show "today" together — never a split state.
 */
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { CrewSections } from "@/components/crew/CrewSections";

const routerPush = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
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
let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  routerPush.mockReset();
  nav.pathname = "/show/spring-gala/tok123";
  nav.searchParams = new URLSearchParams();
  stubMatchMedia(false);
  pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function body(id: string): ReactNode {
  return <div data-testid={`body-${id}`}>body {id}</div>;
}

/** All seven entitled bodies (lead). */
function leadNodes(): Partial<Record<SectionId, ReactNode>> {
  return {
    today: body("today"),
    schedule: body("schedule"),
    venue: body("venue"),
    travel: body("travel"),
    crew: body("crew"),
    gear: body("gear"),
    budget: body("budget"),
  };
}

/** The six base bodies (non-lead — no budget). */
function baseNodes(): Partial<Record<SectionId, ReactNode>> {
  const n = leadNodes();
  delete n.budget;
  return n;
}

function controller(): HTMLElement {
  return screen.getByTestId("crew-shell-sections");
}

describe("CrewSections controller", () => {
  it("(a) initial render shows the initial section body and sets data-active-section", () => {
    render(<CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />);
    expect(screen.getByTestId("body-today")).toBeInTheDocument();
    expect(controller()).toHaveAttribute("data-active-section", "today");
    // Only the active body is mounted (AnimatePresence mode="wait").
    expect(screen.queryByTestId("body-schedule")).toBeNull();
  });

  it("(b) tapping a tab swaps the body, updates ?s= via history.pushState + scrollTo, and NEVER router.push", async () => {
    render(<CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />);

    const [scheduleTab] = screen.getAllByRole("button", { name: /schedule/i });
    fireEvent.click(scheduleTab!);

    // Body swapped (AnimatePresence mode="wait" plays the exit, then the enter) +
    // attr updated.
    expect(await screen.findByTestId("body-schedule")).toBeInTheDocument();
    expect(screen.queryByTestId("body-today")).toBeNull();
    expect(controller()).toHaveAttribute("data-active-section", "schedule");

    // Shallow URL via history.pushState — NOT router.push.
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    const url = pushStateSpy.mock.calls[0]![2] as string;
    expect(url).toContain("?s=schedule");
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    // The HARD freshness proof: no server navigation occurred.
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("(b-guard) tapping the already-active tab is a no-op (no pushState, no scroll)", () => {
    render(<CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />);
    const [todayTab] = screen.getAllByRole("button", { name: /today/i });
    fireEvent.click(todayTab!);
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("(c) popstate re-reads ?s= and restores the section without a fetch", async () => {
    render(<CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />);
    // Simulate the browser changing location.search, then firing popstate.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search: "?s=venue" },
    });
    fireEvent.popState(window);

    expect(await screen.findByTestId("body-venue")).toBeInTheDocument();
    expect(controller()).toHaveAttribute("data-active-section", "venue");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("(d) a non-entitled (budgetVisible=false) controller has no Budget tab; initial ?s=budget resolves to today", () => {
    render(
      <CrewSections initialSection="today" budgetVisible={false} sectionNodes={baseNodes()} />,
    );
    expect(screen.queryByRole("button", { name: /budget/i })).toBeNull();
  });

  it("(e) FRESHNESS: a re-render with NEW sectionNodes shows the new content while active stays put", () => {
    const { rerender } = render(
      <CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />,
    );
    expect(screen.getByText("body today")).toBeInTheDocument();

    // Simulate router.refresh(): same active, but the server re-rendered the
    // bodies with fresh content. The controller MUST show the new content
    // (data flows from the prop, not a client cache) and stay on `today`.
    const fresh: Partial<Record<SectionId, ReactNode>> = {
      ...leadNodes(),
      today: <div data-testid="body-today">FRESH today content</div>,
    };
    rerender(<CrewSections initialSection="today" budgetVisible sectionNodes={fresh} />);

    expect(screen.getByText("FRESH today content")).toBeInTheDocument();
    expect(controller()).toHaveAttribute("data-active-section", "today");
    // No client navigation was triggered by the refresh.
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("(f) CLAMP CONSISTENCY: initialSection=budget with no budget node → today everywhere (no split state)", () => {
    // Simulates a refresh that flipped budgetVisible true→false while the viewer
    // was on Budget: initialSection is still "budget" but sectionNodes lacks it.
    render(
      <CrewSections initialSection="budget" budgetVisible={false} sectionNodes={baseNodes()} />,
    );

    // The wrapper attr is today.
    expect(controller()).toHaveAttribute("data-active-section", "today");
    // The rendered body is today (NOT a budget body — there is none).
    expect(screen.getByTestId("body-today")).toBeInTheDocument();
    expect(screen.queryByTestId("body-budget")).toBeNull();
    // The CrewSubNav active tab (aria-current) is today, in BOTH rows.
    const current = screen.getAllByRole("button", { current: "page" });
    expect(current.length).toBeGreaterThan(0);
    for (const el of current) {
      expect(el).toHaveAttribute("data-section", "today");
    }
    // No Budget tab is shown at all (budgetVisible=false).
    expect(screen.queryByRole("button", { name: /budget/i })).toBeNull();
  });

  it("renders the CrewSubNav with both rows (controlled child)", () => {
    render(<CrewSections initialSection="today" budgetVisible sectionNodes={leadNodes()} />);
    const navs = screen.getAllByRole("navigation", { name: "Show sections" });
    expect(navs.length).toBe(2);
    for (const n of navs) {
      expect(within(n).getByRole("button", { name: /budget/i })).toBeTruthy();
    }
  });
});

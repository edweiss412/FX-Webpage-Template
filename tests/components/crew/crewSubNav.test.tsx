// @vitest-environment jsdom
// Task 6 — CrewSubNav (gate-preserving ?s= push) + CrewSectionTransition smoke.
//
// CrewSubNav contract (crew-redesign §sub-nav):
//   • Tabs = BASE_SECTION_IDS (+ "budget" iff budgetVisible).
//   • Activating a tab builds a FRESH URLSearchParams (NOT a clone of all
//     current params): s=<id>, plus gate=<v> ONLY when v ∈ ALLOWED_GATE_VALUES.
//     This strips stale/sensitive params (evil, token, …) from every nav URL.
//   • router.push(`${pathname}?${next}`, { scroll: false }) then scrollTo(0,0).
//   • aria-current="page" on the active tab only.
//   • Desktop tab row (hidden min-[720px]:flex) AND mobile bottom bar
//     (min-[720px]:hidden) both render (CSS-only switching), each in a
//     <nav aria-label="Show sections">.
//
// CrewSectionTransition smoke: wrapper + children present; changing sectionId
// re-keys the motion child (jsdom-safe with framer-motion).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

// jsdom has no matchMedia; the shared usePrefersReducedMotion hook reads it on
// mount (CrewSectionTransition). Stub a no-reduced-motion media query list.
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

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/show/spring-gala/tok123";
  nav.searchParams = new URLSearchParams();
  stubMatchMedia(false);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** First matching tab (the desktop row renders before the mobile bar). */
function firstTab(name: RegExp): HTMLElement {
  const [tab] = screen.getAllByRole("button", { name });
  if (!tab) throw new Error(`no tab matching ${name}`);
  return tab;
}

/** Parse the query string of the URL the component pushed. */
function pushedQuery(): URLSearchParams {
  expect(nav.push).toHaveBeenCalledTimes(1);
  const [url, opts] = nav.push.mock.calls[0] as [string, { scroll?: boolean }];
  expect(opts).toEqual({ scroll: false });
  const qIndex = url.indexOf("?");
  expect(qIndex).toBeGreaterThanOrEqual(0);
  return new URLSearchParams(url.slice(qIndex + 1));
}

describe("CrewSubNav", () => {
  it("preserves an allow-listed gate=skip when activating a tab", () => {
    nav.searchParams = new URLSearchParams("gate=skip");
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);

    // Use the desktop row's "venue" tab.
    fireEvent.click(firstTab(/venue/i));

    const q = pushedQuery();
    expect(q.get("s")).toBe("venue");
    expect(q.get("gate")).toBe("skip");
  });

  it("builds a FRESH params object — strips non-allow-listed (evil/token) keys", () => {
    nav.searchParams = new URLSearchParams("gate=skip&evil=1&token=secret");
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);

    fireEvent.click(firstTab(/schedule/i));

    const q = pushedQuery();
    expect(q.get("s")).toBe("schedule");
    expect(q.get("gate")).toBe("skip");
    // Stale/sensitive params must NOT survive the push.
    expect(q.get("evil")).toBeNull();
    expect(q.get("token")).toBeNull();
    expect([...q.keys()].sort()).toEqual(["gate", "s"]);
  });

  it("does not carry a non-allow-listed gate value", () => {
    nav.searchParams = new URLSearchParams("gate=bogus");
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);

    fireEvent.click(firstTab(/venue/i));

    const q = pushedQuery();
    expect(q.get("s")).toBe("venue");
    expect(q.get("gate")).toBeNull();
    expect([...q.keys()]).toEqual(["s"]);
  });

  it("marks only the active tab with aria-current=page", () => {
    render(<CrewSubNav activeSection="venue" budgetVisible={false} />);
    const current = screen.getAllByRole("button", { current: "page" });
    // One per row (desktop + mobile), both must be "venue".
    expect(current.length).toBe(2);
    for (const el of current) {
      expect(el).toHaveAttribute("data-section", "venue");
    }
    // Non-active tab carries no aria-current.
    const todayTabs = screen.getAllByRole("button", { name: /today/i });
    for (const el of todayTabs) {
      expect(el).not.toHaveAttribute("aria-current");
    }
  });

  it("renders both the desktop tab row and the mobile bottom bar", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    const navs = screen.getAllByRole("navigation", { name: "Show sections" });
    expect(navs.length).toBe(2);

    const classSets = navs.map((n) => n.className);
    const hasDesktop = classSets.some(
      (c) => c.includes("min-[720px]:flex") && c.includes("hidden"),
    );
    const hasMobile = classSets.some((c) => c.includes("min-[720px]:hidden"));
    expect(hasDesktop).toBe(true);
    expect(hasMobile).toBe(true);

    // Every BASE section appears in EACH nav.
    for (const n of navs) {
      for (const id of BASE_SECTION_IDS) {
        expect(within(n).getByRole("button", { name: new RegExp(id, "i") })).toBeTruthy();
      }
    }
  });

  it("centers the desktop nav row inside the real _CrewShell page container (max-w-300, not 1120px)", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    // The desktop tab row (the <nav> that is `hidden min-[720px]:flex`) must
    // live inside a centering container that matches _CrewShell's
    // [data-testid="page-container"] so the first tab's left edge aligns with
    // the section content's left edge.
    const desktopNav = screen
      .getAllByRole("navigation", { name: "Show sections" })
      .find((n) => n.className.includes("min-[720px]:flex") && n.className.includes("hidden"));
    if (!desktopNav) throw new Error("desktop nav row not found");

    // Walk up to the nearest centering container and assert it carries the
    // shared CREW_PAGE_CONTAINER utilities (mx-auto / w-full / max-w-300 /
    // px-4 / sm:px-8) — and NOT the mock's literal max-w-[1120px].
    const container = desktopNav.closest(".max-w-300") as HTMLElement | null;
    expect(container).not.toBeNull();
    for (const util of CREW_PAGE_CONTAINER.split(" ")) {
      expect(container!.className).toContain(util);
    }
    expect(container!.className).not.toContain("max-w-[1120px]");
  });

  it("renders a per-section icon (svg) before each desktop tab label", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    const desktopNav = screen
      .getAllByRole("navigation", { name: "Show sections" })
      .find((n) => n.className.includes("min-[720px]:flex") && n.className.includes("hidden"));
    if (!desktopNav) throw new Error("desktop nav row not found");

    for (const id of BASE_SECTION_IDS) {
      const tab = within(desktopNav).getByRole("button", { name: new RegExp(id, "i") });
      const svg = tab.querySelector("svg");
      expect(svg, `desktop tab "${id}" should render an svg icon`).not.toBeNull();
      // Icon is decorative — must be hidden from the a11y tree.
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("renders a per-section icon (svg) in each mobile bottom-bar tab", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    const mobileNav = screen
      .getAllByRole("navigation", { name: "Show sections" })
      .find((n) => n.className.includes("min-[720px]:hidden"));
    if (!mobileNav) throw new Error("mobile nav bar not found");

    for (const id of BASE_SECTION_IDS) {
      const tab = within(mobileNav).getByRole("button", { name: new RegExp(id, "i") });
      const svg = tab.querySelector("svg");
      expect(svg, `mobile tab "${id}" should render an svg icon`).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("renders the budget tab when budgetVisible is true (both rows)", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={true} />);
    expect(screen.getAllByRole("button", { name: /budget/i }).length).toBe(2);
  });

  it("omits the budget tab when budgetVisible is false", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    expect(screen.queryByRole("button", { name: /budget/i })).toBeNull();
  });

  it("scrolls to top after a tab activation", () => {
    render(<CrewSubNav activeSection="today" budgetVisible={false} />);
    fireEvent.click(firstTab(/venue/i));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe("CrewSectionTransition", () => {
  it("renders the keyed wrapper + children and swaps to the new section body", async () => {
    const { rerender } = render(
      <CrewSectionTransition sectionId={"today" satisfies SectionId}>
        <h2>Today body</h2>
      </CrewSectionTransition>,
    );
    const wrapper = screen.getByTestId("crew-section-transition");
    expect(wrapper).toBeInTheDocument();
    // key === sectionId — the keyed boundary the section landmark mounts inside.
    expect(wrapper).toHaveAttribute("data-reduced-motion", "false");
    expect(screen.getByText("Today body")).toBeInTheDocument();

    // Changing the section drives AnimatePresence mode="wait": the old body
    // exits, the new keyed body enters. Assert the swap completes.
    rerender(
      <CrewSectionTransition sectionId={"venue" satisfies SectionId}>
        <h2>Venue body</h2>
      </CrewSectionTransition>,
    );
    expect(await screen.findByText("Venue body")).toBeInTheDocument();
    expect(screen.queryByText("Today body")).toBeNull();
    expect(screen.getByTestId("crew-section-transition")).toBeInTheDocument();
  });
});

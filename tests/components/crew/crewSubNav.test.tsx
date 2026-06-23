// @vitest-environment jsdom
// CrewSubNav — CONTROLLED presentational contract (client-section-toggle).
//
// CrewSubNav is now a controlled, presentational component: it owns NO
// navigation. The parent controller (CrewSections) owns `activeSection` state,
// the shallow `?s=` URL, and scroll-to-top. CrewSubNav just renders the tabs and
// calls `onSelect(id)` when a tab is tapped.
//
// Contract pinned here:
//   • Tabs = BASE_SECTION_IDS (+ "budget" iff budgetVisible).
//   • Tapping a tab calls onSelect(id) with the tapped section id — and NOTHING
//     else: NO router.push (the component imports no next/navigation useRouter),
//     NO next/link <Link> anchor (tabs are <button>s).
//   • aria-current="page" on the active tab only.
//   • Desktop tab row (hidden min-[720px]:flex) AND mobile bottom bar
//     (min-[720px]:hidden) both render (CSS-only switching), each in a
//     <nav aria-label="Show sections">.
//   • Each tab renders a per-section svg icon (aria-hidden).
//   • Equal-width mobile tabs (min-w-0 flex-1).
//   • The desktop nav row is centered inside the shared CREW_PAGE_CONTAINER.
//
// CrewSectionTransition smoke: wrapper + children present; changing sectionId
// re-keys the motion child (jsdom-safe with framer-motion).
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";

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
  stubMatchMedia(false);
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

describe("CrewSubNav (controlled)", () => {
  it("calls onSelect(id) with the tapped section id", () => {
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);

    fireEvent.click(firstTab(/venue/i));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("venue");

    onSelect.mockClear();
    fireEvent.click(firstTab(/schedule/i));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("schedule");
  });

  it("imports NO next/navigation useRouter and NO next/link (presentational — owns no nav)", () => {
    const code = readFileSync(join(process.cwd(), "components/crew/CrewSubNav.tsx"), "utf8");
    // No router-driven navigation lives here anymore.
    expect(code).not.toMatch(/useRouter\s*\(/);
    expect(code).not.toMatch(/router\.push\s*\(/);
    // No next/link anchor — tabs are <button>s wired to onSelect.
    expect(code).not.toMatch(/from\s+["']next\/link["']/);
    expect(code).toMatch(/<button\b/);
  });

  it("marks only the active tab with aria-current=page", () => {
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="venue" budgetVisible={false} onSelect={onSelect} />);
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
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
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
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
    const desktopNav = screen
      .getAllByRole("navigation", { name: "Show sections" })
      .find((n) => n.className.includes("min-[720px]:flex") && n.className.includes("hidden"));
    if (!desktopNav) throw new Error("desktop nav row not found");

    const container = desktopNav.closest(".max-w-300") as HTMLElement | null;
    expect(container).not.toBeNull();
    for (const util of CREW_PAGE_CONTAINER.split(" ")) {
      expect(container!.className).toContain(util);
    }
    expect(container!.className).not.toContain("max-w-[1120px]");
  });

  it("equal-width mobile tabs carry min-w-0 flex-1", () => {
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
    const mobileNav = screen
      .getAllByRole("navigation", { name: "Show sections" })
      .find((n) => n.className.includes("min-[720px]:hidden"));
    if (!mobileNav) throw new Error("mobile nav bar not found");
    for (const id of BASE_SECTION_IDS) {
      const tab = within(mobileNav).getByRole("button", { name: new RegExp(id, "i") });
      expect(tab.className).toContain("min-w-0");
      expect(tab.className).toContain("flex-1");
    }
  });

  it("renders a per-section icon (svg) before each desktop tab label", () => {
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
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
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
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
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={true} onSelect={onSelect} />);
    expect(screen.getAllByRole("button", { name: /budget/i }).length).toBe(2);
  });

  it("omits the budget tab when budgetVisible is false", () => {
    const onSelect = vi.fn();
    render(<CrewSubNav activeSection="today" budgetVisible={false} onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: /budget/i })).toBeNull();
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

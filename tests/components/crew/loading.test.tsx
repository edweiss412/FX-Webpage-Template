// @vitest-environment jsdom
// app/show/[slug]/[shareToken]/loading.tsx: the crew route's loading skeleton,
// shown during the initial fetch and the picker / auth flow.
//
// Contract (crew page redesign PR A, spec §3): the skeleton reserves the loaded
// page's geometry, so the swap to the real page does not jump:
//   • below 1024px: the header, a day-row strip, a pass-sized block and the
//     "All sections" list block, in the home's order, with no tab row;
//   • from 1024px: the sticky header at `--crew-header-h`, the 240px left nav
//     column and a stacked section frame beside it.
// The breakpoint split is CSS (`lg:`), so jsdom sees both halves. Where a
// geometry class can drift, it is compared with the REAL component's rendered
// class list (Header, CrewWideNav), never restated here.
//
// §4.17 / no-Budget: placeholders derive from BASE_SECTION_IDS, so a Budget
// entry never flashes while `financialsVisible` is still unknown.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { Header } from "@/components/layout/Header";
import { CrewWideNav } from "@/components/crew/CrewWideNav";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { crewSectionLabel } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import Loading from "@/app/show/[slug]/[shareToken]/loading";

afterEach(cleanup);

const HOME_ORDER = [
  "crew-loading-day-row",
  "crew-loading-pass",
  "crew-loading-quick-facts",
  "crew-loading-list",
  "crew-loading-section",
] as const;

/** The real header with the crew page's status pill, as the crew shell renders it. */
function realHeaderWithPill(): HTMLElement {
  const { getByTestId } = render(
    <Header
      show={{
        title: "Spring Tour 2026",
        client_label: "FXAV Client",
        dates: { set: "2026-04-17", travelIn: null, showDays: ["2026-04-17"] } as never,
        venue: { name: "Hilton Anatole" } as never,
      }}
      statusPill={<span>Show day 1 of 1</span>}
      search={<div />}
    />,
  );
  return getByTestId("page-header");
}

/** The real header, rendered the way the crew shell renders it (search slot filled). */
function realHeader(): HTMLElement {
  const { getByTestId } = render(
    <Header
      show={{
        title: "Spring Tour 2026",
        client_label: "FXAV Client",
        dates: { set: "2026-04-17", travelIn: null, showDays: ["2026-04-17"] } as never,
        venue: { name: "Hilton Anatole" } as never,
      }}
      search={<div />}
    />,
  );
  return getByTestId("page-header");
}

describe("crew route loading skeleton", () => {
  it("draws no tab row: the page body follows the header directly", () => {
    const { getByTestId, queryByTestId, queryAllByTestId } = render(<Loading />);
    expect(getByTestId("crew-loading-skeleton")).toBeInTheDocument();
    expect(queryByTestId("crew-loading-subnav")).toBeNull();
    expect(queryAllByTestId("crew-loading-tab")).toHaveLength(0);
    expect(getByTestId("crew-loading-header").nextElementSibling).toBe(
      getByTestId("crew-loading-body"),
    );
  });

  it("the header reserves the live header's box: sticky at --crew-header-h from 1024px, a search row below it", () => {
    const real = realHeader();
    const realBar = real.className;
    const realRowClass = (real.firstElementChild as HTMLElement).className;
    const realSearchClass = within(real).getByTestId("page-header-search").className;
    cleanup();

    const { getByTestId } = render(<Loading />);
    const header = getByTestId("crew-loading-header");
    expect(header.className).toBe(realBar);
    expect((header.firstElementChild as HTMLElement).className).toBe(realRowClass);
    expect(getByTestId("crew-loading-search").className).toBe(realSearchClass);
  });

  it("the left nav column is CrewWideNav's box, Today first, then the base sections", () => {
    const { getByTestId: getReal } = render(
      <CrewWideNav items={[{ id: "today", label: "Today" }]} active="today" hrefFor={() => "#"} />,
    );
    const realNavClass = getReal("crew-wide-nav").className;
    cleanup();

    const { getByTestId } = render(<Loading />);
    const nav = getByTestId("crew-loading-nav");
    expect(nav.className).toBe(realNavClass);
    expect(nav.parentElement).toBe(getByTestId("crew-loading-body"));
    const items = within(nav).getAllByTestId("crew-loading-nav-item");
    expect(items.map((el) => el.textContent)).toEqual(BASE_SECTION_IDS.map(crewSectionLabel));
  });

  it("the body row is the shared page container and stretches its columns (DESIGN.md §7)", () => {
    const { getByTestId } = render(<Loading />);
    const body = getByTestId("crew-loading-body");
    for (const cls of CREW_PAGE_CONTAINER.split(" ")) expect(body).toHaveClass(cls);
    expect(body).toHaveClass("flex", "items-stretch");
    expect(getByTestId("crew-loading-main").parentElement).toBe(body);
  });

  it("the main column holds the skeleton blocks in the home's order", () => {
    const { getByTestId } = render(<Loading />);
    const main = getByTestId("crew-loading-main");
    const blocks = HOME_ORDER.map((id) => within(main).getByTestId(id));
    for (let i = 1; i < blocks.length; i += 1) {
      const prev = blocks[i - 1] as HTMLElement;
      const next = blocks[i] as HTMLElement;
      expect(
        prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${HOME_ORDER[i - 1]} before ${HOME_ORDER[i]}`,
      ).toBeTruthy();
    }
  });

  // Critique N4: the floor (176px) grew to a loaded 289 to 339px pass on the swap.
  it("the pass block reserves a typical pass's height, not its floor", () => {
    const { getByTestId } = render(<Loading />);
    expect(getByTestId("crew-loading-pass")).toHaveClass("min-h-pass-typical");
  });

  // UI-gate re-run P3-2: the header was three fixed plates (151px at 390 against
  // a loaded 217 to 237), so everything under it jumped on the swap. Its title
  // block and each line's element carry the live header's classes, so each line
  // box is the loaded one's height; the real-browser half is
  // tests/e2e/crew-layout-dimensions.spec.ts "crew loading skeleton".
  it("the title block and its eyebrow and date lines are the live header's, a two-line eyebrow and title below 640px", () => {
    const realBlock = realHeaderWithPill().querySelector<HTMLElement>(
      '[data-testid="page-header-title-block"]',
    )!;
    const want = {
      block: realBlock.className,
      eyebrow: realBlock.querySelector('[data-testid="page-header-eyebrow"]')!.className,
      titleRow: (realBlock.querySelector("h1")!.parentElement as HTMLElement).className,
      title: realBlock.querySelector("h1")!.className,
      pill: realBlock.querySelector('[data-testid="header-status-pill"]')!.className,
      date: realBlock.querySelector("time")!.parentElement!.className,
    };
    cleanup();

    const { getByTestId } = render(<Loading />);
    const block = getByTestId("crew-loading-title-block");
    expect(block.className).toBe(want.block);
    const eyebrow = getByTestId("crew-loading-eyebrow");
    expect(eyebrow.className).toBe(want.eyebrow);
    const title = getByTestId("crew-loading-title");
    // The h1's classes, plus a full row below 1024px: a long title pushes the
    // pill onto its own row, and the short placeholder words would not.
    expect(
      title.className.split(" ").filter((c) => c !== "basis-full" && c !== "lg:basis-auto"),
    ).toEqual(want.title.split(" "));
    expect(title).toHaveClass("basis-full", "lg:basis-auto");
    const titleRow = title.parentElement as HTMLElement;
    expect(titleRow.className.split(" ").sort()).toEqual(want.titleRow.trim().split(/\s+/).sort());
    expect((title.nextElementSibling as HTMLElement).className).toBe(want.pill);
    expect(getByTestId("crew-loading-date").className).toBe(want.date);
    // Two lines below 640px, one from it: a forced break that hides at `sm`.
    for (const line of [eyebrow, title]) {
      const breaks = line.querySelectorAll("br");
      expect(breaks).toHaveLength(1);
      expect(breaks[0]).toHaveClass("sm:hidden");
    }
  });

  it("the list block is compact only; the home body column and the stacked frame are wide only", () => {
    const { getByTestId } = render(<Loading />);
    expect(getByTestId("crew-loading-list")).toHaveClass("lg:hidden");
    // Below 1024px the quick facts follow the pass (critique N4); from it the
    // home body column beside the lead holds them.
    expect(getByTestId("crew-loading-quick-facts")).toHaveClass("lg:hidden");
    expect(getByTestId("crew-loading-home-body")).toHaveClass("hidden", "lg:flex");
    const stack = getByTestId("crew-loading-stack");
    expect(stack).toHaveClass("hidden", "lg:flex");
    expect(stack).toContainElement(getByTestId("crew-loading-section"));
  });

  it("the list block carries one row per base section, never a Budget row", () => {
    const { getByTestId } = render(<Loading />);
    const rows = within(getByTestId("crew-loading-list")).getAllByTestId("crew-loading-list-row");
    expect(rows.map((el) => el.textContent)).toEqual(
      BASE_SECTION_IDS.filter((id) => id !== "today").map(crewSectionLabel),
    );
  });

  it("never renders a Budget entry (case-insensitive)", () => {
    const { container } = render(<Loading />);
    expect((container.textContent ?? "").toLowerCase()).not.toContain("budget");
  });

  it("contains no em dash and no raw error code", () => {
    const { container } = render(<Loading />);
    const text = container.textContent ?? "";
    // em dash (U+2014) is banned chrome copy (DESIGN §9 / invariant 5).
    expect(text).not.toContain("—");
    // raw error codes are SCREAMING_SNAKE_CASE; the decorative shell has none.
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z0-9_]+/);
  });
});

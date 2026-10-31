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
  "crew-loading-list",
  "crew-loading-section",
] as const;

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

  it("the pass block reserves the pass's height floor", () => {
    const { getByTestId } = render(<Loading />);
    expect(getByTestId("crew-loading-pass")).toHaveClass("min-h-right-now-min-h");
  });

  it("the list block is compact only; the home body column and the stacked frame are wide only", () => {
    const { getByTestId } = render(<Loading />);
    expect(getByTestId("crew-loading-list")).toHaveClass("lg:hidden");
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

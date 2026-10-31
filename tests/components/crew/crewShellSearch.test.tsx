// @vitest-environment jsdom
/**
 * CrewShell mounts crew search (plan Task 19; spec §6.1, §7.1, §6.7, §9.2).
 *
 * The real shell, the real sections and the real index builder render the
 * `fullContent` matrix case; only the chrome jsdom cannot host (the async
 * client Footer, the realtime bridge), the request clock and the router are
 * mocked. `CrewSearchProvider` is wrapped in a pass-through that records its
 * props and renders the real provider, so its inputs are read at the seam the
 * shell owns while every behaviour below still runs through it.
 *
 * - The search field is in the header.
 * - The provider sits above BOTH the header and the sections: typing into the
 *   header's field puts the sections' search panel on screen.
 * - The index is `buildSearchIndex` of the shell's own inputs.
 * - `missLogging` is on for a crew viewer only (spec §7.1).
 * - The report row renders for the crew page and not under `staticPreview`,
 *   observed in the No match state, the state that carries it.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CrewShell } from "@/app/show/[slug]/[shareToken]/_CrewShell";
import type { CrewSearchProviderProps } from "@/components/crew/search/CrewSearchProvider";
import type { Viewer } from "@/lib/data/getShowForViewer";
import { buildSearchIndex } from "@/lib/search/buildSearchIndex";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { MATRIX_TODAY, fullContent } from "@/tests/search/_viewerMatrix";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

// The request clock, pinned to the matrix's own `today` (asserted below).
const PINNED_NOW = vi.hoisted(() => "2026-05-14T16:00:00Z");
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date(PINNED_NOW),
  now: async () => PINNED_NOW,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/acme-2026/tok",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => null,
}));

// `Footer` is an async client component jsdom cannot render (the other crew
// shell suites mock it for the same reason). Its own report button is not this
// suite's subject; the search report row is.
vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="mock-footer" />,
}));

const providerProps = vi.hoisted(() => ({ value: [] as CrewSearchProviderProps[] }));
vi.mock("@/components/crew/search/CrewSearchProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/crew/search/CrewSearchProvider")>();
  const Recording = (props: CrewSearchProviderProps) => {
    providerProps.value.push(props);
    return <actual.CrewSearchProvider {...props} />;
  };
  return { ...actual, CrewSearchProvider: Recording };
});

const SHOW_ID = "55555555-5555-4555-8555-555555555555";
const SLUG = "acme-2026";
const CREW: Viewer = fullContent.viewer;
const ADMIN_PREVIEW: Viewer = { kind: "admin_preview", crewMemberId: "c1" };
/** A query no line of `fullContent` matches. */
const ZERO_HIT = "zqxjv";

beforeEach(() => {
  providerProps.value = [];
  // The crew pass (the section controller mounts it) reads matchMedia on mount; jsdom has none.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderShell(viewer: Viewer, staticPreview = false): Promise<void> {
  render(
    await CrewShell({
      data: fullContent.data,
      viewer,
      showId: SHOW_ID,
      rawSection: undefined,
      slug: SLUG,
      ...(staticPreview ? { staticPreview: true } : {}),
    }),
  );
}

function lastProviderProps(): CrewSearchProviderProps {
  const props = providerProps.value.at(-1);
  if (props === undefined) throw new Error("CrewShell rendered no CrewSearchProvider");
  return props;
}

function searchBox(): HTMLElement {
  return screen.getByRole("searchbox", { name: "Search this show" });
}

function typeQuery(text: string): void {
  const box = searchBox();
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: text } });
}

test("the pinned request clock is the matrix case's today", () => {
  premiseHolds(
    "PINNED_NOW equals MATRIX_TODAY",
    new Date(PINNED_NOW).getTime() === MATRIX_TODAY.getTime(),
  );
});

describe("crew viewer", () => {
  test("the header holds the search field", async () => {
    await renderShell(CREW);
    const header = screen.getByTestId("page-header");
    expect(within(header).getByRole("search")).toContainElement(searchBox());
    expect(within(header).getByTestId("page-header-search")).toContainElement(searchBox());
  });

  test("the provider gets the shell's index, slug, show id and report context, with miss logging on", async () => {
    await renderShell(CREW);
    const props = lastProviderProps();
    const expected = buildSearchIndex({
      data: fullContent.data,
      viewer: CREW,
      today: MATRIX_TODAY,
      budgetVisible: fullContent.budgetVisible,
      staticPreview: false,
    });
    premise("fullContent index entries", expected.entries.length, 0);
    premise(
      "sections in the fullContent index",
      new Set(expected.entries.map((e) => e.section)).size,
      1,
    );
    expect(props.index).toEqual(expected);
    expect(props.missLogging).toBe(true);
    expect(props.slug).toBe(SLUG);
    expect(props.showId).toBe(SHOW_ID);
    expect(props.cardReport).not.toBeNull();
  });

  test("the provider sits above the header and the sections: the header's field drives the sections' panel", async () => {
    await renderShell(CREW);
    expect(screen.queryByTestId("crew-search-panel")).not.toBeInTheDocument();

    typeQuery("ballroom");

    const panel = screen.getByTestId("crew-search-panel");
    expect(within(panel).getByTestId("crew-search-results")).toBeInTheDocument();
    expect(within(panel).getAllByTestId("crew-search-row").length).toBeGreaterThan(0);
  });

  test("a zero-hit query shows No match with the report row", async () => {
    await renderShell(CREW);
    typeQuery(ZERO_HIT);

    expect(screen.getByText("No matches. Try dock, hotel, or a name.")).toBeInTheDocument();
    expect(screen.getByTestId("crew-search-report")).toBeInTheDocument();
  });
});

describe("previews", () => {
  test("admin preview-as builds the same index and sends no misses", async () => {
    await renderShell(ADMIN_PREVIEW);
    const props = lastProviderProps();
    expect(props.missLogging).toBe(false);
    expect(props.index).toEqual(
      buildSearchIndex({
        data: fullContent.data,
        viewer: ADMIN_PREVIEW,
        today: MATRIX_TODAY,
        budgetVisible: fullContent.budgetVisible,
        staticPreview: false,
      }),
    );
  });

  test("the staged preview builds its index, sends no misses, and has reporting off", async () => {
    await renderShell(CREW, true);
    const props = lastProviderProps();
    premise("staged preview index entries", props.index.entries.length, 0);
    expect(props.missLogging).toBe(false);
    expect(props.cardReport).toBeNull();
  });

  test("the staged preview's No match state renders no report row", async () => {
    await renderShell(CREW, true);
    typeQuery(ZERO_HIT);

    // The same No match state the crew case shows WITH the row.
    expect(screen.getByText("No matches. Try dock, hotel, or a name.")).toBeInTheDocument();
    expect(screen.queryByTestId("crew-search-report")).not.toBeInTheDocument();
  });
});

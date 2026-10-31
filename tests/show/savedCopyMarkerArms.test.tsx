// @vitest-environment jsdom
/**
 * Every arm of the crew show route renders the saved-copy marker its S1 row
 * assigns (spec 4.3; plan sweep S1). Each `<TerminalFailure>` in `page.tsx`
 * carries its own disposition; `_CrewShell.tsx`'s resolveViewerContext catch is
 * split three ways; and a healthy crew render gets `save` from the slot after
 * the header (spec 4.7.2), carrying the picker epoch of the resolved selection.
 *
 * `resolveShowPageAccess` and `getShowForViewer` are mocked, as in
 * tests/show/flow8Repick.test.tsx; CrewShell, TerminalFailure, the slot and the
 * marker all render for real. Each case also reads the rendered HTML with the
 * worker's own reader, so a marker that renders but would not parse fails here.
 *
 * Failure modes caught: a TerminalFailure site passing no marker or the wrong
 * one (a `purge` where S1 says `keep` drops the crew member's saved copy on a
 * server hiccup; a `keep` where S1 says `purge` leaves an old copy behind); a
 * `keep` keyed to the wrong crew member; the CrewShell catch keeping the copy
 * for an unmatched crew viewer, whose identity does not match the data; a slot
 * that drops the epoch (the worker then rejects the `save`); and a slot placed
 * anywhere but between the header and the sections.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({
  buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")),
}));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/data/getShowForViewer", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/getShowForViewer")>()),
  getShowForViewer: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  usePathname: () => "/show/s/t",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

// The request clock, pinned so the `save` marker's render time is known.
const PINNED_NOW = vi.hoisted(() => "2026-05-14T16:00:00.000Z");
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date(PINNED_NOW),
  now: async () => PINNED_NOW,
}));

// Chrome jsdom cannot host (the async client Footer) or that would open a
// network subscription (the realtime bridge); neither renders a marker.
vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({ ShowRealtimeBridge: () => null }));
vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="mock-footer" />,
}));

import { CrewShell, type CrewShellProps } from "@/app/show/[slug]/[shareToken]/_CrewShell";
import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import {
  CrewMemberNotInShowError,
  getShowForViewer,
  type ShowForViewer,
  type Viewer,
} from "@/lib/data/getShowForViewer";
import { MARKER_ID, readMarker } from "@/lib/offline/marker";
import { viewerKey } from "@/lib/offline/viewerKey";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

type Access = Awaited<ReturnType<typeof resolveShowPageAccess>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type RosterBuilder = {
  select: () => RosterBuilder;
  eq: () => RosterBuilder;
  order: () => Promise<{ data: unknown; error: unknown }>;
};

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const CREW = "7c1e0d42-2b6f-4a39-9e81-5f3a2c4b6d70";
const OTHER_CREW = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const EPOCH = 7;

/** A well-formed projection whose one crew row is CREW. */
const DATA: ShowForViewer = (() => {
  const base = makeShowForViewer();
  return { ...base, crewMembers: base.crewMembers.map((member) => ({ ...member, id: CREW })) };
})();

const ROSTER_ROW = {
  id: CREW,
  name: "Test Crew",
  role: "A1",
  role_flags: [],
  claimed_via_oauth_at: null,
};

function mockAccess(value: Access): void {
  vi.mocked(resolveShowPageAccess).mockResolvedValue(value);
}

function rosterBuilder(result: { data: unknown; error: unknown }): RosterBuilder {
  const q: RosterBuilder = { select: () => q, eq: () => q, order: () => Promise.resolve(result) };
  return q;
}

/** The service client the page reads the roster (crew_members) and availability (shows) through. */
function mockReads({
  roster,
  availability,
}: {
  roster: "ok" | "error";
  availability?: "available" | "error";
}): void {
  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
    from: (table: string) => {
      if (table === "shows") {
        const result =
          availability === "error"
            ? { data: null, error: { message: "boom" } }
            : { data: { published: true, archived: false }, error: null };
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }) };
      }
      return rosterBuilder(
        roster === "error"
          ? { data: null, error: { message: "roster boom" } }
          : { data: [ROSTER_ROW], error: null },
      );
    },
  } as unknown as ServiceClient);
}

async function renderPage(searchParams: { gate?: string } = {}): Promise<HTMLElement> {
  const element = await ShowPage({
    params: Promise.resolve({ slug: "s", shareToken: "t" }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(element).container;
}

/**
 * The page's crew arm returns a CrewShell element, an async server component
 * Testing Library cannot mount; invoke it with the exact props the page passed.
 */
async function renderPageThroughShell(): Promise<HTMLElement> {
  const element = (await ShowPage({
    params: Promise.resolve({ slug: "s", shareToken: "t" }),
    searchParams: Promise.resolve({}),
  })) as ReactElement<CrewShellProps>;
  premiseHolds("the page returned the CrewShell element", element.type === CrewShell);
  return render(await CrewShell(element.props)).container;
}

async function renderShell(viewer: Viewer, data: ShowForViewer): Promise<HTMLElement> {
  return render(
    await CrewShell({
      data,
      viewer,
      showId: SHOW,
      rawSection: undefined,
      slug: "s",
      shareToken: "t",
      identityChip: null,
    }),
  ).container;
}

/** The page's one marker element; fails when there is none or more than one (spec 4.3). */
function theMarker(container: HTMLElement): Element {
  const markers = container.querySelectorAll(`#${MARKER_ID}`);
  expect(markers).toHaveLength(1);
  return markers[0]!;
}

function expectPurge(container: HTMLElement, showId: string | null): void {
  const marker = theMarker(container);
  expect(marker.getAttribute("data-disposition")).toBe("purge");
  expect(marker.getAttribute("data-show-id")).toBe(showId);
  expect(readMarker(container.innerHTML)).toEqual({
    kind: "valid",
    marker: { disposition: "purge", showId },
  });
}

function expectKeep(container: HTMLElement, showId: string, crewMemberId: string): void {
  const viewer = viewerKey(showId, crewMemberId);
  premiseHolds("the test viewer key is available", viewer !== null);
  const marker = theMarker(container);
  expect(marker.getAttribute("data-disposition")).toBe("keep");
  expect(marker.getAttribute("data-show-id")).toBe(showId);
  expect(marker.getAttribute("data-viewer")).toBe(viewer);
  expect(readMarker(container.innerHTML)).toEqual({
    kind: "valid",
    marker: { disposition: "keep", showId, viewer },
  });
}

const resolved: Access = {
  kind: "resolved",
  showId: SHOW,
  crewMemberId: CREW,
  source: "cookie",
  pickerEpoch: EPOCH,
};

beforeEach(() => {
  // RightNowHero (inside Today) reads matchMedia on mount; jsdom has none.
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("page.tsx: each TerminalFailure carries its S1 disposition", () => {
  test("renderPickerRepick roster failure: purge, naming the show", async () => {
    mockAccess({
      kind: "removed_from_roster",
      showId: SHOW,
      expectedEpoch: 3,
      expectedCrewMemberId: CREW,
    });
    mockReads({ roster: "error" });
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });

  test("renderRacedCrewMiss roster failure: purge, naming the show", async () => {
    mockAccess(resolved);
    vi.mocked(getShowForViewer).mockRejectedValue(new CrewMemberNotInShowError());
    mockReads({ roster: "error", availability: "available" });
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });

  test("renderRacedCrewMiss availability failure: purge, naming the show", async () => {
    mockAccess(resolved);
    vi.mocked(getShowForViewer).mockRejectedValue(new CrewMemberNotInShowError());
    mockReads({ roster: "ok", availability: "error" });
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });

  test("infra_error arm: hold, naming no show (resolution never finished)", async () => {
    mockAccess({ kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    const marker = theMarker(container);
    expect(marker.getAttribute("data-disposition")).toBe("hold");
    expect(marker.hasAttribute("data-show-id")).toBe(false);
    expect(marker.hasAttribute("data-viewer")).toBe(false);
    expect(readMarker(container.innerHTML)).toEqual({
      kind: "valid",
      marker: { disposition: "hold", showId: null },
    });
  });

  test("admin data failure: purge, naming the show", async () => {
    mockAccess({ kind: "admin", showId: SHOW });
    vi.mocked(getShowForViewer).mockRejectedValue(new Error("boom"));
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });

  test("resolved arm getShowForViewer failure: keep, for the resolved crew member", async () => {
    mockAccess(resolved);
    vi.mocked(getShowForViewer).mockRejectedValue(new Error("PICKER_CREW_MEMBER_WRONG_SHOW"));
    const container = await renderPage();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectKeep(container, SHOW, CREW);
  });

  test("no_auth roster failure: purge, naming the show", async () => {
    mockAccess({ kind: "no_auth", showId: SHOW, reason: "first_contact" });
    mockReads({ roster: "error" });
    const container = await renderPage({ gate: "skip" });
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });
});

describe("_CrewShell.tsx: the resolveViewerContext catch, split three ways", () => {
  test("MalformedProjectionError for a crew viewer (reached through the page): keep, for that crew member", async () => {
    mockAccess(resolved);
    vi.mocked(getShowForViewer).mockResolvedValue({
      ...DATA,
      crewMembers: { length: 1 },
    } as unknown as ShowForViewer);
    const container = await renderPageThroughShell();
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectKeep(container, SHOW, CREW);
  });

  test("MalformedProjectionError for an admin_preview viewer: purge, naming the show", async () => {
    const container = await renderShell({ kind: "admin_preview", crewMemberId: CREW }, {
      ...DATA,
      crewMembers: undefined,
    } as unknown as ShowForViewer);
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });

  test("UnmatchedViewerError for a crew viewer: purge, not keep (the identity does not match the data)", async () => {
    const container = await renderShell({ kind: "crew", crewMemberId: OTHER_CREW }, DATA);
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expectPurge(container, SHOW);
  });
});

describe("the healthy crew render", () => {
  test("save, with the resolved selection's picker epoch, the viewer key and the render time, between the header and the sections", async () => {
    mockAccess(resolved);
    vi.mocked(getShowForViewer).mockResolvedValue(DATA);
    const container = await renderPageThroughShell();

    const marker = theMarker(container);
    expect(marker.getAttribute("data-disposition")).toBe("save");
    expect(marker.getAttribute("data-show-id")).toBe(SHOW);
    expect(marker.getAttribute("data-epoch")).toBe(String(EPOCH));
    expect(marker.getAttribute("data-viewer")).toBe(viewerKey(SHOW, CREW));
    expect(marker.getAttribute("data-rendered-at")).toBe(PINNED_NOW);
    const read = readMarker(container.innerHTML);
    expect(read.kind).toBe("valid");

    // Spec 4.7.2: in the shell, after the header, before the sections.
    const shell = container.querySelector('[data-testid="crew-shell"]');
    const header = container.querySelector('[data-testid="page-header"]');
    const sections = container.querySelector('[data-testid="crew-shell-sections"]');
    premiseHolds("the shell, header and sections all rendered", !!shell && !!header && !!sections);
    expect(shell!.contains(marker)).toBe(true);
    expect(header!.contains(marker)).toBe(false);
    expect(sections!.contains(marker)).toBe(false);
    expect(header!.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      marker.compareDocumentPosition(sections!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// @vitest-environment jsdom
/**
 * tests/show/resolvedArmCrewMembersGuard.test.tsx
 *
 * Fail-closed contract for a MALFORMED projection (crewMembers missing /
 * not an array) on the `resolved` arm of
 * app/show/[slug]/[shareToken]/page.tsx + the full CrewShell render path.
 *
 * History: the original guard PR routed a malformed projection into the
 * same `{kind:"none"}` restrictions fallback as the unmatched-row case
 * and rendered a chip-less page. For crew/admin_preview viewers that is
 * fail-OPEN on per-crew visibility — Right Now / Schedule / Pack List
 * render UNRESTRICTED when the restrictions could not be verified.
 * The contract is now:
 *
 *   - unmatched row in a WELL-FORMED array → none-restrictions tolerance
 *     (unchanged; pinned in tests/data/viewerContext.test.ts).
 *   - crew/admin_preview viewer + non-array crewMembers →
 *     resolveViewerContext throws MalformedProjectionError; CrewShell
 *     catches it and renders the route's EXISTING infra arm,
 *     <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" /> — no
 *     tiles, no hero card, no unrestricted schedule.
 *
 * The page function itself still must NOT throw: ShowPage derives the
 * display-only identity chip from `data.crewMembers?.find(...)` BEFORE
 * React renders CrewShell, and an uncaught TypeError there would bypass
 * the deliberate-surface contract (P-R5 Fix-1) AND CrewShell's
 * fail-closed catch. So this file pins both halves:
 *
 *   1. ShowPage resolves (no throw) and hands CrewShell a null chip.
 *   2. Rendering CrewShell with the malformed projection produces
 *      TerminalFailure, NOT the tile grid.
 *
 * Concrete failure modes caught: (a) reverting the typed throw to the
 * old none-restrictions fallback → test 2 fails because the page
 * renders `page-container` instead of `terminal-failure`; (b) dropping
 * the `?.` chip guard in page.tsx → test 1 rejects with a TypeError.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { ShowForViewer } from "@/lib/data/getShowForViewer";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({
  buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")),
}));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({
  resolveShowPageAccess: vi.fn(),
}));
vi.mock("@/lib/data/getShowForViewer", () => ({
  getShowForViewer: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

// Projection stub with crewMembers DELIBERATELY absent (malformed data).
// The cast is the point: the runtime guard must not rely on the type.
const malformedData = {
  show: {} as ShowForViewer["show"],
  crewMembers: undefined,
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  viewerName: null,
  viewerVersionToken: "",
  diagrams: null,
  openingReelHasVideo: false,
  lastSyncedAt: null,
  lastSyncStatus: null,
  tileErrors: {},
} as unknown as ShowForViewer;

type ShowBodyProps = {
  slug: string;
  showId: string;
  viewer: { kind: string; crewMemberId: string };
  data: ShowForViewer;
  identityChip: unknown;
};

async function resolveShowPageElement(): Promise<React.ReactElement<ShowBodyProps>> {
  const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");
  const { getShowForViewer } = await import("@/lib/data/getShowForViewer");
  vi.mocked(resolveShowPageAccess).mockResolvedValue({
    kind: "resolved",
    showId: "show-1",
    crewMemberId: "crew-1",
    source: "cookie",
  });
  vi.mocked(getShowForViewer).mockResolvedValue(malformedData);

  const { default: ShowPage } = await import("@/app/show/[slug]/[shareToken]/page");

  // Without the page.tsx `?.` chip guard this rejects with
  // "Cannot read properties of undefined (reading 'find')".
  return (await ShowPage({
    params: Promise.resolve({ slug: "any-show", shareToken: "a".repeat(64) }),
    searchParams: Promise.resolve({}),
  })) as React.ReactElement<ShowBodyProps>;
}

describe("resolved arm: missing crewMembers array fails CLOSED", () => {
  test("ShowPage does not throw; chip is null (display-only, page terminates inside ShowBody)", async () => {
    const element = await resolveShowPageElement();

    expect(element.props.identityChip).toBeNull();
    expect(element.props.data).toBe(malformedData);
    expect(element.props.viewer).toEqual({ kind: "crew", crewMemberId: "crew-1" });
  });

  test("full CrewShell render path → TerminalFailure (PICKER_RESOLVER_LOOKUP_FAILED copy), no tile grid", async () => {
    const element = await resolveShowPageElement();

    // CrewShell is an async Server Component (the redesigned body that
    // replaced _ShowBody); invoke it directly with the exact props the page
    // handed it and render the resolved tree. The malformed-projection
    // fail-closed contract migrated verbatim into CrewShell's producer
    // contract 2 (_CrewShell.tsx:157-170), which renders the SAME
    // <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" /> on a non-array
    // crewMembers field.
    const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
    const node = await CrewShell(element.props as Parameters<typeof CrewShell>[0]);
    render(<>{node}</>);

    // Fail-closed: the EXISTING infra arm renders…
    expect(screen.getByTestId("terminal-failure")).toBeTruthy();
    // …with the cataloged crew-facing copy for PICKER_RESOLVER_LOOKUP_FAILED
    // (lib/messages/catalog.ts), never the raw code (AGENTS.md invariant 5).
    expect(
      screen.getByText("Couldn't load your show access. Please try again in a moment."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("PICKER_RESOLVER_LOOKUP_FAILED");

    // …and the unrestricted page does NOT: no tile grid, no Today band.
    expect(screen.queryByTestId("page-container")).toBeNull();
    expect(screen.queryByTestId("tile-grid")).toBeNull();
    expect(screen.queryByTestId("today-band")).toBeNull();
  });
});

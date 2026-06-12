// @vitest-environment jsdom
/**
 * tests/show/resolvedArmCrewMembersGuard.test.tsx
 *
 * Defense-in-depth guard on the `resolved` arm of
 * app/show/[slug]/[shareToken]/page.tsx: after getShowForViewer succeeds the
 * page derives the identity chip via `data.crewMembers.find(...)`. The
 * undefined-FIND-RESULT case is already handled (identityChip ternary), but a
 * missing/undefined `crewMembers` ARRAY (malformed projection, stale roster
 * mid-navigation, mocked/degraded data layer) would make `.find` throw an
 * unhandled TypeError into Next's generic error boundary — bypassing the
 * page's P-R5 Fix-1 contract that every data failure routes to a deliberate
 * surface, never an uncaught throw.
 *
 * Note: per the live type (lib/data/getShowForViewer.ts:96 `crewMembers:
 * Array<...>`) and its only constructor (`(crewRes.data ?? []).map(...)`,
 * line 305), crewMembers is always an array today — this test pins the
 * DEFENSE-IN-DEPTH guard, mirroring resolveViewerContext's tolerance.
 *
 * Concrete failure mode caught: unguarded `data.crewMembers.find(` reverts →
 * ShowPage rejects with TypeError instead of rendering with a null chip.
 */
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

describe("resolved arm: missing crewMembers array (defense-in-depth)", () => {
  test("undefined crewMembers → renders ShowBody with null identityChip, does NOT throw", async () => {
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

    // Without the guard this rejects with
    // "Cannot read properties of undefined (reading 'find')".
    const element = (await ShowPage({
      params: Promise.resolve({ slug: "any-show", shareToken: "a".repeat(64) }),
      searchParams: Promise.resolve({}),
    })) as React.ReactElement<{
      identityChip: unknown;
      data: ShowForViewer;
      viewer: { kind: string; crewMemberId: string };
    }>;

    // Renders the resolved-arm ShowBody (not TerminalFailure): the chip is
    // simply absent, exactly like the existing missing-row fallback.
    expect(element.props.identityChip).toBeNull();
    expect(element.props.data).toBe(malformedData);
    expect(element.props.viewer).toEqual({ kind: "crew", crewMemberId: "crew-1" });
  });
});

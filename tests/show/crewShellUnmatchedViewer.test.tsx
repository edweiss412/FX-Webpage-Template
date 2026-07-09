// @vitest-environment jsdom
/**
 * 8.2 Point C backstop: resolveViewerContext throws UnmatchedViewerError for a
 * crew/admin_preview viewer whose id is absent from a WELL-FORMED crewMembers
 * array; _CrewShell must catch it and render the route's infra TerminalFailure
 * arm (no retryHref), NOT let it propagate uncaught.
 *
 * Reachable on the ADMIN-PREVIEW route (the crew route's Point A/B guards in
 * page.tsx pre-empt the crew case). Rendered here by invoking CrewShell directly
 * with an admin_preview viewer whose id is missing from the projection.
 *
 * Concrete failure mode caught: dropping the UnmatchedViewerError arm from
 * _CrewShell's catch → the error propagates uncaught (the promise rejects), so
 * no terminal-failure renders.
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { CrewShell } from "@/app/show/[slug]/[shareToken]/_CrewShell";

// Well-formed projection whose crewMembers OMITS the viewer id.
const data = {
  show: {} as ShowForViewer["show"],
  crewMembers: [{ id: "other", name: "Someone", email: null, phone: null, role: "A1", roleFlags: ["A1"], dateRestriction: { kind: "none" }, stageRestriction: { kind: "none" } }],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  viewerName: null,
  viewerFlightInfo: null,
  viewerVersionToken: "",
  diagrams: null,
  openingReelHasVideo: false,
  lastSyncedAt: null,
  lastSyncStatus: null,
  tileErrors: {},
  runOfShow: null,
  driveFileId: null,
  sourceAnchors: {},
} as unknown as ShowForViewer;

describe("_CrewShell backstop: UnmatchedViewerError → TerminalFailure (no retryHref)", () => {
  test("admin_preview viewer absent from a well-formed array renders terminal-failure without a retry link", async () => {
    const node = await CrewShell({
      data,
      viewer: { kind: "admin_preview", crewMemberId: "missing" },
      showId: "sid",
      rawSection: undefined,
      slug: "s",
      shareToken: "t",
      identityChip: null,
    } as unknown as Parameters<typeof CrewShell>[0]);
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="terminal-failure-retry"]')).toBeNull(); // NO retryHref
  });
});

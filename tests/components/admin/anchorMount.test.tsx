// @vitest-environment jsdom
// attention-alert-routing §3.3: anchored asset/reel cards mount INSIDE their content
// container — the Diagrams sub-block (Rooms & scope) and the opening_reel field
// (Event details) — proven by DOM ancestry (`card.closest(<anchor container>)`), not
// coordinates. When no anchor cards are threaded, the sub-block / field render
// byte-identically (the container/testid appears ONLY when a card is present).
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  RoomsDiagramsSubBlock,
  EventDetailsBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import type { SectionData } from "@/components/admin/review/sectionData";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import type { AttentionItem } from "@/lib/admin/attentionItems";

afterEach(cleanup);

const DIAGRAM_SIGNAL = {
  snapshot_revision_id: "rev-1",
  linkedFolder: { id: "folder-1", name: "Diagrams" },
  embeddedImages: [],
  linkedFolderItems: [],
};

const publishedRooms = {
  mode: "published",
  showId: "show-1",
  driveFileId: "drive-1",
  rooms: [],
  diagrams: DIAGRAM_SIGNAL,
} as unknown as SectionData;

function provider(chrome: Partial<Step3SectionChrome>, children: React.ReactNode) {
  return render(
    <Step3SectionChromeContext.Provider
      value={{ Icon: (() => null) as never, label: "x", flagged: false, ...chrome }}
    >
      {children}
    </Step3SectionChromeContext.Provider>,
  );
}

describe("anchored cards mount at their content", () => {
  it("diagram card renders inside the diagrams sub-block", () => {
    provider(
      { diagramAttention: [<div key="c" data-testid="attention-card-EMBEDDED_ASSET_DRIFTED" />] },
      <RoomsDiagramsSubBlock data={publishedRooms} />,
    );
    const card = screen.getByTestId("attention-card-EMBEDDED_ASSET_DRIFTED");
    expect(card.closest('[data-testid="published-diagrams-subblock"]')).not.toBeNull();
  });

  it("NO diagram cards → FULL byte-identity (undefined vs [] render the same, no wrapper)", () => {
    // Stronger than 'the testid is absent': the entire rendered DOM must be
    // identical whether the anchor array arrives as undefined or empty, proving the
    // `.length === 0` guard injects NOTHING — no wrapper, no class, no reordering.
    const { container: undef } = provider({}, <RoomsDiagramsSubBlock data={publishedRooms} />);
    const undefHtml = undef.innerHTML;
    cleanup();
    const { container: empty } = provider(
      { diagramAttention: [] },
      <RoomsDiagramsSubBlock data={publishedRooms} />,
    );
    expect(empty.innerHTML).toBe(undefHtml);
    expect(undefHtml).not.toContain("published-diagrams-subblock");
  });

  it("reel card renders inside the opening_reel field container", () => {
    provider(
      { reelAttention: [<div key="c" data-testid="attention-card-REEL_DRIFTED" />] },
      <EventDetailsBreakdown dfid="drive-1" eventDetails={{ opening_reel: "Sizzle reel intro" }} />,
    );
    const card = screen.getByTestId("attention-card-REEL_DRIFTED");
    const field = card.closest('[data-testid="event-opening-reel"]');
    expect(field).not.toBeNull();
    // Non-tautological: the wrapper co-locates the reel VALUE with the card.
    expect(field!.textContent).toContain("Opening reel");
  });

  it("NO reel cards → FULL byte-identity (undefined vs [] render the same, no wrapper)", () => {
    const ed = { opening_reel: "Sizzle reel intro" };
    const { container: undef } = provider(
      {},
      <EventDetailsBreakdown dfid="drive-1" eventDetails={ed} />,
    );
    const undefHtml = undef.innerHTML;
    cleanup();
    const { container: empty } = provider(
      { reelAttention: [] },
      <EventDetailsBreakdown dfid="drive-1" eventDetails={ed} />,
    );
    expect(empty.innerHTML).toBe(undefHtml);
    expect(undefHtml).not.toContain("event-opening-reel");
  });
});

// ── Production path integration (Codex PR3 review P2) ─────────────────────────
// The placement e2e injects diagramAttention/reelAttention directly. This test
// instead PRODUCES the chrome the way the modal does — real anchorsForData +
// bucketAttention over a real AttentionItem — so a break in that routing/threading
// (wrong anchor key, dropped bucket) fails here, not just in a hand-wired harness.
const assetItem: AttentionItem = {
  id: "alert:EMBEDDED_ASSET_DRIFTED",
  kind: "alert",
  tone: "notice",
  sectionId: "rooms",
  crewKey: null,
  actionable: true,
  menuTitle: "x",
  menuSubtitle: null,
  alert: {
    alertId: "EMBEDDED_ASSET_DRIFTED",
    code: "EMBEDDED_ASSET_DRIFTED",
    template: null,
    params: {},
    action: null,
    helpHref: null,
    raisedAt: "2026-07-20T00:00:00Z",
    occurrenceCount: 1,
    autoClearNote: null,
    failedKeys: null,
    dataGaps: null,
    errorCode: null,
  },
};

describe("production routing → bucketing → threading → DOM", () => {
  it("a real asset item, bucketed via anchorsForData, mounts in the diagrams sub-block", () => {
    const anchors = anchorsForData(publishedRooms);
    const sectionAttention = bucketAttention([assetItem], {
      renderCard: () => <div data-testid="attention-card-EMBEDDED_ASSET_DRIFTED" />,
      sectionAvailable: (id) =>
        id === "rooms" || id === "event" ? (anchors.get(id)?.size ?? 0) > 0 : true,
      anchorAvailable: (id, anchor) =>
        anchors.get(id as "rooms" | "event")?.has(anchor as never) ?? false,
    });
    const diagramAttention = sectionAttention.get("rooms")?.byAnchor?.get("diagrams");
    // The production path produced a real anchored bucket (not a hand-injected one).
    expect(diagramAttention).toHaveLength(1);
    provider(
      { diagramAttention: diagramAttention! },
      <RoomsDiagramsSubBlock data={publishedRooms} />,
    );
    const card = screen.getByTestId("attention-card-EMBEDDED_ASSET_DRIFTED");
    expect(card.closest('[data-testid="published-diagrams-subblock"]')).not.toBeNull();
  });

  it("same item with NO diagram signal buckets to Overview, not rooms (no dead mount)", () => {
    const noDiagrams = { ...(publishedRooms as object), diagrams: null } as unknown as SectionData;
    const anchors = anchorsForData(noDiagrams);
    const sectionAttention = bucketAttention([assetItem], {
      renderCard: () => <div data-testid="attention-card-EMBEDDED_ASSET_DRIFTED" />,
      sectionAvailable: (id) =>
        id === "rooms" || id === "event" ? (anchors.get(id)?.size ?? 0) > 0 : true,
      anchorAvailable: (id, anchor) =>
        anchors.get(id as "rooms" | "event")?.has(anchor as never) ?? false,
    });
    expect(sectionAttention.get("rooms")).toBeUndefined();
    expect(sectionAttention.get("overview")?.sectionTop).toHaveLength(1);
  });
});

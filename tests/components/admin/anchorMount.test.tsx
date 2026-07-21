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

  it("NO diagram cards → no sub-block wrapper testid (byte-identical)", () => {
    provider({}, <RoomsDiagramsSubBlock data={publishedRooms} />);
    expect(screen.queryByTestId("published-diagrams-subblock")).toBeNull();
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

  it("NO reel cards → plain opening_reel row, no field wrapper testid (byte-identical)", () => {
    provider(
      {},
      <EventDetailsBreakdown dfid="drive-1" eventDetails={{ opening_reel: "Sizzle reel intro" }} />,
    );
    expect(screen.queryByTestId("event-opening-reel")).toBeNull();
  });
});

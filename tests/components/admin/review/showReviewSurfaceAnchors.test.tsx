// @vitest-environment jsdom
/**
 * tests/components/admin/review/showReviewSurfaceAnchors.test.tsx
 * (attention-alert-routing §3.3 — Codex PR3 R2 coverage)
 *
 * Production-composed integration for the ANCHOR threading: a real sectionAttention
 * (built by bucketAttention over real AttentionItems + anchorsForData) is passed to
 * ShowReviewSurface, which derives the rooms/event byAnchor buckets
 * (ShowReviewSurface.tsx: `sectionAttention?.get("rooms")?.byAnchor?.get("diagrams")`)
 * and spreads them into the rooms/event section chrome. This exercises the actual
 * production seam — NOT a hand-injected `diagramAttention`/`reelAttention` — so a
 * broken derive or chrome spread fails HERE, for BOTH the diagram and reel paths.
 */
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SLUG = "anchor-surface-show";
const SHOW_ID = "11111111-2222-4333-8444-777777777777";
const DRIVE_FILE_ID = "drive-anchor-1";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Anchor Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: { opening_reel: "Sizzle reel intro" },
      agenda_links: [],
      coi_status: "received",
      // A persisted diagrams signal so the Diagrams sub-block renders AND
      // anchorsForData reports `rooms` available (linkedFolder != null).
      diagrams: {
        snapshot_revision_id: "rev-1",
        linkedFolder: { id: "folder-1", name: "Diagrams" },
        embeddedImages: [],
        linkedFolderItems: [],
      },
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  } as unknown as ShowReviewSnapshot;
}

const alertItem = (code: string, sectionId: "rooms" | "event"): AttentionItem => ({
  id: `alert:${code}`,
  kind: "alert",
  tone: "notice",
  sectionId,
  crewKey: null,
  actionable: true,
  menuTitle: "x",
  menuSubtitle: null,
  alert: {
    alertId: code,
    code,
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
});

function railTid(name: string): string {
  return `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;
}

function Harness() {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG });
  // The EXACT production wiring PublishedReviewModal applies.
  const anchors = anchorsForData(data);
  const sectionAttention = bucketAttention(
    [alertItem("EMBEDDED_ASSET_DRIFTED", "rooms"), alertItem("REEL_DRIFTED", "event")],
    {
      renderCard: (i) => <div data-testid={`attention-card-${i.alert!.code}`} />,
      sectionAvailable: (id) =>
        id === "rooms" || id === "event" ? (anchors.get(id)?.size ?? 0) > 0 : true,
      anchorAvailable: (id, anchor) =>
        anchors.get(id as "rooms" | "event")?.has(anchor as never) ?? false,
    },
  );
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      sectionAttention={sectionAttention}
    />
  );
}

describe("ShowReviewSurface threads anchored cards to their content (production seam)", () => {
  it("diagram card lands in the Diagrams sub-block; reel card in the opening_reel field", () => {
    render(<Harness />);
    // Sanity: the surface actually rendered the host sections.
    expect(screen.getByTestId(railTid("section-rooms"))).toBeTruthy();
    expect(screen.getByTestId(railTid("section-event"))).toBeTruthy();

    const diagCard = screen.getByTestId("attention-card-EMBEDDED_ASSET_DRIFTED");
    expect(diagCard.closest('[data-testid="published-diagrams-subblock"]')).not.toBeNull();

    const reelCard = screen.getByTestId("attention-card-REEL_DRIFTED");
    const field = reelCard.closest('[data-testid="event-opening-reel"]');
    expect(field).not.toBeNull();
    expect(field!.textContent).toContain("Opening reel");
  });
});

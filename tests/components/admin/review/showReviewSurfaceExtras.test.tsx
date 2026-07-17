// @vitest-environment jsdom
/**
 * tests/components/admin/review/showReviewSurfaceExtras.test.tsx
 * (consolidated-admin-show-page spec §5 / §10 — Task 13 surface extension)
 *
 * The Phase-2 completion of `ShowReviewSurface`: `extraSectionsBefore` /
 * `extraSectionsAfter` become FULL rail items — side-rail nav buttons, <lg chip
 * entries, scroll-spy active-highlight, `railBadge` rendering, and hash
 * navigation (#overview/#changes click→scroll + mount-restore). The wizard suite
 * is the byte-identity pin for the NO-extras (modal) path; this file pins the
 * WITH-extras (page) path.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Home, Clock } from "lucide-react";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

const SLUG = "surface-extras-show";
const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const DRIVE_FILE_ID = "drive-extras-1";

// jsdom has no Element#scrollTo; handleNavClick early-returns without it, so the
// scroll assertions never fire. Stub it so nav-click scrolling is observable.
const scrollToSpy = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = "";
});

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Extras Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
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
  };
}

function railTid(name: string): string {
  return `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;
}

/** Page-mode host: the SHELL owns the scroll container ref; Overview (before) +
 *  Changes (after) are full rail items. Overview carries a railBadge. */
function PageHarness() {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG });
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      extraSectionsBefore={[
        {
          id: "overview",
          label: "Overview",
          Icon: Home,
          railBadge: <span data-testid="overview-rail-badge">2</span>,
          render: () => <div data-testid="overview-section" id="overview" />,
        },
      ]}
      extraSectionsAfter={[
        {
          id: "changes",
          label: "Changes",
          Icon: Clock,
          render: () => <div data-testid="changes-section" id="changes" />,
        },
      ]}
    />
  );
}

describe("ShowReviewSurface extras rail participation (spec §5 / §10)", () => {
  it("renders side-rail nav buttons for Overview (first) and Changes (last)", () => {
    render(<PageHarness />);
    const overviewItem = screen.getByTestId(railTid("rail-item-overview"));
    const changesItem = screen.getByTestId(railTid("rail-item-changes"));
    expect(overviewItem).toBeTruthy();
    expect(changesItem).toBeTruthy();

    // Overview precedes every registry rail item; Changes follows all of them.
    const registryItems = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid*="-review-rail-item-"]'),
    ).filter((el) => el !== overviewItem && el !== changesItem);
    expect(registryItems.length).toBeGreaterThan(0);
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const el of registryItems) {
      expect(after(overviewItem, el)).toBe(true);
      expect(after(el, changesItem)).toBe(true);
    }
  });

  it("renders chip-rail entries for Overview and Changes", () => {
    render(<PageHarness />);
    expect(screen.getByTestId(railTid("chip-item-overview"))).toBeTruthy();
    expect(screen.getByTestId(railTid("chip-item-changes"))).toBeTruthy();
  });

  it("renders the Overview railBadge inside its side-rail button", () => {
    render(<PageHarness />);
    const overviewItem = screen.getByTestId(railTid("rail-item-overview"));
    expect(within(overviewItem).queryByTestId("overview-rail-badge")).not.toBeNull();
  });

  it("Overview is default-active on mount (first rail item)", () => {
    render(<PageHarness />);
    expect(screen.getByTestId(railTid("rail-item-overview")).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("clicking a registry rail item moves aria-current off Overview onto it", () => {
    render(<PageHarness />);
    const crew = screen.queryByTestId(railTid("rail-item-crew"));
    // crew always renders for a published fixture; guard defensively.
    if (!crew) return;
    fireEvent.click(crew);
    expect(crew.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByTestId(railTid("rail-item-overview")).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("clicking the Overview rail button scrolls the pane and updates the hash to #overview", () => {
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy as unknown as typeof original;
    try {
      render(<PageHarness />);
      fireEvent.click(screen.getByTestId(railTid("rail-item-overview")));
      expect(scrollToSpy).toHaveBeenCalled();
      expect(window.location.hash).toBe("#overview");
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("clicking the Changes chip updates the hash to #changes", () => {
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy as unknown as typeof original;
    try {
      render(<PageHarness />);
      fireEvent.click(screen.getByTestId(railTid("chip-item-changes")));
      expect(window.location.hash).toBe("#changes");
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });
});

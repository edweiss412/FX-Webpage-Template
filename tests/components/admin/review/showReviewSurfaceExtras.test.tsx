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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Home, Clock } from "lucide-react";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildStagedSectionData } from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "../wizard/_step3ReviewFixture";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";

// A staged WarningsBreakdown reads useRouter; keep RTL from throwing on the hook.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SLUG = "surface-extras-show";
const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const DRIVE_FILE_ID = "drive-extras-1";

// jsdom has no Element#scrollTo; handleNavClick early-returns without it, so the
// scroll assertions never fire. Stub it so nav-click scrolling is observable.
const scrollToSpy = vi.fn();

beforeEach(() => {
  // Neutralize any staged mount POST (the report/warnings bodies never fetch on
  // mount, but stub defensively so a staged surface render is network-silent).
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

/** Staged-mode host: the report ("Report an issue") section is staged-only, so it
 *  is a full rail item + chip + content section here. `dfid` matches DRIVE_FILE_ID
 *  so `railTid` addresses the same testid namespace as the published harness. */
function StagedPageHarness() {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pr = buildParseResult();
  const data = buildStagedSectionData({
    pr,
    row: stagedRow(pr, { driveFileId: DRIVE_FILE_ID }),
    dfid: DRIVE_FILE_ID,
    wizardSessionId: "88888888-4444-4444-8444-cccccccccccc",
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
  return <ShowReviewSurface data={data} scrollerRef={scrollerRef} layout="page" />;
}

describe("ShowReviewSurface report section mode-gating (staged-only rail entry)", () => {
  it("published mode: no report rail item, chip, or content section (blank-panel regression guard)", () => {
    render(<PageHarness />);
    // The published PageHarness renders the real surface; the report section's
    // published render is null, so its rail entry / chip / content container must
    // NOT exist — otherwise the consolidated per-show page shows a nav item that
    // scrolls to an empty panel (the P2 this gate fixes).
    expect(screen.queryByTestId(railTid("rail-item-report"))).toBeNull();
    expect(screen.queryByTestId(railTid("chip-item-report"))).toBeNull();
    expect(screen.queryByTestId(railTid("section-report"))).toBeNull();
    // Sanity: the surface DID render (a real registry section is present), so the
    // null above is genuine exclusion, not a failed mount.
    expect(screen.getByTestId(railTid("rail-item-venue"))).toBeTruthy();
  });

  it("staged mode: the report section renders a rail item, chip, and content section", () => {
    render(<StagedPageHarness />);
    expect(screen.getByTestId(railTid("rail-item-report"))).toBeTruthy();
    expect(screen.getByTestId(railTid("chip-item-report"))).toBeTruthy();
    expect(screen.getByTestId(railTid("section-report"))).toBeTruthy();
  });
});

/** A warn-severity crew warning → the `crew` section flags; `venue` (no warning)
 *  stays clean. Mirrors the sibling wizard fixture (Step3ReviewModal.test.tsx:86). */
function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind } };
}

function FlaggedStagedHarness() {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pr = buildParseResult({ warnings: [warning("crew")] });
  const data = buildStagedSectionData({
    pr,
    row: stagedRow(pr, { driveFileId: DRIVE_FILE_ID }),
    dfid: DRIVE_FILE_ID,
    wizardSessionId: "88888888-4444-4444-8444-cccccccccccc",
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
  return <ShowReviewSurface data={data} scrollerRef={scrollerRef} layout="page" />;
}

describe("ShowReviewSurface — S3C-1 dual-channel status dots (WCAG 1.4.1)", () => {
  it("flagged section dot is a filled amber disc; clean section dot is a hollow teal ring", () => {
    render(<FlaggedStagedHarness />);
    // crew carries a warn → flagged → filled amber disc (bg-status-review, no border)
    const flaggedDot = screen.getByTestId(railTid("rail-dot-crew"));
    expect(flaggedDot.className).toContain("bg-status-review");
    expect(flaggedDot.className).not.toContain("border-");
    // venue has no warning → clean → hollow teal ring (border + transparent, NOT a fill)
    const cleanDot = screen.getByTestId(railTid("rail-dot-venue"));
    expect(cleanDot.className).toContain("border-status-positive");
    expect(cleanDot.className).toContain("bg-transparent");
    expect(cleanDot.className).not.toContain("bg-status-positive");
  });

  it("each dotted nav control carries an sr-only text status (flagged → 'needs review'; clean → 'no issues')", () => {
    render(<FlaggedStagedHarness />);
    // Scope to each specific button by testid so a stray label elsewhere can't
    // satisfy the match. sr-only text is present in textContent (visually hidden).
    const crewRail = screen.getByTestId(railTid("rail-item-crew"));
    expect(crewRail.textContent).toMatch(/needs review/i);
    expect(crewRail.textContent).not.toMatch(/no issues/i);
    const venueRail = screen.getByTestId(railTid("rail-item-venue"));
    expect(venueRail.textContent).toMatch(/no issues/i);
    expect(venueRail.textContent).not.toMatch(/needs review/i);
    // Chip twins carry the same status text.
    expect(screen.getByTestId(railTid("chip-item-crew")).textContent).toMatch(/needs review/i);
    expect(screen.getByTestId(railTid("chip-item-venue")).textContent).toMatch(/no issues/i);
  });
});

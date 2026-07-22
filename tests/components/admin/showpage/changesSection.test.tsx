// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/changesSection.test.tsx (consolidated-admin-show-page Task 11)
 *
 * The Changes rail section (spec §5.4) — `ChangesFeed` relocated, NOT redesigned.
 * Presentation-only: the feed arrives as a prop (the server page calls `readShowChangeFeed`
 * once, Task 13); ChangesSection fetches nothing. A `null` feed renders the same calm
 * infra-error notice the current page shows for a `SyncInfraError` degrade (invariant 9).
 *
 * Two axes (plan Task 11 test spec):
 *   (a) feed entries render from a fixture; empty → the affirmative empty state; null → the
 *       infra-error notice (no raw §12.4 code — invariant 5).
 *   (b) mounted as an `extraSectionsAfter` item of the REAL `ShowReviewSurface`, Changes is
 *       LAST in the content-panel order and carries the `#changes` hash anchor, with Overview
 *       (an `extraSectionsBefore` item) preceding the registry warnings section.
 *
 * SCOPE NOTE (Task 11 ↔ Task 13): the delivered `ShowReviewSurface` renders extra sections
 * in the content pane only; the rail-NAV item + scroll-spy participation for string-id
 * extras is Task 13 (the surface's own Phase-1/Phase-2 split, ShowReviewSurface.tsx:26-27).
 * This test therefore asserts the panel/anchor half of the rail model (content order +
 * `#changes` hash target), which is what the surface guarantees today.
 *
 * Anti-tautology: DOM order is asserted via `compareDocumentPosition` on distinct elements
 * (the Overview section, the warnings section, the Changes section) — not by index into a
 * container that renders all three. The feed summary derives from the fixture entry.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Clock, Home } from "lucide-react";

import { ChangesSection } from "@/components/admin/showpage/ChangesSection";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { FeedEntry } from "@/lib/sync/holds/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/published-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const NOW = new Date("2026-07-16T12:00:00.000Z");
const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const DRIVE_FILE_ID = "DRIVE_PUB";

const actions = () => ({
  undoAction: vi.fn(),
  acceptAction: vi.fn(),
  acceptAllAction: vi.fn(),
  approveAction: vi.fn(),
  rejectAction: vi.fn(),
});

function feedEntry(summary: string): FeedEntry {
  return {
    id: "entry-1",
    occurredAt: "2026-07-16T11:00:00.000Z",
    status: "applied",
    summary,
    action: "none",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
  };
}

describe("ChangesSection (presentation)", () => {
  it("(a) renders feed entries from the fixture", () => {
    render(
      <ChangesSection
        feed={{ entries: [feedEntry("Renamed room A to Ballroom")], truncated: false }}
        now={NOW}
        showId={SHOW_ID}
        {...actions()}
      />,
    );
    expect(screen.getByTestId("change-feed-summary").textContent).toBe(
      "Renamed room A to Ballroom",
    );
    expect(screen.queryByTestId("change-feed-infra-error")).toBeNull();
  });

  it("(a) empty feed renders the affirmative empty state, not the error notice", () => {
    render(
      <ChangesSection
        feed={{ entries: [], truncated: false }}
        now={NOW}
        showId={SHOW_ID}
        {...actions()}
      />,
    );
    expect(screen.getByTestId("change-feed-empty")).toBeTruthy();
    expect(screen.queryByTestId("change-feed-infra-error")).toBeNull();
  });

  it("(a) null feed renders the calm infra-error notice (no raw code)", () => {
    render(<ChangesSection feed={null} now={NOW} showId={SHOW_ID} {...actions()} />);
    const notice = screen.getByTestId("change-feed-infra-error");
    expect(notice.textContent).toMatch(/couldn.t load/i);
    expect(screen.queryByTestId("change-feed-summary")).toBeNull();
  });

  it("carries the #changes hash anchor", () => {
    const { container } = render(
      <ChangesSection
        feed={{ entries: [], truncated: false }}
        now={NOW}
        showId={SHOW_ID}
        {...actions()}
      />,
    );
    const section = screen.getByTestId("changes-section");
    expect(section.id).toBe("changes");
    expect(container.querySelector("#changes")).toBe(section);
  });
});

// ── (b) wiring into the real ShowReviewSurface ──────────────────────────────
function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Published Fixture Show",
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
      raw_unrecognized: [{ block: "Mystery block", key: "k", value: "v" }],
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

/** Harness: the SHELL owns the scroll container ref (spec §3.1) — supply it via useRef. */
function SurfaceHarness() {
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
          render: () => <div data-testid="overview-section" id="overview" />,
        },
      ]}
      extraSectionsAfter={[
        {
          id: "changes",
          label: "Changes",
          Icon: Clock,
          render: () => (
            <ChangesSection
              feed={{ entries: [feedEntry("Auto-applied edit")], truncated: false }}
              now={NOW}
              showId={SHOW_ID}
              {...actions()}
            />
          ),
        },
      ]}
    />
  );
}

describe("ChangesSection wired into ShowReviewSurface (spec §5.3a / §5.4)", () => {
  it("(b) Changes is LAST in the panel column with the #changes anchor; Overview precedes the registry warnings section", () => {
    render(<SurfaceHarness />);

    const changes = screen.getByTestId("changes-section");
    expect(changes.id).toBe("changes");

    const overview = screen.getByTestId("overview-section");
    const warnings = document.querySelector<HTMLElement>(
      '[data-testid$="review-section-warnings"]',
    );
    expect(warnings).not.toBeNull();

    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    // Overview (extraSectionsBefore) precedes the registry warnings section.
    expect(before(overview, warnings!)).toBe(true);
    // Registry warnings precede Changes (extraSectionsAfter).
    expect(before(warnings!, changes)).toBe(true);

    // Changes is the LAST panel — every registry section precedes it.
    const registrySections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid*="review-section-"]'),
    );
    expect(registrySections.length).toBeGreaterThan(0);
    for (const s of registrySections) expect(before(s, changes)).toBe(true);
  });
});

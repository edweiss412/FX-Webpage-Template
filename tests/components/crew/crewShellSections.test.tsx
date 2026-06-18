// @vitest-environment jsdom
/**
 * tests/components/crew/crewShellSections.test.tsx (Task 11 — R8-HIGH-2)
 *
 * Pins that CrewShell's section dispatcher renders the REAL section component
 * for each `rawSection`, not the Phase-2 placeholder text. The companion suite
 * crewShell.test.tsx (which mocks every section/hero away) asserts the
 * producer-contract wiring; THIS suite asserts the opposite axis — that the
 * dispatched section actually mounts and emits its own distinctive DOM. The
 * core failure mode this catches: the route still rendering placeholder
 * `<section data-testid="section-venue">venue</section>` for `?s=venue` while
 * every section unit test passes green in isolation.
 *
 * Strategy: mock ONLY the page chrome (Header / CrewSubNav / CrewSectionTransition
 * / ShowRealtimeBridge / Footer / IdentityChip) so we don't drag in framer-motion
 * route transitions, the Supabase realtime client, or the report-modal fetch
 * machinery. The seven sections AND the RightNowHero render REAL — RightNowHero is
 * a `'use client'` island that reads matchMedia on mount, so (mirroring the
 * section unit tests) we stub matchMedia; its real animation wiring runs.
 *
 * R8-HIGH-1 today-threading: a frozen clock near a UTC day boundary
 * (2026-05-15T02:00:00Z = 2026-05-14 in America/New_York) with showDays spanning
 * both calendar days proves CrewShell threads `await nowDate()` into the section:
 * the pinned `schedule-day-today` card is the SHOW-timezone date (2026-05-14),
 * derived in-test via `todayIsoInShowTimezone`.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

// Pin the server clock so the producer's `await nowDate()` is deterministic.
// Default is mid-show-day; the tz-pin test overrides it per-render.
const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-05-14T15:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// ---- Mock the page CHROME (not the sections, not the hero) ------------------

vi.mock("@/components/layout/Header", () => ({
  Header: ({ identityChip, statusPill }: { identityChip?: ReactNode; statusPill?: ReactNode }) => (
    <header data-testid="mock-header">
      {statusPill !== undefined && statusPill !== null ? statusPill : null}
      {identityChip !== undefined && identityChip !== null ? identityChip : null}
    </header>
  ),
}));

vi.mock("@/components/auth/IdentityChip", () => ({
  IdentityChip: () => <span data-testid="mock-identity-chip" />,
}));

vi.mock("@/components/crew/CrewSubNav", () => ({
  CrewSubNav: ({
    activeSection,
    budgetVisible,
  }: {
    activeSection: string;
    budgetVisible: boolean;
  }) => (
    <nav
      data-testid="crew-sub-nav"
      data-active-section={activeSection}
      data-budget-visible={String(budgetVisible)}
    />
  ),
}));

// Passthrough — render children so the dispatched section appears in the DOM,
// without pulling in framer-motion's AnimatePresence.
vi.mock("@/components/crew/CrewSectionTransition", () => ({
  CrewSectionTransition: ({ sectionId, children }: { sectionId: string; children: ReactNode }) => (
    <div data-testid="crew-section-transition" data-section-id={sectionId}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => <div data-testid="mock-realtime-bridge" />,
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: (props: { reportAutocapture?: { rightNowState?: unknown } }) => (
    <footer
      data-testid="mock-footer"
      data-has-right-now-state={String(Boolean(props.reportAutocapture?.rightNowState))}
    />
  ),
}));

beforeEach(() => {
  // jsdom has no matchMedia; the REAL RightNowHero reads it on mount. Stub it
  // (matches:false = no reduced-motion preference) so the hero's real wiring
  // runs — mirrors the section unit tests.
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

// ---- Render helper ----------------------------------------------------------

async function renderShell(props: {
  data: ShowForViewer;
  viewer: Viewer;
  showId?: string;
  rawSection?: string | undefined;
}) {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: props.data,
    viewer: props.viewer,
    showId: props.showId ?? "show-1",
    rawSection: props.rawSection,
    slug: "acme-2026",
  });
  render(element);
}

const CREW_ID = "c1";

// A populated projection so each real section has something distinctive to
// render. Crew row id "c1" matches the default fixture crewMembers[0].id.
function populated(
  overrides?: Parameters<typeof makeShowForViewer>[0],
): ShowForViewer {
  return makeShowForViewer({
    show: {
      dates: {
        travelIn: "2026-05-12",
        set: "2026-05-13",
        showDays: ["2026-05-14", "2026-05-15"],
        travelOut: "2026-05-16",
      },
      venue: { name: "Center Arena", address: "5 Avenue", notes: null },
      coi_status: "Approved",
      event_details: {},
    },
    rooms: [{ id: "r1", kind: "gs", name: "Main", audio: "2x SM58", video: "1x PTZ", lighting: "8x par" }],
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Grand Hyatt",
        hotel_address: "1 Hotel Rd",
        check_in: "2026-05-13",
        check_out: "2026-05-16",
        names: [],
        confirmation_no: "CONF-9",
        notes: null,
      },
    ],
    contacts: [{ kind: "venue", name: "Sam Venue", phone: "555-111-2222", email: null, notes: null }],
    ...overrides,
  });
}

const adminViewer: Viewer = { kind: "admin" };
const crewViewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };

// ============================================================================
// today (and undefined) → REAL TodaySection: hero + today-tonight, no placeholder
// ============================================================================
describe("CrewShell dispatches the real TodaySection", () => {
  it.each<[label: string, rawSection: string | undefined]>([
    ["today", "today"],
    ["undefined", undefined],
  ])("rawSection=%s renders the RightNowHero and the today-tonight card", async (_l, rawSection) => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection });
    expect(screen.getByTestId("right-now-hero")).toBeTruthy();
    expect(screen.getByTestId("today-tonight")).toBeTruthy();
    // Real TodaySection root, not the Phase-2 placeholder.
    expect(screen.getByTestId("section-today")).toBeTruthy();
  });

  it("does NOT double-render the hero — only ONE right-now-hero (TodaySection owns it)", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "today" });
    expect(screen.getAllByTestId("right-now-hero")).toHaveLength(1);
  });
});

// ============================================================================
// venue → REAL VenueSection: coi-status / address; NO hero
// ============================================================================
describe("CrewShell dispatches the real VenueSection", () => {
  it("rawSection=venue renders the coi-status surface and NO hero", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "venue" });
    expect(screen.getByTestId("section-venue")).toBeTruthy();
    expect(screen.getByTestId("coi-status")).toBeTruthy();
    expect(screen.queryByTestId("right-now-hero")).toBeNull();
  });
});

// ============================================================================
// schedule → REAL ScheduleSection: a schedule-day-* card
// ============================================================================
describe("CrewShell dispatches the real ScheduleSection", () => {
  it("rawSection=schedule renders schedule-day cards (none-restriction → every aggregate day)", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "schedule" });
    expect(screen.getByTestId("section-schedule")).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="schedule-day"]').length).toBeGreaterThan(0);
    expect(screen.queryByTestId("right-now-hero")).toBeNull();
  });
});

// ============================================================================
// gear → REAL GearSection: a gear-scope-* card (rooms populated)
// ============================================================================
describe("CrewShell dispatches the real GearSection", () => {
  it("rawSection=gear renders a gear-scope card from populated rooms", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "gear" });
    expect(screen.getByTestId("section-gear")).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="gear-scope-"]').length).toBeGreaterThan(0);
  });
});

// ============================================================================
// crew → REAL CrewSection: a crew-person-row
// ============================================================================
describe("CrewShell dispatches the real CrewSection", () => {
  it("rawSection=crew renders a crew-person-row", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "crew" });
    expect(screen.getByTestId("section-crew")).toBeTruthy();
    expect(screen.getByTestId("crew-person-row")).toBeTruthy();
  });
});

// ============================================================================
// travel → REAL TravelSection: the hotels block (hotelReservations populated)
// ============================================================================
describe("CrewShell dispatches the real TravelSection", () => {
  it("rawSection=travel renders the hotels block from hotelReservations", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "travel" });
    expect(screen.getByTestId("section-travel")).toBeTruthy();
    expect(screen.getByTestId("travel-hotels")).toBeTruthy();
  });
});

// ============================================================================
// budget → REAL BudgetSection for a LEAD; today fallback for a non-lead (R2-HIGH-1)
// ============================================================================
describe("CrewShell dispatches the real BudgetSection, gated", () => {
  it("rawSection=budget for a LEAD viewer (+ financials) renders the financials content", async () => {
    const leadData = populated({
      financials: { po: "PO-7", proposal: "P", invoice: "I", invoice_notes: "N" },
      crewMembers: [
        {
          id: CREW_ID,
          name: "Lena Lead",
          email: null,
          phone: null,
          role: "",
          roleFlags: ["LEAD"],
          dateRestriction: { kind: "none" },
          stageRestriction: { kind: "none" },
        },
      ],
    });
    await renderShell({ data: leadData, viewer: crewViewer, rawSection: "budget" });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("budget");
    expect(screen.queryByTestId("section-today")).toBeNull();
    expect(document.body.textContent).toContain("PO-7");
  });

  it("rawSection=budget for a NON-LEAD viewer falls back to the today hero (budget gated)", async () => {
    // Default fixture crewMembers[0] (id c1) has roleFlags: [] → not a lead.
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "budget" });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("today");
    // The Today hero is what renders, NOT budget content.
    expect(screen.getByTestId("right-now-hero")).toBeTruthy();
    expect(document.body.textContent).not.toContain("PO-7");
  });
});

// ============================================================================
// R8-HIGH-1 — CrewShell threads `await nowDate()` into the section (tz today-pin)
// ============================================================================
describe("CrewShell threads today into the dispatched section (R8-HIGH-1)", () => {
  it("pins schedule-day-today to the SHOW-timezone date, not the UTC date", async () => {
    // 2026-05-15T02:00:00Z is 2026-05-14 in America/New_York (the show-tz default).
    const FROZEN = new Date("2026-05-15T02:00:00Z");
    nowDate.mockResolvedValueOnce(FROZEN);

    const data = populated();
    // Derive the expected pinned date the SAME way the section does — from the
    // show timezone, not by hardcoding — so the assertion can't pass by accident.
    const expectedTodayIso = todayIsoInShowTimezone(data.show, FROZEN);
    expect(expectedTodayIso).toBe("2026-05-14"); // sanity: tz boundary actually crossed

    await renderShell({ data, viewer: adminViewer, rawSection: "schedule" });

    const pinned = screen.getByTestId("schedule-day-today");
    expect(pinned).toBeTruthy();
    // The pinned card is the show-tz day (2026-05-14); the UTC day (2026-05-15)
    // is a DIFFERENT, non-pinned card.
    expect(pinned.textContent).toContain(expectedTodayIso);
    expect(screen.getByTestId(`schedule-day-2026-05-15`)).toBeTruthy();
    expect(screen.queryByTestId(`schedule-day-2026-05-14`)).toBeNull(); // 05-14 is the pinned one
  });
});

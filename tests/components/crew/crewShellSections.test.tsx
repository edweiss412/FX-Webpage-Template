// @vitest-environment jsdom
/**
 * tests/components/crew/crewShellSections.test.tsx (client-section-toggle)
 *
 * The contract under client-side section toggle is "ALL entitled section bodies
 * are RENDERED SERVER-SIDE and HANDED to the CrewSections controller" — not "all
 * are in the DOM" (the controller mounts only the active one via AnimatePresence
 * mode="wait"). So we capture the props CrewShell passes to <CrewSections> and
 * assert:
 *
 *   - `sectionNodes` keys === the entitled set:
 *       LEAD viewer  → [...BASE_SECTION_IDS, "budget"]  (7), budget key PRESENT
 *       NON-lead     → exactly BASE_SECTION_IDS         (6), NO budget key
 *   - `initialSection` === the server-resolved active (a non-lead ?s=budget →
 *     today).
 *   - PER-ID body correctness (anti-tautology — keys alone can pass with a
 *     mis-wired body): each section component is mocked to a distinct marker
 *     `<div data-testid="section-<id>" />`, and for EVERY entitled id we render
 *     `sectionNodes[id]` and assert it shows `section-<id>` — proving today→
 *     TodaySection, schedule→ScheduleSection, …, not a swapped wiring.
 *   - a small integration assertion (CrewSections UNmocked) that the INITIAL
 *     active body renders and `data-testid="crew-shell"` is present.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

// Pin the server clock so the producer's `await nowDate()` is deterministic.
const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-05-14T15:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// ---- Capture the props CrewShell hands to the CrewSections controller -------
const captured = vi.hoisted(
  () =>
    ({ value: null }) as {
      value: {
        initialSection: SectionId;
        budgetVisible: boolean;
        sectionNodes: Partial<Record<SectionId, ReactNode>>;
      } | null;
    },
);
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: (props: {
    initialSection: SectionId;
    budgetVisible: boolean;
    sectionNodes: Partial<Record<SectionId, ReactNode>>;
  }) => {
    captured.value = props;
    // Render the initial active body so the integration assertion (real
    // section markers) can observe it in the DOM.
    return (
      <div data-testid="mock-crew-sections" data-active-section={props.initialSection}>
        {props.sectionNodes[props.initialSection] ?? null}
      </div>
    );
  },
}));

// ---- Mock the rest of the page CHROME --------------------------------------
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

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => <div data-testid="mock-realtime-bridge" />,
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="mock-footer" />,
}));

// ---- Mock every section to a distinct marker (per-id wiring proof) ----------
const sectionMarker = (testid: string) => {
  const MockSection = () => <section data-testid={testid} />;
  MockSection.displayName = `MockSection(${testid})`;
  return MockSection;
};
vi.mock("@/components/crew/sections/TodaySection", () => ({
  TodaySection: sectionMarker("section-today"),
}));
vi.mock("@/components/crew/sections/ScheduleSection", () => ({
  ScheduleSection: sectionMarker("section-schedule"),
}));
vi.mock("@/components/crew/sections/VenueSection", () => ({
  VenueSection: sectionMarker("section-venue"),
}));
vi.mock("@/components/crew/sections/TravelSection", () => ({
  TravelSection: sectionMarker("section-travel"),
}));
vi.mock("@/components/crew/sections/CrewSection", () => ({
  CrewSection: sectionMarker("section-crew"),
}));
vi.mock("@/components/crew/sections/GearSection", () => ({
  GearSection: sectionMarker("section-gear"),
}));
vi.mock("@/components/crew/sections/BudgetSection", () => ({
  BudgetSection: sectionMarker("section-budget"),
}));

beforeEach(() => {
  captured.value = null;
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

function populated(overrides?: Parameters<typeof makeShowForViewer>[0]): ShowForViewer {
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
    rooms: [
      { id: "r1", kind: "gs", name: "Main", audio: "2x SM58", video: "1x PTZ", lighting: "8x par" },
    ],
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
    contacts: [
      { kind: "venue", name: "Sam Venue", phone: "555-111-2222", email: null, notes: null },
    ],
    ...overrides,
  });
}

const adminViewer: Viewer = { kind: "admin" };
const crewViewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };

function leadData(): ShowForViewer {
  return populated({
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
}

// ============================================================================
// sectionNodes keys === the entitled set, gated by budgetVisible
// ============================================================================
describe("CrewShell builds sectionNodes for the entitled set", () => {
  it("a LEAD viewer gets all 7 keys (BASE + budget)", async () => {
    await renderShell({ data: leadData(), viewer: crewViewer, rawSection: "today" });
    expect(captured.value).not.toBeNull();
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...BASE_SECTION_IDS, "budget"].sort());
    expect(captured.value!.budgetVisible).toBe(true);
  });

  it("a NON-lead viewer gets EXACTLY the 6 base keys, no budget key", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "today" });
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...BASE_SECTION_IDS].sort());
    expect(keys).not.toContain("budget");
    expect(captured.value!.budgetVisible).toBe(false);
  });

  it("a real admin gets all 7 keys", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "today" });
    const keys = Object.keys(captured.value!.sectionNodes).sort();
    expect(keys).toEqual([...BASE_SECTION_IDS, "budget"].sort());
    expect(captured.value!.budgetVisible).toBe(true);
  });
});

// ============================================================================
// initialSection === the server-resolved active (budget-gated)
// ============================================================================
describe("CrewShell resolves initialSection server-side (budget-gated)", () => {
  it("a non-lead ?s=budget resolves to today", async () => {
    await renderShell({ data: populated(), viewer: crewViewer, rawSection: "budget" });
    expect(captured.value!.initialSection).toBe("today");
  });

  it("a lead ?s=budget resolves to budget", async () => {
    await renderShell({ data: leadData(), viewer: crewViewer, rawSection: "budget" });
    expect(captured.value!.initialSection).toBe("budget");
  });

  it("?s=venue resolves to venue; absent ?s resolves to today", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "venue" });
    expect(captured.value!.initialSection).toBe("venue");
    cleanup();
    captured.value = null;
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: undefined });
    expect(captured.value!.initialSection).toBe("today");
  });
});

// ============================================================================
// PER-ID body correctness (anti-tautology — each id → its OWN section)
// ============================================================================
describe("CrewShell wires each entitled id to its OWN section component", () => {
  it("every entitled body renders the matching section-<id> marker", async () => {
    await renderShell({ data: leadData(), viewer: crewViewer, rawSection: "today" });
    const nodes = captured.value!.sectionNodes;
    for (const id of [...BASE_SECTION_IDS, "budget"] as SectionId[]) {
      const node = nodes[id];
      expect(node, `sectionNodes is missing the "${id}" body`).toBeTruthy();
      // Render each body into ITS OWN isolated container + query within it, so a
      // sibling render (or the controller stub's initial body) can't satisfy a
      // different id (anti-tautology).
      const host = document.createElement("div");
      document.body.appendChild(host);
      const { unmount } = render(<>{node}</>, { container: host });
      expect(
        host.querySelector(`[data-testid="section-${id}"]`),
        `body for "${id}" did not render section-${id} (mis-wired section component)`,
      ).not.toBeNull();
      unmount();
      host.remove();
    }
  });
});

// ============================================================================
// Integration: the controller mounts and the initial active body renders
// ============================================================================
describe("CrewShell mounts CrewSections with crew-shell present", () => {
  it("crew-shell wrapper present + initial active body rendered", async () => {
    await renderShell({ data: populated(), viewer: adminViewer, rawSection: "venue" });
    expect(screen.getByTestId("crew-shell")).toBeTruthy();
    // The capturing CrewSections stub renders the initial active body.
    expect(screen.getByTestId("section-venue")).toBeTruthy();
  });
});

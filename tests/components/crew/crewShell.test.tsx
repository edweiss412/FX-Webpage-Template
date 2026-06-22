// @vitest-environment jsdom
/**
 * tests/components/crew/crewShell.test.tsx (Task 11)
 *
 * Pins the full CrewShell Server Component contract:
 *   - Test 21  fail-closed: a malformed crewMembers projection (not an array)
 *     for a crew AND an admin_preview viewer renders the
 *     <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED"> arm and NO section
 *     content (no sub-nav, no section-* body).
 *   - Test 23  the realtime bridge receives renderVersion === viewerVersionToken
 *     and showId === the showId PROP (exact).
 *   - Test 19-port  the Footer report props differ by viewer kind exactly as
 *     _ShowBody.tsx does (admin_preview → surface=admin + preview surfaceId +
 *     crewPreview autocapture; crew → surface=crew, no override id, no preview).
 *   - Test 8  the preview-as Budget gate: a NON-LEAD previewed crew asking for
 *     ?s=budget lands on "today" (Budget not entered, no Budget tab); a LEAD
 *     previewed crew (or a real admin) reaches "budget".
 *   - Test 16  the projection-alert upsert is section-independent and carries
 *     the render's OWN unfiltered tileErrors keys (sorted), the constant
 *     message, sheet_name === show.title, and no viewer/version identifiers;
 *     healthy → no call; rejection → fail-quiet.
 *   - identityChip threads into Header for a crew viewer and is absent for admin
 *     and on the malformed TerminalFailure path.
 *
 * Strategy: the heavy client islands (Header / CrewSubNav / CrewSectionTransition
 * / ShowRealtimeBridge / RightNowHero / Footer / IdentityChip / TerminalFailure)
 * are mocked to render their incoming props as inspectable DOM so the producer's
 * wiring is asserted directly, without dragging in framer-motion / the Supabase
 * realtime client / the report-modal fetch machinery.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

// Pin the server clock so the producer's `await nowDate()` is deterministic.
const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-04-17T12:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// ---- Mock the composed islands so we can read the props CrewShell passes ----

vi.mock("@/components/layout/Header", () => ({
  Header: ({ identityChip, statusPill }: { identityChip?: ReactNode; statusPill?: ReactNode }) => (
    <header data-testid="mock-header">
      {statusPill !== undefined && statusPill !== null ? (
        <div data-testid="header-status-pill">{statusPill}</div>
      ) : null}
      {identityChip !== undefined && identityChip !== null ? identityChip : null}
    </header>
  ),
}));

vi.mock("@/components/auth/IdentityChip", () => ({
  IdentityChip: ({ name, role }: { name: string; role: string }) => (
    <span data-testid="mock-identity-chip" data-name={name} data-role={role} />
  ),
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

vi.mock("@/components/crew/CrewSectionTransition", () => ({
  CrewSectionTransition: ({ sectionId, children }: { sectionId: string; children: ReactNode }) => (
    <div data-testid="crew-section-transition" data-section-id={sectionId}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/crew/RightNowHero", () => ({
  RightNowHero: ({ context }: { context: { showTitle?: string } }) => (
    <div data-testid="mock-right-now-hero" data-show-title={context.showTitle ?? ""} />
  ),
}));

// Task 11 wires the REAL section components into CrewShell's dispatcher. This
// suite pins the shell's producer/wiring contracts (fail-closed, alert,
// realtime-bridge, footer report props, budget gate, identityChip, status pill)
// against hand-built thin fixtures whose `show` omits fields the real sections
// dereference (e.g. `agenda_links`). Section CONTENT is out of scope here (it is
// pinned by the section unit tests + crewShellSections.test.tsx), so each section
// is mocked to a lightweight marker. The Today mock renders the (mocked)
// RightNowHero so the existing "Today path → hero built from the projection"
// assertion (data-show-title) is preserved — the shell still routes ?s=today to
// a Today surface that leads with the hero.
const sectionMarker = (testid: string) => {
  const MockSection = () => <section data-testid={testid} />;
  MockSection.displayName = `MockSection(${testid})`;
  return MockSection;
};
vi.mock("@/components/crew/sections/TodaySection", () => ({
  TodaySection: ({ data }: { data: ShowForViewer }) => (
    <section data-testid="section-today">
      <div data-testid="mock-right-now-hero" data-show-title={data.show.title ?? ""} />
    </section>
  ),
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

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: ({
    showId,
    slug,
    renderVersion,
  }: {
    showId: string;
    slug: string;
    renderVersion: string;
  }) => (
    <div
      data-testid="mock-realtime-bridge"
      data-show-id={showId}
      data-slug={slug}
      data-render-version={renderVersion}
    />
  ),
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: (props: {
    reportSurfaceOverride?: string;
    reportSurfaceIdOverride?: string;
    reportAutocapture?: { crewPreview?: unknown };
    lastSyncedAt?: string | null;
    lastSyncStatus?: string | null;
  }) => (
    <footer
      data-testid="mock-footer"
      data-surface-override={props.reportSurfaceOverride ?? ""}
      data-surface-id-override={
        props.reportSurfaceIdOverride === undefined ? "__absent__" : props.reportSurfaceIdOverride
      }
      data-has-crew-preview={String(Boolean(props.reportAutocapture?.crewPreview))}
    />
  ),
}));

// TerminalFailure is a real Server Component but pulls in the message catalog;
// stub it to a flat marker carrying the code so the fail-closed arm is testable
// without the lookup table.
vi.mock("@/components/auth/TerminalFailure", () => ({
  TerminalFailure: ({ code, retryHref }: { code: string; retryHref?: string }) => (
    <main
      data-testid="terminal-failure"
      data-code={code}
      data-has-retry={String(retryHref !== undefined)}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---- Fixtures ---------------------------------------------------------------

type CrewRow = ShowForViewer["crewMembers"][number];

const LEAD_ID = "crew-lead";
const HAND_ID = "crew-hand";

function crewRow(id: string, role: string, roleFlags: CrewRow["roleFlags"]): CrewRow {
  return {
    id,
    name: id === LEAD_ID ? "Lena Lead" : "Hank Hand",
    email: null,
    phone: null,
    role,
    roleFlags,
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
  };
}

/**
 * Build a well-formed projection. `crewMembers` defaults to a LEAD + a hand so
 * the preview-as Budget gate can pick either id. `crewMembersOverride` lets a
 * test inject the malformed (non-array) shape.
 */
function makeData(opts?: {
  tileErrors?: Record<string, string>;
  crewMembersOverride?: unknown;
  dates?: ShowForViewer["show"]["dates"];
}): ShowForViewer {
  const base = {
    show: {
      title: "Acme Show",
      client_label: null,
      venue: { name: "Acme Arena" },
      dates: opts?.dates ?? { travelIn: null, set: null, showDays: [], travelOut: null },
      event_details: {},
    },
    crewMembers:
      opts && "crewMembersOverride" in opts
        ? opts.crewMembersOverride
        : [crewRow(LEAD_ID, "L1", ["LEAD"]), crewRow(HAND_ID, "A2", ["A2"])],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: null,
    openingReelHasVideo: false,
    lastSyncedAt: "2026-04-16T00:00:00Z",
    lastSyncStatus: "ok",
    tileErrors: opts?.tileErrors ?? {},
    viewerVersionToken: "vtoken-xyz",
  };
  return base as unknown as ShowForViewer;
}

async function renderShell(props: {
  data: ShowForViewer;
  viewer: Viewer;
  showId: string;
  rawSection?: string | undefined;
  slug?: string;
  shareToken?: string;
  identityChip?: { name: string; role: string; shareToken: string } | null;
}) {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: props.data,
    viewer: props.viewer,
    showId: props.showId,
    rawSection: props.rawSection,
    slug: props.slug ?? "acme-2026",
    ...(props.shareToken !== undefined ? { shareToken: props.shareToken } : {}),
    ...(props.identityChip !== undefined ? { identityChip: props.identityChip } : {}),
  });
  render(element);
}

const adminViewer: Viewer = { kind: "admin" };

// ============================================================================
// Test 21 — fail-closed on a malformed crewMembers projection (both viewers)
// ============================================================================
describe("CrewShell fail-closed on malformed projection (Test 21)", () => {
  it.each<[label: string, viewer: Viewer]>([
    ["crew", { kind: "crew", crewMemberId: HAND_ID }],
    ["admin_preview", { kind: "admin_preview", crewMemberId: HAND_ID }],
  ])(
    "renders the PICKER_RESOLVER_LOOKUP_FAILED terminal arm with no section content for a %s viewer",
    async (_label, viewer) => {
      await renderShell({
        data: makeData({ crewMembersOverride: "not-an-array" }),
        viewer,
        showId: "show-malformed",
      });
      const failure = screen.getByTestId("terminal-failure");
      expect(failure.getAttribute("data-code")).toBe("PICKER_RESOLVER_LOOKUP_FAILED");
      // §4.14: the body TerminalFailure carries NO retryHref.
      expect(failure.getAttribute("data-has-retry")).toBe("false");
      // No section content leaks past the fail-closed arm.
      expect(screen.queryByTestId("crew-sub-nav")).toBeNull();
      expect(screen.queryByTestId("crew-section-transition")).toBeNull();
      expect(screen.queryByTestId("mock-realtime-bridge")).toBeNull();
      // No identity chip on the failure path.
      expect(screen.queryByTestId("mock-identity-chip")).toBeNull();
    },
  );
});

// ============================================================================
// Test 23 — ShowRealtimeBridge renderVersion + showId
// ============================================================================
describe("CrewShell wires ShowRealtimeBridge (Test 23)", () => {
  it("passes renderVersion === data.viewerVersionToken and showId === the prop", async () => {
    await renderShell({
      data: makeData(),
      viewer: adminViewer,
      showId: "show-realtime-prop",
    });
    const bridge = screen.getByTestId("mock-realtime-bridge");
    expect(bridge.getAttribute("data-render-version")).toBe("vtoken-xyz");
    expect(bridge.getAttribute("data-show-id")).toBe("show-realtime-prop");
  });
});

// ============================================================================
// Test 19-port — Footer report props differ by viewer kind
// ============================================================================
describe("CrewShell Footer report-prop contract (Test 19-port)", () => {
  it("admin_preview viewer → surface=admin, preview surfaceId, crewPreview populated", async () => {
    await renderShell({
      data: makeData(),
      viewer: { kind: "admin_preview", crewMemberId: LEAD_ID },
      showId: "show-fp",
      slug: "acme-2026",
    });
    const footer = screen.getByTestId("mock-footer");
    expect(footer.getAttribute("data-surface-override")).toBe("admin");
    // Port of _ShowBody.tsx:535 — `admin-preview-footer-<slug>-<crewMemberId>`.
    expect(footer.getAttribute("data-surface-id-override")).toBe(
      "admin-preview-footer-acme-2026-crew-lead",
    );
    expect(footer.getAttribute("data-has-crew-preview")).toBe("true");
  });

  it("crew viewer → surface=crew, no override id, no crewPreview", async () => {
    await renderShell({
      data: makeData(),
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-fp",
    });
    const footer = screen.getByTestId("mock-footer");
    expect(footer.getAttribute("data-surface-override")).toBe("crew");
    expect(footer.getAttribute("data-surface-id-override")).toBe("__absent__");
    expect(footer.getAttribute("data-has-crew-preview")).toBe("false");
  });
});

// ============================================================================
// Test 8 — preview-as Budget gate (single financialsVisible authority)
// ============================================================================
describe("CrewShell Budget gate is the financialsVisible authority (Test 8)", () => {
  it("admin previewing a NON-LEAD crew + ?s=budget → today (Budget not entered, no Budget tab)", async () => {
    await renderShell({
      data: makeData(),
      viewer: { kind: "admin_preview", crewMemberId: HAND_ID },
      showId: "show-gate",
      rawSection: "budget",
    });
    const shell = screen.getByTestId("crew-shell");
    expect(shell.getAttribute("data-active-section")).toBe("today");
    const nav = screen.getByTestId("crew-sub-nav");
    expect(nav.getAttribute("data-budget-visible")).toBe("false");
  });

  it("admin previewing a LEAD crew + ?s=budget → budget", async () => {
    await renderShell({
      data: makeData(),
      viewer: { kind: "admin_preview", crewMemberId: LEAD_ID },
      showId: "show-gate",
      rawSection: "budget",
    });
    const shell = screen.getByTestId("crew-shell");
    expect(shell.getAttribute("data-active-section")).toBe("budget");
    expect(screen.getByTestId("crew-sub-nav").getAttribute("data-budget-visible")).toBe("true");
  });

  it("real admin + ?s=budget → budget", async () => {
    await renderShell({
      data: makeData(),
      viewer: adminViewer,
      showId: "show-gate",
      rawSection: "budget",
    });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("budget");
    expect(screen.getByTestId("crew-sub-nav").getAttribute("data-budget-visible")).toBe("true");
  });
});

// ============================================================================
// Test 16 — section-independent projection alert + observed-key boundary
// ============================================================================
describe("CrewShell projection alert is section-independent (Test 16)", () => {
  it("fires exactly ONE TILE_PROJECTION_FETCH_FAILED with sorted keys, show title, no viewer/version ids — for a non-today section", async () => {
    upsertAdminAlert.mockResolvedValue("alert-1");
    await renderShell({
      data: makeData({ tileErrors: { hotel: "boom", rooms: "boom", contacts: "boom" } }),
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-alert",
      rawSection: "crew", // NOT today — proves the alert is section-independent
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const arg = upsertAdminAlert.mock.calls[0]![0] as {
      showId: unknown;
      code: unknown;
      context: Record<string, unknown>;
    };
    expect(arg.showId).toBe("show-alert");
    expect(arg.code).toBe("TILE_PROJECTION_FETCH_FAILED");
    expect(arg.context.failedKeys).toEqual(["contacts", "hotel", "rooms"]);
    expect(arg.context.sheet_name).toBe("Acme Show");
    expect(arg.context.tileId).toBe("crew:projection-alert");
    expect(typeof arg.context.message).toBe("string");
    expect((arg.context.message as string).length).toBeGreaterThan(0);
    expect(arg.context).not.toHaveProperty("signature");
    expect(arg.context).not.toHaveProperty("viewerVersionToken");
    // The active section still renders (alert is best-effort, not a gate).
    expect(screen.getByTestId("section-crew")).toBeTruthy();
  });

  it("fires NO upsert when the projection is healthy", async () => {
    await renderShell({
      data: makeData({ tileErrors: {} }),
      viewer: adminViewer,
      showId: "show-healthy",
    });
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  it("renders (fail-quiet) even when the upsert rejects", async () => {
    upsertAdminAlert.mockRejectedValue(new Error("rpc down"));
    await renderShell({
      data: makeData({ tileErrors: { hotel: "boom" } }),
      viewer: adminViewer,
      showId: "show-x",
    });
    // The shell still produced its body despite the rejected observability write.
    expect(screen.getByTestId("crew-shell")).toBeTruthy();
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  });

  // Observed-key boundary (R1-MEDIUM-4): the producer sends the render's OWN
  // tileErrors keys, with NO visibility filtering. A lead render whose
  // tileErrors include `financials` → failedKeys include `financials`; a crew
  // render without it → no `financials`; BOTH carry `transportation`.
  it("sends the unfiltered tileErrors keys — financials present on a lead render", async () => {
    upsertAdminAlert.mockResolvedValue("alert-2");
    await renderShell({
      data: makeData({ tileErrors: { financials: "boom", transportation: "boom" } }),
      viewer: { kind: "crew", crewMemberId: LEAD_ID },
      showId: "show-lead-keys",
    });
    const arg = upsertAdminAlert.mock.calls[0]![0] as { context: { failedKeys: string[] } };
    expect(arg.context.failedKeys).toEqual(["financials", "transportation"]);
  });

  it("sends the unfiltered tileErrors keys — no financials on a crew render that lacked it", async () => {
    upsertAdminAlert.mockResolvedValue("alert-3");
    await renderShell({
      data: makeData({ tileErrors: { transportation: "boom" } }),
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-crew-keys",
    });
    const arg = upsertAdminAlert.mock.calls[0]![0] as { context: { failedKeys: string[] } };
    expect(arg.context.failedKeys).toEqual(["transportation"]);
    expect(arg.context.failedKeys).not.toContain("financials");
  });

  // VERIFICATION-ONLY (Task 02.6 — green by construction).
  // CrewShell already forwards the render's OWN unfiltered tileErrors keys into
  // context.failedKeys (line 142: `Object.keys(data.tileErrors).sort()`), and
  // Task 02.5 sets tileErrors["run_of_show"] on projection failure. This pin is
  // a durable regression guard against a future allowlist that drops run_of_show.
  //
  // Negative-regression procedure (mandatory per AGENTS.md anti-tautology rule):
  //   1. In _CrewShell.tsx, temporarily replace line 142 with:
  //      const ALLOWED = ["contacts","financials","hotel","rooms","transportation"];
  //      const failedKeys = Object.keys(data.tileErrors).filter(k => ALLOWED.includes(k)).sort();
  //   2. Run: pnpm vitest run tests/components/crew/crewShell.test.tsx --reporter=verbose
  //   3. THIS assertion fails: Expected ["run_of_show"] to include "run_of_show" (received [])
  //   4. Revert the stub — the pass-through is unfiltered and this pin is real.
  it("run_of_show is a first-class failedKeys domain (viewer-independent — present on a plain crew render)", async () => {
    upsertAdminAlert.mockResolvedValue("alert-ros");
    await renderShell({
      data: makeData({ tileErrors: { run_of_show: "boom" } }),
      viewer: { kind: "crew", crewMemberId: HAND_ID }, // a NON-lead crew member
      showId: "show-ros-keys",
    });
    const arg = upsertAdminAlert.mock.calls[0]![0] as { context: { failedKeys: string[] } };
    expect(arg.context.failedKeys).toContain("run_of_show");
  });
});

// ============================================================================
// identityChip threading
// ============================================================================
describe("CrewShell identityChip threading", () => {
  it("a crew viewer with an identityChip renders the chip inside the header", async () => {
    await renderShell({
      data: makeData(),
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-chip",
      slug: "acme-2026",
      shareToken: "tok-123",
      identityChip: { name: "Hank Hand", role: "A2", shareToken: "tok-123" },
    });
    const chip = screen.getByTestId("mock-identity-chip");
    expect(chip.getAttribute("data-name")).toBe("Hank Hand");
    expect(chip.getAttribute("data-role")).toBe("A2");
  });

  it("an admin viewer (identityChip null) renders no chip", async () => {
    await renderShell({
      data: makeData(),
      viewer: adminViewer,
      showId: "show-chip",
      identityChip: null,
    });
    expect(screen.queryByTestId("mock-identity-chip")).toBeNull();
  });
});

// ============================================================================
// Today section leads with the RightNowHero
// ============================================================================
describe("CrewShell Today section", () => {
  it("the Today section renders the RightNowHero built from the projection", async () => {
    await renderShell({
      data: makeData(),
      viewer: adminViewer,
      showId: "show-today",
      rawSection: undefined, // → today
    });
    const transition = screen.getByTestId("crew-section-transition");
    expect(transition.getAttribute("data-section-id")).toBe("today");
    const hero = screen.getByTestId("mock-right-now-hero");
    expect(hero.getAttribute("data-show-title")).toBe("Acme Show");
  });

  it("a non-today section renders the placeholder body, not the hero", async () => {
    await renderShell({
      data: makeData(),
      viewer: adminViewer,
      showId: "show-venue",
      rawSection: "venue",
    });
    expect(screen.getByTestId("section-venue")).toBeTruthy();
    expect(screen.queryByTestId("mock-right-now-hero")).toBeNull();
  });
});

// ============================================================================
// Header status pill (Task 14 — D-2 / wp-18): header-LEVEL, every section
// ============================================================================
// The pinned server clock (nowDate mock) is 2026-04-17T12:00:00Z which is
// 2026-04-17 in America/New_York (the selectRightNowState default tz). A show
// whose showDays include that date resolves to show_day_n — a non-degraded
// lifecycle pill.
describe("CrewShell Header status pill (Task 14 / D-2)", () => {
  const datedShow: ShowForViewer["show"]["dates"] = {
    travelIn: "2026-04-15",
    set: "2026-04-16",
    showDays: ["2026-04-17", "2026-04-18"],
    travelOut: "2026-04-19",
  };

  it("renders the status pill in the Header on a NON-Today section for a crew viewer (header-level, not hero-level)", async () => {
    await renderShell({
      data: makeData({ dates: datedShow }),
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-pill-crew",
      rawSection: "venue", // NOT today — proves the pill is header-level, not in the Today hero
    });
    // Header-level: present even though the Today hero is unmounted on Venue.
    expect(screen.queryByTestId("mock-right-now-hero")).toBeNull();
    const pill = screen.getByTestId("header-status-pill");
    expect(pill).toBeTruthy();
    // The compact show-lifecycle label is derived from the show date-state.
    expect(pill.textContent).toContain("Show day 1 of 2");
  });

  it("renders the status pill in the Header on a NON-Today section for an admin_preview viewer", async () => {
    await renderShell({
      data: makeData({ dates: datedShow }),
      viewer: { kind: "admin_preview", crewMemberId: HAND_ID },
      showId: "show-pill-preview",
      rawSection: "crew", // NOT today
    });
    expect(screen.queryByTestId("mock-right-now-hero")).toBeNull();
    const pill = screen.getByTestId("header-status-pill");
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain("Show day 1 of 2");
  });

  it("a dateless show renders the neutral 'Show details' pill (never blank), per the §4.3 degraded map", async () => {
    await renderShell({
      data: makeData(), // default fixture: all-null dates → dateless
      viewer: { kind: "crew", crewMemberId: HAND_ID },
      showId: "show-pill-dateless",
      rawSection: "venue",
    });
    const pill = screen.getByTestId("header-status-pill");
    expect(pill).toBeTruthy();
    // Neutral lifecycle label — no invented vocabulary, matches §4.3 unknown/dateless eyebrow.
    expect(pill.textContent).toContain("Show details");
  });
});

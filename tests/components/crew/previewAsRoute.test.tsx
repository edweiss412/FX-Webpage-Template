// @vitest-environment jsdom
/**
 * tests/components/crew/previewAsRoute.test.tsx (Task 13)
 *
 * Pins the admin "preview-as" route (app/admin/show/[slug]/preview/[crewId]/page.tsx)
 * after the ShowBody → CrewShell swap:
 *
 *   - The route renders <CrewShell> (NOT the legacy flat-grid ShowBody) with
 *     viewer.kind === "admin_preview" and NO shareToken.
 *   - The route passes the RAW `?s=` through to CrewShell as `rawSection` —
 *     CrewShell is the single activeSection authority. `{ s: "venue" }` →
 *     data-active-section="venue"; absent `s` → "today".
 *   - Budget gate (R2-HIGH-1): CrewShell resolves the Budget gate from the
 *     PREVIEWED crew's LEAD flag (isAdmin is false for an admin_preview viewer).
 *     A non-LEAD previewed crew requesting ?s=budget lands on "today"; a LEAD
 *     previewed crew reaches "budget". The previous route shortcut that let any
 *     previewing admin reach ?s=budget is removed by design.
 *   - showId passed to CrewShell is showLookup.id (the resolved show row id),
 *     not the slug.
 *
 * Strategy: the page's data layer (requireAdmin / Supabase show+crew lookups /
 * getShowForViewer) and the CrewShell's heavy islands are mocked so the render
 * exercises the real page → real CrewShell wiring. The previewed crew's LEAD
 * flag is controlled via the getShowForViewer mock's returned crewMembers row.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RoleFlag } from "@/lib/parser/types";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

const LEAD_ID = "crew-lead";
const HAND_ID = "crew-hand";
const SHOW_ID = "show-row-id-123";

// Mutable test state the mocks read from.
const state = vi.hoisted(() => ({
  previewCrewRoleFlags: [] as string[],
}));

// ---- Page data-layer mocks --------------------------------------------------

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// lookupShow / lookupCrewMember both read through createSupabaseServerClient.
// `shows` → the resolved (published, non-archived) row; `crew_members` → the
// previewed crew's display name/role (banner label only — auth flags come from
// getShowForViewer).
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.maybeSingle = async () => ({
        data:
          table === "shows"
            ? { id: SHOW_ID, published: true, archived: false }
            : { name: "Pat Preview", role: "A2" },
        error: null,
      });
      return builder;
    },
  }),
}));

// getShowForViewer is the single auth authority — its returned crewMembers row
// for crewId carries the LEAD (or not) flag that drives the Budget gate.
function crewRow(id: string, roleFlags: string[]): ShowForViewer["crewMembers"][number] {
  return {
    id,
    name: id === LEAD_ID ? "Lena Lead" : "Pat Preview",
    email: null,
    phone: null,
    role: "A2",
    roleFlags: roleFlags as RoleFlag[],
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
  };
}

const getShowForViewer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/getShowForViewer", () => ({ getShowForViewer }));

// The PreviewBanner is admin chrome above the shell — stub to a flat marker so
// the render does not drag in its internals.
vi.mock("@/components/admin/PreviewBanner", () => ({
  PreviewBanner: (props: { crewMemberName?: string; showId?: string }) => (
    <div
      data-testid="preview-banner"
      data-crew-name={props.crewMemberName ?? ""}
      data-show-id={props.showId ?? ""}
    />
  ),
}));

// ---- CrewShell island mocks (mirror crewShell.test.tsx) ---------------------

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-04-17T12:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

vi.mock("@/components/layout/Header", () => ({
  Header: ({ identityChip }: { identityChip?: ReactNode }) => (
    <header data-testid="mock-header">
      {identityChip !== undefined && identityChip !== null ? identityChip : null}
    </header>
  ),
}));

vi.mock("@/components/auth/IdentityChip", () => ({
  IdentityChip: ({ name, role }: { name: string; role: string }) => (
    <span data-testid="mock-identity-chip" data-name={name} data-role={role} />
  ),
}));

// Under client-side section toggle, _CrewShell renders all entitled section
// bodies and hands them to the <CrewSections> controller (a "use client" island
// that calls usePathname/useSearchParams). This suite pins the PAGE→SHELL wiring
// (activeSection authority via the shell's server-resolved value, showId
// threading, budget gate, banner placement), not the controller internals, so we
// mock CrewSections to a flat marker that surfaces its incoming props — and
// renders the initial active body — without dragging in next/navigation hooks.
// (The controller's own behavior is pinned by crewSections.test.tsx.)
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: ({
    initialSection,
    budgetVisible,
    sectionNodes,
  }: {
    initialSection: string;
    budgetVisible: boolean;
    sectionNodes: Record<string, ReactNode>;
  }) => (
    <div data-testid="mock-crew-sections">
      <nav
        data-testid="crew-sub-nav"
        data-active-section={initialSection}
        data-budget-visible={String(budgetVisible)}
      />
      <div data-testid="crew-section-transition" data-section-id={initialSection}>
        {sectionNodes[initialSection] ?? null}
      </div>
    </div>
  ),
}));

vi.mock("@/components/crew/RightNowHero", () => ({
  RightNowHero: ({ context }: { context: { showTitle?: string } }) => (
    <div data-testid="mock-right-now-hero" data-show-title={context.showTitle ?? ""} />
  ),
}));

// Task 11 wires the REAL section components into CrewShell's dispatcher. This
// suite pins the preview route's shell wiring (activeSection authority, showId
// threading, banner placement) against a thin fixture whose `show` omits fields
// the real sections dereference (e.g. `agenda_links`). Section CONTENT is pinned
// elsewhere (section unit tests + crewShellSections.test.tsx), so each section is
// mocked to a marker — mirroring the crewShell.test.tsx island-mock strategy.
const previewSectionMarker = (testid: string) => {
  const MockSection = () => <section data-testid={testid} />;
  MockSection.displayName = `MockSection(${testid})`;
  return MockSection;
};
vi.mock("@/components/crew/sections/TodaySection", () => ({
  TodaySection: previewSectionMarker("section-today"),
}));
vi.mock("@/components/crew/sections/ScheduleSection", () => ({
  ScheduleSection: previewSectionMarker("section-schedule"),
}));
vi.mock("@/components/crew/sections/VenueSection", () => ({
  VenueSection: previewSectionMarker("section-venue"),
}));
vi.mock("@/components/crew/sections/TravelSection", () => ({
  TravelSection: previewSectionMarker("section-travel"),
}));
vi.mock("@/components/crew/sections/CrewSection", () => ({
  CrewSection: previewSectionMarker("section-crew"),
}));
vi.mock("@/components/crew/sections/GearSection", () => ({
  GearSection: previewSectionMarker("section-gear"),
}));
vi.mock("@/components/crew/sections/BudgetSection", () => ({
  BudgetSection: previewSectionMarker("section-budget"),
}));

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: ({ showId, renderVersion }: { showId: string; renderVersion: string }) => (
    <div
      data-testid="mock-realtime-bridge"
      data-show-id={showId}
      data-render-version={renderVersion}
    />
  ),
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: (props: { reportSurfaceOverride?: string }) => (
    <footer data-testid="mock-footer" data-surface-override={props.reportSurfaceOverride ?? ""} />
  ),
}));

vi.mock("@/components/auth/TerminalFailure", () => ({
  TerminalFailure: ({ code }: { code: string }) => (
    <main data-testid="terminal-failure" data-code={code} />
  ),
}));

// ---- Fixtures ---------------------------------------------------------------

function makeData(): ShowForViewer {
  const base = {
    show: {
      title: "Acme Show",
      client_label: null,
      venue: { name: "Acme Arena" },
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      event_details: {},
    },
    crewMembers: [crewRow(HAND_ID, state.previewCrewRoleFlags), crewRow(LEAD_ID, ["LEAD"])],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: null,
    openingReelHasVideo: false,
    lastSyncedAt: "2026-04-16T00:00:00Z",
    lastSyncStatus: "ok",
    tileErrors: {},
    viewerVersionToken: "vtoken-xyz",
  };
  return base as unknown as ShowForViewer;
}

/**
 * Recursively resolve any async Server Component in a rendered element tree to
 * its awaited output. The page returns `<><PreviewBanner/><CrewShell/></>` where
 * CrewShell is an async function component; RTL/jsdom cannot mount an async
 * component directly ("async Client Component" warning → empty DOM), so we
 * pre-resolve it exactly as crewShell.test.tsx calls `await CrewShell(props)`.
 */
async function resolveAsync(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => resolveAsync(child)));
  }
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  const type = element.type;
  // Async function components: invoke + await, then resolve the result.
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    const produced = await (type as (props: unknown) => Promise<ReactNode>)(element.props);
    return resolveAsync(produced);
  }
  // Host element / sync component / fragment: resolve its children in place.
  const children = element.props?.children;
  if (children === undefined) return element;
  const resolvedChildren = await resolveAsync(children);
  return { ...element, props: { ...element.props, children: resolvedChildren } };
}

async function renderPreviewPage(opts: {
  crewId: string;
  s?: string;
  previewCrewRoleFlags: string[];
}) {
  state.previewCrewRoleFlags = opts.previewCrewRoleFlags;
  getShowForViewer.mockResolvedValue(makeData());
  const mod = await import("@/app/admin/show/[slug]/preview/[crewId]/page");
  const element = await mod.default({
    params: Promise.resolve({ slug: "acme-2026", crewId: opts.crewId }),
    searchParams: Promise.resolve(opts.s === undefined ? {} : { s: opts.s }),
  });
  const resolved = await resolveAsync(element);
  render(resolved as ReactElement);
}

beforeEach(() => {
  state.previewCrewRoleFlags = [];
  getShowForViewer.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

// ============================================================================
// Renders CrewShell (not the legacy ShowBody), admin_preview viewer, no token
// ============================================================================
describe("preview-as route renders CrewShell", () => {
  it("renders <CrewShell> with ?s=venue → data-active-section='venue', banner above", async () => {
    await renderPreviewPage({ crewId: LEAD_ID, s: "venue", previewCrewRoleFlags: ["LEAD"] });
    const shell = screen.getByTestId("crew-shell");
    expect(shell.getAttribute("data-active-section")).toBe("venue");
    // PreviewBanner sits above the shell.
    expect(screen.getByTestId("preview-banner")).toBeTruthy();
  });

  it("passes showId === showLookup.id (the resolved show row id) to CrewShell", async () => {
    await renderPreviewPage({ crewId: LEAD_ID, s: "venue", previewCrewRoleFlags: ["LEAD"] });
    expect(screen.getByTestId("mock-realtime-bridge").getAttribute("data-show-id")).toBe(SHOW_ID);
    expect(screen.getByTestId("preview-banner").getAttribute("data-show-id")).toBe(SHOW_ID);
  });

  it("calls getShowForViewer with an admin_preview viewer for the previewed crewId", async () => {
    await renderPreviewPage({ crewId: HAND_ID, previewCrewRoleFlags: ["A2"] });
    expect(getShowForViewer).toHaveBeenCalledTimes(1);
    const [passedShowId, viewer] = getShowForViewer.mock.calls[0] as [
      string,
      { kind: string; crewMemberId: string },
    ];
    expect(passedShowId).toBe(SHOW_ID);
    expect(viewer.kind).toBe("admin_preview");
    expect(viewer.crewMemberId).toBe(HAND_ID);
  });

  it("renders no IdentityChip in preview-as (identityChip omitted)", async () => {
    await renderPreviewPage({ crewId: HAND_ID, previewCrewRoleFlags: ["A2"] });
    expect(screen.queryByTestId("mock-identity-chip")).toBeNull();
  });

  it("default (no ?s) → data-active-section='today'", async () => {
    await renderPreviewPage({ crewId: HAND_ID, previewCrewRoleFlags: ["A2"] });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("today");
  });
});

// ============================================================================
// Budget gate driven by the PREVIEWED crew's LEAD flag (R2-HIGH-1)
// ============================================================================
describe("preview-as Budget gate reads the previewed crew's LEAD flag", () => {
  it("previewing a NON-LEAD crew + ?s=budget → today (Budget not entered)", async () => {
    await renderPreviewPage({ crewId: HAND_ID, s: "budget", previewCrewRoleFlags: ["A2"] });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("today");
    expect(screen.getByTestId("crew-sub-nav").getAttribute("data-budget-visible")).toBe("false");
  });

  it("previewing a LEAD crew + ?s=budget → budget", async () => {
    await renderPreviewPage({ crewId: LEAD_ID, s: "budget", previewCrewRoleFlags: ["LEAD"] });
    expect(screen.getByTestId("crew-shell").getAttribute("data-active-section")).toBe("budget");
    expect(screen.getByTestId("crew-sub-nav").getAttribute("data-budget-visible")).toBe("true");
  });
});

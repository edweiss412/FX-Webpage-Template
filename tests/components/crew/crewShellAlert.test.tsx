// @vitest-environment jsdom
// Task 8 (minimal _CrewShell producer): when the crew-page projection carries
// one or more tileErrors, CrewShell fires EXACTLY ONE best-effort
// upsertAdminAlert observability write with code TILE_PROJECTION_FETCH_FAILED,
// the showId PROP (never data.show.id — ShowRow has no id), a viewer-independent
// CONSTANT message, sorted failedKeys derived from the tileErrors map, and
// context.sheet_name === data.show.title. A healthy projection fires no write,
// and an upsert rejection is swallowed (fail-quiet — the shell still renders).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

// Under client-side section toggle, CrewShell renders all entitled section
// bodies and hands them to the <CrewSections> controller. This suite asserts
// ONLY the section-INDEPENDENT projection-alert producer (which fires before any
// section model is resolved) against an intentionally-thin fixture
// (`{ show: { title }, crewMembers: [], tileErrors }`). The real controller +
// sections dereference projection fields the thin fixture omits, which would
// crash the render OR fire a SECOND (render-failure) upsert and break the
// single-call assertion. The controller + section CONTENT are out of scope here
// (pinned by crewSections.test.tsx + crewShellSections.test.tsx + the section
// unit tests), so we mock the controller and every section to a no-op marker.
// The producer-under-test (the alert) is untouched and still fires ONCE per
// load, section-independent.
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: () => <div data-testid="mock-crew-sections" />,
}));

// The REAL ShowRealtimeBridge (a sibling of the controller) calls useRouter() on
// mount; provide the minimal app-router scaffolding so the render does not throw
// "invariant expected app router to be mounted". This suite asserts only the
// section-independent alert producer, so these are no-ops.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/acme-2026/tok",
  useSearchParams: () => new URLSearchParams(),
}));

const mockSection = (testid: string) => {
  const MockSection = () => <section data-testid={testid} />;
  MockSection.displayName = `MockSection(${testid})`;
  return MockSection;
};
vi.mock("@/components/crew/sections/TodaySection", () => ({
  TodaySection: mockSection("section-today"),
}));
vi.mock("@/components/crew/sections/ScheduleSection", () => ({
  ScheduleSection: mockSection("section-schedule"),
}));
vi.mock("@/components/crew/sections/VenueSection", () => ({
  VenueSection: mockSection("section-venue"),
}));
vi.mock("@/components/crew/sections/TravelSection", () => ({
  TravelSection: mockSection("section-travel"),
}));
vi.mock("@/components/crew/sections/CrewSection", () => ({
  CrewSection: mockSection("section-crew"),
}));
vi.mock("@/components/crew/sections/GearSection", () => ({
  GearSection: mockSection("section-gear"),
}));
vi.mock("@/components/crew/sections/BudgetSection", () => ({
  BudgetSection: mockSection("section-budget"),
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

type TileErrors = Record<string, string>;

function makeData(tileErrors: TileErrors) {
  return {
    show: { title: "Acme Show" },
    crewMembers: [],
    tileErrors,
  } as unknown as import("@/lib/data/getShowForViewer").ShowForViewer;
}

const adminViewer = { kind: "admin" } as const;

async function renderShell(props: {
  data: import("@/lib/data/getShowForViewer").ShowForViewer;
  showId: string;
}) {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: props.data,
    viewer: adminViewer,
    showId: props.showId,
    rawSection: undefined,
  });
  render(element);
}

describe("CrewShell projection-alert producer", () => {
  it("fires exactly one TILE_PROJECTION_FETCH_FAILED upsert with the prop showId, constant message, and sorted failedKeys", async () => {
    upsertAdminAlert.mockResolvedValue("alert-1");
    await renderShell({
      data: makeData({ hotel: "boom", rooms: "boom", contacts: "boom" }),
      showId: "show-abc",
    });

    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    const arg = upsertAdminAlert.mock.calls[0]![0] as {
      showId: unknown;
      code: unknown;
      context: Record<string, unknown>;
    };
    // showId is the PROP, asserted exactly — never null, never data.show.id.
    expect(arg.showId).toBe("show-abc");
    expect(arg.code).toBe("TILE_PROJECTION_FETCH_FAILED");
    // failedKeys are the tileErrors keys, SORTED.
    expect(arg.context.failedKeys).toEqual(["contacts", "hotel", "rooms"]);
    expect(arg.context.sheet_name).toBe("Acme Show");
    expect(arg.context.tileId).toBe("crew:projection-alert");
    // viewer-independent CONSTANT message (string, non-empty, no per-domain text).
    expect(typeof arg.context.message).toBe("string");
    expect((arg.context.message as string).length).toBeGreaterThan(0);
    // No leaked viewer/version identifiers in the observability context.
    expect(arg.context).not.toHaveProperty("signature");
    expect(arg.context).not.toHaveProperty("viewerVersionToken");
  });

  it("fires NO upsert when the projection is healthy (empty tileErrors)", async () => {
    await renderShell({ data: makeData({}), showId: "show-healthy" });
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  it("renders (fail-quiet) even when the upsert rejects", async () => {
    upsertAdminAlert.mockRejectedValue(new Error("rpc down"));
    await expect(
      renderShell({ data: makeData({ hotel: "boom" }), showId: "show-x" }),
    ).resolves.toBeUndefined();
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
/**
 * tests/components/crew/crewShellTwoDistinctAlerts.test.tsx
 *
 * Test 29 (crew-redesign cleanup, post-migration): when CrewShell renders with
 * BOTH (a) a projection that carries `tileErrors` AND (b) an active section whose
 * WrappedSection render block THROWS, TWO DISTINCT unresolved admin_alerts rows
 * are produced — TILE_PROJECTION_FETCH_FAILED (the section-INDEPENDENT projection
 * producer, _CrewShell.tsx producer contract 1) and TILE_SERVER_RENDER_FAILED
 * (the per-block render-throw producer, WrappedSection.tsx) — and NEITHER
 * clobbers the other.
 *
 * The two codes are keyed separately (the dedupe upsert keys on show_id + code),
 * so a single render that trips both producers must emit exactly two upsert
 * calls carrying the two distinct codes. This pins that the observability
 * surfaces stayed independent after the tile-shell deletion (the projection alert
 * migrated into CrewShell; the render-failure alert into WrappedSection).
 *
 * The render-failure producer is exercised through the REAL WrappedSection
 * (mounted inside a mocked Venue section) so the assertion observes the actual
 * production code path, not a re-implemented stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/acme-2026/tok",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock every section to a no-op marker EXCEPT Venue, which mounts the REAL
// WrappedSection with a render block that throws — so the render-failure
// producer fires through the production code path. The active section is forced
// to `venue` via rawSection below.
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
vi.mock("@/components/crew/sections/VenueSection", async () => {
  const { WrappedSection } = await import("@/components/crew/WrappedSection");
  return {
    VenueSection: ({ showId }: { showId: string }) => (
      <section data-testid="section-venue">
        <WrappedSection
          tileId="crew:venue:diagrams"
          showId={showId}
          sheetName="Acme Show"
          render={() => {
            throw new Error("diagrams block boom");
          }}
        />
      </section>
    ),
  };
});

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
  upsertAdminAlert.mockResolvedValue("alert-id");
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeData(tileErrors: Record<string, string>) {
  return {
    show: { title: "Acme Show" },
    crewMembers: [],
    tileErrors,
  } as unknown as import("@/lib/data/getShowForViewer").ShowForViewer;
}

describe("CrewShell: projection-fetch alert + section render-throw alert are two distinct rows", () => {
  it("emits BOTH TILE_PROJECTION_FETCH_FAILED and TILE_SERVER_RENDER_FAILED, neither clobbering the other", async () => {
    const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
    const element = await CrewShell({
      data: makeData({ hotel: "boom" }),
      viewer: { kind: "admin" },
      showId: "show-29",
      rawSection: "venue", // force the Venue section (the throwing WrappedSection) active
    });
    render(element);

    const codes = upsertAdminAlert.mock.calls.map((c) => (c[0] as { code: string }).code);

    // TWO distinct codes — one per producer.
    expect(codes).toContain("TILE_PROJECTION_FETCH_FAILED");
    expect(codes).toContain("TILE_SERVER_RENDER_FAILED");
    expect(new Set(codes).size).toBe(2);

    // Each producer carries its OWN showId + tileId — neither row's payload
    // overwrites the other (distinct dedupe keys: show_id + code).
    const projection = upsertAdminAlert.mock.calls
      .map((c) => c[0] as { code: string; showId: unknown; context: { tileId?: unknown } })
      .find((a) => a.code === "TILE_PROJECTION_FETCH_FAILED")!;
    const renderFail = upsertAdminAlert.mock.calls
      .map((c) => c[0] as { code: string; showId: unknown; context: { tileId?: unknown } })
      .find((a) => a.code === "TILE_SERVER_RENDER_FAILED")!;

    expect(projection.showId).toBe("show-29");
    expect(projection.context.tileId).toBe("crew:projection-alert");
    expect(renderFail.showId).toBe("show-29");
    expect(renderFail.context.tileId).toBe("crew:venue:diagrams");
  });
});

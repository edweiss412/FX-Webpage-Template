// @vitest-environment jsdom
/**
 * tests/components/crew/wrappedSection.test.tsx (crew-redesign Task 9 —
 * R11-HIGH-1 / §4.13 / wp-13)
 *
 * Pins the per-block render-throw containment contract for the crew sections.
 *
 * Background: the crew §9 sections are SYNCHRONOUS Server Components that home
 * the throwable data load/transform blocks the deleted M4 tile shells used to
 * carry. Each of those blocks previously ran inside <WrappedTile> /
 * <TileServerFallback>, which (a) contained a synchronous render throw so the
 * rest of the page survived, and (b) upserted an `admin_alerts` row with code
 * TILE_SERVER_RENDER_FAILED so the admin dashboard surfaces a persistently
 * failing block. Once the old tiles are deleted (Phase 4) that containment must
 * not be lost — <WrappedSection> is the synchronous analog of <WrappedTile>
 * that preserves it.
 *
 * The containment mechanism mirrors WrappedTile's H2 "direct invocation"
 * contract: the throwable block is passed as a `render: () => ReactNode`
 * FUNCTION and INVOKED inside WrappedSection's own synchronous try/catch — NOT
 * passed as already-evaluated `children` (whose throw would escape into the
 * parent before the boundary runs). On throw it (a) renders the
 * <TileErrorFallback> element (`data-testid="tile-error-fallback"`), and
 * (b) fires the best-effort TILE_SERVER_RENDER_FAILED upsert with the crew
 * tileId / showId / sheet_name.
 *
 * Anti-tautology: the throw is forced by mocking a real section data helper
 * (resolveViewerContext) so the section's OWN throwable block — not a synthetic
 * inline `throw` — is the thing under test. We assert the section does not
 * crash (sibling content still renders), the fallback element appears, and the
 * upsert carries the crew-namespaced tileId + the show title as sheet_name.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue(null),
}));

import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { WrappedSection } from "@/components/crew/WrappedSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Suppress the expected console.error from the catch path.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("WrappedSection catches a synchronous render() throw, renders the fallback, and upserts TILE_SERVER_RENDER_FAILED", () => {
  const { container } = render(
    <div data-testid="parent">
      <span data-testid="sibling">still here</span>
      <WrappedSection
        tileId="crew:venue:diagrams"
        showId="show-abc"
        sheetName="Test Show"
        render={() => {
          throw new Error("synthetic block throw");
        }}
      />
    </div>,
  );

  // (a) the surrounding section did NOT crash — the sibling still renders.
  expect(container.querySelector('[data-testid="sibling"]')!.textContent).toBe("still here");

  // (b) the fallback element renders in place of the throwing block.
  expect(container.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();

  // (c) the TILE_SERVER_RENDER_FAILED upsert fired with the crew-namespaced
  //     tileId, the showId prop, and the show title as sheet_name.
  expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  expect(upsertAdminAlert).toHaveBeenCalledWith({
    showId: "show-abc",
    code: "TILE_SERVER_RENDER_FAILED",
    context: {
      tileId: "crew:venue:diagrams",
      message: "synthetic block throw",
      sheet_name: "Test Show",
    },
  });
});

test("WrappedSection renders the block output unchanged when render() succeeds (no upsert)", () => {
  const { container } = render(
    <WrappedSection
      tileId="crew:crew:roster"
      showId="show-abc"
      sheetName="Test Show"
      render={() => <span data-testid="block-ok">rendered</span>}
    />,
  );

  expect(container.querySelector('[data-testid="block-ok"]')!.textContent).toBe("rendered");
  expect(container.querySelector('[data-testid="tile-error-fallback"]')).toBeNull();
  expect(upsertAdminAlert).not.toHaveBeenCalled();
});

test("a real section's WRAPPED block throw is contained — section does not crash, fallback + upsert fire (CrewSection roster)", async () => {
  // Force a throw INSIDE the wrapped roster block (not in resolveViewerContext,
  // which is intentionally OUTSIDE the wrapper). The roster `.map` calls
  // shouldHideGenericOptional per member, so mocking it to throw drives the
  // section's OWN wrapped transform — the thing under test — to throw.
  // resolveViewerContext is left real so it does NOT throw first.
  vi.doMock("@/lib/visibility/emptyState", async () => {
    const actual = await vi.importActual<typeof import("@/lib/visibility/emptyState")>(
      "@/lib/visibility/emptyState",
    );
    return {
      ...actual,
      shouldHideGenericOptional: () => {
        throw new Error("synthetic roster-block throw");
      },
    };
  });
  vi.resetModules();

  const { CrewSection } = await import("@/components/crew/sections/CrewSection");
  const { makeShowForViewer } = await import("@/tests/fixtures/showForViewer");
  // A roster with ≥1 member so the wrapped `.map` (which calls the mocked
  // helper) actually executes.
  const data = makeShowForViewer({
    crewMembers: [
      {
        id: "m1",
        name: "Pat",
        role: "A1",
        phone: null,
        email: null,
        roleFlags: [],
      },
    ],
  });

  const { container } = render(
    <CrewSection
      data={data}
      viewer={{ kind: "admin" }}
      today={new Date("2026-05-14T15:00:00Z")}
      showId="show-xyz"
    />,
  );

  // The section did not propagate the throw — its container rendered, and the
  // fallback element is present in place of the throwing roster block.
  expect(container.querySelector('[data-testid="section-crew"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();

  // The crew-namespaced tileId for the roster block fired the upsert with the
  // show title as sheet_name.
  expect(upsertAdminAlert).toHaveBeenCalledWith(
    expect.objectContaining({
      showId: "show-xyz",
      code: "TILE_SERVER_RENDER_FAILED",
      context: expect.objectContaining({
        tileId: "crew:crew:roster",
        sheet_name: "Test Show",
      }),
    }),
  );

  vi.doUnmock("@/lib/visibility/emptyState");
});

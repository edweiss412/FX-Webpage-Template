// @vitest-environment jsdom
/**
 * tests/components/TileBoundaryComposition.test.tsx (M9 Task 9.2 — §12.1)
 *
 * Asserts that <TileErrorBoundary> (client) composes correctly around
 * <TileServerFallback> (server) for the canonical per-tile fallback
 * pattern:
 *
 *   <TileErrorBoundary>
 *     <TileServerFallback load={...} render={...} />
 *   </TileErrorBoundary>
 *
 * Three failure modes the composition must cover:
 *   1. server-throw  → TileServerFallback's try/catch handles it; the
 *                       client boundary never sees a throw.
 *   2. client render-throw on the server-resolved subtree → the client
 *                       boundary catches it after hydration.
 *   3. both succeed  → children render normally.
 *
 * These are exercised here without a real RSC payload — we await the
 * server component manually (it's an async function) and render the
 * resolved element inside the client boundary, mirroring what Next.js
 * does at the framework level.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TileErrorBoundary } from "@/components/shared/TileErrorBoundary";
import { TileServerFallback } from "@/components/shared/TileServerFallback";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function HappyView({ value }: { value: string }) {
  return <span data-testid="happy">{value}</span>;
}

function ExplodingView(): never {
  throw new Error("synthetic descendant render throw");
}

describe("TileErrorBoundary + TileServerFallback composition", () => {
  test("happy path: load succeeds, boundary passes through, View renders", async () => {
    const serverResolved = await TileServerFallback({
      load: async () => ({ value: "hello" }),
      render: (d) => <HappyView value={d.value} />,
      tileId: "compose-tile",
      showId: "show-1",
    });
    render(<TileErrorBoundary tileId="compose-tile">{serverResolved}</TileErrorBoundary>);
    expect(screen.getByTestId("happy").textContent).toBe("hello");
    expect(screen.queryByTestId("tile-error-fallback")).toBeNull();
  });

  test("server-throw: TileServerFallback catches first; client boundary never engages", async () => {
    const serverResolved = await TileServerFallback({
      load: async () => {
        throw new Error("server-side loader fail");
      },
      render: () => <HappyView value="should-not-render" />,
      tileId: "compose-tile",
      showId: "show-1",
    });
    render(<TileErrorBoundary tileId="compose-tile">{serverResolved}</TileErrorBoundary>);
    // The fallback rendered from TileServerFallback's catch, NOT the client boundary's fallback.
    // Both share the same `tile-error-fallback` data-testid by default, but the boundary
    // received the resolved element (not a throw) so it should be in its non-error state.
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
    expect(screen.queryByTestId("happy")).toBeNull();
  });

  test("H1 isolation: one tile's load() throws but other tiles' loads remain unaffected", async () => {
    // Simulates the page-level wiring where each tile's load() checks
    // data.tileErrors[<domain>] and throws on a per-tile basis. A failure
    // in the "hotel" domain should NOT propagate to other tiles —
    // each WrappedTile/TileServerFallback pair catches its own throw.
    const tileErrors: Record<string, string> = { hotel: "hotel fetch failed: connection reset" };

    // Tile 1: depends on hotel, will throw via the page-style guard.
    const lodgingResolved = await TileServerFallback({
      load: async () => {
        if (tileErrors["hotel"]) throw new Error(tileErrors["hotel"]);
        return { hotelReservations: [] };
      },
      render: () => <HappyView value="lodging-ok" />,
      tileId: "lodging-tile",
      showId: "show-1",
    });

    // Tile 2: depends on contacts, no error → renders normally.
    const contactsResolved = await TileServerFallback({
      load: async () => {
        if (tileErrors["contacts"]) throw new Error(tileErrors["contacts"]);
        return { value: "contacts-ok" };
      },
      render: (d) => <HappyView value={d.value} />,
      tileId: "contacts-tile",
      showId: "show-1",
    });

    const { container } = render(
      <>
        <TileErrorBoundary tileId="lodging-tile">{lodgingResolved}</TileErrorBoundary>
        <TileErrorBoundary tileId="contacts-tile">{contactsResolved}</TileErrorBoundary>
      </>,
    );
    // Lodging tile shows fallback; contacts tile renders successfully.
    // Use container.querySelectorAll because both tiles share the testid.
    const fallbacks = container.querySelectorAll('[data-testid="tile-error-fallback"]');
    const happy = container.querySelectorAll('[data-testid="happy"]');
    expect(fallbacks.length).toBe(1);
    expect(happy.length).toBe(1);
    expect(happy[0]?.textContent).toBe("contacts-ok");
  });

  test("H1-r3 visibility-gated guard: rooms-error does NOT escalate when viewer lacks scope-tile role flags", async () => {
    // Simulates the page-level pattern:
    //   load: () => {
    //     if (audioScopeVisible(viewerFlags) && data.tileErrors['rooms']) throw …;
    //     return loadAudioScopeTileData({ rooms, viewerFlags });
    //   }
    // For a viewer with no A1/A2/V1/L1/LEAD flags, audioScopeVisible returns
    // false. Even when data.tileErrors['rooms'] is set, the load callback
    // MUST NOT throw — otherwise non-A1 crew see three error fallbacks
    // (audio/video/lighting) for tiles they normally don't see at all.
    const tileErrors: Record<string, string> = { rooms: "rooms fetch failed: connection reset" };
    const viewerFlagsNoScope: string[] = []; // crew with no scope-unlocking flags
    const audioScopeVisible = (flags: string[]) =>
      flags.some((f) => ["A1", "A2", "LEAD"].includes(f));

    const audioResolved = await TileServerFallback({
      load: async () => {
        if (audioScopeVisible(viewerFlagsNoScope) && tileErrors["rooms"]) {
          throw new Error(tileErrors["rooms"]);
        }
        // No throw — return a payload the View will choose to render-null on.
        return { rooms: [], viewerFlags: viewerFlagsNoScope };
      },
      // Mimic the page-level View behavior: View returns null when not
      // visible; WrappedTile's `?? <></>` fallback materializes the null
      // result as an empty fragment so the tile reflows away.
      render: () => (audioScopeVisible(viewerFlagsNoScope) ? <HappyView value="audio" /> : <></>),
      tileId: "audio-scope-tile",
      showId: "show-1",
    });

    const { container } = render(
      <TileErrorBoundary tileId="audio-scope-tile">{audioResolved}</TileErrorBoundary>,
    );
    // No fallback card; no happy view either (tile is whole-tile-missing).
    expect(container.querySelector('[data-testid="tile-error-fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="happy"]')).toBeNull();
  });

  test("H1-r3 visibility-gated guard: rooms-error DOES escalate when viewer HAS scope-tile flags", async () => {
    const tileErrors: Record<string, string> = { rooms: "rooms fetch failed: connection reset" };
    const viewerFlagsLead: string[] = ["LEAD"];
    const audioScopeVisible = (flags: string[]) =>
      flags.some((f) => ["A1", "A2", "LEAD"].includes(f));

    const audioResolved = await TileServerFallback({
      load: async () => {
        if (audioScopeVisible(viewerFlagsLead) && tileErrors["rooms"]) {
          throw new Error(tileErrors["rooms"]);
        }
        return { rooms: [], viewerFlags: viewerFlagsLead };
      },
      render: () => <HappyView value="audio" />,
      tileId: "audio-scope-tile",
      showId: "show-1",
    });

    const { container } = render(
      <TileErrorBoundary tileId="audio-scope-tile">{audioResolved}</TileErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="happy"]')).toBeNull();
  });

  test("H1-r4 admin bypass: transport error escalates for admin even when transportVisible is false (null data)", async () => {
    // Reproduces R4 H1: a transportation fetch failure leaves
    // data.transportation null, which makes transportTileVisible return
    // false, which would orphan the tileError under a "visible &&
    // tileError" guard. The fix: admin bypasses the visibility gate.
    const tileErrors: Record<string, string> = {
      transportation: "transportation fetch failed: connection reset",
    };
    const transportVisibleFromNull = false; // transportTileVisible(null) → false
    const isAdmin = true;

    const resolved = await TileServerFallback({
      load: async () => {
        if ((isAdmin || transportVisibleFromNull) && tileErrors["transportation"]) {
          throw new Error(tileErrors["transportation"]);
        }
        return { transportation: null, visible: false };
      },
      render: () => <HappyView value="transport" />,
      tileId: "transport-tile",
      showId: "show-1",
    });

    const { container } = render(
      <TileErrorBoundary tileId="transport-tile">{resolved}</TileErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
  });

  test("H1-r4 crew fail-closed: transport error does NOT escalate for crew when transportVisible is false", async () => {
    // The crew side of R4: when transportVisible is false (either
    // because the viewer isn't on the schedule OR because data is null),
    // a non-admin viewer sees no fallback — the tile reflows away.
    const tileErrors: Record<string, string> = {
      transportation: "transportation fetch failed: connection reset",
    };
    const transportVisibleFromNull = false;
    const isAdmin = false;

    const resolved = await TileServerFallback({
      load: async () => {
        if ((isAdmin || transportVisibleFromNull) && tileErrors["transportation"]) {
          throw new Error(tileErrors["transportation"]);
        }
        return { transportation: null, visible: false };
      },
      render: () => <></>, // TransportTile View returns null when !visible
      tileId: "transport-tile",
      showId: "show-1",
    });

    const { container } = render(
      <TileErrorBoundary tileId="transport-tile">{resolved}</TileErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="tile-error-fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="happy"]')).toBeNull();
  });

  test("client render-throw: server resolves OK, then a descendant render throws → client boundary catches", async () => {
    // Server side resolves successfully — load doesn't throw and the
    // render callback returns a valid element. The element's component
    // function (ExplodingView) is invoked LATER by React, outside the
    // wrapper's try/catch. That throw escapes server fallback and is
    // caught by the client TileErrorBoundary instead.
    const serverResolved = await TileServerFallback({
      load: async () => ({ value: "ok" }),
      render: () => <ExplodingView />,
      tileId: "compose-tile",
      showId: "show-1",
    });
    render(<TileErrorBoundary tileId="compose-tile">{serverResolved}</TileErrorBoundary>);
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
  });
});

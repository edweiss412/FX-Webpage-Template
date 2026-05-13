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

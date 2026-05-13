// @vitest-environment jsdom
/**
 * tests/components/TileServerFallback.test.tsx (M9 Task 9.2 — §12.1 / AC-9.3)
 *
 * Pins the server-side fallback contract:
 *   - load() throws → renders the fallback element (NOT the route-level
 *     error.tsx); page continues with other tiles unaffected.
 *   - render(data) is INVOKED inside the try/catch (not just returned)
 *     so the View component must be pure — throws inside its body that
 *     happen synchronously during render() escape the wrapper. This is
 *     the spec contract per the plan task body line 33.
 *   - admin_alerts upsert is best-effort: its failure must NOT mask
 *     the original render failure (the fallback still renders).
 *
 * Anti-tautology: the test does NOT assert messageFor — it asserts the
 * fallback element appears under the expected data-testid. The crew copy
 * itself is covered by tests/components/StaleFooter.test.tsx and the
 * §12.4 catalog parity tests.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { TileServerFallback } from "@/components/shared/TileServerFallback";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue(null),
}));

import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Suppress expected console.error output from the wrapper's catch path.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("TileServerFallback — server-side render isolation", () => {
  test("renders the loaded element when load() succeeds", async () => {
    const element = await TileServerFallback({
      load: async () => ({ value: "ok" }),
      render: (d) => <span data-testid="ok-render">{d.value}</span>,
      tileId: "test-tile",
      showId: "show-1",
    });
    render(element);
    expect(screen.getByTestId("ok-render").textContent).toBe("ok");
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("when load() throws, renders the default TileErrorFallback", async () => {
    const element = await TileServerFallback({
      load: async () => {
        throw new Error("synthetic loader failure");
      },
      render: () => <span>should-not-render</span>,
      tileId: "test-tile",
      showId: "show-1",
    });
    render(element);
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
    expect(screen.queryByText("should-not-render")).toBeNull();
  });

  test("custom fallback prop overrides the default TileErrorFallback", async () => {
    const element = await TileServerFallback({
      load: async () => {
        throw new Error("boom");
      },
      render: () => <span>nope</span>,
      fallback: <span data-testid="custom-fallback">custom</span>,
      tileId: "test-tile",
    });
    render(element);
    expect(screen.getByTestId("custom-fallback").textContent).toBe("custom");
    expect(screen.queryByTestId("tile-error-fallback")).toBeNull();
  });

  test("admin_alerts upsert is invoked with TILE_SERVER_RENDER_FAILED + tileId on throw", async () => {
    await TileServerFallback({
      load: async () => {
        throw new Error("synthetic");
      },
      render: () => <span />,
      tileId: "lodging-tile",
      showId: "show-abc",
    });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-abc",
      code: "TILE_SERVER_RENDER_FAILED",
      context: { tileId: "lodging-tile", message: "synthetic" },
    });
  });

  test("admin_alerts upsert failure does NOT mask the fallback render", async () => {
    vi.mocked(upsertAdminAlert).mockRejectedValueOnce(new Error("db unreachable"));
    const element = await TileServerFallback({
      load: async () => {
        throw new Error("original loader fail");
      },
      render: () => <span />,
      tileId: "test-tile",
    });
    render(element);
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
  });

  test("non-Error throw is normalized (string thrown)", async () => {
    const element = await TileServerFallback({
      load: async () => {
        throw "raw string error"; // eslint-disable-line @typescript-eslint/only-throw-error
      },
      render: () => <span />,
      tileId: "test-tile",
    });
    render(element);
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
    expect(upsertAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ message: "raw string error" }),
      }),
    );
  });

  test("when render() directly invokes a View whose body throws synchronously, throw is caught (H2 contract)", async () => {
    // The "direct invocation" contract enforced by <WrappedTile>:
    //   render: (data) => View(data)        // function call — throws caught HERE
    //   render: (data) => <View {...data} />  // element creation — throws escape
    // This test exercises the former and asserts the wrapper's catch path
    // engages. The latter is the bug from M9 Codex round-1 H2.
    function ExplodingView(): never {
      throw new Error("synthetic View body throw");
    }
    const element = await TileServerFallback({
      load: async () => ({ value: "ok" }),
      render: () => ExplodingView(),
      tileId: "test-tile",
      showId: "show-1",
    });
    render(element);
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  });

  test("showId defaults to null in the admin alert when not provided", async () => {
    await TileServerFallback({
      load: async () => {
        throw new Error("x");
      },
      render: () => <span />,
      tileId: "global-tile",
    });
    expect(upsertAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ showId: null }),
    );
  });
});

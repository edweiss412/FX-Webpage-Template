// @vitest-environment jsdom
//
// Codex R3 HIGH regression pin — render-throw observability must be DURABLE.
//
// WrappedSection is a SYNCHRONOUS Server Component (it composes inside the
// synchronous crew sections), so it cannot `await` the TILE_SERVER_RENDER_FAILED
// upsert the way the async <TileServerFallback> does. A bare unawaited promise
// can be dropped when a serverless RSC render freezes before it settles — losing
// the durable admin_alerts row. The fix registers the upsert as post-response
// work via next/server `after()`. This test pins that wiring: in a request scope
// (here: `after` mocked to capture + run the callback) the upsert flows through
// `after()`, not a bare fire-and-forget.
//
// The complementary no-scope path (unit tests where `after()` throws → fall back
// to plain fire-and-forget) is exercised by wrappedSection.test.tsx, which does
// NOT mock next/server and still observes a synchronous upsert.
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

// Capture the work `after()` is asked to defer, and run it (a request scope's
// runtime would run it post-response). vi.hoisted so the mock factory can see it.
const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn((cb: () => unknown) => {
    void cb();
  }),
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue(null),
}));

import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { WrappedSection } from "@/components/crew/WrappedSection";

describe("WrappedSection render-throw observability is durable (after())", () => {
  test("on throw, the TILE_SERVER_RENDER_FAILED upsert is registered via after(), not a bare fire-and-forget", () => {
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        sheetName="RPAS Central 2026"
        render={() => {
          throw new Error("scope projection blew up");
        }}
      />,
    );
    // The durability mechanism is wired: the upsert is handed to after() so the
    // serverless runtime keeps the function alive until it settles.
    expect(afterMock).toHaveBeenCalledTimes(1);
    // And the deferred work performs exactly the TILE_SERVER_RENDER_FAILED upsert.
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-xyz",
      code: "TILE_SERVER_RENDER_FAILED",
      context: {
        tileId: "crew:gear:scope",
        message: "scope projection blew up",
        sheet_name: "RPAS Central 2026",
      },
    });
  });

  test("a successful render registers no after() work and no upsert", () => {
    afterMock.mockClear();
    vi.mocked(upsertAdminAlert).mockClear();
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        render={() => <div data-testid="ok">fine</div>}
      />,
    );
    expect(afterMock).not.toHaveBeenCalled();
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });
});

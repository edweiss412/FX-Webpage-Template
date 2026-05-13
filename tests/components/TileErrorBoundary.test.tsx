// @vitest-environment jsdom
/**
 * tests/components/TileErrorBoundary.test.tsx (M9 Task 9.2 — §12.1 / AC-9.3)
 *
 * Pins the client-side ErrorBoundary contract:
 *   - Descendant render-time throws are caught (React componentDidCatch).
 *   - Event-handler errors are NOT caught (documented; the boundary
 *     intentionally limits scope to render-time errors). For event-time
 *     errors, callers convert to error-state render or route to Sentry.
 *   - Custom fallback prop wins over default TileErrorFallback.
 *
 * The boundary uses a class component because functional components
 * cannot implement React's error-boundary lifecycle.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TileErrorBoundary } from "@/components/shared/TileErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // React logs caught errors to console.error; silence to keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ExplodingChild({ shouldExplode }: { shouldExplode: boolean }) {
  if (shouldExplode) throw new Error("synthetic descendant render error");
  return <div data-testid="ok-child">ok</div>;
}

describe("TileErrorBoundary — client render-time error isolation", () => {
  // Documented limitation: this boundary catches render-time throws only.
  // Event-handler errors must be handled by the handler itself (try/catch
  // → setState) or routed to Sentry's global error reporter. We do not
  // include an "event-handler throws escape" test here because the throw
  // dispatched through React's event system escapes to jsdom and is
  // reported as an uncaught error by vitest even though the assertion
  // passes — the documentation in the boundary's JSDoc is the contract,
  // and the render-time test below is the canonical positive case.

  test("renders children when no descendant throws", () => {
    render(
      <TileErrorBoundary>
        <ExplodingChild shouldExplode={false} />
      </TileErrorBoundary>,
    );
    expect(screen.getByTestId("ok-child").textContent).toBe("ok");
    expect(screen.queryByTestId("tile-error-fallback")).toBeNull();
  });

  test("catches descendant render-time throw and renders the default fallback", () => {
    render(
      <TileErrorBoundary>
        <ExplodingChild shouldExplode />
      </TileErrorBoundary>,
    );
    expect(screen.getByTestId("tile-error-fallback")).not.toBeNull();
    expect(screen.queryByTestId("ok-child")).toBeNull();
  });

  test("custom fallback prop overrides the default fallback", () => {
    render(
      <TileErrorBoundary fallback={<span data-testid="custom-cf">custom-cf</span>}>
        <ExplodingChild shouldExplode />
      </TileErrorBoundary>,
    );
    expect(screen.getByTestId("custom-cf").textContent).toBe("custom-cf");
    expect(screen.queryByTestId("tile-error-fallback")).toBeNull();
  });

  test("componentDidCatch logs the tileId tag when provided", () => {
    const errSpy = vi.spyOn(console, "error");
    render(
      <TileErrorBoundary tileId="lodging-tile">
        <ExplodingChild shouldExplode />
      </TileErrorBoundary>,
    );
    const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("tile=lodging-tile");
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({
  captureBoundaryError: h.captureBoundaryError,
}));
import { TileErrorBoundary } from "@/components/shared/TileErrorBoundary";
const { captureBoundaryError } = h;

function Boom(): never {
  throw new Error("tile boom");
}

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React logs caught boundary errors to console.error; silence to keep test output clean.
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  captureBoundaryError.mockReset();
  errSpy.mockRestore();
});

describe("TileErrorBoundary", () => {
  test("tileId prop → captureBoundaryError(error,'tile',{componentStack,tileId}) once + fallback renders", () => {
    render(
      <TileErrorBoundary tileId="t1">
        <Boom />
      </TileErrorBoundary>,
    );
    expect(captureBoundaryError).toHaveBeenCalledTimes(1);
    expect(captureBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "tile boom" }),
      "tile",
      { componentStack: expect.any(String), tileId: "t1" },
    );
    // Fallback still renders (the page survives a single tile crash).
    expect(screen.getByTestId("tile-error-fallback")).toBeInTheDocument();
  });
  test("no tileId prop → tileId defaults to 'unknown'", () => {
    render(
      <TileErrorBoundary>
        <Boom />
      </TileErrorBoundary>,
    );
    expect(captureBoundaryError).toHaveBeenCalledWith(expect.any(Error), "tile", {
      componentStack: expect.any(String),
      tileId: "unknown",
    });
  });
});

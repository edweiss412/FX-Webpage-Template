import { afterEach, describe, expect, test, vi } from "vitest";
const h = vi.hoisted(() => ({ captureException: vi.fn(), reportClientError: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));
vi.mock("@/lib/observe/reportClientError", () => ({ reportClientError: h.reportClientError }));
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
const { captureException, reportClientError } = h;

afterEach(() => {
  captureException.mockReset();
  reportClientError.mockReset();
});

describe("captureBoundaryError", () => {
  test("(error,'crew') no extra → Sentry captureException(error, undefined) + mirror area=crew, derived digest, NO tileId", () => {
    const err = Object.assign(new Error("x"), { digest: "d1" });
    captureBoundaryError(err, "crew");
    expect(captureException).toHaveBeenCalledWith(err, undefined);
    const arg = reportClientError.mock.calls[0]![0];
    expect(arg).toMatchObject({ error: err, area: "crew", digest: "d1" });
    expect(arg.tileId).toBeUndefined();
    expect(arg.componentStack).toBeUndefined();
  });
  test("(error,'tile',{componentStack,tileId}) → Sentry tag {tileId} + mirror area=tile w/ componentStack + tileId", () => {
    const err = new Error("boom");
    captureBoundaryError(err, "tile", { componentStack: "CS", tileId: "t1" });
    expect(captureException).toHaveBeenCalledWith(err, { tags: { tileId: "t1" } });
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ error: err, area: "tile", componentStack: "CS", tileId: "t1" }),
    );
  });
  test("Sentry throwing does NOT block the mirror (and never throws)", () => {
    captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });
    expect(() => captureBoundaryError(new Error("x"), "admin")).not.toThrow();
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });
  test("mirror throwing does NOT block Sentry (and never throws)", () => {
    reportClientError.mockImplementation(() => {
      throw new Error("mirror down");
    });
    expect(() => captureBoundaryError(new Error("x"), "root")).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

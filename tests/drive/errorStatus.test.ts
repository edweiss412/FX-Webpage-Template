import http from "node:http";
import { describe, expect, it } from "vitest";
import { isDriveTimeoutShape } from "@/lib/drive/errorStatus";

describe("isDriveTimeoutShape", () => {
  it("classifies a REAL gaxios-7 per-call timeout (live stalled socket, no mocks)", async () => {
    const { Gaxios } = await import("gaxios");
    const srv = http.createServer(() => {
      // stall: never respond
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
    const { port } = srv.address() as { port: number };
    let caught: unknown;
    try {
      await new Gaxios().request({
        url: `http://127.0.0.1:${port}/x`,
        method: "POST",
        timeout: 250,
        retry: false,
      });
    } catch (e) {
      caught = e;
    } finally {
      srv.close();
    }
    expect(caught).toBeTruthy();
    expect(isDriveTimeoutShape(caught)).toBe(true);
  }, 10_000);

  it("classifies legacy/defensive shapes", () => {
    expect(isDriveTimeoutShape(Object.assign(new Error("t"), { code: "TimeoutError" }))).toBe(true);
    expect(isDriveTimeoutShape(Object.assign(new Error("t"), { code: "ETIMEDOUT" }))).toBe(true);
    expect(
      isDriveTimeoutShape(
        new Error("x", { cause: Object.assign(new Error("a"), { name: "AbortError" }) }),
      ),
    ).toBe(true);
    // native AbortSignal.timeout shape (DOMException named TimeoutError)
    expect(isDriveTimeoutShape(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe(true);
  });

  it("rejects non-timeout shapes", () => {
    expect(isDriveTimeoutShape(new Error("plain"))).toBe(false);
    expect(isDriveTimeoutShape(Object.assign(new Error("s"), { status: 404 }))).toBe(false);
    expect(isDriveTimeoutShape(null)).toBe(false);
    expect(isDriveTimeoutShape("TimeoutError")).toBe(false);
    const cyc: { cause?: unknown } = new Error("c");
    cyc.cause = cyc;
    expect(isDriveTimeoutShape(cyc)).toBe(false); // cycle guard, bounded walk
  });

  it("finds a signature buried in a bounded cause chain, but not past depth 4", () => {
    const deep = new Error("l0", {
      cause: new Error("l1", {
        cause: new Error("l2", {
          cause: Object.assign(new Error("l3"), { name: "AbortError" }),
        }),
      }),
    });
    expect(isDriveTimeoutShape(deep)).toBe(true);
    const tooDeep = new Error("l0", {
      cause: new Error("l1", {
        cause: new Error("l2", {
          cause: new Error("l3", {
            cause: new Error("l4", {
              cause: Object.assign(new Error("l5"), { name: "AbortError" }),
            }),
          }),
        }),
      }),
    });
    expect(isDriveTimeoutShape(tooDeep)).toBe(false);
  });
});

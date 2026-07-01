// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reportClientError, __resetReportDedupForTests } from "@/lib/observe/reportClientError";

describe("reportClientError", () => {
  beforeEach(() => {
    __resetReportDedupForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  test("POSTs once with source+level+message+stack to the endpoint (no `area` field on the wire)", () => {
    reportClientError({ error: new Error("boom"), area: "crew" });
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/observe/client-error");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ source: "client.crew", level: "error", message: "boom" });
    expect(body.area).toBeUndefined(); // `area` is now mapped to `source`, never sent raw
    expect(typeof body.stack).toBe("string");
    expect((init as RequestInit).keepalive).toBe(true);
  });
  test("tileId forwarded into the POST body (source=client.tile)", () => {
    reportClientError({ error: new Error("boom"), area: "tile", tileId: "t1" });
    const body = JSON.parse(
      ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body).toMatchObject({ source: "client.tile", level: "error", tileId: "t1" });
  });
  test("dedups identical signatures (one POST), different signatures (two)", () => {
    // SAME instance twice → identical message+stack → one signature → one POST. (Two separate
    // `new Error("boom")` would have different `.stack` line numbers and wrongly dedup-miss.)
    const e = new Error("boom");
    reportClientError({ error: e, area: "crew" });
    reportClientError({ error: e, area: "crew" });
    reportClientError({ error: new Error("other"), area: "crew" });
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });
  test("empty message → '(no message)'", () => {
    reportClientError({ error: new Error(""), area: "admin" });
    const body = JSON.parse(
      ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.message).toBe("(no message)");
  });
  test("client-side caps: oversized message/stack truncated BEFORE the POST (≤ 1000 / 8000)", () => {
    const err = Object.assign(new Error("m".repeat(5000)), { stack: "s".repeat(20000) });
    reportClientError({ error: err, area: "crew" });
    const body = JSON.parse(
      ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.message.length).toBe(1000);
    expect(body.stack.length).toBe(8000);
  });
  test("fail-open: rejected fetch does NOT throw", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    expect(() => reportClientError({ error: new Error("x"), area: "root" })).not.toThrow();
  });
});

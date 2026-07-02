// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clientLog } from "@/lib/observe/clientLog";
import { __resetClientTransportDedupForTests } from "@/lib/observe/clientErrorTransport";

describe("clientLog", () => {
  beforeEach(() => {
    __resetClientTransportDedupForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  test("warn → console.warn(msg,ctx) AND one POST body = exactly {source,level,message}", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    clientLog("warn", "client.realtime", "boom", { reason: "x" });
    expect(warn).toHaveBeenCalledWith("boom", { reason: "x" });
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
    // `url` is added by the transport from location.href (jsdom origin); strip it so the
    // exact-equality below proves NO context (e.g. {reason}) leaked into the mirror body.
    const { url: _warnUrl, ...warnBody } = body;
    expect(warnBody).toEqual({ source: "client.realtime", level: "warn", message: "boom" }); // NO context mirrored
    warn.mockRestore();
  });
  test("error → console.error AND a POST with level error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    clientLog("error", "client.tile", "crash");
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const { url: _errUrl, ...errBody } = JSON.parse(
      (f.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(errBody).toEqual({
      source: "client.tile",
      level: "error",
      message: "crash",
    });
  });
  test("code+detail (5th/6th args) forward to the transport body; context still NOT mirrored", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clientLog(
      "warn",
      "client.realtime",
      "boom",
      { reason: "x" },
      "REALTIME_UNKNOWN_SYSTEM_EVENT",
      "evt-name",
    );
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const { url: _u, ...body } = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: "REALTIME_UNKNOWN_SYSTEM_EVENT",
      detail: "evt-name",
    }); // code+detail forwarded; the 4th-arg context ({reason}) is NOT mirrored
  });
  test("info (no ctx) AND debug (with ctx) → console only, NO POST", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    clientLog("info", "client.realtime", "ok");
    clientLog("debug", "client.realtime", "trace", { detail: 1 });
    expect(info).toHaveBeenCalledWith("ok");
    expect(debug).toHaveBeenCalledWith("trace", { detail: 1 }); // context kept in console
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
  test("dedup: same (source,level,message) → one POST", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clientLog("warn", "client.realtime", "same");
    clientLog("warn", "client.realtime", "same");
    clientLog("warn", "client.realtime", "different");
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });
  test("fail-open: rejected fetch does not throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("net"))),
    );
    expect(() => clientLog("error", "client.realtime", "x")).not.toThrow();
  });
});

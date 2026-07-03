// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clientErrorTransport,
  __resetClientTransportDedupForTests,
} from "@/lib/observe/clientErrorTransport";

describe("clientErrorTransport — optional code/detail", () => {
  beforeEach(() => {
    __resetClientTransportDedupForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function postBody(): Record<string, string> {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    // `url` is added by the transport from location.href (jsdom origin); strip it so the
    // assertions below only see the caller-supplied fields.
    const { url: _url, ...rest } = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
    return rest;
  }

  test("code + detail appear in the payload only when present", () => {
    clientErrorTransport({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: "SOME_CODE",
      detail: "some detail",
    });
    expect(postBody()).toEqual({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: "SOME_CODE",
      detail: "some detail",
    });
  });

  test("code + detail absent → neither key on the wire", () => {
    clientErrorTransport({ source: "client.realtime", level: "warn", message: "boom" });
    const body = postBody();
    expect(body).toEqual({ source: "client.realtime", level: "warn", message: "boom" });
    expect(body.code).toBeUndefined();
    expect(body.detail).toBeUndefined();
  });

  test("over-cap code (>80) and detail (>500) truncated BEFORE the POST", () => {
    const overCode = "c".repeat(200); // 200 > CAPS.code (80)
    const overDetail = "d".repeat(1000); // 1000 > CAPS.detail (500)
    clientErrorTransport({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: overCode,
      detail: overDetail,
    });
    const body = postBody() as { code: string; detail: string };
    expect(body.code.length).toBe(80);
    expect(body.detail.length).toBe(500);
  });
});

/**
 * Tests for `lib/drive/responseHeaders.ts` — the shared gaxios/Drive
 * response-header reader.
 *
 * Production bug (live-reproduced 2026-06-12 against validation): gaxios
 * 7.x returns `response.headers` as a WHATWG `Headers` instance, NOT a
 * plain object. Plain index access (`headers["content-range"]`) is always
 * undefined on a `Headers` instance, so the asset routes' fail-closed 206
 * total-size guard could never prove total <= cap and returned 410 for
 * EVERY valid Range slice — killing pdf.js incremental load ("This agenda
 * could not be loaded"). Tests' plain-object mocks hid the class
 * (mocked-only-tests failure mode).
 *
 * The helper must support all three shapes a gaxios-era codebase can see:
 * WHATWG `Headers`, plain object (string or string[] values, any case),
 * and undefined/null.
 */
import { describe, expect, test } from "vitest";

import { pickStringHeader } from "@/lib/drive/responseHeaders";

describe("pickStringHeader", () => {
  test("reads from a real WHATWG Headers instance (gaxios 7.x live shape)", () => {
    const headers = new Headers({
      "content-range": "bytes 0-1023/613145",
      "content-length": "1024",
    });
    expect(pickStringHeader(headers, "content-range")).toBe("bytes 0-1023/613145");
    expect(pickStringHeader(headers, "content-length")).toBe("1024");
  });

  test("Headers lookup is case-insensitive", () => {
    const headers = new Headers({ "Content-Range": "bytes 0-9/22" });
    expect(pickStringHeader(headers, "content-range")).toBe("bytes 0-9/22");
    expect(pickStringHeader(headers, "Content-Range")).toBe("bytes 0-9/22");
  });

  test("missing name on a Headers instance returns null", () => {
    expect(pickStringHeader(new Headers(), "content-range")).toBeNull();
  });

  test("reads string values from a plain object (legacy gaxios / test-mock shape)", () => {
    expect(pickStringHeader({ "content-range": "bytes 0-9/22" }, "content-range")).toBe(
      "bytes 0-9/22",
    );
  });

  test("plain-object lookup falls back to lowercase name", () => {
    expect(pickStringHeader({ "content-length": "10" }, "Content-Length")).toBe("10");
  });

  test("canonical-cased plain-object key resolves for a lowercase query (adapter preserves casing)", () => {
    // Regression: a plain-object response with canonical casing
    // ({"Content-Range": ...}) queried as "content-range" returned null,
    // re-tripping the fail-closed 206 guard (410) under any adapter that
    // preserves canonical header casing.
    expect(pickStringHeader({ "Content-Range": "bytes 0-9/22" }, "content-range")).toBe(
      "bytes 0-9/22",
    );
  });

  test("canonical-cased string[] plain-object key resolves for a lowercase query", () => {
    expect(
      pickStringHeader({ "Content-Range": ["bytes 0-9/22", "ignored"] }, "content-range"),
    ).toBe("bytes 0-9/22");
  });

  test("reads first element of a string[] value", () => {
    expect(
      pickStringHeader({ "content-range": ["bytes 0-9/22", "ignored"] }, "content-range"),
    ).toBe("bytes 0-9/22");
  });

  test("empty string[] and non-string values return null", () => {
    expect(pickStringHeader({ "content-range": [] }, "content-range")).toBeNull();
    expect(pickStringHeader({ "content-range": undefined }, "content-range")).toBeNull();
  });

  test("undefined headers returns null", () => {
    expect(pickStringHeader(undefined, "content-range")).toBeNull();
  });
});

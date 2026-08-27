// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reportClientError, __resetReportDedupForTests } from "@/lib/observe/reportClientError";
import { describeClientValue } from "@/lib/observe/describeClientValue";

/** Every POST body the transport sent, in order. */
function bodies(): Array<Record<string, unknown>> {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  return f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

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
  // ── non-`Error` crash values ───────────────────────────────────────────────
  //
  // These are red for DIFFERENT reasons and each asserts its own. Before the
  // projection, `toError` returned `{ message: String(e) }`
  // (lib/observe/reportClientError.ts:13): a plain object and {} arrived as the
  // literal "[object Object]" — red on `message` — while a string, null and a Map
  // already had a readable message and were red on `detail`, which this path did
  // not send at all, and on the type tag that separates them from their own
  // string forms.
  test.each([
    ["a plain object with code and message", { code: "PGRST301", message: "planted" }],
    ["a plain object with neither", { a: 1 }],
    ["an empty object", {}],
    ["a string", "boom"],
    ["null", null],
    ["a Map", new Map()],
  ] as const)("%s reaches the wire with its own fields, never [object Object]", (_label, value) => {
    reportClientError({ error: value, area: "crew" });
    const [body] = bodies();
    // Derived from the projection, so a change in either place fails rather than
    // both drifting together into a hardcoded expectation.
    const expected = describeClientValue(value);
    expect(body!.message).toBe(expected.message);
    expect(body!.message).not.toBe("[object Object]");
    if (expected.detail !== "") expect(body!.detail).toBe(expected.detail);
  });

  test("two structurally distinct plain objects produce TWO POSTs, differing in detail", () => {
    // The signature defect the row did not name: before `detail` joined the dedup
    // key, both of these collapsed to `client.crew|error|[object Object]|` and the
    // second was silently dropped. Asserting only "not [object Object]" would pass
    // against a projection that returned any constant string.
    reportClientError({ error: { a: 1 }, area: "crew" });
    reportClientError({ error: { b: 2 }, area: "crew" });
    const sent = bodies();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.detail).not.toBe(sent[1]!.detail);
  });

  test("an Error still sends message+stack and NO detail — the path is unchanged", () => {
    reportClientError({ error: new Error("boom"), area: "crew" });
    const [body] = bodies();
    expect(body!.message).toBe("boom");
    expect(typeof body!.stack).toBe("string");
    expect(body!.detail).toBeUndefined();
  });

  test("fail-open: rejected fetch does NOT throw", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    expect(() => reportClientError({ error: new Error("x"), area: "root" })).not.toThrow();
  });
});

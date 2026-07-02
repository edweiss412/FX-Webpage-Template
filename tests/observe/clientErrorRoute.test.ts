import { beforeEach, describe, expect, test, vi } from "vitest";
const h = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("@/lib/log", () => ({
  log: { error: h.logError, warn: h.logWarn, info: vi.fn(), debug: vi.fn() },
}));
import {
  handleClientError,
  __resetClientErrorStateForTests,
} from "@/app/api/observe/client-error/route";

// Default headers = same-origin browser fetch (content-type json + Sec-Fetch-Site same-origin).
function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/observe/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
beforeEach(() => {
  h.logError.mockReset();
  h.logWarn.mockReset();
  __resetClientErrorStateForTests();
});

describe("client-error endpoint", () => {
  test("valid same-origin POST, level omitted → 202 + one log.error, source=client.<source>, no code, fields top-level", async () => {
    const r = await handleClientError(
      req({ source: "client.crew", message: "boom", stack: "S", url: "u" }),
    );
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1);
    const [msg, fields] = h.logError.mock.calls[0]!;
    expect(msg).toBe("boom");
    expect(fields).toMatchObject({ source: "client.crew", stack: "S", url: "u" });
    expect(fields.code).toBeUndefined();
    expect(fields.context).toBeUndefined(); // fields are TOP-LEVEL, not nested
  });
  test("valid POST, level=warn → 202 + log.warn with that source (no log.error)", async () => {
    const r = await handleClientError(
      req({ source: "client.realtime", level: "warn", message: "boom" }),
    );
    expect(r.status).toBe(202);
    expect(h.logWarn).toHaveBeenCalledTimes(1);
    expect(h.logWarn.mock.calls[0]![0]).toBe("boom");
    expect(h.logWarn.mock.calls[0]![1]).toMatchObject({ source: "client.realtime" });
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("source not in ALLOWED_SOURCES → 400 (no write)", async () => {
    for (const s of ["evil", "client.foo", "client.realtime.x"]) {
      expect((await handleClientError(req({ source: s, message: "x" }))).status).toBe(400);
    }
    expect(h.logError).not.toHaveBeenCalled();
    expect(h.logWarn).not.toHaveBeenCalled();
  });
  test("level=info/debug/bad → 400 (no write); only warn|error accepted", async () => {
    for (const level of ["info", "debug", "trace", 5]) {
      expect(
        (await handleClientError(req({ source: "client.crew", level, message: "x" }))).status,
      ).toBe(400);
    }
    expect(h.logError).not.toHaveBeenCalled();
    expect(h.logWarn).not.toHaveBeenCalled();
  });
  test("structural-invalid → 400 (no write): empty message, missing source, malformed JSON, null/array/primitive JSON", async () => {
    for (const b of [
      { source: "client.crew", message: "   " },
      { message: "x" },
      "{not json",
      "null",
      "[]",
      "42",
    ]) {
      expect((await handleClientError(req(b))).status).toBe(400);
    }
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("oversized message → 202 + TRUNCATED write (not 400)", async () => {
    const r = await handleClientError(req({ source: "client.admin", message: "x".repeat(5000) }));
    expect(r.status).toBe(202);
    expect((h.logError.mock.calls[0]![0] as string).length).toBe(1000);
  });
  test("tileId forwarded to log fields", async () => {
    await handleClientError(req({ source: "client.tile", message: "boom", tileId: "t1" }));
    expect(h.logError.mock.calls[0]![1]).toMatchObject({ source: "client.tile", tileId: "t1" });
  });
  test("body with code+detail → emitted record carries code + detail in fields", async () => {
    await handleClientError(
      req({
        source: "client.crew",
        message: "boom",
        code: "CLIENT_WINDOW_ERROR",
        detail: "chunk load failed",
      }),
    );
    expect(h.logError).toHaveBeenCalledTimes(1);
    const fields = h.logError.mock.calls[0]![1];
    expect(fields).toMatchObject({
      source: "client.crew",
      code: "CLIENT_WINDOW_ERROR",
      detail: "chunk load failed",
    });
  });
  test("over-cap code/detail are truncated (code 80, detail 500)", async () => {
    const longCode = "C".repeat(200);
    const longDetail = "D".repeat(2000);
    await handleClientError(
      req({ source: "client.admin", message: "boom", code: longCode, detail: longDetail }),
    );
    const fields = h.logError.mock.calls[0]![1];
    expect((fields.code as string).length).toBe(80);
    expect((fields.detail as string).length).toBe(500);
  });
  test("body without code still logs (no code/detail fields)", async () => {
    await handleClientError(req({ source: "client.crew", message: "boom" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    const fields = h.logError.mock.calls[0]![1];
    expect(fields.code).toBeUndefined();
    expect(fields.detail).toBeUndefined();
  });
  test("content-type not json → 400 (no write)", async () => {
    const r = await handleClientError(
      req({ source: "client.crew", message: "boom" }, { "content-type": "text/plain" }),
    );
    expect(r.status).toBe(400);
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("same-origin guard: cross-site → 403; absent + foreign Origin → 403; absent + matching Origin → 202", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://app.example";
    // cross-site (Sec-Fetch-Site present) → 403
    expect(
      (
        await handleClientError(
          req({ source: "client.crew", message: "b" }, { "sec-fetch-site": "cross-site" }),
        )
      ).status,
    ).toBe(403);
    // Sec-Fetch-Site ABSENT + foreign Origin → 403
    const foreign = new Request("https://x", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ source: "client.crew", message: "b" }),
    });
    expect((await handleClientError(foreign)).status).toBe(403);
    // Sec-Fetch-Site ABSENT + matching Origin → 202
    const ok = new Request("https://x", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example" },
      body: JSON.stringify({ source: "client.crew", message: "b" }),
    });
    expect((await handleClientError(ok)).status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1); // only the matching-origin one wrote
  });
  test("rate backstop keyed by SOURCE: 21st same-source DROPPED (202, no extra write) + warns ONCE; other source unaffected", async () => {
    for (let i = 0; i < 20; i++)
      await handleClientError(req({ source: "client.crew", message: `m${i}` }));
    expect(h.logError).toHaveBeenCalledTimes(20);
    const r = await handleClientError(req({ source: "client.crew", message: "m20" }));
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(20); // dropped — no 21st error write
    expect(h.logWarn).toHaveBeenCalledTimes(1); // rate cap "logged once" (spec §3)
    await handleClientError(req({ source: "client.crew", message: "m21" })); // also dropped
    expect(h.logWarn).toHaveBeenCalledTimes(1); // still once this window
    // A DIFFERENT source has its own counter → not capped (proves keying by source, not global).
    await handleClientError(req({ source: "client.admin", message: "other" }));
    expect(h.logError).toHaveBeenCalledTimes(21);
  });
  test("fail-open: log throws SYNC → still 202 (never 5xx)", async () => {
    h.logError.mockImplementation(() => {
      throw new Error("sink down");
    });
    expect((await handleClientError(req({ source: "client.root", message: "boom" }))).status).toBe(
      202,
    );
  });
  test("fail-open: log returns a REJECTED promise → still 202 (awaited rejection swallowed)", async () => {
    h.logError.mockReturnValue(Promise.reject(new Error("persist rejected")));
    expect((await handleClientError(req({ source: "client.root", message: "boom" }))).status).toBe(
      202,
    );
  });
});

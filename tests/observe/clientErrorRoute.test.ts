import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  test("valid same-origin POST → 202 + one log.error, source=client.<area>, no code, fields top-level", async () => {
    const r = await handleClientError(req({ area: "crew", message: "boom", stack: "S", url: "u" }));
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1);
    const [msg, fields] = h.logError.mock.calls[0]!;
    expect(msg).toBe("boom");
    expect(fields).toMatchObject({ source: "client.crew", stack: "S", url: "u" });
    expect(fields.code).toBeUndefined();
    expect(fields.context).toBeUndefined(); // fields are TOP-LEVEL, not nested
  });
  test("structural-invalid → 400 (no write): unknown area, empty message, malformed JSON, null/array/primitive JSON", async () => {
    for (const b of [
      { area: "nope", message: "x" },
      { area: "crew", message: "   " },
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
    const r = await handleClientError(req({ area: "admin", message: "x".repeat(5000) }));
    expect(r.status).toBe(202);
    expect((h.logError.mock.calls[0]![0] as string).length).toBe(1000);
  });
  test("content-type not json → 400 (no write)", async () => {
    const r = await handleClientError(
      req({ area: "crew", message: "boom" }, { "content-type": "text/plain" }),
    );
    expect(r.status).toBe(400);
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("same-origin guard: cross-site → 403; Sec-Fetch-Site absent + foreign Origin → 403; absent + matching Origin → 202", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://app.example";
    // cross-site (Sec-Fetch-Site present) → 403
    expect(
      (
        await handleClientError(
          req({ area: "crew", message: "b" }, { "sec-fetch-site": "cross-site" }),
        )
      ).status,
    ).toBe(403);
    // Sec-Fetch-Site ABSENT + foreign Origin → 403 (override default by passing empty sec-fetch-site is not possible; build a bespoke Request)
    const foreign = new Request("https://x", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ area: "crew", message: "b" }),
    });
    expect((await handleClientError(foreign)).status).toBe(403);
    // Sec-Fetch-Site ABSENT + matching Origin → 202
    const ok = new Request("https://x", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example" },
      body: JSON.stringify({ area: "crew", message: "b" }),
    });
    expect((await handleClientError(ok)).status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1); // only the matching-origin one wrote
  });
  test("rate backstop: 21st in-window call DROPPED (202, no extra error write) + warns ONCE", async () => {
    for (let i = 0; i < 20; i++) await handleClientError(req({ area: "crew", message: `m${i}` }));
    expect(h.logError).toHaveBeenCalledTimes(20);
    const r = await handleClientError(req({ area: "crew", message: "m20" }));
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(20); // dropped — no 21st error write
    expect(h.logWarn).toHaveBeenCalledTimes(1); // rate cap "logged once" (spec §3)
    await handleClientError(req({ area: "crew", message: "m21" })); // also dropped
    expect(h.logWarn).toHaveBeenCalledTimes(1); // still once this window
  });
  test("fail-open: log.error throws SYNC → still 202 (never 5xx)", async () => {
    h.logError.mockImplementation(() => {
      throw new Error("sink down");
    });
    expect((await handleClientError(req({ area: "root", message: "boom" }))).status).toBe(202);
  });
  test("fail-open: log.error returns a REJECTED promise → still 202 (awaited rejection swallowed)", async () => {
    h.logError.mockReturnValue(Promise.reject(new Error("persist rejected")));
    expect((await handleClientError(req({ area: "root", message: "boom" }))).status).toBe(202);
  });
});

// tests/log/requestContext.test.ts
import { describe, expect, test } from "vitest";
import {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  setRequestShowId,
} from "@/lib/log/requestContext";

describe("requestContext", () => {
  test("getRequestContext is undefined outside a run", () => {
    expect(getRequestContext()).toBeUndefined();
  });
  test("context is visible across awaited async + Promise.all", async () => {
    await runWithRequestContext({ requestId: "req-1" }, async () => {
      expect(getRequestContext()?.requestId).toBe("req-1");
      await Promise.all([
        (async () => expect(getRequestContext()?.requestId).toBe("req-1"))(),
        (async () => {
          await Promise.resolve();
          expect(getRequestContext()?.requestId).toBe("req-1");
        })(),
      ]);
    });
    expect(getRequestContext()).toBeUndefined();
  });
  test("deriveRequestId prefers x-vercel-id, else a uuid", () => {
    expect(deriveRequestId(new Headers({ "x-vercel-id": "iad1::abc" }))).toBe("iad1::abc");
    const minted = deriveRequestId(new Headers());
    expect(minted).toMatch(/^[0-9a-f-]{36}$/);
  });
  test("setRequestShowId mutates the active store only", async () => {
    await runWithRequestContext({ requestId: "r" }, () => {
      setRequestShowId("show-9");
      expect(getRequestContext()?.showId).toBe("show-9");
    });
    setRequestShowId("ignored"); // no active store → no throw
    expect(getRequestContext()).toBeUndefined();
  });
});

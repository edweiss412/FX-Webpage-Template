import { describe, expect, test } from "vitest";
import { baseKey, reissueKey } from "@/lib/notify/idempotencyKey";

describe("idempotency keys", () => {
  test("base key is deterministic, < 256 chars, prefixed by kind", () => {
    const a = baseKey("digest", "digest:2026-06-02", "doug@fxav.app");
    expect(a).toBe(baseKey("digest", "digest:2026-06-02", "doug@fxav.app"));
    expect(a.length).toBeLessThan(256);
    expect(a.startsWith("fxav:digest:")).toBe(true);
  });

  test("recipient is part of the base key (no cross-recipient dedupe)", () => {
    expect(baseKey("digest", "d", "a@x")).not.toBe(baseKey("digest", "d", "b@x"));
  });

  test("reissue key is unique per call (per-submission nonce) and < 256", () => {
    const k1 = reissueKey("digest", "d", "a@x");
    const k2 = reissueKey("digest", "d", "a@x");
    expect(k1).not.toBe(k2);
    expect(k1.length).toBeLessThan(256);
    expect(k1.startsWith("fxav:digest:")).toBe(true);
  });
});

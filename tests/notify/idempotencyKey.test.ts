import { describe, expect, test } from "vitest";
import { baseKey, combinedDedupKey, reissueKey } from "@/lib/notify/idempotencyKey";

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

describe("combinedDedupKey (batching spec §2.2)", () => {
  test("single member is the identity — N=1 provider key is byte-identical to today's", () => {
    const member = "show-1:SHEET_UNAVAILABLE:1780000000123000";
    expect(combinedDedupKey([member])).toBe(member);
    expect(baseKey("realtime_problem", combinedDedupKey([member]), "doug@fxav.net")).toBe(
      baseKey("realtime_problem", member, "doug@fxav.net"),
    );
  });

  test("membership order does not matter (sort determinism)", () => {
    const a = ["k-b", "k-a", "k-c"];
    const b = ["k-c", "k-a", "k-b"];
    expect(combinedDedupKey(a)).toBe(combinedDedupKey(b));
    expect(combinedDedupKey(a)).toBe("k-a|k-b|k-c");
  });

  test("does not mutate its input", () => {
    const keys = ["k-b", "k-a"];
    combinedDedupKey(keys);
    expect(keys).toEqual(["k-b", "k-a"]);
  });

  test("provider key length is constant at any N (25 members)", () => {
    const members = Array.from({ length: 25 }, (_, i) => `show-${i}:CODE:17800000${i}`);
    const key = baseKey("realtime_problem", combinedDedupKey(members), "doug@fxav.net");
    expect(key).toMatch(/^fxav:realtime_problem:[0-9a-f]{64}$/);
  });
});

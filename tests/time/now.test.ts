// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let headerStore: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (key: string) => headerStore[key.toLowerCase()] ?? null,
  }),
}));

const FROZEN = "2026-03-24T15:00:00.000Z";
const SECRET = "test-secret-fixture";
const REAL_NOW = "2099-01-01T00:00:00.000Z";

async function expectRealNow(): Promise<void> {
  vi.useFakeTimers();
  const realNow = new Date(REAL_NOW);
  vi.setSystemTime(realNow);

  const { nowDate } = await import("@/lib/time/now");
  expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
}

beforeEach(() => {
  headerStore = {};
  delete process.env.ENABLE_TEST_AUTH;
  delete process.env.TEST_AUTH_SECRET;
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lib/time/now — three-precondition gate (test #15)", () => {
  it("ALL THREE preconditions met -> returns frozen instant", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    const { nowDate, now } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
    expect(await now()).toBe(FROZEN);
  });

  it("header missing -> falls back to real Date.now", async () => {
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    await expectRealNow();
  });

  it("ENABLE_TEST_AUTH unset -> gate refuses even with valid header and bearer", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.TEST_AUTH_SECRET = SECRET;

    await expectRealNow();
  });

  it("Bearer header missing -> gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    await expectRealNow();
  });

  it("Bearer token mismatch -> gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer wrong-secret";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    await expectRealNow();
  });

  it("TEST_AUTH_SECRET unset plus Bearer undefined -> gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer undefined";
    process.env.ENABLE_TEST_AUTH = "true";
    delete process.env.TEST_AUTH_SECRET;

    await expectRealNow();
  });

  it("TEST_AUTH_SECRET shorter than 16 chars -> gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer short";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "short";

    await expectRealNow();
  });

  it("header value without fractional seconds and Z suffix -> gate accepts", async () => {
    headerStore["x-screenshot-frozen-now"] = "2026-03-24T15:00:00Z";
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
  });

  it("header value with explicit +00:00 offset -> gate accepts", async () => {
    headerStore["x-screenshot-frozen-now"] = "2026-03-24T15:00:00+00:00";
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
  });

  it("parseable but non-canonical date strings -> gate refuses per AC-11.37", async () => {
    for (const invalidFrozen of ["03/24/2026", "Wed, 24 Mar 2026 15:00:00 GMT"]) {
      headerStore["x-screenshot-frozen-now"] = invalidFrozen;
      headerStore.authorization = `Bearer ${SECRET}`;
      process.env.ENABLE_TEST_AUTH = "true";
      process.env.TEST_AUTH_SECRET = SECRET;

      await expectRealNow();
      vi.useRealTimers();
      vi.resetModules();
    }
  });
});

describe("lib/time/now — capture-boundary + alt-style envelope (test #15)", () => {
  it("capture-boundary: same frozen header returns byte-identical ISO across 60+s wall clock", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    const { now } = await import("@/lib/time/now");
    const first = await now();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    const second = await now();

    expect(first).toBe(FROZEN);
    expect(second).toBe(FROZEN);
    expect(second).toBe(first);
  });

  it("alt-style: header casing tolerance — frozen returned for `X-SCREENSHOT-FROZEN-NOW`", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = `Bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
  });

  it("alt-style: Bearer prefix is case-sensitive (`bearer ...` rejected — defense-in-depth)", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = `bearer ${SECRET}`;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;

    await expectRealNow();
  });
});

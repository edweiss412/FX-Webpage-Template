import { afterEach, describe, expect, test, vi } from "vitest";

const TEST_PEPPER = "fxav-r41-test-pepper-32-chars-min-deterministic";

async function importHashForLog() {
  return import("@/lib/email/hashForLog");
}

describe("hashForLog", () => {
  const originalPepper = process.env.HASH_FOR_LOG_PEPPER;

  afterEach(() => {
    vi.resetModules();
    if (originalPepper === undefined) {
      process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    } else {
      process.env.HASH_FOR_LOG_PEPPER = originalPepper;
    }
  });

  test("returns deterministic 64-char hex hashes for canonical emails", async () => {
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hashForLog } = await importHashForLog();

    const alice = hashForLog("alice@example.com");
    expect(hashForLog("alice@example.com")).toBe(alice);
    expect(alice).toMatch(/^[0-9a-f]{64}$/);
    expect(hashForLog("bob@example.com")).not.toBe(alice);
  });

  test("does not canonicalize input case", async () => {
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hashForLog } = await importHashForLog();

    expect(hashForLog("alice@example.com")).not.toBe(hashForLog("Alice@Example.com"));
  });

  test("throws at module load when HASH_FOR_LOG_PEPPER is unset", async () => {
    delete process.env.HASH_FOR_LOG_PEPPER;
    vi.resetModules();

    await expect(importHashForLog()).rejects.toThrow(/HASH_FOR_LOG_PEPPER/);
  });

  test("throws at module load when HASH_FOR_LOG_PEPPER is shorter than 32 chars", async () => {
    process.env.HASH_FOR_LOG_PEPPER = "x".repeat(31);
    vi.resetModules();

    await expect(importHashForLog()).rejects.toThrow(/32\+/);
  });
});

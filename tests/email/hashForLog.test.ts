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

  test("outputs are UNCHANGED across the M12.13 pepper-hoist refactor (pinned real values)", async () => {
    // Snapshotted from the pre-refactor implementation (sha256(pepper || email))
    // under TEST_PEPPER. The hmacWithHashForLogPepper seam must not alter these.
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hashForLog } = await importHashForLog();

    expect(hashForLog("alice@example.com")).toBe(
      "5677c714955f0303c3f75857709b59fd1c4946874f5a229202ec2ef3ae90903e",
    );
    expect(hashForLog("bob@example.com")).toBe(
      "12de5a21826f3393efa51943e95c69232f4b151792d25049b48767e51822343f",
    );
    expect(hashForLog("doug@example.com")).toBe(
      "03244c6d4db56a4960574b1aa4379ed0053084a893731157a39af0efe958abe3",
    );
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

describe("hmacWithHashForLogPepper (M12.13 crypto seam, spec §4.3 R24)", () => {
  const originalPepper = process.env.HASH_FOR_LOG_PEPPER;

  afterEach(() => {
    vi.resetModules();
    if (originalPepper === undefined) {
      process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    } else {
      process.env.HASH_FOR_LOG_PEPPER = originalPepper;
    }
  });

  test("returns deterministic lowercase-hex 64-char HMAC-SHA256 output", async () => {
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hmacWithHashForLogPepper } = await importHashForLog();

    const out = hmacWithHashForLogPepper("hello");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacWithHashForLogPepper("hello")).toBe(out);
  });

  test("is keyed by the pepper: output differs from plain sha256(input)", async () => {
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hmacWithHashForLogPepper } = await importHashForLog();

    // sha256("hello") — unkeyed digest of the same input (concrete failure
    // mode: an unkeyed hash would be guessable without the server secret).
    expect(hmacWithHashForLogPepper("hello")).not.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    // Pinned HMAC-SHA256(TEST_PEPPER, "hello") — pins the algorithm choice.
    expect(hmacWithHashForLogPepper("hello")).toBe(
      "c3865d93ef7fe73fcdc8320e4d35f318dd8bf0a507f752eec68d812d567aaf12",
    );
  });

  test("distinct inputs produce distinct outputs", async () => {
    process.env.HASH_FOR_LOG_PEPPER = TEST_PEPPER;
    vi.resetModules();
    const { hmacWithHashForLogPepper } = await importHashForLog();

    expect(hmacWithHashForLogPepper("input-a")).not.toBe(hmacWithHashForLogPepper("input-b"));
  });
});

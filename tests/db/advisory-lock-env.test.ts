import { describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => ({
  postgresUrls: [] as string[],
}));

vi.mock("postgres", () => ({
  default: vi.fn((url: string) => {
    calls.postgresUrls.push(url);
    return {
      begin: async () => {
        throw new Error("postgres should not be opened without DATABASE_URL in production");
      },
      end: async () => undefined,
    };
  }),
}));

const { withShowAdvisoryLock } = await import("@/lib/db/advisoryLock");

describe("withShowAdvisoryLock environment", () => {
  test("production refuses to fall back to local Postgres when DATABASE_URL is missing", async () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;

      await expect(
        withShowAdvisoryLock(
          "11111111-1111-4111-8111-111111111111",
          "try",
          async () => "unexpected",
        ),
      ).rejects.toThrow(/DATABASE_URL/);
      expect(calls.postgresUrls).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

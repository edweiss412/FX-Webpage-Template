import { describe, expect, test, vi } from "vitest";

type CrewAuthRow = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

const calls = vi.hoisted(() => ({
  crewAuth: new Map<string, CrewAuthRow>(),
  sql: [] as string[],
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({
    begin: async <T>(fn: (tx: { unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>) =>
      await fn({
        unsafe: async (sql: string, params: unknown[] = []) => {
          calls.sql.push(sql);
          if (/pg_try_advisory_xact_lock/i.test(sql)) return [{ locked: true }];
          if (/from pg_locks/i.test(sql)) return [{ held: true }];

          if (/insert into public\.crew_member_auth/i.test(sql)) {
            const [showId, crewName] = params as [string, string];
            const key = `${showId}:${crewName}`;
            if (!calls.crewAuth.has(key)) {
              calls.crewAuth.set(key, {
                current_token_version: 1,
                max_issued_version: 1,
                revoked_below_version: 0,
              });
            }
            return [];
          }

          if (/update public\.crew_member_auth/i.test(sql)) {
            const [showId, names] = params as [string, string[]];
            for (const crewName of names) {
              const row = calls.crewAuth.get(`${showId}:${crewName}`);
              if (!row) continue;
              row.current_token_version = row.max_issued_version;
              row.revoked_below_version = row.max_issued_version;
            }
            return [];
          }

          throw new Error(`unexpected SQL: ${sql}`);
        },
      }),
    end: async () => undefined,
  })),
}));

const { withPostgresSyncPipelineLock } = await import("@/lib/sync/runScheduledCronSync");

describe("Postgres sync pipeline adapter", () => {
  test("provisionAddedCrewAuth leaves freshly added crew in no-live-link state", async () => {
    calls.crewAuth.clear();
    calls.sql.length = 0;

    await withPostgresSyncPipelineLock(
      "drive-file-1",
      async (tx) => {
        await tx.provisionAddedCrewAuth("show-1", ["New Crew"]);
        return null;
      },
      { tryOnly: true },
    );

    expect(calls.crewAuth.get("show-1:New Crew")).toEqual({
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 1,
    });
  });
});

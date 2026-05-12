import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import { reserveQuota } from "@/lib/reports/rateLimit";
import { submitReport } from "@/lib/reports/submit";
import { cleanupReportFixtures, seedShow } from "@/tests/reports/_dbHelpers";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function cleanup(identity: string): void {
  runPsql(`delete from public.report_rate_limits where identity = ${sqlString(identity)};`);
}

function currentCount(identity: string): number {
  const raw = runPsql(`
    select coalesce(sum(count), 0)::int
      from public.report_rate_limits
     where identity = ${sqlString(identity)};
  `);
  return Number(raw);
}

const cleanupIdentities = new Set<string>();

function track(identity: string): string {
  cleanupIdentities.add(identity);
  cleanup(identity);
  return identity;
}

afterEach(() => {
  for (const identity of cleanupIdentities) cleanup(identity);
  cleanupIdentities.clear();
});

describe("report quota reservation", () => {
  test("admin quota rejects the 11th hourly reservation and rolls back the counter", async () => {
    const identity = track("admin:test-8-3a");

    const firstTen = await Promise.all(
      Array.from({ length: 10 }, () => reserveQuota("admin", identity)),
    );
    const eleventh = await reserveQuota("admin", identity);

    expect(firstTen.every((result) => result.allowed)).toBe(true);
    expect(eleventh).toEqual({ allowed: false, count: 11, limit: 10 });
    expect(currentCount(identity)).toBe(10);
  });

  test("crew quota rejects the 4th hourly reservation and rolls back the counter", async () => {
    const identity = track("crew:test-8-3a");

    const firstThree = await Promise.all(
      Array.from({ length: 3 }, () => reserveQuota("crew", identity)),
    );
    const fourth = await reserveQuota("crew", identity);

    expect(firstThree.every((result) => result.allowed)).toBe(true);
    expect(fourth).toEqual({ allowed: false, count: 4, limit: 3 });
    expect(currentCount(identity)).toBe(3);
  });

  test("4 concurrent crew reservations allow exactly 3 and persist count 3", async () => {
    const identity = track("crew:test-8-3a-concurrent");

    const results = await Promise.all(
      Array.from({ length: 4 }, () => reserveQuota("crew", identity)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
    expect(currentCount(identity)).toBe(3);
  });

  test("submitReport maps over-limit crew quota to REPORT_RATE_LIMITED_CREW", async () => {
    const crewMemberId = track("018f2f4c-0000-4000-9000-000000000099");
    const showId = "018f2f4c-0000-4000-9000-000000000001";
    seedShow(showId, "m8-quota-submit");
    await Promise.all(Array.from({ length: 3 }, () => reserveQuota("crew", crewMemberId)));

    try {
      const result = await submitReport(
        {
          kind: "crew",
          source: "link",
          showId,
          crewMemberId,
        },
        {
          idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
          show_id: showId,
          message: "Wrong schedule",
        },
      );

      expect(result).toEqual({
        status: 429,
        body: { ok: false, code: "REPORT_RATE_LIMITED_CREW" },
      });
      expect(currentCount(crewMemberId)).toBe(3);
    } finally {
      cleanupReportFixtures(showId, [crewMemberId]);
    }
  });
});

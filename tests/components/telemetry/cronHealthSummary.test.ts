import { describe, expect, it } from "vitest";
import type { CronHealthRow } from "@/lib/admin/telemetryTypes";
import { effectiveCronStatus } from "@/components/admin/telemetry/cronHealthStatus";
import { summarizeCronHealth } from "@/components/admin/telemetry/cronHealthSummary";

const NOW = new Date("2026-07-06T12:00:00Z");
const HOUR = 3_600_000;
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

function row(overrides: Partial<CronHealthRow>): CronHealthRow {
  return {
    jobName: "job",
    label: "Job",
    description: "d",
    cadence: "hourly",
    staleAfterMs: HOUR,
    lastRunAt: iso(60_000), // 1min ago → recent
    outcome: "ok",
    level: "info",
    counts: null,
    ...overrides,
  };
}

describe("summarizeCronHealth", () => {
  it("tallies each effectiveCronStatus bucket; total = jobs.length", () => {
    const fixture: CronHealthRow[] = [
      row({ jobName: "h1", outcome: "ok" }), // positive → healthy
      row({ jobName: "h2", outcome: "ok" }), // positive → healthy
      row({ jobName: "h3", outcome: "ok" }), // positive → healthy
      row({ jobName: "s1", lastRunAt: iso(2 * HOUR) }), // age > staleAfterMs → warn → stale
      row({ jobName: "i1", lastRunAt: null }), // null → idle
      row({ jobName: "r1", outcome: "partial" }), // review
    ];

    // Anti-tautology: derive expectations from effectiveCronStatus over the fixture,
    // not a hardcoded literal, so the assertion tracks the real status derivation.
    const expected = { healthy: 0, stale: 0, idle: 0, review: 0, total: fixture.length };
    for (const j of fixture) {
      const { status } = effectiveCronStatus(j, NOW);
      if (status === "live" || status === "positive") expected.healthy++;
      else if (status === "warn") expected.stale++;
      else if (status === "idle") expected.idle++;
      else if (status === "review") expected.review++;
    }

    expect(summarizeCronHealth(fixture, NOW)).toEqual(expected);
    // Pin the concrete shape too (fixture is constructed to hit each bucket).
    expect(summarizeCronHealth(fixture, NOW)).toEqual({
      healthy: 3,
      stale: 1,
      idle: 1,
      review: 1,
      total: 6,
    });
  });

  it("empty jobs → all zero", () => {
    expect(summarizeCronHealth([], NOW)).toEqual({
      healthy: 0,
      stale: 0,
      idle: 0,
      review: 0,
      total: 0,
    });
  });
});

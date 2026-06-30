// tests/components/observability/cronHealthStatus.test.ts
import { describe, expect, test } from "vitest";
import { effectiveCronStatus } from "@/components/admin/observability/cronHealthStatus";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";

const base: CronHealthRow = {
  jobName: "sync",
  label: "Sync",
  cadence: "5m",
  staleAfterMs: 20 * 60_000,
  lastRunAt: null,
  outcome: null,
  level: null,
  counts: null,
};
const now = new Date("2026-06-29T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("effectiveCronStatus", () => {
  test("no row → idle 'No run seen'", () => {
    expect(effectiveCronStatus(base, now)).toMatchObject({
      status: "idle",
      label: expect.stringContaining("No run seen"),
    });
  });
  test("stale overrides a stale 'ok' → warn 'Stale'", () => {
    const row = {
      ...base,
      lastRunAt: ago(base.staleAfterMs + 60_000),
      outcome: "ok" as const,
      level: "info" as const,
    };
    expect(effectiveCronStatus(row, now)).toMatchObject({
      status: "warn",
      label: expect.stringContaining("Stale"),
    });
  });
  test("fresh ok → positive 'OK'", () => {
    const row = { ...base, lastRunAt: ago(60_000), outcome: "ok" as const, level: "info" as const };
    expect(effectiveCronStatus(row, now)).toMatchObject({
      status: "positive",
      label: expect.stringContaining("OK"),
    });
  });
  test("fresh partial → review 'Issues'; fresh infra/threw → warn 'Failed'", () => {
    const partial = {
      ...base,
      lastRunAt: ago(60_000),
      outcome: "partial" as const,
      level: "warn" as const,
    };
    expect(effectiveCronStatus(partial, now).status).toBe("review");
    const infra = {
      ...base,
      lastRunAt: ago(60_000),
      outcome: "infra" as const,
      level: "error" as const,
    };
    expect(effectiveCronStatus(infra, now)).toMatchObject({
      status: "warn",
      label: expect.stringContaining("Failed"),
    });
  });
  test("malformed (row present, outcome null) → fall back to level, label 'Ran'", () => {
    const row = { ...base, lastRunAt: ago(60_000), outcome: null, level: "error" as const };
    expect(effectiveCronStatus(row, now)).toMatchObject({
      status: "warn",
      label: expect.stringContaining("Ran"),
    });
  });
});

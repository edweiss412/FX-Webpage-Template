import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_RUN_SUMMARY, CRON_JOBS } from "@/lib/cron/runSummary";

describe("runSummary constants", () => {
  test("CRON_RUN_SUMMARY is the literal code", () => {
    expect(CRON_RUN_SUMMARY).toBe("CRON_RUN_SUMMARY");
  });

  test("CRON_JOBS has 9 logical jobs with unique jobNames and >=2x-cadence staleAfterMs", () => {
    expect(CRON_JOBS).toHaveLength(9);
    const names = CRON_JOBS.map((j) => j.jobName);
    expect(new Set(names).size).toBe(9);
    // each job's real cron cadence; staleAfterMs MUST be >= 2x cadence (the ">=2 missed runs"
    // floor) — asserts the actual multiplier, not just positivity.
    const CADENCE_MS: Record<string, number> = {
      "sync": 5 * 60_000, "notify.realtime": 5 * 60_000, "notify.digest": 3_600_000,
      "refresh-watch": 3_600_000, "gc-watch": 3_600_000, "asset-recovery": 15 * 60_000,
      "diagram-gc": 3_600_000, "report-reaper": 86_400_000, "keepalive": 86_400_000,
    };
    for (const j of CRON_JOBS) {
      expect(Number.isFinite(j.staleAfterMs)).toBe(true);
      expect(j.staleAfterMs).toBeGreaterThanOrEqual(2 * CADENCE_MS[j.jobName]);
    }
    // the 9 logical jobs we expect (must match the CADENCE_MS keys)
    expect(new Set(names)).toEqual(new Set(Object.keys(CADENCE_MS)));
  });

  test("module stays keyword-clean (scanner safety)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib/cron/runSummary.ts"), "utf8");
    for (const kw of ["admin_alert", "upsertAdminAlert", "upsert_admin_alert",
      "last_error_code", "hardErrors", "pending_ingestions", "still_failed", "staged_parse"]) {
      expect(src.toLowerCase()).not.toContain(kw.toLowerCase());
    }
  });
});

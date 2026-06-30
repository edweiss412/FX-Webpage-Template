// tests/cron/cronJobsParity.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_JOBS } from "@/lib/cron/runSummary";

// Explicit jobName ↔ fxav_cron_<name> pairing (bridges hyphen↔underscore and the
// notify route's realtime/digest split). NOT a naive transform.
const PAIRING: Record<string, string> = {
  sync: "fxav_cron_sync",
  "notify.realtime": "fxav_cron_notify_realtime",
  "notify.digest": "fxav_cron_notify_digest",
  "refresh-watch": "fxav_cron_refresh_watch",
  "gc-watch": "fxav_cron_gc_watch",
  "asset-recovery": "fxav_cron_asset_recovery",
  "diagram-gc": "fxav_cron_diagram_gc",
  "report-reaper": "fxav_cron_report_reaper",
  keepalive: "fxav_cron_keepalive",
};

const PG_CRON_JSON = join(
  __dirname,
  "..",
  "..",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

describe("CRON_JOBS parity with pg-cron registry", () => {
  test("CRON_JOBS maps 1:1 onto the 9 fxav_cron_% jobs", () => {
    const raw = JSON.parse(readFileSync(PG_CRON_JSON, "utf8")) as {
      jobs: Array<{ jobname: string }>;
    };
    const pgNames = new Set(
      raw.jobs.map((j) => j.jobname).filter((n) => n.startsWith("fxav_cron_")),
    );
    expect(pgNames.size).toBe(9);
    const mapped = new Set(CRON_JOBS.map((j) => PAIRING[j.jobName]));
    expect(mapped).toEqual(pgNames);
    // every CRON_JOBS entry has a pairing (no unmapped display job)
    for (const j of CRON_JOBS) expect(PAIRING[j.jobName]).toBeTruthy();
  });
});

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationPath = "supabase/migrations/20260602000005_b3_schedule_notify_cron.sql";

const existingFxavJobs = [
  "fxav_cron_asset_recovery",
  "fxav_cron_diagram_gc",
  "fxav_cron_gc_watch",
  "fxav_cron_keepalive",
  "fxav_cron_refresh_watch",
  "fxav_cron_report_reaper",
  "fxav_cron_sync",
];

const notifyJobs = [
  {
    jobname: "fxav_cron_notify_realtime",
    schedule: "*/5 * * * *",
    route: "/api/cron/notify?job=realtime",
  },
  {
    jobname: "fxav_cron_notify_digest",
    schedule: "0 * * * *",
    route: "/api/cron/notify?job=digest",
  },
];

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runPsql(sql: string): string {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for this test");
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    cwd: process.cwd(),
    input: sql,
    encoding: "utf8",
  }).trim();
}

function applyMigration(): void {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for this test");
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", migrationPath], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const livePsqlReachable = ((): boolean => {
  if (!databaseUrl) return false;
  try {
    execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "select 1"], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
})();

if (!livePsqlReachable) {
  console.warn(
    "[b3-notify-cron-idempotency] Skipping live-DB apply-twice test — set TEST_DATABASE_URL to a reachable Postgres with pg_cron, pg_net, and Vault.",
  );
}

describe("B3 notify pg_cron migration idempotency", () => {
  test.skipIf(!livePsqlReachable)(
    "reapplying the notify cron migration preserves existing fxav jobs and creates one active row per notify job",
    () => {
      expect(existsSync(migrationPath), `${migrationPath} should exist`).toBe(true);

      applyMigration();
      applyMigration();

      const scopedJobs = [...existingFxavJobs, ...notifyJobs.map((job) => job.jobname)];
      const rows = JSON.parse(
        runPsql(`
          select coalesce(
            json_agg(
              json_build_object(
                'jobname', jobname,
                'schedule', schedule,
                'command', command,
                'active', active
              )
              order by jobname
            ),
            '[]'::json
          )
          from cron.job
          where jobname in (${scopedJobs.map(sqlLiteral).join(", ")});
        `),
      ) as Array<{ jobname: string; schedule: string; command: string; active: boolean }>;

      const rowsByName = new Map(rows.map((row) => [row.jobname, row]));
      for (const jobname of existingFxavJobs) {
        expect(rowsByName.get(jobname)?.active, `${jobname} should survive the scoped notify reapply`).toBe(true);
      }

      for (const job of notifyJobs) {
        const row = rowsByName.get(job.jobname);
        expect(row, `${job.jobname} should exist after apply-twice`).toBeDefined();
        expect(row?.schedule).toBe(job.schedule);
        expect(row?.active).toBe(true);
        expect(row?.command).toContain("net.http_get(");
        expect(row?.command).not.toContain("net.http_post(");
        expect(row?.command).toContain(job.route);
        expect(row?.command).toContain("headers := jsonb_build_object(");
        expect(row?.command).toContain("'Authorization'");
        expect(row?.command).toContain("'Bearer '");
        expect(row?.command).toContain("vault.decrypted_secrets");
        expect(row?.command).toContain("timeout_milliseconds := 300000");
      }

      const notifyCounts = JSON.parse(
        runPsql(`
          select coalesce(json_object_agg(jobname, job_count order by jobname), '{}'::json)
          from (
            select jobname, count(*)::int as job_count
            from cron.job
            where jobname in (${notifyJobs.map((job) => sqlLiteral(job.jobname)).join(", ")})
            group by jobname
          ) counts;
        `),
      ) as Record<string, number>;

      expect(notifyCounts).toEqual({
        fxav_cron_notify_digest: 1,
        fxav_cron_notify_realtime: 1,
      });
    },
  );
});

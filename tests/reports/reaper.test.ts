import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  cleanupReportFixtures,
  reportRows,
  runPsql,
  seedShow,
  sqlString,
} from "@/tests/reports/_dbHelpers";

const { GET } = await import("@/app/api/cron/report-reaper/route");

const showId = "018f2f4c-8888-4888-9888-000000000001";
const liveLeaseKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e001";
const expiredKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e002";
const resolvedKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e003";

function cronRequest() {
  return new NextRequest("https://crew.fxav.test/api/cron/report-reaper", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function seedReport(
  idempotencyKey: string,
  opts: { createdAt: string; leaseUntil: string; githubIssueUrl?: string | null },
) {
  runPsql(`
    insert into public.reports (
      idempotency_key, show_id, reported_by_kind, reported_by,
      context, message, github_issue_url, processing_lease_until, lease_holder, created_at
    ) values (
      ${sqlString(idempotencyKey)}::uuid,
      ${sqlString(showId)}::uuid,
      'admin',
      'admin',
      '{}'::jsonb,
      'Reaper fixture',
      ${opts.githubIssueUrl ? sqlString(opts.githubIssueUrl) : "NULL"},
      now() ${opts.leaseUntil},
      ${sqlString("018f2f4c-8888-4888-9888-000000000099")}::uuid,
      now() ${opts.createdAt}
    );
  `);
}

function staleLogCount(): number {
  return Number(
    runPsql(`
      select count(*)::int
        from public.sync_log
       where status = 'STALE_ORPHAN_REPORT';
    `),
  );
}

describe("report reaper cron", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    seedShow(showId, "m8-report-reaper");
    runPsql(`delete from public.sync_log where status = 'STALE_ORPHAN_REPORT';`);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    runPsql(`delete from public.sync_log where status = 'STALE_ORPHAN_REPORT';`);
    cleanupReportFixtures(showId, ["admin"]);
  });

  test("deletes only unresolved past-horizon rows whose lease has expired", async () => {
    seedReport(liveLeaseKey, {
      createdAt: "- interval '25 hours'",
      leaseUntil: "+ interval '5 minutes'",
    });
    seedReport(expiredKey, {
      createdAt: "- interval '25 hours'",
      leaseUntil: "- interval '10 minutes'",
    });
    seedReport(resolvedKey, {
      createdAt: "- interval '30 days'",
      leaseUntil: "- interval '30 days'",
      githubIssueUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/resolved",
    });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 1 });
    expect(reportRows(liveLeaseKey)).toHaveLength(1);
    expect(reportRows(expiredKey)).toEqual([]);
    expect(reportRows(resolvedKey)).toHaveLength(1);
    expect(staleLogCount()).toBe(1);
  });

  test("rejects requests without cron authorization", async () => {
    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/report-reaper"));

    expect(response.status).toBe(401);
  });
});

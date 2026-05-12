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
const secondShowId = "018f2f4c-8888-4888-9888-000000000002";
const liveLeaseKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e001";
const expiredKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e002";
const resolvedKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e003";
const secondExpiredKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e004";
const repeatExpiredKey = "018f2f4c-8f54-4c28-9f56-f0f1b2c3e005";

function cronRequest() {
  return new NextRequest("https://crew.fxav.test/api/cron/report-reaper", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function seedReport(
  idempotencyKey: string,
  opts: {
    createdAt: string;
    leaseUntil: string;
    githubIssueUrl?: string | null;
    showId?: string;
  },
) {
  runPsql(`
    insert into public.reports (
      idempotency_key, show_id, reported_by_kind, reported_by,
      context, message, github_issue_url, processing_lease_until, lease_holder, created_at
    ) values (
      ${sqlString(idempotencyKey)}::uuid,
      ${sqlString(opts.showId ?? showId)}::uuid,
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

type StaleAlertRow = {
  show_id: string | null;
  occurrence_count: number;
  context: {
    report_id?: string;
    idempotency_key?: string;
    created_at?: string;
    lease_holder?: string | null;
  };
};

function staleAlerts(): StaleAlertRow[] {
  const raw = runPsql(`
    select coalesce(
      json_agg(
        json_build_object(
          'show_id', show_id,
          'occurrence_count', occurrence_count,
          'context', context
        )
        order by show_id::text
      ),
      '[]'::json
    )::text
      from public.admin_alerts
     where code = 'STALE_ORPHAN_REPORT'
       and resolved_at is null;
  `);
  return JSON.parse(raw) as StaleAlertRow[];
}

describe("report reaper cron", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    seedShow(showId, "m8-report-reaper");
    seedShow(secondShowId, "m8-report-reaper-second");
    runPsql(`delete from public.admin_alerts where code = 'STALE_ORPHAN_REPORT';`);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    runPsql(`delete from public.admin_alerts where code = 'STALE_ORPHAN_REPORT';`);
    cleanupReportFixtures(showId, ["admin"]);
    cleanupReportFixtures(secondShowId, ["admin"]);
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
    expect(staleAlerts()).toEqual([
      expect.objectContaining({
        show_id: showId,
        occurrence_count: 1,
        context: expect.objectContaining({
          idempotency_key: expiredKey,
          created_at: expect.any(String),
          lease_holder: "018f2f4c-8888-4888-9888-000000000099",
          report_id: expect.any(String),
        }),
      }),
    ]);
  });

  test("upserts stale orphan alerts per show and bumps recurrence on later reaps", async () => {
    seedReport(expiredKey, {
      createdAt: "- interval '25 hours'",
      leaseUntil: "- interval '10 minutes'",
    });
    seedReport(secondExpiredKey, {
      createdAt: "- interval '26 hours'",
      leaseUntil: "- interval '10 minutes'",
      showId: secondShowId,
    });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 2 });
    expect(staleAlerts()).toEqual([
      expect.objectContaining({
        show_id: showId,
        occurrence_count: 1,
        context: expect.objectContaining({
          idempotency_key: expiredKey,
          created_at: expect.any(String),
          lease_holder: "018f2f4c-8888-4888-9888-000000000099",
          report_id: expect.any(String),
        }),
      }),
      expect.objectContaining({
        show_id: secondShowId,
        occurrence_count: 1,
        context: expect.objectContaining({
          idempotency_key: secondExpiredKey,
          created_at: expect.any(String),
          lease_holder: "018f2f4c-8888-4888-9888-000000000099",
          report_id: expect.any(String),
        }),
      }),
    ]);

    seedReport(repeatExpiredKey, {
      createdAt: "- interval '27 hours'",
      leaseUntil: "- interval '10 minutes'",
    });

    const repeatResponse = await GET(cronRequest());

    expect(repeatResponse.status).toBe(200);
    await expect(repeatResponse.json()).resolves.toEqual({ ok: true, deleted: 1 });
    expect(staleAlerts()).toEqual([
      expect.objectContaining({
        show_id: showId,
        occurrence_count: 2,
        context: expect.objectContaining({
          idempotency_key: repeatExpiredKey,
          created_at: expect.any(String),
          lease_holder: "018f2f4c-8888-4888-9888-000000000099",
          report_id: expect.any(String),
        }),
      }),
      expect.objectContaining({
        show_id: secondShowId,
        occurrence_count: 1,
        context: expect.objectContaining({
          idempotency_key: secondExpiredKey,
        }),
      }),
    ]);
  });

  test("rejects requests without cron authorization", async () => {
    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/report-reaper"));

    expect(response.status).toBe(401);
  });
});

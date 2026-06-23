import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LookupInconclusive } from "@/lib/github/issues";
import { cleanupReportFixtures, runPsql, seedShow, sqlString } from "@/tests/reports/_dbHelpers";

const githubMock = vi.hoisted(() => ({
  createIssue: vi.fn(),
  findIssueByMarker: vi.fn(),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return {
    ...actual,
    createIssue: githubMock.createIssue,
    findIssueByMarker: githubMock.findIssueByMarker,
  };
});

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-5555-4555-9555-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d701";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "Lookup fail closed",
  surface: "admin_parse_panel",
};

function seedExpiredUnknownOutcomeRow(idempotencyKey = key, targetShowId = showId) {
  runPsql(`
    insert into public.reports (
      idempotency_key, show_id, reported_by_kind, reported_by,
      context, message, processing_lease_until, lease_holder
    ) values (
      ${sqlString(idempotencyKey)}::uuid,
      ${sqlString(targetShowId)}::uuid,
      'admin',
      'admin',
      '{}'::jsonb,
      'Lookup fail closed',
      now() - interval '1 minute',
      ${sqlString("018f2f4c-5555-4555-9555-000000000099")}::uuid
    );
  `);
}

function alertRows(): string[] {
  const raw = runPsql(`
    select concat(coalesce(show_id::text, 'NULL'), ':', code, ':', (context->>'idempotency_key'))
      from public.admin_alerts
     where resolved_at is null
       and (show_id = ${sqlString(showId)}::uuid or show_id is null)
     order by show_id nulls first, code;
  `);
  return raw ? raw.split("\n") : [];
}

function cleanupAlerts() {
  runPsql(`
    delete from public.admin_alerts
     where show_id = ${sqlString(showId)}::uuid
        or show_id is null;
  `);
}

describe("lookup-inconclusive fail-closed recovery", () => {
  beforeEach(() => {
    seedShow(showId, "m8-lookup-fail-closed");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
    cleanupAlerts();
  });

  afterEach(() => {
    cleanupAlerts();
    cleanupReportFixtures(showId, ["admin"]);
  });

  test("pagination errors return 502, write a per-show alert, and never create a duplicate issue", async () => {
    seedExpiredUnknownOutcomeRow();
    githubMock.findIssueByMarker.mockRejectedValue(
      new LookupInconclusive("PAGINATION_ERROR", "page 3 failed"),
    );

    const result = await submitReport({ kind: "admin", email: "admin.com" }, requestBody);

    expect(result).toEqual({
      status: 502,
      body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" },
    });
    expect(githubMock.createIssue).not.toHaveBeenCalled();
    expect(alertRows()).toEqual([`${showId}:REPORT_LOOKUP_INCONCLUSIVE:${key}`]);
  });

  test("missing bot login writes both the global config alert and the per-row lookup alert", async () => {
    seedExpiredUnknownOutcomeRow();
    githubMock.findIssueByMarker.mockRejectedValue(
      new LookupInconclusive("BOT_LOGIN_MISSING", "GITHUB_BOT_LOGIN env var is unset"),
    );

    const result = await submitReport({ kind: "admin", email: "admin.com" }, requestBody);

    expect(result).toEqual({
      status: 502,
      body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" },
    });
    expect(githubMock.createIssue).not.toHaveBeenCalled();
    expect(alertRows()).toEqual([
      `NULL:GITHUB_BOT_LOGIN_MISSING:${key}`,
      `${showId}:REPORT_LOOKUP_INCONCLUSIVE:${key}`,
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  cleanupReportFixtures,
  reportRows,
  runPsql,
  seedShow,
  sqlString,
} from "@/tests/reports/_dbHelpers";

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

const showId = "018f2f4c-7777-4777-9777-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d901";
const lateUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/late-success";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "Late original success",
  surface: "admin_parse_panel",
};

function seedExpiredUnknownOutcomeRow() {
  runPsql(`
    insert into public.reports (
      idempotency_key, show_id, reported_by_kind, reported_by,
      context, message, processing_lease_until, lease_holder
    ) values (
      ${sqlString(key)}::uuid,
      ${sqlString(showId)}::uuid,
      'admin',
      'admin',
      '{}'::jsonb,
      'Late original success',
      now() - interval '1 minute',
      ${sqlString("018f2f4c-7777-4777-9777-000000000099")}::uuid
    );
  `);
}

describe("late-success guard", () => {
  beforeEach(() => {
    seedShow(showId, "m8-late-success");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
  });

  afterEach(() => {
    cleanupReportFixtures(showId, ["admin"]);
  });

  test("retry claim does not create a duplicate when the original tail writes the URL after lookup", async () => {
    seedExpiredUnknownOutcomeRow();
    githubMock.findIssueByMarker.mockImplementation(async () => {
      runPsql(`
        update public.reports
           set github_issue_url = ${sqlString(lateUrl)}
         where idempotency_key = ${sqlString(key)}::uuid;
      `);
      return null;
    });

    const result = await submitReport({ kind: "admin", email: "admin.com" }, requestBody);

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: lateUrl },
    });
    expect(githubMock.createIssue).not.toHaveBeenCalled();
    expect(reportRows(key)).toEqual([`admin:admin::${lateUrl}`]);
  });
});

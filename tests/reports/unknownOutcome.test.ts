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

const showId = "018f2f4c-4444-4444-9444-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d601";
const recoveredUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/recovered";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "Recovered unknown outcome",
  surface: "admin_parse_panel",
  reporter_role: "A1",
};

function seedExpiredUnknownOutcomeRow() {
  runPsql(`
    insert into public.reports (
      idempotency_key, show_id, reported_by_kind, reported_by, reporter_role,
      context, message, processing_lease_until, lease_holder
    ) values (
      ${sqlString(key)}::uuid,
      ${sqlString(showId)}::uuid,
      'admin',
      'admin',
      'A1',
      '{}'::jsonb,
      'Recovered unknown outcome',
      now() - interval '1 minute',
      ${sqlString("018f2f4c-4444-4444-9444-000000000099")}::uuid
    );
  `);
}

describe("unknown-outcome recovery", () => {
  beforeEach(() => {
    seedShow(showId, "m8-unknown-outcome");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
  });

  afterEach(() => {
    cleanupReportFixtures(showId, ["admin"]);
  });

  test("binds the row to a marker-found issue and never calls createIssue", async () => {
    seedExpiredUnknownOutcomeRow();
    githubMock.findIssueByMarker.mockResolvedValue({ htmlUrl: recoveredUrl });

    const result = await submitReport({ kind: "admin" }, requestBody);

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: recoveredUrl },
    });
    expect(githubMock.findIssueByMarker).toHaveBeenCalledTimes(1);
    expect(githubMock.findIssueByMarker.mock.calls[0]?.[0]).toBe(key);
    expect(githubMock.createIssue).not.toHaveBeenCalled();
    expect(reportRows(key)).toEqual([`admin:admin:A1:${recoveredUrl}`]);
  });
});

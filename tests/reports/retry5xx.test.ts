import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  cleanupReportFixtures,
  quotaCount,
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

const showId = "018f2f4c-3333-4333-9333-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d501";
const adminIdentity = "admin";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "The published page is stale",
  surface: "admin_parse_panel",
  reporter_role: "A1",
};

function expireLease(idempotencyKey: string) {
  runPsql(`
    update public.reports
       set processing_lease_until = now() - interval '1 second'
     where idempotency_key = ${sqlString(idempotencyKey)}::uuid;
  `);
}

describe("5xx retry path", () => {
  beforeEach(() => {
    seedShow(showId, "m8-retry-5xx");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
  });

  afterEach(() => {
    cleanupReportFixtures(showId, [adminIdentity]);
  });

  test("keeps an unknown-outcome row in flight until lease expiry, then retries without recharging quota", async () => {
    githubMock.createIssue
      .mockRejectedValueOnce(new Error("GitHub 5xx after reservation"))
      .mockResolvedValueOnce({
        htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/retry-5xx",
        issueNumber: 501,
        labels: ["bug-report", "reporter:admin"],
      });
    githubMock.findIssueByMarker.mockResolvedValue(null);

    const initial = await submitReport({ kind: "admin" }, requestBody);
    expect(initial).toEqual({
      status: 502,
      body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" },
    });
    expect(reportRows(key)).toEqual(["admin:admin:A1:"]);
    expect(quotaCount(adminIdentity)).toBe(1);

    const inFlight = await submitReport({ kind: "admin" }, requestBody);
    expect(inFlight).toEqual({
      status: 409,
      body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" },
    });
    expect(githubMock.findIssueByMarker).not.toHaveBeenCalled();
    expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
    expect(quotaCount(adminIdentity)).toBe(1);

    expireLease(key);

    const recovered = await submitReport({ kind: "admin" }, requestBody);
    expect(recovered).toEqual({
      status: 201,
      body: {
        ok: true,
        status: "created",
        github_issue_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/retry-5xx",
      },
    });
    expect(githubMock.findIssueByMarker).toHaveBeenCalledTimes(1);
    expect(githubMock.createIssue).toHaveBeenCalledTimes(2);
    expect(reportRows(key)).toEqual([
      "admin:admin:A1:https://github.com/edweiss412/FX-Webpage-Template/issues/retry-5xx",
    ]);
    expect(quotaCount(adminIdentity)).toBe(1);
  });
});

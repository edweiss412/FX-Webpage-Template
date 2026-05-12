import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  cleanupReportFixtures,
  reportRows,
  runPsql,
  seedShow,
  sqlString,
} from "@/tests/reports/_dbHelpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const githubMock = vi.hoisted(() => ({
  createIssue: vi.fn(),
  findIssueByMarker: vi.fn(),
  gate: null as null | ReturnType<typeof deferred<{
    htmlUrl: string;
    issueNumber: number;
    labels: string[];
  }>>,
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

const showId = "018f2f4c-6666-4666-9666-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d801";
const retryUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/retry-race";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "Concurrent retry",
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
      'Concurrent retry',
      now() - interval '1 minute',
      ${sqlString("018f2f4c-6666-4666-9666-000000000099")}::uuid
    );
  `);
}

describe("concurrent expired-lease retries", () => {
  beforeEach(() => {
    seedShow(showId, "m8-concurrent-retry");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
    githubMock.gate = deferred();
    githubMock.findIssueByMarker.mockResolvedValue(null);
    githubMock.createIssue.mockImplementation(async (input: { labels: string[] }) => {
      if (githubMock.gate) return await githubMock.gate.promise;
      return { htmlUrl: retryUrl, issueNumber: 88, labels: input.labels };
    });
  });

  afterEach(() => {
    cleanupReportFixtures(showId, ["admin"]);
    githubMock.gate = null;
  });

  test("only one retry claims the expired lease while the other sees in-flight contention", async () => {
    seedExpiredUnknownOutcomeRow();

    const first = submitReport({ kind: "admin", email: "admin.com" }, requestBody);
    await vi.waitFor(() => expect(githubMock.createIssue).toHaveBeenCalledTimes(1));
    const second = await submitReport({ kind: "admin", email: "admin.com" }, requestBody);

    githubMock.gate?.resolve({
      htmlUrl: retryUrl,
      issueNumber: 88,
      labels: ["bug-report", "reporter:admin"],
    });
    const firstResult = await first;

    expect([firstResult.status, second.status].sort()).toEqual([201, 409]);
    expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
    expect(reportRows(key)).toEqual([`admin:admin::${retryUrl}`]);
  });
});

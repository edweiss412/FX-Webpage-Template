import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  cleanupReportFixtures,
  quotaCount,
  reportRows,
  seedShow,
} from "@/tests/reports/_dbHelpers";

type IssueInput = { title: string; body: string; labels: string[] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const githubMock = vi.hoisted(() => ({
  calls: [] as IssueInput[],
  gate: null as null | ReturnType<typeof deferred<{
    htmlUrl: string;
    issueNumber: number;
    labels: string[];
  }>>,
  createIssue: vi.fn(async (input: IssueInput) => {
    githubMock.calls.push(input);
    if (githubMock.gate) return await githubMock.gate.promise;
    return {
      htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/race",
      issueNumber: 44,
      labels: input.labels,
    };
  }),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return { ...actual, createIssue: githubMock.createIssue };
});

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-2222-4222-9222-000000000001";
const crewMemberId = "018f2f4c-2222-4222-9222-000000000002";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e8";

const requestBody = {
  idempotency_key: key,
  show_id: showId,
  message: "Race report",
  surface: "crew_footer",
  reporter_role: "A1",
};

describe("first-submit idempotency race", () => {
  beforeEach(() => {
    githubMock.calls = [];
    githubMock.gate = deferred();
    githubMock.createIssue.mockClear();
    seedShow(showId, "m8-first-submit-race");
  });

  afterEach(() => {
    cleanupReportFixtures(showId, [crewMemberId]);
    githubMock.gate = null;
  });

  test("same brand-new idempotency key creates one row and one GitHub issue", async () => {
    const first = submitReport(
      { kind: "crew", source: "link", showId, crewMemberId, roleFlags: ["A1"] },
      requestBody,
    );
    const second = submitReport(
      { kind: "crew", source: "link", showId, crewMemberId, roleFlags: ["A1"] },
      requestBody,
    );

    await vi.waitFor(() => expect(githubMock.createIssue).toHaveBeenCalledTimes(1));
    githubMock.gate?.resolve({
      htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/race",
      issueNumber: 44,
      labels: ["bug-report", "reporter:crew"],
    });

    const results = await Promise.all([first, second]);

    expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(reportRows(key)).toEqual([
      `crew:${crewMemberId}:A1:https://github.com/edweiss412/FX-Webpage-Template/issues/race`,
    ]);
    expect(quotaCount(crewMemberId)).toBe(1);
  });
});

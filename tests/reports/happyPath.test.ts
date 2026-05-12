import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  cleanupReportFixtures,
  quotaCount,
  reportRows,
  seedShow,
} from "@/tests/reports/_dbHelpers";

const githubMock = vi.hoisted(() => ({
  calls: [] as Array<{ title: string; body: string; labels: string[] }>,
  createIssue: vi.fn(async (input: { title: string; body: string; labels: string[] }) => {
    githubMock.calls.push(input);
    return {
      htmlUrl: `https://github.com/edweiss412/FX-Webpage-Template/issues/${githubMock.calls.length}`,
      issueNumber: githubMock.calls.length,
      labels: input.labels,
    };
  }),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return { ...actual, createIssue: githubMock.createIssue };
});

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-1111-4111-9111-000000000001";
const crewMemberId = "018f2f4c-1111-4111-9111-000000000002";
const adminIdentity = "doug@example.com";

function body(idempotencyKey: string) {
  return {
    idempotency_key: idempotencyKey,
    show_id: showId,
    message: "The schedule looks wrong",
    surface: "admin_parse_panel",
    reporter_role: "A1",
  };
}

describe("submitReport happy path", () => {
  beforeEach(() => {
    githubMock.calls = [];
    githubMock.createIssue.mockClear();
    seedShow(showId, "m8-happy-path");
  });

  afterEach(() => {
    cleanupReportFixtures(showId, [adminIdentity, crewMemberId]);
  });

  test("admin report creates a GitHub issue and stores the URL", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5";

    const result = await submitReport({ kind: "admin", email: adminIdentity }, body(key));

    expect(result).toEqual({
      status: 201,
      body: {
        ok: true,
        status: "created",
        github_issue_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/1",
      },
    });
    expect(githubMock.calls[0]?.labels).toContain("reporter:admin");
    expect(githubMock.calls[0]?.body).toContain(`<!-- fxav-report-id: ${key} -->`);
    expect(reportRows(key)).toEqual([
      "admin:doug@example.com::https://github.com/edweiss412/FX-Webpage-Template/issues/1",
    ]);
    expect(quotaCount(adminIdentity)).toBe(1);
  });

  test("crew report stores reporter id but does not return the GitHub URL", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e6";

    const result = await submitReport(
      { kind: "crew", source: "link", showId, crewMemberId, roleFlags: ["A1", "LEAD"] },
      body(key),
    );

    expect(result).toEqual({ status: 201, body: { ok: true, status: "created" } });
    expect(githubMock.calls[0]?.labels).toContain("reporter:crew");
    expect(githubMock.calls[0]?.body).not.toContain(crewMemberId);
    expect(reportRows(key)).toEqual([
      `crew:${crewMemberId}:A1,LEAD:https://github.com/edweiss412/FX-Webpage-Template/issues/1`,
    ]);
    expect(quotaCount(crewMemberId)).toBe(1);
  });

  test("duplicate idempotency key returns the existing URL without charging quota again", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e7";

    const first = await submitReport({ kind: "admin", email: adminIdentity }, body(key));
    const second = await submitReport({ kind: "admin", email: adminIdentity }, body(key));

    expect(first.status).toBe(201);
    expect(second).toEqual({
      status: 200,
      body: {
        ok: true,
        status: "duplicate",
        github_issue_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/1",
      },
    });
    expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
    expect(reportRows(key)).toHaveLength(1);
    expect(quotaCount(adminIdentity)).toBe(1);
  });
});

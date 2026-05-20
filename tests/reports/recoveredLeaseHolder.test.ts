import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CreatedIssue } from "@/lib/github/issues";
import type { ReportLeaseDb } from "@/lib/reports/leaseProtocol";

const githubMock = vi.hoisted(() => ({
  closeIssueAsOrphan: vi.fn(async () => undefined),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return {
    ...actual,
    closeIssueAsOrphan: githubMock.closeIssueAsOrphan,
  };
});

const { writeRecoveredIssueUrl } = await import("@/lib/reports/submit");

const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5";
const showId = "018f2f4c-0000-4000-9000-000000000001";
const recoveredIssue: CreatedIssue = {
  htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/55",
  issueNumber: 55,
  labels: ["fxav-app:report"],
};

type FakeDbOptions = {
  updateRows: unknown[];
  tailRow: { github_issue_url: string | null; show_id: string | null };
};

function fakeDb(opts: FakeDbOptions) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const db: ReportLeaseDb = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (/UPDATE\s+reports[\s\S]*SET[\s\S]*processing_lease_until[\s\S]*lease_holder/i.test(sql)) {
        return { rows: [{ show_id: showId, lease_holder: params[1] }], rowCount: 1 };
      }
      if (/UPDATE\s+reports[\s\S]*SET\s+github_issue_url/i.test(sql)) {
        return { rows: opts.updateRows, rowCount: opts.updateRows.length };
      }
      if (/SELECT\s+github_issue_url,\s+show_id/i.test(sql)) {
        return { rows: [opts.tailRow], rowCount: 1 };
      }
      if (/INSERT\s+INTO\s+admin_alerts/i.test(sql)) {
        return { rows: [{ id: "alert-id" }], rowCount: 1 };
      }
      throw new Error(`unexpected SQL in recovered lease-holder test: ${sql}`);
    },
  };
  return { db, calls };
}

function contextParam(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

describe("recovered report URL lease-holder fencing", () => {
  beforeEach(() => {
    githubMock.closeIssueAsOrphan.mockClear();
  });

  test("claims a fresh lease before writing the recovered URL", async () => {
    const { db, calls } = fakeDb({
      updateRows: [{ id: "report-id" }],
      tailRow: { github_issue_url: null, show_id: showId },
    });

    const result = await writeRecoveredIssueUrl(
      db,
      { kind: "admin", email: "admin@example.com" },
      key,
      recoveredIssue,
      showId,
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: recoveredIssue.htmlUrl },
    });
    const claim = calls[0];
    const tailUpdate = calls[1];
    expect(claim?.sql).toMatch(/SET[\s\S]*processing_lease_until[\s\S]*lease_holder\s*=\s*\$2::uuid/i);
    expect(tailUpdate?.sql).toMatch(/AND\s+lease_holder\s*=\s*\$3::uuid/i);
    expect(tailUpdate?.params[2]).toBe(claim?.params[1]);
    expect(githubMock.closeIssueAsOrphan).not.toHaveBeenCalled();
  });

  test("cleans up the recovered issue when a stale lease holder loses the tail URL write", async () => {
    const winningUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/56";
    const { db, calls } = fakeDb({
      updateRows: [],
      tailRow: { github_issue_url: winningUrl, show_id: showId },
    });

    const result = await writeRecoveredIssueUrl(
      db,
      { kind: "admin", email: "admin@example.com" },
      key,
      recoveredIssue,
      showId,
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: winningUrl },
    });
    expect(githubMock.closeIssueAsOrphan).toHaveBeenCalledWith(recoveredIssue);
    const alert = calls.find((call) => /INSERT\s+INTO\s+admin_alerts/i.test(call.sql));
    expect(alert?.sql).toMatch(/REPORT_ORPHANED_LOST_LEASE/);
    expect(alert?.params[0]).toBe(showId);
    expect(contextParam(alert?.params[1])).toMatchObject({
      idempotency_key: key,
      orphan_url: recoveredIssue.htmlUrl,
      orphan_issue_number: recoveredIssue.issueNumber,
      row_reaped: false,
    });
  });
});

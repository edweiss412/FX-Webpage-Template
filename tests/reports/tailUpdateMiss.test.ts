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

const { handleTailUpdateMiss } = await import("@/lib/reports/submit");

const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5";
const leaseHolder = "018f2f4c-0000-4000-9000-000000000004";
const showA = "018f2f4c-0000-4000-9000-000000000001";
const showB = "018f2f4c-0000-4000-9000-000000000002";
const myIssue: CreatedIssue = {
  htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/11",
  issueNumber: 11,
  labels: ["bug-report"],
};

type TailRow = {
  github_issue_url: string | null;
  show_id: string | null;
};

function fakeDb(row: TailRow | null) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const db: ReportLeaseDb = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (/SELECT\s+github_issue_url,\s+show_id/i.test(sql)) {
        return { rows: row ? [row] : [] };
      }
      if (/INSERT\s+INTO\s+admin_alerts/i.test(sql)) {
        return { rows: [{ id: "alert-id" }], rowCount: 1 };
      }
      throw new Error(`unexpected SQL in tail-update miss test: ${sql}`);
    },
  };
  return { db, calls };
}

function alertCall(calls: Array<{ sql: string; params: readonly unknown[] }>) {
  const call = calls.find((entry) => /INSERT\s+INTO\s+admin_alerts/i.test(entry.sql));
  expect(call, "expected REPORT_ORPHANED_LOST_LEASE admin_alerts upsert").toBeDefined();
  return call!;
}

function contextParam(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

describe("handleTailUpdateMiss orphan cleanup", () => {
  beforeEach(() => {
    githubMock.closeIssueAsOrphan.mockClear();
  });

  test("does not close the live recovered issue when the row URL equals this worker's issue", async () => {
    const { db, calls } = fakeDb({ github_issue_url: myIssue.htmlUrl, show_id: showA });

    const result = await handleTailUpdateMiss(
      db,
      { kind: "admin", email: "admin.com" },
      key,
      myIssue,
      leaseHolder,
      showA,
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: myIssue.htmlUrl },
    });
    expect(githubMock.closeIssueAsOrphan).not.toHaveBeenCalled();
    expect(calls.some((entry) => /INSERT\s+INTO\s+admin_alerts/i.test(entry.sql))).toBe(false);
  });

  test("closes this worker's issue and alerts when another URL won the row", async () => {
    const winningUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/12";
    const { db, calls } = fakeDb({ github_issue_url: winningUrl, show_id: showA });

    const result = await handleTailUpdateMiss(
      db,
      { kind: "admin", email: "admin.com" },
      key,
      myIssue,
      leaseHolder,
      showB,
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: winningUrl },
    });
    expect(githubMock.closeIssueAsOrphan).toHaveBeenCalledWith(myIssue);

    const call = alertCall(calls);
    expect(call.sql).toMatch(/REPORT_ORPHANED_LOST_LEASE/);
    expect(call.sql).toMatch(
      /ON\s+CONFLICT\s+\(coalesce\(show_id::text,\s*''\),\s*code\)\s+WHERE\s+resolved_at\s+IS\s+NULL/i,
    );
    expect(call.params[0]).toBe(showA);
    expect(contextParam(call.params[1])).toMatchObject({
      idempotency_key: key,
      orphan_url: myIssue.htmlUrl,
      lease_holder: leaseHolder,
      row_reaped: false,
    });
  });

  test("closes this worker's issue, alerts, and returns 409 when the row still has no URL", async () => {
    const { db, calls } = fakeDb({ github_issue_url: null, show_id: showA });

    const result = await handleTailUpdateMiss(
      db,
      { kind: "admin", email: "admin.com" },
      key,
      myIssue,
      leaseHolder,
      showB,
    );

    expect(result).toEqual({ status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } });
    expect(githubMock.closeIssueAsOrphan).toHaveBeenCalledWith(myIssue);

    const call = alertCall(calls);
    expect(call.params[0]).toBe(showA);
    expect(contextParam(call.params[1])).toMatchObject({ row_reaped: false });
  });

  test("closes this worker's issue and preserves fallback show keying when the row was reaped", async () => {
    const { db, calls } = fakeDb(null);

    const result = await handleTailUpdateMiss(
      db,
      { kind: "admin", email: "admin.com" },
      key,
      myIssue,
      leaseHolder,
      showB,
    );

    expect(result).toEqual({ status: 410, body: { ok: false, code: "REPORT_HORIZON_EXPIRED" } });
    expect(githubMock.closeIssueAsOrphan).toHaveBeenCalledWith(myIssue);

    const call = alertCall(calls);
    expect(call.params[0]).toBe(showB);
    expect(contextParam(call.params[1])).toMatchObject({ row_reaped: true });
  });

  test("still upserts the orphan alert when the GitHub close call fails", async () => {
    githubMock.closeIssueAsOrphan.mockRejectedValueOnce(new Error("GitHub close failed"));
    const winningUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/13";
    const { db, calls } = fakeDb({ github_issue_url: winningUrl, show_id: showA });

    const result = await handleTailUpdateMiss(
      db,
      { kind: "admin", email: "admin.com" },
      key,
      myIssue,
      leaseHolder,
      showB,
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: winningUrl },
    });
    const call = alertCall(calls);
    expect(contextParam(call.params[1])).toMatchObject({
      orphan_close_failed: true,
      row_reaped: false,
    });
  });
});

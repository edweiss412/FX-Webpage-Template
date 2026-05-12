import { describe, expect, test } from "vitest";

import {
  acquireReportLease,
  extendReportLease,
  releaseReportLease,
} from "@/lib/reports/leaseProtocol";

type QueryCall = {
  sql: string;
  params: readonly unknown[];
};

function recordingDb(rows: unknown[] = []) {
  const calls: QueryCall[] = [];
  return {
    calls,
    db: {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        return { rows, rowCount: rows.length };
      },
    },
  };
}

const acquireInput = {
  idempotencyKey: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  showId: "018f2f4c-0000-4000-9000-000000000001",
  reportedByKind: "crew" as const,
  reportedBy: "018f2f4c-0000-4000-9000-000000000003",
  reporterRole: "A1",
  context: { surface: "crew_footer" },
  message: "Wrong schedule",
  leaseHolder: "018f2f4c-0000-4000-9000-000000000002",
};

describe("reports lease protocol helpers", () => {
  test("acquireReportLease stamps lease_holder and uses conflict-safe idempotency insertion", async () => {
    const { db, calls } = recordingDb([
      {
        id: "018f2f4c-0000-4000-9000-000000000004",
        lease_holder: acquireInput.leaseHolder,
      },
    ]);

    const result = await acquireReportLease(db, acquireInput);

    expect(result).toEqual({
      acquired: true,
      reportId: "018f2f4c-0000-4000-9000-000000000004",
      leaseHolder: acquireInput.leaseHolder,
    });
    expect(calls[0]?.sql).toMatch(/insert\s+into\s+reports/i);
    expect(calls[0]?.sql).toMatch(/processing_lease_until/i);
    expect(calls[0]?.sql).toMatch(/lease_holder/i);
    expect(calls[0]?.sql).toMatch(/on\s+conflict\s*\(\s*idempotency_key\s*\)\s+do\s+nothing/i);
    expect(calls[0]?.params).toContain(acquireInput.leaseHolder);
  });

  test("extendReportLease only refreshes the caller-owned lease", async () => {
    const { db, calls } = recordingDb([{ id: "report-1" }]);

    const result = await extendReportLease(db, {
      idempotencyKey: acquireInput.idempotencyKey,
      leaseHolder: acquireInput.leaseHolder,
    });

    expect(result).toEqual({ extended: true });
    expect(calls[0]?.sql).toMatch(/update\s+reports/i);
    expect(calls[0]?.sql).toMatch(/lease_holder\s*=\s*\$2::uuid/i);
    expect(calls[0]?.sql).toMatch(/github_issue_url\s+is\s+null/i);
  });

  test("releaseReportLease clears only the caller-owned lease", async () => {
    const { db, calls } = recordingDb([{ id: "report-1" }]);

    const result = await releaseReportLease(db, {
      idempotencyKey: acquireInput.idempotencyKey,
      leaseHolder: acquireInput.leaseHolder,
    });

    expect(result).toEqual({ released: true });
    expect(calls[0]?.sql).toMatch(/update\s+reports/i);
    expect(calls[0]?.sql).toMatch(/lease_holder\s*=\s*null/i);
    expect(calls[0]?.sql).toMatch(/where\s+idempotency_key\s*=\s*\$1/i);
    expect(calls[0]?.sql).toMatch(/and\s+lease_holder\s*=\s*\$2::uuid/i);
  });
});

import { describe, expect, test } from "vitest";

import {
  ReportLeaseInfraError,
  acquireReportLease,
  extendReportLease,
  releaseReportLease,
} from "@/lib/reports/leaseProtocol";

function throwingDb() {
  return {
    query: async () => {
      throw new Error("META: simulated reports DB infrastructure fault");
    },
  };
}

const baseAcquireInput = {
  idempotencyKey: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  showId: "018f2f4c-0000-4000-9000-000000000001",
  reportedByKind: "admin" as const,
  reportedBy: "admin@example.com",
  reporterRole: "LEAD",
  context: { surface: "admin_parse_panel" },
  message: "Looks wrong",
  leaseHolder: "018f2f4c-0000-4000-9000-000000000002",
};

describe("META reports infra-failure contract", () => {
  test("acquireReportLease throws ReportLeaseInfraError on DB throw", async () => {
    await expect(acquireReportLease(throwingDb(), baseAcquireInput)).rejects.toBeInstanceOf(
      ReportLeaseInfraError,
    );
  });

  test("extendReportLease throws ReportLeaseInfraError on DB throw", async () => {
    await expect(
      extendReportLease(throwingDb(), {
        idempotencyKey: baseAcquireInput.idempotencyKey,
        leaseHolder: baseAcquireInput.leaseHolder,
      }),
    ).rejects.toBeInstanceOf(ReportLeaseInfraError);
  });

  test("releaseReportLease throws ReportLeaseInfraError on DB throw", async () => {
    await expect(
      releaseReportLease(throwingDb(), {
        idempotencyKey: baseAcquireInput.idempotencyKey,
        leaseHolder: baseAcquireInput.leaseHolder,
      }),
    ).rejects.toBeInstanceOf(ReportLeaseInfraError);
  });
});

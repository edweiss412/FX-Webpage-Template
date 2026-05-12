import { describe, expect, test } from "vitest";

import {
  ReportLeaseInfraError,
  acquireReportLease,
  extendReportLease,
  releaseReportLease,
} from "@/lib/reports/leaseProtocol";
import {
  GitHubIssueInfraError,
  LookupInconclusive,
  createIssue,
  findIssueByMarker,
} from "@/lib/github/issues";
import { ReportQuotaInfraError, enforceQuota } from "@/lib/reports/rateLimit";

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

  test("createIssue wraps Octokit create throws as GitHubIssueInfraError", async () => {
    const octokit = {
      rest: {
        issues: {
          create: async () => {
            throw new Error("META: simulated issue-create infrastructure fault");
          },
        },
      },
    };

    await expect(
      createIssue(
        { title: "Bug", body: "Body", labels: ["bug-report"] },
        {
          octokit,
          env: {
            GITHUB_API_TOKEN: "ghp_test",
            GITHUB_REPO: "edweiss412/FX-Webpage-Template",
            GITHUB_BOT_LOGIN: "fxav-bot",
          },
        },
      ),
    ).rejects.toBeInstanceOf(GitHubIssueInfraError);
  });

  test("findIssueByMarker wraps Octokit pagination throws as LookupInconclusive", async () => {
    const octokit = {
      rest: {
        issues: {
          listForRepo: async () => {
            throw new Error("META: simulated issue-list infrastructure fault");
          },
        },
      },
    };

    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit,
        env: {
          GITHUB_API_TOKEN: "ghp_test",
          GITHUB_REPO: "edweiss412/FX-Webpage-Template",
          GITHUB_BOT_LOGIN: "fxav-bot",
        },
      }),
    ).rejects.toBeInstanceOf(LookupInconclusive);
  });

  test("enforceQuota throws ReportQuotaInfraError on DB throw", async () => {
    await expect(enforceQuota(throwingDb(), "crew", "crew-1")).rejects.toBeInstanceOf(
      ReportQuotaInfraError,
    );
  });
});

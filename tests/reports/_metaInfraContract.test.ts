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
  closeIssueAsOrphan,
  createIssue,
  findIssueByMarker,
} from "@/lib/github/issues";
import { ReportQuotaInfraError, enforceQuota } from "@/lib/reports/rateLimit";
import { resolveStateGatedAlert } from "@/lib/reports/submit";

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

  test("closeIssueAsOrphan wraps Octokit update throws as GitHubIssueInfraError", async () => {
    const octokit = {
      rest: {
        issues: {
          update: async () => {
            throw new Error("META: simulated issue-update infrastructure fault");
          },
        },
      },
    };

    await expect(
      closeIssueAsOrphan(
        {
          htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/99",
          issueNumber: 99,
          labels: ["bug-report"],
        },
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

  test("resolveStateGatedAlert propagates DB throws instead of silently returning success", async () => {
    await expect(
      resolveStateGatedAlert(
        throwingDb(),
        { kind: "admin" },
        baseAcquireInput.idempotencyKey,
        {
          alertCode: "REPORT_LOOKUP_INCONCLUSIVE",
          responseCode: "REPORT_LOOKUP_INCONCLUSIVE",
          responseStatus: 502,
          context: { idempotency_key: baseAcquireInput.idempotencyKey },
        },
      ),
    ).rejects.toThrow("META: simulated reports DB infrastructure fault");
  });
});

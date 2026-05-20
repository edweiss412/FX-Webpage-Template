import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const supabaseMock = vi.hoisted(() => ({
  mode: "ok" as "ok" | "returned_error" | "thrown_error",
  createSupabaseServiceRoleClient: vi.fn(() => {
    if (supabaseMock.mode === "thrown_error") {
      throw new Error("META: simulated Supabase service-role construction fault");
    }
    return {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    if (supabaseMock.mode === "returned_error") {
                      return {
                        data: null,
                        error: { message: "META: simulated Supabase returned error" },
                      };
                    }
                    return {
                      data: {
                        title: "Meta Show",
                        slug: "meta-show",
                        drive_file_id: "drive_meta",
                        last_synced_at: null,
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: supabaseMock.createSupabaseServiceRoleClient,
}));

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
import { ReportQuotaInfraError, enforceQuota, reserveQuota } from "@/lib/reports/rateLimit";
import {
  ReportSubmitInfraError,
  handleTailUpdateMiss,
  resolveStateGatedAlert,
  submitReport,
  writeRecoveredIssueUrl,
} from "@/lib/reports/submit";
import {
  ReportReaperInfraError,
  runReaperGet,
  runReportReaper,
} from "@/app/api/cron/report-reaper/route";
import { handleReport } from "@/app/api/report/route";

const REGISTERED_INFRA_EXPORTS = [
  "acquireReportLease",
  "extendReportLease",
  "releaseReportLease",
  "createIssue",
  "closeIssueAsOrphan",
  "findIssueByMarker",
  "enforceQuota",
  "reserveQuota",
  "resolveStateGatedAlert",
  "handleTailUpdateMiss",
  "writeRecoveredIssueUrl",
  "submitReport",
  "POST",
  "handleReport",
  "runReportReaper",
  "GET",
  "runReaperGet",
] as const;

const META_SOURCE_FILES = [
  "lib/reports/leaseProtocol.ts",
  "lib/reports/rateLimit.ts",
  "lib/reports/submit.ts",
  "lib/github/issues.ts",
  "app/api/report/route.ts",
  "app/api/cron/report-reaper/route.ts",
] as const;

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

function exportNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/gm;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

function annotatedExportNames(source: string): string[] {
  const names: string[] = [];
  const pattern =
    /\/\/ not-subject-to-meta: [^\n]+\nexport (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/gm;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

function validBody() {
  return {
    idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
    show_id: "018f2f4c-0000-4000-9000-000000000001",
    message: "Looks wrong",
  };
}

function claimedReservationSql() {
  return {
    begin: async <T>() =>
      ({
        state: "claimed" as const,
        leaseHolder: "018f2f4c-0000-4000-9000-000000000002",
      }) as T,
    unsafe: async () => [],
    end: async () => {},
  };
}

describe("META reports infra-failure contract", () => {
  test("every exported M8 backend surface is registered or annotated not-subject-to-meta", () => {
    const source = META_SOURCE_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    const covered = new Set([...REGISTERED_INFRA_EXPORTS, ...annotatedExportNames(source)]);
    const uncovered = exportNames(source).filter((name) => !covered.has(name));

    expect(uncovered).toEqual([]);
  });

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

  test("reserveQuota throws ReportQuotaInfraError on transaction throw", async () => {
    await expect(
      reserveQuota("crew", "crew-1", {
        sql: {
          begin: async () => {
            throw new Error("META: simulated quota transaction fault");
          },
          end: async () => {},
        },
      }),
    ).rejects.toBeInstanceOf(ReportQuotaInfraError);
  });

  test("resolveStateGatedAlert propagates DB throws instead of silently returning success", async () => {
    await expect(
      resolveStateGatedAlert(
        throwingDb(),
        { kind: "admin", email: "admin.com" },
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

  test("handleTailUpdateMiss wraps DB throws as ReportSubmitInfraError", async () => {
    await expect(
      handleTailUpdateMiss(
        throwingDb(),
        { kind: "admin", email: "admin@example.com" },
        baseAcquireInput.idempotencyKey,
        {
          htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/99",
          issueNumber: 99,
          labels: ["bug-report"],
        },
        baseAcquireInput.leaseHolder,
        baseAcquireInput.showId,
      ),
    ).rejects.toBeInstanceOf(ReportSubmitInfraError);
  });

  test("writeRecoveredIssueUrl wraps DB throws as ReportSubmitInfraError", async () => {
    await expect(
      writeRecoveredIssueUrl(
        throwingDb(),
        { kind: "admin", email: "admin@example.com" },
        baseAcquireInput.idempotencyKey,
        {
          htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/99",
          issueNumber: 99,
          labels: ["bug-report"],
        },
        baseAcquireInput.showId,
      ),
    ).rejects.toBeInstanceOf(ReportSubmitInfraError);
  });

  test("submitReport wraps reservation DB throws as ReportSubmitInfraError", async () => {
    await expect(
      submitReport({ kind: "admin", email: "admin@example.com" }, validBody(), {
        sql: {
          begin: async () => {
            throw new Error("META: simulated submit transaction fault");
          },
          unsafe: async () => [],
          end: async () => {},
        },
      }),
    ).rejects.toBeInstanceOf(ReportSubmitInfraError);
  });

  test("submitReport distinguishes Supabase returned errors from thrown show lookups", async () => {
    supabaseMock.mode = "returned_error";
    await expect(
      submitReport({ kind: "admin", email: "admin@example.com" }, validBody(), {
        sql: claimedReservationSql(),
      }),
    ).rejects.toMatchObject({
      operation: "lookupShowContext",
      source: "returned_error",
    });

    supabaseMock.mode = "thrown_error";
    await expect(
      submitReport({ kind: "admin", email: "admin@example.com" }, validBody(), {
        sql: claimedReservationSql(),
      }),
    ).rejects.toMatchObject({
      operation: "lookupShowContext",
      source: "thrown_error",
    });

    supabaseMock.mode = "ok";
  });

  test("POST returns cataloged 500 when submitReport throws typed infra error", async () => {
    const response = await handleReport(
      new Request("https://crew.fxav.test/api/report", {
        method: "POST",
        body: JSON.stringify(validBody()),
        headers: { "content-type": "application/json" },
      }),
      {
        validateLinkSession: async () => ({ kind: "continue" }),
        validateGoogleSession: async () => ({ kind: "continue" }),
        requireAdminIdentity: async () => ({ email: "admin@example.com" }),
        readCrewRoleFlags: async () => ({ ok: true, roleFlags: ["A1"] }),
        submitReport: async () => {
          throw new ReportSubmitInfraError("submitReport", new Error("META"));
        },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "REPORT_PIPELINE_FAILED",
    });
  });

  test("runReportReaper wraps transaction throws as ReportReaperInfraError", async () => {
    await expect(
      runReportReaper({
        sql: {
          begin: async () => {
            throw new Error("META: simulated reaper transaction fault");
          },
          end: async () => {},
        },
      }),
    ).rejects.toBeInstanceOf(ReportReaperInfraError);
  });

  test("cron GET returns cataloged 500 when runReportReaper throws typed infra error", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "meta-secret";
    try {
      const response = await runReaperGet(
        new NextRequest("https://crew.fxav.test/api/cron/report-reaper", {
          headers: { authorization: "Bearer meta-secret" },
        }),
        {
          runReportReaper: async () => {
            throw new ReportReaperInfraError(new Error("META"));
          },
        },
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        code: "REPORT_PIPELINE_FAILED",
      });
    } finally {
      if (originalSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalSecret;
    }
  });
});

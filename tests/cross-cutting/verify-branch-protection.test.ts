import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadRequiredChecksFromSpec } from "@/scripts/generate-traceability";
import { verifyBranchProtection } from "@/scripts/verify-branch-protection";

const REQUIRED_STATUS_CHECKS = loadRequiredChecksFromSpec();
const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL;

afterEach(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
  vi.restoreAllMocks();
});

function legacyProtection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    required_status_checks: { strict: true, contexts: REQUIRED_STATUS_CHECKS },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
    },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    ...overrides,
  };
}

function rulesetProtection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rulesets: [
      {
        name: "main",
        target: "branch",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/heads/main"] } },
        bypass_actors: [],
        rules: [
          { type: "deletion", parameters: { allowed: false } },
          { type: "non_fast_forward", parameters: { allowed: false } },
          {
            type: "pull_request",
            parameters: {
              required_approving_review_count: 1,
              dismiss_stale_reviews_on_push: true,
            },
          },
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: true,
              required_status_checks: REQUIRED_STATUS_CHECKS.map((context) => ({ context })),
            },
          },
        ],
        ...overrides,
      },
    ],
  };
}

function makeFetch({
  legacy,
  rulesets,
  status = 200,
}: {
  legacy?: Record<string, unknown> | null;
  rulesets?: Record<string, unknown>;
  status?: number;
}): typeof fetch {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = input instanceof Request ? input.url : String(input);
    if (status !== 200) {
      return new Response(JSON.stringify({ message: status === 401 ? "Bad credentials" : "Forbidden" }), {
        status,
      });
    }
    if (url.includes("/branches/main/protection")) {
      if (legacy === null) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      return Response.json(legacy ?? legacyProtection());
    }
    if (url.includes("/rulesets")) {
      return Response.json(rulesets ?? { rulesets: [] });
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
}

async function runCase(options: Parameters<typeof makeFetch>[0], env: Record<string, string> = {}) {
  const rpc = vi.fn(async () => ({ data: "alert-id", error: null }));
  const verifyOptions: Parameters<typeof verifyBranchProtection>[0] & {
    adminAlertClient: { rpc: typeof rpc };
  } = {
    env: { GITHUB_REPOSITORY: "owner/repo", GH_APP_TOKEN: "token", ...env },
    fetchImpl: makeFetch(options),
    adminAlertClient: { rpc },
    writeReport: false,
  };
  const result = await verifyBranchProtection({
    ...verifyOptions,
  });
  return { result, rpc };
}

describe("X.6 branch-protection verifier", () => {
  test.each([
    [
      "missing-check-name",
      legacyProtection({
        required_status_checks: {
          strict: true,
          contexts: REQUIRED_STATUS_CHECKS.filter((check) => check !== "x3-trust-domain"),
        },
      }),
      "+missing_check:x3-trust-domain",
    ],
    [
      "insufficient-review-count",
      legacyProtection({
        required_pull_request_reviews: {
          required_approving_review_count: 0,
          dismiss_stale_reviews: true,
        },
      }),
      "review_count:0 < 1",
    ],
    ["enforce-admins-disabled", legacyProtection({ enforce_admins: { enabled: false } }), "enforce_admins:false"],
    [
      "strict-false",
      legacyProtection({ required_status_checks: { strict: false, contexts: REQUIRED_STATUS_CHECKS } }),
      "strict:false",
    ],
    [
      "dismiss-stale-disabled",
      legacyProtection({
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: false,
        },
      }),
      "dismiss_stale_reviews:false",
    ],
    [
      "allow-force-push-enabled",
      legacyProtection({ allow_force_pushes: { enabled: true } }),
      "allow_force_pushes:true",
    ],
  ])("%s emits BRANCH_PROTECTION_DRIFT with the specific named diff", async (_name, legacy, diff) => {
    const { result, rpc } = await runCase({ legacy });

    expect(result.ok).toBe(false);
    expect(rpc).toHaveBeenCalledWith("upsert_admin_alert", {
      p_show_id: null,
      p_code: "BRANCH_PROTECTION_DRIFT",
      p_context: expect.objectContaining({
        failures: expect.arrayContaining([diff]),
        repo: "owner/repo",
      }),
    });
  });

  test("legacy-protection-happy-path exits cleanly without admin alert", async () => {
    const { result, rpc } = await runCase({ legacy: legacyProtection() });

    expect(result.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("ruleset-only-happy-path exits cleanly without admin alert", async () => {
    const { result, rpc } = await runCase({
      legacy: null,
      rulesets: rulesetProtection(),
    });

    expect(result.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["no-token", {}, null, false, false],
    ["gh-app-token-401", { GH_APP_TOKEN: "expired" }, 401, true, false],
    ["pat-403", { GH_APP_TOKEN: "", BRANCH_PROTECTION_PAT: "bad-pat" }, 403, false, true],
    ["expired-token", { GH_APP_TOKEN: "expired" }, 401, true, false],
  ])(
    "%s emits BRANCH_PROTECTION_MONITOR_AUTH_FAILED with auth context",
    async (_name, env, status, appSet, patSet) => {
      const rpc = vi.fn(async () => ({ data: "alert-id", error: null }));
      const verifyOptions: Parameters<typeof verifyBranchProtection>[0] & {
        adminAlertClient: { rpc: typeof rpc };
      } = {
        env: { GITHUB_REPOSITORY: "owner/repo", ...env },
        fetchImpl: makeFetch({ status: status ?? 200 }),
        adminAlertClient: { rpc },
        writeReport: false,
      };
      const result = await verifyBranchProtection(verifyOptions);

      expect(result.ok).toBe(false);
      expect(rpc).toHaveBeenCalledWith("upsert_admin_alert", {
        p_show_id: null,
        p_code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
        p_context: expect.objectContaining({
          gh_app_token_set: appSet,
          pat_set: patSet,
          http_status: status,
          repo: "owner/repo",
        }),
      });
    },
  );

  test("live Supabase admin_alerts producer uses the idempotent RPC path", async () => {
    const supabase = createSupabaseServiceRoleClient();
    await supabase
      .from("admin_alerts")
      .delete()
      .eq("code", "BRANCH_PROTECTION_DRIFT")
      .is("show_id", null);

    const fetchImpl = makeFetch({ legacy: null, rulesets: { rulesets: [] } });
    const env = { GITHUB_REPOSITORY: "owner/repo", GH_APP_TOKEN: "token" };
    const adminAlertClient = supabase as unknown as NonNullable<
      NonNullable<Parameters<typeof verifyBranchProtection>[0]>["adminAlertClient"]
    >;
    await verifyBranchProtection({ env, fetchImpl, adminAlertClient, writeReport: false });
    await verifyBranchProtection({ env, fetchImpl, adminAlertClient, writeReport: false });

    const { data, error } = await supabase
      .from("admin_alerts")
      .select("code, occurrence_count")
      .eq("code", "BRANCH_PROTECTION_DRIFT")
      .is("show_id", null)
      .is("resolved_at", null)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      code: "BRANCH_PROTECTION_DRIFT",
      occurrence_count: 2,
    });

    await supabase
      .from("admin_alerts")
      .delete()
      .eq("code", "BRANCH_PROTECTION_DRIFT")
      .is("show_id", null);
  }, 15000);

  test("admin-alert producer failure still writes drift report and returns failure", async () => {
    const dir = mkdtempSync(join(tmpdir(), "x6-branch-protection-"));
    const reportPath = join(dir, "branch-protection-report.json");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn(async () => {
      throw new Error("synthetic admin_alerts outage");
    });

    try {
      const result = await verifyBranchProtection({
        env: { GITHUB_REPOSITORY: "owner/repo", GH_APP_TOKEN: "token" },
        fetchImpl: makeFetch({ legacy: null, rulesets: { rulesets: [] } }),
        adminAlertClient: { rpc },
        reportPath,
      });

      expect(result.ok).toBe(false);
      expect(result.failures).toContain("+missing_main_ruleset");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[verify-branch-protection] admin_alerts insertion skipped:"),
      );
      expect(readFileSync(reportPath, "utf8")).toContain('"status": "drift"');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("unreachable Supabase URL still writes drift report and returns failure", async () => {
    const dir = mkdtempSync(join(tmpdir(), "x6-branch-protection-"));
    const reportPath = join(dir, "branch-protection-report.json");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.SUPABASE_URL = "http://127.0.0.1:1";

    try {
      const result = await verifyBranchProtection({
        env: { GITHUB_REPOSITORY: "owner/repo", GH_APP_TOKEN: "token", SUPABASE_URL: "http://127.0.0.1:1" },
        fetchImpl: makeFetch({ legacy: null, rulesets: { rulesets: [] } }),
        reportPath,
      });

      expect(result.ok).toBe(false);
      expect(result.failures).toContain("+missing_main_ruleset");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[verify-branch-protection] admin_alerts insertion skipped:"),
      );
      expect(existsSync(reportPath)).toBe(true);
      expect(readFileSync(reportPath, "utf8")).toContain('"status": "drift"');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

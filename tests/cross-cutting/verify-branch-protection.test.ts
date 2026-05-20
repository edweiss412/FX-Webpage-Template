import { describe, expect, test, vi } from "vitest";

import { loadRequiredChecksFromSpec } from "@/scripts/generate-traceability";
import { verifyBranchProtection } from "@/scripts/verify-branch-protection";

const REQUIRED_STATUS_CHECKS = loadRequiredChecksFromSpec();

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
  const insert = vi.fn(async () => ({ data: null, error: null }));
  const result = await verifyBranchProtection({
    env: { GITHUB_REPOSITORY: "owner/repo", GH_APP_TOKEN: "token", ...env },
    fetchImpl: makeFetch(options),
    insertAdminAlert: insert,
    writeReport: false,
  });
  return { result, insert };
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
    const { result, insert } = await runCase({ legacy });

    expect(result.ok).toBe(false);
    expect(insert).toHaveBeenCalledWith({
      code: "BRANCH_PROTECTION_DRIFT",
      context: expect.objectContaining({
        failures: expect.arrayContaining([diff]),
        repo: "owner/repo",
      }),
      severity: "high",
    });
  });

  test("legacy-protection-happy-path exits cleanly without admin alert", async () => {
    const { result, insert } = await runCase({ legacy: legacyProtection() });

    expect(result.ok).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  test("ruleset-only-happy-path exits cleanly without admin alert", async () => {
    const { result, insert } = await runCase({
      legacy: null,
      rulesets: rulesetProtection(),
    });

    expect(result.ok).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  test.each([
    ["no-token", {}, null, false, false],
    ["gh-app-token-401", { GH_APP_TOKEN: "expired" }, 401, true, false],
    ["pat-403", { GH_APP_TOKEN: "", BRANCH_PROTECTION_PAT: "bad-pat" }, 403, false, true],
    ["expired-token", { GH_APP_TOKEN: "expired" }, 401, true, false],
  ])(
    "%s emits BRANCH_PROTECTION_MONITOR_AUTH_FAILED with auth context",
    async (_name, env, status, appSet, patSet) => {
      const insert = vi.fn(async () => ({ data: null, error: null }));
      const result = await verifyBranchProtection({
        env: { GITHUB_REPOSITORY: "owner/repo", ...env },
        fetchImpl: makeFetch({ status: status ?? 200 }),
        insertAdminAlert: insert,
        writeReport: false,
      });

      expect(result.ok).toBe(false);
      expect(insert).toHaveBeenCalledWith({
        code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
        context: expect.objectContaining({
          gh_app_token_set: appSet,
          pat_set: patSet,
          http_status: status,
          repo: "owner/repo",
        }),
        severity: "high",
      });
    },
  );
});

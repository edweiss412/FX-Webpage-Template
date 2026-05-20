import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { loadRequiredChecksFromSpec } from "./generate-traceability";

type AlertPayload = {
  code: "BRANCH_PROTECTION_DRIFT" | "BRANCH_PROTECTION_MONITOR_AUTH_FAILED";
  context: Record<string, unknown>;
  severity: "high";
};

type VerifyOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  insertAdminAlert?: (payload: AlertPayload) => Promise<unknown>;
  writeReport?: boolean;
  reportPath?: string;
  requiredStatusChecks?: readonly string[];
};

type VerifyResult = {
  ok: boolean;
  failures: string[];
  authFailure?: boolean;
};

const DEFAULT_REPORT_PATH = "artifacts/branch-protection-report.json";

function configuredToken(env: Record<string, string | undefined>): { token: string | null; source: "app" | "pat" | null } {
  if (env.GH_APP_TOKEN) return { token: env.GH_APP_TOKEN, source: "app" };
  if (env.BRANCH_PROTECTION_PAT) return { token: env.BRANCH_PROTECTION_PAT, source: "pat" };
  return { token: null, source: null };
}

function repoFromEnv(env: Record<string, string | undefined>): string {
  return env.GITHUB_REPOSITORY || "owner/repo";
}

function writeJsonReport(path: string, body: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

async function defaultInsertAdminAlert(payload: AlertPayload): Promise<unknown> {
  const supabase = createSupabaseServiceRoleClient();
  // not-subject-to-meta: one-shot privileged CI script; failure surface is the X.6 workflow exit code and JSON report.
  const { data, error } = await supabase.from("admin_alerts").insert(payload);
  if (error) throw error;
  return data;
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function contextsFromLegacy(body: Record<string, unknown>): string[] {
  const checks = body.required_status_checks as { contexts?: unknown; checks?: unknown } | undefined;
  const contexts = Array.isArray(checks?.contexts) ? checks.contexts.filter((entry): entry is string => typeof entry === "string") : [];
  const appChecks = Array.isArray(checks?.checks)
    ? checks.checks
        .map((entry) => (typeof entry === "object" && entry && "context" in entry ? (entry as { context?: unknown }).context : null))
        .filter((entry): entry is string => typeof entry === "string")
    : [];
  return unique([...contexts, ...appChecks]);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function legacyFailures(body: Record<string, unknown>, requiredStatusChecks: readonly string[]): string[] {
  const failures: string[] = [];
  const required = body.required_status_checks as { strict?: unknown } | undefined;
  if (required?.strict !== true) failures.push(`strict:${String(required?.strict)}`);
  const contexts = contextsFromLegacy(body);
  for (const check of requiredStatusChecks) {
    if (!contexts.includes(check)) failures.push(`+missing_check:${check}`);
  }
  const reviews = body.required_pull_request_reviews as
    | { required_approving_review_count?: unknown; dismiss_stale_reviews?: unknown }
    | undefined;
  const count = Number(reviews?.required_approving_review_count ?? 0);
  if (count < 1) failures.push(`review_count:${count} < 1`);
  if (reviews?.dismiss_stale_reviews !== true) failures.push(`dismiss_stale_reviews:${String(reviews?.dismiss_stale_reviews)}`);
  const admins = body.enforce_admins as { enabled?: unknown } | boolean | undefined;
  const adminsEnabled = typeof admins === "boolean" ? admins : admins?.enabled;
  if (adminsEnabled !== true) failures.push(`enforce_admins:${String(adminsEnabled)}`);
  const force = body.allow_force_pushes as { enabled?: unknown } | undefined;
  if (force?.enabled !== false) failures.push(`allow_force_pushes:${String(force?.enabled)}`);
  const deletions = body.allow_deletions as { enabled?: unknown } | undefined;
  if (deletions?.enabled !== false) failures.push(`allow_deletions:${String(deletions?.enabled)}`);
  return failures;
}

function rulesetTargetsMain(ruleset: Record<string, unknown>): boolean {
  const conditions = ruleset.conditions as { ref_name?: { include?: unknown } } | undefined;
  const include = conditions?.ref_name?.include;
  if (!Array.isArray(include)) return false;
  return include.some((entry) => entry === "refs/heads/main" || entry === "main" || entry === "~DEFAULT_BRANCH");
}

function rulesetFailures(body: Record<string, unknown>, requiredStatusChecks: readonly string[]): string[] {
  const rulesets = (Array.isArray(body.rulesets) ? body.rulesets : Array.isArray(body) ? body : []) as Record<string, unknown>[];
  const ruleset = rulesets.find((entry) => entry.enforcement === "active" && rulesetTargetsMain(entry));
  if (!ruleset) return ["+missing_main_ruleset"];
  const rules = Array.isArray(ruleset.rules) ? (ruleset.rules as Record<string, unknown>[]) : [];
  const status = rules.find((rule) => rule.type === "required_status_checks")?.parameters as
    | { strict_required_status_checks_policy?: unknown; required_status_checks?: unknown }
    | undefined;
  if (!status) return ["+missing_ruleset_required_status_checks"];
  const failures: string[] = [];
  if (status.strict_required_status_checks_policy !== true) {
    failures.push(`strict:${String(status.strict_required_status_checks_policy)}`);
  }
  const contexts = Array.isArray(status.required_status_checks)
    ? status.required_status_checks
        .map((entry) => (typeof entry === "object" && entry ? (entry as { context?: unknown }).context : null))
        .filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const check of requiredStatusChecks) {
    if (!contexts.includes(check)) failures.push(`+missing_check:${check}`);
  }
  const pr = rules.find((rule) => rule.type === "pull_request")?.parameters as
    | { required_approving_review_count?: unknown; dismiss_stale_reviews_on_push?: unknown }
    | undefined;
  const count = Number(pr?.required_approving_review_count ?? 0);
  if (count < 1) failures.push(`review_count:${count} < 1`);
  if (pr?.dismiss_stale_reviews_on_push !== true) failures.push(`dismiss_stale_reviews:${String(pr?.dismiss_stale_reviews_on_push)}`);
  if (ruleset.bypass_actors && Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length > 0) {
    failures.push("enforce_admins:false");
  }
  const deletion = rules.find((rule) => rule.type === "deletion");
  const nonFastForward = rules.find((rule) => rule.type === "non_fast_forward");
  if (!deletion) failures.push("allow_deletions:true");
  if (!nonFastForward) failures.push("allow_force_pushes:true");
  return failures;
}

async function emitAlert(insertAdminAlert: (payload: AlertPayload) => Promise<unknown>, payload: AlertPayload): Promise<void> {
  await insertAdminAlert(payload);
}

export async function verifyBranchProtection(options: VerifyOptions = {}): Promise<VerifyResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const insertAdminAlert = options.insertAdminAlert ?? defaultInsertAdminAlert;
  const repo = repoFromEnv(env);
  const [owner, repoName] = repo.split("/");
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH;
  const token = configuredToken(env);
  const requiredStatusChecks = options.requiredStatusChecks ?? loadRequiredChecksFromSpec();

  if (!owner || !repoName || !token.token) {
    const context = {
      gh_app_token_set: Boolean(env.GH_APP_TOKEN),
      pat_set: Boolean(env.BRANCH_PROTECTION_PAT),
      http_status: null,
      last_successful_auth: null,
      repo,
    };
    await emitAlert(insertAdminAlert, {
      code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
      context,
      severity: "high",
    });
    if (options.writeReport !== false) writeJsonReport(reportPath, { status: "auth_failed", context });
    return { ok: false, failures: ["auth_failed"], authFailure: true };
  }

  const base = `https://api.github.com/repos/${owner}/${repoName}`;
  const legacy = await requestJson(fetchImpl, `${base}/branches/main/protection`, token.token);
  if (legacy.status === 401 || legacy.status === 403) {
    const context = {
      gh_app_token_set: Boolean(env.GH_APP_TOKEN),
      pat_set: Boolean(env.BRANCH_PROTECTION_PAT),
      http_status: legacy.status,
      last_successful_auth: null,
      repo,
    };
    await emitAlert(insertAdminAlert, {
      code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
      context,
      severity: "high",
    });
    if (options.writeReport !== false) writeJsonReport(reportPath, { status: "auth_failed", context });
    return { ok: false, failures: ["auth_failed"], authFailure: true };
  }

  let failures: string[] = [];
  if (legacy.status === 200 && legacy.body && typeof legacy.body === "object") {
    failures = legacyFailures(legacy.body as Record<string, unknown>, requiredStatusChecks);
  } else {
    const rulesets = await requestJson(fetchImpl, `${base}/rulesets`, token.token);
    if (rulesets.status === 401 || rulesets.status === 403) {
      const context = {
        gh_app_token_set: Boolean(env.GH_APP_TOKEN),
        pat_set: Boolean(env.BRANCH_PROTECTION_PAT),
        http_status: rulesets.status,
        last_successful_auth: null,
        repo,
      };
      await emitAlert(insertAdminAlert, {
        code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
        context,
        severity: "high",
      });
      if (options.writeReport !== false) writeJsonReport(reportPath, { status: "auth_failed", context });
      return { ok: false, failures: ["auth_failed"], authFailure: true };
    }
    failures = rulesets.body && typeof rulesets.body === "object" ? rulesetFailures(rulesets.body as Record<string, unknown>, requiredStatusChecks) : ["+missing_branch_protection"];
  }

  if (failures.length > 0) {
    const context = { failures, repo, ts: new Date().toISOString() };
    await emitAlert(insertAdminAlert, {
      code: "BRANCH_PROTECTION_DRIFT",
      context,
      severity: "high",
    });
    if (options.writeReport !== false) writeJsonReport(reportPath, { status: "drift", failures, repo });
    return { ok: false, failures };
  }

  if (options.writeReport !== false) {
    writeJsonReport(reportPath, { status: "ok", checks: requiredStatusChecks, repo });
  }
  return { ok: true, failures: [] };
}

async function main(): Promise<void> {
  const result = await verifyBranchProtection();
  if (!result.ok) {
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

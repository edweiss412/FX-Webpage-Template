/**
 * tests/scripts/_report-fixtures-helpers.ts — M12 Phase 0.E.
 *
 * Shared local-Supabase test infrastructure for the validation:report-fixtures
 * harness suites (Task 0.E.1 producer-state map + Task 0.E.2 rendering
 * predicates). Spawns the harness CLI against the local stack, mints fixture
 * shows via the SECURITY DEFINER mint RPC, and exposes psql helpers scoped to a
 * local-DB guard.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalize } from "@/lib/email/canonicalize";
import { type CliRun, runValidationCli } from "./_cli-helpers";

export const REPO_ROOT = process.cwd();
export const TSCONFIG_PATH = join(REPO_ROOT, "tsconfig.json");
export const REPORT_FIXTURES_SCRIPT = join(
  REPO_ROOT,
  "scripts/validation-report-fixtures.ts",
);

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
export const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const VALIDATION_ADMIN_EMAIL = "validation-admin-test@example.com";
const _canonicalAdminIdentity = canonicalize(VALIDATION_ADMIN_EMAIL);
if (!_canonicalAdminIdentity) {
  throw new Error("test setup: canonicalize() returned empty for fixture email");
}
export const CANONICAL_ADMIN_IDENTITY: string = _canonicalAdminIdentity;

export const TODAY = new Date().toISOString().slice(0, 10);

const LOCAL_DB_GUARD =
  /^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])/;

export function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

export function pgQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function runHarness(
  args: string[],
  extraEnv: Record<string, string> = {},
): CliRun {
  return runValidationCli({
    scriptPath: REPORT_FIXTURES_SCRIPT,
    args: [...args, "--allow-local-override"],
    envLocalValues: {
      VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
      VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
      VALIDATION_SUPABASE_PROJECT_REF: "local",
      VALIDATION_ADMIN_EMAIL,
      ...extraEnv,
    },
  });
}

export function makeSharedCwd(): string {
  return mkdtempSync(join(tmpdir(), "validation-rpt-fixtures-shared-"));
}

/**
 * Spawn the harness in a SHARED cwd so the snapshot file persists across
 * multiple invocations (F39 duplicate-seed regression).
 */
export function runHarnessInCwd(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): CliRun {
  const envLocal = {
    VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
    VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
    VALIDATION_SUPABASE_PROJECT_REF: "local",
    VALIDATION_ADMIN_EMAIL,
    ...extraEnv,
  };
  const lines = Object.entries(envLocal)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(join(cwd, ".env.local"), lines + "\n");
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "--tsconfig",
      TSCONFIG_PATH,
      REPORT_FIXTURES_SCRIPT,
      ...args,
      "--allow-local-override",
    ],
    { cwd, encoding: "utf-8", env: process.env },
  );
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Hard reset of m12-fixture rows across all 3 producer tables, including the
 * real canonical-admin identity row and any supplied crew-UUID rows. Local-DB
 * guarded — refuses against a non-local DATABASE_URL.
 */
export function reportFixturesCleanup(crewIds: string[] = []): void {
  if (!LOCAL_DB_GUARD.test(DATABASE_URL)) {
    throw new Error(
      `reportFixturesCleanup refused: DATABASE_URL=${DATABASE_URL} is not local`,
    );
  }
  const crewIdList = crewIds
    .filter((id) => /^[0-9a-f-]+$/i.test(id))
    .map((id) => `'${id}'`)
    .join(",");
  const crewClause = crewIdList
    ? `OR (kind='crew' AND identity IN (${crewIdList}))`
    : "";
  runPsql(`
    DELETE FROM public.admin_alerts
      WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
    DELETE FROM public.report_rate_limits
      WHERE identity LIKE 'validation:m12-fixture-%'
         OR (kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)})
         ${crewClause};
    DELETE FROM public.reports
      WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
  `);
}

/**
 * Mint a fixture show via the SECURITY DEFINER mint RPC. The mint derives
 * drive_file_id = 'validation_' || combo (mint migration :67), so both shows
 * land under the `validation\_%` + client_label='M12 Validation' sentinel that
 * safeValidationCleanup() targets.
 */
export function mintCombo(combo: string, showTitle: string): void {
  const payload = JSON.stringify({
    showName: showTitle,
    dates: { travelIn: TODAY, set: TODAY, showDays: [TODAY], travelOut: TODAY },
    crewMembers: [
      {
        alias: "alias_5a_lead",
        name: `${combo}_alias_5a_lead`,
        email: "test.validation.user@gmail.com",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
    validationTodayIso: TODAY,
    seededBy: "report-fixtures-helpers.ts",
    seededProjectRef: "local",
  });
  runPsql(
    `SELECT public.mint_validation_fixture_atomic(${pgQuote(combo)}, ${pgQuote(
      payload,
    )}::jsonb);`,
  );
}

export function showIdByDrive(driveFileId: string): string {
  return runPsql(
    `SELECT id FROM public.shows WHERE drive_file_id=${pgQuote(driveFileId)};`,
  );
}

export function crewIdFor(driveFileId: string): string {
  return runPsql(
    `SELECT cm.id FROM public.crew_members cm
       JOIN public.shows s ON cm.show_id = s.id
      WHERE s.drive_file_id=${pgQuote(driveFileId)}
      LIMIT 1;`,
  );
}

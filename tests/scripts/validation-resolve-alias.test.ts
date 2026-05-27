/**
 * tests/scripts/validation-resolve-alias.test.ts — M12 Phase 0.C Task 0.C.6.
 *
 * End-to-end probe of the resolve-alias CLI against local Supabase.
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const TODAY = new Date().toISOString().slice(0, 10);

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

type Run = { code: number; stdout: string; stderr: string };
function runResolve(combo: string, alias: string): Run {
  try {
    const stdout = execFileSync(
      "pnpm",
      [
        "-s",
        "validation:resolve-alias",
        combo,
        alias,
        "--allow-local-override",
      ],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
          VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
          VALIDATION_SUPABASE_PROJECT_REF: "local",
        },
      },
    );
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

function cleanup(): void {
  runPsql(`
    DELETE FROM public.validation_state WHERE key = 'validation_seed';
    DELETE FROM public.show_share_tokens
      WHERE show_id IN (SELECT id FROM public.shows WHERE drive_file_id LIKE 'validation_%');
    DELETE FROM public.crew_members
      WHERE show_id IN (SELECT id FROM public.shows WHERE drive_file_id LIKE 'validation_%');
    DELETE FROM public.shows WHERE drive_file_id LIKE 'validation_%';
  `);
}

function mintR1(): void {
  const payload = JSON.stringify({
    showName: "M12 Validation — R1",
    dates: {
      travelIn: TODAY,
      set: TODAY,
      showDays: [TODAY],
      travelOut: TODAY,
    },
    crewMembers: [
      {
        alias: "alias_5a_lead",
        name: "R1_alias_5a_lead",
        email: "test.validation.user@gmail.com",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
    validationTodayIso: TODAY,
    seededBy: "validation-resolve-alias.test.ts",
    seededProjectRef: "local",
  });
  runPsql(
    `SELECT public.mint_validation_fixture_atomic('R1', '${payload}'::jsonb);`,
  );
}

describe("validation-resolve-alias", () => {
  beforeAll(() => {
    cleanup();
    mintR1();
  });
  afterAll(() => {
    cleanup();
  });

  test("happy path: prints UUID for (R1, alias_5a_lead)", () => {
    const res = runResolve("R1", "alias_5a_lead");
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("exits 1 on unknown combo", () => {
    const res = runResolve("R999", "alias_5a_lead");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/alias_map missing combo 'R999'/);
  });

  test("exits 1 on unknown alias", () => {
    const res = runResolve("R1", "alias_unknown");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/missing alias 'alias_unknown'/);
  });
});

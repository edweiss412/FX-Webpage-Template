/**
 * tests/scripts/validation-check-seed.test.ts — M12 Phase 0.C Task 0.C.5.
 *
 * End-to-end tests that exercise each predicate in scripts/validation-
 * check-seed.ts against local Supabase (REST + service_role + the mint
 * RPC from Task 0.C.4).
 */
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
// Well-known local Supabase service_role key — surfaced by `npx supabase status -o env`.
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_PROJECT_REF = "local";
const REAL_CLAIM_EMAIL = "test.validation.user@gmail.com";

const TODAY = new Date().toISOString().slice(0, 10);

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

type CheckSeedRun = { code: number; stdout: string; stderr: string };
function runCheckSeed(
  combo?: string,
  envOverrides: Record<string, string> = {},
): CheckSeedRun {
  const args = ["-s", "validation:check-seed", "--allow-local-override"];
  if (combo) args.push("--combo", combo);
  try {
    const stdout = execFileSync("pnpm", args, {
      encoding: "utf-8",
      env: {
        ...process.env,
        VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
        VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
        VALIDATION_SUPABASE_PROJECT_REF: LOCAL_PROJECT_REF,
        VALIDATION_J3_CLAIM_EMAIL: REAL_CLAIM_EMAIL,
        ...envOverrides,
      },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as {
      status?: number;
      stdout?: Buffer;
      stderr?: Buffer;
    };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

const R_COMBO_ALIASES = [
  { alias: "alias_5a_lead", roleFlags: ["LEAD"] },
  { alias: "alias_5b_lead_a1", roleFlags: ["LEAD", "A1"] },
  { alias: "alias_5c_bo_lead", roleFlags: ["BO", "LEAD"] },
  { alias: "alias_6a_a1", roleFlags: ["A1"] },
  { alias: "alias_6b_v1", roleFlags: ["V1"] },
  { alias: "alias_6c_l1", roleFlags: ["L1"] },
  { alias: "alias_6d_bo", roleFlags: ["BO"] },
  { alias: "alias_6e_a1_l1", roleFlags: ["A1", "L1"] },
  { alias: "alias_6f_empty", roleFlags: [] as string[] },
];

function isRCombo(c: string): boolean {
  return /^R\d/.test(c);
}

function mintCombo(combo: string): void {
  const aliases = isRCombo(combo)
    ? R_COMBO_ALIASES
    : [{ alias: "alias_5a_lead", roleFlags: ["LEAD"] }];
  const payload = JSON.stringify({
    showName: `M12 Validation — ${combo}`,
    dates: {
      travelIn: TODAY,
      set: TODAY,
      showDays: [TODAY],
      travelOut: TODAY,
    },
    crewMembers: aliases.map(({ alias, roleFlags }) => ({
      alias,
      name: `${combo}_${alias}`,
      email:
        combo === "R1" && alias === "alias_5a_lead"
          ? REAL_CLAIM_EMAIL
          : `validation+${combo.toLowerCase()}-${alias.replace(/^alias_/, "").replace(/_/g, "-")}@example.com`,
      roleFlags,
      dateRestriction: { kind: "none" },
      stageRestriction: { kind: "none" },
    })),
    validationTodayIso: TODAY,
    seededBy: "validation-check-seed.test.ts",
    seededProjectRef: LOCAL_PROJECT_REF,
  });
  runPsql(
    `SELECT public.mint_validation_fixture_atomic('${combo}', '${payload}'::jsonb);`,
  );
}

function finalizeAll(combos: string[]): void {
  const list = combos.map((c) => `'${c}'`).join(",");
  runPsql(
    `SELECT public.validation_finalize_all_atomic(ARRAY[${list}]::text[], '${TODAY}');`,
  );
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

describe("validation-check-seed", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  test("predicate (a): exits 1 when validation_state row is missing", () => {
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(a\)/);
  });

  test("predicate (k): exits 1 when VALIDATION_J3_CLAIM_EMAIL is a placeholder", () => {
    mintCombo("R1");
    const res = runCheckSeed("R1", {
      VALIDATION_J3_CLAIM_EMAIL: "fake@example.com",
    });
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(k\)/);
  });

  test("predicate (b): exits 1 under --combo all when last_seed_date IS NULL (finalizer never ran)", () => {
    mintCombo("R1");
    const res = runCheckSeed("all");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(b\)/);
    expect(res.stderr).toMatch(/last_seed_date IS NULL/);
  });

  test("predicate (b'): exits 1 when combos_seeded_dates[<single>] is stale", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.validation_state
        SET combos_seeded_dates = jsonb_set(combos_seeded_dates, '{R1}', '"2020-01-01"'::jsonb)
       WHERE key = 'validation_seed';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(b'\)/);
    expect(res.stderr).toMatch(/2020-01-01/);
  });

  test("predicate (c): exits 1 when --combo all but combos_materialized missing combos", () => {
    mintCombo("R1");
    finalizeAll(["R1"]); // bypass — we're testing (c) not (i)
    const res = runCheckSeed("all");
    expect(res.code).toBe(1);
    // (c) fires after (b) passes; or (i) may fire first depending on ordering.
    expect(res.stderr).toMatch(/predicate \(c\)|predicate \(i\)/);
  });

  test("predicate (d): exits 1 when seeded_supabase_project_ref doesn't match env", () => {
    mintCombo("R1");
    finalizeAll(["R1"]);
    // single combo dispatch sidesteps (b/c/e/i) by scoping to just R1.
    const res = runCheckSeed("R1", {
      VALIDATION_SUPABASE_PROJECT_REF: "wrong-project-ref",
    });
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(d\)/);
  });

  test("predicate (g): exits 1 when show_share_tokens row is missing for a seeded show", () => {
    mintCombo("R1");
    runPsql(`
      DELETE FROM public.show_share_tokens
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(g\)/);
  });

  test("predicate (l): exits 1 when claimed_via_oauth_at IS NOT NULL post-reseed", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.crew_members SET claimed_via_oauth_at = now()
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = 'R1_alias_5a_lead';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(l\)/);
  });

  test("predicate (m): exits 1 when an orphan crew_members row exists for a validation show", () => {
    mintCombo("R1");
    runPsql(`
      INSERT INTO public.crew_members
        (show_id, name, email, role, role_flags, date_restriction, stage_restriction)
      VALUES (
        (SELECT id FROM public.shows WHERE drive_file_id='validation_R1'),
        'orphan_stale_lead',
        'orphan-stale@example.com',
        'LEAD',
        ARRAY['LEAD']::text[],
        '{"kind":"none"}'::jsonb,
        '{"kind":"none"}'::jsonb
      );
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(m\)/);
  });

  test("predicate (n): exits 1 when validation show has archived=true post-reseed", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.shows SET archived = true
       WHERE drive_file_id = 'validation_R1';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(n\)/);
  });

  test("single-combo happy path: exits 0 when --combo R1 against a freshly-minted R1", () => {
    mintCombo("R1");
    const res = runCheckSeed("R1");
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/OK: seed matches today/);
  });
});

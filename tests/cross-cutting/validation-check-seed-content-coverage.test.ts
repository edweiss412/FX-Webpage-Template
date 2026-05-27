/**
 * tests/cross-cutting/validation-check-seed-content-coverage.test.ts
 *
 * Structural defense per AGENTS.md "structural-defense calibration" —
 * Codex Phase 0.C R3+R4+R5 all surfaced same-vector findings on
 * check-seed content-match. The R5 repair (preemptive comprehensive
 * sweep) plus this meta-test close the class at CI time: every column
 * the canonical FIXTURES build writes must be covered by predicate (o),
 * and predicate (e) must enforce exact alias-key coverage.
 *
 * Strategy: mint a canonical R1 fixture against local Supabase, then
 * parameterize-mutate each known fixture-derived column ONE AT A TIME
 * via service-role psql, run pnpm validation:check-seed --combo R1, and
 * assert exit 1 with a predicate (o) or (e) diagnostic.
 *
 * Adding a new fixture-derived column to FixtureRow / FixtureCrewMember
 * requires extending the MUTATIONS array below. Forgetting to also
 * extend predicate (o) → meta-test catches it (the mutation lands in
 * the DB but check-seed PASSes → assertion fails).
 *
 * Failure mode caught: future amendment adds a new fixture column (e.g.,
 * date_restriction.kind values, hotel_reservations linkage, etc.)
 * without extending predicate (o), creating a new sub-shape of the
 * same-vector content-match bug class.
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const REAL_CLAIM_EMAIL = "test.validation.user@gmail.com";

const TODAY = new Date().toISOString().slice(0, 10);

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

type Run = { code: number; stdout: string; stderr: string };
function runCheckSeed(combo: string): Run {
  try {
    const stdout = execFileSync(
      "pnpm",
      [
        "-s",
        "validation:check-seed",
        "--allow-local-override",
        "--combo",
        combo,
      ],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
          VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
          VALIDATION_SUPABASE_PROJECT_REF: "local",
          VALIDATION_J3_CLAIM_EMAIL: REAL_CLAIM_EMAIL,
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

function mintR1Canonical(): void {
  // Use the actual reseed via psql + buildFixtures to ensure perfect
  // alignment with canonical FIXTURES.
  process.env.VALIDATION_J3_CLAIM_EMAIL = REAL_CLAIM_EMAIL;
  // Build inline (avoid importing buildFixtures here — keeps meta-test
  // self-contained / less likely to drift with internal refactors).
  // R1 fixture per spec §3.3: travelIn=yesterday, set=today, showDays=[today, tomorrow], travelOut=today+2.
  const offsetDate = (d: string, delta: number): string => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + delta);
    return x.toISOString().slice(0, 10);
  };
  const tomorrow = offsetDate(TODAY, 1);
  const yesterday = offsetDate(TODAY, -1);
  const dayAfter = offsetDate(TODAY, 2);
  const aliases = [
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
  const payload = JSON.stringify({
    showName: "M12 Validation — R1",
    dates: {
      travelIn: yesterday,
      set: TODAY,
      showDays: [TODAY, tomorrow],
      travelOut: dayAfter,
    },
    crewMembers: aliases.map(({ alias, roleFlags }) => ({
      alias,
      name: `R1_${alias}`,
      email:
        alias === "alias_5a_lead"
          ? REAL_CLAIM_EMAIL
          : `validation+r1-${alias.replace(/^alias_/, "").replace(/_/g, "-")}@example.com`,
      roleFlags,
      dateRestriction: { kind: "none" },
      stageRestriction: { kind: "none" },
    })),
    validationTodayIso: TODAY,
    seededBy: "validation-check-seed-content-coverage.test.ts",
    seededProjectRef: "local",
  });
  runPsql(
    `SELECT public.mint_validation_fixture_atomic('R1', '${payload}'::jsonb);`,
  );
}

// =============================================================================
// Coverage matrix — every fixture-derived column that predicate (o) MUST
// detect a mutation on. Adding a new column to FixtureRow /
// FixtureCrewMember requires adding a row here AND extending predicate
// (o). The "expectsPredicate" column names what diagnostic should fire.
// =============================================================================
const MUTATIONS: Array<{
  field: string;
  sql: string;
  expectsPredicate: "o" | "e";
  matchHint: RegExp;
}> = [
  {
    field: "shows.dates",
    sql: `UPDATE public.shows SET dates = '{"travelIn":"2020-01-01"}'::jsonb WHERE drive_file_id='validation_R1';`,
    expectsPredicate: "o",
    matchHint: /shows\.dates drifted/,
  },
  {
    field: "shows.title",
    sql: `UPDATE public.shows SET title = 'WRONG' WHERE drive_file_id='validation_R1';`,
    expectsPredicate: "o",
    matchHint: /shows\.title drifted/,
  },
  {
    field: "shows.slug",
    sql: `UPDATE public.shows SET slug = 'wrong-slug' WHERE drive_file_id='validation_R1';`,
    expectsPredicate: "o",
    matchHint: /shows\.slug drifted/,
  },
  {
    field: "crew_members.date_restriction",
    sql: `UPDATE public.crew_members SET date_restriction = '{"kind":"unknown_asterisk"}'::jsonb WHERE name = 'R1_alias_5a_lead' AND show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');`,
    expectsPredicate: "o",
    matchHint: /date_restriction drifted/,
  },
  {
    field: "crew_members.stage_restriction",
    sql: `UPDATE public.crew_members SET stage_restriction = '{"kind":"explicit","stages":["Strike"]}'::jsonb WHERE name = 'R1_alias_5a_lead' AND show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');`,
    expectsPredicate: "o",
    matchHint: /stage_restriction drifted/,
  },
  {
    field: "crew_members.email",
    sql: `UPDATE public.crew_members SET email = 'wrong@gmail.com' WHERE name = 'R1_alias_6a_a1' AND show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');`,
    expectsPredicate: "o",
    matchHint: /email drifted/,
  },
  {
    field: "crew_members.role_flags",
    sql: `UPDATE public.crew_members SET role_flags = ARRAY['WRONG']::text[] WHERE name = 'R1_alias_5a_lead' AND show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');`,
    expectsPredicate: "o",
    matchHint: /role_flags drifted/,
  },
  {
    field: "crew_members.role",
    sql: `UPDATE public.crew_members SET role = 'WRONG ROLE' WHERE name = 'R1_alias_5a_lead' AND show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');`,
    expectsPredicate: "o",
    matchHint: /role drifted/,
  },
  {
    field: "alias_map alias-key mismatch (R5 F1)",
    sql: `UPDATE public.validation_state SET alias_map = jsonb_set(alias_map, '{R1,alias_foo_NEW}', alias_map->'R1'->'alias_5a_lead') #- '{R1,alias_5a_lead}' WHERE key='validation_seed';`,
    expectsPredicate: "e",
    matchHint: /alias_map\[R1\] has aliases/,
  },
];

describe("validation check-seed content-coverage meta-test (M12 Phase 0.C R5 structural defense)", () => {
  beforeAll(() => {
    cleanup();
    mintR1Canonical();
    // Sanity: baseline check-seed PASSes before any mutation.
    const baseline = runCheckSeed("R1");
    if (baseline.code !== 0) {
      throw new Error(
        `Meta-test setup failed — baseline check-seed --combo R1 did not exit 0:\n${baseline.stderr}`,
      );
    }
  });
  afterAll(() => {
    cleanup();
  });

  for (const { field, sql, expectsPredicate, matchHint } of MUTATIONS) {
    test(`predicate (${expectsPredicate}) catches mutation of ${field}`, () => {
      // Full clean + re-mint for each mutation to defend against
      // state-leak from prior mutations (especially alias_map mutations
      // that survive a re-UPSERT).
      cleanup();
      mintR1Canonical();
      runPsql(sql);
      const res = runCheckSeed("R1");
      expect(res.code, `${field} mutation should make check-seed exit 1`).toBe(1);
      expect(res.stderr).toMatch(new RegExp(`predicate \\(${expectsPredicate}\\)`));
      expect(res.stderr).toMatch(matchHint);
    });
  }
});

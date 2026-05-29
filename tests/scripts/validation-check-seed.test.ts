/**
 * tests/scripts/validation-check-seed.test.ts — M12 Phase 0.C Task 0.C.5.
 *
 * End-to-end tests that exercise each predicate in scripts/validation-
 * check-seed.ts against local Supabase (REST + service_role + the mint
 * RPC from Task 0.C.4).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { safeValidationCleanup } from "../db/_validation-cleanup-helpers";
import { runValidationCli, type CliRun } from "./_cli-helpers";

import { buildFixtures, fixtureCrewName } from "@/scripts/lib/validation-fixtures";

const CHECK_SEED_SCRIPT = join(
  process.cwd(),
  "scripts/validation-check-seed.ts",
);

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

function runCheckSeed(
  combo?: string,
  envOverrides: Record<string, string> = {},
): CliRun {
  // R25-F1 — hermetic tmpdir cwd + test-controlled .env.local containing
  // the VALIDATION_* values. The CLI's loadValidationEnv reads from
  // <cwd>/.env.local (same code path as production); no env-flag bypass.
  const args = ["--allow-local-override"];
  if (combo) args.push("--combo", combo);
  return runValidationCli({
    scriptPath: CHECK_SEED_SCRIPT,
    args,
    envLocalValues: {
      VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
      VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
      VALIDATION_SUPABASE_PROJECT_REF: LOCAL_PROJECT_REF,
      VALIDATION_J3_CLAIM_EMAIL: REAL_CLAIM_EMAIL,
      ...envOverrides,
    },
  });
}

function mintCombo(combo: string): void {
  // Build the canonical fixture for this combo via the same code path the
  // reseed CLI uses — predicate (o) requires the live DB content to match
  // these exact shapes. Hand-rolled flat shapes would fail (o).
  process.env.VALIDATION_J3_CLAIM_EMAIL = REAL_CLAIM_EMAIL;
  const allFixtures = buildFixtures(TODAY);
  const fixture = allFixtures.find((f) => f.combo === combo);
  if (!fixture) {
    throw new Error(`mintCombo helper: no fixture for combo ${combo}`);
  }
  const payload = JSON.stringify({
    showName: fixture.showName,
    dates: fixture.dates,
    crewMembers: fixture.crewMembers.map((c) => ({
      alias: c.alias,
      name: c.name,
      email: c.email,
      roleFlags: c.roleFlags,
      dateRestriction: fixture.dateRestriction,
      stageRestriction: fixture.stageRestriction,
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
  safeValidationCleanup();
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

  test("R24-F1 — --today flag is rejected (no stale-seed bypass via operator-supplied date)", () => {
    // Pre-R24 the CLI accepted --today YYYY-MM-DD and used it for the
    // freshness predicates + fixture reconstruction. An operator could
    // pass an old date to make a stale seed green. R24 retired the
    // flag — node:util parseArgs throws on the unknown option.
    const res = runValidationCli({
      scriptPath: CHECK_SEED_SCRIPT,
      args: [
        "--allow-local-override",
        "--combo",
        "R1",
        "--today",
        "2020-01-01",
      ],
      envLocalValues: {
        VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
        VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
        VALIDATION_SUPABASE_PROJECT_REF: LOCAL_PROJECT_REF,
        VALIDATION_J3_CLAIM_EMAIL: REAL_CLAIM_EMAIL,
      },
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/unknown option|UNKNOWN_OPTION/i);
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
         AND name = '${fixtureCrewName("alias_5a_lead")}';
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

  test("F1 (Codex Phase 0.C R1) — exits 1 when alias_map[R2] points at R1 crew IDs (cross-combo poisoning)", () => {
    // Setup: mint both R1 + R2, then corrupt R2's alias_map slice to
    // reference R1's crew UUIDs. Predicate (f) must reject because the
    // crew row's show_id won't match validation_R2.
    mintCombo("R1");
    mintCombo("R2");
    runPsql(`
      UPDATE public.validation_state
        SET alias_map = jsonb_set(
          alias_map,
          '{R2}',
          alias_map->'R1'
        )
       WHERE key = 'validation_seed';
    `);
    const res = runCheckSeed("R2");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(f\)/);
    expect(res.stderr).toMatch(/Cross-combo alias poisoning|expected show/);
  });

  test("R3-F1 (Codex Phase 0.C R3) — exits 1 when shows.dates drifts from canonical fixture (predicate o)", () => {
    mintCombo("R1");
    // Mutate shows.dates to a different canonical shape — predicate (o)
    // must catch even though predicates (a)-(n) all PASS.
    runPsql(`
      UPDATE public.shows
        SET dates = '{"travelIn":"2020-01-01","set":"2020-01-01","showDays":["2020-01-01"],"travelOut":"2020-01-01"}'::jsonb
       WHERE drive_file_id = 'validation_R1';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/shows\.dates drifted/);
  });

  test("R3-F1 (Codex Phase 0.C R3) — exits 1 when crew.date_restriction drifts (predicate o)", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.crew_members
        SET date_restriction = '{"kind":"unknown_asterisk"}'::jsonb
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = '${fixtureCrewName("alias_5a_lead")}';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/date_restriction drifted/);
  });

  test("R4-F1 (Codex Phase 0.C R4) — exits 1 when crew.role_flags drifts (predicate o role_flags)", () => {
    mintCombo("R1");
    // Mutate alias_5a_lead from ['LEAD'] to [] (the canonical 5a_lead is
    // [LEAD]); predicate (o) role_flags must catch.
    runPsql(`
      UPDATE public.crew_members
        SET role_flags = ARRAY[]::text[]
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = '${fixtureCrewName("alias_5a_lead")}';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/role_flags drifted/);
  });

  test("Comprehensive content-match sweep — exits 1 when shows.title drifts (predicate o title)", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.shows SET title = 'WRONG TITLE'
       WHERE drive_file_id = 'validation_R1';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/shows\.title drifted/);
  });

  test("Comprehensive content-match sweep — exits 1 when crew.role (derived) drifts", () => {
    mintCombo("R1");
    runPsql(`
      UPDATE public.crew_members SET role = 'WRONG ROLE'
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = '${fixtureCrewName("alias_5a_lead")}';
    `);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/role drifted/);
  });

  test("R3-F2 (Codex Phase 0.C R3) — exits 1 when R1.alias_5a_lead.email diverges from env (predicate o)", () => {
    // Seed R1 with the canonical real-gmail email.
    mintCombo("R1");
    // Operator runs check-seed with a DIFFERENT canonical email (also real).
    // Predicate (o) must catch the drift because the canonicalized env
    // value no longer matches what the FIXTURES build expects.
    const res = runCheckSeed("R1", {
      VALIDATION_J3_CLAIM_EMAIL: "different.real.user@gmail.com",
    });
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(o\)/);
    expect(res.stderr).toMatch(/email drifted/);
  });

  test("R15-F2 (Codex Phase 0.C R15) — non-validation row 'validationX123' must NOT be treated as a validation show", () => {
    // PostgREST `.like('drive_file_id', 'validation_%')` uses SQL LIKE
    // where `_` is a single-char wildcard, so 'validationX123' matches
    // server-side. Without R15-F2's client-side startsWith('validation_')
    // filter, check-seed would treat this as a stale validation show and
    // fail predicate (n) — but the finalizer's escaped LIKE wouldn't
    // delete it, blocking the gate permanently.
    mintCombo("R1");
    runPsql(`
      INSERT INTO public.shows (drive_file_id, slug, title, client_label, template_version, dates, archived, published)
      VALUES ('validationX123', 'validationX123', 'Adjacent Show (not validation)', 'Test', 'v4', '{}'::jsonb, false, true);
    `);
    const res = runCheckSeed("R1");
    // R15-F2 fix: check-seed should NOT classify validationX123 as a
    // validation show. predicate (n) should not fire on it. With combo R1,
    // a successful run requires no orphan validation rows.
    expect(res.code).toBe(0);
    runPsql(`DELETE FROM public.shows WHERE drive_file_id = 'validationX123';`);
  });

  test("R9-F1 (Codex Phase 0.C R9) — exits 1 when alias_map contains a stale top-level combo key", () => {
    mintCombo("R1");
    // Inject a stale alias_map key simulating a retired-from-spec combo
    // (e.g., the pre-split R7).
    runPsql(`
      UPDATE public.validation_state
        SET alias_map = jsonb_set(alias_map, '{R7}', '{"alias_5a_lead":"00000000-0000-0000-0000-000000000000"}'::jsonb)
       WHERE key = 'validation_seed';
    `);
    // check-seed --combo R1 should catch the stale R7 key (the stale-key
    // guard fires regardless of dispatch).
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(c\)/);
    expect(res.stderr).toMatch(/stale.*R7/);
  });

  test("F1 fail-fast — exits 1 when validation_<combo> show is missing entirely", () => {
    // Setup: mint R1, then DELETE the show row (cascades to crew_members)
    // but leave alias_map[R1] in place. Predicate (f) fail-fast must
    // surface "validation show is missing" rather than silently skipping.
    mintCombo("R1");
    runPsql(`DELETE FROM public.shows WHERE drive_file_id = 'validation_R1';`);
    const res = runCheckSeed("R1");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/predicate \(f\)/);
    expect(res.stderr).toMatch(/validation show.*is missing/);
  });
});

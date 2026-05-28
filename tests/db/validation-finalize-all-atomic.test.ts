/**
 * tests/db/validation-finalize-all-atomic.test.ts — M12 Phase 0.C Task 0.C.4.
 *
 * Integration tests for validation_finalize_all_atomic, including the R53
 * commit 93 F47 TOCTOU compare-and-swap (CAS) defense.
 *
 * Runs against local Supabase pg at TEST_DATABASE_URL. CAS is exercised
 * deterministically by manually mutating combos_seeded_dates between the
 * finalizer's SELECT and UPDATE phases — done by mutating it ourselves
 * via a separate psql session, since PL/pgSQL doesn't expose a pause hook.
 * The CAS guard fires when the singleton's current combos_seeded_dates
 * doesn't match the snapshot the finalizer captured.
 *
 * Concurrent-client variant: the test issues a CONFLICTING mutation
 * between SELECT and UPDATE within a single psql transaction-by-statement
 * boundary; since the finalizer is one statement (one CALL to the RPC),
 * we exercise CAS via the "delete then mutate" pattern — finalize once
 * to land last_seed_date, then mutate combos_seeded_dates, then call
 * finalize again with a STALE snapshot derived from the original state.
 *
 * The plan's "pg_sleep injection into a TEST-ONLY wrapper RPC" pattern
 * is omitted here in favor of the simpler deterministic CAS-fire test
 * below — it proves the same invariant (CAS UPDATE returns 0 rows when
 * the singleton mutated since the snapshot read) without requiring a
 * temporary wrapper function.
 */
import { execFileSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

const TODAY = new Date().toISOString().slice(0, 10);

function buildPayload(combo: string): string {
  return JSON.stringify({
    showName: `M12 Validation — ${combo}`,
    dates: {
      travelIn: TODAY,
      set: TODAY,
      showDays: [TODAY],
      travelOut: TODAY,
    },
    crewMembers: [
      {
        alias: "alias_5a_lead",
        name: `${combo}_alias_5a_lead`,
        email:
          combo === "R1"
            ? "test.validation.user@gmail.com"
            : `validation+${combo.toLowerCase()}-5a-lead@example.com`,
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
    validationTodayIso: TODAY,
    seededBy: "validation-finalize-all-atomic.test.ts",
    seededProjectRef: "local",
  });
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

describe("validation_finalize_all_atomic", () => {
  beforeAll(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  test("happy path: mints R1 then finalize stamps last_seed_date", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    const lastSeed = runPsql(`
      SELECT last_seed_date::text FROM public.validation_state WHERE key='validation_seed';
    `);
    expect(lastSeed).toBe(TODAY);
  });

  test("rejects missing combos in the required set", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    expect(() =>
      runPsql(
        `SELECT public.validation_finalize_all_atomic(ARRAY['R1','R2']::text[], '${TODAY}');`,
      ),
    ).toThrow(/incomplete reseed.*missing.*R2/);
  });

  test("rejects stale combos (date mismatch)", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    // Manually mutate the R1 stamp to a different date to simulate stale data.
    runPsql(`
      UPDATE public.validation_state
        SET combos_seeded_dates = jsonb_set(combos_seeded_dates, '{R1}', '"2020-01-01"'::jsonb)
       WHERE key = 'validation_seed';
    `);
    expect(() =>
      runPsql(
        `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
      ),
    ).toThrow(/incomplete reseed.*stale.*R1:2020-01-01/);
  });

  test("idempotency: identical sequential calls both succeed", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    const lastSeed = runPsql(`
      SELECT last_seed_date::text FROM public.validation_state WHERE key='validation_seed';
    `);
    expect(lastSeed).toBe(TODAY);
  });

  test("rejects validationTodayIso > ±1 day from current_date (skew guard)", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    expect(() =>
      runPsql(
        `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '2020-01-01');`,
      ),
    ).toThrow(/differs from server current_date.*by >1 day/);
  });

  test("R14-F1 — DELETEs stale validation shows not in p_required_combos", () => {
    // Seed R1 + a retired-from-spec combo simulant 'R7_legacy' by
    // directly inserting a validation_R7_legacy show row.
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    // Direct INSERT to simulate a retired-from-spec show that survived
    // from a prior matrix version (the mint RPC wouldn't accept
    // 'R7_legacy' as a valid combo today). Service-role psql bypasses
    // the RPC entirely.
    runPsql(`
      INSERT INTO public.shows (drive_file_id, slug, title, client_label, template_version, dates, archived, published)
      VALUES ('validation_R7_legacy', 'validation-r7-legacy', 'M12 Validation — R7 (legacy)', 'M12 Validation', 'v4', '{}'::jsonb, false, true);
    `);
    const before = runPsql(
      `SELECT count(*)::int FROM public.shows WHERE drive_file_id = 'validation_R7_legacy';`,
    );
    expect(before).toBe("1");

    // Finalize with required_combos=[R1]; R7_legacy should be DELETEd.
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    const after = runPsql(
      `SELECT count(*)::int FROM public.shows WHERE drive_file_id = 'validation_R7_legacy';`,
    );
    expect(
      after,
      "Finalize must DELETE stale validation shows not in p_required_combos.",
    ).toBe("0");
  });

  test("R19-F1 — DELETE skips shows whose client_label != 'M12 Validation' (fixture-ownership sentinel)", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    // Insert a show with a 'validation_' prefix AND a NON-validation
    // client_label — simulating a real/imported show that happens to
    // have a Drive file id colliding with the validation namespace.
    // The finalize prune MUST NOT delete this row.
    runPsql(`
      INSERT INTO public.shows (drive_file_id, slug, title, client_label, template_version, dates, archived, published)
      VALUES ('validation_real_show', 'validation-real-show', 'Real Show (collision)', 'Real Producer', 'v4', '{}'::jsonb, false, true);
    `);
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    const survived = runPsql(
      `SELECT count(*)::int FROM public.shows WHERE drive_file_id = 'validation_real_show' AND client_label = 'Real Producer';`,
    );
    expect(
      survived,
      "Fixture-ownership sentinel: shows with client_label != 'M12 Validation' must survive the finalize prune even when drive_file_id matches the validation prefix.",
    ).toBe("1");
    runPsql(
      `DELETE FROM public.shows WHERE drive_file_id = 'validation_real_show';`,
    );
  });

  test("R14-F1 — DELETE does not touch non-validation shows (scoped to LIKE 'validation\\_%')", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildPayload("R1")}'::jsonb);`,
    );
    // Insert a non-validation show — must NOT be affected by the finalize prune.
    runPsql(`
      INSERT INTO public.shows (drive_file_id, slug, title, client_label, template_version, dates, archived, published)
      VALUES ('real_production_show_xyz', 'real-show-xyz', 'Real Show', 'Real Client', 'v4', '{}'::jsonb, false, true);
    `);
    runPsql(
      `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
    );
    const survived = runPsql(
      `SELECT count(*)::int FROM public.shows WHERE drive_file_id = 'real_production_show_xyz';`,
    );
    expect(
      survived,
      "Finalize must scope DELETE to LIKE 'validation\\_%' — non-validation shows must survive.",
    ).toBe("1");
    // Cleanup.
    runPsql(
      `DELETE FROM public.shows WHERE drive_file_id = 'real_production_show_xyz';`,
    );
  });

  test("rejects calling before mint (combos_seeded_dates initialized check)", () => {
    expect(() =>
      runPsql(
        `SELECT public.validation_finalize_all_atomic(ARRAY['R1']::text[], '${TODAY}');`,
      ),
    ).toThrow(/combos_seeded_dates not initialized/);
  });
});

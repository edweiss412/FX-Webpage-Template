/**
 * tests/db/mint-validation-fixture-atomic.test.ts — M12 Phase 0.C Task 0.C.4.
 *
 * Integration tests for mint_validation_fixture_atomic + the supporting
 * write contracts (F11 claimed_via_oauth_at reset, F16 full-replace orphan
 * delete, F19 show_share_tokens self-heal, F27 archived/published baseline
 * restore, F49 mint never writes last_seed_date).
 *
 * Runs against local Supabase pg at TEST_DATABASE_URL (default
 * postgres:54322). The mint RPC is service_role-only — these tests invoke
 * it via psql which connects as the postgres superuser.
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

function buildR1Payload(opts?: { showName?: string; claimEmail?: string }): string {
  const claim = opts?.claimEmail ?? "test.validation.user@gmail.com";
  return JSON.stringify({
    showName: opts?.showName ?? "M12 Validation — R1",
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
        email: claim,
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
      {
        alias: "alias_6a_a1",
        name: "R1_alias_6a_a1",
        email: "validation+r1-6a-a1@example.com",
        roleFlags: ["A1"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
    validationTodayIso: TODAY,
    seededBy: "mint-validation-fixture-atomic.test.ts",
    seededProjectRef: "local",
  });
}

function cleanup(): void {
  // Strip everything the test class might have written. Run in a single
  // psql call for atomicity + speed.
  runPsql(`
    DELETE FROM public.validation_state WHERE key = 'validation_seed';
    DELETE FROM public.show_share_tokens
      WHERE show_id IN (SELECT id FROM public.shows WHERE drive_file_id LIKE 'validation_%');
    DELETE FROM public.crew_members
      WHERE show_id IN (SELECT id FROM public.shows WHERE drive_file_id LIKE 'validation_%');
    DELETE FROM public.shows WHERE drive_file_id LIKE 'validation_%';
  `);
}

describe("mint_validation_fixture_atomic", () => {
  beforeAll(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  test("happy path: mints show + crew_members + alias_map slice", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );

    const showRow = runPsql(`
      SELECT s.drive_file_id, s.slug, s.title, s.archived::text, s.published::text
        FROM public.shows s WHERE s.drive_file_id = 'validation_R1';
    `);
    expect(showRow).toBe(
      "validation_R1\tvalidation-r1\tM12 Validation — R1\tfalse\ttrue",
    );

    const crewCount = runPsql(`
      SELECT count(*)
        FROM public.crew_members cm
       WHERE cm.show_id = (SELECT id FROM public.shows WHERE drive_file_id = 'validation_R1');
    `);
    expect(crewCount).toBe("2");

    const aliasKeys = runPsql(`
      SELECT string_agg(k, ',' ORDER BY k)
        FROM (
          SELECT jsonb_object_keys(alias_map->'R1') AS k
            FROM public.validation_state WHERE key='validation_seed'
        ) t;
    `);
    expect(aliasKeys).toBe("alias_5a_lead,alias_6a_a1");
  });

  test("F19 self-heal: re-creates show_share_tokens row when removed out-of-band", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    runPsql(`
      DELETE FROM public.show_share_tokens
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');
    `);
    const beforeCount = runPsql(`
      SELECT count(*) FROM public.show_share_tokens
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');
    `);
    expect(beforeCount).toBe("0");

    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    const afterCount = runPsql(`
      SELECT count(*) FROM public.show_share_tokens
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');
    `);
    expect(afterCount).toBe("1");

    const tokenShape = runPsql(`
      SELECT share_token FROM public.show_share_tokens
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1');
    `);
    expect(tokenShape).toMatch(/^[0-9a-f]{64}$/);
  });

  test("F27 baseline restore: archived/published reset on every reseed", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    runPsql(`
      UPDATE public.shows SET archived = true, published = false
       WHERE drive_file_id = 'validation_R1';
    `);
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    const post = runPsql(`
      SELECT archived::text, published::text FROM public.shows WHERE drive_file_id='validation_R1';
    `);
    expect(post).toBe("false\ttrue");
  });

  test("F11 baseline-claim reset: claimed_via_oauth_at = NULL on every reseed", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    runPsql(`
      UPDATE public.crew_members SET claimed_via_oauth_at = now()
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = 'R1_alias_5a_lead';
    `);
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    const isNull = runPsql(`
      SELECT (claimed_via_oauth_at IS NULL)::text
        FROM public.crew_members
       WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
         AND name = 'R1_alias_5a_lead';
    `);
    expect(isNull).toBe("true");
  });

  test("F16 full-replace: orphan crew_members removed on reseed", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
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
    const beforeCount = runPsql(`
      SELECT count(*) FROM public.crew_members
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
          AND name = 'orphan_stale_lead';
    `);
    expect(beforeCount).toBe("1");

    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    const afterCount = runPsql(`
      SELECT count(*) FROM public.crew_members
        WHERE show_id = (SELECT id FROM public.shows WHERE drive_file_id='validation_R1')
          AND name = 'orphan_stale_lead';
    `);
    expect(afterCount).toBe("0");
  });

  test("F49: initial INSERT leaves last_seed_date NULL (singleton-creation path)", () => {
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', '${buildR1Payload()}'::jsonb);`,
    );
    const lastSeed = runPsql(`
      SELECT (last_seed_date IS NULL)::text
        FROM public.validation_state WHERE key='validation_seed';
    `);
    expect(lastSeed).toBe("true");

    const r1Stamp = runPsql(`
      SELECT combos_seeded_dates->>'R1'
        FROM public.validation_state WHERE key='validation_seed';
    `);
    expect(r1Stamp).toBe(TODAY);
  });

  test("TZ-skew guard: rejects validationTodayIso > ±1 day from server current_date", () => {
    const stale = "2020-01-01";
    expect(() =>
      runPsql(
        `SELECT public.mint_validation_fixture_atomic('R1', jsonb_set('${buildR1Payload()}'::jsonb, '{validationTodayIso}', '"${stale}"'::jsonb));`,
      ),
    ).toThrow(/differs from server current_date.*by >1 day/);
  });

  test("R12-F1 — provenance freshens on every reseed (seeded_by + seeded_at advance)", () => {
    // First seed with seededBy='operator-a'.
    const firstPayload = buildR1Payload();
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', jsonb_set('${firstPayload}'::jsonb, '{seededBy}', '"operator-a"'::jsonb));`,
    );
    const first = runPsql(`
      SELECT seeded_by || E'\\t' || seeded_at::text FROM public.validation_state WHERE key='validation_seed';
    `);
    const [firstBy, firstAt] = first.split("\t");
    expect(firstBy).toBe("operator-a");

    // Wait briefly so the timestamp can advance, then re-mint with 'operator-b'.
    // pg now() has microsecond resolution; a 5ms gap is enough.
    execFileSync("sh", ["-c", "sleep 0.05"]);
    const secondPayload = buildR1Payload();
    runPsql(
      `SELECT public.mint_validation_fixture_atomic('R1', jsonb_set('${secondPayload}'::jsonb, '{seededBy}', '"operator-b"'::jsonb));`,
    );
    const second = runPsql(`
      SELECT seeded_by || E'\\t' || seeded_at::text FROM public.validation_state WHERE key='validation_seed';
    `);
    const [secondBy, secondAt] = second.split("\t");
    expect(secondBy).toBe("operator-b");
    expect(
      new Date(secondAt as string).getTime(),
      `seeded_at should advance on every reseed; firstAt=${firstAt} secondAt=${secondAt}`,
    ).toBeGreaterThan(new Date(firstAt as string).getTime());
  });

  test("R1 alias_5a_lead defense-in-depth: rejects placeholder reserved domain", () => {
    const payload = buildR1Payload({
      claimEmail: "fake@example.com",
    });
    expect(() =>
      runPsql(
        `SELECT public.mint_validation_fixture_atomic('R1', '${payload}'::jsonb);`,
      ),
    ).toThrow(/placeholder\/dev-only reserved domain/);
  });
});

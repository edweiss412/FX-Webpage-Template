/**
 * tests/db/validation-state.test.ts (M12 Phase 0.B Task 0.B.2)
 *
 * Behavioral schema probe for the `validation_state` singleton table
 * (M12 spec §3.3.2). TDD-first: pre-migration this entire file
 * FAILs because the relation does not exist; post-migration both
 * tests PASS.
 *
 * Pattern (R17 commit 40 F17 amendment): psql against TEST_DATABASE_URL
 * via execFileSync. supabase-js cannot query `information_schema`
 * because PostgREST only exposes `public` / `graphql_public` / `dev`
 * schemas. Mirrors the canonical harness at
 * `tests/db/admin-rls-runtime.test.ts:55-79`.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

// R61 F52 helper — apply a full SQL file via psql -f. Mirrors the
// runPsql execFileSync pattern but uses -f for whole-file application
// instead of stdin/-c.
function runPsqlFile(filePath: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", filePath], {
    encoding: "utf8",
  });
}

// R65 F54 helper — restore a captured validation_state row from an
// in-process JSON snapshot atomically. `jsonb_populate_record` binds
// JSON keys to the LIVE table shape so the restore round-trips any
// future column additions automatically. Wrapped in BEGIN/COMMIT so
// DELETE+INSERT commit atomically — if INSERT raises, DELETE rolls
// back and the singleton row is preserved.
function runPsqlWithSnapshot(snapshot: Record<string, unknown>): string {
  const snapshotJson = JSON.stringify(snapshot);
  const escaped = snapshotJson.replace(/'/g, "''");
  const sql = `
    BEGIN;
    DELETE FROM public.validation_state WHERE key = 'validation_seed';
    INSERT INTO public.validation_state
      SELECT * FROM jsonb_populate_record(NULL::public.validation_state, '${escaped}'::jsonb);
    COMMIT;
  `;
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F\t"], {
    input: sql,
    encoding: "utf8",
  });
}

describe("validation_state", () => {
  test("table exists with the 8 columns and types per M12 spec §3.3.2", () => {
    const out = runPsql(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'validation_state'
       ORDER BY ordinal_position;
    `);

    const rows = out
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [column_name, data_type, is_nullable] = line.split("\t");
        return { column_name, data_type, is_nullable };
      });

    const colMap = Object.fromEntries(rows.map((r) => [r.column_name, r]));

    expect(colMap.key?.data_type).toBe("text");
    expect(colMap.last_seed_date?.data_type).toBe("date");
    // R57 F49: last_seed_date is nullable post-R57; mint RPC initial
    // INSERT MUST NOT stamp it — only validation_finalize_all_atomic
    // writes the all-combos completion stamp.
    expect(colMap.last_seed_date?.is_nullable).toBe("YES");
    expect(colMap.combos_materialized?.data_type).toBe("ARRAY");
    expect(colMap.combos_seeded_dates?.data_type).toBe("jsonb");
    expect(colMap.combos_seeded_dates?.is_nullable).toBe("NO");
    expect(colMap.alias_map?.data_type).toBe("jsonb");
    expect(colMap.alias_map?.is_nullable).toBe("NO");
    expect(colMap.seeded_by?.data_type).toBe("text");
    expect(colMap.seeded_supabase_project_ref?.data_type).toBe("text");
    expect(colMap.seeded_at?.data_type).toBe("timestamp with time zone");
    // R4: total column count = 8 (was 7 pre-R3 combos_seeded_dates).
    expect(Object.keys(colMap)).toHaveLength(8);
  });

  // R59 F50 / R61 F52 / R63 F53 / R65 F54 — drift-repair verification
  // applied via the canonical migration artifact (NOT inline ALTER).
  // The test simulates an existing-NOT-NULL stack, applies the actual
  // migration file via psql -f, and asserts the column is nullable
  // post-apply. A future regression that deletes the ALTER from the
  // migration body FAILs both the regex sanity-check and the
  // is_nullable assertion. R65 F54 closes the cross-process TEMP-table
  // snapshot bug from R63 by capturing the singleton row into a
  // Vitest-process JS variable via row_to_json(v) and restoring it
  // atomically via jsonb_populate_record inside a BEGIN/COMMIT
  // transaction so a test failure does not destroy legitimate
  // post-R55+R57 NULL last_seed_date state.
  test("ALTER COLUMN DROP NOT NULL drift-repair applied via migration artifact (R59 F50, R61 F52 strengthened, R65 F54 in-process JSON snapshot)", () => {
    let snapshot: Record<string, unknown> | null = null;
    const snapshotRaw = runPsql(`
      SELECT row_to_json(v) FROM public.validation_state v WHERE key = 'validation_seed';
    `).trim();
    if (snapshotRaw.length > 0) {
      snapshot = JSON.parse(snapshotRaw) as Record<string, unknown>;
    }

    try {
      runPsql(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE public.validation_state
              ALTER COLUMN last_seed_date SET NOT NULL;
          EXCEPTION
            WHEN check_violation OR not_null_violation THEN
              DELETE FROM public.validation_state WHERE last_seed_date IS NULL;
              ALTER TABLE public.validation_state
                ALTER COLUMN last_seed_date SET NOT NULL;
          END;
        END $$;
      `);

      const before = runPsql(`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='validation_state'
           AND column_name='last_seed_date';
      `).trim();
      expect(before).toBe("NO");

      const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");
      const migrationCandidates = readdirSync(migrationsDir).filter((f) =>
        /_validation_state\.sql$/.test(f),
      );
      expect(
        migrationCandidates.length,
        `expected exactly one validation_state migration, found ${migrationCandidates.length}: ${migrationCandidates.join(", ")}`,
      ).toBe(1);
      const migrationPath = path.join(migrationsDir, migrationCandidates[0]);
      const migrationSql = readFileSync(migrationPath, "utf8");

      expect(
        migrationSql,
        "migration body must contain ALTER COLUMN ... DROP NOT NULL on last_seed_date per R59 F50 drift-repair contract",
      ).toMatch(
        /ALTER\s+TABLE\s+public\.validation_state\s+ALTER\s+COLUMN\s+last_seed_date\s+DROP\s+NOT\s+NULL/i,
      );

      runPsqlFile(migrationPath);

      const after = runPsql(`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='validation_state'
           AND column_name='last_seed_date';
      `).trim();
      expect(after).toBe("YES");

      // Apply-twice idempotency at the migration-file grain.
      runPsqlFile(migrationPath);
      const afterTwice = runPsql(`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='validation_state'
           AND column_name='last_seed_date';
      `).trim();
      expect(afterTwice).toBe("YES");
    } finally {
      if (snapshot !== null) {
        runPsqlWithSnapshot(snapshot);
      } else {
        runPsql(`
          BEGIN;
          DELETE FROM public.validation_state WHERE key = 'validation_seed';
          COMMIT;
        `);
      }
    }
  });
});

# Phase 0.B — `validation_state` migration + atomic master-spec amendments + test baselines

> Per spec §3.3.2 + §9.0 task 0.B. Estimate: 0.5–1 day.
>
> Goal: in ONE PR (or commit series in one PR), land the `validation_state` migration AND the master-spec amendments AND the admin-tables generator regen AND the test baseline updates. Phase 0.B does NOT close until X.3 / X.6 / admin-table tests pass against the updated artifacts (per spec §3.3.2 atomicity gate).
>
> Plan-wide invariants 8 (singleton + drift-safe DDL) and 9 (atomic master-spec amendment) are load-bearing here.

> **Rebase note (2026-05-26).** This file was drafted against pre-M11.5 master-spec line numbers + a test surface (`tests/db/rls.test.ts`, `tests/cross-cutting/auth.test.ts`) that doesn't match live state. The 2026-05-26 amendment's stale-citation sweep (spec §15.26) corrects every cite. Live deltas:
>
> | Stale claim in this file | Live corrected value |
> |---|---|
> | Master §4.3 prose: `line 605` | **`line 610`** (drifted +5 since the original 2026-05-19 draft) |
> | Master AC-2.5: `line 3489` | **`line 3536`** (drifted +47) |
> | Master §4.3 nominal count: `21 → 22` | Same numerically — the prose count IS still nominally `21`, but per the picker-pivot (α + γ-footnote) hybrid the prose track stays at 21→22 AND a footnote is added per spec §3.3.2 step 3a documenting that live `ADMIN_TABLES.length = 18 = 22 − 4 dropped` (the M11.5 G3 cutover filtered 4 M9.5 tables via `scripts/generate-admin-tables.ts:31-34`'s `removedByPickerPivot` array) |
> | `tests/db/rls.test.ts` (lines 163-164: `21 → 22`) | **FILE DOES NOT EXIST** — drop this task entirely |
> | `tests/db/admin-rls-runtime.test.ts` ("7 refs on lines 4 / 9 / 21 / 111 / 112 / 213 / 218 carrying `21`") | **4 refs on lines 4 / 21 / 111 / 112 carrying `17`** (post-M11.5 G3 cutover baseline). Update each `17` → `18`, NOT `21` → `22`. |
> | `tests/cross-cutting/auth.test.ts` line 203 ADMIN_TABLES literal-list | **FILE DOES NOT EXIST** + no `ADMIN_TABLES` literal-list assertion exists in any test (the registry is consumed structurally via the generated import). Drop this task entirely. |
> | "Phase 0.D" reference in close-out narrative | Phase 0.D was DELETED in the 2026-05-26 rebase; move directly from Phase 0.B → Phase 0.C |
>
> The stale tasks below (0.B.3 master-spec edit, 0.B.5 AC-2.5 edit, 0.B.7 rls.test.ts, 0.B.8 admin-rls-runtime line list, 0.B.10 auth.test.ts) MUST be interpreted against this rebase-corrections table; the implementer applies the live values, not the stale values. A future cleanup pass may inline-rewrite each task body — this commit lands the corrections-table as load-bearing per Q3's "silent rewrite + consolidated §15.26 note" posture.

---

### Task 0.B.1: Pre-verify live state matches the spec's atomic-checklist line refs

The spec §3.3.2 atomic checklist cites specific lines in master spec and test files. Before editing, verify each line still says what the spec says it says (the codebase may have evolved since the spec was written). **The rebase-corrections table above is the authoritative live-value source; the steps below reference the original stale citations for narrative continuity but the implementer applies live values.**

- [ ] **Step 1: Verify master spec §4.3 line 605 (21 admin-only tables count).**

```bash
grep -n "21 tables" docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md | head -5
```

Expected: the line containing "**21 tables**" describing the admin-only table list. If the count has shifted, update the spec's atomic checklist references in Phase 0.B's edits.

- [ ] **Step 2: Verify master spec AC-2.5 line 3489 (21 × 4 = 84 assertions).**

```bash
grep -n "84 assertions" docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md
```

Expected: line containing "**21 tables × 4 verbs = 84 assertions**". If shifted, adapt.

- [ ] **Step 3: Verify `tests/db/admin-rls-runtime.test.ts` has 4 references to `17` on lines 4/21/111/112** (post-M11.5 G3 cutover live baseline; the pre-rebase plan's claim of "7 references on lines 4/9/21/111/112/213/218" is stale — see front-loaded rebase-corrections table + R10 F6 repair + spec §3.3.2 step 6).

```bash
grep -n "17 admin\|toHaveLength(17)\|17 tables\|17 admin-gated" tests/db/admin-rls-runtime.test.ts
```

Expected: 4 lines mentioning `17` at lines 4 / 21 / 111 / 112 (header comment, classification comment, derivation comment, assertion). If the count has shifted away from `17`, adapt Task 0.B.8's sed recipe accordingly.

- [ ] **Step 4: Confirm there is NO live `ADMIN_TABLES` literal-list expectation in any test** (the pre-rebase plan's references to `tests/db/rls.test.ts` + `tests/cross-cutting/auth.test.ts` are stale — both files do not exist; verified at the 2026-05-26 amendment + R10 F6 repair).

```bash
grep -rln 'ADMIN_TABLES.*toEqual\|ADMIN_TABLES.*toHaveLength' tests/ 2>/dev/null
```

Expected: zero hits. `ADMIN_TABLES` is consumed structurally via the generated `lib/audit/admin-tables.generated.ts` import; no per-element literal expectation needs maintenance. Tasks 0.B.7 + 0.B.10 in this plan file are DELETED per R10 F6 repair — see those task headers.

- [ ] **Step 5: NO commit** — this step is verification only. If any line refs are stale, update the M12 spec atomic checklist (with R26 amendment note) and re-derive deltas.

---

### Task 0.B.2: Write the migration file (TDD-style failing-first)

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_validation_state.sql` — timestamp matches `date +%Y%m%d%H%M%S` at file-creation time

- [ ] **Step 1: Write a failing-first test that confirms `validation_state` does NOT exist.** Add a new test file `tests/db/validation-state.test.ts`.

**R17 commit 40 F17 amendment — pattern swap from supabase-js to psql.** The prior R-series draft of this test used supabase-js `.from("information_schema.columns" as never)`, which the R16 review correctly identified as unfit for the harness: PostgREST exposes only `public` / `graphql_public` / `dev` schemas; `information_schema` is unreachable via the supabase-js builder even with the service-role key. The test would fail post-migration on harness rather than schema. The new shape mirrors the canonical pattern at `tests/db/admin-rls-runtime.test.ts:55-79` and `tests/db/admin-rls-runtime.test.ts:74-79` — `psql` against `TEST_DATABASE_URL` via `execFileSync`, parsing the resulting tab-separated output. This is the established Phase 0 harness for any test that needs `information_schema` / `pg_catalog` introspection.

```ts
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

describe("validation_state", () => {
  test("table exists with the 8 columns and types per M12 spec §3.3.2", () => {
    const out = runPsql(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'validation_state'
       ORDER BY ordinal_position;
    `);

    // Parse tab-separated rows.
    const rows = out.split("\n").filter((line) => line.length > 0).map((line) => {
      const [column_name, data_type, is_nullable] = line.split("\t");
      return { column_name, data_type, is_nullable };
    });

    const colMap = Object.fromEntries(rows.map((r) => [r.column_name, r]));

    expect(colMap.key?.data_type).toBe("text");
    expect(colMap.last_seed_date?.data_type).toBe("date");
    // R57 commit 95 F49 amendment: last_seed_date is nullable post-R57 (mint RPC initial INSERT
    // MUST NOT stamp it; only validation_finalize_all_atomic writes the all-combos completion stamp).
    expect(colMap.last_seed_date?.is_nullable).toBe("YES");
    expect(colMap.combos_materialized?.data_type).toBe("ARRAY");
    expect(colMap.combos_seeded_dates?.data_type).toBe("jsonb");   // R4: per-combo seeded-date tracking (added R3)
    expect(colMap.combos_seeded_dates?.is_nullable).toBe("NO");
    expect(colMap.alias_map?.data_type).toBe("jsonb");
    expect(colMap.alias_map?.is_nullable).toBe("NO");
    expect(colMap.seeded_by?.data_type).toBe("text");
    expect(colMap.seeded_supabase_project_ref?.data_type).toBe("text");
    expect(colMap.seeded_at?.data_type).toBe("timestamp with time zone");
    // R4 amendment: confirm total column count = 8 (was 7 pre-R3 combos_seeded_dates).
    expect(Object.keys(colMap)).toHaveLength(8);
  });

  // R59 commit 96 F50 — drift-safety verification on pre-R57 (NOT NULL) stack.
  // Pre-R57 draft declared last_seed_date NOT NULL; CREATE TABLE IF NOT EXISTS
  // does not re-declare existing columns, so the migration must carry an
  // explicit ALTER COLUMN ... DROP NOT NULL to drift-repair the constraint.
  // This test simulates an existing-NOT-NULL stack, applies the **actual
  // migration artifact** (NOT an inline hardcoded ALTER), and asserts the
  // column is nullable post-apply.
  //
  // R61 F52 amendment — tautology audit. The pre-R61 test ran a hardcoded
  // `ALTER TABLE ... DROP NOT NULL` inline INSIDE the test body, which
  // independently performed the drift-repair regardless of what the migration
  // artifact said. A future regression that deletes the ALTER from
  // `supabase/migrations/<timestamp>_validation_state.sql` would STILL pass
  // because the test itself was performing the repair. R61 closes the gap by
  // routing the drift-repair through the canonical migration file — the test
  // FAILs if the ALTER is deleted from the migration. The migration path is
  // discovered at test-time via glob (the timestamp prefix is generated by
  // `supabase migration new` and not knowable at plan-write time).
  //
  // R63 F53 amendment — drift-repair test is NON-DESTRUCTIVE of legitimate
  // singleton state. Pre-R63 setup unconditionally DELETEd `validation_state`
  // rows where `last_seed_date IS NULL` to force the `SET NOT NULL` simulation
  // to succeed. That was correct under the pre-R55+R57 contract (NULL was
  // never a legitimate steady state), but post-R55+R57 a NULL `last_seed_date`
  // is the legitimate INSERT-side row produced by the mint RPC after a
  // single-combo reseed and BEFORE `validation_finalize_all_atomic` stamps the
  // completion date — exactly the F49 path R57 codified. Destroying that row
  // mid-test would mutate legitimate state observable by any other test or
  // re-run of the suite.
  //
  // R65 F54 amendment — in-process JSON snapshot replaces the broken R63
  // TEMP-TABLE snapshot. R64 surfaced F54 (HIGH, CONF 0.97): R63's snapshot
  // used `CREATE TEMP TABLE` to capture the singleton row, but `runPsql`
  // shells to a NEW psql process per call (`execFileSync` with stdin piping
  // — see helper at lines 83-88), and PostgreSQL TEMP tables are
  // session-scoped (`pg_temp_<backend_pid>` schema, dropped at session end
  // per <https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-PARMS-TEMPORARY>).
  // The snapshot TEMP table never survived past the first `runPsql` return,
  // so the restore `INSERT … SELECT * FROM _r63_drift_test_snapshot` raised
  // `relation does not exist` AFTER the autocommit-DELETE had already
  // committed — permanently destroying the singleton row. R63's fix
  // reintroduced the exact destructive-state class it was meant to close.
  //
  // R65 closes F54 by capturing the snapshot into a Vitest-process JS
  // variable via `row_to_json(v)`. The snapshot now lives in test-process
  // memory (no cross-process dependency) and round-trips the full row shape
  // regardless of which columns the schema currently carries (a future
  // column addition appears as a new JSON key and is replayed verbatim via
  // `jsonb_populate_record`). The restore is wrapped in a single
  // `BEGIN; DELETE …; INSERT …; COMMIT;` transaction so the DELETE cannot
  // commit independently of the INSERT — if the INSERT raises, the DELETE
  // rolls back and the singleton state is preserved. The whole simulation
  // remains wrapped in `try { … } finally { restore }` so restore runs even
  // on assertion failure. This mirrors the per-outcome cleanup contract
  // INTENT used by Phase 0.E F34/F36 (capture pre-test → simulate →
  // restore-in-finally) with the corrected cross-process mechanism.
  test("ALTER COLUMN DROP NOT NULL drift-repair applied via migration artifact (R59 F50, R61 F52 strengthened, R63 F53 attempted, R65 F54 in-process JSON snapshot)", () => {
    // R65 F54 — Snapshot the validation_state singleton row(s) into a
    // Vitest-process JS variable BEFORE the simulation runs. `row_to_json(v)`
    // serializes the entire row (including any future columns) into a single
    // JSON object emitted as one tab-separated psql output line; `.trim()`
    // strips trailing newline. Empty result (no singleton row pre-test, e.g.
    // cold schema) → empty string → `snapshot` stays `null` and the restore
    // becomes a no-op DELETE in the finally block.
    let snapshot: Record<string, unknown> | null = null;
    const snapshotRaw = runPsql(`
      SELECT row_to_json(v) FROM public.validation_state v WHERE key = 'validation_seed';
    `).trim();
    if (snapshotRaw.length > 0) {
      snapshot = JSON.parse(snapshotRaw) as Record<string, unknown>;
    }

    try {
    // Setup: force NOT NULL constraint (simulating a stack that applied an
    // earlier M12 draft). Wrapped in DO block so re-running the suite is safe.
    // The EXCEPTION branch's `DELETE FROM ... WHERE last_seed_date IS NULL`
    // is restored by the outer `finally` snapshot-restore stanza, so
    // legitimate post-R55+R57 NULL `last_seed_date` rows survive the test as
    // observable state for any subsequent test or suite re-run.
    runPsql(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE public.validation_state
            ALTER COLUMN last_seed_date SET NOT NULL;
        EXCEPTION
          WHEN check_violation OR not_null_violation THEN
            -- Cannot SET NOT NULL while a NULL value exists; clear first
            -- (validation singleton; the outer finally block restores the
            -- snapshot so the clear is non-destructive across the test grain).
            DELETE FROM public.validation_state WHERE last_seed_date IS NULL;
            ALTER TABLE public.validation_state
              ALTER COLUMN last_seed_date SET NOT NULL;
        END;
      END $$;
    `);

    // Confirm setup landed (constraint is NOT NULL — simulates pre-R57 stack).
    const before = runPsql(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='validation_state'
         AND column_name='last_seed_date';
    `).trim();
    expect(before).toBe("NO");

    // R61 F52 amendment — locate + apply the canonical migration artifact.
    // Discover the migration file by glob (timestamp prefix is generated by
    // `supabase migration new`); resolve to a single match or fail loud.
    const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");
    const migrationCandidates = readdirSync(migrationsDir).filter((f) => /_validation_state\.sql$/.test(f));
    expect(migrationCandidates.length, `expected exactly one validation_state migration, found ${migrationCandidates.length}: ${migrationCandidates.join(", ")}`).toBe(1);
    const migrationPath = path.join(migrationsDir, migrationCandidates[0]);
    const migrationSql = readFileSync(migrationPath, "utf8");

    // Sanity-check that the migration body actually contains the drift-repair
    // ALTER (defense-in-depth — if a future regression deletes the ALTER and
    // also the test-time apply silently no-ops, this assertion catches it
    // BEFORE the is_nullable check, with a more specific diagnostic).
    expect(migrationSql, "migration body must contain ALTER COLUMN ... DROP NOT NULL on last_seed_date per R59 F50 drift-repair contract").toMatch(/ALTER\s+TABLE\s+public\.validation_state\s+ALTER\s+COLUMN\s+last_seed_date\s+DROP\s+NOT\s+NULL/i);

    // Apply the full migration artifact via psql -f (NOT inline -c). The whole
    // file runs in a single transaction by default; CREATE TABLE IF NOT EXISTS
    // and DO $$ blocks are idempotent so the apply is safe on an already-seeded
    // test database.
    runPsqlFile(migrationPath);

    // Assert drift-repair landed: column is now nullable.
    const after = runPsql(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='validation_state'
         AND column_name='last_seed_date';
    `).trim();
    expect(after).toBe("YES");

    // Apply-twice idempotency: re-applying the FULL migration artifact (not
    // just the DROP NOT NULL line) must be a no-op on an already-converged
    // schema. This pins idempotency at the migration-file grain, not just at
    // the inline statement grain.
    runPsqlFile(migrationPath);
    const afterTwice = runPsql(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='validation_state'
         AND column_name='last_seed_date';
    `).trim();
    expect(afterTwice).toBe("YES");
    } finally {
      // R65 F54 — Restore the singleton row from the in-process JS snapshot
      // regardless of assertion outcome. The restore runs in a SINGLE
      // explicit transaction (BEGIN/COMMIT) so the DELETE cannot autocommit
      // independently of the INSERT — if the INSERT fails for any reason
      // the DELETE rolls back and the prior state is preserved. The snapshot
      // JSON is passed in as a psql variable (`-v snap=<json>`) and parsed
      // server-side via `jsonb_populate_record`, which materializes a row
      // matching the LIVE table shape — any future column addition appears
      // as a JSON key and is bound to the matching column automatically;
      // missing keys default to NULL per `jsonb_populate_record` semantics
      // (<https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-JSON-PROCESSING-TABLE>).
      // Cold-schema case (snapshot === null): no row existed pre-test, so
      // restore is a no-op DELETE inside the transaction — non-destructive.
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

// R61 F52 amendment — helper to apply a full SQL file via psql -f (mirrors the
// existing `runPsql` helper's execFileSync pattern but uses -f for whole-file
// application instead of -c for a single statement).
function runPsqlFile(filePath: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", filePath], { encoding: "utf8" });
}

// R65 F54 amendment — helper to restore the validation_state singleton row
// from an in-process JSON snapshot atomically. The snapshot JSON is passed
// via stdin as a psql variable; `jsonb_populate_record` binds JSON keys to
// the LIVE table shape so the restore round-trips any future column
// additions automatically. Wrapped in BEGIN/COMMIT so DELETE+INSERT commit
// atomically — if INSERT raises, DELETE rolls back and the singleton row is
// preserved. Closes R64 F54 (R63 c100 cross-process TEMP-table snapshot
// failure).
function runPsqlWithSnapshot(snapshot: Record<string, unknown>): string {
  const snapshotJson = JSON.stringify(snapshot);
  // `\set` reads the value as a literal string; we wrap the JSON in
  // single-quotes + cast to jsonb in the SQL so the parser binds it as a
  // single jsonb argument. `\set` value cannot contain a literal single
  // quote, so we use psql's E'...' escape via `replace(snapshotJson, "'", "''")`.
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
```

The test depends on `psql` being on PATH (the same dependency the existing `admin-rls-runtime.test.ts` and `picker_epoch_columns.test.ts` already carry — see the Phase 0 harness requirements in `tests/db/admin-rls-runtime.test.ts:55-79`). Pre-migration, the SELECT returns zero rows and the column-map is empty, so every `expect(colMap.<name>?.data_type)` is `undefined !== expected` and the first test FAILs. Post-migration, all 8 columns return their expected types and the first test PASSes. The R59/R61 F52 drift-repair test additionally requires `readdirSync` / `readFileSync` / `path` imports (already in standard test-file boilerplate) and resolves the migration file by glob — failing loud if zero or multiple `*_validation_state.sql` matches exist. **R61 F52 concrete failure mode the test now catches:** a future amendment deletes the `ALTER TABLE public.validation_state ALTER COLUMN last_seed_date DROP NOT NULL` line from `supabase/migrations/<timestamp>_validation_state.sql`. Pre-R61, the test passed because its hardcoded inline ALTER independently performed the repair. Post-R61, both the regex sanity-check on the migration body AND the is_nullable assertion after applying the migration file would FAIL — the regression is pinned at the migration-artifact grain, not at the test-body grain. **R63 F53 amendment — non-destructive of legitimate singleton state (attempted; superseded by R65 F54):** R63 wrapped the drift-repair simulation in a `try { ... } finally { restore }` envelope around a TEMP-TABLE snapshot captured pre-test (`CREATE TEMP TABLE _r63_drift_test_snapshot AS SELECT * FROM public.validation_state WHERE key = 'validation_seed'`) and rehydrated post-test (`DELETE … ; INSERT … SELECT * FROM _r63_drift_test_snapshot`). The simulation's inline `DELETE FROM public.validation_state WHERE last_seed_date IS NULL` was intentionally preserved (it's required for the `SET NOT NULL` path on rows that legitimately carry NULL `last_seed_date` per R55 Option (b) + R57 F49). **R65 F54 amendment — in-process JSON snapshot (closes R64 F54):** R64 surfaced F54 (HIGH, CONF 0.97) — R63's TEMP-TABLE snapshot was structurally broken because `runPsql` shells to a NEW psql process per call (`execFileSync` + stdin pipe — helper at lines 83-88) and PostgreSQL TEMP tables are session-scoped (`pg_temp_<backend_pid>`, dropped at session end). The snapshot TEMP table never survived past the first `runPsql` return; the restore `INSERT … SELECT * FROM _r63_drift_test_snapshot` raised `relation does not exist` AFTER the autocommit-DELETE had already committed — permanently destroying the singleton row. R63's fix reintroduced the exact destructive-state class it was meant to close. R65 closes F54 by capturing the snapshot into a Vitest-process JS variable via `SELECT row_to_json(v) FROM public.validation_state v WHERE key = 'validation_seed'` (serialized as one tab-separated psql line and parsed into a `Record<string, unknown> | null`). The restore is wrapped in a single `BEGIN; DELETE …; INSERT … SELECT * FROM jsonb_populate_record(NULL::public.validation_state, '<json>'::jsonb); COMMIT;` transaction so the DELETE cannot autocommit independently of the INSERT — if INSERT raises, the DELETE rolls back and the singleton state is preserved. `jsonb_populate_record` binds JSON keys to the LIVE table shape so the restore round-trips any future column additions automatically (a new column appears as a JSON key and is bound to the matching column; missing keys default to NULL per the documented `jsonb_populate_record` semantics). The cold-schema case (no row pre-test → `snapshot === null`) executes a no-op DELETE inside its own transaction, non-destructive either way. This mirrors the per-outcome cleanup contract INTENT used by Phase 0.E F34/F36 (capture pre-test → simulate → restore-in-finally) with the corrected cross-process mechanism — the prior shape's mechanism was broken; the intent stands. **R65 concrete failure mode the test now catches:** unchanged from R61 F52 (deleting the ALTER from the migration body fails both the regex sanity-check and the `is_nullable` assertion); R65 additionally guarantees that on test failure or on assertion throw, the validation_state singleton is restored byte-for-byte from the in-process snapshot — running the suite against a shared/prod-equivalent validation DB never silently wipes legitimate post-R55+R57 NULL `last_seed_date` state.

- [ ] **Step 2: Run the test — expect FAIL** (validation_state does not yet exist):

```bash
pnpm vitest run tests/db/validation-state.test.ts
```

Expected: FAIL with no rows from information_schema (column map is empty).

- [ ] **Step 3: Create the migration file** at `supabase/migrations/<timestamp>_validation_state.sql` per spec §3.3.2 DDL (the canonical block — copy verbatim):

```sql
-- M12 validation_state singleton — see docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md §3.3.2.
-- Singleton-enforced via key='validation_seed' PK; drift-safe CHECK; idempotent policy; type-drift fail-loud.

CREATE TABLE IF NOT EXISTS public.validation_state (
  key                              text PRIMARY KEY CHECK (key = 'validation_seed'),
  last_seed_date                   date NULL,                              -- R57 commit 95 F49 amendment: NULL until validation_finalize_all_atomic stamps. Per R55 Option (b) + R57 F49 fix — initial INSERT by mint RPC MUST NOT stamp this column, only the finalizer writes it; predicate (b) treats NULL as stale ("last_seed_date IS NULL OR last_seed_date != $VALIDATION_TODAY_ISO"). See plan 03 line ~496 mint RPC INSERT and line ~602 finalizer UPDATE.
  combos_materialized              text[] NOT NULL,
  combos_seeded_dates              jsonb NOT NULL DEFAULT '{}'::jsonb,    -- R3 amendment: per-combo seeded dates so partial --combo all reseed cannot falsify the gate
  alias_map                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeded_by                        text NOT NULL,
  seeded_supabase_project_ref      text NOT NULL,
  seeded_at                        timestamptz NOT NULL DEFAULT now()
);

-- R59 commit 96 F50 drift-repair (post-R57 nullability change).
-- Idempotent drift-repair (R59 F50 fix). Pre-R57 draft specified
-- `last_seed_date date NOT NULL`; `CREATE TABLE IF NOT EXISTS` above only
-- applies the new column declaration on FIRST creation, so any dev / staging /
-- prod-equivalent stack that ran an earlier M12 draft retains the NOT NULL
-- constraint. Without this ALTER, the R57 mint RPC INSERT — which omits
-- last_seed_date — fails on drift'd stacks with `null value in column
-- "last_seed_date" violates not-null constraint`, breaking the F49 closure
-- path. Per AGENTS.md "CHECK/enum migration matrix" apply-twice idempotency
-- rule: ALTER COLUMN ... DROP NOT NULL is inherently idempotent (re-applying
-- on an already-nullable column is a no-op), so no DO $$ guard is needed.
ALTER TABLE public.validation_state
  ALTER COLUMN last_seed_date DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.validation_state
    DROP CONSTRAINT IF EXISTS validation_state_combos_check;
  ALTER TABLE public.validation_state
    ADD CONSTRAINT validation_state_combos_check CHECK (
      combos_materialized <@ ARRAY[
        'R1','R2','R3','R4','R5','R6','R7a','R7b','R8a','R8b',
        'SW-PRE_TRAVEL','SW-TRAVEL_IN','SW-SHOW_1','SW-SHOW_INTERIOR','SW-SHOW_LAST','SW-POST_SHOW'
      ]
    );
END $$;

ALTER TABLE public.validation_state
  ADD COLUMN IF NOT EXISTS alias_map jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET NOT NULL;

-- R3 amendment: per-combo seeded dates so partial --combo all reseed cannot pass check-seed.
ALTER TABLE public.validation_state
  ADD COLUMN IF NOT EXISTS combos_seeded_dates jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN combos_seeded_dates SET DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN combos_seeded_dates SET NOT NULL;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'validation_state'
      AND column_name = 'alias_map';
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'validation_state.alias_map column missing after ADD COLUMN — investigate';
  END IF;
  IF col_type <> 'jsonb' THEN
    RAISE EXCEPTION 'validation_state.alias_map has wrong type % (expected jsonb) — manual corrective migration required', col_type;
  END IF;
END $$;

-- R17 commit 37 F15 amendment — PostgREST DML lockdown for RPC-gated table
-- (AGENTS.md cross-cutting #1 + feedback_postgrest_dml_lockdown_for_rpc_gated_tables).
-- Writes flow EXCLUSIVELY through the two SECURITY DEFINER RPCs
-- (mint_validation_fixture_atomic + validation_finalize_all_atomic) which
-- hold the per-show advisory lock per AGENTS.md invariant 2. The admin_only
-- RLS policy below alone does NOT prevent direct PostgREST DML because the
-- policy USING/WITH CHECK predicates evaluate after the table-level GRANT
-- check — an admin session that authenticated via Supabase auth can
-- INSERT/UPDATE/DELETE directly via the PostgREST builder, bypassing the
-- advisory lock and the audit-log emission. Explicit table-level REVOKE
-- closes that bypass at the schema level. SELECT remains granted to
-- anon/authenticated so the future audit UI (admin-gated by the
-- admin_only RLS policy) can read the singleton. service_role keeps full
-- DML for the RPCs (which run SECURITY DEFINER under postgres/service_role).
GRANT SELECT ON TABLE public.validation_state TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.validation_state FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.validation_state TO service_role;
ALTER TABLE public.validation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only ON public.validation_state;
CREATE POLICY admin_only ON public.validation_state
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

**PostgREST DML lockdown contract (R17 F15 amendment).** `validation_state` writes flow EXCLUSIVELY through the two SECURITY DEFINER RPCs `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` (defined in `03-phase0-tooling-reseed.md`). The admin_only RLS policy alone does NOT prevent direct PostgREST DML by an authenticated admin session — the table-level INSERT/UPDATE/DELETE grants must be revoked at the schema level. `tests/db/postgrest-dml-lockdown.test.ts` (authored in Task 0.B.2 Step 8a per AGENTS.md cross-cutting #1 structural meta-test mandate) pins the invariant at CI time; the meta-test registers `validation_state` alongside `crew_members` (M9.5 R6 precedent at `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80-86`). The M9.5 R5 `crew_member_auth` precedent (same migration:44-50) is acknowledged as the historical pattern, but `crew_member_auth` itself is NOT in the registry post-R67 F55 amendment because the M11.5 G3 cutover (`20260523000099_cutover_drop_m9_5.sql:26`) dropped the table.

- [ ] **Step 4: Apply the migration locally first** (against the dev's local Supabase) to catch syntax errors:

```bash
npx supabase db reset --linked=false  # local-only reset, NOT against prod
# OR if local supabase isn't running: npx supabase migration up
```

Expected: clean apply.

- [ ] **Step 5: Apply against the prod-equivalent Supabase:**

```bash
npx supabase link --project-ref $VALIDATION_SUPABASE_PROJECT_REF
npx supabase db push
```

Expected: clean apply.

- [ ] **Step 6: Re-run the failing test — expect PASS:**

```bash
pnpm vitest run tests/db/validation-state.test.ts
```

Expected: PASS — all 8 columns present with correct types (including `combos_seeded_dates` per R3 amendment / R10 spec sync — see spec §15.27).

- [ ] **Step 7: Verify apply-twice idempotency:**

```bash
npx supabase db push  # second apply
```

Expected: no errors (every block is idempotent per spec invariant 8).

- [ ] **Step 8: Author the PostgREST DML lockdown structural meta-test** at `tests/db/postgrest-dml-lockdown.test.ts` per AGENTS.md cross-cutting #1 (R17 commit 38 F15 structural defense). The meta-test enforces a project-wide invariant: for every table in the `LOCKED_TABLES` registry, the `anon` and `authenticated` Supabase clients MUST receive a permission error on direct INSERT/UPDATE/DELETE via PostgREST. Registry entries to ship at Task 0.B.2 completion:

  - `crew_members` (M9.5 R6 — closed at `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80-86`)
  - `validation_state` (M12 R17 F15 — closed in this migration's `REVOKE INSERT, UPDATE, DELETE` block above)
  - **R67 F55 amendment:** `crew_member_auth` is NOT in this registry — the table was dropped by the M11.5 G3 cutover migration at `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26`. A `has_table_privilege` probe on a dropped relation would fail at Layer 1, and PostgREST calls would surface a relation-missing error rather than the 42501 the test asserts. `crew_member_auth` retirement is independently validated by `tests/db/cutover-drop-m9-5.test.ts` (M11.5 G3 cutover absence test).

  Test shape (pattern mirrors `tests/db/admin-rls-runtime.test.ts:55-79` — psql against `TEST_DATABASE_URL` for ground-truth + supabase-js for the PostgREST surface verb probe):

```ts
import { describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Project-wide PostgREST DML lockdown invariant
 * (AGENTS.md cross-cutting #1 + feedback_postgrest_dml_lockdown_for_rpc_gated_tables).
 *
 * For every table in LOCKED_TABLES, anon + authenticated MUST receive
 * a PostgREST permission error on INSERT/UPDATE/DELETE. Mutations flow
 * EXCLUSIVELY through SECURITY DEFINER RPCs that hold the per-show
 * advisory lock per AGENTS.md invariant 2. SELECT remains granted at
 * the table level; admin_only RLS still gates which rows admins see.
 *
 * New RPC-gated tables MUST register here. The alternative is an
 * inline `// not-subject-to-meta: <reason>` comment when the table
 * intentionally permits PostgREST DML (e.g., user-facing forms whose
 * writes route through RLS WITH CHECK rather than a SECURITY DEFINER RPC).
 */
// R67 F55 amendment — `crew_member_auth` removed because M11.5 G3 cutover at
// `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26` dropped the table;
// a `has_table_privilege` probe on a non-existent relation would fail (Layer 1)
// and `from('crew_member_auth')` PostgREST calls would return a relation-missing
// error not the 42501 the test expects (Layer 2/3). The `crew_member_auth`
// retirement is independently validated by `tests/db/cutover-drop-m9-5.test.ts`
// (M11.5 G3 cutover absence test); no DML-lockdown row is needed for a relation
// that no longer exists.
const LOCKED_TABLES = [
  { table: "crew_members",      closed_at: "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80" },
  { table: "validation_state",  closed_at: "supabase/migrations/<timestamp>_validation_state.sql (R17 commit 37 F15 REVOKE block)" },
] as const;

import { execFileSync } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const authKey = process.env.SUPABASE_TEST_AUTHENTICATED_JWT!;   // signed JWT with role='authenticated', random non-admin email
const adminKey = process.env.SUPABASE_TEST_ADMIN_JWT!;          // R61 F51 amendment: signed JWT with role='authenticated' whose email IS the admin email so public.is_admin() returns true. WITHOUT table-level REVOKE this client would pass the admin_only RLS USING/WITH CHECK and the DML would succeed; WITH the REVOKE block it must fail at the table-grant check with 42501 BEFORE RLS evaluates. This is the load-bearing probe that proves the REVOKE landed — the anon/authenticated probes alone are tautological because admin_only RLS already denies them irrespective of grants.
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * R61 F51 amendment — three-layer defense the test verifies.
 *
 * Layer 1 (pg_catalog.has_table_privilege via psql):
 *   For each role in {anon, authenticated}, for each verb in {INSERT, UPDATE, DELETE},
 *   has_table_privilege(role, 'public.<table>', verb) = false.
 *   Proves REVOKE landed REGARDLESS of RLS policy state — catches the case
 *   where a future amendment drops the REVOKE block but leaves admin_only RLS
 *   in place (the anon/authenticated PostgREST probes would still surface a
 *   permission-denied-shaped error because RLS denies them, masking the
 *   regression).
 *
 * Layer 2 (admin-authenticated PostgREST probe):
 *   A client whose JWT email matches is_admin() = true issues INSERT/UPDATE/DELETE.
 *   Without the REVOKE block this admin would PASS the admin_only RLS USING/WITH
 *   CHECK predicate and the DML would succeed (or fail for some unrelated reason
 *   like a CHECK constraint, NOT 42501). With the REVOKE block in place the admin
 *   client receives 42501 "permission denied for table <table>" at the table-grant
 *   check, BEFORE RLS evaluates. Catches the admin-bypass surface that anon/
 *   authenticated probes structurally cannot.
 *
 * Layer 3 (anon + authenticated PostgREST probes, tightened error matching):
 *   The existing probes are kept as the path-end check, but the error-message
 *   match is tightened to require "permission denied for table" wording. RLS
 *   policy violations return "new row violates row-level security policy" /
 *   generic "permission denied" without "for table" — distinguishing the two
 *   error shapes prevents the original tautology (any 42501 / generic permission
 *   denied previously passed irrespective of which layer denied).
 */

// Helper: assert has_table_privilege returns false for role × table × verb via psql.
// Uses execFileSync (no shell) for safety; role / table / verb come from the static
// LOCKED_TABLES registry + literal arrays below — no untrusted input.
function assertNoTablePrivilege(role: "anon" | "authenticated", table: string, verb: "INSERT" | "UPDATE" | "DELETE") {
  const sql = `SELECT has_table_privilege('${role}', 'public.${table}', '${verb}')`;
  const out = execFileSync("psql", [DATABASE_URL, "-t", "-A", "-c", sql], { encoding: "utf8" }).trim();
  expect(out).toBe("f");
}

describe("PostgREST DML lockdown — RPC-gated tables (3-layer defense)", () => {
  for (const { table, closed_at } of LOCKED_TABLES) {
    describe(`${table} (closed at ${closed_at})`, () => {
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      const authed = createClient(url, authKey, { auth: { persistSession: false } });
      const admin = createClient(url, adminKey, { auth: { persistSession: false } });

      // Layer 1: has_table_privilege false for anon/authenticated × INSERT/UPDATE/DELETE.
      // Proves REVOKE actually landed at the table-grant layer, independent of RLS policy state.
      test("Layer 1: anon × INSERT no privilege", () => assertNoTablePrivilege("anon", table, "INSERT"));
      test("Layer 1: anon × UPDATE no privilege", () => assertNoTablePrivilege("anon", table, "UPDATE"));
      test("Layer 1: anon × DELETE no privilege", () => assertNoTablePrivilege("anon", table, "DELETE"));
      test("Layer 1: authenticated × INSERT no privilege", () => assertNoTablePrivilege("authenticated", table, "INSERT"));
      test("Layer 1: authenticated × UPDATE no privilege", () => assertNoTablePrivilege("authenticated", table, "UPDATE"));
      test("Layer 1: authenticated × DELETE no privilege", () => assertNoTablePrivilege("authenticated", table, "DELETE"));

      // Layer 2: admin-authenticated PostgREST probe — fails with 42501 "permission denied for table"
      // BECAUSE table-grants are revoked, NOT because admin_only RLS denies the admin (which it would not).
      // This is the load-bearing probe that distinguishes "REVOKE landed" from "RLS denies non-admin".
      test("Layer 2: admin INSERT denied at table-grant layer (not RLS)", async () => {
        const { error } = await admin.from(table).insert({});
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        // "permission denied for table <name>" is the table-grant denial wording.
        // RLS policy violations return "new row violates row-level security policy" — NO "for table" substring.
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
        expect(error?.message?.toLowerCase()).not.toContain("row-level security");
      });
      test("Layer 2: admin UPDATE denied at table-grant layer (not RLS)", async () => {
        const { error } = await admin.from(table).update({}).neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
        expect(error?.message?.toLowerCase()).not.toContain("row-level security");
      });
      test("Layer 2: admin DELETE denied at table-grant layer (not RLS)", async () => {
        const { error } = await admin.from(table).delete().neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
        expect(error?.message?.toLowerCase()).not.toContain("row-level security");
      });

      // Layer 3: anon + authenticated PostgREST probes (path-end check; tightened error matching).
      // R61 F51 amendment: require "permission denied for table" wording specifically — excludes RLS-policy
      // violation messages ("new row violates row-level security policy" / generic "permission denied" without
      // the "for table" substring). Tightening prevents the original tautology where ANY 42501/permission-denied
      // string passed, including the RLS denial that admin_only already provides irrespective of REVOKE.
      test("Layer 3: anon INSERT denied with table-grant message", async () => {
        const { error } = await anon.from(table).insert({});
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
      test("Layer 3: anon UPDATE denied with table-grant message", async () => {
        const { error } = await anon.from(table).update({}).neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
      test("Layer 3: anon DELETE denied with table-grant message", async () => {
        const { error } = await anon.from(table).delete().neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
      test("Layer 3: authenticated INSERT denied with table-grant message", async () => {
        const { error } = await authed.from(table).insert({});
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
      test("Layer 3: authenticated UPDATE denied with table-grant message", async () => {
        const { error } = await authed.from(table).update({}).neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
      test("Layer 3: authenticated DELETE denied with table-grant message", async () => {
        const { error } = await authed.from(table).delete().neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code).toBe("42501");
        expect(error?.message?.toLowerCase()).toContain("permission denied for table");
      });
    });
  }
});
```

  **R61 F51 amendment — tautology audit.** The pre-R61 test accepted ANY error whose code was `42501` OR whose message contained `"permission denied"`. The `admin_only` RLS policy at every row (`USING (public.is_admin())`) ALREADY denies non-admin INSERT/UPDATE/DELETE irrespective of table-grant state, so the pre-R61 test PASSed on a hypothetical stack where the REVOKE block was deleted but the RLS policy remained — defeating the structural-defense purpose. R61 closes the gap with three orthogonal layers: (Layer 1) `pg_catalog.has_table_privilege` directly inspects the table-grant catalog, independent of RLS; (Layer 2) an admin-authenticated probe exercises the surface that `admin_only` RLS WOULD pass — so the only thing left to deny is the table-grant check, with the unambiguous `permission denied for table` wording; (Layer 3) tightened anon/authenticated probes require the `for table` substring to distinguish table-grant denial from RLS denial.

  <!-- not-f29-class: this paragraph documents the test-harness env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_TEST_AUTHENTICATED_JWT, SUPABASE_TEST_ADMIN_JWT, TEST_DATABASE_URL) for the R17 F15 PostgREST DML lockdown meta-test. These are NOT the canonical VALIDATION_* env-var contract that F29-class structural defense governs. -->
  **R61 F51 amendment — environment requirements.** The test now requires four env vars: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (existing — anon client), `SUPABASE_TEST_AUTHENTICATED_JWT` (existing — non-admin authenticated role), `SUPABASE_TEST_ADMIN_JWT` (new — authenticated role whose email matches `public.is_admin()`'s admin allow-list), and `TEST_DATABASE_URL` (existing — direct psql for Layer 1). The admin JWT's email must be in the live admin allow-list at test-database setup time (the Phase 0.A.5 `.env.local.example` template documents the convention). If `SUPABASE_TEST_ADMIN_JWT` is unset, Layer 2 must fail loud (not skip) — the Phase 0.B test bootstrap registers the env var as required.

  **RED→GREEN verification (R61 F51 strengthened).** Before applying the R17 commit 37 REVOKE block, Layer 1's `has_table_privilege` probes return `t` for at least one (role, verb) pair (FAIL); Layer 2's admin client successfully completes INSERT/UPDATE/DELETE (or fails with a non-42501 reason — also FAIL because the test expects 42501); Layer 3's anon/authenticated probes return an RLS policy violation message that lacks `"for table"` substring (FAIL on tightened match). After applying the REVOKE block, all three layers PASS. The pre-existing `crew_members` row must stay GREEN throughout (regression baseline). The historical `crew_member_auth` row is NOT in the registry post-R67 F55 amendment (M11.5 G3 cutover dropped the table; see registry comment above). **Failure mode each layer catches:** Layer 1 — a future amendment drops the REVOKE block but leaves `admin_only` RLS in place; pre-R61 Layer 3 would falsely pass on this stack via RLS denial. Layer 2 — same regression, plus the case where a new admin-specific RLS policy is added that would pass admin INSERT/UPDATE/DELETE. Layer 3 — defense in depth at the path-end (catches the case where Layers 1+2 false-negative due to env-var mis-config or a future grant-by-role-attribute mechanism that bypasses table-grant catalog).

- [ ] **Step 9: Commit** (the migration + both new tests — master-spec edits land in subsequent tasks, all together in the same PR):

```bash
git add \
  supabase/migrations/<timestamp>_validation_state.sql \
  tests/db/validation-state.test.ts \
  tests/db/postgrest-dml-lockdown.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add validation_state singleton table for M12 tooling

Per M12 spec §3.3.2. Singleton PK (key='validation_seed'), 16-combo
CHECK enum, alias_map jsonb with drift repair, admin_only FOR ALL
policy matching the canonical admin-only-table pattern. PostgREST DML
locked down per AGENTS.md cross-cutting #1 (REVOKE INSERT/UPDATE/DELETE
from anon + authenticated; SELECT preserved; service_role retains ALL).
Structural meta-test tests/db/postgrest-dml-lockdown.test.ts pins the
invariant for crew_members + validation_state (M11.5 G3 cutover
dropped crew_member_auth per R67 F55 amendment).
Apply-twice safe AND enum-drift safe AND type-drift fail-loud.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.B.3: Amend master spec §4.3 admin-only table list (21 → 22)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` line 605 (per 0.B.1 verification)

- [ ] **Step 1: Edit master spec §4.3 line 605:** add `validation_state` to the admin-only tables bullet list (alphabetical position; before `wizard_finalize_checkpoints`). Update the parenthetical `(**21 tables**...)` to `(**22 tables**...)`.

- [ ] **Step 2: Verify the diff:**

```bash
git diff docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md | head -10
```

Expected: one line added (`validation_state`) + one count update (21 → 22). Nothing else changed.

- [ ] **Step 3: NO commit yet** — bundle with other amendments.

---

### Task 0.B.4: Amend master spec §4.1 — add `create table validation_state` block

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` schema section

This is required because the live generator `scripts/generate-admin-tables.ts:31-34` filters extracted §4.3 names to tables with a matching `create table ...` in master spec. Without the CREATE TABLE block, the regenerated `lib/audit/admin-tables.generated.ts` will silently drop `validation_state`.

- [ ] **Step 1: Find the master-spec section where admin-only tables have their `create table` blocks** (e.g., near `create table public.shows_internal`):

```bash
grep -n "^create table public\." docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md | head -5
```

- [ ] **Step 2: Add a `create table validation_state` block in master spec's schema section** mirroring the M12 spec §3.3.2 DDL (sans the `IF NOT EXISTS` + `DO $$` blocks — master spec uses simple `create table` form):

```sql
create table public.validation_state (
  key                              text primary key check (key = 'validation_seed'),
  last_seed_date                   date null,                              -- R57 commit 95 F49 amendment: NULL until validation_finalize_all_atomic stamps; mint RPC initial INSERT MUST NOT write this column. Predicate (b) treats NULL as stale.
  combos_materialized              text[] not null,
  combos_seeded_dates              jsonb not null default '{}'::jsonb,    -- R4 amendment: per-combo seeded dates
  alias_map                        jsonb not null default '{}'::jsonb,
  seeded_by                        text not null,
  seeded_supabase_project_ref      text not null,
  seeded_at                        timestamptz not null default now(),
  constraint validation_state_combos_check check (
    combos_materialized <@ array[
      'R1','R2','R3','R4','R5','R6','R7a','R7b','R8a','R8b',
      'SW-PRE_TRAVEL','SW-TRAVEL_IN','SW-SHOW_1','SW-SHOW_INTERIOR','SW-SHOW_LAST','SW-POST_SHOW'
    ]
  )
);
```

Insert this near the other admin-only table CREATE blocks (e.g., near `shows_internal` or alphabetically).

- [ ] **Step 3: Verify** the generator picks it up (next task does this end-to-end).

---

### Task 0.B.5: Amend master spec AC-2.5 (line 3489 — 21→22 tables / 84→88 assertions)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` line 3489

- [ ] **Step 1: Edit AC-2.5:** add `validation_state` to the per-table list in the AC body. Update the literal `**21 tables × 4 verbs = 84 assertions**` to `**22 tables × 4 verbs = 88 assertions**`.

- [ ] **Step 2: Verify the diff:**

```bash
git diff docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md | grep "22 tables\|88 assertions\|validation_state" | head -10
```

Expected: count update visible.

- [ ] **Step 3: NO commit yet** — bundle.

---

### Task 0.B.6: Regenerate `lib/audit/admin-tables.generated.ts`

**Files:**
- Modify (regenerated): `lib/audit/admin-tables.generated.ts`

- [ ] **Step 1: Confirm the canonical command** (R1 P2 amendment — verified live `package.json:13`): `pnpm gen:admin-tables`. (This runs `tsx scripts/generate-admin-tables.ts`.)

- [ ] **Step 2: Run the regenerator:**

```bash
pnpm gen:admin-tables
```

- [ ] **Step 3: Verify `lib/audit/admin-tables.generated.ts` now includes `validation_state`:**

```bash
grep "validation_state" lib/audit/admin-tables.generated.ts
```

Expected: 1+ matches.

- [ ] **Step 4: Verify total table count = 18 (live track):**

```bash
grep -c '"[a-z_]*"' lib/audit/admin-tables.generated.ts
```

Expected: **18** (one quoted string per table; live track post-`validation_state` insert per the M11.5 `removedByPickerPivot` filter — `17` prior + `validation_state` = `18`). The master-spec prose track of `22` is the §4.3 nominal count edited in Tasks 0.B.3 + 0.B.5 and is NOT what the live generator emits — see Task 0.B.8 + spec §3.3.2:323 dual-mode count discipline.

- [ ] **Step 5: NO commit yet** — bundle.

---

### Task 0.B.7: DELETED (2026-05-26 R10 F6 repair)

The pre-rebase draft of this task targeted `tests/db/rls.test.ts` (21 → 22). That file does NOT exist post-M11.5 G3 cutover (and likely never existed in the consolidated form the pre-rebase plan assumed). Per spec §3.3.2 step 6 (lines 338-339), `tests/db/rls.test.ts` is **DROPPED** from M12's test-baseline update set; no live equivalent carries the 21-tables literal. The R8 commit-13 03-reseed inline-rewrite + R10 F6 repair together close the class of "file-head correction note claims a fix the task body doesn't reflect" — this task is removed from the Phase 0.B sequence, not rewritten in place.

---

### Task 0.B.8: Update `tests/db/admin-rls-runtime.test.ts` count baseline (4 references: 17 → 18)

**Files:**
- Modify: `tests/db/admin-rls-runtime.test.ts` lines 4, 21, 111, 112 (live 4 references, NOT the pre-rebase plan's claim of 7 refs on lines 4 / 9 / 21 / 111 / 112 / 213 / 218 — see front-loaded rebase-corrections table at the top of this file + spec §3.3.2 step 6 + §15.26 stale-citation paragraph)

**Count math (per α + γ-footnote hybrid; see spec §3.3.2:323).** The live track baseline is **17** (post-M11.5 G3 cutover dropped 4 retired tables via `scripts/generate-admin-tables.ts`'s `removedByPickerPivot` filter); adding `validation_state` bumps it to **18**. The master-spec prose track is 21 → 22 (Tasks 0.B.3 + 0.B.5), but the live track does NOT use 22 — Phase 0.B updates the live track via 17 → 18 only.

- [ ] **Step 1: Verify the live state** (the test file's header comments + assertion + parity check are the 4 references):

```bash
grep -n "17 admin\|toHaveLength(17)\|17 tables\|17 admin-gated" tests/db/admin-rls-runtime.test.ts
```

Expected: 4 matches on lines 4, 21, 111, 112. If the count has drifted, adapt the sed command in step 2 accordingly.

- [ ] **Step 2: Use sed to update all 4 references in one pass:**

```bash
sed -i.bak -e '4s/17/18/' -e '21s/17/18/' -e '111s/17/18/' -e '112s/17/18/' tests/db/admin-rls-runtime.test.ts && rm tests/db/admin-rls-runtime.test.ts.bak
```

- [ ] **Step 3: Verify the test still parses:** `pnpm vitest --typecheck tests/db/admin-rls-runtime.test.ts`.

- [ ] **Step 4: Regenerate the baseline JSON** (next task).

---

### Task 0.B.9: Regenerate `tests/db/admin-rls-runtime.baseline.json` (18 × 4 = 72 rows)

**Files:**
- Modify (regenerated): `tests/db/admin-rls-runtime.baseline.json`

- [ ] **Step 1: Find how the baseline is generated** (check the test file for instructions or grep for a regenerate command):

```bash
grep -n "baseline\|UPDATE_BASELINE\|--update" tests/db/admin-rls-runtime.test.ts package.json | head -10
```

- [ ] **Step 2: Regenerate** using whichever mechanism the test file documents (commonly `UPDATE_BASELINE=1` env var OR a dedicated `pnpm` script). If neither is in place, the dev re-creates the baseline manually by running the test once and copying the actual values from the failure diff into the baseline file. Confirm exact procedure before mass-editing the JSON.

- [ ] **Step 3: Verify the baseline now has 18 entries × 4 verbs = 72 rows** (live track post-`validation_state` insertion; the master-spec prose track of 22 × 4 = 88 is NOT used here — see spec §3.3.2:323 dual-mode count discipline + the front-loaded rebase-corrections table):

```bash
jq 'length' tests/db/admin-rls-runtime.baseline.json
# expect 72
```

- [ ] **Step 4: Re-run the test against the new baseline:**

```bash
pnpm vitest run tests/db/admin-rls-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: NO commit yet** — bundle.

---

### Task 0.B.10: DELETED (2026-05-26 R10 F6 repair)

The pre-rebase draft of this task targeted `tests/cross-cutting/auth.test.ts` line 203 (the ADMIN_TABLES literal-list expectation). That file does NOT exist, and no `ADMIN_TABLES` literal-list expectation exists in any current test (verified via `grep -rln 'ADMIN_TABLES.*toEqual\|ADMIN_TABLES.*toHaveLength' tests/` — zero hits). `ADMIN_TABLES` is consumed structurally via the generated `lib/audit/admin-tables.generated.ts` import; no per-element literal expectation needs maintenance. Per spec §3.3.2 step 6 (line 339), this task is **DROPPED** from M12's test-baseline update set. The R10 F6 repair removes it from the Phase 0.B sequence rather than rewriting it to a non-existent live equivalent.

---

### Task 0.B.11: Run the X.3 / X.6 / admin-table gates to verify atomicity

Per spec §3.3.2 atomicity gate: Phase 0.B does NOT close until these all pass.

- [ ] **Step 1: Run admin-rls-runtime.test.ts:** `pnpm vitest run tests/db/admin-rls-runtime.test.ts` — expect PASS (18 tables × 4 verbs = 72 assertions; live track).
- [ ] **Step 2: Run X.6 traceability locally** (R1 P2 amendment — verified live `package.json` script name):

```bash
pnpm test:audit:traceability
```

Expected: no `MISSING` rows; parity assertions pass against the updated master spec §4.3 + AC-2.5.

- [ ] **Step 3: Run X.3 trust-domain audit:**

```bash
pnpm test:audit:x3-trust-domain
```

Expected: PROTECTED_SINKS regenerated to include validation_state (auto from §4.3 via `pnpm gen:admin-tables` which the script chains).

- [ ] **Step 4: If any gate fails, repair the missing piece and re-run.** Do NOT commit until all gates pass.

---

### Task 0.B.12: Bundle the Phase 0.B PR

- [ ] **Step 1: Verify everything is staged or unstaged:**

```bash
git status
```

Expected: pending edits to master spec (§4.1, §4.3, AC-2.5), `lib/audit/admin-tables.generated.ts`, and 2 test artifacts (`tests/db/admin-rls-runtime.test.ts` + `tests/db/admin-rls-runtime.baseline.json`). Plus the already-committed migration + validation-state test from 0.B.2. The pre-rebase plan included `tests/db/rls.test.ts` + `tests/cross-cutting/auth.test.ts` in this bundle; both files do not exist post-M11.5 and their Phase 0.B tasks are DELETED (R10 F6 repair — see Tasks 0.B.7 + 0.B.10).

- [ ] **Step 2: Stage and commit the atomic bundle:**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/audit/admin-tables.generated.ts tests/db/admin-rls-runtime.test.ts tests/db/admin-rls-runtime.baseline.json
git commit -m "$(cat <<'EOF'
docs+test(master-spec,audit): atomic update for validation_state addition

Per M12 spec §3.3.2. Adds validation_state to master spec §4.3
admin-only table list (prose track 21→22 per α + γ-footnote hybrid;
live `ADMIN_TABLES.length` 17→18 via the picker-pivot filter),
§4.1 schema-section CREATE TABLE block, AC-2.5 assertion count
(prose track 21→22 tables / 84→88 assertions; cross-references the
§4.3 footnote that documents the live-vs-prose count math).
Regenerates lib/audit/admin-tables.generated.ts (live 18-entry array).
Updates test baselines: admin-rls-runtime.test.ts (4 refs on lines
4/21/111/112: 17→18 live track), admin-rls-runtime.baseline.json
(+validation_state × 4 verbs → 18 × 4 = 72 rows).

`tests/db/rls.test.ts` + `tests/cross-cutting/auth.test.ts` do NOT
exist post-M11.5 (no live ADMIN_TABLES literal-list expectation
anywhere in the test tree); their pre-rebase Phase 0.B tasks were
deleted in the M12 amendment per spec §3.3.2 step 6 + §15.27.

All X.3/X.6/admin-table tests pass locally before this commit lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push to a branch + open PR** (or push to main if branch-protection allows direct push). Confirm the X.3, X.6, x1-x5, verify-branch-protection-status gates all turn green in CI before merge.

- [ ] **Step 4: After merge,** the dev confirms via the production-target Vercel deployment auto-redeploys cleanly (no env-var or schema mismatch).

---

### Task 0.B.13: Verify Phase 0.B close-out conditions

- [ ] **Step 1: Confirm `validation_state` table exists in prod-equivalent Supabase** via Supabase SQL editor: `SELECT * FROM information_schema.tables WHERE table_schema='public' AND table_name='validation_state';` returns 1 row.
- [ ] **Step 2: Confirm RLS posture:** `SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='validation_state';` returns the `admin_only` policy.
- [ ] **Step 3: Confirm singleton invariant:** attempt `INSERT INTO public.validation_state (key, last_seed_date, combos_materialized, seeded_by, seeded_supabase_project_ref) VALUES ('not-the-singleton-key', ...);` — expect CHECK constraint violation.
- [ ] **Step 4: Move to Phase 0.C** (`03-phase0-tooling-reseed.md`).

---

## Phase 0.B failure modes

- **Migration applies locally but fails on prod-equivalent.** Usually a version mismatch — re-run `supabase link` and confirm the linked project ref.
- **`is_admin()` function not found.** Verify earlier migrations installed `public.is_admin()` (it's a SECURITY DEFINER function from the project's initial schema migration). Without it, the policy creation fails.
- **X.6 traceability gate fails** with `MISSING` on validation_state. Most likely cause: the CREATE TABLE block in master spec §4.1 was inserted incorrectly (wrong syntax, wrong section, missing column). Re-verify per the generator's filter at `scripts/generate-admin-tables.ts:31-34`.
- **Test baseline regen produces unexpected diffs.** If `admin-rls-runtime.baseline.json` shows changes to OTHER tables (not just validation_state's 4 new rows), something else changed in the schema — investigate before committing.

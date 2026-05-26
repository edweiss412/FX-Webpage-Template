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
});
```

The test depends on `psql` being on PATH (the same dependency the existing `admin-rls-runtime.test.ts` and `picker_epoch_columns.test.ts` already carry — see the Phase 0 harness requirements in `tests/db/admin-rls-runtime.test.ts:55-79`). Pre-migration, the SELECT returns zero rows and the column-map is empty, so every `expect(colMap.<name>?.data_type)` is `undefined !== expected` and the test FAILs. Post-migration, all 8 columns return their expected types and the test PASSes. Apply-twice idempotency (Step 7) does not change the row count, so the test stays GREEN across re-applies.

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

**PostgREST DML lockdown contract (R17 F15 amendment).** `validation_state` writes flow EXCLUSIVELY through the two SECURITY DEFINER RPCs `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` (defined in `03-phase0-tooling-reseed.md`). The admin_only RLS policy alone does NOT prevent direct PostgREST DML by an authenticated admin session — the table-level INSERT/UPDATE/DELETE grants must be revoked at the schema level. `tests/db/postgrest-dml-lockdown.test.ts` (authored in Task 0.B.2 Step 8a per AGENTS.md cross-cutting #1 structural meta-test mandate) pins the invariant at CI time; the meta-test registers `validation_state` alongside `crew_member_auth` + `crew_members` (M9.5 R5+R6 precedent at `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql`).

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

  - `crew_member_auth` (M9.5 R5 — closed at `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:44-50`)
  - `crew_members` (M9.5 R6 — closed at same migration:80-86)
  - `validation_state` (M12 R17 F15 — closed in this migration's `REVOKE INSERT, UPDATE, DELETE` block above)

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
const LOCKED_TABLES = [
  { table: "crew_member_auth",  closed_at: "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:44" },
  { table: "crew_members",      closed_at: "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80" },
  { table: "validation_state",  closed_at: "supabase/migrations/<timestamp>_validation_state.sql (R17 commit 37 F15 REVOKE block)" },
] as const;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const authKey = process.env.SUPABASE_TEST_AUTHENTICATED_JWT!;  // signed JWT with role='authenticated', random email

describe("PostgREST DML lockdown — RPC-gated tables", () => {
  for (const { table, closed_at } of LOCKED_TABLES) {
    describe(`${table} (closed at ${closed_at})`, () => {
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      const authed = createClient(url, authKey, { auth: { persistSession: false } });

      test("anon INSERT denied", async () => {
        const { error } = await anon.from(table).insert({});
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });

      test("anon UPDATE denied", async () => {
        const { error } = await anon.from(table).update({}).neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });

      test("anon DELETE denied", async () => {
        const { error } = await anon.from(table).delete().neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });

      test("authenticated INSERT denied (no admin JWT-role bypass at table layer)", async () => {
        const { error } = await authed.from(table).insert({});
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });

      test("authenticated UPDATE denied", async () => {
        const { error } = await authed.from(table).update({}).neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });

      test("authenticated DELETE denied", async () => {
        const { error } = await authed.from(table).delete().neq("key" as never, "__sentinel__");
        expect(error).not.toBeNull();
        expect(error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")).toBe(true);
      });
    });
  }
});
```

  **RED→GREEN verification:** before applying the R17 commit 37 REVOKE block, the three `validation_state` assertions FAIL (PostgREST returns success or an RLS-policy error rather than a table-grant permission error, because at the table-grant layer authenticated retained INSERT/UPDATE/DELETE). After applying the REVOKE block, all assertions PASS — the failure mode is now an unambiguous `42501 permission denied for table validation_state` returned at the table-grant check, BEFORE the admin_only RLS USING/WITH CHECK predicate evaluates. The two existing rows (`crew_member_auth`, `crew_members`) must stay GREEN throughout (regression baseline).

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
invariant for crew_member_auth + crew_members + validation_state.
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

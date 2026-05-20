# Phase 0.B — `validation_state` migration + atomic master-spec amendments + test baselines

> Per spec §3.3.2 + §9.0 task 0.B. Estimate: 0.5–1 day.
>
> Goal: in ONE PR (or commit series in one PR), land the `validation_state` migration AND the master-spec amendments AND the admin-tables generator regen AND the test baseline updates. Phase 0.B does NOT close until X.3 / X.6 / admin-table tests pass against the updated artifacts (per spec §3.3.2 atomicity gate).
>
> Plan-wide invariants 8 (singleton + drift-safe DDL) and 9 (atomic master-spec amendment) are load-bearing here.

---

### Task 0.B.1: Pre-verify live state matches the spec's atomic-checklist line refs

The spec §3.3.2 atomic checklist cites specific lines in master spec and test files. Before editing, verify each line still says what the spec says it says (the codebase may have evolved since the spec was written).

- [ ] **Step 1: Verify master spec §4.3 line 605 (21 admin-only tables count).**

```bash
grep -n "21 tables" docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md | head -5
```

Expected: the line containing "**21 tables**" describing the admin-only table list. If the count has shifted, update the spec's atomic checklist references in Phase 0.B's edits.

- [ ] **Step 2: Verify master spec AC-2.5 line 3489 (21 × 4 = 84 assertions).**

```bash
grep -n "84 assertions" docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md
```

Expected: line containing "**21 tables × 4 verbs = 84 assertions**". If shifted, adapt.

- [ ] **Step 3: Verify `tests/db/rls.test.ts` line 163-164 hardcodes 21.**

```bash
grep -n "21 admin-only\|toHaveLength(21)" tests/db/rls.test.ts | head -5
```

Expected: lines matching the spec's claim.

- [ ] **Step 4: Verify `tests/db/admin-rls-runtime.test.ts` has 7 references to "21".**

```bash
grep -n "21" tests/db/admin-rls-runtime.test.ts | head -10
```

Expected: 7 lines mentioning 21 (per spec — comments + assertions).

- [ ] **Step 5: Verify `tests/cross-cutting/auth.test.ts` line 203 has the ADMIN_TABLES literal list.**

```bash
sed -n '195,225p' tests/cross-cutting/auth.test.ts
```

Expected: an array literal containing the existing 21 admin-only table names.

- [ ] **Step 6: NO commit** — this step is verification only. If any line refs are stale, update the M12 spec atomic checklist (with R26 amendment note) and re-derive deltas.

---

### Task 0.B.2: Write the migration file (TDD-style failing-first)

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_validation_state.sql` — timestamp matches `date +%Y%m%d%H%M%S` at file-creation time

- [ ] **Step 1: Write a failing-first test that confirms `validation_state` does NOT exist.** Add a new test file `tests/db/validation-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("validation_state", () => {
  it("table exists with admin_only RLS policy + singleton CHECK + alias_map jsonb", async () => {
    const url = process.env.VALIDATION_SUPABASE_URL;
    const key = process.env.VALIDATION_SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("VALIDATION_SUPABASE_URL + VALIDATION_SUPABASE_SECRET_KEY required");
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Introspect via information_schema (service-role bypasses RLS for this read).
    const { data: cols, error } = await supabase
      .from("information_schema.columns" as never)
      .select("column_name, data_type, is_nullable")
      .eq("table_schema", "public")
      .eq("table_name", "validation_state");

    expect(error).toBeNull();
    expect(cols).toBeDefined();

    const colMap = Object.fromEntries((cols ?? []).map((c: { column_name: string; data_type: string; is_nullable: string }) => [c.column_name, c]));
    expect(colMap.key?.data_type).toBe("text");
    expect(colMap.last_seed_date?.data_type).toBe("date");
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

- [ ] **Step 2: Run the test — expect FAIL** (validation_state does not yet exist):

```bash
pnpm vitest run tests/db/validation-state.test.ts
```

Expected: FAIL with no rows from information_schema (column map is empty).

- [ ] **Step 3: Create the migration file** at `supabase/migrations/<timestamp>_validation_state.sql` per spec §3.3.2 DDL (the canonical block — copy verbatim):

```sql
-- M12 validation_state singleton — see docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md §3.3.2.
-- Singleton-enforced via key='validation_seed' PK; drift-safe CHECK; idempotent policy; type-drift fail-loud.

CREATE TABLE IF NOT EXISTS public.validation_state (
  key                              text PRIMARY KEY CHECK (key = 'validation_seed'),
  last_seed_date                   date NOT NULL,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.validation_state TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.validation_state TO service_role;
ALTER TABLE public.validation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only ON public.validation_state;
CREATE POLICY admin_only ON public.validation_state
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

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

Expected: PASS — all 7 columns present with correct types.

- [ ] **Step 7: Verify apply-twice idempotency:**

```bash
npx supabase db push  # second apply
```

Expected: no errors (every block is idempotent per spec invariant 8).

- [ ] **Step 8: Commit** (just the migration + the new test — master-spec edits land in subsequent tasks, all together in the same PR):

```bash
git add supabase/migrations/<timestamp>_validation_state.sql tests/db/validation-state.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add validation_state singleton table for M12 tooling

Per M12 spec §3.3.2. Singleton PK (key='validation_seed'), 16-combo
CHECK enum, alias_map jsonb with drift repair, admin_only FOR ALL
policy matching the canonical admin-only-table pattern, GRANTs to
anon/authenticated/service_role. Apply-twice safe AND enum-drift safe
AND type-drift fail-loud.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.B.3: Amend master spec §4.3 admin-only table list (21 → 22)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` line 605 (per 0.B.1 verification)

- [ ] **Step 1: Edit master spec §4.3 line 605:** add `validation_state` to the admin-only tables bullet list (alphabetical position; before `wizard_finalize_checkpoints`). Update the parenthetical `(**21 tables**...)` to `(**22 tables**...)`.

- [ ] **Step 2: Verify the diff:**

```bash
git diff docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md | head -10
```

Expected: one line added (`validation_state`) + one count update (21 → 22). Nothing else changed.

- [ ] **Step 3: NO commit yet** — bundle with other amendments.

---

### Task 0.B.4: Amend master spec §4.1 — add `create table validation_state` block

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` schema section

This is required because the live generator `scripts/generate-admin-tables.ts:31-34` filters extracted §4.3 names to tables with a matching `create table ...` in master spec. Without the CREATE TABLE block, the regenerated `lib/audit/admin-tables.generated.ts` will silently drop `validation_state`.

- [ ] **Step 1: Find the master-spec section where admin-only tables have their `create table` blocks** (e.g., near `create table public.shows_internal`):

```bash
grep -n "^create table public\." docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md | head -5
```

- [ ] **Step 2: Add a `create table validation_state` block in master spec's schema section** mirroring the M12 spec §3.3.2 DDL (sans the `IF NOT EXISTS` + `DO $$` blocks — master spec uses simple `create table` form):

```sql
create table public.validation_state (
  key                              text primary key check (key = 'validation_seed'),
  last_seed_date                   date not null,
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
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` line 3489

- [ ] **Step 1: Edit AC-2.5:** add `validation_state` to the per-table list in the AC body. Update the literal `**21 tables × 4 verbs = 84 assertions**` to `**22 tables × 4 verbs = 88 assertions**`.

- [ ] **Step 2: Verify the diff:**

```bash
git diff docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md | grep "22 tables\|88 assertions\|validation_state" | head -10
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

- [ ] **Step 4: Verify total table count = 22:**

```bash
grep -c '"[a-z_]*"' lib/audit/admin-tables.generated.ts
```

Expected: 22 (one quoted string per table).

- [ ] **Step 5: NO commit yet** — bundle.

---

### Task 0.B.7: Update `tests/db/rls.test.ts` baseline (21 → 22)

**Files:**
- Modify: `tests/db/rls.test.ts` lines 163-164

- [ ] **Step 1: Edit lines 163-164** — change `21 admin-only tables` → `22 admin-only tables` (test name string), and `toHaveLength(21)` → `toHaveLength(22)`.

- [ ] **Step 2: Run the rls test against the new Supabase:**

```bash
pnpm vitest run tests/db/rls.test.ts
```

Expected: PASS — the test now expects 22 tables AND the new admin_only policy on validation_state exists.

- [ ] **Step 3: NO commit yet** — bundle.

---

### Task 0.B.8: Update `tests/db/admin-rls-runtime.test.ts` baseline (7 references: 21 → 22)

**Files:**
- Modify: `tests/db/admin-rls-runtime.test.ts` lines 4, 9, 21, 111, 112, 213, 218

- [ ] **Step 1: Use sed to update all 7 references in one pass:**

```bash
# Verify the line numbers first
grep -n "21" tests/db/admin-rls-runtime.test.ts | head -10
# Then update via sed only on the specific lines
sed -i.bak -e '4s/21/22/' -e '9s/21/22/' -e '21s/21/22/' -e '111s/21/22/' -e '112s/21/22/' -e '213s/21/22/' -e '218s/21/22/' tests/db/admin-rls-runtime.test.ts && rm tests/db/admin-rls-runtime.test.ts.bak
```

- [ ] **Step 2: Verify the test still parses:** `pnpm vitest --typecheck tests/db/admin-rls-runtime.test.ts`.

- [ ] **Step 3: Regenerate the baseline JSON** (next task).

---

### Task 0.B.9: Regenerate `tests/db/admin-rls-runtime.baseline.json`

**Files:**
- Modify (regenerated): `tests/db/admin-rls-runtime.baseline.json`

- [ ] **Step 1: Find how the baseline is generated** (check the test file for instructions or grep for a regenerate command):

```bash
grep -n "baseline\|UPDATE_BASELINE\|--update" tests/db/admin-rls-runtime.test.ts package.json | head -10
```

- [ ] **Step 2: Regenerate** using whichever mechanism the test file documents (commonly `UPDATE_BASELINE=1` env var OR a dedicated `pnpm` script). If neither is in place, the dev re-creates the baseline manually by running the test once and copying the actual values from the failure diff into the baseline file. Confirm exact procedure before mass-editing the JSON.

- [ ] **Step 3: Verify the baseline now has 22 entries × 4 verbs = 88 rows:**

```bash
jq 'length' tests/db/admin-rls-runtime.baseline.json
# or
grep -c '"' tests/db/admin-rls-runtime.baseline.json | head -1
```

- [ ] **Step 4: Re-run the test against the new baseline:**

```bash
pnpm vitest run tests/db/admin-rls-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: NO commit yet** — bundle.

---

### Task 0.B.10: Update `tests/cross-cutting/auth.test.ts` ADMIN_TABLES literal (line 203)

**Files:**
- Modify: `tests/cross-cutting/auth.test.ts` line 203 (the ADMIN_TABLES literal-list expectation)

- [ ] **Step 1: Read the existing expectation:**

```bash
sed -n '195,220p' tests/cross-cutting/auth.test.ts
```

The expectation is an array of admin-only table names in alphabetical order.

- [ ] **Step 2: Edit line 203 area** to insert `'validation_state'` in alphabetical position. Likely between `'recovery_drift_cooldowns'` and `'report_rate_limits'` OR between `'revoked_links'` and `'shows_internal'` depending on the exact list order.

- [ ] **Step 3: Run the test:**

```bash
pnpm vitest run tests/cross-cutting/auth.test.ts
```

Expected: PASS — ADMIN_TABLES (from `lib/audit/admin-tables.generated.ts`) now matches the updated literal.

- [ ] **Step 4: NO commit yet** — bundle.

---

### Task 0.B.11: Run the X.3 / X.6 / admin-table gates to verify atomicity

Per spec §3.3.2 atomicity gate: Phase 0.B does NOT close until these all pass.

- [ ] **Step 1: Run rls.test.ts:** `pnpm vitest run tests/db/rls.test.ts` — expect PASS (22 tables).
- [ ] **Step 2: Run admin-rls-runtime.test.ts:** `pnpm vitest run tests/db/admin-rls-runtime.test.ts` — expect PASS (88 assertions).
- [ ] **Step 3: Run auth.test.ts:** `pnpm vitest run tests/cross-cutting/auth.test.ts` — expect PASS (ADMIN_TABLES literal matches generated registry).
- [ ] **Step 4: Run X.6 traceability locally** (R1 P2 amendment — verified live `package.json` script name):

```bash
pnpm test:audit:traceability
```

Expected: no `MISSING` rows; parity assertions pass against the updated master spec §4.3 + AC-2.5.

- [ ] **Step 5: Run X.3 trust-domain audit:**

```bash
pnpm test:audit:x3-trust-domain
```

Expected: PROTECTED_SINKS regenerated to include validation_state (auto from §4.3 via `pnpm gen:admin-tables` which the script chains).

- [ ] **Step 6: If any gate fails, repair the missing piece and re-run.** Do NOT commit until all gates pass.

---

### Task 0.B.12: Bundle the Phase 0.B PR

- [ ] **Step 1: Verify everything is staged or unstaged:**

```bash
git status
```

Expected: pending edits to master spec (§4.1, §4.3, AC-2.5), `lib/audit/admin-tables.generated.ts`, 4 test files. Plus the already-committed migration + validation-state test from 0.B.2.

- [ ] **Step 2: Stage and commit the atomic bundle:**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md lib/audit/admin-tables.generated.ts tests/db/rls.test.ts tests/db/admin-rls-runtime.test.ts tests/db/admin-rls-runtime.baseline.json tests/cross-cutting/auth.test.ts
git commit -m "$(cat <<'EOF'
docs+test(master-spec,audit): atomic update for validation_state addition

Per M12 spec §3.3.2. Adds validation_state to master spec §4.3
admin-only table list (21→22), §4.1 schema-section CREATE TABLE
block, AC-2.5 assertion count (21→22 tables / 84→88 assertions).
Regenerates lib/audit/admin-tables.generated.ts. Updates test
baselines: rls.test.ts (21→22), admin-rls-runtime.test.ts (7 refs
21→22), admin-rls-runtime.baseline.json (+validation_state × 4
verbs), auth.test.ts ADMIN_TABLES literal.

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

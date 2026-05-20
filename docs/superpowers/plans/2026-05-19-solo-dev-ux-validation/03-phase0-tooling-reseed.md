# Phase 0.C — `validation:reseed` + `validation:check-seed` + `validation:resolve-alias`

> Per spec §3.3 + §3.3.2 + §9.0 task 0.C + §9.1.2 tooling reference. Estimate: 1–2 days.
>
> Goal: ship the three foundational validation-tooling CLIs. They write/read `validation_state`, materialize the 16 fixture combos (10 R + 6 SW) with 11 crew_members per R-combo, lockstep crew_member_auth UPSERT, and the 116-leaf alias_map jsonb. Walks the canonical §9.1.2 contract.

---

### Task 0.C.1: Scaffold the script file structure

**Files:**
- Create: `scripts/validation-reseed.ts`, `scripts/validation-check-seed.ts`, `scripts/validation-resolve-alias.ts`
- Modify: `package.json` (add 3 `validation:*` scripts)

- [ ] **Step 1: Write a failing test** that confirms the help-text shape (via `execFileNoThrow` from `src/utils/execFileNoThrow.ts` if present, OR via Node's `node:child_process` `execFile` directly — never shell-string-interpolation):

```ts
// tests/scripts/validation-reseed.test.ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

describe("validation-reseed CLI", () => {
  it("prints usage when invoked with --help", () => {
    const out = execFileSync("pnpm", ["-s", "validation:reseed", "--help"], { encoding: "utf-8" });
    expect(out).toContain("--combo");
    expect(out).toContain("--allow-local-override");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (script doesn't exist yet): `pnpm vitest run tests/scripts/validation-reseed.test.ts`.

- [ ] **Step 3: Create the skeleton** `scripts/validation-reseed.ts` with `parseArgs` from `node:util`, printing the usage block on `--help`. Required env vars per spec §5.3.

- [ ] **Step 4: Add to `package.json` scripts:**

```json
{
  "scripts": {
    "validation:reseed": "tsx scripts/validation-reseed.ts",
    "validation:check-seed": "tsx scripts/validation-check-seed.ts",
    "validation:resolve-alias": "tsx scripts/validation-resolve-alias.ts"
  }
}
```

- [ ] **Step 5: Run the test — expect PASS:** `pnpm vitest run tests/scripts/validation-reseed.test.ts`.

- [ ] **Step 6: Commit:**

```bash
git add scripts/validation-reseed.ts scripts/validation-check-seed.ts scripts/validation-resolve-alias.ts package.json tests/scripts/validation-reseed.test.ts
git commit -m "feat(validation): scaffold reseed/check-seed/resolve-alias CLIs"
```

---

### Task 0.C.2: Implement target-selection guard (rejects localhost without override)

**Files:**
- Create: `scripts/lib/validation-target.ts` (shared helper)
- Create: `tests/scripts/validation-target.test.ts`

- [ ] **Step 1: Write failing test** for `assertProdEquivalentTarget(url, allowLocalOverride)`:
  - rejects localhost/127.0.0.1/::1 without override
  - permits localhost with override
  - permits prod-equivalent URL
  - rejects when URL env var is missing

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `scripts/lib/validation-target.ts`:

```ts
// scripts/lib/validation-target.ts — per M12 spec §3.3 step 5.
export function assertProdEquivalentTarget(url: string | undefined, allowLocalOverride: boolean): void {
  if (!url) {
    throw new Error("VALIDATION_SUPABASE_URL is required");
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
  if (isLocal && !allowLocalOverride) {
    throw new Error(`Refusing to operate against local URL (${url}); use --allow-local-override to bypass`);
  }
}
```

- [ ] **Step 4: Wire into `validation-reseed.ts`, `validation-check-seed.ts`, `validation-resolve-alias.ts`** at startup.

- [ ] **Step 5: Run — expect PASS.** Commit:

```bash
git add scripts/lib/validation-target.ts scripts/validation-reseed.ts scripts/validation-check-seed.ts scripts/validation-resolve-alias.ts tests/scripts/validation-target.test.ts
git commit -m "feat(validation): target-selection guard rejects localhost"
```

---

### Task 0.C.3: Define the fixture mapping table (16 combos × 11 crew_members)

**Files:**
- Create: `scripts/lib/validation-fixtures.ts`

Per spec §3.3 owned-fixture-mappings + §3.3.1 show-wide states. Define a typed `FIXTURES` array enumerating all 16 combos with `{combo, showName, dateRestriction, stageRestriction, datesRelative, expectedTodayState, crewMembers[]}`.

Each R-combo's `crewMembers` is built from:
- 9 role-variant aliases per §3.2 (`alias_5a_lead`, `alias_5b_lead_a1`, `alias_5c_bo_lead`, `alias_6a_a1` … `alias_6f_empty`)
- 2 J3-isolation aliases (`alias_5a_lead_for_revoke`, `alias_5a_lead_for_query_compromise`) — both LEAD role_flags

Each SW-* combo's `crewMembers` has only `alias_5a_lead` (1 entry).

- [ ] **Step 1: Write a failing test** that validates the FIXTURES shape:
  - exactly 16 combos
  - 10 R-combos each have 11 crew_members; SW-* combos each have 1
  - total leaf aliases = 116
  - every R-combo's crew_members includes `alias_5a_lead_for_revoke` AND `alias_5a_lead_for_query_compromise`

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Populate `scripts/lib/validation-fixtures.ts` with all 16 entries.** Reference spec §3.3 R-combo table and §3.3.1 show-wide state table for the per-combo `dateRestriction` / `stageRestriction` / `datesRelative` shapes. Synthesize predictable emails: `validation+<combo>-<alias>@example.com`. Synthesize stable names: `<combo>_<alias>`.

- [ ] **Step 4: Run — expect PASS.** Commit:

```bash
git add scripts/lib/validation-fixtures.ts tests/scripts/validation-fixtures.test.ts
git commit -m "feat(validation): canonical fixture mapping — 16 combos × 11 = 116 aliases"
```

---

### Task 0.C.4: Author + apply `mint_validation_fixture_atomic` RPC (advisory-lock-held single transaction)

**Files:**
- Create: `supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql`
- Create: `tests/db/mint-validation-fixture-atomic.test.ts`

Per spec invariant 2 (per-show advisory lock). **R1 P0 amendment:** the reseed script cannot acquire the lock and then do writes through `@supabase/supabase-js` PostgREST — those writes wouldn't share the transaction with the lock. Per project pattern (`supabase/migrations/20260504000003_mint_link_session_atomic.sql`, `20260504000004_revoke_leaked_link_atomic_advisory_lock.sql`), advisory-lock-protected mutations run inside a SECURITY DEFINER RPC.

- [ ] **Step 1: Write failing test** that confirms `mint_validation_fixture_atomic(combo, payload)` does NOT exist yet:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
describe("mint_validation_fixture_atomic RPC", () => {
  it("exists and writes show/crew/crew_member_auth + alias_map atomically", async () => {
    const supabase = createClient(process.env.VALIDATION_SUPABASE_URL!, process.env.VALIDATION_SUPABASE_SECRET_KEY!);
    const { data, error } = await supabase.rpc("mint_validation_fixture_atomic", {
      p_combo: "R1",
      p_fixture_payload: { /* per the function signature */ },
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (function does not exist).

- [ ] **Step 3: Author the RPC migration.** The function:
  - Takes `(p_combo text, p_fixture_payload jsonb)` — payload contains showName, dates, date_restriction, stage_restriction, crew_members array, R-combo cleanup flags.
  - Synthesizes a stable `drive_file_id = 'validation_' || p_combo` deterministically.
  - Acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` BEFORE any mutation.
  - INSIDE THE SAME TRANSACTION: UPSERT shows, UPSERT crew_members per payload, UPSERT crew_member_auth per crew_member (preserving current_token_version if already set), UPDATE validation_state.alias_map[combo] merge.
  - For `p_combo = '__cleanup__'` (special pseudo-combo): DELETE `revoked_links WHERE revoked_reason LIKE 'validation:%'` + structural reset of every R-combo's `alias_5a_lead_for_query_compromise` (DELETE matching revoked_links + crew_member_auth version bump).
  - Returns `jsonb` with the alias_map slice it wrote + the show_id.

```sql
-- supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql
-- Per M12 spec invariant 2 (per-show advisory lock) + plan R1 P0 amendment.
-- R2 amendment: SQL sketch verified against live schema
-- (supabase/migrations/20260501000000_initial_public_schema.sql:3-47):
-- shows columns: drive_file_id NOT NULL UNIQUE, slug NOT NULL UNIQUE, title NOT NULL,
--   client_label NOT NULL, template_version NOT NULL, plus nullable jsonb fields.
-- crew_members columns: show_id NOT NULL, name NOT NULL, email (canonicalized),
--   role NOT NULL, role_flags NOT NULL DEFAULT '{}'.

CREATE OR REPLACE FUNCTION public.mint_validation_fixture_atomic(
  p_combo text,
  p_fixture_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drive_file_id text;
  v_slug text;
  v_show_id uuid;
  v_alias_map_slice jsonb := '{}'::jsonb;
  v_crew_member jsonb;
  v_crew_id uuid;
  v_crew_name text;
  v_crew_role_flags text[];
BEGIN
  -- 1. Resolve drive_file_id (stable per-combo synthetic ID) and acquire advisory lock.
  v_drive_file_id := 'validation_' || p_combo;
  v_slug := 'validation-' || lower(replace(p_combo, '_', '-'));
  PERFORM pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- 2. UPSERT show with all NOT NULL columns populated.
  INSERT INTO public.shows (
    drive_file_id, slug, title, client_label, template_version,
    dates, archived, published, last_seen_modified_time
  )
  VALUES (
    v_drive_file_id,
    v_slug,
    p_fixture_payload->>'showName',
    'M12 Validation',                -- client_label NOT NULL
    'v4',                            -- template_version NOT NULL
    p_fixture_payload->'dates',
    false,
    true,
    now()
  )
  ON CONFLICT (drive_file_id) DO UPDATE SET
    title = EXCLUDED.title,
    dates = EXCLUDED.dates,
    last_seen_modified_time = now()
  RETURNING id INTO v_show_id;

  -- 3. Per crew_member: UPSERT crew_members + crew_member_auth, collect alias→id.
  FOR v_crew_member IN SELECT * FROM jsonb_array_elements(p_fixture_payload->'crewMembers') LOOP
    v_crew_name := v_crew_member->>'name';
    v_crew_role_flags := ARRAY(SELECT jsonb_array_elements_text(v_crew_member->'roleFlags'));
    INSERT INTO public.crew_members (
      show_id, name, email, role, role_flags
    )
    VALUES (
      v_show_id,
      v_crew_name,
      lower(trim(v_crew_member->>'email')),          -- email canonicalized per CHECK constraint
      v_crew_member->>'displayRole',                  -- role NOT NULL — payload provides display string per fixture
      v_crew_role_flags
    )
    ON CONFLICT (show_id, name) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      role_flags = EXCLUDED.role_flags
    RETURNING id INTO v_crew_id;

    INSERT INTO public.crew_member_auth (show_id, crew_name, current_token_version, revoked_below_version)
      VALUES (v_show_id, v_crew_name, 1, 0)
      ON CONFLICT (show_id, crew_name) DO NOTHING;   -- preserve existing current_token_version per spec §3.3

    v_alias_map_slice := v_alias_map_slice || jsonb_build_object(v_crew_member->>'alias', v_crew_id);
  END LOOP;

  -- 4. UPSERT validation_state singleton: merge alias_map[combo] = slice; append combo to combos_materialized.
  INSERT INTO public.validation_state (
    key, last_seed_date, combos_materialized, alias_map, seeded_by, seeded_supabase_project_ref
  )
  VALUES (
    'validation_seed',
    current_date,
    ARRAY[p_combo],
    jsonb_build_object(p_combo, v_alias_map_slice),
    p_fixture_payload->>'seededBy',
    p_fixture_payload->>'seededProjectRef'
  )
  ON CONFLICT (key) DO UPDATE SET
    last_seed_date = current_date,
    combos_materialized = (SELECT array_agg(DISTINCT c) FROM unnest(public.validation_state.combos_materialized || ARRAY[p_combo]) c),
    alias_map = public.validation_state.alias_map || jsonb_build_object(p_combo, v_alias_map_slice),
    seeded_supabase_project_ref = EXCLUDED.seeded_supabase_project_ref;

  RETURN jsonb_build_object('show_id', v_show_id, 'alias_map_slice', v_alias_map_slice);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) TO service_role;
```

- [ ] **Step 4: Author the companion `validation_cleanup_atomic` RPC** (R2 amendment — explicit sketch + single-entry-point clarification: the `__cleanup__` pseudo-combo on `mint_validation_fixture_atomic` is RETRACTED; cleanup goes through this separate RPC):

```sql
-- supabase/migrations/<timestamp>_validation_cleanup_atomic.sql
-- Per spec §3.3 R22 + R23. Cleans validation-induced revoked_links rows AND
-- structurally resets every query-compromise alias's auth state. Per-show
-- advisory lock acquired for EACH affected show (one lock per validation show).
--
-- Validation-only predicate: revoked_links.revoked_reason LIKE 'validation:%'
-- OR (for the structural reset path) the row's (show_id, crew_name) matches
-- a query-compromise alias's identity AND the show is a validation show
-- (drive_file_id LIKE 'validation_%').

CREATE OR REPLACE FUNCTION public.validation_cleanup_atomic(
  p_validation_project_ref text  -- safety: aborts if mismatched
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_ref text;
  v_show record;
  v_qc_crew_name text;
  v_deleted_revoked_links int := 0;
  v_reset_auth int := 0;
BEGIN
  -- 0. Safety: confirm caller's project_ref matches what's stamped in validation_state.
  SELECT seeded_supabase_project_ref INTO v_state_ref FROM public.validation_state WHERE key = 'validation_seed';
  IF v_state_ref IS NULL OR v_state_ref <> p_validation_project_ref THEN
    RAISE EXCEPTION 'validation_cleanup_atomic: project_ref mismatch (expected %, got %)', v_state_ref, p_validation_project_ref;
  END IF;

  -- 1. For each validation show, hold its advisory lock + do the cleanup writes.
  FOR v_show IN
    SELECT id AS show_id, drive_file_id
    FROM public.shows
    WHERE drive_file_id LIKE 'validation\_%' ESCAPE '\'
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('show:' || v_show.drive_file_id));

    -- 1a. Validation-tagged revoked_links cleanup (spec §3.3 R22).
    WITH d AS (
      DELETE FROM public.revoked_links
      WHERE show_id = v_show.show_id
        AND revoked_reason LIKE 'validation:%'
      RETURNING 1
    )
    SELECT v_deleted_revoked_links + count(*) INTO v_deleted_revoked_links FROM d;

    -- 1b. Structural reset of query-compromise alias auth (spec §3.3 R23):
    --     For every alias_5a_lead_for_query_compromise crew_member in this show:
    --     DELETE all revoked_links rows for that (show_id, crew_name) regardless of revoked_reason
    --     AND bump current_token_version + 1 AND zero revoked_below_version.
    FOR v_qc_crew_name IN
      SELECT cm.name
      FROM public.crew_members cm
      WHERE cm.show_id = v_show.show_id
        AND cm.name LIKE '%_alias_5a_lead_for_query_compromise'
    LOOP
      DELETE FROM public.revoked_links
        WHERE show_id = v_show.show_id AND crew_name = v_qc_crew_name;
      UPDATE public.crew_member_auth
        SET current_token_version = current_token_version + 1,
            revoked_below_version = 0
        WHERE show_id = v_show.show_id AND crew_name = v_qc_crew_name;
      v_reset_auth := v_reset_auth + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_revoked_links', v_deleted_revoked_links,
    'reset_query_compromise_aliases', v_reset_auth
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validation_cleanup_atomic(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validation_cleanup_atomic(text) TO service_role;
```

The reseed script calls this RPC only for `--combo all` (NOT for single-combo reseed) since query-compromise reset would otherwise blow away the J3 leg's revocation mid-test.

- [ ] **Step 5: Confirm `mint_validation_fixture_atomic` does NOT handle a `__cleanup__` pseudo-combo** — that responsibility lives ONLY in `validation_cleanup_atomic`. (R2 amendment — removes the dual-entry-point ambiguity from R1's first draft.)

- [ ] **Step 5: Apply both migrations** to prod-equivalent Supabase. Re-run the failing test — expect PASS.

- [ ] **Step 6: Modify `scripts/validation-reseed.ts`** to call ONLY these RPCs (no direct PostgREST mutation of shows / crew_members / crew_member_auth). The script:
  - Loops over the requested combos in `FIXTURES`.
  - Computes per-fixture payload (showName, dates relative to today, crew_members array).
  - Calls `supabase.rpc("mint_validation_fixture_atomic", { p_combo, p_fixture_payload })` for each.
  - For `--combo all`: also calls `supabase.rpc("validation_cleanup_atomic", { /* args */ })`.

- [ ] **Step 7: Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`** (the canonical advisory-lock topology test per AGENTS.md invariant 2) to include the two new RPCs — proves only ONE lock-holder layer per hashkey.

- [ ] **Step 8: Verify {data, error} destructuring** at every Supabase call site (per AGENTS.md invariant 9).

- [ ] **Step 9: Run integration test — expect PASS.** Commit:

```bash
git add supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql supabase/migrations/<timestamp>_validation_cleanup_atomic.sql scripts/validation-reseed.ts tests/db/mint-validation-fixture-atomic.test.ts tests/scripts/validation-reseed-integration.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts
git commit -m "feat(validation): mint_validation_fixture_atomic + cleanup RPCs with per-show advisory lock

Per M12 spec invariant 2 + plan R1 P0 fix. All show/crew/crew_member_auth/
validation_state writes happen inside a single Postgres transaction
that holds pg_advisory_xact_lock(hashtext('show:' || drive_file_id)).
PostgREST direct writes can't span the lock; SECURITY DEFINER RPC is the
canonical pattern (matches mint_link_session_atomic + revoke_leaked_link
_atomic). Advisory-lock topology test extended."
```

- [ ] **Step 1: Write a failing integration test** at `tests/scripts/validation-reseed-integration.test.ts`. Requires VALIDATION_SUPABASE_* env vars. Runs `pnpm validation:reseed --combo R1` and asserts: 1 row in shows for R1, 11 in crew_members, 11 in crew_member_auth, validation_state row with `combos_materialized` containing 'R1', `alias_map.R1` containing all 11 alias keys.

- [ ] **Step 2: Run — expect FAIL** (no seed logic yet).

- [ ] **Step 3: Implement** the seed logic per the outline above. Use `@supabase/supabase-js` createClient with the service role key. All Supabase calls destructure `{ data, error }` per AGENTS.md invariant 9.

- [ ] **Step 4: Verify {data, error} destructuring pattern is used at every call site** by grepping after implementation:

```bash
grep -n "await supabase" scripts/validation-reseed.ts
```

Confirm every line uses `const { data, error } = await ...` and checks `error` before consuming `data`.

- [ ] **Step 5: Run integration test — expect PASS.**

- [ ] **Step 6: Commit:**

```bash
git add scripts/validation-reseed.ts tests/scripts/validation-reseed-integration.test.ts
git commit -m "feat(validation): implement reseed with per-show lock + alias_map UPSERT + R22/R23 cleanup"
```

---

### Task 0.C.5: Implement `validation-check-seed`

**Files:**
- Modify: `scripts/validation-check-seed.ts`

Per spec §3.3.2 singleton write semantics. 8 predicates (a-h):
- (a) `validation_state` row missing (zero rows for `key='validation_seed'`)
- (b) `last_seed_date != current_date`
- (c) `combos_materialized` doesn't cover the requested combo set
- (d) `seeded_supabase_project_ref != $VALIDATION_SUPABASE_PROJECT_REF`
- (e) `alias_map` doesn't satisfy the §3.3 storage predicate (11 entries per R-combo × 10 + 1 per SW × 6 = 116 leaves)
- (f) For any alias in alias_map, `crew_member_auth` is missing the matching `(show_id, crew_name)` row
- (g) Any `current_token_version` is unset/null
- (h) `revoked_links` has a row matching the baseline `alias_5a_lead`'s `(show_id, crew_name, current_token_version)` tagged `revoked_reason LIKE 'validation:%'`

- [ ] **Step 1: Write failing test:** check-seed returns exit 0 immediately after a fresh reseed; returns exit 1 if VALIDATION_SUPABASE_PROJECT_REF env var is set to a wrong value.

- [ ] **Step 2: Run — expect FAIL** (no implementation).

- [ ] **Step 3: Implement** all 8 predicates. Stdout on success: `OK: seed matches today (combos: R1,R2,...,SW-POST_SHOW)`. Stderr + exit 1 on failure: human-readable diagnostic naming the failed predicate.

- [ ] **Step 4: Run — expect PASS.** Commit:

```bash
git add scripts/validation-check-seed.ts tests/scripts/validation-check-seed.test.ts
git commit -m "feat(validation): implement check-seed with 8 predicates"
```

---

### Task 0.C.6: Implement `validation-resolve-alias`

**Files:**
- Modify: `scripts/validation-resolve-alias.ts`

Per spec §9.1.2. Positional args: `<combo> <alias>`. Reads `validation_state.alias_map[$combo][$alias]` and prints the UUID. Exits 0 with UUID on stdout; exits 1 with diagnostic if combo or alias missing.

- [ ] **Step 1: Write failing test** verifying happy path + two failure modes.
- [ ] **Step 2: Implement.** Simple jsonb lookup against `validation_state.alias_map`.
- [ ] **Step 3: Run — expect PASS.** Commit:

```bash
git add scripts/validation-resolve-alias.ts tests/scripts/validation-resolve-alias.test.ts
git commit -m "feat(validation): implement resolve-alias jsonb lookup"
```

---

### Task 0.C.7: End-to-end Phase 0.C verification

- [ ] **Step 1: Run** `pnpm validation:reseed --combo all` against prod-equivalent Supabase. Expect exit 0.
- [ ] **Step 2: Run** `pnpm validation:check-seed --combo all`. Expect exit 0 with "OK: seed matches today".
- [ ] **Step 3: Run** `pnpm validation:resolve-alias R7b alias_5a_lead` and `pnpm validation:resolve-alias SW-SHOW_LAST alias_5a_lead`. Expect a UUID for each.
- [ ] **Step 4: Verify in Supabase SQL editor:**

```sql
SELECT jsonb_object_keys(alias_map) FROM public.validation_state WHERE key = 'validation_seed';
-- Expect 16 keys (R1..R8b + 6 SW)
SELECT jsonb_object_keys(alias_map->'R1') FROM public.validation_state WHERE key = 'validation_seed';
-- Expect 11 keys
SELECT count(*) FROM public.crew_members WHERE email LIKE 'validation+%@example.com';
-- Expect 116
SELECT count(*) FROM public.crew_member_auth WHERE crew_name LIKE 'R%_alias_%' OR crew_name LIKE 'SW-%_alias_%';
-- Expect 116
```

- [ ] **Step 5: Smoke-test the localhost rejection:** `VALIDATION_SUPABASE_URL=http://127.0.0.1:54321 pnpm validation:check-seed`. Expect exit 1 with localhost-rejected diagnostic.
- [ ] **Step 6: Move to Phase 0.D** (`04-phase0-tooling-link.md`).

---

## Phase 0.C failure modes

- **Reseed fails with `LINK_VERSION_MISMATCH`-like errors during smoke 6 (Phase 0.F).** crew_member_auth seed not committing alongside crew_members — fix the UPSERT ordering.
- **Reseed succeeds but alias_map is empty.** The validation_state UPSERT path may be skipping the alias_map update. Check the jsonb merge SET clause.
- **Localhost rejection fires against real Supabase.** Regex for localhost is too broad; tighten per `scripts/lib/validation-target.ts`.
- **crew_members UPSERT fails on email canonicalization CHECK.** Master spec X.5 requires email canonicalization; `validation+5a@example.com` canonicalizes to `validation@example.com` (strip-plus). Either (a) sidestep with unique-without-plus emails like `validation-5a@example.com`, OR (b) accept the canonicalized form and use the alias for identity, not email. Decide before implementation.

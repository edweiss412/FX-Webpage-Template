# Phase 0.C — `validation:reseed` + `validation:check-seed` + `validation:resolve-alias`

> Per spec §3.3 + §3.3.2 + §9.0 task 0.C + §9.1.2 tooling reference. Estimate: 1–2 days.
>
> Goal: ship the three foundational validation-tooling CLIs. They write/read `validation_state`, materialize the 16 fixture combos (10 R + 6 SW) with **9 crew_members per R-combo** (the role-variant aliases from spec §3.2) and the **96-leaf alias_map jsonb**. Walks the canonical §9.1.2 contract. Picker-fixture eligibility uses `crew_members.email` + `auth_email_canonical` (no per-crew JWT versioning surface — that was retired at M11.5 G3 cutover). The `show_share_tokens` row is auto-created by the existing `shows_create_share_token_after_insert` trigger (per `supabase/migrations/20260523000002_show_share_tokens.sql`) when the reseed RPC inserts the show; no direct write to `show_share_tokens` is needed.

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

- [ ] **Step 3: Create the skeleton** `scripts/validation-reseed.ts` with `parseArgs` from `node:util`, printing the usage block on `--help`. Required env vars per spec §9.1.2: `VALIDATION_SUPABASE_URL`, `VALIDATION_SUPABASE_SECRET_KEY`, `VALIDATION_SUPABASE_PROJECT_REF`.

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

### Task 0.C.3: Define the fixture mapping table (16 combos × 9 role-variant crew_members)

**Files:**
- Create: `scripts/lib/validation-fixtures.ts`

Per spec §3.3 owned-fixture-mappings + §3.3.1 show-wide states. Define a typed `FIXTURES` array enumerating all 16 combos with `{combo, showName, dateRestriction, stageRestriction, datesRelative, expectedTodayState, crewMembers[]}`.

Each R-combo's `crewMembers` is built from the **9 role-variant aliases** per spec §3.2:

- `alias_5a_lead` — `["LEAD"]`
- `alias_5b_lead_a1` — `["LEAD","A1"]`
- `alias_5c_bo_lead` — `["BO","LEAD"]`
- `alias_6a_a1` — `["A1"]`
- `alias_6b_v1` — `["V1"]`
- `alias_6c_l1` — `["L1"]`
- `alias_6d_bo` — `["BO"]`
- `alias_6e_a1_l1` — `["A1","L1"]`
- `alias_6f_empty` — `[]`

Each SW-* combo's `crewMembers` has only `alias_5a_lead` (1 entry) per spec §3.3.1.

- [ ] **Step 1: Write a failing test** that validates the FIXTURES shape:
  - exactly 16 combos
  - 10 R-combos each have 9 crew_members; SW-* combos each have 1
  - total leaf aliases = 96 (10 × 9 + 6 × 1)
  - every R-combo's crew_members includes all 9 role-variant aliases listed above

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Populate `scripts/lib/validation-fixtures.ts` with all 16 entries.** Reference spec §3.3 R-combo table and §3.3.1 show-wide state table for the per-combo `dateRestriction` / `stageRestriction` / `datesRelative` shapes. Synthesize predictable emails: `validation+<combo>-<alias>@example.com`. Synthesize stable names: `<combo>_<alias>`.

  **R13 commit 30 amendment — combo R1's `alias_5a_lead.email` reads from env var.** Per spec §3.3 owned-fixture-mappings R13-amendment paragraph + spec §1.5 "solo-dev IS the validation": combo R1's `alias_5a_lead` row's `email` field is the special case — it reads from `process.env.VALIDATION_J3_CLAIM_EMAIL` at fixture-build time (the dev's real Google account email). All other aliases in R1, and `alias_5a_lead` in every other combo (R2–R8b + 6 SW-states), keep the synthesized `validation+<combo>-<alias>@example.com` format. The fixture-build code MUST abort with a clear diagnostic if `VALIDATION_J3_CLAIM_EMAIL` is unset OR matches any placeholder/dev-only reserved domain in the **canonical rejected set** (R15 commit 34 F14 amendment — RFC 2606 + RFC 6761 + project-conventional dev; see check-seed predicate (k) below for the canonical regex source) — the validation script reaches the abort BEFORE attempting to mint the RPC payload, so the dev gets a fast actionable error rather than an opaque OAuth failure during J3 walking. Pseudocode:

  ```ts
  // R15 commit 34 F14 canonical rejected domain set (RFC 2606 + RFC 6761 + mDNS):
  const REJECTED_DOMAIN_RX = /@(example\.com|example\.org|example\.net|[^@\s]+\.test|[^@\s]+\.invalid|localhost|[^@\s]+\.localhost|[^@\s]+\.local|dev\.local)$/i;

  const claimEmail = process.env.VALIDATION_J3_CLAIM_EMAIL;
  if (!claimEmail || REJECTED_DOMAIN_RX.test(claimEmail)) {
    throw new Error(
      "VALIDATION_J3_CLAIM_EMAIL must be set to your real Google account email — Google OAuth " +
      "cannot authenticate against placeholder/dev-only reserved domains (example.com/.org/.net " +
      "per RFC 2606; *.test/*.invalid/*.localhost/localhost per RFC 6761; *.local/dev.local per " +
      "mDNS RFC 6762 + project-conventional). See spec §3.3 step 5 R13-amendment paragraph + " +
      ".env.local.example. Got: " + (claimEmail ?? "<unset>")
    );
  }
  // For combo R1's alias_5a_lead only, override the synthesized email:
  const r1Alias5aEmail = canonicalize(claimEmail);  // canonicalize per AGENTS.md invariant 3
  ```

  The fixture-build test (TDD step 1 above) covers this path: missing env var → throw; any placeholder/dev-only domain from the canonical rejected set → throw; valid Google email → R1's alias_5a_lead.email === canonicalize($VALIDATION_J3_CLAIM_EMAIL).

- [ ] **Step 4: Run — expect PASS.** Commit:

```bash
git add scripts/lib/validation-fixtures.ts tests/scripts/validation-fixtures.test.ts
git commit -m "feat(validation): canonical fixture mapping — 16 combos × 9 = 96 aliases"
```

---

### Task 0.C.4: Author + apply `mint_validation_fixture_atomic` RPC (advisory-lock-held single transaction)

**Files:**
- Create: `supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql`
- Create: `supabase/migrations/<timestamp>_validation_finalize_all_atomic.sql`
- Create: `tests/db/mint-validation-fixture-atomic.test.ts`
- Create: `tests/db/validation-finalize-all-atomic.test.ts`

Per spec invariant 2 (per-show advisory lock). The reseed script cannot acquire the lock and then do writes through `@supabase/supabase-js` PostgREST — those writes wouldn't share the transaction with the lock. Per project pattern (`supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql`, `20260523000004_rotate_show_share_token.sql`), advisory-lock-protected mutations run inside a SECURITY DEFINER RPC.

- [ ] **Step 1: Write failing test** that confirms `mint_validation_fixture_atomic(combo, payload)` does NOT exist yet:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
describe("mint_validation_fixture_atomic RPC", () => {
  it("exists and writes show + crew_members + alias_map atomically", async () => {
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
  - Takes `(p_combo text, p_fixture_payload jsonb)` — payload contains showName, dates, date_restriction, stage_restriction, crew_members array, `validationTodayIso` (TZ-pinned UTC date), `seededBy`, `seededProjectRef`.
  - Synthesizes a stable `drive_file_id = 'validation_' || p_combo` deterministically.
  - Acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` BEFORE any mutation.
  - INSIDE THE SAME TRANSACTION: UPSERT shows (the `shows_create_share_token_after_insert` trigger auto-creates the `show_share_tokens` row on first insert; ON CONFLICT no-op for re-seeds preserves the existing share_token), UPSERT crew_members per payload, UPDATE `validation_state.alias_map[combo]` merge.
  - Returns `jsonb` with the alias_map slice it wrote + the show_id.

```sql
-- supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql
-- Per M12 spec invariant 2 (per-show advisory lock) + spec §3.3 picker-fixture
-- lockstep contract. SQL sketch verified against live schema
-- (supabase/migrations/20260501000000_initial_public_schema.sql + the M11.5
-- migrations adding show_share_tokens + claimed_via_oauth_at).
--
-- shows columns: drive_file_id NOT NULL UNIQUE, slug NOT NULL UNIQUE, title NOT NULL,
--   client_label NOT NULL, template_version NOT NULL, plus nullable jsonb fields +
--   the M11.5 picker_epoch columns.
-- crew_members columns: show_id NOT NULL, name NOT NULL, email (canonicalized),
--   role NOT NULL, role_flags NOT NULL DEFAULT '{}', date_restriction jsonb,
--   stage_restriction jsonb, claimed_via_oauth_at TIMESTAMPTZ NULL (M11.5).
-- show_share_tokens is auto-populated by the
--   shows_create_share_token_after_insert trigger — this RPC does NOT touch it.

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
  v_validation_today_iso text;
BEGIN
  -- 0. Validate TZ-pinned today (rejects extreme clock skew).
  v_validation_today_iso := p_fixture_payload->>'validationTodayIso';
  IF v_validation_today_iso IS NULL OR v_validation_today_iso !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'mint_validation_fixture_atomic: validationTodayIso required (YYYY-MM-DD), got %', v_validation_today_iso;
  END IF;
  -- R11 F9 repair: `date - date` returns INTEGER (day count) in PostgreSQL,
  -- NOT interval; `extract(epoch from integer)` is invalid (extract accepts
  -- timestamp/timestamptz/interval/date/time/timetz, not integer). Use integer
  -- day comparison directly.
  IF abs(v_validation_today_iso::date - current_date) > 1 THEN
    RAISE EXCEPTION 'mint_validation_fixture_atomic: validationTodayIso % differs from server current_date % by >1 day (extreme clock skew)', v_validation_today_iso, current_date;
  END IF;

  -- 1. Resolve drive_file_id (stable per-combo synthetic ID) and acquire advisory lock.
  v_drive_file_id := 'validation_' || p_combo;
  v_slug := 'validation-' || lower(replace(p_combo, '_', '-'));
  PERFORM pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- 2. UPSERT show with all NOT NULL columns populated. The shows_create_share_token_after_insert
  --    trigger (per supabase/migrations/20260523000002_show_share_tokens.sql) fires on INSERT
  --    and auto-creates the show_share_tokens row with a fresh 64-hex share_token; ON CONFLICT
  --    DO UPDATE bypasses the trigger so re-seeds preserve the existing share_token (the dev's
  --    bookmarked URL stays valid across --combo all re-runs).
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

  -- 2.5. R17 commit 39 F16 amendment — FULL-REPLACE SEMANTICS for crew_members.
  --      The spec contract (§3.3 picker-fixture lockstep + §3.3.2 "Singleton write
  --      semantics") says a `--combo all` reseed is full-replace: the resulting
  --      validation-show roster MUST equal the canonical fixture roster, with no
  --      stale rows surviving from earlier draft seeds, manual SQL probes, or
  --      previous fixture revisions that have since shrunk. Without this DELETE,
  --      the picker reads `crew_members` directly (via `loadShowCrew` /
  --      `resolve_show_by_slug_and_token`) and would surface stale aliases that
  --      are no longer enumerated in `alias_map`. The check-seed predicate (e)
  --      counts alias_map leaves (which the UPSERT loop below repopulates), so
  --      a stale crew_members row would slip past predicate (e); predicate (m)
  --      below catches the join discrepancy explicitly.
  --
  --      DELETE-before-UPSERT ordering: doing the DELETE BEFORE the UPSERT
  --      loop, all inside the same transaction (the SECURITY DEFINER RPC is
  --      atomic; the per-show advisory lock is held throughout), means the
  --      validation-show roster is never transiently empty as observed by any
  --      OTHER reader — concurrent picker reads either see the pre-RPC roster
  --      (lock-blocked until the RPC commits) or the post-RPC roster (after
  --      commit), never an in-progress empty state. The DELETE's predicate
  --      uses the incoming payload's (combo, alias) keep-list lifted from the
  --      alias_map structure: any crew_members row in the validation show
  --      whose alias is NOT in the incoming payload's `crewMembers[].alias`
  --      array is deleted.
  --
  --      The DELETE is keyed by `name` rather than by alias because
  --      `crew_members` does not carry an alias column — the alias→id mapping
  --      lives in `validation_state.alias_map`. The TypeScript fixture-build
  --      guarantees a 1:1 mapping between fixture alias and `crew_members.name`
  --      (see plan §0.C.3 fixture-build), so deleting `name NOT IN (payload
  --      crew names)` is equivalent to deleting `alias NOT IN (payload aliases)`.
  WITH keep AS (
    SELECT jsonb_array_elements(p_fixture_payload->'crewMembers')->>'name' AS keep_name
  )
  DELETE FROM public.crew_members
   WHERE show_id = v_show_id
     AND name NOT IN (SELECT keep_name FROM keep);

  -- 3. Per crew_member: UPSERT crew_members, collect alias→id.
  --    Email is already canonicalized by the TypeScript script via
  --    lib/email/canonicalize.ts BEFORE landing in the payload (AGENTS.md
  --    invariant 3: canonicalize.ts is the only function that touches raw
  --    emails). The CHECK constraint on crew_members.email acts as a safety
  --    net; mismatches raise an error rather than silently being re-canonicalized.
  FOR v_crew_member IN SELECT * FROM jsonb_array_elements(p_fixture_payload->'crewMembers') LOOP
    v_crew_name := v_crew_member->>'name';
    v_crew_role_flags := ARRAY(SELECT jsonb_array_elements_text(v_crew_member->'roleFlags'));

    -- R15 commit 34 F14 defense-in-depth (RPC-side): for combo R1's
    -- alias_5a_lead row specifically, reject any email whose domain
    -- matches the canonical placeholder/dev-only rejected set (RFC 2606
    -- + RFC 6761 + mDNS RFC 6762 + project-conventional). If the
    -- TypeScript fixture-build guard (Task 0.C.3) slipped or was
    -- bypassed, the RPC catches the bad config at the latest possible
    -- moment before the seed lands. Defense-in-depth alongside the
    -- TS-side abort + check-seed predicate (k). Canonical regex
    -- matches the predicate (k) source — keep both in sync (the
    -- structural defense at tests/cross-cutting/reseed-clears-oauth-
    -- claim-doc-guard.test.ts pins this discipline at CI time).
    IF p_combo = 'R1'
       AND v_crew_member->>'alias' = 'alias_5a_lead'
       AND v_crew_member->>'email' ~* '@(example\.com|example\.org|example\.net|[^@[:space:]]+\.test|[^@[:space:]]+\.invalid|localhost|[^@[:space:]]+\.localhost|[^@[:space:]]+\.local|dev\.local)$'
    THEN
      RAISE EXCEPTION 'mint_validation_fixture_atomic: R1.alias_5a_lead.email % matches a placeholder/dev-only reserved domain (RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-conventional) — set VALIDATION_J3_CLAIM_EMAIL to your real Google account email (see spec §3.3 step 5 R13-amendment paragraph + .env.local.example).', v_crew_member->>'email';
    END IF;

    INSERT INTO public.crew_members (
      show_id, name, email, role, role_flags, date_restriction, stage_restriction
    )
    VALUES (
      v_show_id,
      v_crew_name,
      v_crew_member->>'email',                       -- already canonicalized in TS
      -- Derive role (NOT NULL) from role_flags per master spec §6.6 compound-role convention
      -- (e.g. ["LEAD","A1"] → "LEAD / A1"; [] → "Validation Crew").
      CASE
        WHEN array_length(v_crew_role_flags, 1) IS NULL THEN 'Validation Crew'
        ELSE array_to_string(v_crew_role_flags, ' / ')
      END,
      v_crew_role_flags,
      v_crew_member->'dateRestriction',              -- jsonb {kind, days?} per master spec §6.6 + spec §3.3
      v_crew_member->'stageRestriction'              -- jsonb {kind, stages?} per master spec §6.6 + spec §3.3
    )
    ON CONFLICT (show_id, name) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      role_flags = EXCLUDED.role_flags,
      date_restriction = EXCLUDED.date_restriction,
      stage_restriction = EXCLUDED.stage_restriction,
      -- R13 commit 31 F11 repair: every reseed restores the baseline
      -- by setting claimed_via_oauth_at = NULL. Without this clause, a
      -- previous J3 leg (c) walk that stamped claimed_via_oauth_at via
      -- the live claim_oauth_identity RPC would leave the row marked
      -- claimed through every subsequent reseed (ON CONFLICT preserves
      -- the row by primary key; UPDATE without this clause does NOT
      -- touch claimed_via_oauth_at). check-seed predicate (l) verifies
      -- this discipline holds post-reseed. Per spec §3.3 picker-fixture
      -- lockstep contract R13 amendment.
      claimed_via_oauth_at = NULL
    RETURNING id INTO v_crew_id;

    -- R13 commit 31 amendment: the UPSERT SET clause above now explicitly
    -- resets claimed_via_oauth_at = NULL on every reseed. The previous
    -- "not part of v1; needs --reset-oauth-claims" framing was the F11
    -- finding source — J3 leg (c) stamping was sticky across reseeds,
    -- producing a poisoned baseline on every subsequent walk session.
    -- Subsequent --combo all reseeds now restore the bypass-pickable
    -- baseline automatically; no manual SQL or special flag required.

    v_alias_map_slice := v_alias_map_slice || jsonb_build_object(v_crew_member->>'alias', v_crew_id);
  END LOOP;

  -- 4. UPSERT validation_state singleton: merge alias_map[combo] = slice;
  --    stamp combos_seeded_dates[combo] = validationTodayIso (per-combo stamp;
  --    the top-level last_seed_date is owned by validation_finalize_all_atomic).
  INSERT INTO public.validation_state (
    key, last_seed_date, combos_materialized, combos_seeded_dates, alias_map,
    seeded_by, seeded_supabase_project_ref
  )
  VALUES (
    'validation_seed',
    v_validation_today_iso::date,           -- initial; overwritten by validation_finalize_all_atomic on full runs
    ARRAY[p_combo],
    jsonb_build_object(p_combo, v_validation_today_iso),
    jsonb_build_object(p_combo, v_alias_map_slice),
    p_fixture_payload->>'seededBy',
    p_fixture_payload->>'seededProjectRef'
  )
  ON CONFLICT (key) DO UPDATE SET
    -- last_seed_date is NOT updated here; validation_finalize_all_atomic owns it.
    combos_materialized = (SELECT array_agg(DISTINCT c) FROM unnest(public.validation_state.combos_materialized || ARRAY[p_combo]) c),
    combos_seeded_dates = public.validation_state.combos_seeded_dates || jsonb_build_object(p_combo, v_validation_today_iso),
    alias_map = public.validation_state.alias_map || jsonb_build_object(p_combo, v_alias_map_slice),
    seeded_supabase_project_ref = EXCLUDED.seeded_supabase_project_ref;

  RETURN jsonb_build_object('show_id', v_show_id, 'alias_map_slice', v_alias_map_slice);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) TO service_role;
```

- [ ] **Step 4: Author the companion `validation_finalize_all_atomic` RPC** — promotes the top-level `last_seed_date` ONLY after every requested combo's per-combo seeded date matches today's pinned UTC date. Without this finalizer, a partial `--combo all` (some combos succeed, some fail) leaves combos_seeded_dates correct per-combo but last_seed_date could remain stale or be misleadingly set.

```sql
-- supabase/migrations/<timestamp>_validation_finalize_all_atomic.sql

CREATE OR REPLACE FUNCTION public.validation_finalize_all_atomic(
  p_required_combos text[],
  p_validation_today_iso text   -- TZ-pinned UTC date passed in from the script
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combo text;
  v_combo_date text;
  v_missing text[] := ARRAY[]::text[];
  v_stale text[]   := ARRAY[]::text[];
  v_combos_dates jsonb;
BEGIN
  -- Validate p_validation_today_iso shape + within ±1 day of server current_date.
  IF p_validation_today_iso IS NULL OR p_validation_today_iso !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: p_validation_today_iso required (YYYY-MM-DD), got %', p_validation_today_iso;
  END IF;
  -- R11 F9 repair: `date - date` returns INTEGER (day count) in PostgreSQL,
  -- NOT interval; `extract(epoch from integer)` is invalid. Use integer day
  -- comparison directly. Same fix as mint RPC (single class).
  IF abs(p_validation_today_iso::date - current_date) > 1 THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: p_validation_today_iso % differs from server current_date % by >1 day', p_validation_today_iso, current_date;
  END IF;

  SELECT combos_seeded_dates INTO v_combos_dates FROM public.validation_state WHERE key = 'validation_seed';
  IF v_combos_dates IS NULL THEN
    RAISE EXCEPTION 'validation_state.combos_seeded_dates not initialized — run mint_validation_fixture_atomic first';
  END IF;

  FOREACH v_combo IN ARRAY p_required_combos LOOP
    v_combo_date := v_combos_dates->>v_combo;
    IF v_combo_date IS NULL THEN
      v_missing := array_append(v_missing, v_combo);
    ELSIF v_combo_date <> p_validation_today_iso THEN
      v_stale := array_append(v_stale, v_combo || ':' || v_combo_date);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL OR array_length(v_stale, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: incomplete reseed (missing: %, stale: %)', v_missing, v_stale;
  END IF;

  -- All requested combos seeded today; safe to stamp top-level last_seed_date.
  UPDATE public.validation_state
    SET last_seed_date = p_validation_today_iso::date
    WHERE key = 'validation_seed';

  RETURN jsonb_build_object('finalized_combos', p_required_combos, 'last_seed_date', p_validation_today_iso);
END;
$$;

REVOKE ALL ON FUNCTION public.validation_finalize_all_atomic(text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validation_finalize_all_atomic(text[], text) TO service_role;
```

- [ ] **Step 5: Apply both migrations** to prod-equivalent Supabase. Re-run the failing tests — expect PASS.

- [ ] **Step 6: Modify `scripts/validation-reseed.ts`** to call ONLY these RPCs (no direct PostgREST mutation of shows / crew_members). The script:
  - Computes one canonical `validationTodayIso = new Date().toISOString().slice(0, 10)` value and includes it in every per-combo payload.
  - Loops over the requested combos in `FIXTURES`.
  - For each, builds a per-fixture payload (showName, dates relative to today, crew_members array with canonicalized emails).
  - Calls `supabase.rpc("mint_validation_fixture_atomic", { p_combo, p_fixture_payload })` for each.
  - For `--combo all`: after every per-combo mint succeeds, calls `supabase.rpc("validation_finalize_all_atomic", { p_required_combos: <all 16>, p_validation_today_iso })` to promote `last_seed_date`. If any per-combo mint fails, the finalizer is NOT called → `last_seed_date` stays at its prior value → check-seed predicate (i) catches the partial seed.

**Email canonicalization in TS (AGENTS.md invariant 3):** The reseed script MUST canonicalize fixture emails via `lib/email/canonicalize.ts` BEFORE building the RPC payload. The RPC writes the supplied canonical value as-is; never use `lower(trim(...))` in SQL (that would create a new canonicalization boundary outside the registered helper). Example:

```ts
import { canonicalize } from "@/lib/email/canonicalize";   // live helper is `canonicalize`

const crewMembers = fixture.crewMembers.map((c) => {
  const canonicalEmail = canonicalize(c.email);
  if (canonicalEmail === null) {
    throw new Error(`Fixture crew_member ${c.alias} has invalid email: ${c.email}`);
  }
  return {
    alias: c.alias,
    name: c.name,
    email: canonicalEmail,                            // ← canonicalize HERE, not in SQL
    roleFlags: c.roleFlags,
    dateRestriction: fixture.dateRestriction,         // jsonb, passed through to RPC
    stageRestriction: fixture.stageRestriction,       // jsonb, passed through to RPC
  };
});

const validationTodayIso = new Date().toISOString().slice(0, 10);
const payload = { ...fixtureBody, validationTodayIso };
await supabase.rpc("mint_validation_fixture_atomic", { p_combo, p_fixture_payload: payload });
```

- [ ] **Step 7: Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`** (the canonical advisory-lock topology test per AGENTS.md invariant 2) to include the two new RPCs — proves only ONE lock-holder layer per hashkey.

- [ ] **Step 8: Verify {data, error} destructuring** at every Supabase call site (per AGENTS.md invariant 9).

- [ ] **Step 9: Run integration tests — expect PASS.** Commit:

```bash
git add \
  supabase/migrations/<timestamp>_mint_validation_fixture_atomic.sql \
  supabase/migrations/<timestamp>_validation_finalize_all_atomic.sql \
  scripts/validation-reseed.ts \
  tests/db/mint-validation-fixture-atomic.test.ts \
  tests/db/validation-finalize-all-atomic.test.ts \
  tests/scripts/validation-reseed-integration.test.ts \
  tests/auth/advisoryLockRpcDeadlock.test.ts
git commit -m "$(cat <<'COMMIT_EOF'
feat(validation): two atomic RPCs + reseed script (advisory-lock + per-combo seeded_dates + TZ-pinned today)

Per M12 spec invariant 2 + spec §3.3 picker-fixture lockstep. ALL show/crew/
validation_state writes go through SECURITY DEFINER RPCs that hold the
per-show advisory lock. Two RPCs:
- mint_validation_fixture_atomic(p_combo, p_fixture_payload): per-combo
  UPSERT of shows + crew_members + validation_state.alias_map slice;
  includes date_restriction + stage_restriction columns from payload;
  show_share_tokens row auto-created by the existing
  shows_create_share_token_after_insert trigger on first INSERT;
  ON CONFLICT preserves existing share_token across re-seeds.
- validation_finalize_all_atomic(p_required_combos, p_today_iso):
  promotes last_seed_date ONLY after every required combo's seeded date
  matches validationTodayIso. Prevents partial --combo all from
  falsifying the check-seed gate.

Reseed script canonicalizes emails via lib/email/canonicalize.ts BEFORE
RPC call (AGENTS.md invariant 3). validationTodayIso is the canonical
'today' value passed to all RPCs (TZ-pinned UTC YYYY-MM-DD, prevents
Postgres-vs-script TZ skew + UTC-midnight crossing race).

Failing-first tests cover: restriction column persistence, partial-reseed
detection via predicate (i), advisory-lock topology meta-test extension.
COMMIT_EOF
)"
```

---

### Task 0.C.5: Implement `validation-check-seed`

**Files:**
- Modify: `scripts/validation-check-seed.ts`

Per spec §3.3.2 singleton write semantics. **10 predicates (a-g, i, k, l, m)** — the picker-fixture lockstep is simpler than the pre-M11.5 contract (no per-crew JWT versioning + no revoked-link table to police); R13 commit 30 adds predicate (k); R13 commit 31 adds predicate (l); R17 commit 39 adds predicate (m):

- (a) `validation_state` row missing (zero rows for `key='validation_seed'`)
- (b) `last_seed_date != $VALIDATION_TODAY_ISO` (where `$VALIDATION_TODAY_ISO` is the canonical UTC YYYY-MM-DD value the script computes, NOT Postgres `current_date`)
- (c) `combos_materialized` doesn't cover the requested combo set
- (d) `seeded_supabase_project_ref != $VALIDATION_SUPABASE_PROJECT_REF`
- (e) `alias_map` doesn't satisfy the §3.3 storage predicate (cross-references §3.3's canonical count — currently 9 entries per R-combo × 10 + 1 per SW × 6 = 96 leaves)
- (f) For any alias in `alias_map`, `crew_members` is missing the matching `(show_id, name)` row OR has `email IS NULL` OR has the row but the show is archived
- (g) For any seeded show, `show_share_tokens` is missing the matching `show_id` row (sentinel for "the shows_create_share_token_after_insert trigger fired correctly")
- (i) For ANY combo in the requested set, `combos_seeded_dates[combo] != $VALIDATION_TODAY_ISO`. Catches the partial-`--combo all` failure mode where some combos succeeded on day X and others stamped day Y (UTC midnight crossed mid-run). check-seed accepts the date as an env var or CLI flag; defaults to `new Date().toISOString().slice(0, 10)`.
- **(k) (R13 commit 30 amendment — J3-claim-email guard; R15 commit 34 — canonical domain set extension per F14 finding)** `VALIDATION_J3_CLAIM_EMAIL` is unset OR matches any placeholder/dev-only reserved domain in the canonical rejected set, OR combo R1's `alias_5a_lead` row in `crew_members` has an `email` value matching the canonical rejected set (i.e., a previous run with a bad env var landed a placeholder email in the DB). **Canonical rejected domain set** (RFC 2606 + RFC 6761 + project-conventional dev): `@example.com`, `@example.org`, `@example.net` (RFC 2606); `*.test`, `*.invalid`, `*.localhost`, bare `localhost` (RFC 6761); `*.local`, `dev.local` (mDNS RFC 6762 + project-conventional). The regex shape (TS + SQL POSIX):
  ```
  /@(example\.com|example\.org|example\.net|[^@\s]+\.test|[^@\s]+\.invalid|localhost|[^@\s]+\.localhost|[^@\s]+\.local|dev\.local)$/i
  ```
  Diagnostic: "VALIDATION_J3_CLAIM_EMAIL is unset or matches a placeholder/dev-only reserved domain (canonical set: example.com/.org/.net per RFC 2606; *.test/*.invalid/*.localhost/localhost per RFC 6761; *.local/dev.local per mDNS RFC 6762 + project-conventional) — J3 leg (c) unwalkable (Google OAuth cannot authenticate against any of these). Set VALIDATION_J3_CLAIM_EMAIL to your real Google account email per spec §3.3 step 5 R13-amendment paragraph."
- **(l) (R13 commit 31 amendment — baseline-claim guard)** For any baseline picker alias (every alias in `alias_map` per spec §3.2 / §3.3 inventory), `crew_members.claimed_via_oauth_at IS NOT NULL` after a fresh `--combo all` reseed. Catches the F11-class failure mode where the mint RPC's UPSERT `SET` clause drifts (e.g., a future amendment drops the `claimed_via_oauth_at = NULL` line) and a previous J3 leg (c) walk's claim stamp persists across reseed, leaving the LEAD picker row OAuth-disabled. Diagnostic: "crew_members row for <combo>.<alias> has claimed_via_oauth_at = <timestamp> after reseed — mint RPC SET clause missing `claimed_via_oauth_at = NULL`; re-check the migration body against the R13 commit 31 contract."
- **(m) (R17 commit 39 amendment — full-replace orphan guard for F16 finding; R19 commit 42 F18 case-normalization fix)** For every seeded validation show, the DISTINCT `(combo, alias)` identity set materialized as `crew_members` rows for that show MUST equal the canonical fixture identity set enumerated in `validation_state.alias_map[combo]` for the same combo. **Canonical case for `drive_file_id` is UPPERCASE combo enum verbatim** — the mint RPC writes `v_drive_file_id := 'validation_' || p_combo` at Step 2 above with no `lower()` coercion, so combo enum values `R1`/`R7b`/`SW-POST_SHOW` produce `validation_R1`/`validation_R7b`/`validation_SW-POST_SHOW` respectively. Concretely: for each combo C in `validation_state.combos_materialized`, `SELECT count(*) FROM crew_members cm WHERE cm.show_id = (SELECT id FROM shows WHERE drive_file_id = 'validation_' || C)` MUST equal `jsonb_object_keys_count(validation_state.alias_map[C])`, AND every `crew_members.name` for that show MUST appear as a `name` field in the canonical fixture body for combo C (after the TS-side fixture-build computes it). Catches the F16-class failure mode where the mint RPC's UPSERT pattern lands new aliases but never DELETEs stale ones from prior fixture revisions or manual SQL probes — the picker (which reads `crew_members` directly, NOT `alias_map`) would surface orphan rows that aren't in the canonical fixture, expanding the test surface beyond the canonical 96-leaf scope and potentially exercising identities outside the validation spec. Diagnostic: "validation show <C> has orphan crew_members row(s) <names> not enumerated in validation_state.alias_map[<C>] — mint_validation_fixture_atomic full-replace DELETE-before-UPSERT did not fire OR a manual write landed a stale row; re-run `pnpm validation:reseed --combo <C>` to clear." **R19 commit 42 amendment:** the R17 commit 39 prose used `'validation_' || lower(C)` which mis-aligned with the mint RPC's actual `'validation_' || p_combo` formula (no lowercase coercion); a correct R1 reseed wrote `validation_R1` while predicate (m) and the regression test resolved via `validation_r1`, leaving the predicate's `show_id` lookup NULL and the orphan-INSERT regression INSERTing against NULL `show_id`. R19 normalizes to UPPER everywhere (mint RPC write + predicate (m) read + regression test snippets).

- [ ] **Step 1: Write failing test:** check-seed returns exit 0 immediately after a fresh `--combo all` reseed; returns exit 1 if `VALIDATION_SUPABASE_PROJECT_REF` env var is set to a wrong value; returns exit 1 if a `show_share_tokens` row is manually deleted for one of the seeded shows (predicate g); returns exit 1 if `VALIDATION_J3_CLAIM_EMAIL` is unset OR matches a placeholder reserved domain (predicate k, per R13 commit 30); returns exit 1 if combo R1's alias_5a_lead row in `crew_members` has a placeholder email (predicate k DB-side check); returns exit 1 if ANY baseline picker alias has `claimed_via_oauth_at IS NOT NULL` post-reseed (predicate l, per R13 commit 31 — test this by manually `UPDATE public.crew_members SET claimed_via_oauth_at = now() WHERE ...` then re-running check-seed); returns exit 1 if a manually-INSERTed stale `crew_members` row exists for a seeded validation show whose `name` is not enumerated in `validation_state.alias_map[combo]` (predicate m, per R17 commit 39 + R19 commit 42 F18 case-normalization fix — test this by manually `INSERT INTO public.crew_members (show_id, name, role, ...) VALUES ((SELECT id FROM shows WHERE drive_file_id='validation_R1'), 'orphan_stale_lead', 'LEAD', ...)` — note **UPPERCASE** `R1` matches the mint RPC's `'validation_' || p_combo` formula at Step 2 above — then re-running check-seed; the predicate (m) DIAG should name the orphan row). Additionally: a `pnpm validation:reseed --combo R1` immediately followed by `pnpm validation:check-seed --combo R1` MUST resolve a non-null R1 show_id via predicate (m)'s `'validation_' || C` lookup and PASS — this exercises the F18 case-normalization round-trip end-to-end (mint writes `validation_R1`; check-seed predicate (m) reads `'validation_' || 'R1'`; the two must match).

- [ ] **Step 2: Run — expect FAIL** (no implementation).

- [ ] **Step 3: Implement** all 10 predicates (a-g, i, k, l, m). Stdout on success: `OK: seed matches today (combos: R1,R2,...,SW-POST_SHOW)`. Stderr + exit 1 on failure: human-readable diagnostic naming the failed predicate.

- [ ] **Step 4: Run — expect PASS.** Commit:

```bash
git add scripts/validation-check-seed.ts tests/scripts/validation-check-seed.test.ts
git commit -m "feat(validation): implement check-seed with 10 picker-fixture predicates (a-g, i, k, l, m incl R17 full-replace orphan guard)"
```

- [ ] **Step 5: Add the F16 full-replace regression test** at `tests/db/mint-validation-fixture-atomic-full-replace.test.ts` (or extend the mint-RPC integration test authored in Task 0.C.4 Step 9). The test exercises the F16 contract end-to-end against the prod-equivalent Supabase target:

  1. Run `pnpm validation:reseed --combo R1` (mint baseline R1 fixture). Assert exit 0; assert `pnpm validation:check-seed --combo R1` exit 0.
  2. Via service-role psql / supabase-js, INSERT an orphan crew_members row into the R1 validation show: `INSERT INTO public.crew_members (show_id, name, email, role, role_flags, date_restriction, stage_restriction) VALUES ((SELECT id FROM shows WHERE drive_file_id='validation_R1'), 'orphan_stale_lead', 'orphan@example.test', 'LEAD', ARRAY['LEAD']::text[], '{"kind":"all_days"}'::jsonb, '{"kind":"all_stages"}'::jsonb)` — **UPPERCASE `R1` per R19 commit 42 F18 case-normalization fix** (the mint RPC writes `'validation_' || p_combo` verbatim with no lowercase coercion; a lowercase `validation_r1` lookup resolves to NULL `show_id` and the orphan would be INSERTed against NULL, falsifying the regression).
  3. Run `pnpm validation:check-seed --combo R1`. Expected: exit 1, predicate (m) diagnostic naming `orphan_stale_lead`.
  4. Run `pnpm validation:reseed --combo R1` (re-mint).
  5. Assert: (a) the orphan row is gone — `SELECT count(*) FROM crew_members WHERE show_id=(SELECT id FROM shows WHERE drive_file_id='validation_R1') AND name='orphan_stale_lead'` returns 0; (b) check-seed predicate (m) now passes — `pnpm validation:check-seed --combo R1` exits 0; (c) the canonical fixture roster is intact — every alias in `validation_state.alias_map['R1']` resolves to a `crew_members` row for the R1 show. This proves the DELETE-before-UPSERT ordering at the mint RPC body's section 2.5 fires correctly AND that no canonical fixture row is accidentally swept by the DELETE's keep-list construction. **Concrete failure mode the test catches:** the mint RPC's section 2.5 DELETE block is omitted, malformed, or scoped wrong (e.g., wrong show_id JOIN, wrong column comparison) → orphan row survives reseed → picker continues to surface it → walk session can exercise a non-canonical identity. The test's invariant is "the validation-show roster after a reseed contains EXACTLY the canonical fixture aliases" — derived from the fixture body's `crewMembers[].name` array length, not hardcoded. Commit alongside the mint RPC integration test.

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
-- Expect 9 keys (the role-variant aliases)

-- R15 commit 33 F13 repair: the pre-R15 query was
--   SELECT count(*) FROM public.crew_members WHERE email LIKE 'validation+%@example.com';
--   -- Expect 96
-- That asserted 96 example.com emails, but R13 commit 30 F10 repair
-- parameterized combo R1's alias_5a_lead.email = VALIDATION_J3_CLAIM_EMAIL
-- (a real Google email, NOT example.com). A correct post-F10 seed
-- has 95 synthesized example.com rows + 1 real Google email = 96 total;
-- the original LIKE pattern only matches 95. Three replacement queries
-- assert the post-F10 split correctly:

-- (a) Total seeded rows via alias_map/crew_members join = 96.
--     Walks the alias_map jsonb structurally (combo → alias → uuid)
--     and counts distinct crew_members rows reachable from any leaf.
--     Operand types: jsonb_each yields (text, jsonb); jsonb_each_text
--     yields (text, text); ::uuid cast valid on the leaf text value.
WITH alias_rows AS (
  SELECT (alias_entry.value)::uuid AS crew_member_id
    FROM public.validation_state v,
         LATERAL jsonb_each(v.alias_map)             AS combo_entry(combo_key, combo_obj),
         LATERAL jsonb_each_text(combo_entry.combo_obj) AS alias_entry(alias_key, value)
   WHERE v.key = 'validation_seed'
)
SELECT count(DISTINCT cm.id)
  FROM public.crew_members cm
  JOIN alias_rows a ON a.crew_member_id = cm.id;
-- Expect 96 (matches alias_map leaf count per spec §3.3 — 10 R-combos × 9 + 6 SW × 1).

-- (b) Synthesized example.com rows = 95 (= 96 total − 1 R1.alias_5a_lead
--     which carries VALIDATION_J3_CLAIM_EMAIL per R13 commit 30 F10 repair).
SELECT count(*) FROM public.crew_members
 WHERE email LIKE 'validation+%@example.com';
-- Expect 95 (post-R13 F10 split: every alias EXCEPT R1.alias_5a_lead uses the synthesized example.com format).

-- (c) R1.alias_5a_lead.email = canonicalize($VALIDATION_J3_CLAIM_EMAIL).
--     The one row that does NOT match the example.com LIKE — it carries
--     the dev's real Google account email (canonicalized per AGENTS.md
--     invariant 3).
SELECT cm.email
  FROM public.crew_members cm
  JOIN public.validation_state v ON v.key = 'validation_seed'
 WHERE cm.id = (v.alias_map->'R1'->>'alias_5a_lead')::uuid;
-- Expect the canonicalized form of $VALIDATION_J3_CLAIM_EMAIL — NOT a
-- validation+...@example.com placeholder. If this returns a placeholder
-- email, check-seed predicate (k) should have caught the bad config
-- earlier; re-check VALIDATION_J3_CLAIM_EMAIL in Vercel Production scope.

SELECT count(*) FROM public.show_share_tokens t
  JOIN public.shows s ON s.id = t.show_id
  WHERE s.drive_file_id LIKE 'validation\_%' ESCAPE '\';
-- Expect 16 (one share_token per validation show — proves the auto-create trigger fired)
```

- [ ] **Step 5: Smoke-test the localhost rejection:** `VALIDATION_SUPABASE_URL=http://127.0.0.1:54321 pnpm validation:check-seed`. Expect exit 1 with localhost-rejected diagnostic.
- [ ] **Step 6: Move to Task 0.C.8** (the two deferred structural defenses, then Phase 0.E).

---

### Task 0.C.8: Author `tests/cross-cutting/validation-tooling-tz-pin.test.ts` (R5 structural defense, deferred per `DEFERRED.md` `M12-PHASE0C-TZ-PIN-METATEST`)

Closes the R5 phantom-structural-defense citation (round 2 same-vector recurrence per R12 F12 / R13 commit 29 audit). The R5 amendment narrative declared this meta-test landed; R11 audit verified the file did not exist; R13 schedules it as a concrete task whose RED phase is now achievable because Tasks 0.C.1–0.C.6 just authored the `scripts/validation-*.ts` surface and the related `.sql` migrations that the meta-test audits.

**Files:**
- Create: `tests/cross-cutting/validation-tooling-tz-pin.test.ts`

**Authoring contract (from `DEFERRED.md M12-PHASE0C-TZ-PIN-METATEST`):** grep every `.sql` migration that lands in this Phase 0.C (`supabase/migrations/*mint_validation_fixture_atomic.sql` + `*validation_finalize_all_atomic.sql` + any other Phase-0.C-authored migration) AND every `.ts` script in `scripts/validation-*.ts` for the lowercase string `current_date`. Each match MUST be either (a) inside the bounded-skew sanity check (`abs(DATE_TEXT::date - current_date) > 1` — integer day comparison; the R5 narrative cited `abs(extract(epoch from ...::date - current_date)) > 86400` but that's invalid SQL — `date - date` returns INTEGER not interval; corrected per R11 F9 fix above in this file), OR (b) carry an inline `// not-validation-today-iso: <reason>` / `-- not-validation-today-iso: <reason>` waiver comment. Default: "TZ-pinned `validationTodayIso` wins; `current_date` is for skew-check only."

- [ ] **Step 1: Write failing test (RED).** The test scans every `.sql` file matching `supabase/migrations/*validation*.sql` AND every `.ts` file matching `scripts/validation-*.ts`. For each `current_date` match outside the bounded-skew block or the explicit waiver comment, report a violation. Expect at least one violation initially if any script pattern slipped — confirms the audit is finding real-shaped matches. If zero violations, intentionally inject a `select current_date from public.validation_state` test fixture into a `.ts.fixture` file (mirroring `tests/cross-cutting/fixtures/email-canonicalization/` shape) and assert that fixture-injected `current_date` triggers a violation.

- [ ] **Step 2: Run — expect FAIL** (the audit either finds a real violation OR the test framework catches the fixture-injected one).

- [ ] **Step 3: Implement** the meta-test along the pattern of `tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts` (R8 structural defense): readdirSync the scan roots, readFileSync each, regex for `current_date`, check against the acceptable-context regexes, report findings with `file:line:context` for each violation. Use `String.prototype.match` for the per-match iteration (the equivalent `RegExp` iterator method triggers the project's security-reminder hook on a substring match; prefer `match` with the `/g` flag).

- [ ] **Step 4: Run — expect PASS** (assuming the live `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` RPCs use the corrected `abs(...::date - current_date) > 1` pattern per R11 F9 fix, both inline `current_date` mentions fall inside the acceptable bounded-skew check).

- [ ] **Step 5: Commit:**

```bash
git add tests/cross-cutting/validation-tooling-tz-pin.test.ts \
        tests/cross-cutting/fixtures/validation-tooling-tz-pin/   # if fixtures added
git commit -m "$(cat <<'COMMIT_EOF'
test(cross-cutting): validation-tooling-tz-pin meta-test (M12-PHASE0C-TZ-PIN-METATEST)

Closes DEFERRED.md entry M12-PHASE0C-TZ-PIN-METATEST + R13 commit 29
phantom-structural-defense audit. The R5 pre-rebase plan amendment
narrative declared this meta-test landed as a structural defense for
the live-code-fidelity / TZ-pin vector; R11 audit (2026-05-26) verified
the file did not exist; R13 commit 29 rescheduled it as Task 0.C.8.
Now authoring.

Greps every Phase-0.C-authored .sql migration + scripts/validation-*.ts
for the lowercase string current_date. Each match must be either in
the bounded-skew sanity check (abs(DATE_TEXT::date - current_date) > 1)
or carry an inline waiver comment. Default: TZ-pinned validationTodayIso
wins; current_date is for skew-check only. Catches future drift where a
plan amendment slips a current_date back into a seed/finalize path.
COMMIT_EOF
)"
```

- [ ] **Step 6: Mark `DEFERRED.md M12-PHASE0C-TZ-PIN-METATEST` as `**RESOLVED <SHA>**`.**

---

### Task 0.C.9: Extend `tests/cross-cutting/email-canonicalization.test.ts` to audit `scripts/validation-*.ts` (R5 structural defense, deferred per `DEFERRED.md` `M12-PHASE0C-EMAIL-CANON-EXT`)

Closes the R5 phantom-structural-defense citation peer (round 2 same-vector recurrence per R12 F12 / R13 commit 29 audit). The R5 amendment narrative declared this extension landed; R11 audit verified `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` walks `lib/parser`, `lib/sync`, `lib/reports`, `lib/auth`, `lib/data`, `lib/adminAlerts`, `app/api/admin` — `scripts/validation-*.ts` is absent.

**Files:**
- Modify: `lib/audit/emailCanonicalization.ts` — extend `auditLiveEmailCanonicalization()`'s source-path collection to include `scripts/validation-*.ts` files.
- Modify: `tests/cross-cutting/email-canonicalization.test.ts` — add a new test that asserts the live audit walks `scripts/validation` (path coverage probe).
- Create: `tests/cross-cutting/fixtures/email-canonicalization/bad-validation-script-raw-email.ts.fixture` + `good-validation-script-canonicalized.ts.fixture` (mirror the existing bad/good fixture pair pattern).

**Authoring contract (from `DEFERRED.md M12-PHASE0C-EMAIL-CANON-EXT`):** flag any `lower(...)` / `trim(...)` not adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts` in `scripts/validation-*.ts`. Reseed script canonicalizes BEFORE the RPC write (AGENTS.md invariant 3); validation-tooling MUST not introduce inline SQL/TS normalization that bypasses the registered canonicalize helper.

- [ ] **Step 1: Write failing test (RED).** Add bad-fixture: `scripts/validation-foo.ts.fixture` containing `const email = rawEmail.toLowerCase().trim()` without an import of `canonicalize`. Assert `auditEmailCanonicalizationSources([badFixture])` returns a `raw_email_assignment` or equivalent finding for the validation surface. Without the live audit extension, this fixture is not walked; the test fails because no finding is produced.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Extend `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705`:

```ts
export function auditLiveEmailCanonicalization(): string[] {
  const sourcePaths = [
    ...walkSourceFiles(["lib/parser"]),
    ...walkSourceFiles(["lib/sync", "lib/reports", "lib/auth", "lib/data", "lib/adminAlerts"]),
    ...walkSourceFiles(["app/api/admin"]),
    ...walkSourceFiles(["scripts"]).filter((p) => /\/validation-[\w-]+\.ts$/.test(p)),  // R5 deferred / Phase 0.C Task 0.C.9
  ];
  // ...
}
```

(Exact mechanism per the live `walkSourceFiles` API; the filter restricts to `scripts/validation-*.ts` to avoid scanning the broader scripts/ directory.)

- [ ] **Step 4: Run — expect PASS** (bad-fixture now flagged; good-fixture which imports `canonicalize` cleanly passes).

- [ ] **Step 5: Commit:**

```bash
git add lib/audit/emailCanonicalization.ts \
        tests/cross-cutting/email-canonicalization.test.ts \
        tests/cross-cutting/fixtures/email-canonicalization/bad-validation-script-raw-email.ts.fixture \
        tests/cross-cutting/fixtures/email-canonicalization/good-validation-script-canonicalized.ts.fixture
git commit -m "$(cat <<'COMMIT_EOF'
test(cross-cutting): extend email-canonicalization audit to scripts/validation-*.ts (M12-PHASE0C-EMAIL-CANON-EXT)

Closes DEFERRED.md entry M12-PHASE0C-EMAIL-CANON-EXT + R13 commit 29
phantom-structural-defense audit peer. R5 amendment narrative declared
this extension landed; R11 audit verified the audit infrastructure
did not include scripts/validation-*.ts in its walk roots. R13 commit
29 rescheduled as Task 0.C.9. Now authoring.

Extends auditLiveEmailCanonicalization()'s source-path collection to
include scripts/validation-*.ts files. Flags any lower(...)/trim(...)
not adjacent to a canonicalize() call from lib/email/canonicalize.ts.
Validation tooling MUST canonicalize via lib/email/canonicalize.ts
before RPC write (AGENTS.md invariant 3); this extension structurally
enforces it for the validation-script boundary.
COMMIT_EOF
)"
```

- [ ] **Step 6: Mark `DEFERRED.md M12-PHASE0C-EMAIL-CANON-EXT` as `**RESOLVED <SHA>**`.**

- [ ] **Step 7: Move to Phase 0.E** (`04-phase0-tooling-report.md`).

---

## Phase 0.C failure modes

- **Reseed succeeds but alias_map is empty.** The validation_state UPSERT path may be skipping the alias_map update. Check the jsonb merge SET clause.
- **Localhost rejection fires against real Supabase.** Regex for localhost is too broad; tighten per `scripts/lib/validation-target.ts`.
- **`show_share_tokens` row missing for a seeded show (check-seed predicate g fires).** The `shows_create_share_token_after_insert` trigger only fires on INSERT, not UPDATE. If the show row already existed before the trigger was migrated in, the share-token row will be missing. Resolution: run `INSERT INTO public.show_share_tokens (show_id) SELECT id FROM public.shows WHERE drive_file_id LIKE 'validation\_%' ESCAPE '\' ON CONFLICT (show_id) DO NOTHING` in the Supabase SQL editor (the same back-fill the M11.5 migration uses).
- **crew_members UPSERT fails on email canonicalization CHECK.** Master spec X.5 requires email canonicalization; `validation+5a@example.com` canonicalizes to `validation@example.com` (strip-plus). The reseed script canonicalizes in TS before sending to the RPC, so this should not fire — but if it does, the canonicalize helper has changed shape; re-read `lib/email/canonicalize.ts` against the call site.
- **J3 leg (c) OAuth-claim walk left `claimed_via_oauth_at` set on fixture rows (pre-R13 behavior).** R13 commit 31 F11 repair closes this failure mode: the mint RPC's UPSERT SET clause now explicitly sets `claimed_via_oauth_at = NULL` on every reseed (see SET clause + post-SET comment in `mint_validation_fixture_atomic` above). After any J3 leg (c) walk, the next `pnpm validation:reseed --combo all` (or `--combo R1` for the specific J3-walked combo) automatically restores the bypass-pickable baseline. check-seed predicate (l) (per Task 0.C.5) verifies the discipline held post-reseed by asserting all baseline picker aliases have `claimed_via_oauth_at IS NULL`. **If predicate (l) ever fires**, the mint RPC's SET clause has drifted — re-check the migration body against the R13 commit 31 contract.

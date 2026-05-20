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

### Task 0.C.4: Implement `validation-reseed` core seed logic

**Files:**
- Modify: `scripts/validation-reseed.ts`

Per spec §3.3 owned-fixture-mappings + §3.3 crew_member_auth lockstep contract + spec invariant 2 (per-show advisory lock).

Implementation outline:
1. UPSERT show (synthesizes a stable `drive_file_id` from `combo + showName`).
2. Compute `date_restriction.days` from `datesRelative` relative to today.
3. Acquire per-show advisory lock: `SELECT pg_advisory_xact_lock(hashtext('show:' || $driveFileId));`
4. UPSERT crew_members for each crewMember in fixture.crewMembers (keyed by `(show_id, name)`).
5. UPSERT crew_member_auth for each (current_token_version preserved if set; initial = 1; revoked_below_version = 0).
6. UPDATE `validation_state.alias_map[combo] = { alias_X: crew_id, ... }` (jsonb merge).
7. UPSERT `validation_state` singleton: set `last_seed_date = current_date`, append `combo` to `combos_materialized` (deduped), set `seeded_supabase_project_ref` from env, `seeded_by` from process owner.
8. For `--combo all`: DELETE `revoked_links WHERE revoked_reason LIKE 'validation:%'` (spec §3.3 R22) AND structurally reset every `alias_5a_lead_for_query_compromise` per spec §3.3 R23 (DELETE all matching revoked_links + UPDATE crew_member_auth bumping `current_token_version + 1` and `revoked_below_version = 0`).

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

# M12.1 — Pivot tasks (T1-T4)

Read `00-overview.md` first for the goal, convergence approach, and out-of-scope list. This file is the per-task TDD checklist.

---

## Task T1 — Remove `crons` block from `vercel.json`

**Goal:** unblock `vercel deploy --prod` on Hobby tier by removing the cron declarations Vercel rejects on Hobby.

**Files:**
- Modify: `vercel.json`

**TDD steps:**

- [ ] **Step 1: Write failing structural test FIRST.** Author `tests/cross-cutting/no-vercel-cron.test.ts` (or write its first assertion if T4 is being authored in parallel). The assertion: `JSON.parse(readFileSync('vercel.json'))` does NOT contain a `crons` key. Initially this assertion FAILS because the `crons` block is still present at HEAD `ac752d9`. Verify the failure.
- [ ] **Step 2: Remove the `crons` block.** Edit `vercel.json`:

  Before:
  ```json
  {
    "crons": [
      { "path": "/api/cron/sync", "schedule": "*/5 * * * *" },
      { "path": "/api/cron/keepalive", "schedule": "0 12 * * *" },
      { "path": "/api/cron/refresh-watch", "schedule": "0 * * * *" },
      { "path": "/api/cron/gc-watch", "schedule": "15 * * * *" },
      { "path": "/api/cron/asset-recovery", "schedule": "*/15 * * * *" },
      { "path": "/api/cron/diagram-gc", "schedule": "30 * * * *" },
      { "path": "/api/cron/report-reaper", "schedule": "0 6 * * *" }
    ]
  }
  ```

  After:
  ```json
  {}
  ```

  (If the `vercel.json` accumulates other keys before M12.1 lands, preserve them and remove only the `crons` array.)

- [ ] **Step 3: Test passes.** The no-vercel-cron meta-test's "no crons key" assertion now passes.
- [ ] **Step 4: Verify no other code relies on `vercel.json` crons.** `rg -n "vercel\\.json" --type ts --type js` — confirm no consumers. Expected: none (Vercel reads it directly, not the app code).
- [ ] **Step 5: Commit.**

  ```bash
  git add vercel.json tests/cross-cutting/no-vercel-cron.test.ts
  git commit -m "$(cat <<'EOF'
  chore(infra): remove vercel.json crons block (M12.1 T1; pg_cron pivot)
  
  M12.1 sub-amendment: cron scheduling pivots to Supabase pg_cron + pg_net
  per the sub-amendment spec §2.3. Vercel Hobby tier rejects deployments
  declaring sub-daily crons; removal unblocks Phase 0.A.4. The 7 schedules
  re-land as pg_cron jobs in T3.
  EOF
  )"
  ```

**Risk class:** low — vercel.json removal is a single-line config edit; the route handlers still respond to HTTP calls regardless of who schedules them.

---

## Task T2 — Enable `pg_net` + add `fxav_cron_secret` to Supabase Vault

**Goal:** establish the prerequisites T3 depends on. `pg_net` is the HTTP-from-Postgres extension; Vault stores the bearer secret encrypted at rest.

**Files:**
- New: `supabase/migrations/<timestamp>_enable_pg_net.sql`
- New: `supabase/migrations/<timestamp>_cron_secret_vault.sql`

**Note on `<timestamp>`:** use `20260526NNNNNN` format consistent with the project's migration naming. Pick two sequential timestamps so the extension enable runs strictly before the vault entry.

### T2.1 — Enable `pg_net` extension

- [ ] **Step 1: Write the migration.** File: `supabase/migrations/<ts1>_enable_pg_net.sql`:

  ```sql
  -- M12.1 T2.1 — enable pg_net for outbound HTTP calls from pg_cron job bodies.
  -- See sub-amendment spec §2.3 (cron scheduling architecture) + §4 (live-code citations).
  create extension if not exists pg_net;
  ```

- [ ] **Step 2: Apply locally** via `npx supabase db push` against a local dev project (NOT yet the validation project — that's Phase 0.A.4.5 territory). Confirm extension landed: `select extname from pg_extension where extname = 'pg_net';` returns one row.
- [ ] **Step 3: Migration idempotency check.** Re-apply (`npx supabase db push` again) — the `if not exists` clause makes this a no-op. Confirm.
- [ ] **Step 4: Commit.**

  ```bash
  git add supabase/migrations/<ts1>_enable_pg_net.sql
  git commit -m "$(cat <<'EOF'
  feat(db): enable pg_net extension (M12.1 T2.1)
  
  Prerequisite for the pg_cron + pg_net architecture per sub-amendment
  spec §2.3. pg_net provides http_post() from inside Postgres; pg_cron
  schedule bodies call it to invoke the Vercel /api/cron/* routes with
  bearer auth.
  EOF
  )"
  ```

### T2.2 — Create `fxav_cron_secret` Vault entry

- [ ] **Step 1: Write the migration.** File: `supabase/migrations/<ts2>_cron_secret_vault.sql`:

  ```sql
  -- M12.1 T2.2 — create vault entry for fxav_cron_secret.
  -- The actual secret VALUE is populated per-environment (validation: Phase 0.A.5;
  -- prod: M13 launch). This migration creates the named slot only; secret value
  -- defaults to a placeholder that the runtime CRON_SECRET env-var check would
  -- never match (forcing 401 if Vault isn't populated post-migration).
  -- See sub-amendment spec §2.3 (auth contract).
  
  do $$
  begin
    if not exists (select 1 from supabase_vault.secrets where name = 'fxav_cron_secret') then
      perform supabase_vault.create_secret(
        new_secret := 'unset-populate-via-vault-ui-or-update',
        new_name := 'fxav_cron_secret',
        new_description := 'Bearer token for pg_net -> Vercel /api/cron/* routes. Populated post-migration per environment. M12.1 T2.2.'
      );
    end if;
  end$$;
  ```

- [ ] **Step 2: Apply locally.** Confirm: `select name, description from supabase_vault.secrets where name = 'fxav_cron_secret';` returns one row.
- [ ] **Step 3: Migration idempotency check.** Re-apply — the `if not exists` guard makes this a no-op. Confirm.
- [ ] **Step 4: Document the post-migration populate procedure** in the commit body (the env-specific value-population step happens in M12 Phase 0.A.5; this migration only creates the slot).
- [ ] **Step 5: Commit.**

  ```bash
  git add supabase/migrations/<ts2>_cron_secret_vault.sql
  git commit -m "$(cat <<'EOF'
  feat(db): add fxav_cron_secret to supabase_vault (M12.1 T2.2)
  
  Creates the named Vault slot only; value is populated per-environment
  in M12 Phase 0.A.5 (validation) and at M13 launch (prod). Default value
  is a placeholder string that no real CRON_SECRET would match, forcing
  401 from /api/cron/* until the operator populates it correctly. See
  sub-amendment spec §2.3.
  EOF
  )"
  ```

**Risk class:** low — extension enable + vault entry are additive, idempotent, and reversible.

---

## Task T3 — Schedule the 7 fxav cron jobs

**Goal:** land all 7 `cron.schedule()` calls in one atomic migration so partial-apply states cannot leave cron coverage incomplete.

**Files:**
- New: `supabase/migrations/<timestamp>_schedule_cron_jobs.sql`

**TDD steps:**

- [ ] **Step 1: Author the structural meta-test FIRST.** Write the first assertion of `tests/cross-cutting/pg-cron-coverage.test.ts` (full file lands in T4). The first assertion: parse the §2.3 spec table from `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md` (or a sibling JSON file `pg-cron-jobs.json` that the spec table is generated from) into a `JOB_TABLE` list of `{ jobname, schedule, route }` triples. Assert against live DB: `select jobname, schedule, command from cron.job where jobname like 'fxav_cron_%'` returns exactly 7 rows, one per JOB_TABLE entry, with schedules matching byte-for-byte and `command` containing the corresponding `route`. Initially FAILS because no `fxav_cron_*` jobs exist yet.
- [ ] **Step 2: Write the migration.** File: `supabase/migrations/<ts3>_schedule_cron_jobs.sql`:

  ```sql
  -- M12.1 T3 — schedule the 7 fxav cron jobs via pg_cron + pg_net.
  -- Spec §2.3 (cron scheduling architecture); §5.1 (job × layer completeness matrix).
  --
  -- pg_net installs its functions in the `net` schema, NOT `pg_net` (verified in
  -- spec §2.3). The cron job bodies call net.http_post(), not pg_net.http_post().
  --
  -- All schedules below are UTC (pg_cron + Supabase cluster default; matches the
  -- pre-pivot Vercel Cron UTC behavior byte-for-byte). Spec §2.3.
  --
  -- This migration is idempotent at the schedule layer: cron.unschedule() before
  -- cron.schedule() for each fxav_cron_* job. The unschedule loop is scoped to
  -- `jobname like 'fxav_cron_%'` so the pre-existing bootstrap signing-key cron
  -- at supabase/migrations/20260504000001_*.sql:36 is preserved.
  --
  -- The pg_net call body reads the bearer secret from supabase_vault each firing
  -- (NOT at migration time) so secret rotation does not require re-running this
  -- migration. The vercel_url is substituted into the schedule body AT MIGRATION
  -- TIME (via format()), so re-apply is required if the production URL changes.
  
  do $$
  declare
    vercel_url text := current_setting('app.fxav_vercel_url', true);
    pg_net_present boolean;
    vault_secret_present boolean;
  begin
    -- Prereq check 1: app.fxav_vercel_url GUC must be set.
    if vercel_url is null or vercel_url = '' then
      raise exception 'M12.1 T3: app.fxav_vercel_url GUC must be set before applying this migration. Run: alter database <db> set app.fxav_vercel_url = ''https://<your-app>.vercel.app''; then reconnect and re-apply.';
    end if;
  
    -- Prereq check 2: pg_net extension must be installed (T2.1).
    select exists(select 1 from pg_extension where extname = 'pg_net') into pg_net_present;
    if not pg_net_present then
      raise exception 'M12.1 T3: pg_net extension is required (M12.1 T2.1 must be applied first). Run the T2.1 migration before re-applying T3.';
    end if;
  
    -- Prereq check 3: supabase_vault entry must exist (T2.2). Value may still be
    -- the placeholder; the runtime check (Vercel route handler 401) is fail-loud
    -- on placeholder, but the migration only needs the slot to exist.
    select exists(select 1 from supabase_vault.secrets where name = 'fxav_cron_secret') into vault_secret_present;
    if not vault_secret_present then
      raise exception 'M12.1 T3: supabase_vault entry fxav_cron_secret is required (M12.1 T2.2 must be applied first). Run the T2.2 migration before re-applying T3.';
    end if;
  
    -- Idempotency: drop any pre-existing fxav_cron_* schedules. Scoped to the
    -- fxav prefix so the bootstrap signing-key cron is untouched.
    perform cron.unschedule(jobname)
      from cron.job
      where jobname like 'fxav_cron_%';
  
    -- Schedule the 7 jobs. Body shape is uniform across all 7 (multi-line for
    -- readability; the format() interpolation substitutes the route URL).
    perform cron.schedule('fxav_cron_sync', '*/5 * * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/sync'));
  
    perform cron.schedule('fxav_cron_keepalive', '0 12 * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/keepalive'));
  
    perform cron.schedule('fxav_cron_refresh_watch', '0 * * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/refresh-watch'));
  
    perform cron.schedule('fxav_cron_gc_watch', '15 * * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/gc-watch'));
  
    perform cron.schedule('fxav_cron_asset_recovery', '*/15 * * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/asset-recovery'));
  
    perform cron.schedule('fxav_cron_diagram_gc', '30 * * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/diagram-gc'));
  
    perform cron.schedule('fxav_cron_report_reaper', '0 6 * * *', format($body$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 30000
      );
    $body$, vercel_url || '/api/cron/report-reaper'));
  end$$;
  ```

- [ ] **Step 3: Set the `app.fxav_vercel_url` GUC** on the local dev database before applying: `alter database postgres set app.fxav_vercel_url = 'https://fxav-crew-pages-validation.vercel.app';` (the validation URL captured in M12 Phase 0.A.4). On a fresh validation project this happens once.
- [ ] **Step 4: Apply locally.** `npx supabase db push`. Confirm: `select jobname, schedule from cron.job where jobname like 'fxav_cron_%';` returns 7 rows with the expected schedules.
- [ ] **Step 5: Re-apply for idempotency.** Re-running unschedules + re-schedules; cron.job count stays at 7 (plus the pre-existing bootstrap signing-key job). Confirm.
- [ ] **Step 6: Verify pre-existing bootstrap signing-key cron is untouched.** `select jobname from cron.job where jobname not like 'fxav_cron_%';` should still show the bootstrap row from `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36`.
- [ ] **Step 7: Meta-test from Step 1 now passes.** Confirm.
- [ ] **Step 8: Commit.**

  ```bash
  git add supabase/migrations/<ts3>_schedule_cron_jobs.sql tests/cross-cutting/pg-cron-coverage.test.ts
  git commit -m "$(cat <<'EOF'
  feat(db): schedule 7 fxav cron jobs via pg_cron + pg_net (M12.1 T3)
  
  Atomic migration scheduling all 7 cron jobs per spec §2.3 + §5.1
  completeness matrix. Each job body reads bearer secret from
  supabase_vault.decrypted_secrets at firing time (rotation-friendly).
  Idempotent: unschedule-then-schedule pattern. Pre-existing
  bootstrap_nonces_signing_key cron untouched.
  EOF
  )"
  ```

**Risk class:** medium — single-migration atomicity is load-bearing; partial-apply leaves the system without the cron firing surface it needs. The `do $$ ... end$$` block wraps the 7 schedule calls in a single transaction. The `app.fxav_vercel_url` GUC is an operational pre-req — if absent, migration raises (intentional fail-loud).

---

## Task T4 — Structural defenses

**Goal:** pin invariants so accidental regressions surface in CI, not in production.

**Files:**
- New: `tests/cross-cutting/no-vercel-cron.test.ts`
- New: `tests/cross-cutting/pg-cron-coverage.test.ts`
- New (REQUIRED, canonical source for pg-cron-coverage): `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` — canonical job × schedule × route table that the spec §2.3 markdown view mirrors. Shape:

  ```json
  {
    "$schema-comment": "M12.1 canonical job table. Spec §2.3 is the human-readable view; this JSON is the machine-readable contract pg-cron-coverage.test.ts reads.",
    "jobs": [
      { "jobname": "fxav_cron_sync",           "schedule": "*/5 * * * *",  "route": "/api/cron/sync" },
      { "jobname": "fxav_cron_keepalive",      "schedule": "0 12 * * *",   "route": "/api/cron/keepalive" },
      { "jobname": "fxav_cron_refresh_watch",  "schedule": "0 * * * *",    "route": "/api/cron/refresh-watch" },
      { "jobname": "fxav_cron_gc_watch",       "schedule": "15 * * * *",   "route": "/api/cron/gc-watch" },
      { "jobname": "fxav_cron_asset_recovery", "schedule": "*/15 * * * *", "route": "/api/cron/asset-recovery" },
      { "jobname": "fxav_cron_diagram_gc",     "schedule": "30 * * * *",   "route": "/api/cron/diagram-gc" },
      { "jobname": "fxav_cron_report_reaper",  "schedule": "0 6 * * *",    "route": "/api/cron/report-reaper" }
    ]
  }
  ```

  Adding a new fxav_cron job in the future requires editing all three surfaces (this JSON + spec §2.3 + T3 migration); the meta-test fails if they disagree.

### T4.1 — `no-vercel-cron.test.ts`

- [ ] **Step 1: Author the test.** Asserts:
  1. `JSON.parse(readFileSync('vercel.json'))` does NOT contain a `crons` key (this assertion may have already landed in T1; consolidate here)
  2. No file under `app/`, `lib/`, `tests/` contains the case-insensitive substrings `x-vercel-cron`, `vercel-cron`, `VercelCron` — EXCEPT files carrying an inline `// not-vercel-cron-class: <reason>` waiver comment within 5 lines, AND historical-row files explicitly listed in an `HISTORICAL_FILES` allowlist (the spec §1017 audit-trail row is the only known exception, in `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md` — but `docs/` is outside the walked scope, so no allowlist entry is needed in practice).
- [ ] **Step 2: Verify it passes at HEAD post-T1.** `pnpm test tests/cross-cutting/no-vercel-cron.test.ts`.
- [ ] **Step 3: Regression-verification.** Stash the T1 vercel.json change → run test → expect FAIL (proves the assertion catches the regression). Restore the T1 change. Per `feedback_negative_regression_verification` memory — same-model spec+code-quality reviews approve tautological tests; only stashing the production fix and confirming the test fails proves the contract is pinned.

### T4.2 — `pg-cron-coverage.test.ts`

- [ ] **Step 1: Author or extend the test from T3 Step 1.** Asserts:
  1. The canonical JOB_TABLE (read from `pg-cron-jobs.json` OR parsed from spec §2.3 table) has exactly 7 entries with the expected jobnames/schedules/routes.
  2. Live DB introspection (`select jobname, schedule, command from cron.job where jobname like 'fxav_cron_%' order by jobname`) returns exactly 7 rows.
  3. For each row, jobname is in JOB_TABLE; schedule matches byte-for-byte; command contains the matching `/api/cron/<route>` substring AND contains `supabase_vault.decrypted_secrets`.
  4. Pre-existing non-fxav crons present (count > 0): asserts the migration didn't accidentally `cron.unschedule()` jobs outside its `fxav_cron_%` scope.
- [ ] **Step 2: Verify it passes post-T3.** `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts`.
- [ ] **Step 3: Anti-tautology verification (negative-regression discipline).** Per `feedback_negative_regression_verification`: a passing test alone doesn't prove the contract; only a failing test against a known-broken state does. Full procedure:
  1. Stash one of the `perform cron.schedule(...)` blocks in the T3 migration (delete one of the 7 calls, save the diff)
  2. Re-apply T3: `npx supabase db push` (since we ran `cron.unschedule()` first, the DB now has only 6 fxav_cron rows)
  3. Run the test: `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts` → expect FAIL on "exactly 7 rows" assertion
  4. Restore the stashed call to the migration file
  5. Re-apply T3 — DB returns to 7 fxav_cron rows
  6. Run the test again → expect PASS
- [ ] **Step 4: Live-integration probe (NOT mocks).** The test reads live `cron.job` rows via a Supabase client connection (or `psql` shell-out, same pattern as the M12 drift-repair test at `02-phase0-validation-state.md:146-265`). Per `feedback_mocked_only_tests_invite_tautological_approve` — DB introspection tests MUST hit a real DB. Mocked `cron.job` rows would observe what the test author thinks the migration produces, not what it actually produces.

### T4.3 — Commit

- [ ] **Step 1: Commit.**

  ```bash
  git add tests/cross-cutting/no-vercel-cron.test.ts tests/cross-cutting/pg-cron-coverage.test.ts docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json
  git commit -m "$(cat <<'EOF'
  test(cross-cutting): pin no-vercel-cron + pg-cron-coverage invariants (M12.1 T4)
  
  Two structural meta-tests defend the pivot:
  - no-vercel-cron: asserts vercel.json has no crons key + no
    x-vercel-cron / vercel-cron references in app/, lib/, tests/.
  - pg-cron-coverage: live-DB introspection assertion that the 7
    fxav_cron_* jobs match the spec §2.3 table byte-for-byte and that
    pre-existing non-fxav crons are preserved.
  Both verified against the negative-regression contract: stashing the
  T1/T3 production change makes each assertion fail (per
  feedback_negative_regression_verification + the anti-tautology rule).
  EOF
  )"
  ```

**Risk class:** low — additive test files only; CI catches regressions but tests don't change runtime behavior.

---

---

## Task T5 — Amend M12 plan to wire Vault + GUC + CRON_SECRET into Phase 0.A

**Goal:** the Phase 0.A executor reads `01-phase0-infra.md` directly, NOT the dispatch brief. Without this task, the executor would resume per the pre-pivot M12 plan and skip Vault population. T5 amends the M12 plan so the executor's task sequence reflects the M12.1 architecture.

**Files:**
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md`

**TDD steps:**

- [ ] **Step 1: Insert new Task 0.A.4.5 between Task 0.A.4 (Vercel deploy) and Task 0.A.5 (env-var wiring).** Suggested heading + body:

  ```markdown
  ### Task 0.A.4.5: Populate Vault + set GUC + apply M12.1 migrations against validation Supabase
  
  Per M12.1 sub-amendment (2026-05-26 @ `<sha>`). This task lands the operational state the
  M12.1 architecture requires before env-var wiring.
  
  **Files:**
  - No code changes. SQL editor operations against the validation Supabase project.
  
  - [ ] **Step 1:** Apply the M12.1 migrations to the validation Supabase project:
    `npx supabase db push` — applies the three new migrations (`enable_pg_net`,
    `cron_secret_vault`, `schedule_cron_jobs`) on top of the migrations applied
    in Task 0.A.2. The `schedule_cron_jobs` migration WILL FAIL with a
    `app.fxav_vercel_url GUC must be set` exception on first run; this is
    intentional (fail-loud) — proceed to Step 2.
  - [ ] **Step 2:** Set the GUC: in the Supabase SQL editor, run
    `alter database postgres set app.fxav_vercel_url = '<captured *.vercel.app URL from Task 0.A.4>';`
    The setting takes effect on new connections to the database.
  - [ ] **Step 3:** Populate the Vault secret: generate a strong random bearer
    token (e.g., `openssl rand -hex 32`). In the Supabase SQL editor, run
    `select supabase_vault.update_secret(<id-from-secrets>, '<token>', 'fxav_cron_secret', '...');`
    (or use the Vault UI: Settings → Vault → fxav_cron_secret → Edit). Save
    the same token value locally — Task 0.A.5 wires the matching `CRON_SECRET`
    env var into Vercel Production scope.
  - [ ] **Step 4:** Re-run `npx supabase db push` to re-apply `schedule_cron_jobs`
    now that the GUC + Vault entry are populated. Confirm: `select jobname,
    schedule from cron.job where jobname like 'fxav_cron_%';` returns 7 rows.
  - [ ] **Step 5:** Verify the pre-existing bootstrap signing-key cron is
    untouched: `select count(*) from cron.job where jobname not like 'fxav_cron_%';`
    should return at least 1.
  - [ ] **Step 6:** **NO commit** — this is per-environment operational state,
    not source code.
  ```

- [ ] **Step 2: Amend Task 0.A.5 step 3 to include `CRON_SECRET`.** Existing text says "Paste the captured Supabase values from 0.A.1 + 0.A.4 into the corresponding rows the §9.1.2 reseed row names." Add a sentence after that: "Additionally set `CRON_SECRET` in Vercel Production scope to the same bearer-token value populated into the validation Supabase Vault in Task 0.A.4.5 step 3. The byte-for-byte match is load-bearing: `app/api/cron/_auth.ts:7` compares the incoming `Authorization` header against `process.env.CRON_SECRET`, and the cron job bodies pass the Vault-stored value as the bearer; mismatched values produce 401 from every cron firing (fail-loud)."

- [ ] **Step 3: Verify no other M12 plan files reference Vercel Cron.** `rg -n 'Vercel Cron|vercel cron|x-vercel-cron' docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/` — expected: zero matches in the plan tree (the M12 spec amendments live in the M12.1 spec, not the M12 plan tree).

- [ ] **Step 4: Commit.**

  ```bash
  git add docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md
  git commit -m "$(cat <<'EOF'
  docs(plan-m12): insert Task 0.A.4.5 + update 0.A.5 for pg_cron pivot (M12.1 T5)
  
  M12.1 sub-amendment wires the pg_cron + pg_net architecture into Phase
  0.A executor's task sequence. New Task 0.A.4.5 handles Vault populate +
  GUC set + M12.1 migration apply against the validation Supabase project;
  Task 0.A.5 step 3 picks up CRON_SECRET in the Vercel Production-scope
  env-var set with the byte-for-byte match contract documented. The M12
  R70 APPROVE state is preserved (this edit is sub-amendment scope per
  M12.1 spec §3); M12.1's own convergence log tracks the amendment.
  EOF
  )"
  ```

**Risk class:** low — markdown documentation edit; no executable code. The risk is conceptual (missing this task means the executor never populates Vault and every cron firing 401s in validation).

---

## Verification commands (run after all five tasks)

```bash
# 1. All cross-cutting tests pass
pnpm test tests/cross-cutting/

# 2. Live cron.job state (assumes local Supabase is the validation project)
psql <DATABASE_URL> -c "select jobname, schedule, substring(command for 80) as command_head from cron.job order by jobname;"

# 3. Vercel deploy retry would succeed (DRY check on the JSON config)
jq '.crons' vercel.json   # → null (key absent)

# 4. Commit count expected
git log b4b2c38..HEAD --oneline | wc -l   # 157 (M12 close) + 6 (M12.1 commits: T1, T2.1, T2.2, T3, T4, T5) + N (R0 draft + repair rounds + close-out) = 163+
```

## Adversarial review focus surfaces (pre-emption for codex round 1)

If codex round 1 prompt includes a focus-area block, mention:

- **Auth contract preservation** — the route handlers' bearer-check is unchanged (cite `app/api/cron/_auth.ts:3-12`); the change is purely scheduler-side.
- **Idempotency of T3 migration** — unschedule-then-schedule is the chosen pattern; verify it works under re-apply.
- **`app.fxav_vercel_url` GUC ergonomics** — is this the right config surface? Alternatives: per-row constant in the migration (harder to swap envs); ENV-var-templated migration generation (more moving parts). GUC chosen for simplicity + operator-readable.
- **Vault secret rotation lifecycle** — value is populated post-migration; the placeholder default forces 401 until populated (fail-loud).
- **Schedule equivalence** — the 7 schedules in T3 match `vercel.json` at HEAD byte-for-byte. The pg-cron-coverage meta-test enforces this.

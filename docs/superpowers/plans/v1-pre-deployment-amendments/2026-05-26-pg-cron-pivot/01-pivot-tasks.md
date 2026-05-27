# M12.1 — Pivot tasks (T1-T4)

Read `00-overview.md` first for the goal, convergence approach, and out-of-scope list. This file is the per-task TDD checklist.

---

## Task T1 — Remove `crons` block from `vercel.json`

**Goal:** unblock `vercel deploy --prod` on Hobby tier by removing the cron declarations Vercel rejects on Hobby.

**Files:**
- Modify: `vercel.json`
- Delete: `tests/api/vercel-crons.test.ts` (the M6-era assertion that vercel.json HAS the crons block — its premise inverts under M12.1; retired in this task, replaced by T4's `no-vercel-cron.test.ts` which asserts the inverse contract)

**TDD steps:**

- [ ] **Step 1: Write failing structural test FIRST.** Author `tests/cross-cutting/no-vercel-cron.test.ts` (or write its first assertion if T4 is being authored in parallel). The assertion: `JSON.parse(readFileSync('vercel.json'))` does NOT contain a `crons` key. Initially this assertion FAILS because the `crons` block is still present at HEAD `ac752d9`. Verify the failure.
- [ ] **Step 1a: Retire the pre-M12.1 vercel-crons assertion test.** At HEAD `001c8e4`, `tests/api/vercel-crons.test.ts:7-21` reads `vercel.json` and asserts `config.crons` contains 6 hardcoded Vercel cron entries (R1 F2 finding, conf 0.95). Once T1 Step 2 removes the `crons` block, this test inverts — `config.crons` is undefined and the `expect.arrayContaining` assertion fails. The M6-era test premise (Vercel Cron is the scheduler) is fundamentally invalidated by M12.1; replace via deletion + new T4 inverse contract:
  - `rm tests/api/vercel-crons.test.ts`
  - `git rm tests/api/vercel-crons.test.ts` (stage the deletion for the T1 commit)
  - Verify no other file imports / references the removed test fixture or helper functions: `rg -nl "vercel-crons" tests/ app/ lib/` should return zero matches after deletion (the file was self-contained).
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

- [ ] **Step 3: Test passes.** The no-vercel-cron meta-test's "no crons key" assertion now passes. The retired `tests/api/vercel-crons.test.ts` is gone from disk + git index.
- [ ] **Step 4: Verify no other code relies on `vercel.json` crons.** `rg -n "vercel\\.json" --type ts --type js` — expected: zero matches after Step 1a's deletion of `tests/api/vercel-crons.test.ts`. If any other consumer surfaces, escalate to orchestrator (a sub-amendment scope expansion may be needed).
- [ ] **Step 5: Commit.**

  ```bash
  git add vercel.json tests/cross-cutting/no-vercel-cron.test.ts
  git rm tests/api/vercel-crons.test.ts
  git commit -m "$(cat <<'EOF'
  chore(infra): remove vercel.json crons block + retire vercel-crons test (M12.1 T1; pg_cron pivot)
  
  M12.1 sub-amendment: cron scheduling pivots to Supabase pg_cron + pg_net
  per the sub-amendment spec §2.3. Vercel Hobby tier rejects deployments
  declaring sub-daily crons; removal unblocks Phase 0.A.4. The 7 schedules
  re-land as pg_cron jobs in T3.
  
  R1 F2 (conf 0.95): the pre-M12.1 tests/api/vercel-crons.test.ts asserted
  vercel.json contains the M6-era Vercel-Cron schedules. Its premise is
  inverted by M12.1; the no-vercel-cron meta-test landed in T4 is the new
  contract surface. Retire the old test in the same commit so the suite
  is consistent after T1.
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

- [ ] **Step 0: TDD red — verify pg-cron-coverage prereq assertion FAILS at HEAD (R7 F17 fix).** Before any migration, the meta-test must have an assertion that captures the "pg_net not yet installed" state. **Extend pg-cron-coverage.test.ts (authored fully in T4.2) with Layer 0a prerequisite assertion:** `select exists(select 1 from pg_extension where extname = 'pg_net') as installed` returns `false` at HEAD `ac752d9` (pg_net not installed). Run `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts` against the validation Supabase project → expect Layer 0a assertion to FAIL (red). This is the TDD-red phase that authorizes the T2.1 migration to land. Per AGENTS.md invariant 1.
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
  spec §2.3. pg_net provides http_get() / http_post() from inside Postgres; pg_cron
  schedule bodies call it to invoke the Vercel /api/cron/* routes with
  bearer auth.
  EOF
  )"
  ```

### T2.2 — Create `fxav_cron_secret` Vault entry

- [ ] **Step 0: TDD red — verify pg-cron-coverage prereq assertion FAILS post-T2.1 (R7 F17 fix).** **Extend pg-cron-coverage.test.ts (authored fully in T4.2) with Layer 0b prerequisite assertion:** `select exists(select 1 from vault.secrets where name = 'fxav_cron_secret') as present` returns `false` post-T2.1 apply, before T2.2 (pg_net is installed but Vault entry doesn't exist yet). Run the meta-test → expect Layer 0b assertion to FAIL (red). This is the TDD-red phase that authorizes the T2.2 migration to land. Per AGENTS.md invariant 1.
- [ ] **Step 1: Write the migration.** File: `supabase/migrations/<ts2>_cron_secret_vault.sql`:

  ```sql
  -- M12.1 T2.2 — create vault entry for fxav_cron_secret.
  -- The actual secret VALUE is populated per-environment (validation: Phase 0.A.5;
  -- prod: M13 launch). This migration creates the named slot only; secret value
  -- defaults to a placeholder that the runtime CRON_SECRET env-var check would
  -- never match (forcing 401 if Vault isn't populated post-migration).
  --
  -- Schema: Supabase Vault's extension NAME is `supabase_vault` but its SQL
  -- surface lives in the `vault` schema (R2 F4 fix; conf 0.95). Functions:
  -- vault.create_secret(), vault.update_secret(). Tables/views: vault.secrets,
  -- vault.decrypted_secrets.
  --
  -- Defensive bootstrap (R5 F12 fix): PostgreSQL's `CREATE EXTENSION ... WITH
  -- SCHEMA schema_name` requires the schema to ALREADY EXIST (per PG docs at
  -- https://www.postgresql.org/docs/current/sql-createextension.html — "The
  -- named schema must already exist"). So a fresh environment without the
  -- `vault` schema would fail at `create extension ... with schema vault`
  -- before any function call could run. The two-statement form below creates
  -- the schema first (idempotent via `if not exists`), then the extension
  -- targeting that schema. On Supabase managed projects Vault is pre-installed
  -- and both statements are no-ops; on any other PG environment they bootstrap
  -- the prerequisites correctly.
  -- See sub-amendment spec §2.3 (auth contract).
  
  create schema if not exists vault;
  create extension if not exists supabase_vault with schema vault;
  
  do $$
  begin
    if not exists (select 1 from vault.secrets where name = 'fxav_cron_secret') then
      perform vault.create_secret(
        new_secret := 'unset-populate-via-vault-ui-or-update',
        new_name := 'fxav_cron_secret',
        new_description := 'Bearer token for pg_net -> Vercel /api/cron/* routes. Populated post-migration per environment. M12.1 T2.2.'
      );
    end if;
  end$$;
  ```

- [ ] **Step 2: Apply locally.** Confirm: `select name, description from vault.secrets where name = 'fxav_cron_secret';` returns one row.
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

- [ ] **Step 1: Author the structural meta-test FIRST.** Write the first assertion of `tests/cross-cutting/pg-cron-coverage.test.ts` (full file lands in T4). The first assertion: parse the §2.3 spec table from `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md` (or a sibling JSON file `pg-cron-jobs.json` that the spec table is generated from) into a `JOB_TABLE` list of `{ jobname, schedule, route }` triples. Assert against live DB: `select jobname, schedule, command from cron.job where jobname like 'fxav\_cron\_%' escape '\'` returns exactly 7 rows, one per JOB_TABLE entry, with schedules matching byte-for-byte and `command` containing the corresponding `route`. Initially FAILS because no `fxav_cron_*` jobs exist yet.
- [ ] **Step 2: Write the migration.** File: `supabase/migrations/<ts3>_schedule_cron_jobs.sql`:

  ```sql
  -- M12.1 T3 — schedule the 7 fxav cron jobs via pg_cron + pg_net.
  -- Spec §2.3 (cron scheduling architecture); §5.1 (job × layer completeness matrix).
  --
  -- pg_net installs its functions in the `net` schema, NOT `pg_net` (verified in
  -- spec §2.3). The cron job bodies call net.http_get() (NOT http_post) because
  -- the Vercel route handlers at app/api/cron/*/route.ts export only `GET` (verified
  -- via grep 2026-05-26 against HEAD 001c8e4); a POST request would hit Next.js's
  -- 405 Method Not Allowed path and never run the cron work. The bearer auth
  -- contract is method-agnostic (rejectUnauthorizedCron at _auth.ts:3-12 reads
  -- the Authorization header regardless of verb).
  --
  -- All schedules below are UTC (pg_cron + Supabase cluster default; matches the
  -- pre-pivot Vercel Cron UTC behavior byte-for-byte). Spec §2.3.
  --
  -- pg_net timeout: 300000ms (5 minutes) matches Vercel Functions' default
  -- maxDuration (per Vercel docs; session-context hook confirms "default
  -- function execution timeout is now 300s on all plans"). R6 F16 fix:
  -- earlier draft used 30s which is much shorter than runScheduledCronSync's
  -- plausible runtime — the sync route processes shows + Drive files
  -- sequentially with per-file 30s step timeouts (lib/sync/runScheduledCronSync.ts),
  -- and a multi-file watched folder can exceed 30s easily. A premature pg_net
  -- timeout would set net._http_response.timed_out=true even when the Vercel
  -- handler is running fine (the handler continues — pg_net just abandons
  -- waiting), making Smoke 3 layer 2 (HTTP outcome) report false negatives.
  -- 300s allows the longest expected sync to complete within the pg_net
  -- observation window. Faster crons (keepalive, refresh-watch, etc.) are
  -- unaffected — they complete well under 300s and pg_net closes the
  -- connection as soon as the handler responds.
  --
  -- This migration is idempotent at the schedule layer: cron.unschedule() before
  -- cron.schedule() for each fxav_cron_* job. The unschedule loop is scoped to
  -- `jobname like 'fxav\_cron\_%' escape '\'` (escaped — underscores are literal,
  -- not SQL LIKE single-char wildcards; R4 F10 fix) so the pre-existing bootstrap signing-key cron
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
    select exists(select 1 from vault.secrets where name = 'fxav_cron_secret') into vault_secret_present;
    if not vault_secret_present then
      raise exception 'M12.1 T3: supabase_vault entry fxav_cron_secret is required (M12.1 T2.2 must be applied first). Run the T2.2 migration before re-applying T3.';
    end if;
  
    -- Idempotency: drop any pre-existing fxav_cron_* schedules. Scoped to the
    -- fxav prefix so the bootstrap signing-key cron is untouched.
    perform cron.unschedule(jobname)
      from cron.job
      where jobname like 'fxav\_cron\_%' escape '\';
  
    -- Schedule the 7 jobs. Body shape is uniform across all 7 (multi-line for
    -- readability; the format() interpolation substitutes the route URL).
    perform cron.schedule('fxav_cron_sync', '*/5 * * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/sync'));
  
    perform cron.schedule('fxav_cron_keepalive', '0 12 * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/keepalive'));
  
    perform cron.schedule('fxav_cron_refresh_watch', '0 * * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/refresh-watch'));
  
    perform cron.schedule('fxav_cron_gc_watch', '15 * * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/gc-watch'));
  
    perform cron.schedule('fxav_cron_asset_recovery', '*/15 * * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/asset-recovery'));
  
    perform cron.schedule('fxav_cron_diagram_gc', '30 * * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/diagram-gc'));
  
    perform cron.schedule('fxav_cron_report_reaper', '0 6 * * *', format($body$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
        timeout_milliseconds := 300000
      );
    $body$, vercel_url || '/api/cron/report-reaper'));
  end$$;
  ```

- [ ] **Step 3: Set the `app.fxav_vercel_url` GUC** on the local dev database before applying: `alter database postgres set app.fxav_vercel_url = 'https://fxav-crew-pages-validation.vercel.app';` (the validation URL captured in M12 Phase 0.A.4). On a fresh validation project this happens once.
- [ ] **Step 4: Apply locally.** `npx supabase db push`. Confirm: `select jobname, schedule from cron.job where jobname like 'fxav\_cron\_%' escape '\';` returns 7 rows with the expected schedules.
- [ ] **Step 5: Re-apply for idempotency.** Re-running unschedules + re-schedules; cron.job count stays at 7 (plus the pre-existing bootstrap signing-key job). Confirm.
- [ ] **Step 6: Verify pre-existing bootstrap signing-key cron is untouched.** `select jobname from cron.job where jobname not like 'fxav\_cron\_%' escape '\';` should still show the bootstrap row from `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36`.
- [ ] **Step 7: Meta-test from Step 1 now passes.** Confirm.
- [ ] **Step 8: Commit.**

  ```bash
  git add supabase/migrations/<ts3>_schedule_cron_jobs.sql tests/cross-cutting/pg-cron-coverage.test.ts
  git commit -m "$(cat <<'EOF'
  feat(db): schedule 7 fxav cron jobs via pg_cron + pg_net (M12.1 T3)
  
  Atomic migration scheduling all 7 cron jobs per spec §2.3 + §5.1
  completeness matrix. Each job body reads bearer secret from
  vault.decrypted_secrets at firing time (rotation-friendly).
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
- New (R3 structural-defense calibration): `tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts` — prose-guard walking M12.1 docs for the API-surface-verification class of regressions (per AGENTS.md "structural-defense calibration" — R3 closed the same-vector recurrence after comprehensive re-analysis; the prose-guard prevents re-introduction at CI time)
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
  2. No file under `app/`, `lib/`, `tests/` contains the case-insensitive substrings `x-vercel-cron`, `vercel-cron`, `VercelCron` — EXCEPT:
     - **Self-exclusion (R6 F15 fix):** the test file itself (`tests/cross-cutting/no-vercel-cron.test.ts`) is excluded from the walk entirely — it MUST contain the forbidden literals to define them as regex patterns, so a straightforward implementation that scans itself would fail itself. Implement via a `if (filePath === __filename) continue;` skip at the walker, OR by hard-coding `tests/cross-cutting/no-vercel-cron.test.ts` in a `SELF_EXEMPT` constant.
     - Files carrying an inline `// not-vercel-cron-class: <reason>` waiver comment within 5 lines (narrow per-instance escape hatch — NOT a broad file-level allowlist).
     - Historical-row files explicitly listed in an `HISTORICAL_FILES` allowlist (the spec §1017 audit-trail row is the only known exception, in `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md` — but `docs/` is outside the walked scope, so no allowlist entry is needed in practice).
  3. **Anti-tautology for self-exclusion:** the test asserts the walker did NOT encounter `tests/cross-cutting/no-vercel-cron.test.ts` (i.e., the exclusion fired). If the file is missing from disk or the exclusion is mis-implemented and the walker tries to scan it anyway, the test fails. This pins the contract that self-exclusion is the ONLY exemption for THIS particular file (no other test file can be silently exempted).
- [ ] **Step 2: Verify it passes at HEAD post-T1.** `pnpm test tests/cross-cutting/no-vercel-cron.test.ts`.
- [ ] **Step 3: Regression-verification.** Stash the T1 vercel.json change → run test → expect FAIL (proves the assertion catches the regression). Restore the T1 change. Per `feedback_negative_regression_verification` memory — same-model spec+code-quality reviews approve tautological tests; only stashing the production fix and confirming the test fails proves the contract is pinned.

### T4.2 — `pg-cron-coverage.test.ts`

- [ ] **Step 1: Author or extend the test from T3 Step 1.** Asserts:
  0a. **Prerequisite Layer 0a (T2.1 red, R7 F17):** `select exists(select 1 from pg_extension where extname = 'pg_net')` returns `true`. FAILS at HEAD `ac752d9` (pg_net not installed); PASSES after T2.1 applies.
  0b. **Prerequisite Layer 0b (T2.2 red, R7 F17):** `select exists(select 1 from vault.secrets where name = 'fxav_cron_secret')` returns `true`. FAILS post-T2.1 / pre-T2.2; PASSES after T2.2 applies.
  1. The canonical JOB_TABLE (read from `pg-cron-jobs.json`) has exactly 7 entries with the expected jobnames/schedules/routes.
  2. Live DB introspection (`select jobname, schedule, command from cron.job where jobname like 'fxav\_cron\_%' escape '\' order by jobname`) returns exactly 7 rows.
  3. For each row: jobname is in JOB_TABLE; schedule matches byte-for-byte; command contains the matching `/api/cron/<route>` substring AND contains `vault.decrypted_secrets` AND **contains `net.http_get(` (NOT `net.http_post(`)**. The http_get assertion is load-bearing: R1 F1 (HIGH, conf 0.97) caught a draft-state bug where the T3 SQL used http_post against GET-only handlers — this assertion pins the verb contract structurally so the class cannot recur silently. The `vault.decrypted_secrets` assertion (NOT `supabase_vault.decrypted_secrets`) is also load-bearing: R2 F4 (HIGH, conf 0.95) caught a draft-state bug where the migrations referenced the extension name instead of the schema name — this assertion pins the Vault-schema contract structurally.
  4. For each row: command does NOT contain the literal substring `net.http_post(`. Pin the inverse contract explicitly (forbidden-substring assertion); guards against a future migration drift adding http_post calls.
  5. Pre-existing non-fxav crons present (count > 0): asserts the migration didn't accidentally `cron.unschedule()` jobs outside its `fxav_cron_%` scope.
- [ ] **Step 2: Verify it passes post-T3.** `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts`.
- [ ] **Step 3: Anti-tautology verification (negative-regression discipline).** Per `feedback_negative_regression_verification`: a passing test alone doesn't prove the contract; only a failing test against a known-broken state does. **R3 F8 fix (conf 0.9):** the original draft used `supabase db push` to "re-apply" the edited migration — but `db push` only applies PENDING migrations (those not in `supabase_migrations.schema_migrations`); already-applied migrations are NOT re-run on push. The corrected procedure uses **live cron-state mutation via `cron.unschedule()`** (no migration file edit) so the live DB enters a known-broken state without touching the migration system:

  1. **Setup check:** before mutating, confirm baseline. `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts` → expect PASS with 7 fxav_cron_* rows.
  2. **Mutate live state:** in Supabase SQL editor (or psql against the validation DB), run `select cron.unschedule('fxav_cron_sync');` — drops one row from `cron.job`. DB now has 6 fxav_cron_* rows.
  3. **Run the test:** `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts` → expect **FAIL** on the "exactly 7 rows" assertion. This proves the test catches a missing-schedule regression.
  4. **Restore by re-running the T3 migration's relevant `cron.schedule()` call** directly in the SQL editor:
     ```sql
     do $$ declare vercel_url text := current_setting('app.fxav_vercel_url', true); begin
       perform cron.schedule('fxav_cron_sync', '*/5 * * * *', format($body$
         select net.http_get(url := %L, headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')), timeout_milliseconds := 300000);
       $body$, vercel_url || '/api/cron/sync'));
     end$$;
     ```
     **Alternative:** `npx supabase db reset` recreates the DB from all migrations (heavyweight; clobbers data — acceptable on validation env). On `db reset`, the T3 migration re-runs and the 7 schedules are restored.
  5. **Confirm restoration:** `pnpm test tests/cross-cutting/pg-cron-coverage.test.ts` → expect PASS again with 7 rows.

  **Why this procedure works where the R0-R2 procedure didn't:** R0-R2 said "edit T3 migration file, db push, expect FAIL." That fails because db push doesn't re-apply already-tracked migrations (per Supabase CLI docs at https://supabase.com/docs/reference/cli/supabase-db-push — migrations land once and stay tracked in `supabase_migrations.schema_migrations`). The corrected procedure mutates LIVE DB state directly, so the assertion sees the mutation independent of migration apply state.
- [ ] **Step 4: Live-integration probe (NOT mocks).** The test reads live `cron.job` rows via a Supabase client connection (or `psql` shell-out, same pattern as the M12 drift-repair test at `02-phase0-validation-state.md:146-265`). Per `feedback_mocked_only_tests_invite_tautological_approve` — DB introspection tests MUST hit a real DB. Mocked `cron.job` rows would observe what the test author thinks the migration produces, not what it actually produces.

### T4.3 — `pg-cron-pivot-doc-guard.test.ts` (R3 structural-defense calibration)

- [ ] **Step 1: Author the prose-guard test.** Walks `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md` + `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/**/*.md` and asserts NONE of the following forbidden patterns appear (case-insensitive, per-pattern):

  | Pattern | Class | Why forbidden |
  |---|---|---|
  | `supabase_vault\.(create_secret\|secrets\|decrypted_secrets\|update_secret)` | Schema-name drift (R2 F4) | Functions/tables live in `vault` schema; extension name `supabase_vault` is only valid in `create extension` contexts |
  | `net\.http_post` | HTTP verb drift (R1 F1) | Cron handlers export GET only; POST → 405 |
  | `cron\.job_run_details[^.]*\.jobname` OR `from cron\.job_run_details[\s\S]{0,200}where jobname` (without a `join cron\.job` within 200 chars) | jobname-on-job_run_details drift (R3 F7) | `jobname` lives on `cron.job`, not `cron.job_run_details`; queries need a join |
  | `last_start_time\|last_finish_time` | Non-existent column drift (R2 F5) | pg_cron exposes `start_time`/`end_time` — these names came from a confused R1 draft |
  | `db push[^.\n]{0,150}expect[^.\n]{0,50}(FAIL\|fail)` (the negative-regression assertion shape, NOT general "re-apply" or "retry" text) | Migration-reapply assumption (R3 F8) | `db push` applies pending migrations only; the canonical negative-regression assertion that uses db push to re-apply an edited migration is invalid. **R4 F9 fix:** earlier draft used the broader pattern `db push.*re-?apply` which flagged legitimate Task 0.A.4.5 retry text ("Re-run `npx supabase db push` to re-apply `schedule_cron_jobs` now that GUC is populated") — that's a legitimate retry of a NOT-YET-APPLIED migration (the prior attempt failed during the GUC check, so the migration isn't tracked in `supabase_migrations.schema_migrations`). The narrowed pattern matches only the broken anti-tautology assertion shape, NOT legitimate retry text. |
  | `like '[^']*_[^']*_[^']*%'` WHEN preceded by `jobname` within 50 chars AND NOT followed by `escape '\\'` within 50 chars | Unescaped LIKE wildcard (R4 F10) | PostgreSQL LIKE: `_` is single-char wildcard. `'fxav_cron_%'` matches `fxavXcronY...` (and many other false positives). The escaped form `'fxav\_cron\_%' escape '\'` makes underscores literal. M12.1's cron.unschedule predicate + meta-test + Smoke text MUST use the escaped form to scope correctly. |
  | `escape '\\\\'` (literal four backslashes in markdown source / two-char string at SQL level) — i.e., the doubled-backslash form for ESCAPE | Double-backslash ESCAPE clause (R6 F14 / R7 F18) | PostgreSQL `ESCAPE` clause requires a single-character escape string; `'\\'` parses as a 2-char string and errors. R5-fix introduced `escape '\\'` at Task 0.A.5 step 6a; R6 F14 caught and fixed. R7 F18 adds the structural defense so the class cannot recur silently. NOTE: in markdown source, `escape '\'` (single backslash) is what we want; `escape '\\'` is the broken form. The doc-guard regex catches the literal 4-backslash source form (which renders as 2-backslash SQL) and refuses it outside finding-history allowlists. |

- [ ] **Step 1a (R9 F23 fix — sequencing correction):** the 9 M12-plan-positive assertions (A-I, R7 F17 + R8 F20 fix) are **NOT** in this file. R7-R8 drafts put them here, but T4 commits BEFORE T5; landing the doc-guard with A-I assertions would create immediate CI failure (assertions fail at T4 commit boundary because T5 hasn't edited the M12 plan tree yet) — violating TDD-green-at-commit discipline and breaking the new x6 audit on its first run.
  
  Corrected ownership: **T5 ships its own test file** `tests/cross-cutting/m12-plan-pg-cron-pivot-amendment.test.ts` containing the 9 positive assertions A-I; the test commits in the same atomic T5 commit as the M12 plan edits, so the assertions are red at T5 step 0 (per AGENTS.md invariant 1) and green at T5 commit-land. pg-cron-pivot-doc-guard (this T4 file) keeps ONLY the 7 forbidden-pattern walks + self-exclusion + finding-history allowlist — all of which can be green at T4 commit boundary.
  
  See T5 step 0 + T5 step 1.5 (new) for the M12-plan-amendment test authoring + commit grouping.

- [ ] **Step 2: Allowlist mechanism for finding-history paragraphs.** The spec's R1/R2/R3/R4/R5/R6/R7 finding-history paragraphs INTENTIONALLY cite forbidden patterns as "what was wrong." Allowlist these via:
  - Inline waiver comment within 5 lines of the match: `<!-- not-doc-guard-class: <reason> -->` OR
  - Surrounding-line patterns: lines containing "R[0-9]+ F[0-9]+", "finding history", "Repair:", "was: ", "fix:", inside an HTML comment, OR within a markdown blockquote referencing a prior round.
  Document the allowlist contract in the test's top-of-file comment so a future editor can extend it.
  
  **Self-exclusion (R6 F15 fix, same shape as no-vercel-cron):** the test file itself (`tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts`) is excluded from the walk entirely — its regex definitions necessarily contain the forbidden patterns. Implement via `if (filePath === __filename) continue;` at the walker OR via `SELF_EXEMPT` constant. Walked surfaces: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md` + `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/**/*.md`. NOT walked: `tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts` itself.

- [ ] **Step 3: Verify it passes at HEAD post-R3-fix.** `pnpm test tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts`. If any of the R1/R2/R3 finding paragraphs trip the assertion despite the allowlist, refine the allowlist regex until clean.

- [ ] **Step 4: Anti-tautology / negative-regression verification.** For each forbidden pattern, manually re-introduce one match into the spec (e.g., change `vault.decrypted_secrets` → `supabase_vault.decrypted_secrets` in a non-finding paragraph), run test → expect FAIL on that specific assertion; restore. Confirms each pattern's check is regression-catching. Do this for all 7 patterns in the table (the 6th — unescaped LIKE — was added in R4 F10 fix; the 7th — double-backslash ESCAPE — was added in R7 F18 fix).

### T4.4 — Wire structural defenses into CI (R5 F11 fix)

**Critical context:** the existing CI workflow at `.github/workflows/x-audits.yml` gates PRs/pushes via per-audit-script jobs (`test:audit:x1-catalog-parity`, ..., `test:audit:x5-email-canonicalization`). It does NOT run `pnpm test tests/cross-cutting/` as a catch-all. Without wiring, the M12.1 cross-cutting tests would be green locally yet never gate PRs — the structural defense the entire R3-R4-R5 calibration depends on would be inert. R5 F11 (HIGH) caught this.

**Local-only vs CI-safe classification:**
- **CI-safe (text-only, no DB):** `no-vercel-cron.test.ts`, `pg-cron-pivot-doc-guard.test.ts` — both walk markdown / config files. Wire into CI.
- **Local-only (requires live Supabase + applied migrations):** `pg-cron-coverage.test.ts` — queries `cron.job` table introspection. Cannot run in stock CI without a Supabase test instance (out of M12.1 scope). Mark as local-only in its top-of-file comment; run manually in Phase 0.F close-out probe.

**Files:**
- Modify: `package.json` (add new script `test:audit:x6-pg-cron-pivot`)
- Modify: `.github/workflows/x-audits.yml` (add new job `audit-x6-pg-cron-pivot` following the x1-x5 pattern)

- [ ] **Step 1: Add the audit script to `package.json`.** Position alphabetically after `test:audit:x5-email-canonicalization`:

  ```json
  "test:audit:x6-pg-cron-pivot": "vitest run tests/cross-cutting/no-vercel-cron.test.ts tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts",
  ```

- [ ] **Step 2: Add the CI workflow job to `.github/workflows/x-audits.yml`.** Follow the structural pattern of `audit-x5-email-canonicalization` (the most-recent x-audit; copy its job shape including the checkout, setup-pnpm, install-deps, and the `pnpm test:audit:x6-pg-cron-pivot 2>&1 | tee x6-pg-cron-pivot.log` step). Add the job name to any required-jobs list at the top of the workflow if such a list exists.

- [ ] **Step 2a: Add `workflow_dispatch:` trigger to x-audits.yml (R8 F22 fix).** Per AGENTS.md cross-cutting discipline "local-passes-CI-fails is its own bug class": new CI gates need a real GitHub Actions execution proof, not just local. The existing workflow triggers are `pull_request`, `push`, and `schedule` — none allow on-demand verification before merging. Add a top-level `workflow_dispatch:` trigger to the workflow file so the orchestrator/operator can run `gh workflow run x-audits.yml --ref <branch>` to verify the new x6 job actually executes in the GitHub Actions environment, not just locally.

- [ ] **Step 3: Verify the CI gate locally.** Run `pnpm test:audit:x6-pg-cron-pivot` — confirms both tests pass against the M12.1 R5-fix repo state.

- [ ] **Step 3a: Verify the CI gate in real GitHub Actions (R8 F22 fix).** After commit lands on a remote branch: `gh workflow run x-audits.yml --ref <branch>` triggers the workflow; `gh run watch` follows execution; confirm the new `audit-x6-pg-cron-pivot` job completes with status `success`. If it fails in CI but passes locally, that's the "local-passes-CI-fails" class — surface to orchestrator before declaring T4.4 done. Per AGENTS.md cross-cutting #4.

- [ ] **Step 4: Verify the CI workflow file is valid.** `gh workflow view x-audits.yml --yaml` (or visual inspection) — confirm YAML syntax is correct.

- [ ] **Step 5: Document pg-cron-coverage as local-only.** Add a top-of-file comment to `tests/cross-cutting/pg-cron-coverage.test.ts`:

  ```ts
  /**
   * LOCAL-ONLY: this test requires a live Supabase project with pg_cron + pg_net
   * + supabase_vault extensions installed AND the M12.1 T3 migration applied.
   * NOT wired into CI (would require a Supabase test instance — out of M12.1
   * scope, deferred to a future sub-amendment if needed).
   *
   * Run manually before declaring M12 Phase 0.F close-out: `pnpm test
   * tests/cross-cutting/pg-cron-coverage.test.ts` against the validation
   * Supabase project (.env.local must point at the validation env).
   *
   * The CI-safe defenses (no-vercel-cron + pg-cron-pivot-doc-guard) are gated
   * via `pnpm test:audit:x6-pg-cron-pivot` in .github/workflows/x-audits.yml.
   */
  ```

### T4.5 — Commit

- [ ] **Step 1: Commit.**

  ```bash
  git add tests/cross-cutting/no-vercel-cron.test.ts tests/cross-cutting/pg-cron-coverage.test.ts tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json package.json .github/workflows/x-audits.yml
  git commit -m "$(cat <<'EOF'
  test(cross-cutting)+ci(x-audits): pin pg_cron pivot invariants + wire CI gate (M12.1 T4)
  
  Three structural meta-tests defend the pivot:
  - no-vercel-cron: asserts vercel.json has no crons key + no
    x-vercel-cron / vercel-cron references in app/, lib/, tests/.
  - pg-cron-coverage: live-DB introspection assertion that the 7
    fxav_cron_* jobs match pg-cron-jobs.json byte-for-byte (jobname,
    schedule, command-contains-net.http_get + command-contains-
    vault.decrypted_secrets + command-NOT-contains-net.http_post) and
    that pre-existing non-fxav crons are preserved.
  - pg-cron-pivot-doc-guard: R3 structural-defense calibration +
    R4/R7 extension — walks M12.1 spec + plan markdown and asserts 7
    forbidden patterns (supabase_vault.* schema-name drift;
    net.http_post verb drift; cron.job_run_details.jobname
    column-shape drift; last_start_time/last_finish_time non-existent-
    column drift; 'db push expect FAIL' migration-reapply assumption
    — narrowed in R4 F9; unescaped LIKE 'fxav_cron_%' wildcard —
    added in R4 F10; double-backslash ESCAPE clause — added in R7 F18)
    do NOT appear outside allowlisted finding-history paragraphs.
    Defends the API-surface-verification class that
    recurred across R1/R2/R3/R4.
  
  All three verified against the negative-regression contract per
  feedback_negative_regression_verification + the anti-tautology rule.
  EOF
  )"
  ```

**Risk class:** low — additive test files only; CI catches regressions but tests don't change runtime behavior.

---

---

## Task T5 — Amend M12 plan to wire Vault + GUC + CRON_SECRET into Phase 0.A + sweep Vercel-Cron observability references

**Goal:** the Phase 0.A executor reads `01-phase0-infra.md` + `05-phase0-smokes.md` directly, NOT the dispatch brief. Without this task, the executor would (a) resume per the pre-pivot M12 plan and skip Vault population, and (b) follow stale Smoke 3 instructions checking Vercel Cron Logs / `vercel.json` cron presence (which no longer exist post-T1). T5 amends both M12 plan files so the executor's task + smoke sequence reflects the M12.1 architecture. R1 F3 (conf 0.9) caught the smoke-file gap; class-sweep also surfaced `01-phase0-infra.md:75` (4th Vercel-Cron-assumption needing amendment).

**Files:**
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md` (insert Task 0.A.4.5; update Task 0.A.5 step 3; amend Task 0.A.4 Step 5 production-vs-preview rationale at line 75)
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/05-phase0-smokes.md` (rewrite Smoke 3 steps 2 + diagnostic guidance at lines 33 + 36 for pg_cron + pg_net observability)

**TDD steps:**

- [ ] **Step 0: TDD red — author T5's dedicated test file at the T5 commit boundary (R7 F17 + R8 F20 + R9 F23 fix).** **Create new test file** `tests/cross-cutting/m12-plan-pg-cron-pivot-amendment.test.ts` (NOT in pg-cron-pivot-doc-guard — that ships in T4 before T5 edits exist; commingling causes T4-commit CI failure per R9 F23). The test contains 9 positive assertions covering BOTH M12 plan files T5 modifies.
  
  Against `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md`:
  - Assertion A: contains the literal heading `### Task 0.A.4.5: Populate Vault + set GUC + apply M12.1 migrations against validation Supabase`
  - Assertion B: at Task 0.A.5 step 3 contains the literal `CRON_SECRET` in Vercel-Production-scope context
  - Assertion C: at Task 0.A.4 Step 5 does NOT contain the literal "Vercel Cron Jobs run only on production deployments" (replaced by env-var-scoping rationale per T5 step 3)
  - Assertion D: contains a join `cron.job_run_details ... join cron.job ... on j.jobid = jrd.jobid` somewhere (the Task 0.A.4.5 step 4 verification SQL)
  
  Against `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/05-phase0-smokes.md` (R8 F20 fix):
  - Assertion E: Smoke 3 section contains a 3-layer observability stack — references all of `cron.job_run_details`, `net._http_response`, AND a "downstream side effect" pattern
  - Assertion F: Smoke 3 contains a joined `cron.job_run_details jrd join cron.job j on j.jobid = jrd.jobid` query (NOT the stale `where jobname` form)
  - Assertion G: Smoke 3 contains references to `net._http_response` (pg_net response inspection)
  - Assertion H: Smoke 3 uses 300s / "5 min" / "5 minutes" timeout prose, NOT 30s
  - Assertion I: Smoke 3 does NOT contain `Vercel Cron Logs` OR `verify cron is enabled in vercel.json` outside finding-history contexts (the stale R0 prose codex F3 caught)
  
  Run `pnpm test tests/cross-cutting/m12-plan-pg-cron-pivot-amendment.test.ts` against HEAD `ac752d9` → expect all 9 assertions to FAIL (the M12 plan tree hasn't been amended yet). This is the TDD-red phase that authorizes the T5 doc edits to land. Per AGENTS.md invariant 1.

- [ ] **Step 0a (R9 F23 fix — extend x6 CI audit to include the new test file).** Update `package.json` `test:audit:x6-pg-cron-pivot` script to include the new test file: `vitest run tests/cross-cutting/no-vercel-cron.test.ts tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts tests/cross-cutting/m12-plan-pg-cron-pivot-amendment.test.ts`. The T5 commit lands all three test files plus the M12 plan edits atomically; the x6 CI gate then runs all three on every PR/push. (Reminder: this script update lives in `package.json` from T4.4 step 1 — T5 step 0a extends it.)

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
  - [ ] **Step 2:** Set the GUC to the STABLE PROJECT ALIAS (R5 F13): in the Supabase SQL editor, run
    `alter database postgres set app.fxav_vercel_url = 'https://<project-name>.vercel.app';`
    where `<project-name>.vercel.app` is the stable project alias captured in Task 0.A.4 step 4
    (NOT the per-deployment URL with hash + team suffix). The alias auto-points at the latest
    production deployment, so subsequent redeploys transparently route cron traffic to the
    current code + env vars. The setting takes effect on new connections to the database.
  - [ ] **Step 3:** Populate the Vault secret: generate a strong random bearer
    token (e.g., `openssl rand -hex 32`). In the Supabase SQL editor, run
    `select vault.update_secret(<id-from-vault.secrets>, '<token>', 'fxav_cron_secret', '...');`
    (or use the Vault UI: Settings → Vault → fxav_cron_secret → Edit). Save
    the same token value locally — Task 0.A.5 wires the matching `CRON_SECRET`
    env var into Vercel Production scope.
  - [ ] **Step 4:** Re-run `npx supabase db push` to re-apply `schedule_cron_jobs`
    now that the GUC + Vault entry are populated. Confirm: `select jobname,
    schedule from cron.job where jobname like 'fxav\_cron\_%' escape '\';` returns 7 rows.
  - [ ] **Step 5:** Verify the pre-existing bootstrap signing-key cron is
    untouched: `select count(*) from cron.job where jobname not like 'fxav\_cron\_%' escape '\';`
    should return at least 1.
  - [ ] **Step 6:** **NO commit** — this is per-environment operational state,
    not source code.
  ```

- [ ] **Step 2: Amend Task 0.A.5 step 3 to include `CRON_SECRET`.** Existing text says "Paste the captured Supabase values from 0.A.1 + 0.A.4 into the corresponding rows the §9.1.2 reseed row names." Add a sentence after that: "Additionally set `CRON_SECRET` in Vercel Production scope to the same bearer-token value populated into the validation Supabase Vault in Task 0.A.4.5 step 3. The byte-for-byte match is load-bearing: `app/api/cron/_auth.ts:7` compares the incoming `Authorization` header against `process.env.CRON_SECRET`, and the cron job bodies pass the Vault-stored value as the bearer; mismatched values produce 401 from every cron firing (fail-loud)."

- [ ] **Step 2a: Amend Task 0.A.4 Step 4 to specify STABLE PROJECT ALIAS (R5 F13 fix).** Existing text says "Capture the production `*.vercel.app` URL (the canonical one — NOT a preview URL)." This is ambiguous between (a) the stable project alias `<project-name>.vercel.app` (e.g., `fxav-crew-pages-validation.vercel.app`) which Vercel automatically maintains as a pointer to the latest production deployment, and (b) the per-deployment immutable URL `<project-name>-<hash>-<team>.vercel.app` (e.g., `fxav-crew-pages-validation-abc123-eric-weiss-projects.vercel.app`) which `vercel deploy` outputs. The pg_cron + pg_net architecture bakes this URL into `cron.job.command` at T3 migration time (via `app.fxav_vercel_url` GUC + format() substitution); using the per-deployment URL means subsequent redeploys leave the cron firing against the OLD deployment with OLD env vars + OLD code, indefinitely. Amend Step 4 to: "Capture the **stable project production alias** `<project-name>.vercel.app` (e.g., `fxav-crew-pages-validation.vercel.app`) — NOT the per-deployment URL output by `vercel deploy`. Verify via `npx vercel project ls` showing the project's primary domain, OR by checking the Vercel dashboard for the project's stable production URL. The alias auto-points at the latest production deployment, so subsequent redeploys (Task 0.A.5 step 6) transparently route cron traffic to the current code + env vars."

- [ ] **Step 2b: Add Task 0.A.5 step 6a — verify baked cron URL is the stable alias (R5 F13 fix).** Insert after Task 0.A.5 step 6 (the trigger-redeploy step): "Inspect the baked URL in `cron.job.command` post-redeploy: in Supabase SQL editor, run `select jobname, substring(command from 'url := ''([^'']+)''') as baked_url from cron.job where jobname like 'fxav\_cron\_%' escape '\';`. **Confirm exactly 7 rows return** (matches the §2.3 job table), AND every row's `baked_url` matches the stable project alias `<project-name>.vercel.app` exactly — NOT a per-deployment URL with a hash + team suffix. If any row shows a per-deployment URL, T3 migration was applied with a stale GUC; correct via `alter database postgres set app.fxav_vercel_url = '<stable-alias>'; supabase db reset` (heavyweight) OR re-run the affected `cron.schedule()` calls manually with the corrected URL. **R6 F14 fix:** earlier draft used `'fxav\\_cron\\_%' escape '\\'` (double backslash). PostgreSQL standard SQL strings treat `\\` as a literal two-character string; `ESCAPE` clause requires a single-character escape; the doubled form errors. The single-backslash form matches all other LIKE sites established at R4 F10 fix."

- [ ] **Step 3: Amend `01-phase0-infra.md:75` (Task 0.A.4 Step 5) Vercel-Cron-rationale.** Existing text says: "Verify the deployment is 'Production-target' — Vercel project page should show the URL labeled 'Production' (not 'Preview'). This matters because Vercel Cron Jobs run only on production deployments (smoke test 3)." Replace the trailing clause: "This matters because runtime env vars (including `CRON_SECRET`) are scoped to production deployments; the pg_cron + pg_net architecture (M12.1) calls the production URL specifically, and a preview URL would 401 every cron firing." Preserves the production-vs-preview gate; updates the rationale.

- [ ] **Step 4: Amend `05-phase0-smokes.md` Smoke 3 instructions.** R1 F3 finding cited lines 33 + 36; R2 F5 (HIGH, conf implied) further required correct column names + acknowledging pg_net async semantics (`net.http_get()` enqueues and returns a request_id immediately; HTTP response lands later in `net._http_response`; a `cron.job_run_details.status = 'succeeded'` row proves only that the SQL command (enqueue) succeeded, NOT that Vercel returned 200 or that the handler ran). Read both lines first; verify the surrounding context. Replacements:

  - Line ~33 — replace "Wait one cron interval. Vercel Cron Jobs run only on production deployments — verify cron is enabled in `vercel.json` and that the production URL receives cron pings." with the following 3-layer observability stack:

    ```
    Wait one cron interval (5 min). Three independent observability layers
    must all agree before declaring Smoke 3 passing:

    1. **Scheduler fired (pg_cron):** Supabase SQL editor:
       ```sql
       select j.jobname, jrd.start_time, jrd.end_time, jrd.status,
              jrd.return_message, jrd.command
         from cron.job_run_details jrd
         join cron.job j on j.jobid = jrd.jobid
        where j.jobname = 'fxav_cron_sync'
        order by jrd.start_time desc limit 5;
       ```
       Expect at least one row created within the last 5 min with
       `status = 'succeeded'`. NOTE: `status = 'succeeded'` proves only that
       the SQL command (the `net.http_get(...)` enqueue) succeeded, NOT that
       the HTTP request reached Vercel or got a 2xx. pg_net is asynchronous.

    2. **HTTP request landed (pg_net) — correlated by timestamp proximity (R9 F24 fix):** Supabase SQL editor — TWO queries cross-referenced by timestamp:
       
       ```sql
       -- 2a: latest pg_net responses (response keyed by id; no URL column)
       select id, status_code, content_type, timed_out, error_msg, created
         from net._http_response
        order by created desc limit 10;
       
       -- 2b: cron.job_run_details with command (URL baked in by T3 format())
       select j.jobname, jrd.start_time, jrd.end_time, jrd.status, jrd.command
         from cron.job_run_details jrd
         join cron.job j on j.jobid = jrd.jobid
        where j.jobname like 'fxav\_cron\_%' escape '\'
          and jrd.start_time > now() - interval '10 minutes'
        order by jrd.start_time desc;
       ```
       
       **R9 F24 — why two queries, not a single JOIN:** earlier R8 F21 fix
       joined `net._http_response.id = net.http_request_queue.id` to recover
       URL per request_id. Per Supabase pg_net docs
       (https://supabase.com/docs/guides/database/extensions/pg_net):
       "waiting requests are stored in net.http_request_queue and deleted
       upon execution." Post-execution, the queue row is gone — the JOIN
       returns zero rows for successful requests, masking real cron path
       success as fake "no response" failure. R9 F24 caught this; corrected
       approach uses time-proximity correlation: query 2a returns response
       outcomes; query 2b returns cron firings with baked-in URL (cron job
       command is preserved in cron.job_run_details indefinitely). Operator
       cross-references by created/start_time within a 1-2 min window. For
       diagnostic-level certainty under concurrent cron firings, a durable
       audit table at enqueue time would be the structural answer — deferred
       to BACKLOG.md (not M12.1 scope).
       
       Expect a row created shortly after the cron.job_run_details
       start_time with `status_code = 200` (or whatever the handler returns
       on success) and `error_msg is null`. A `status_code = 401` means
       the Vault bearer does not match the Vercel CRON_SECRET env var
       (fail-loud). A `status_code = 405` means an HTTP-method mismatch
       (R1 F1 regression — should be impossible if T4 meta-test passes).
       A `timed_out = true` means the 300s (5 min, matches Vercel Functions'
       default maxDuration) pg_net timeout fired before Vercel responded.

    3. **Downstream side effect (the canonical proof):** the new show appears
       in `/admin` Active Shows panel. This is the binding pass criterion —
       layers 1 + 2 are diagnostic. A show appearing in /admin Active Shows
       means: pg_cron fired AND pg_net reached Vercel AND auth passed AND
       the parser ran AND the DB write under per-show advisory lock landed.
    ```

  - Line ~36 — replace "If show doesn't appear: check Vercel Cron logs, Drive service-account permissions, `WATCHED_FOLDER_ID` env var." with the new diagnostic ladder:

    ```
    If show doesn't appear, walk the 3 observability layers in order:

    Layer 1 (cron.job_run_details): if no recent row OR status='failed',
      the scheduler didn't fire — check that T3 migration applied (jobs
      exist via `select jobname from cron.job where jobname like 'fxav\_cron\_%' escape '\'`)
      and that the cluster's pg_cron worker is running (`select pid, application_name
      from pg_stat_activity where application_name like '%cron%'`).

    Layer 2 (net._http_response cross-referenced with cron.job_run_details
      by timestamp proximity per R9 F24): if no recent response row, the
      pg_net call enqueued but the worker hasn't processed it yet (rare;
      retry in 30-60s).
      - status_code=401: CRON_SECRET mismatch — verify Vercel Production env
        var matches `select decrypted_secret from vault.decrypted_secrets
        where name = 'fxav_cron_secret'` byte-for-byte.
      - status_code=405: HTTP method mismatch — should not happen if T4
        meta-test is green; check T3 SQL for net.http_post drift.
      - timed_out=true: handler took >300s (5 min, the pg_net timeout per
        R6 F16); check Vercel Logs for the
        /api/cron/sync route's actual execution time.
      - error_msg present: pg_net could not reach Vercel — DNS/network
        issue at Supabase egress.

    Layer 3 (Vercel Logs tab + downstream state):
      - 2xx but show not in Active Shows: handler ran but parser/DB write
        failed — check Drive service-account permissions, WATCHED_FOLDER_ID
        env var, supabase logs for advisory-lock contention.
    ```

  - If Smoke 4 (admin_alerts + AlertBanner) also references Vercel Cron observability, apply the same 3-layer observability-surface rewrite (search the file for "Vercel Cron" / "vercel.json" / "cron logs" before commit). The 3-layer observability pattern is reusable.

- [ ] **Step 5: Verify no other M12 plan files reference Vercel Cron post-amendment.** `rg -n 'Vercel Cron|vercel cron|x-vercel-cron' docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/` — expected: zero matches in the plan tree post-T5. Class-sweep verification per AGENTS.md "class-sweep before patching adversarial findings".

- [ ] **Step 6: Commit.**

  ```bash
  git add docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/05-phase0-smokes.md tests/cross-cutting/m12-plan-pg-cron-pivot-amendment.test.ts package.json
  git commit -m "$(cat <<'EOF'
  docs(plan-m12)+test(cross-cutting): insert Task 0.A.4.5 + sweep Vercel-Cron refs + amendment doc-guard (M12.1 T5)
  
  M12.1 sub-amendment wires the pg_cron + pg_net architecture into Phase
  0.A executor's task sequence + sweeps stale Vercel-Cron observability
  references that would mis-direct debugging post-pivot.
  
  01-phase0-infra.md:
  - New Task 0.A.4.5: Vault populate + GUC set + M12.1 migration apply
    against the validation Supabase project.
  - Task 0.A.5 step 3: add CRON_SECRET to Vercel Production-scope env-var
    set, byte-for-byte match against Vault entry.
  - Task 0.A.4 Step 5 (line 75): production-vs-preview rationale rewritten
    around CRON_SECRET env-var scoping (was: "Vercel Cron Jobs run only on
    production deployments").
  
  05-phase0-smokes.md:
  - Smoke 3 observability: pg_cron.job_run_details + Vercel Logs (was:
    vercel.json crons presence + Vercel Cron Logs).
  - Diagnostic guidance: 401 = CRON_SECRET mismatch; 5xx = handler error
    (replaces "check Vercel Cron logs").
  
  R1 F3 (conf 0.9) caught the smokes file; class-sweep also surfaced
  01-phase0-infra.md:75 as a 4th Vercel-Cron-assumption needing amendment.
  Verified zero remaining Vercel-Cron / vercel.json references in the M12
  plan tree post-amendment.
  
  M12 R70 APPROVE state is preserved (this edit is sub-amendment scope per
  M12.1 spec §3); M12.1's own convergence log tracks the amendment.
  EOF
  )"
  ```

**Risk class:** low — markdown documentation edit; no executable code. The risk is conceptual: (a) missing the Vault populate step means every cron firing 401s in validation; (b) missing the smoke-file sweep means executor follows stale debugging guidance.

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

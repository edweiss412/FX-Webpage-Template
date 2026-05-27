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
-- pg_net timeout: 300000ms (5 minutes) — passed as a FORWARD-COMPATIBLE
-- HINT to pg_net's worker. R11 F28 caveat: per Supabase pg_net API ref
-- at https://supabase.github.io/pg_net/api/, the timeout_milliseconds
-- parameter may be ignored in current versions (worker uses its own
-- internal default). M12.1 still passes 300000 so that when pg_net
-- honors the parameter, the value matches Vercel Functions' default
-- maxDuration (per session-context hook: "default function execution
-- timeout is now 300s on all plans"). Smoke 3 treats `timed_out` as
-- DIAGNOSTIC-ONLY observation since its firing is pg_net-version-
-- dependent. Layer 3 (downstream side effect — show appears in /admin
-- Active Shows) remains the SOLE BINDING PASS criterion regardless
-- of pg_net timeout behavior (per R10 F27 + R11 F28).
--
-- This migration is idempotent at the schedule layer: cron.unschedule() before
-- cron.schedule() for each fxav_cron_* job. The unschedule loop is scoped to
-- `jobname like 'fxav\_cron\_%' escape '\'` (escaped — underscores are literal,
-- not SQL LIKE single-char wildcards; R4 F10 fix) so any future non-fxav cron
-- added before T3 ships is preserved. As of plan-draft time the only
-- pre-existing non-fxav cron is the orphaned `cleanup-bootstrap-nonces`
-- (M11.5 G3 cutover dropped its target function + table but did not
-- cron.unschedule the job); T3 explicitly unschedules that orphan in a
-- separate guarded block below (R25 F49 + R26 F51).
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
  -- fxav prefix so any non-fxav cron added before T3 ships is preserved
  -- (the orphaned `cleanup-bootstrap-nonces` cron is handled by the
  -- explicit guarded block below, NOT swept by this LIKE loop).
  perform cron.unschedule(jobname)
    from cron.job
    where jobname like 'fxav\_cron\_%' escape '\';

  -- R25 F49 fix: unschedule the orphaned `cleanup-bootstrap-nonces` cron
  -- if it's still scheduled. M11.5 G3 cutover migration
  -- 20260523000099_cutover_drop_m9_5.sql dropped public.cleanup_bootstrap_nonces()
  -- + bootstrap_nonces table but did NOT cron.unschedule the job that calls them.
  -- The orphaned cron has been firing every 5 min since M11.5 G3 cutover, logging
  -- "function does not exist" errors. M12.1 piggybacks the cleanup since we're
  -- already touching cron.* surface here. Idempotent: cron.unschedule(jobname)
  -- returns boolean (true if found + removed; false if absent) — safe to re-run.
  if exists(select 1 from cron.job where jobname = 'cleanup-bootstrap-nonces') then
    perform cron.unschedule('cleanup-bootstrap-nonces');
  end if;

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

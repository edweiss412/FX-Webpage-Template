-- M12.2 Phase B3 Task 4.2 — schedule notify cron jobs via pg_cron + pg_net.
--
-- SCOPED unschedule of ONLY the two notify jobs. Do not sweep fxav_cron_* here:
-- that fleet is owned by 20260527000003_schedule_cron_jobs.sql (AC-B3.14b).

do $$
declare
  vercel_url text := current_setting('app.fxav_vercel_url', true);
  pg_net_present boolean;
  vault_secret_present boolean;
begin
  if vercel_url is null or vercel_url = '' then
    raise exception 'M12.2 B3 notify cron: app.fxav_vercel_url GUC must be set before applying this migration. Run: alter database <db> set app.fxav_vercel_url = ''https://<your-app>.vercel.app''; then reconnect and re-apply.';
  end if;

  select exists(select 1 from pg_extension where extname = 'pg_net') into pg_net_present;
  if not pg_net_present then
    raise exception 'M12.2 B3 notify cron: pg_net extension is required. Apply 20260527000001_enable_pg_net.sql before re-applying this migration.';
  end if;

  select exists(select 1 from vault.secrets where name = 'fxav_cron_secret') into vault_secret_present;
  if not vault_secret_present then
    raise exception 'M12.2 B3 notify cron: supabase_vault entry fxav_cron_secret is required. Apply 20260527000002_cron_secret_vault.sql before re-applying this migration.';
  end if;

  if exists(select 1 from cron.job where jobname = 'fxav_cron_notify_realtime') then
    perform cron.unschedule('fxav_cron_notify_realtime');
  end if;

  if exists(select 1 from cron.job where jobname = 'fxav_cron_notify_digest') then
    perform cron.unschedule('fxav_cron_notify_digest');
  end if;

  perform cron.schedule('fxav_cron_notify_realtime', '*/5 * * * *', format($body$
    select net.http_get(
      url := %L,
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
      timeout_milliseconds := 300000
    );
  $body$, vercel_url || '/api/cron/notify?job=realtime'));

  perform cron.schedule('fxav_cron_notify_digest', '0 * * * *', format($body$
    select net.http_get(
      url := %L,
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
      timeout_milliseconds := 300000
    );
  $body$, vercel_url || '/api/cron/notify?job=digest'));
end$$;

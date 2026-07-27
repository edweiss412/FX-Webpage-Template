-- Reschedule fxav_cron_refresh_watch from hourly to a 15-minute cadence at a
-- 7-minute offset (spec 2026-07-26-watch-reconcile-backoff-v2 §2.1/§3.1).
-- Minutes 7/22/37/52 collide with none of the ten live schedules.
-- Plumbing mirrors 20260527000003_schedule_cron_jobs.sql:43-58 (vercel_url GUC +
-- prereq check; ONE format argument), NOT its global fxav_cron_* unschedule loop.
-- Apply-twice safe: unschedule-if-exists, then schedule.
do $$
declare
  vercel_url text := current_setting('app.fxav_vercel_url', true);
begin
  if vercel_url is null or vercel_url = '' then
    raise exception 'reschedule_refresh_watch: app.fxav_vercel_url GUC must be set before applying this migration (see 20260527000003_schedule_cron_jobs.sql).';
  end if;

  if exists (select 1 from cron.job where jobname = 'fxav_cron_refresh_watch') then
    perform cron.unschedule('fxav_cron_refresh_watch');
  end if;

  perform cron.schedule('fxav_cron_refresh_watch', '7,22,37,52 * * * *', format($body$
    select net.http_get(
      url := %L,
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
      timeout_milliseconds := 300000
    );
  $body$, vercel_url || '/api/cron/refresh-watch'));
end $$;

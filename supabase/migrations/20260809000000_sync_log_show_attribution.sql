-- 2026-08-09 sync_log show attribution: indexes for the per-show read, and retention.
--
-- `sync_log.show_id` and `duration_ms` are declared in the ratified master spec and
-- were populated by no routine writer, so `pnpm observe synclog --show <uuid>`
-- returned nothing for every show — an empty result indistinguishable from health.
-- Probe before the change: 5073 rows, count(show_id) = 0. The three writers now
-- resolve show_id from drive_file_id at write time; this migration makes the
-- resulting per-show read cheap and stops the table growing without bound.

-- The per-show read (`querySyncLog` filters show_id, orders occurred_at desc) and the
-- per-file read (`--file`) each get a covering index. DESC matches the query's own
-- ordering, so the index is walked rather than sorted.
create index if not exists sync_log_show_id_idx
  on public.sync_log (show_id, occurred_at desc);

create index if not exists sync_log_drive_file_id_idx
  on public.sync_log (drive_file_id, occurred_at desc);

-- The `dev.*` shadow schema is local-seed infrastructure and does not exist on the
-- validation or production projects. `to_regclass` RETURNS NULL for a missing
-- relation rather than raising, which is what makes this guard safe to run
-- everywhere — an ungated `create index on dev.sync_log` would abort the migration
-- on every project that has no dev schema.
do $$
begin
  if to_regclass('dev.sync_log') is not null then
    create index if not exists sync_log_show_id_idx on dev.sync_log (show_id, occurred_at desc);
    create index if not exists sync_log_drive_file_id_idx
      on dev.sync_log (drive_file_id, occurred_at desc);
  end if;
end;
$$;

-- Retention. Same security posture as public.prune_app_events
-- (20260629000002_app_events.sql:32-45): security definer with a pinned search_path,
-- executable by service_role only. The default is 60 days and the cron command below
-- calls it with NO argument, so the default is the value that actually ships — a
-- mutant changing it would otherwise satisfy every explicit-cutoff test.
create or replace function public.prune_sync_log(retain interval default interval '60 days')
  returns integer
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.sync_log where occurred_at < now() - retain returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.prune_sync_log(interval) from public, anon, authenticated;
grant execute on function public.prune_sync_log(interval) to service_role;

-- Daily retention prune, mirroring the app_events cron. The job name is deliberately
-- OUTSIDE the `fxav_cron_` namespace: that prefix is the pg-cron-coverage contract
-- for the Vercel-route net.http_get jobs, and this is a pure-SQL maintenance cron.
-- The self-guarded unschedule makes it idempotent on its own.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync_log_prune') then
    perform cron.unschedule('sync_log_prune');
  end if;
  perform cron.schedule(
    'sync_log_prune',
    '23 4 * * *',
    'select public.prune_sync_log();'
  );
end;
$$;

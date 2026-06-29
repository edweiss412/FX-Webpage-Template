-- Phase 1 centralized logging: durable, queryable, append-only server-event store.

create table if not exists public.app_events (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  level         text not null check (level in ('info','warn','error')),
  source        text not null,
  message       text not null,
  code          text,
  request_id    text,
  show_id       uuid references public.shows(id) on delete set null,
  drive_file_id text,
  actor_hash    text,
  context       jsonb not null default '{}'::jsonb
);

create index if not exists app_events_occurred_at_idx on public.app_events (occurred_at desc);
create index if not exists app_events_request_id_idx  on public.app_events (request_id) where request_id is not null;
create index if not exists app_events_show_id_idx      on public.app_events (show_id, occurred_at desc);
create index if not exists app_events_level_idx        on public.app_events (level, occurred_at desc);
create index if not exists app_events_code_idx         on public.app_events (code, occurred_at desc) where code is not null;

-- Lockdown (AGENTS.md cross-cutting #1 / BL-ADMIN-POSTGREST-DML-LOCKDOWN).
-- service_role retains ALL DML — REQUIRED by tests/db/postgrest-dml-lockdown.test.ts:437-472
-- (Layer 1 asserts service_role DELETE/INSERT/SELECT/UPDATE = true for every registered table).
-- Append-only is enforced STRUCTURALLY (tests/log/_metaAppEventsWriter.test.ts writer guard
-- + the sole prune_app_events delete), not at the grant layer.
revoke all on table public.app_events from public, anon, authenticated;
grant all privileges on table public.app_events to service_role;
alter table public.app_events enable row level security; -- no policy; service_role bypasses RLS

create or replace function public.prune_app_events(retain interval default interval '60 days')
  returns integer
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.app_events where occurred_at < now() - retain returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.prune_app_events(interval) from public, anon, authenticated;
grant execute on function public.prune_app_events(interval) to service_role;

-- Daily retention prune (SQL-body cron, bootstrap_nonces precedent :33-40). Idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fxav_cron_prune_app_events') then
    perform cron.unschedule('fxav_cron_prune_app_events');
  end if;
  perform cron.schedule(
    'fxav_cron_prune_app_events',
    '17 4 * * *',
    'select public.prune_app_events();'
  );
end;
$$;

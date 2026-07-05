-- Bell notification center state (spec 2026-07-05-bell-notification-center §3).
-- Per-admin read marks + badge watermark. FULL PostgREST lockdown (SELECT
-- included, spec §3.3): rows expose per-admin behavior; all access flows
-- through service-role server routes. Write path is greatest-wins monotonic
-- RPCs (spec §3.1/§3.2) because PostgREST upsert cannot express greatest().

create table if not exists public.admin_alert_reads (
  alert_id uuid not null references public.admin_alerts(id) on delete cascade,
  admin_email text not null,
  read_at timestamptz not null default now(),
  primary key (alert_id, admin_email),
  constraint admin_alert_reads_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);

create table if not exists public.admin_bell_state (
  admin_email text primary key,
  opened_at timestamptz not null default now(),
  constraint admin_bell_state_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);

alter table public.admin_alert_reads enable row level security;
alter table public.admin_bell_state enable row level security;
-- No client policies on purpose: service-role only (spec §3.3).
revoke all on table public.admin_alert_reads from anon, authenticated;
revoke all on table public.admin_bell_state from anon, authenticated;

-- Dev-tunable feed window/cap (spec §3.4). Column creation and named-CHECK
-- recreation are SEPARATE statements so reapply against existing columns
-- still recreates constraints (apply-twice idempotent).
alter table public.app_settings
  add column if not exists bell_history_days integer not null default 30,
  add column if not exists bell_feed_cap integer not null default 50;
alter table public.app_settings
  drop constraint if exists app_settings_bell_history_days_range,
  add constraint app_settings_bell_history_days_range
    check (bell_history_days between 1 and 365),
  drop constraint if exists app_settings_bell_feed_cap_range,
  add constraint app_settings_bell_feed_cap_range
    check (bell_feed_cap between 10 and 200);

-- Monotonic write RPCs (greatest-wins; never regress a newer stamp).
create or replace function public.bell_mark_opened(
  p_admin_email text,
  p_seen_through timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_bell_state (admin_email, opened_at)
  values (p_admin_email, p_seen_through)
  on conflict (admin_email) do update
    set opened_at = greatest(public.admin_bell_state.opened_at, excluded.opened_at);
$$;

create or replace function public.bell_mark_read(
  p_alert_id uuid,
  p_admin_email text,
  p_seen_activity_at timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_alert_reads (alert_id, admin_email, read_at)
  values (p_alert_id, p_admin_email, p_seen_activity_at)
  on conflict (alert_id, admin_email) do update
    set read_at = greatest(public.admin_alert_reads.read_at, excluded.read_at);
$$;

revoke all on function public.bell_mark_opened(text, timestamptz) from public, anon, authenticated;
grant execute on function public.bell_mark_opened(text, timestamptz) to service_role;
revoke all on function public.bell_mark_read(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bell_mark_read(uuid, text, timestamptz) to service_role;

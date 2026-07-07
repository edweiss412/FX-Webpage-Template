-- Telemetry console redesign — two read-only aggregate functions for the
-- /admin/dev/telemetry overview strip. Both STABLE (no writes): NOT subject to
-- PostgREST DML lockdown. service_role already reads app_events + admin_alerts.
-- Spec: docs/superpowers/specs/2026-07-06-telemetry-console-redesign.md §5.1.
-- Idempotent (create or replace + idempotent revoke/grant); apply-twice safe.

-- 24h event-volume aggregate: total + per-level counts + 24 hourly buckets.
create or replace function public.admin_event_stats_24h(_now timestamptz default now())
returns table (total bigint, error_count bigint, warn_count bigint,
               info_count bigint, buckets int[])
language sql stable
as $$
  with win as (
    select date_trunc('hour', _now) as cur_hour
  ),
  -- MATERIALIZED: one indexed scan of the 24h window, reused below (no cross join).
  ev as materialized (
    select occurred_at, level
    from public.app_events, win
    where occurred_at >= win.cur_hour - interval '23 hours'
      and occurred_at <  win.cur_hour + interval '1 hour'
  ),
  totals as (                                       -- ONE scan of ev, filtered aggregates
    select count(*)::bigint                                as total,
           count(*) filter (where level = 'error')::bigint as error_count,
           count(*) filter (where level = 'warn')::bigint  as warn_count,
           count(*) filter (where level = 'info')::bigint  as info_count
    from ev
  ),
  per_hour as (                                     -- group events into hour buckets ONCE
    select date_trunc('hour', occurred_at) as h, count(*)::int as c
    from ev group by 1
  ),
  hours as (                                        -- the 24 target hours (0 oldest, 23 current)
    select gs.h_idx,
           (select cur_hour from win) - make_interval(hours => 23 - gs.h_idx) as h_ts
    from generate_series(0, 23) as gs(h_idx)
  ),
  bucketed as (                                     -- 24 rows LEFT JOIN <=24 grouped rows
    select hours.h_idx, coalesce(per_hour.c, 0) as c
    from hours left join per_hour on per_hour.h = hours.h_ts
  )
  select totals.total, totals.error_count, totals.warn_count, totals.info_count,
         (select array_agg(c order by h_idx)::int[] from bucketed)
  from totals;
$$;

revoke all on function public.admin_event_stats_24h(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_event_stats_24h(timestamptz) to service_role;

-- Single-snapshot alert summary: total + degraded from ONE scan (no count race).
create or replace function public.admin_alert_summary(_health_codes text[], _degraded_codes text[])
returns table (total bigint, degraded bigint)
language sql stable
as $$
  select
    count(*)::bigint,
    count(*) filter (where code = any(_degraded_codes))::bigint
  from public.admin_alerts
  where resolved_at is null and code = any(_health_codes);
$$;

revoke all on function public.admin_alert_summary(text[], text[]) from public, anon, authenticated;
grant execute on function public.admin_alert_summary(text[], text[]) to service_role;

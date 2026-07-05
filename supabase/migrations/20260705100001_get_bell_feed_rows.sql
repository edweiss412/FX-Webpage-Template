-- Entry-grain bell feed read (spec §6.1, adversarial R5/R6/R9/R10 shape).
-- One meta row (is_meta=true: seen_through = this snapshot's now(), cap flags)
-- + zero-or-more entry rows, one per (coalesce(show_id::text,''), code) key.
-- Tier exclusion applies INSIDE both arms BEFORE each cap.
create or replace function public.get_bell_feed_rows(
  p_history_days int,
  p_cap int,
  p_excluded_codes text[],
  p_admin_email text
)
returns table (
  is_meta boolean,
  seen_through timestamptz,
  active_hit_cap boolean,
  history_hit_cap boolean,
  viewer_opened_at timestamptz,
  id uuid,
  code text,
  show_id uuid,
  slug text,
  context jsonb,
  occurrence_count integer,
  raised_at timestamptz,
  last_seen_at timestamptz,
  resolved_at timestamptz,
  resolved_occurrence_sum bigint,
  is_active boolean,
  viewer_read_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_excluded_codes is null then
    raise exception 'get_bell_feed_rows: p_excluded_codes must not be null';
  end if;
  if p_admin_email is null or p_admin_email = '' then
    raise exception 'get_bell_feed_rows: p_admin_email must not be empty';
  end if;
  if p_history_days is null or p_history_days < 1 or p_history_days > 365 then
    raise exception 'get_bell_feed_rows: p_history_days out of range';
  end if;
  if p_cap is null or p_cap < 10 or p_cap > 200 then
    raise exception 'get_bell_feed_rows: p_cap out of range';
  end if;

  return query
  with resolved_sums as (
    select coalesce(a.show_id::text, '') as key_show,
           a.code as key_code,
           sum(a.occurrence_count)::bigint as resolved_sum
    from public.admin_alerts a
    where a.resolved_at is not null
      and a.resolved_at >= now() - make_interval(days => p_history_days)
      and a.code <> all(p_excluded_codes)
    group by 1, 2
  ),
  active_probe as (
    -- p_cap+1 probe: distinguishes exactly-at-cap (hit_cap=false) from
    -- over-cap (hit_cap=true). Counting a capped CTE cannot tell them apart.
    select a.*
    from public.admin_alerts a
    where a.resolved_at is null
      and a.code <> all(p_excluded_codes)
    order by greatest(a.raised_at, a.last_seen_at) desc
    limit p_cap + 1
  ),
  active as (
    -- ordering restated: LIMIT over an unordered subselect is not contractually
    -- the top-N of the probe (plan-review R3 finding 1). Qualified with the
    -- CTE alias: bare `raised_at`/`last_seen_at` are ambiguous against the
    -- plpgsql variables plpgsql auto-declares for this function's RETURNS
    -- TABLE column names.
    select * from active_probe
    order by greatest(active_probe.raised_at, active_probe.last_seen_at) desc
    limit p_cap
  ),
  history as (
    select distinct on (coalesce(a.show_id::text, ''), a.code) a.*
    from public.admin_alerts a
    where a.resolved_at is not null
      and a.resolved_at >= now() - make_interval(days => p_history_days)
      and a.code <> all(p_excluded_codes)
      -- a key with ANY open row is "active"; its history folds into the
      -- active entry's occurrence sum (spec §6.1, uncapped on purpose so a
      -- cap-evicted active key doesn't ghost back in as history)
      and not exists (
        select 1 from public.admin_alerts o
        where o.resolved_at is null
          and coalesce(o.show_id::text, '') = coalesce(a.show_id::text, '')
          and o.code = a.code
      )
    order by coalesce(a.show_id::text, ''), a.code, a.resolved_at desc
  ),
  history_probe as (
    select h.* from history h
    order by h.resolved_at desc
    limit p_cap + 1
  ),
  history_capped as (
    -- Qualified for the same plpgsql-variable-ambiguity reason as `active` above.
    select * from history_probe
    order by history_probe.resolved_at desc
    limit p_cap
  )
  select true, now(),
         (select count(*) from active_probe) > p_cap,
         (select count(*) from history_probe) > p_cap,
         (select st.opened_at from public.admin_bell_state st
           where st.admin_email = p_admin_email),
         null::uuid, null::text, null::uuid, null::text, null::jsonb,
         null::integer, null::timestamptz, null::timestamptz, null::timestamptz,
         null::bigint, null::boolean, null::timestamptz
  union all
  select false, null, null, null, null,
         a.id, a.code, a.show_id, s.slug, a.context,
         a.occurrence_count, a.raised_at, a.last_seen_at, a.resolved_at,
         coalesce(rs.resolved_sum, 0), true, r.read_at
  from active a
  left join public.shows s on s.id = a.show_id
  left join resolved_sums rs
    on rs.key_show = coalesce(a.show_id::text, '') and rs.key_code = a.code
  left join public.admin_alert_reads r
    on r.alert_id = a.id and r.admin_email = p_admin_email
  union all
  select false, null, null, null, null,
         h.id, h.code, h.show_id, s.slug, h.context,
         h.occurrence_count, h.raised_at, h.last_seen_at, h.resolved_at,
         coalesce(rs.resolved_sum, h.occurrence_count::bigint), false, r.read_at
  from history_capped h
  left join public.shows s on s.id = h.show_id
  left join resolved_sums rs
    on rs.key_show = coalesce(h.show_id::text, '') and rs.key_code = h.code
  left join public.admin_alert_reads r
    on r.alert_id = h.id and r.admin_email = p_admin_email;
end;
$$;

revoke all on function public.get_bell_feed_rows(int, int, text[], text) from public, anon, authenticated;
grant execute on function public.get_bell_feed_rows(int, int, text[], text) to service_role;

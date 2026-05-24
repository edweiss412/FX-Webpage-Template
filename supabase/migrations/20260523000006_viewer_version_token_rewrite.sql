-- R5/R7: replace the retired crew_member_auth contribution with picker_epoch.
-- R41-R17: include picker_epoch as a suffix so rapid same-millisecond resets
-- still produce distinct freshness tokens.

create or replace function public.viewer_version_token(p_show_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    to_char(greatest(
      coalesce((select extract(epoch from last_synced_at) * 1000
                from public.shows where id = p_show_id), 0),
      coalesce((select extract(epoch from max(last_changed_at)) * 1000
                from public.crew_members where show_id = p_show_id), 0),
      coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000
                from public.shows where id = p_show_id), 0)
    ), 'FM999999999999999')
    || ':'
    || coalesce((select picker_epoch::text from public.shows where id = p_show_id), '0');
$$;

revoke all on function public.viewer_version_token(uuid) from public;
grant execute on function public.viewer_version_token(uuid)
  to authenticated, anon, service_role;

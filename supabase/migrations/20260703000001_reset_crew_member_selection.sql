-- Per-crew picker reset (2026-07-03): admin reset of ONE crew member's picker selection.
-- SECURITY DEFINER; the ONLY advisory-lock holder for this path — callers MUST NOT wrap it
-- in a JS-side per-show lock. Unlike reset_picker_epoch_atomic (which mutates shows and calls
-- publish_show_invalidation), this mutates crew_members, whose AFTER UPDATE statement trigger
-- (crew_members_publish_invalidation) already publishes — so NO explicit helper call.
create or replace function public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_reset_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'reset_crew_member_selection is admin-only';
  end if;

  select drive_file_id
    into v_drive_file_id
    from public.shows
   where id = p_show_id;

  -- Missing show → typed not-found (NULL), NOT a raise, so both not-found paths
  -- (missing show, missing/wrong-show crew member) stay discriminable at the JS boundary.
  if v_drive_file_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.crew_members
     set selections_reset_at = clock_timestamp()
   where id = p_crew_member_id
     and show_id = p_show_id
   returning selections_reset_at into v_reset_at;

  -- v_reset_at is NULL when no row matched (bad id / wrong show / removed member).
  return v_reset_at;
end;
$$;

revoke all on function public.reset_crew_member_selection(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.reset_crew_member_selection(uuid, uuid) to authenticated;

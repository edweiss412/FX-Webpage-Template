-- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: add the DEF-1 lifecycle guard (byte-identical to
-- 20260601000001_b2_def1_lifecycle_guard.sql) to reset_crew_member_selection. Follow-on
-- create-or-replace; the guard is a POST-LOCK re-read (R32 TOCTOU) — refuses archived
-- (SHOW_ARCHIVED_IMMUTABLE) and unpublished (FINALIZE_OWNED_SHOW if finalize-owned, else
-- SHOW_NOT_PUBLISHED). Single in-RPC advisory-lock holder unchanged (AGENTS.md invariant 2).
-- NULL not-found contract preserved (missing show / bad crew id → NULL).
create or replace function public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_reset_at timestamptz;
  v_archived boolean;
  v_published boolean;
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

  -- Missing show → typed not-found (NULL), NOT a raise.
  if v_drive_file_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- DEF-1 guard (post-lock re-read). Byte-identical to 20260601000001_b2_def1_lifecycle_guard.sql:36-49.
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
  if not v_published then
    if public.readfinalizeowned_b2(p_show_id) then
      raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
    end if;
    raise exception using errcode = 'P0001', message = 'SHOW_NOT_PUBLISHED';
  end if;

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

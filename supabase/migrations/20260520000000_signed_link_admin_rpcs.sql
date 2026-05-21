-- M9.5 signed-link admin controls.
--
-- Both RPCs are SECURITY DEFINER boundaries gated by public.is_admin().
-- They are the sole holders of the per-show advisory lock on the admin
-- click path; callers must not wrap these RPCs in withShowAdvisoryLock.

create or replace function public.revoke_all_links_rpc(
  p_show_id uuid,
  p_crew_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_show public.shows%rowtype;
  v_row public.crew_member_auth%rowtype;
begin
  if not public.is_admin() then
    raise exception 'permission denied: signed-link admin RPC requires is_admin()'
      using errcode = '42501';
  end if;

  select * into v_show
    from public.shows
   where id = p_show_id;
  if not found then
    return jsonb_build_object('status', 'show_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_show.drive_file_id));

  -- Codex R1 M1 fix: crew_member_auth rows persist after crew removal
  -- (no FK to crew_members; correlation is (show_id, crew_name) only).
  -- A stale or forged admin submit can name a crew row that the sync
  -- removed but whose auth row still exists. Require the active roster
  -- row inside the advisory lock so revoke-all on an orphan auth row
  -- returns crew_member_not_found rather than touching the row.
  if not exists (
    select 1
      from public.crew_members
     where show_id = p_show_id
       and name = p_crew_name
  ) then
    return jsonb_build_object('status', 'crew_member_not_found');
  end if;

  select * into v_row
    from public.crew_member_auth
   where show_id = p_show_id
     and crew_name = p_crew_name;
  if not found then
    return jsonb_build_object('status', 'crew_member_not_found');
  end if;

  if v_row.current_token_version = v_row.revoked_below_version then
    return jsonb_build_object('status', 'no_live_link', 'row', row_to_json(v_row));
  end if;

  update public.crew_member_auth
     set revoked_below_version = current_token_version
   where show_id = p_show_id
     and crew_name = p_crew_name
   returning * into v_row;

  return jsonb_build_object('status', 'ok', 'row', row_to_json(v_row));
end;
$$;

drop function if exists public.revoke_all_links_rpc(uuid, text, uuid);
revoke all on function public.revoke_all_links_rpc(uuid, text) from public;
grant execute on function public.revoke_all_links_rpc(uuid, text)
  to authenticated, service_role;

create or replace function public.issue_new_link_rpc(
  p_show_id uuid,
  p_crew_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_show public.shows%rowtype;
  v_row public.crew_member_auth%rowtype;
begin
  if not public.is_admin() then
    raise exception 'permission denied: signed-link admin RPC requires is_admin()'
      using errcode = '42501';
  end if;

  select * into v_show
    from public.shows
   where id = p_show_id;
  if not found then
    return jsonb_build_object('status', 'show_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_show.drive_file_id));

  -- Codex R1 M1 fix: validate the active crew_members row exists for
  -- (show_id, crew_name) BEFORE the UPDATE. Without this guard, a
  -- stale UI form (or forged FormData) submitted after sync removes
  -- a crew member would re-activate the orphaned auth row to a live
  -- token version, emit an "issued" audit log, and diverge auth state
  -- from the roster — even though there is no crew_members row to
  -- receive a link. The check runs inside the per-show advisory lock
  -- so it linearizes correctly against concurrent sync apply.
  if not exists (
    select 1
      from public.crew_members
     where show_id = p_show_id
       and name = p_crew_name
  ) then
    return jsonb_build_object('status', 'crew_member_not_found');
  end if;

  update public.crew_member_auth
     set current_token_version = max_issued_version + 1,
         max_issued_version = max_issued_version + 1
   where show_id = p_show_id
     and crew_name = p_crew_name
   returning * into v_row;

  if not found then
    return jsonb_build_object('status', 'crew_member_not_found');
  end if;

  return jsonb_build_object('status', 'ok', 'row', row_to_json(v_row));
end;
$$;

drop function if exists public.issue_new_link_rpc(uuid, text, uuid);
revoke all on function public.issue_new_link_rpc(uuid, text) from public;
grant execute on function public.issue_new_link_rpc(uuid, text)
  to authenticated, service_role;

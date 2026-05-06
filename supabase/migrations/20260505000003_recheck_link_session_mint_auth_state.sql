drop function if exists public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
);

create or replace function public.mint_link_session_if_active_kid_matches(
  p_token text,
  p_show_id uuid,
  p_crew_member_id uuid,
  p_jwt_token_version int,
  p_signing_key_id text,
  p_expires_at timestamptz,
  p_last_active_at timestamptz,
  p_verified_kid text
)
returns table(status text, token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_crew_name text;
  v_current_token_version int;
  v_revoked_below_version int;
  v_active_signing_key_id text;
begin
  select shows.drive_file_id
    into v_drive_file_id
  from public.shows
  where shows.id = p_show_id;

  if v_drive_file_id is null then
    return query select 'no_crew_match'::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  select active_signing_key_id
    into v_active_signing_key_id
  from public.app_settings
  where id = 'default';

  if v_active_signing_key_id is distinct from p_verified_kid then
    return query select 'key_rotated'::text, null::text;
    return;
  end if;

  select cm.name
    into v_crew_name
  from public.crew_members cm
  where cm.id = p_crew_member_id
    and cm.show_id = p_show_id
  for update;

  if v_crew_name is null then
    return query select 'no_crew_match'::text, null::text;
    return;
  end if;

  select cma.current_token_version, cma.revoked_below_version
    into v_current_token_version, v_revoked_below_version
  from public.crew_member_auth cma
  where cma.show_id = p_show_id
    and cma.crew_name = v_crew_name
  for update;

  if v_current_token_version is null
     or p_jwt_token_version <> v_current_token_version then
    return query select 'version_mismatch'::text, null::text;
    return;
  end if;

  if p_jwt_token_version <= v_revoked_below_version then
    return query select 'revoked_floor'::text, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.revoked_links rl
    where rl.show_id = p_show_id
      and rl.crew_name = v_crew_name
      and rl.token_version = p_jwt_token_version
  ) then
    return query select 'revoked_surgical'::text, null::text;
    return;
  end if;

  return query
    insert into public.link_sessions (
      token,
      show_id,
      crew_member_id,
      jwt_token_version,
      signing_key_id,
      expires_at,
      last_active_at
    )
    values (
      p_token,
      p_show_id,
      p_crew_member_id,
      p_jwt_token_version,
      p_signing_key_id,
      p_expires_at,
      p_last_active_at
    )
    returning 'minted'::text, link_sessions.token;
end;
$$;

revoke all on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) to service_role;

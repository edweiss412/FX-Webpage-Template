-- M5 adversarial-review fix: redeem-link mutations must take the
-- per-show advisory lock in the same database transaction that performs
-- the mutation. A JS-side withShowAdvisoryLock wrapper uses a separate
-- Postgres connection from Supabase REST/RPC calls, so it does not
-- actually serialize those mutations.

drop function if exists public.consume_bootstrap_nonce_atomic(uuid, text, timestamptz);

create or replace function public.consume_bootstrap_nonce_atomic(
  p_show_id uuid,
  p_nonce_hash text,
  p_consumed_at timestamptz
)
returns table(status text, consumed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
begin
  select shows.drive_file_id
    into v_drive_file_id
  from public.shows
  where shows.id = p_show_id;

  if v_drive_file_id is null then
    return query select 'show_unavailable'::text, null::timestamptz;
    return;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('show:' || v_drive_file_id)) then
    return query select 'busy'::text, null::timestamptz;
    return;
  end if;

  return query
    update public.bootstrap_nonces
       set consumed_at = p_consumed_at
     where bootstrap_nonces.nonce_hash = p_nonce_hash
       and bootstrap_nonces.show_id = p_show_id
       and bootstrap_nonces.consumed_at is null
    returning 'consumed'::text, bootstrap_nonces.consumed_at;

  if not found then
    return query select 'nonce_unavailable'::text, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.consume_bootstrap_nonce_atomic(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_bootstrap_nonce_atomic(
  uuid, text, timestamptz
) to service_role;

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
returns table(token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
begin
  select shows.drive_file_id
    into v_drive_file_id
  from public.shows
  where shows.id = p_show_id;

  if v_drive_file_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

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
    select
      p_token,
      p_show_id,
      p_crew_member_id,
      p_jwt_token_version,
      p_signing_key_id,
      p_expires_at,
      p_last_active_at
    from public.app_settings
    where id = 'default'
      and active_signing_key_id = p_verified_kid
    returning link_sessions.token;
end;
$$;

revoke all on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) to service_role;

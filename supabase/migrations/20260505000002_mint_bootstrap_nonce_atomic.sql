create or replace function public.mint_bootstrap_nonce_atomic(
  p_show_id uuid,
  p_nonce_hash text,
  p_issued_at timestamptz
)
returns table(status text, signing_key_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_published boolean;
  v_signing_key_id text;
begin
  select shows.drive_file_id, shows.published
    into v_drive_file_id, v_published
  from public.shows
  where shows.id = p_show_id;

  if v_drive_file_id is null or v_published is not true then
    return query select 'show_unavailable'::text, null::text;
    return;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('show:' || v_drive_file_id)) then
    return query select 'busy'::text, null::text;
    return;
  end if;

  select active_signing_key_id
    into v_signing_key_id
  from public.app_settings
  where id = 'default';

  if v_signing_key_id is null or length(v_signing_key_id) = 0 then
    return query select 'signing_key_unavailable'::text, null::text;
    return;
  end if;

  insert into public.bootstrap_nonces (
    nonce_hash,
    show_id,
    issued_at,
    signing_key_id
  )
  values (
    p_nonce_hash,
    p_show_id,
    p_issued_at,
    v_signing_key_id
  );

  return query select 'minted'::text, v_signing_key_id;
end;
$$;

revoke all on function public.mint_bootstrap_nonce_atomic(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.mint_bootstrap_nonce_atomic(
  uuid, text, timestamptz
) to service_role;

-- M5 round-9 §A MEDIUM: closes the active-signing-key rotation race in
-- /api/auth/redeem-link. R9 #3 added a TS-side fresh re-read of
-- app_settings.active_signing_key_id immediately before the INSERT,
-- which narrowed but did not close the window. This RPC moves the
-- check + insert into a single Postgres statement so a rotation
-- committed between the verifyLinkJwt() success and the INSERT cannot
-- mint a session under the retired kid: zero rows means rotation,
-- which the route maps to LINK_REDEEM_KEY_ROTATED.
--
-- Apply-twice idempotency via DROP FUNCTION IF EXISTS + CREATE.
-- SECURITY DEFINER + search_path = public, pg_temp lockdown follows
-- the R7 + R8 hardening pattern.
-- EXECUTE locked down to service_role only — anon/authenticated have
-- no business minting link_sessions rows directly via Supabase REST,
-- and Supabase's default privileges grant EXECUTE to those roles
-- unless explicitly revoked.

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
language sql
security definer
set search_path = public, pg_temp
as $$
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
  returning token;
$$;

revoke all on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
) to service_role;

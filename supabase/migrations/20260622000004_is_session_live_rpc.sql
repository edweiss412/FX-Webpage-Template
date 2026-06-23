-- 20260622000004_is_session_live_rpc.sql (nav-perf phase 1, B1.5)
--
-- is_session_live(): immediate admin-session revocation for the admin gate.
-- After getClaims() verifies the admin JWT LOCALLY (ES256, no Auth-server
-- round-trip), requireAdmin calls this to confirm the session row still
-- exists in auth.sessions (GoTrue deletes it on sign-out / global
-- revocation / user deletion), so a revoked / stolen / compromised session
-- is cut off IMMEDIATELY rather than valid until token TTL. is_admin()
-- keeps authorization live alongside it; both RPCs run in parallel.
--
-- SECURITY DEFINER so it can read auth.sessions. The body reads the
-- session_id claim from auth.jwt() and returns whether a matching live
-- session row exists. Empty / missing claim → nullif → NULL uuid → no
-- match → false (fail-closed: a token with no session_id is not live).
--
-- Idempotent; apply-twice safe (create or replace + revoke/grant).
create or replace function public.is_session_live()
  returns boolean language sql stable security definer
  set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;
revoke all on function public.is_session_live() from public;
grant execute on function public.is_session_live() to authenticated;

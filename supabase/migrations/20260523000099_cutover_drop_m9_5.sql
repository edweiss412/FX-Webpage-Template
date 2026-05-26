-- M11.5 G3 cutover: remove the retired M9.5 signed-link auth surface.
-- Every statement is idempotent because this migration is a one-shot
-- production cutover and may be replayed in local reset/dev snapshots.

drop function if exists public.revoke_all_links_rpc(uuid, text);
drop function if exists public.issue_new_link_rpc(uuid, text);
drop function if exists public.revoke_leaked_link_atomic(uuid, text, int, text);
drop function if exists public.cleanup_bootstrap_nonces();
drop function if exists public.mint_bootstrap_nonce_atomic(uuid, text, timestamptz);
drop function if exists public.consume_bootstrap_nonce_atomic(uuid, text, timestamptz);
drop function if exists public.mint_link_session_if_active_kid_matches(
  text, uuid, uuid, int, text, timestamptz, timestamptz, text
);

drop policy if exists admin_only on public.bootstrap_nonces;
drop policy if exists admin_only on public.link_sessions;
drop policy if exists admin_only on public.revoked_links;
drop policy if exists admin_only on public.crew_member_auth;

drop index if exists public.bootstrap_nonces_issued_at_idx;
drop index if exists public.link_sessions_crew_member_id_idx;

drop table if exists public.bootstrap_nonces;
drop table if exists public.link_sessions;
drop table if exists public.revoked_links;
drop table if exists public.crew_member_auth;

notify pgrst, 'reload schema';

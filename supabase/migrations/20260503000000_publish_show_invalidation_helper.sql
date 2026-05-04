-- ============================================================================
-- M4 Task 4.16 — public.publish_show_invalidation(uuid) application helper
-- ============================================================================
--
-- M2 already ships statement-level AFTER UPDATE/INSERT triggers on
-- public.crew_member_auth and public.crew_members that auto-publish via
-- public.publish_show_invalidation_after_statement() at
-- supabase/migrations/20260501001000_internal_and_admin.sql:58-104. Those
-- triggers cover M2's primary write surfaces.
--
-- This migration adds an APPLICATION-CALLABLE helper for the cases where the
-- mutation happens on public.shows (e.g. the M6 Phase-2 commit path that
-- bumps last_synced_at) — public.shows does NOT have a publish-after-statement
-- trigger, so the application has to call the helper explicitly inside the
-- transaction that touches the row.
--
-- This is a one-shot migration. The function is callable via supabase-js
-- `.rpc('publish_show_invalidation', { p_show_id })`. The implementation is
-- intentionally a thin wrapper around the same pg_notify payload shape used
-- by publish_show_invalidation_after_statement so subscribers receive a
-- byte-identical envelope regardless of which write path emitted it.
--
-- Granted to service_role only (NOT authenticated/anon) — only server-side
-- code paths inside server actions / API routes after auth gates have passed
-- should publish invalidations. Client-direct calls are not a supported flow.
--
-- Apply-twice idempotency: `create or replace function` makes re-applying
-- this migration safe. There are no schema-altering side effects.

create or replace function public.publish_show_invalidation(p_show_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform pg_notify(
    'realtime:broadcast',
    json_build_object(
      'topic', 'show:' || p_show_id || ':invalidation',
      'event', 'invalidate',
      'payload', json_build_object(
        'show_id', p_show_id,
        'version_token', public.viewer_version_token(p_show_id)
      )
    )::text
  );
end;
$$;
revoke all on function public.publish_show_invalidation(uuid) from public;
grant execute on function public.publish_show_invalidation(uuid) to service_role;

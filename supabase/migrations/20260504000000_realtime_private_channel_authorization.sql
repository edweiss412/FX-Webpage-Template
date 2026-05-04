-- ============================================================================
-- M4 Task 4.16 fix — private-channel publish via realtime.send()
--                  + realtime.messages RLS policy (Codex HIGH 1)
-- ============================================================================
--
-- Codex Round 1 finding: the prior implementation opened the
-- `show:<id>:invalidation` channel as a PUBLIC Realtime channel and
-- published via `pg_notify('realtime:broadcast', ...)`. Supabase Realtime
-- Authorization (RLS on realtime.messages) ONLY protects PRIVATE channels;
-- public channels can be subscribed to without authentication, so the
-- short-lived JWT minted by /api/realtime/subscriber-token did nothing
-- to fence cross-show subscriptions OR honor revocation. Result: a
-- tenant-boundary AND revocation failure for the page's stale-data
-- transport.
--
-- This migration:
--
--   (a) Replaces the publish path with `realtime.send(payload, event,
--       topic, private => true)`. The `realtime.broadcast` extension's
--       canonical SQL→websocket bridge is realtime.send; pg_notify against
--       'realtime:broadcast' is the LEGACY path and is incompatible with
--       private-channel subscribers. See Supabase Broadcast docs.
--   (b) Enables RLS on `realtime.messages` and adds the SELECT policy
--       that authorizes a subscriber for `show:<uuid>:invalidation` ONLY
--       when the JWT carries `show_id = <uuid>` (per-tenant fence) OR
--       `viewer_kind = 'admin'` (admin sessions admit any show topic, per
--       plan §821). The mint endpoint at
--       app/api/realtime/subscriber-token/route.ts:130-145 already
--       populates both claims.
--
-- This is a one-shot migration. The function bodies use `create or replace
-- function` and the policy uses `drop policy if exists` + `create policy`
-- so re-applying is safe (apply-twice idempotent).
--
-- DEV-SCHEMA NOTE: dev.* (created by 20260502000000_dev_schema_clone.sql)
-- intentionally does NOT trigger Realtime — the dev panel writes through
-- the Phase-1 contract without invalidation broadcasts. No parallel
-- update is required there.

-- ============================================================================
-- (a) Replace publish_show_invalidation_after_statement() to use realtime.send()
-- ============================================================================
--
-- M2 ships statement-level AFTER UPDATE/INSERT triggers on
-- public.crew_member_auth and public.crew_members at
-- supabase/migrations/20260501001000_internal_and_admin.sql:58-104.
-- The trigger DEFINITIONS are unchanged — only the function BODY changes
-- so existing triggers transparently use the private-channel publish API.
create or replace function public.publish_show_invalidation_after_statement()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select distinct show_id from new_rows where show_id is not null loop
    perform realtime.send(
      json_build_object(
        'show_id', r.show_id,
        'version_token', public.viewer_version_token(r.show_id)
      )::jsonb,
      'invalidate',
      'show:' || r.show_id || ':invalidation',
      true
    );
  end loop;
  return null;
end;
$$;
-- Trigger-only helper, not intended as a REST RPC. Revoke anon/authenticated
-- explicitly anyway because SECURITY DEFINER public-schema functions are
-- exposed by Supabase unless locked down.
revoke all on function public.publish_show_invalidation_after_statement() from public, anon, authenticated;

-- ============================================================================
-- (b) Replace publish_show_invalidation(uuid) helper to use realtime.send()
-- ============================================================================
--
-- The application-callable helper from
-- supabase/migrations/20260503000000_publish_show_invalidation_helper.sql.
-- Subscribers receive a byte-identical envelope to the trigger path so the
-- client doesn't care which write surface emitted it.
create or replace function public.publish_show_invalidation(p_show_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform realtime.send(
    json_build_object(
      'show_id', p_show_id,
      'version_token', public.viewer_version_token(p_show_id)
    )::jsonb,
    'invalidate',
    'show:' || p_show_id || ':invalidation',
    true
  );
end;
$$;
revoke all on function public.publish_show_invalidation(uuid) from public, anon, authenticated;
grant execute on function public.publish_show_invalidation(uuid) to service_role;

-- ============================================================================
-- (c) RLS policy on realtime.messages — per-show fence + admin override
-- ============================================================================
--
-- Realtime Authorization (Supabase docs:
-- https://supabase.com/docs/guides/realtime/authorization) gates a
-- subscriber's join on a private channel by attempting to insert/select a
-- probe row in realtime.messages and rolling back the transaction. The
-- probe is run as the JWT's role (`authenticated` for our minted tokens),
-- so the SELECT policy below is the gate.
--
-- Topic format:   show:<uuid>:invalidation   (lib/realtime/subscribeToShow.ts:91)
-- JWT claim:      show_id = <uuid>           (app/api/realtime/subscriber-token/route.ts:137)
-- JWT claim:      viewer_kind ∈ {admin, crew_link, crew_google}
--                 (app/api/realtime/subscriber-token/route.ts:108-129)
--
-- Policy logic (matches plan §821 verbatim):
--   topic ~ '^show:([0-9a-f-]{36}):invalidation$'
--   AND (
--     ((regexp_match(topic, '^show:([0-9a-f-]{36}):invalidation$'))[1])::uuid
--       = (claims ->> 'show_id')::uuid
--     OR
--     (claims ->> 'viewer_kind') = 'admin'
--   )
--
-- The policy reads the row's `topic` column directly (in scope because
-- the policy is on realtime.messages); current_setting('request.jwt.claims')::jsonb
-- exposes the JWT body (the documented Supabase pattern; auth.jwt() is a
-- thin wrapper but is not always available in the realtime schema's
-- search_path during the probe transaction). Newer Supabase Realtime
-- builds also expose a `realtime.topic()` helper that returns the
-- subscriber's requested topic — we use the row column here so the policy
-- works on both older and newer Realtime extension builds.
--
-- We DO NOT add an INSERT policy here — only the database publishers
-- (running as Realtime's privileged Supabase Admin role per the docs:
-- "Regardless if it's public or private, the Realtime service connects to
-- your database as the authenticated Supabase Admin role") write to
-- realtime.messages. Authenticated subscribers must NOT be able to publish
-- arbitrary invalidation messages; the absence of an INSERT policy
-- combined with RLS-enabled is the fence.

alter table realtime.messages enable row level security;

drop policy if exists fxav_show_invalidation_subscriber_select on realtime.messages;

create policy fxav_show_invalidation_subscriber_select
  on realtime.messages
  for select
  to authenticated
  using (
    topic ~ '^show:[0-9a-f-]{36}:invalidation$'
    and (
      (
        (current_setting('request.jwt.claims', true)::jsonb ->> 'viewer_kind') = 'admin'
      )
      or (
        ((regexp_match(topic, '^show:([0-9a-f-]{36}):invalidation$'))[1])::uuid
          = (current_setting('request.jwt.claims', true)::jsonb ->> 'show_id')::uuid
      )
    )
  );

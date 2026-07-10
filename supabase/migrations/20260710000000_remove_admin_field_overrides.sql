-- Remove the admin field-override feature (teardown of #376 / migration
-- 20260707000000_admin_field_overrides.sql). Drops the SECURITY DEFINER RPC +
-- its four helpers, the admin_overrides table (with its RLS policy + index), and
-- the crew_members.sheet_name alias column. Overrides created a second source of
-- truth competing with the sheet; corrections now flow through fix-in-sheet +
-- Re-sync and the report flow. See spec docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md.
--
-- Idempotent (DROP ... IF EXISTS throughout) so a re-apply is a no-op.

-- 1. The public RPC first (its signature is what advisoryLockRpcDeadlock pinned).
drop function if exists public.set_field_override(text, text, text, text, text, text, jsonb, text, int, jsonb, int, text);

-- 2. The four SECURITY DEFINER helpers the RPC dispatched to.
drop function if exists public._validate_override_value(uuid, text, text, text, uuid, jsonb, uuid);
drop function if exists public._apply_override_live(uuid, text, text, uuid, jsonb, text);
drop function if exists public._current_field_value(uuid, text, text, text, text);
drop function if exists public._resolve_live_id(uuid, text, text, text, text);

-- 3. The durable state table (dropping it removes its admin_only policy + index).
drop table if exists public.admin_overrides;

-- 4. The crew alias column — only ever non-null under a name override, now unused.
alter table public.crew_members
  drop column if exists sheet_name;

notify pgrst, 'reload schema';

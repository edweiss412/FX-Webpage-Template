-- Lock down public._allowed_watermark_columns (Supabase lint: "RLS Disabled in Public").
--
-- This table is the internal allowlist behind the no-global-cursor DDL event trigger
-- (20260501004000_no_global_cursor_event_trigger.sql). It holds only
-- (table_name, column_name) pairs — no user data — but living in the `public` schema
-- means PostgREST exposes it to anon/authenticated. No application code reads it via
-- PostgREST/supabase-js: the reject_global_watermark_columns() event trigger reads it
-- in-DB (event triggers run as the trigger owner and bypass RLS), and the X.4 audit
-- (lib/audit/noGlobalCursor.ts) reads the migration SQL text, not the live table.
-- So denying all non-service access breaks nothing.
--
-- Idempotent: safe to apply twice (REVOKE/GRANT are no-ops when already in effect;
-- ENABLE ROW LEVEL SECURITY is a no-op when already enabled).

REVOKE ALL PRIVILEGES ON TABLE public._allowed_watermark_columns FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public._allowed_watermark_columns TO service_role;

-- RLS-enabled with no policy = deny-all for anon/authenticated (satisfies the lint).
-- service_role bypasses RLS; the SECURITY-context event-trigger owner also bypasses it.
ALTER TABLE public._allowed_watermark_columns ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

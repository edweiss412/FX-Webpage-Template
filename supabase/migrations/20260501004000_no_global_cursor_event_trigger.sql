DROP EVENT TRIGGER IF EXISTS no_global_cursor_columns;

CREATE TABLE IF NOT EXISTS _allowed_watermark_columns (
  table_name text NOT NULL,
  column_name text NOT NULL,
  PRIMARY KEY (table_name, column_name)
);

INSERT INTO _allowed_watermark_columns (table_name, column_name) VALUES
  ('shows', 'last_seen_modified_time'),
  ('pending_syncs', 'base_modified_time'),
  ('pending_syncs', 'staged_modified_time'),
  ('pending_syncs', 'staged_id'),
  ('deferred_ingestions', 'deferred_at_modified_time'),
  ('drive_watch_channels', 'expires_at'),
  ('drive_watch_channels', 'activated_at'),
  ('drive_watch_channels', 'superseded_at'),
  ('drive_watch_channels', 'stopped_at'),
  ('drive_watch_channels', 'created_at'),
  ('shows', 'last_synced_at'),
  ('pending_syncs', 'parsed_at'),
  ('pending_syncs', 'prior_last_sync_status'),
  ('pending_syncs', 'prior_last_sync_error'),
  ('pending_ingestions', 'last_attempt_at'),
  ('pending_ingestions', 'first_seen_at'),
  -- pending_ingestions.last_seen_modified_time is a per-row retry watermark, not a global cursor.
  -- Column exists at supabase/migrations/20260501001000_internal_and_admin.sql:197.
  ('pending_ingestions', 'last_seen_modified_time'),
  ('deferred_ingestions', 'deferred_at'),
  ('crew_member_auth', 'current_token_version'),
  ('crew_member_auth', 'max_issued_version'),
  ('crew_member_auth', 'revoked_below_version'),
  ('link_sessions', 'expires_at'),
  ('link_sessions', 'last_active_at'),
  ('link_sessions', 'created_at'),
  ('report_rate_limits', 'hour_bucket'),
  ('sync_log', 'occurred_at'),
  ('sync_audit', 'applied_at'),
  ('admin_alerts', 'raised_at'),
  ('admin_alerts', 'last_seen_at'),
  ('admin_alerts', 'resolved_at'),
  ('reports', 'created_at'),
  ('reports', 'processing_lease_until'),
  ('shows', 'last_sync_status'),
  ('shows', 'last_sync_error'),
  ('wizard_finalize_checkpoints', 'last_processed_at'),
  ('wizard_finalize_checkpoints', 'last_processed_drive_file_id')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION reject_global_watermark_columns()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offender record;
BEGIN
  FOR offender IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      LEFT JOIN _allowed_watermark_columns a
        ON a.table_name = c.table_name
       AND a.column_name = c.column_name
     WHERE c.table_schema = 'public'
       AND a.table_name IS NULL
       AND (
         c.column_name ~* 'last_(seen|sync|poll|processed|run|cursor)'
         OR c.column_name ~* 'watermark'
         OR c.column_name ~* '(^|_)cursor($|_)'
         OR c.column_name ~* 'global_(state|cursor)'
       )
  LOOP
    RAISE EXCEPTION
      'AC-X.4 violation: column %.% has watermark-shaped name and is not in _allowed_watermark_columns. Add legitimate per-row watermarks to the allowlist in the same migration.',
      offender.table_name,
      offender.column_name
      USING ERRCODE = 'check_violation';
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER no_global_cursor_columns
  ON ddl_command_end
  EXECUTE FUNCTION reject_global_watermark_columns();

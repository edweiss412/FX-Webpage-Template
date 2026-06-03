alter table public.app_settings add column if not exists alert_on_sync_problems boolean not null default true;
alter table public.app_settings add column if not exists daily_review_digest    boolean not null default true;
-- LIVENESS heartbeat (§4.2) — name is deliberately NON-watermark-shaped so the
-- AC-X.4 no-global-cursor DDL event trigger (20260501004000:60-63) accepts it
-- with NO _allowed_watermark_columns entry. NEVER rename to last_sync*. Invariant 4:
-- this never drives per-show sync; only the notify stall detector reads it.
alter table public.app_settings add column if not exists sync_cron_heartbeat_at timestamptz;
update public.app_settings set sync_cron_heartbeat_at = now()
  where id = 'default' and sync_cron_heartbeat_at is null;

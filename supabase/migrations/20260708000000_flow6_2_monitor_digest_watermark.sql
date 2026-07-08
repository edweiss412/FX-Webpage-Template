-- Flow 6.2 monitor digest: watermark for the "since last digest" window (spec §4.1).
alter table public.app_settings
  add column if not exists last_monitor_digest_sent_at timestamptz;

-- dev.* shadow (local-seed parity), mirroring the notify-columns migration.
alter table if exists dev.app_settings
  add column if not exists last_monitor_digest_sent_at timestamptz;

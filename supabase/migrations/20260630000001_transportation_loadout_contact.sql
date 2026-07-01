-- Surface the transport "Load Out" secondary transporter: persist loadout_{name,phone,email}.
-- Mirrors the driver_email canonical CHECK. Idempotent (apply-twice safe): the columns are
-- introduced here, immediately before the CHECK, so the first apply sees all-NULL rows and
-- every writer canonicalizes loadout_email (parser + cron), so re-apply re-validates canonical-only data.

alter table public.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table public.transportation drop constraint if exists transportation_loadout_email_canonical;
alter table public.transportation add constraint transportation_loadout_email_canonical check (
  loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
);

alter table dev.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table dev.transportation drop constraint if exists transportation_loadout_email_canonical;
alter table dev.transportation add constraint transportation_loadout_email_canonical check (
  loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
);

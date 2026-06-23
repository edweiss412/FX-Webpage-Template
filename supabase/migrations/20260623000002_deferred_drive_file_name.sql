-- Onboarding step-3 redesign: capture the human sheet name at ignore time so the
-- new Ignored-sheets admin view can show a name. A first-seen ignored sheet has no
-- public.shows row to join for a title, so the name must be stored on the deferral
-- itself (sourced from pending_ingestions.drive_file_name / the manifest name at
-- ignore time). Nullable (historical rows have none). Spec §6.4 / D11.
-- Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.deferred_ingestions
  add column if not exists drive_file_name text;

comment on column public.deferred_ingestions.drive_file_name is
  'Human sheet name captured at ignore time (first-seen ignored sheets have no shows row to join for a name).';

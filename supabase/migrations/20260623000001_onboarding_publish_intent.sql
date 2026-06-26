-- Onboarding step-3 redesign (Held model): per-row publish intent.
-- true  = Doug checked "publish" → CAS flip sets shows.published=true (Live).
-- false = unchecked → the created show stays published=false (Held).
-- Set at finalize batch time from pending_syncs.wizard_approved; read by the
-- finalize-cas publish-flip (publishAppliedWizardShows, narrowed to publish_intent=true).
-- Lives on the manifest (read by the flip, which runs BEFORE the manifest purge),
-- so no shows column is needed (cleanup needs no per-row intent — spec §7.2/§7.5).
-- Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.onboarding_scan_manifest
  add column if not exists publish_intent boolean not null default false;

comment on column public.onboarding_scan_manifest.publish_intent is
  'Onboarding checkbox publish-intent: true=publish (CAS flip -> Live), false=leave Held. Set at finalize from pending_syncs.wizard_approved.';

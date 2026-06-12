-- F1 Task 1.3 (onboarding-fixups R57-2): wizard first-seen provenance, both sides.
--
-- onboarding_scan_manifest.created_show_id: which show the Phase B first-seen finalize
-- created for this manifest row (written returning-checked in the same per-row transaction
-- as the apply). Consumers (Phase D publish flip, F4 cleanup/reap) NEVER trust it bare —
-- every consumer joins s.id = m.created_show_id AND s.drive_file_id = m.drive_file_id AND
-- s.wizard_created_session_id = m.wizard_session_id (plan R47-1/R56-1).
--
-- shows.wizard_created_session_id: the show-side provenance discriminator — nullable, no
-- default, written ONLY by the F1 first-seen INSERT (same statement, R58-1). A pre-existing
-- show has NULL here and no manifest forge can change it.
--
-- Apply-twice idempotent: add column if not exists.
alter table public.onboarding_scan_manifest
  add column if not exists created_show_id uuid references public.shows(id) on delete set null;
alter table public.shows
  add column if not exists wizard_created_session_id uuid;

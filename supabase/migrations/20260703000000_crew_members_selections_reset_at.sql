-- Per-crew picker reset (2026-07-03): per-member picker-selection invalidation marker.
-- Mirrors 20260524000001_crew_members_claimed_via_oauth_at.sql shape.
alter table public.crew_members
  add column if not exists selections_reset_at timestamptz null;

comment on column public.crew_members.selections_reset_at is
  'Per-member picker reset marker. When non-null, any picker cookie selection with pick-timestamp (entry.t, millis) <= this value is invalidated and the crew member is re-prompted to pick. Stamped only by reset_crew_member_selection (admin, SECURITY DEFINER). NULL = never reset (default).';

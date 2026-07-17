-- last_checked_at: "we successfully reached Drive and evaluated this show" timestamp.
-- Distinct from last_synced_at (last content apply / stage / error). Drives the age
-- tiers of driveConnectionHealth + StaleFooter so idle-but-healthy shows read healthy.
-- Spec: docs/superpowers/specs/2026-07-16-last-checked-at.md §3.
alter table public.shows add column if not exists last_checked_at timestamptz;

-- Backfill: best available seed is the last known terminal-outcome time.
update public.shows set last_checked_at = last_synced_at where last_checked_at is null;

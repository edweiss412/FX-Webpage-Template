-- Adds `expired` to the drive_watch_channels status CHECK.
--
-- Spec: docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md §3.1.1
--
-- `expired` means the channel aged out: Google stopped delivering at expires_at,
-- so there is nothing left to stop at Drive and GC skips channels.stop for it
-- (§3.1.4). That is deliberately distinct from `orphaned`, which means we tried
-- to create the channel and failed, and from `superseded`, which is where the
-- reap sends a row whose timestamps are corrupt but whose Drive-side channel may
-- still be live (§3.1.2) — those DO get stopped.
--
-- The six pre-existing values are copied verbatim from
-- supabase/migrations/20260501001000_internal_and_admin.sql:295-297, including
-- `stopping`, which the DB accepts and the TypeScript union does not. Preserved
-- rather than tidied: dropping a value from a CHECK is a separate, riskier change
-- than adding one, and nothing writes it (spec §8.2).
--
-- drop-if-exists + add makes this apply-twice idempotent.
--
-- No `notify pgrst, 'reload schema'`: a CHECK alters no column, function, or
-- relationship in PostgREST's schema cache, so the reload would imply a
-- dependency that does not exist (spec §4.4).

alter table public.drive_watch_channels
  drop constraint if exists drive_watch_channels_status_check;

alter table public.drive_watch_channels
  add constraint drive_watch_channels_status_check check (
    status in ('pending', 'active', 'superseded', 'stopping', 'stopped', 'orphaned', 'expired')
  );

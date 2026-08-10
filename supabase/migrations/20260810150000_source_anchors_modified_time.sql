-- BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (spec 2026-08-09-m-wave-2-design §2.3,
-- ratified 2026-08-09: sibling column, NOT an in-jsonb stamp).
--
-- `source_anchors_modified_time` stamps the Drive `modifiedTime` the row's
-- `source_anchors` map was computed FROM. Readers (the shared `freshSourceAnchors`
-- helper) compare it to `last_seen_modified_time` and demote the map to the deep-link
-- builder's `#gid=0` fallback on mismatch; NULL means "provenance unknown" and reads
-- as mismatch. Nullable timestamptz, no domain CHECK.
alter table public.shows
  add column if not exists source_anchors_modified_time timestamptz;

comment on column public.shows.source_anchors_modified_time is
  'Drive modifiedTime the source_anchors map was computed from; NULL = unknown (readers treat as stale). Spec 2026-08-09-m-wave-2-design §2.3.';

-- ── Legacy backfill (one-time grandfather) ──────────────────────────────────────
-- Every existing row holding a NON-EMPTY source_anchors map gets stamped with its own
-- last_seen_modified_time. Without this, NULL→fallback would demote every populated
-- legacy anchor below the watermark skip indefinitely (the anchors would never be
-- recomputed for an unchanged sheet). This deliberately blesses any ALREADY-stale
-- legacy anchor until that show's next real anchor write re-stamps honestly — the
-- entry's own pre-existing accepted-limit window, now bounded per-show instead of
-- permanent (wave spec §4 limit 9).
--
-- The backfill is itself an anchor writer, so it takes the per-show advisory lock
-- (invariant 2) — per-row `pg_advisory_xact_lock('show:' || drive_file_id)`, rows
-- ordered by drive_file_id so two concurrent lockers of overlapping key sets cannot
-- invert (the 20260611000001_onboarding_fixups_remediation.sql:62 precedent). The
-- migration runs standalone; in-migration is the only holder layer for these keys.
do $$
declare
  r record;
begin
  for r in
    select s.id, s.drive_file_id, s.last_seen_modified_time
      from public.shows s
     where s.source_anchors is not null
       and s.source_anchors <> '{}'::jsonb
       and s.source_anchors_modified_time is null
     order by s.drive_file_id   -- deterministic lock order (deadlock prevention)
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
    -- Re-check under the lock: a concurrent writer may have stamped this row (or
    -- rewritten its anchors) between SELECT and lock-acquire.
    update public.shows s
       set source_anchors_modified_time = s.last_seen_modified_time
     where s.id = r.id
       and s.source_anchors is not null
       and s.source_anchors <> '{}'::jsonb
       and s.source_anchors_modified_time is null;
  end loop;
end $$;

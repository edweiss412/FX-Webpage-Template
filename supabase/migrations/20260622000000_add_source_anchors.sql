-- Tile → source-sheet deep links (spec 2026-06-21 §11). One jsonb map keyed by
-- source-region id → { title, gid, a1 }. Written only by the SECURITY-DEFINER sync
-- path under the per-show advisory lock; shows write is already REVOKEd from
-- anon/authenticated (20260523000001_picker_epoch_columns.sql:45). Idempotent.
alter table public.shows add column if not exists source_anchors jsonb not null default '{}'::jsonb;

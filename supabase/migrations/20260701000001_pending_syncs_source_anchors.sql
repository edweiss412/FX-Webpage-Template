-- Persist Google-Sheet source anchors at onboarding-scan time so the Step-3 finalize
-- path reads them instead of re-exporting the XLSX per show (~20s/sheet off the publish
-- critical path). Value shape = Record<region_id, {title, gid, a1?}> — the
-- extractSourceAnchors output, the same shape shows.source_anchors stores. Default '{}'
-- is the degradation signal: any un-populated row (pre-ship sessions, non-scan staging
-- paths, best-effort failures) reads back '{}' -> finalize #gid=0 fallback.
-- Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.pending_syncs
  add column if not exists source_anchors jsonb not null default '{}'::jsonb;

comment on column public.pending_syncs.source_anchors is
  'Onboarding source-link anchors (Record<region_id,{title,gid,a1?}>), computed at scan from the XLSX bytes and read by finalize to avoid a per-show XLSX export. Default {} => #gid=0 fallback.';

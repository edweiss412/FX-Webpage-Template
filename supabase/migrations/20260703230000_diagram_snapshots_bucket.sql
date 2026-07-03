-- Provision the `diagram-snapshots` Supabase Storage bucket.
--
-- Phase-2 apply snapshots DIAGRAMS embedded/linked image bytes into this bucket
-- (lib/sync/snapshotAssets.ts, defaultSnapshotAssetsForApply.ts, promoteSnapshot.ts,
-- diagramGc.ts — all hard-code `diagram-snapshots`). The bucket was previously
-- provisioned out-of-band per environment, with NO migration codifying it. On
-- 2026-07-03 the validation project had zero buckets, so every diagram-bearing
-- apply failed with `StorageApiError: Bucket not found` → Phase2InfraError →
-- the whole apply tx rolled back → a show retried and failed every cron run for
-- ~2h (surfaced only after errorPayload started capturing `.cause`). Codifying it
-- here means any environment that applies migrations gets the bucket.
--
-- Private (public:false): objects are served exclusively through the signed-URL
-- proxy (app/api/asset/diagram/[show]/[rev]/[key]/route.ts). No bucket RLS policy
-- is required — every read/write goes through the service-role client, which
-- bypasses storage RLS.
--
-- Guarded so this is a no-op on a DB without the storage schema (e.g. a bare
-- public-only test database) and idempotent on re-apply.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('diagram-snapshots', 'diagram-snapshots', false)
    on conflict (id) do nothing;
  end if;
end $$;

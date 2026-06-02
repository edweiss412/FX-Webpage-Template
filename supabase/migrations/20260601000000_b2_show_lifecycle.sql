-- M12.2 Phase B2 — show lifecycle (archive / unarchive / publish + auto-publish toggle + immutability guards).
-- Built incrementally across plan Tasks 1.1–1.5; all DDL is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS + ADD) so the file is safe to re-apply (local incremental apply + CI db:reset).

-- Task 1.1: lifecycle columns.
alter table public.app_settings add column if not exists auto_publish_clean_first_seen boolean not null default true;
alter table public.shows        add column if not exists archived_at timestamptz;
alter table public.shows        add column if not exists requires_resync boolean not null default false;

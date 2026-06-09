-- Phase 1 Task 1.1 — sync_holds: per-entity identity holds (MI-11 gate + undo).
-- DDL follows the canonical shared contract in
-- docs/superpowers/plans/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate/00-overview.md.
-- F9 read posture: held/proposed identity values are admin-only; feed reads use service_role.

create table if not exists public.sync_holds (
  id                 uuid primary key default gen_random_uuid(),
  show_id            uuid not null references public.shows(id) on delete cascade,
  drive_file_id      text not null,
  domain             text not null,
  entity_key         text not null,
  held_value         jsonb not null,
  proposed_value     jsonb,
  base_modified_time timestamptz,
  kind               text not null,
  reservation_collisions jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  created_by         text not null
);

alter table public.sync_holds drop constraint if exists sync_holds_domain_chk;
alter table public.sync_holds add constraint sync_holds_domain_chk
  check (domain in ('crew_email','crew_identity'));

alter table public.sync_holds drop constraint if exists sync_holds_kind_chk;
alter table public.sync_holds add constraint sync_holds_kind_chk
  check (kind in ('mi11_pending','undo_override'));

alter table public.sync_holds drop constraint if exists sync_holds_kind_shape_chk;
alter table public.sync_holds add constraint sync_holds_kind_shape_chk
  check (
    (kind = 'mi11_pending'
       and proposed_value is not null
       and base_modified_time is not null
       and proposed_value->>'disposition' in ('email_change','rename','removal'))
    or (kind = 'undo_override' and proposed_value is null)
  );

alter table public.sync_holds drop constraint if exists sync_holds_uniq;
alter table public.sync_holds add constraint sync_holds_uniq
  unique (show_id, domain, entity_key);

create index if not exists sync_holds_show_idx on public.sync_holds (show_id);

alter table public.sync_holds enable row level security;
revoke all on table public.sync_holds from anon, authenticated;
grant all on table public.sync_holds to service_role;

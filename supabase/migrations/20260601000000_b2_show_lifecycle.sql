-- M12.2 Phase B2 — show lifecycle (archive / unarchive / publish + auto-publish toggle + immutability guards).
-- Built incrementally across plan Tasks 1.1–1.5; all DDL is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS + ADD) so the file is safe to re-apply (local incremental apply + CI db:reset).

-- Task 1.1: lifecycle columns.
alter table public.app_settings add column if not exists auto_publish_clean_first_seen boolean not null default true;
alter table public.shows        add column if not exists archived_at timestamptz;
alter table public.shows        add column if not exists requires_resync boolean not null default false;

-- Task 1.2: finalize-ownership predicate (SQL mirror of readFinalizeOwnershipGuard_unlocked,
-- lib/sync/runManualSyncForShow.ts:98-132) — true iff an owning wizard/pending-changes finalize
-- checkpoint is in_progress/all_batches_complete. Keep this in lockstep with the JS predicate.
create or replace function public.readfinalizeowned_b2(p_show_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
           select 1
             from public.shows s
             join public.onboarding_scan_manifest m
               on m.drive_file_id = s.drive_file_id and m.status = 'applied'
             join public.wizard_finalize_checkpoints c
               on c.wizard_session_id = m.wizard_session_id
            where s.id = p_show_id
              and s.published = false
              and c.status in ('in_progress', 'all_batches_complete')
         )
      or exists (
           select 1
             from public.shows_pending_changes spc
             join public.wizard_finalize_checkpoints c
               on c.wizard_session_id = spc.wizard_session_id
            where spc.show_id = p_show_id
              and c.status in ('in_progress', 'all_batches_complete')
         );
$$;

-- _archive_show_core: lockless, NO is_admin, private (revoked from all). Runs ONLY the false->true transition.
create or replace function public._archive_show_core(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text;
begin
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  update public.shows
     set archived = true, published = false, archived_at = now(),
         unpublish_token = null, unpublish_token_expires_at = null,
         picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp()
   where id = p_show_id;
  update public.show_share_tokens
     set share_token = encode(extensions.gen_random_bytes(32), 'hex'), rotated_at = clock_timestamp()
   where show_id = p_show_id;
  delete from public.pending_syncs      where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.pending_ingestions where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.deferred_ingestions where drive_file_id = v_drive and wizard_session_id is null;
  perform public.publish_show_invalidation(p_show_id);
end $$;
revoke all on function public._archive_show_core(uuid) from public, anon, authenticated, service_role;

-- archive_show: admin-gated, in-RPC lock, idempotency early-return, finalize-owned refusal, calls the core.
create or replace function public.archive_show(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'archive_show is admin-only';
  end if;
  -- drive_file_id is immutable; safe to read before the lock (needed to compute the lock key).
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then
    raise exception using errcode = 'P0002', message = 'ADMIN_LINK_SHOW_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  -- RE-READ mutable state AFTER the lock: under READ COMMITTED a pre-lock read is stale once a concurrent
  -- Archive commits while we wait. Reading inside the locked section serializes the idempotency decision.
  select archived into v_archived from public.shows where id = p_show_id;
  if v_archived then return; end if;                 -- idempotent: core does NOT re-run
  if public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  perform public._archive_show_core(p_show_id);
end $$;
revoke all on function public.archive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.archive_show(uuid) to authenticated;

-- Task 1.3: unarchive_show — the revival-sanitization chokepoint (single locked RPC).
create or replace function public.unarchive_show(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean;
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='unarchive_show is admin-only';
  end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  -- RE-READ archived AFTER the lock and EARLY-RETURN before any mutation when the row is not archived:
  -- token rotation + scratch/suppressor cleanup run ONLY when THIS call performs the archived->held
  -- transition. A stale double-Unarchive on an already-Held/Live row must not rotate the active token.
  select archived into v_archived from public.shows where id = p_show_id;
  if not v_archived then return; end if;            -- idempotent no-op
  update public.shows
     set archived = false, archived_at = null, requires_resync = true,
         picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp()
   where id = p_show_id;
  update public.show_share_tokens
     set share_token = encode(extensions.gen_random_bytes(32),'hex'), rotated_at = clock_timestamp()
   where show_id = p_show_id;
  delete from public.pending_syncs       where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.pending_ingestions  where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.deferred_ingestions where drive_file_id = v_drive and wizard_session_id is null;
  -- NO publish_show_invalidation: Held is crew-unreachable, no active session to kick.
end $$;
revoke all on function public.unarchive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unarchive_show(uuid) to authenticated;

-- Task 1.4: _publish_show_core (lockless, private) + publish_show (admin-gated, self-locking, atomic gate).
create or replace function public._publish_show_core(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean; v_pub boolean; v_req boolean;
begin
  select drive_file_id, archived, published, requires_resync
    into v_drive, v_archived, v_pub, v_req from public.shows where id = p_show_id;
  if v_pub then return; end if;                              -- idempotent
  if v_archived then raise exception using errcode='P0001', message='SHOW_ARCHIVED_IMMUTABLE'; end if;
  if public.readfinalizeowned_b2(p_show_id) then raise exception using errcode='P0001', message='FINALIZE_OWNED_SHOW'; end if;
  if v_req
     or exists (select 1 from public.pending_syncs       where drive_file_id=v_drive and wizard_session_id is null)
     or exists (select 1 from public.pending_ingestions  where drive_file_id=v_drive and wizard_session_id is null)
     or exists (select 1 from public.deferred_ingestions where drive_file_id=v_drive and wizard_session_id is null)
  then raise exception using errcode='P0001', message='PUBLISH_BLOCKED_PENDING_REVIEW'; end if;
  update public.shows set published = true where id = p_show_id;
  perform public.publish_show_invalidation(p_show_id);
end $$;
revoke all on function public._publish_show_core(uuid) from public, anon, authenticated, service_role;

create or replace function public.publish_show(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text;
begin
  if not public.is_admin() then raise exception using errcode='42501', message='forbidden', hint='publish_show is admin-only'; end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));   -- gate + flip atomic under one lock
  perform public._publish_show_core(p_show_id);
end $$;
revoke all on function public.publish_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.publish_show(uuid) to authenticated;

-- Task 1.5: idempotent legacy backfill (legacy cohort == archived=true AND archived_at IS NULL).
-- Stamping archived_at makes re-apply a no-op; rows already stamped by archive_show are untouched.
update public.show_share_tokens t
   set share_token = encode(extensions.gen_random_bytes(32),'hex'), rotated_at = clock_timestamp()
  from public.shows s
 where s.id = t.show_id and s.archived = true and s.archived_at is null;
update public.shows
   set picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp(), archived_at = now()
 where archived = true and archived_at is null;
delete from public.pending_syncs       ps using public.shows s where s.drive_file_id = ps.drive_file_id and s.archived = true and ps.wizard_session_id is null;
delete from public.pending_ingestions  pi using public.shows s where s.drive_file_id = pi.drive_file_id and s.archived = true and pi.wizard_session_id is null;
delete from public.deferred_ingestions di using public.shows s where s.drive_file_id = di.drive_file_id and s.archived = true and di.wizard_session_id is null;

-- Task 1.5: PostgREST DML lockdown — the publish gate + suppressor contract depend on these tables'
-- integrity. Mutations flow ONLY through the SECURITY DEFINER RPCs / sync pipeline (which hold the
-- per-show advisory lock). SELECT posture is unchanged (these tables retain SELECT).
revoke insert, update, delete on table public.pending_syncs      from anon, authenticated;
revoke insert, update, delete on table public.pending_ingestions from anon, authenticated;
revoke insert, update, delete on table public.deferred_ingestions from anon, authenticated;

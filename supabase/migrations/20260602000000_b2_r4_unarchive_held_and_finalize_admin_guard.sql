-- M12.2 Phase B2 — adversarial R4 (whole-milestone) repairs. Two independent fixes:
--
-- F1 [HIGH] unarchive_show must force published=false (land Held, never Live).
--   The Archived->Held update cleared `archived` + set requires_resync but left
--   `published` untouched. The codebase treats archived/published as INDEPENDENT
--   booleans (archive_show_core sets BOTH archived=true AND published=false). A
--   drifted/legacy archived row with published=true would Unarchive straight to
--   archived=false,published=true == Live, bypassing the intended Held state, the
--   catch-up sync, and the publish_show freshness gate (crew become reachable
--   immediately on a stale snapshot). Forcing published=false here is the
--   symmetric, defense-in-depth revival-sanitization behavior; for a normal
--   archived row (already published=false) it is a harmless no-op. The early-RETURN
--   on a not-archived row is unchanged, so a stale Unarchive on an already-Live row
--   still no-ops and does NOT touch published.
--
-- F2 [MED] readfinalizeowned_b2 must be admin-only.
--   The predicate is SECURITY DEFINER and was granted to `authenticated`, so any
--   signed-in NON-admin could call it via PostgREST (`supabase.rpc`) and infer
--   whether an arbitrary show UUID is finalize-owned — a trust-boundary read over
--   admin-only wizard/finalize state. Add an is_admin() guard. This is safe for
--   every legitimate caller: the dashboard surfaces (app/admin/show/[slug]/page.tsx,
--   components/admin/Dashboard.tsx) run with an admin session; the internal SECURITY
--   DEFINER callers (archive_show, _publish_show_core, rotate_show_share_token,
--   reset_picker_epoch_atomic) are all admin-gated and preserve the admin JWT in
--   request.jwt.claims through the nested call, so is_admin() inside still passes.
--   No service_role/cron path calls this function (cron uses
--   readFinalizeOwnershipGuard_unlocked in lib/sync, and auto-publish sets published
--   via applyShowSnapshot, not _publish_show_core). Converted to plpgsql to RAISE.
--
-- Apply-twice idempotent: both are `create or replace` + naturally-idempotent
-- revoke/grant. create-or-replace preserves existing grants, but the grants are
-- re-stated for clarity and to survive any future blanket function-revoke.

-- F1 ---------------------------------------------------------------------------
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
     set archived = false, published = false, archived_at = null, requires_resync = true,
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

-- F2 ---------------------------------------------------------------------------
create or replace function public.readfinalizeowned_b2(p_show_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='readfinalizeowned_b2 is admin-only';
  end if;
  return exists (
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
end $$;
revoke all on function public.readfinalizeowned_b2(uuid) from public, anon;
grant execute on function public.readfinalizeowned_b2(uuid) to authenticated, service_role;

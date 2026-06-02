-- M12.2 Phase B2 — adversarial R8 [HIGH]. unarchive_show idempotency hole.
--
-- The RPC intentionally no-ops (returns without mutation) when it finds the show already non-archived
-- under the lock — but it returned VOID, so the JS caller (lib/showLifecycle/unarchiveShow.ts) could not
-- tell a real archived->held transition from an idempotent no-op. It therefore ran the MUTATING catch-up
-- sync (runManualSyncForShow, which clears live deferrals etc.) on EVERY successful RPC — including a
-- stale Archived-row button click or a second admin click after the show was already unarchived/published.
-- That produces real state changes outside the intended Unarchive transition.
--
-- Fix: return a boolean — TRUE iff THIS call performed the archived->held transition, FALSE on the
-- idempotent no-op. The caller runs the catch-up sync ONLY when the flag is true.
--
-- A return-type change cannot go through `create or replace` (Postgres forbids changing the return type),
-- so DROP + CREATE. Apply-twice idempotent via `drop ... if exists`. Re-grant after the drop (drop loses
-- grants). All R4 F1 behavior is preserved: is_admin gate, ADMIN_LINK_SHOW_NOT_FOUND, post-lock re-read,
-- published=false (land Held, never Live), token rotation, picker_epoch bump, live non-wizard scratch +
-- suppressor cleanup, and NO publish_show_invalidation (Held is crew-unreachable).

drop function if exists public.unarchive_show(uuid);

create function public.unarchive_show(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean;
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='unarchive_show is admin-only';
  end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  -- RE-READ archived AFTER the lock and EARLY-RETURN before any mutation when the row is not archived.
  -- Returning FALSE tells the JS caller this was an idempotent no-op (a stale/double Unarchive on an
  -- already-Held/Live show) so it must NOT run the mutating catch-up sync.
  select archived into v_archived from public.shows where id = p_show_id;
  if not v_archived then return false; end if;     -- idempotent no-op: NO transition performed
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
  return true;                                     -- archived->held transition performed
end $$;
revoke all on function public.unarchive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unarchive_show(uuid) to authenticated;

-- Published toggle (spec docs/superpowers/specs/admin/2026-07-01-published-toggle.md §3.1).
-- Pure unpublish: published=false + undo-token pair cleared. Explicitly ABSENT (spec D1):
-- archived/archived_at, picker_epoch bump, share-token rotation, scratch deletes.
-- All DDL is create-or-replace / naturally idempotent — safe to re-apply.

create or replace function public._unpublish_show_core(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_title text;
begin
  select drive_file_id, title into v_drive, v_title from public.shows where id = p_show_id;
  update public.shows
     set published = false,
         unpublish_token = null,
         unpublish_token_expires_at = null
   where id = p_show_id;
  perform public.upsert_admin_alert(p_show_id, 'SHOW_UNPUBLISHED',
          jsonb_build_object('drive_file_id', v_drive, 'sheet_name', v_title));
  perform public.publish_show_invalidation(p_show_id);
end $$;
revoke all on function public._unpublish_show_core(uuid) from public, anon, authenticated, service_role;

-- Admin wrapper: same shape as archive_show (20260601000000_b2_show_lifecycle.sql:58-81).
-- Idempotency-first, THEN the finalize-owned refusal (spec §3.1 ordering note): a finalize-owned
-- Held show no-ops rather than erroring. readfinalizeowned_b2 is a nested SECURITY DEFINER call —
-- the admin JWT is preserved through request.jwt.claims, so its is_admin() gate passes
-- (20260602000000 F2 note).
create or replace function public.unpublish_show(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean; v_published boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'unpublish_show is admin-only';
  end if;
  -- drive_file_id is immutable; safe to read before the lock (needed to compute the lock key).
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then
    raise exception using errcode = 'P0002', message = 'ADMIN_LINK_SHOW_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  -- RE-READ mutable state AFTER the lock (READ COMMITTED: a pre-lock read is stale once a
  -- concurrent lifecycle mutation commits while we wait).
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then
    raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE';
  end if;
  if not v_published then return; end if;            -- idempotent no-op (no alert spam)
  if public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  perform public._unpublish_show_core(p_show_id);
end $$;
revoke all on function public.unpublish_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unpublish_show(uuid) to authenticated;

-- viewer_version_token: append the publication component (spec §3.1 R6/R9 belt-and-suspenders —
-- the crew durability path is the version route's 410/auth_denied forced refresh; this covers
-- equality-only consumers that DO receive tokens across a publish flip, e.g. admin viewers and
-- the SSR fence). Body copied from 20260523000006_viewer_version_token_rewrite.sql with ONE
-- appended component; every consumer compares tokens for equality only, so the shape change is safe.
create or replace function public.viewer_version_token(p_show_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    to_char(greatest(
      coalesce((select extract(epoch from last_synced_at) * 1000
                from public.shows where id = p_show_id), 0),
      coalesce((select extract(epoch from max(last_changed_at)) * 1000
                from public.crew_members where show_id = p_show_id), 0),
      coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000
                from public.shows where id = p_show_id), 0)
    ), 'FM999999999999999')
    || ':'
    || coalesce((select picker_epoch::text from public.shows where id = p_show_id), '0')
    || ':'
    || coalesce((select published::text from public.shows where id = p_show_id), 'false');
$$;

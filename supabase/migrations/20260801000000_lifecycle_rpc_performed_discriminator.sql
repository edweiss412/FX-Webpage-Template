-- Race-cluster spec §3 (docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md):
-- archive_show / publish_show (+ _publish_show_core) / unpublish_show return a performed/no-op
-- discriminator — TRUE iff THIS call performed the transition, FALSE on the idempotent no-op arm —
-- so the admin actions can gate SHOW_* forensic telemetry on real transitions (the measured Case C
-- duplicate). unarchive_show already returns boolean (20260718000001) and is untouched.
--
-- CREATE OR REPLACE cannot change a return type, so each function is DROP + CREATE. The whole file
-- is ONE explicit transaction: Supabase default privileges grant EXECUTE on new public functions to
-- anon/authenticated/service_role directly (20260716120000_admin_show_review_snapshot_rpc.sql:32-35),
-- and the surgical validation path (psql -f) autocommits per statement — without the wrap, the
-- gate-free lock-free _publish_show_core would be publicly executable between its CREATE and its
-- REVOKE. Precedent for the wrap: 20260611000002 / 20260619000001 lockdown migrations.
--
-- Bodies are verbatim from each function's LATEST shipped definition (cited per function below);
-- the ONLY changes are the boolean return arms. Gates, per-show advisory locks, and post-lock
-- re-reads are unchanged — the single-holder topology is preserved (AGENTS.md invariant 2).
begin;

-- archive_show — basis: 20260601000000_b2_show_lifecycle.sql (Task 1.2 wrapper).
drop function if exists public.archive_show(uuid);
create function public.archive_show(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
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
  -- RE-READ mutable state AFTER the lock: under READ COMMITTED a pre-lock read is stale once a
  -- concurrent Archive commits while we wait. Reading inside the locked section serializes the
  -- idempotency decision.
  select archived into v_archived from public.shows where id = p_show_id;
  if v_archived then return false; end if;           -- idempotent no-op: core does NOT re-run
  if public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  perform public._archive_show_core(p_show_id);
  return true;                                       -- THIS call performed the transition
end $$;
revoke all on function public.archive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.archive_show(uuid) to authenticated;

-- _publish_show_core — basis: 20260716210000_role_mappings_publish_freshness.sql (c), which is the
-- 20260601000000 core plus the role-mappings publish freshness gate. Stays lockless and privately
-- owned (revoke-all, NO grant): publish_show's wrapper holds the per-show advisory lock.
drop function if exists public._publish_show_core(uuid);
create function public._publish_show_core(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean; v_pub boolean; v_req boolean;
begin
  select drive_file_id, archived, published, requires_resync
    into v_drive, v_archived, v_pub, v_req from public.shows where id = p_show_id;
  if v_pub then return false; end if;                        -- idempotent no-op
  if v_archived then raise exception using errcode='P0001', message='SHOW_ARCHIVED_IMMUTABLE'; end if;
  if public.readfinalizeowned_b2(p_show_id) then raise exception using errcode='P0001', message='FINALIZE_OWNED_SHOW'; end if;
  if v_req
     or exists (select 1 from public.pending_syncs       where drive_file_id=v_drive and wizard_session_id is null)
     or exists (select 1 from public.pending_ingestions  where drive_file_id=v_drive and wizard_session_id is null)
     or exists (select 1 from public.deferred_ingestions where drive_file_id=v_drive and wizard_session_id is null)
  then raise exception using errcode='P0001', message='PUBLISH_BLOCKED_PENDING_REVIEW'; end if;
  -- Publish freshness gate (spec 2026-07-16 §3.5 call site 3): a Held show whose staging-baked
  -- grants reference a since-deleted/narrowed mapping must not go Live until re-derived
  -- (manual sync / rescan). Recovery is cataloged: ROLE_MAPPINGS_OUTDATED_AT_PUBLISH (§12.4).
  if not public.role_mappings_stamp_satisfied(
       (select applied_role_mappings from public.shows_internal where show_id = p_show_id))
  then raise exception using errcode='P0001', message='ROLE_MAPPINGS_OUTDATED_AT_PUBLISH'; end if;
  update public.shows set published = true where id = p_show_id;
  perform public.publish_show_invalidation(p_show_id);
  return true;                                               -- THIS call performed the transition
end $$;
revoke all on function public._publish_show_core(uuid) from public, anon, authenticated, service_role;

-- publish_show — basis: 20260601000000_b2_show_lifecycle.sql (Task 1.4 wrapper); propagates the
-- core's discriminator.
drop function if exists public.publish_show(uuid);
create function public.publish_show(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text;
begin
  if not public.is_admin() then raise exception using errcode='42501', message='forbidden', hint='publish_show is admin-only'; end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));   -- gate + flip atomic under one lock
  return public._publish_show_core(p_show_id);
end $$;
revoke all on function public.publish_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.publish_show(uuid) to authenticated;

-- unpublish_show — basis: 20260701000000_published_toggle_unpublish_show.sql (admin wrapper).
drop function if exists public.unpublish_show(uuid);
create function public.unpublish_show(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
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
  if not v_published then return false; end if;      -- idempotent no-op (no alert spam)
  if public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  perform public._unpublish_show_core(p_show_id);
  return true;                                       -- THIS call performed the transition
end $$;
revoke all on function public.unpublish_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unpublish_show(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

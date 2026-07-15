-- Spec docs/superpowers/specs/2026-07-15-geocode-cache-legacy-coords.md (approved R15).
--
-- Two fixes in one migration:
--
-- (1) reset_validation_data() gains `delete from public.geocode_cache` — the RPC
--     (20260622000001) predates the geocode_cache table (20260627000001) by 5 days,
--     so "Reset validation data" silently preserved cache rows (omission by timing).
--     geocode_cache has no drive_file_id and no FK to shows: the advisory-lock key
--     set is UNCHANGED (single in-RPC holder, tests/auth/advisoryLockRpcDeadlock),
--     and the delete sits with the other clear-explicit residue. Trade-off: a reset
--     costs a handful of Google geocode calls on the next scan; virgin state wins.
--     Concurrency scope (spec §3.2): venue enrichment writes geocode_cache OUTSIDE
--     the per-show advisory-lock window, so a reset racing an in-flight scan may be
--     followed by re-inserted cache rows — accepted (quota cache, self-correcting).
--
-- (2) One-shot expiry of every FRESH coord-less cache row. Rows geocoded before the
--     coords columns existed (20260709000000) carry city + NULL lat/lng and stay
--     "fresh" for their 30-day TTL; the unchanged read path treats a fresh hit as
--     terminal, so affected venues emit VENUE_TIMEZONE_UNRESOLVED on every parse
--     until 2026-07-28 (observed: all 7 validation staged parses, 6 cache rows).
--     Expiring them makes the next read a MISS -> the existing cold path re-geocodes
--     with coords. Null-city rows are expired too (pre-coords ZERO_RESULTS and
--     OK-but-no-locality are indistinguishable): one re-geocode each, then terminal.
--     * lock table ... share row exclusive: fences concurrent service-role cache
--       writes so the fuse's counted set IS the mutated set (READ COMMITTED would
--       otherwise let the UPDATE see rows committed after the count).
--     * 1000-row fuse: aborts the apply (zero mutation) if the blast radius is
--       implausibly large; observed cardinality is 6 rows on validation.
--     * expiry lands a full day in the PAST so an app clock lagging the DB clock
--       can never re-read the row as a hit (readGeocodeCache compares against the
--       app's new Date().toISOString()).
--     One-shot execution is owned by schema_migrations / the recorded surgical
--     validation apply. A manual RE-apply is NOT a strict no-op (it would expire
--     coord-less rows written after the first apply — bounded but wasteful).

-- ---------------------------------------------------------------------------
-- (2) one-shot expiry — runs BEFORE the function replacement so a failed fuse
-- stops the apply before anything lands. NOTE: plain `psql -f` autocommits per
-- statement — every surgical apply MUST use `psql --single-transaction` so a
-- fuse abort rolls back the whole file (the supabase CLI migration runner is
-- transactional per file already).
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  -- Fuse atomicity (spec R6): fence concurrent cache writes for the block's
  -- few milliseconds so the counted set is exactly the mutated set.
  lock table public.geocode_cache in share row exclusive mode;
  -- Blast-radius fuse (spec R5): enforced IN the transaction.
  select count(*) into n
    from public.geocode_cache
   where (lat is null or lng is null)
     and expires_at > now();
  if n > 1000 then
    raise exception
      'geocode_cache one-shot expiry: % coord-less rows exceeds the 1000-row fuse — batch the expiry instead of applying blind',
      n;
  end if;
  update public.geocode_cache
     set expires_at = now() - interval '1 day'
   where (lat is null or lng is null)
     and expires_at > now();
  get diagnostics n = row_count;
  raise notice 'geocode_cache one-shot expiry: % coord-less row(s) expired', n;
end $$;

-- ---------------------------------------------------------------------------
-- (1) reset_validation_data(): 20260622000003 body + the geocode_cache delete.
-- ---------------------------------------------------------------------------
create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_did text;
  v_cleared bigint;
begin
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false) then
    raise exception 'destructive reset not enabled for this database';
  end if;

  -- Invariant 2: sorted single-holder per-show advisory locks over the distinct
  -- affected-key set, BEFORE any mutation. No nested SECURITY DEFINER re-acquire.
  for v_did in
    select drive_file_id
      from (
        select drive_file_id from public.shows
        union
        select drive_file_id from public.pending_syncs
        union
        select drive_file_id from public.pending_ingestions
        union
        select drive_file_id from public.deferred_ingestions
      ) u
     where drive_file_id is not null
     order by drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || v_did));
  end loop;

  select count(*) into v_cleared from public.shows;

  -- Every DELETE carries `where ctid is not null` (delete-all that safeupdate accepts).
  -- Non-cascade FK child (NO ACTION) — MUST precede `delete from public.shows`.
  delete from public.reports where ctid is not null;

  -- Cascade clears all on-delete-cascade children.
  delete from public.shows where ctid is not null;

  -- Clear-explicit: no FK to shows (or SET NULL) — not reached by the cascade.
  delete from public.pending_syncs where ctid is not null;
  delete from public.pending_ingestions where ctid is not null;
  delete from public.deferred_ingestions where ctid is not null;
  delete from public.onboarding_scan_manifest where ctid is not null;
  delete from public.revision_race_cooldowns where ctid is not null;
  delete from public.wizard_finalize_checkpoints where ctid is not null;
  -- Venue-keyed geocode quota cache (no drive_file_id, no FK to shows): virgin
  -- state includes it (spec 2026-07-15 §3.2). Costs one re-geocode per venue on
  -- the next scan.
  delete from public.geocode_cache where ctid is not null;

  -- Validation seed singleton.
  delete from public.validation_state where ctid is not null;

  -- Preserve the app_settings row; null only the pending pointers. watched_folder_id
  -- and every other column are left UNCHANGED. (Already qualified — safeupdate-safe.)
  update public.app_settings set
    pending_wizard_session_id = null,
    pending_wizard_session_at = null,
    pending_folder_id = null,
    pending_folder_name = null,
    pending_folder_set_by_email = null,
    pending_folder_set_at = null
  where id = 'default';

  return jsonb_build_object('clearedShows', v_cleared);
end;
$$;

-- Service-role-only (unchanged from 20260622000002/000003): re-asserted so this
-- migration is self-contained on any apply order.
revoke all on function public.reset_validation_data() from public, anon, authenticated;
grant execute on function public.reset_validation_data() to service_role;

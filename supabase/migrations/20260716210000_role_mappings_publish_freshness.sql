-- Role-vocab staging overlay (spec docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md §3.5):
-- consumed-token stamp + publish freshness gate. Apply-twice idempotent throughout.
--
-- (a) shows_internal.applied_role_mappings — the stamp describing the overlay consumption that
--     produced the show's CURRENT role_flags. Written by every phase2 apply; null = nothing consumed
--     (or a legacy row from before this migration — legacy parses contain no overlay output, so an
--     ungated pass on null is sound). Unconstrained jsonb: the predicate below validates at read,
--     fail-closed on any malformed shape.
alter table public.shows_internal add column if not exists applied_role_mappings jsonb;

-- (b) The publish freshness predicate — the ONE implementation shared by the wizard apply gate,
--     the final-CAS Held-to-Live flip, and the publish_show RPC (no TS duplicate; drift-proof).
--
-- VOLATILE is REQUIRED: the body row-locks via SELECT ... FOR SHARE, which PostgreSQL forbids in
-- STABLE/IMMUTABLE functions ("SELECT FOR UPDATE/SHARE is not allowed in non-volatile functions").
-- The FOR SHARE read locks the consumed-token rows for the CALLER'S transaction: a settings
-- DELETE/UPDATE committed before this read is seen (refuse); one issued after it blocks until the
-- caller's tx commits, landing strictly post-publish (the unpreventable class,
-- BL-ROLE-VOCAB-MAPPING-CONVERGENCE). No advisory lock anywhere in this function (invariant 2:
-- the callers keep their existing single holders).
--
-- Truth table (spec §3.5/§4):
--   null stamp                → true   (legacy row / nothing consumed)
--   non-array / malformed     → false  (corrupt evidence never publishes)
--   entry token deleted       → false
--   entry grants narrowed     → false  (current grants must CONTAIN staged grants)
--   equal / broadened / []    → true
create or replace function public.role_mappings_stamp_satisfied(stamp jsonb)
returns boolean language plpgsql volatile set search_path = public, pg_temp as $$
declare entry jsonb; g jsonb; row_grants text[]; entry_grants text[];
begin
  if stamp is null then return true; end if;
  if jsonb_typeof(stamp) <> 'array' then return false; end if;
  for entry in select * from jsonb_array_elements(stamp) loop
    if jsonb_typeof(entry) <> 'object'
       or jsonb_typeof(entry->'token') <> 'string'
       or jsonb_typeof(entry->'grants') <> 'array' then return false; end if;
    entry_grants := '{}';
    for g in select * from jsonb_array_elements(entry->'grants') loop
      if jsonb_typeof(g) <> 'string'
         or (g #>> '{}') not in ('A1','V1','L1','FINANCIALS') then return false; end if;
      entry_grants := entry_grants || (g #>> '{}');
    end loop;
    select m.grants into row_grants from public.role_token_mappings m
      where m.token = (entry->>'token') for share;
    if not found then return false; end if;
    if not (row_grants @> entry_grants) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.role_mappings_stamp_satisfied(jsonb) from public, anon;
grant execute on function public.role_mappings_stamp_satisfied(jsonb) to authenticated, service_role;

-- (c) _publish_show_core: body verbatim from 20260601000000_b2_show_lifecycle.sql:115-131 with ONE
--     added gate immediately before the published=true flip. The RPC keeps its name, SECURITY
--     DEFINER posture, and lock topology (publish_show wrapper still takes the per-show advisory
--     lock; this core stays lockless — the FOR SHARE rows lock under the wrapper's tx).
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
  -- Publish freshness gate (spec 2026-07-16 §3.5 call site 3): a Held show whose staging-baked
  -- grants reference a since-deleted/narrowed mapping must not go Live until re-derived
  -- (manual sync / rescan). Recovery is cataloged: ROLE_MAPPINGS_OUTDATED_AT_PUBLISH (§12.4).
  if not public.role_mappings_stamp_satisfied(
       (select applied_role_mappings from public.shows_internal where show_id = p_show_id))
  then raise exception using errcode='P0001', message='ROLE_MAPPINGS_OUTDATED_AT_PUBLISH'; end if;
  update public.shows set published = true where id = p_show_id;
  perform public.publish_show_invalidation(p_show_id);
end $$;
revoke all on function public._publish_show_core(uuid) from public, anon, authenticated, service_role;

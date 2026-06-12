begin;  -- R59-2: explicit transaction — psql -f autocommits per statement; the purge RAISE must roll back the marker insert + watermark resets too.
-- M-onboarding-fixups F2 — windowed watermark reset for wizard-damaged shows
-- + F4 one-time purge of the 30 synthetic validation wizard sessions.
--
-- Spec: docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md §4, §6.
-- Idiom precedent: supabase/migrations/20260608000004_retire_live_pending_syncs.sql
-- (DO-block + per-show pg_advisory_xact_lock; DO block ≠ create function, so the
-- advisoryLockRpcDeadlock meta-test's create-function grep is intentionally not extended).
-- Re-runnable BY DESIGN: each execution records a pass row; Arm A/B window on the
-- previous pass (minus a 1-hour applied_at margin — R18-2). Apply AFTER F1 deploys.

-- ── 1+2. Spec §4 SQL — VERBATIM (marker table + windowed two-arm DO block) ──────

create table if not exists public.data_migration_markers (
  key text not null,
  executed_at timestamptz not null default now(),
  primary key (key, executed_at)
);

do $$
declare
  r record;
  prev_pass timestamptz;
begin
  -- R15/R16: per-pass WINDOWING, not a global one-shot. Each execution records a pass row.
  -- Arm B on a re-run considers only broken-shape audits NEWER than the previous pass:
  --   * old broken audits (pre previous pass) are excluded -> a cron-healed show is never
  --     re-damaged even though the heal writes no sync_audit row (R15);
  --   * broken-writer damage written AFTER a pass (migration-applied-before-code-deployed
  --     skew) is still eligible on the NEXT pass -> never permanently masked (R16).
  select max(executed_at) into prev_pass
    from public.data_migration_markers
   where key = 'onboarding_fixups_watermark_reset';
  insert into public.data_migration_markers (key) values ('onboarding_fixups_watermark_reset');

  for r in
    select s.id, s.drive_file_id
      from public.shows s
     where s.last_seen_modified_time is not null
       and (
         -- Arm A (first-seen damage): zero children, wizard was last content writer.
         (not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
          and exists (select 1 from public.sync_audit sa
                       where sa.show_id = s.id
                         and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas')
                         and sa.staged_modified_time >= s.last_seen_modified_time
                         and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')))
         or
         -- Arm B (existing-show damage): the LATEST at-or-after-watermark audit is a
         -- broken-shape CAS apply (stale children despite advanced watermark).
         (select not (sa.parse_result_summary ? 'crewCount')
                 and sa.parse_result_summary->>'source' = 'onboarding_finalize_cas'
                 and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')
            from public.sync_audit sa
           where sa.show_id = s.id
             and sa.staged_modified_time >= s.last_seen_modified_time
           order by sa.staged_modified_time desc, sa.applied_at desc, sa.id desc
           limit 1)
       )
     order by s.drive_file_id   -- deterministic lock order (deadlock prevention)
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
    -- R12 finding 2: re-check full eligibility UNDER the lock — a concurrent sync may
    -- have healed the show (children + fresh watermark) between SELECT and lock-acquire.
    update public.shows s
       set last_seen_modified_time = null
     where s.id = r.id
       and s.last_seen_modified_time is not null
       and (
         (not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
          and exists (select 1 from public.sync_audit sa
                       where sa.show_id = s.id
                         and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas')
                         and sa.staged_modified_time >= s.last_seen_modified_time
                         and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')))
         or
         (select not (sa.parse_result_summary ? 'crewCount')
                 and sa.parse_result_summary->>'source' = 'onboarding_finalize_cas'
                 and (prev_pass is null or sa.applied_at > prev_pass - interval '1 hour')
            from public.sync_audit sa
           where sa.show_id = s.id
             and sa.staged_modified_time >= s.last_seen_modified_time
           order by sa.staged_modified_time desc, sa.applied_at desc, sa.id desc
           limit 1)
       );
  end loop;
end $$;

-- ── 3. Marker-table lockdown (plan addition; not in the spec block) ─────────────
-- Supabase default privileges would expose the new table to PostgREST DML; an
-- authenticated INSERT of a fake pass row could mask Arm B damage. Internal-only:
-- RLS on with NO policies + REVOKE (BL-ADMIN-POSTGREST-DML-LOCKDOWN posture).
alter table public.data_migration_markers enable row level security;
revoke all on table public.data_migration_markers from anon, authenticated;
-- plan R20-1: the Layer-4 reconciliation in tests/db/postgrest-dml-lockdown.test.ts requires a
-- registry row for every REVOKEd live table, and Layer-1 asserts service_role keeps full access.
grant all privileges on table public.data_migration_markers to service_role;

-- R52-1: same locked-set deletion contract as the F4 reap — drive-id-bearing DELETEs carry
-- `and drive_file_id = any(<locked array>)` (the array captured at lock time inside the DO block),
-- and a post-delete residue check re-selects each session's drive-id-bearing tables: any row outside
-- the locked set → RAISE EXCEPTION (aborting the whole migration transaction — safe: marker row rolls
-- back too, re-run is clean). OPERATIONAL note: the surgical validation apply for THIS migration runs
-- in a no-writer window (cron paused or off-hours; PostgREST DML on these tables is still open until
-- Task 4.7's lockdown lands).
-- ── 4. F4 one-time purge — EXACT 30 synthetic validation wizard sessions ────────
-- Spec §6 final bullet: keyed to the exact ids captured from the validation DB
-- (Task 2.1; plan-time capture 2026-06-11 listed 18, re-capture 2026-06-12 found 30 —
-- checkpoint-in_progress set ≡ shows_pending_changes set, verified 30|30|t with
-- symmetric difference 0; the active session is NOT in the list).
-- A drive_file_id prefix boundary was rejected (R23 finding 2): Drive ids are
-- opaque external identifiers. No-op in any environment where the ids don't exist.
-- Lock order mirrors cleanupAbandonedFinalize (sessionLifecycle.ts:329→374):
-- finalize:<session> locks first (sorted), then show:<drive_file_id> locks (sorted).
do $$
declare
  locked_drive_file_ids text[];
  dfid text;
  synthetic_ids constant uuid[] := array[
    '02304ebb-1d29-4a7e-b042-86b893247240',
    '023ddce3-9d9c-428a-b3bc-59501b73e77b',
    '0d2b0752-a06d-416e-96d8-28c9049eedf7',
    '2123a4d7-2992-4345-bb98-6882b09951e4',
    '21c02055-9ebc-4087-8759-a61e6b623f36',
    '2265e894-3d42-4c93-9a9a-fce6dda97fa1',
    '24b619a2-b2f7-4432-a114-640e05833ee5',
    '35fd4ba3-4fd6-4c27-9b74-8284ca7f7c70',
    '417b1867-8d7e-49a2-bb31-0abb413355c5',
    '43d95a73-eaf4-4a91-b97a-3e3bddfe5c23',
    '44457c00-7fc5-4db5-bb19-77290f667f48',
    '515d2e64-23d9-483f-9a05-ace5030af67d',
    '55d884db-a7f5-4b83-85a8-4149bd78a303',
    '561b1b88-bba3-40a8-bbd0-17ff19e16772',
    '80aaa6ef-8b14-4b19-885a-59137391d3c9',
    '943737a2-caa7-4771-ad66-62fde4f8e888',
    'ad5b5459-0f2d-46b7-a185-f64b681d4286',
    'b587e807-592f-4ac6-97a0-27a66fe7092e',
    'b864845d-12b6-40ca-8750-a1109984ee5a',
    'bd695762-cacc-438b-bb52-e08cd9f9167f',
    'be58e356-1019-4922-b738-490c58b18c82',
    'beed9557-9372-44b1-b417-6e1736ee1281',
    'bfd41ae1-4c0a-42e2-8d75-a6489690071c',
    'd1d15523-b62d-403d-9ee0-508a338a8970',
    'd5e32eaf-9c87-4625-96ca-7735e245998c',
    'd6975cf2-6062-4fc7-a92f-e61eab9be538',
    'da638b4b-7079-45fb-b6af-635a3f67d59d',
    'e44c3068-c300-498f-aeff-0ec05990a909',
    'ff476853-7107-4326-bb16-92c41463824a',
    'ffda8263-241c-427e-8c04-51dba595ea83'
  ];
  active_sid uuid;
  sid uuid;
  r record;
begin
  -- Defense-in-depth: never purge the ACTIVE session even if an id collided.
  select pending_wizard_session_id into active_sid
    from public.app_settings where id = 'default';

  -- R68-2/R69-1: PRECONDITION — none of the captured synthetic ids may be the ACTIVE session.
  -- The purge would otherwise preserve the active session's rows and then RAISE on residue,
  -- rolling back the watermark resets during the controlled validation apply.
  if active_sid = any (synthetic_ids) then
    raise exception 'onboarding_fixups purge: active wizard session % is in the synthetic purge list — rotate or finish it first', active_sid;
  end if;

  foreach sid in array synthetic_ids loop
    continue when active_sid is not null and sid = active_sid;
    perform pg_advisory_xact_lock(hashtext('finalize:' || sid::text));
  end loop;

  -- R53-1: capture the locked drive ids into an array; deletes are bound to EXACTLY this set.
  select coalesce(array_agg(drive_file_id order by drive_file_id), '{}') into locked_drive_file_ids from (
      select drive_file_id from public.shows_pending_changes      where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.onboarding_scan_manifest   where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.pending_syncs              where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.pending_ingestions         where wizard_session_id = any (synthetic_ids)
      union
      select drive_file_id from public.deferred_ingestions        where wizard_session_id = any (synthetic_ids)
    ) ids;
  foreach dfid in array locked_drive_file_ids loop
    perform pg_advisory_xact_lock(hashtext('show:' || dfid));
  end loop;

  -- R53-1: session-scoped AND locked-set-bound deletes (live-partition rows wizard_session_id IS NULL
  -- untouchable by construction; drive-id-bearing tables additionally bound to locked_drive_file_ids).
  delete from public.pending_syncs              where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.pending_ingestions         where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.deferred_ingestions        where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.onboarding_scan_manifest   where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.shows_pending_changes      where wizard_session_id = any (synthetic_ids) and drive_file_id = any (locked_drive_file_ids) and (active_sid is null or wizard_session_id <> active_sid);
  delete from public.wizard_finalize_checkpoints where wizard_session_id = any (synthetic_ids) and (active_sid is null or wizard_session_id <> active_sid);  -- no drive id column

  -- R53-1: post-delete residue check — a late row (stale tab / PostgREST writer pre-Task-4.7) outside
  -- the locked set aborts the WHOLE migration transaction (marker row rolls back; re-run is clean).
  if exists (
    select 1 from public.pending_syncs       where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.pending_ingestions  where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.deferred_ingestions where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.onboarding_scan_manifest where wizard_session_id = any (synthetic_ids)
    union all
    select 1 from public.shows_pending_changes    where wizard_session_id = any (synthetic_ids)
  ) then
    raise exception 'onboarding_fixups purge: residue outside locked drive-id set — re-run the migration';
  end if;
end $$;
commit;  -- R59-2

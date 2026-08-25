-- A database-side posture gate on the two retention prunes.
--
-- Both prune functions delete GLOBALLY by time window and are reachable on the
-- validation project by anything holding the pooler DSN or the service-role key.
-- Probed 2026-08-22: a default `select public.prune_sync_log()` there deletes
-- 2,488 live rows. Every client-side guard on that surface keys on something a
-- test AUTHORS — a SQL spelling, a connection's URL provenance — and the spelling
-- axis is open. The database is where every client and channel converges.
--
-- The posture marker already exists: public.destructive_reset_gate ships at
-- enabled=false everywhere and only validation projects flip it to true. This
-- migration reuses it rather than adding a second marker; spec review R1 killed
-- the two-marker draft.
--
-- Spec: docs/superpowers/specs/db/2026-08-22-validation-prune-db-side-gate-design.md §2.3, §2.4.

create or replace function public.assert_prune_enabled() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_validation boolean;
begin
  select enabled into v_validation from public.destructive_reset_gate where id = 'default';
  -- true => this database declares the validation posture (D4) => refuse
  -- null => no posture marker at all                           => refuse
  if v_validation is not false then
    raise exception 'prune not enabled for this database';
  end if;
end;
$$;
revoke all on function public.assert_prune_enabled() from public, anon, authenticated;
grant execute on function public.assert_prune_enabled() to service_role;

-- `is not false` is the whole fail-closed contract in one predicate: `true`
-- refuses because the database said it is validation, `null` refuses because the
-- database said nothing. Only an explicit `false` — the value D4 ships everywhere
-- and prod keeps forever — allows a prune. A `coalesce(..., false)` read would
-- wave the absent-marker state through, which was R1's third hole.

-- The two bodies each gain one statement. The language moves from `sql` to
-- `plpgsql` because a `language sql` body cannot raise. Everything live
-- assertions pin — prosecdef, the pinned search_path, the `retain interval
-- DEFAULT '60 days'` argument list, the grants, the returned global count — is
-- unchanged, and `create or replace` preserves the grants.

create or replace function public.prune_sync_log(retain interval default interval '60 days')
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  perform public.assert_prune_enabled();
  with deleted as (
    delete from public.sync_log where occurred_at < now() - retain returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
$$;

create or replace function public.prune_app_events(retain interval default interval '60 days')
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  perform public.assert_prune_enabled();
  with deleted as (
    delete from public.app_events where occurred_at < now() - retain returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
$$;

-- M12 Phase 0.E adversarial R2 (MEDIUM) — DB-side rate-limit bucket derivation.
--
-- The report-fixtures harness seeds report_rate_limits for the rate-limit-admin
-- / rate-limit-crew outcomes. The seeded hour_bucket MUST equal what the live
-- enforceQuota path writes — Postgres `date_trunc('hour', now())` at INSERT
-- time (lib/reports/rateLimit.ts:82-83). Deriving the bucket from the harness's
-- client clock (or the REST gateway Date header, second-granularity) admits an
-- hour-boundary race: the harness could seed bucket H while the validation POST
-- lands in H+1, missing the seeded quota row and mutating the real quota path.
--
-- This RPC snapshots the prior count and UPSERTs the seed in a single call
-- using the database clock, returning the DB-authoritative recorded bucket for
-- the harness's file-backed snapshot. SELECT-then-UPSERT yields the PRE-seed
-- prior count (NULL if no row), preserving the F34/F36 snapshot+restore + F39
-- force-overwrite semantics (under force-overwrite the prior row is the
-- already-seeded count, which becomes the new restore target).
--
-- No advisory lock: report_rate_limits is NOT in the per-show lock set
-- (plan-wide invariant 2). Service-role only.

drop function if exists public.validation_seed_rate_limit(text, text, integer);
drop function if exists public.validation_seed_rate_limit(text, text, integer, timestamptz);

create or replace function public.validation_seed_rate_limit(
  p_kind text,
  p_identity text,
  p_count integer,
  -- R2 adversarial R4 (HIGH) — when the caller is RE-seeding under
  -- --force-overwrite-snapshot, it passes the EXISTING snapshot's recorded
  -- bucket here. If the DB clock has rolled into a new hour since that snapshot
  -- was taken, the prior hour's seeded row would be stranded (the force path
  -- would overwrite the only restore record with the new bucket). The DB clock
  -- is authoritative, so this cross-hour check lives here: refuse before
  -- seeding so the harness exits 1 with the old snapshot intact (the dev runs
  -- cleanup first, which restores the old bucket, then re-seeds). NULL on the
  -- normal (non-force) seed path — no check.
  p_expected_prev_bucket timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now());
  v_prior integer;
begin
  if p_kind not in ('admin', 'crew') then
    raise exception 'validation_seed_rate_limit: invalid kind %', p_kind;
  end if;
  if p_identity is null or length(p_identity) = 0 then
    raise exception 'validation_seed_rate_limit: identity must be non-empty';
  end if;
  if p_expected_prev_bucket is not null and p_expected_prev_bucket <> v_bucket then
    raise exception 'validation_seed_rate_limit: force-overwrite across hour boundary — prior snapshot bucket % is not the current bucket %; the prior bucket''s seeded row would be stranded. Run cleanup first (it restores the prior bucket via the existing snapshot), then re-seed.', p_expected_prev_bucket, v_bucket;
  end if;

  -- R2 adversarial R3 (HIGH) — serialize snapshot+seed against concurrent
  -- live quota writes. Live enforceQuota (lib/reports/rateLimit.ts:82-86)
  -- mutates the same (kind, identity, hour_bucket) row via
  -- INSERT ... ON CONFLICT ... count + 1, acquiring a ROW EXCLUSIVE table
  -- lock. Without serialization, a real increment landing between this
  -- function's SELECT and UPSERT would be excluded from snapshot_prior_count,
  -- and cleanup would later restore/delete from the stale snapshot — silently
  -- losing legitimate quota state (the F34/F36 data-loss class). SHARE ROW
  -- EXCLUSIVE conflicts with ROW EXCLUSIVE, so any concurrent enforceQuota
  -- write blocks until this transaction commits; the snapshot then captures
  -- the true pre-seed count. The lock is held only for the brief
  -- snapshot+upsert and released at function-transaction commit. No deadlock
  -- risk: this function touches only report_rate_limits and takes no other
  -- lock; enforceQuota likewise touches only this table.
  lock table public.report_rate_limits in share row exclusive mode;

  -- Pre-seed prior count at the DB-authoritative bucket (NULL if no row).
  select count into v_prior
    from public.report_rate_limits
   where kind = p_kind and identity = p_identity and hour_bucket = v_bucket;

  insert into public.report_rate_limits (kind, identity, hour_bucket, count)
  values (p_kind, p_identity, v_bucket, p_count)
  on conflict (kind, identity, hour_bucket) do update set count = excluded.count;

  return jsonb_build_object(
    'recorded_hour_bucket', v_bucket,
    'snapshot_prior_count', v_prior
  );
end;
$$;

revoke all on function public.validation_seed_rate_limit(text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.validation_seed_rate_limit(text, text, integer, timestamptz) to service_role;

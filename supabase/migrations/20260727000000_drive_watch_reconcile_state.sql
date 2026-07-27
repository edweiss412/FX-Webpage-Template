-- drive_watch_reconcile_state: retry bookkeeping for the watch reconnect ladder
-- (spec 2026-07-26-watch-reconcile-backoff-v2 §3.2/§3.3). One row per watched
-- folder; written ONLY by a completed subscribe attempt (write-iff-attempt,
-- spec §3.3a). One-shot forward migration: the bare `create table` is
-- deliberately NOT idempotent — re-applying fails loudly on the duplicate
-- relation, which is the intended signal. The REVOKE/GRANT statements below
-- are naturally idempotent.

create table public.drive_watch_reconcile_state (
  watched_folder_id    text primary key,
  consecutive_failures int         not null default 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz not null default now(),
  last_attempt_outcome text,
  last_error_class     text,
  last_error_message   text,
  updated_at           timestamptz not null default now(),
  constraint drive_watch_reconcile_state_error_class_check check (
    last_error_class is null or last_error_class in ('config', 'drive_api', 'db')
  ),
  constraint drive_watch_reconcile_state_attempt_outcome_check check (
    last_attempt_outcome is null or last_attempt_outcome in ('failed', 'succeeded')
  ),
  constraint drive_watch_reconcile_state_failures_nonneg check (consecutive_failures >= 0)
);

-- Lockdown from birth (spec §3.2): fully private — byte-for-byte the
-- show_share_tokens shape (20260523000002_show_share_tokens.sql:43-45).
-- RLS enabled with NO policy, so even a privilege regression yields zero rows.
revoke all on table public.drive_watch_reconcile_state from public, anon, authenticated;
grant all privileges on table public.drive_watch_reconcile_state to service_role;
alter table public.drive_watch_reconcile_state enable row level security;

-- Backoff ladder in SQL (spec §3.3): the conflict path of statement (A) computes
-- the next wait server-side, so the ladder cannot race an app-side read. Total
-- over its input, never null, monotonically non-decreasing, clamped at the cap.
-- n = 0 / null are unreachable through statement (A) and return the first rung
-- defensively rather than null.
create function public.watch_backoff_ms(n integer)
returns bigint
language sql
immutable
as $$
  select case
    when n is null or n < 1 then 900000::bigint
    when n = 1 then 900000::bigint
    when n = 2 then 1800000::bigint
    when n = 3 then 3600000::bigint
    else 7200000::bigint
  end
$$;

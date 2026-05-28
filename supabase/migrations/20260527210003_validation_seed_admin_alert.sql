-- M12 Phase 0.E adversarial R5 (HIGH) — atomic admin_alerts clobber guard.
--
-- The harness materializes fixture admin_alerts for the lookup-inconclusive
-- (incl. the bot-login-missing dual-write) and orphaned-lost-lease outcomes.
-- upsert_admin_alert coalesces on the unresolved (coalesce(show_id::text,''),
-- code) unique index and REPLACES context; defaultCleanup later deletes rows
-- tagged m12-fixture-*. If the validation show already carries a REAL unresolved
-- alert of the same (show_id, code), seeding overwrites its context and cleanup
-- deletes a real alert (the F34/F36 data-loss class on admin_alerts).
--
-- A harness-side preflight SELECT + later RPC is a TOCTOU: a real producer
-- (live submit.ts writes admin_alerts via raw INSERT) can insert between the
-- check and the write. This RPC makes the check + upsert ATOMIC by taking
-- SHARE ROW EXCLUSIVE on admin_alerts (conflicts with the ROW EXCLUSIVE the
-- live INSERT acquires), so a concurrent real producer blocks until this
-- transaction commits. It refuses (raises) if a pre-existing unresolved row of
-- this (show_id, code) is NOT a m12-fixture row; otherwise it delegates the
-- actual write to the canonical upsert_admin_alert RPC (so the sanctioned
-- producer path still performs the mutation — _metaAdminAlertProducer intent).
--
-- service_role only; no advisory lock (admin_alerts is not in the per-show
-- lock set per plan-wide invariant 2). The internal call to upsert_admin_alert
-- executes with this SECURITY DEFINER function's privileges.

drop function if exists public.validation_seed_admin_alert(uuid, text, jsonb);

create or replace function public.validation_seed_admin_alert(
  p_show_id uuid,
  p_code text,
  p_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_tag text;
  v_found boolean := false;
  v_id uuid;
begin
  -- Atomic-ize the check+write against concurrent real producers.
  lock table public.admin_alerts in share row exclusive mode;

  select context->>'validation_tag'
    into v_existing_tag
    from public.admin_alerts
   where code = p_code
     and coalesce(show_id::text, '') = coalesce(p_show_id::text, '')
     and resolved_at is null;
  v_found := found;

  if v_found and (v_existing_tag is null or v_existing_tag not like 'm12-fixture-%') then
    raise exception
      'validation_seed_admin_alert: refusing to seed admin_alert — a pre-existing UNRESOLVED % alert exists for show % and is NOT a m12-fixture row (validation_tag=%). The upsert would overwrite its context and cleanup would then DELETE a real alert. Resolve the existing alert first.',
      p_code, coalesce(p_show_id::text, '<global>'), coalesce(v_existing_tag, '<absent>');
  end if;

  -- Delegate the actual write to the canonical producer RPC (still under the
  -- table lock, so check+write is atomic).
  v_id := public.upsert_admin_alert(p_show_id, p_code, p_context);
  return v_id;
end;
$$;

revoke all on function public.validation_seed_admin_alert(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.validation_seed_admin_alert(uuid, text, jsonb) to service_role;

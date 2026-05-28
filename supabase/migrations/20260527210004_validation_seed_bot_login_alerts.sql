-- M12 Phase 0.E adversarial R12 (MEDIUM) — atomic bot-login dual-write.
--
-- The lookup-inconclusive `bot-login-missing` variant mirrors production
-- handleLookupInconclusive (submit.ts:703-704,731-732): a GLOBAL
-- GITHUB_BOT_LOGIN_MISSING alert (show_id=null) AND a show-scoped
-- REPORT_LOOKUP_INCONCLUSIVE alert. Writing them as two separate RPC calls is
-- NOT atomic: if the global write succeeds and the show-scoped write then
-- refuses (a pre-existing real REPORT_LOOKUP_INCONCLUSIVE alert on the show),
-- the command exits with a leftover global fixture alert and no matching
-- show-scoped row.
--
-- This RPC makes the dual-write both-or-neither: under ONE SHARE ROW EXCLUSIVE
-- lock it checks BOTH scopes for a non-fixture clobber first, and only if both
-- are clear writes both (delegating to the canonical upsert_admin_alert) and
-- refreshes raised_at on both so the re-seeded fixture alerts sort topmost.
-- If either scope would clobber a real alert, it raises and writes NEITHER.
--
-- service_role only.

drop function if exists public.validation_seed_bot_login_alerts(uuid, jsonb);

create or replace function public.validation_seed_bot_login_alerts(
  p_show_id uuid,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_global_tag text;
  v_show_tag text;
  v_found boolean;
  v_global_id uuid;
  v_show_id uuid;
begin
  lock table public.admin_alerts in share row exclusive mode;

  -- (1) Check the GLOBAL GITHUB_BOT_LOGIN_MISSING scope (show_id IS NULL).
  select context->>'validation_tag' into v_global_tag
    from public.admin_alerts
   where code = 'GITHUB_BOT_LOGIN_MISSING' and show_id is null and resolved_at is null;
  v_found := found;
  if v_found and (v_global_tag is null or v_global_tag not like 'm12-fixture-%') then
    raise exception
      'validation_seed_bot_login_alerts: refusing — a pre-existing UNRESOLVED global GITHUB_BOT_LOGIN_MISSING alert is NOT a m12-fixture row (validation_tag=%). Resolve it first.',
      coalesce(v_global_tag, '<absent>');
  end if;

  -- (2) Check the show-scoped REPORT_LOOKUP_INCONCLUSIVE scope.
  select context->>'validation_tag' into v_show_tag
    from public.admin_alerts
   where code = 'REPORT_LOOKUP_INCONCLUSIVE'
     and coalesce(show_id::text, '') = coalesce(p_show_id::text, '')
     and resolved_at is null;
  v_found := found;
  if v_found and (v_show_tag is null or v_show_tag not like 'm12-fixture-%') then
    raise exception
      'validation_seed_bot_login_alerts: refusing — a pre-existing UNRESOLVED show-scoped REPORT_LOOKUP_INCONCLUSIVE alert for show % is NOT a m12-fixture row (validation_tag=%). Resolve it first.',
      coalesce(p_show_id::text, '<global>'), coalesce(v_show_tag, '<absent>');
  end if;

  -- (3) Both scopes clear → write BOTH (canonical producer), then refresh
  --     raised_at so re-seeded fixture alerts sort topmost (R11).
  v_global_id := public.upsert_admin_alert(null, 'GITHUB_BOT_LOGIN_MISSING', p_context);
  v_show_id := public.upsert_admin_alert(p_show_id, 'REPORT_LOOKUP_INCONCLUSIVE', p_context);

  update public.admin_alerts
     set raised_at = now()
   where resolved_at is null
     and (
       (code = 'GITHUB_BOT_LOGIN_MISSING' and show_id is null)
       or (code = 'REPORT_LOOKUP_INCONCLUSIVE'
           and coalesce(show_id::text, '') = coalesce(p_show_id::text, ''))
     );

  return jsonb_build_object('global_id', v_global_id, 'show_scoped_id', v_show_id);
end;
$$;

revoke all on function public.validation_seed_bot_login_alerts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.validation_seed_bot_login_alerts(uuid, jsonb) to service_role;

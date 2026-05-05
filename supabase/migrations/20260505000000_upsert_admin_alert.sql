drop function if exists public.upsert_admin_alert(uuid, text, jsonb);

create or replace function public.upsert_admin_alert(
  p_show_id uuid,
  p_code text,
  p_context jsonb
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_alerts (show_id, code, context)
  values (p_show_id, p_code, p_context)
  on conflict (coalesce(show_id::text, ''), code) where resolved_at is null
  do update set
    last_seen_at = now(),
    occurrence_count = public.admin_alerts.occurrence_count + 1,
    context = excluded.context
  returning id;
$$;

revoke all on function public.upsert_admin_alert(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_admin_alert(uuid, text, jsonb) to service_role;

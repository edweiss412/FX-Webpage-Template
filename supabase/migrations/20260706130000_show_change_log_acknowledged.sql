alter table public.show_change_log
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by text;

-- one-shot clean-start backfill (forward-only)
update public.show_change_log
   set acknowledged_at = now()
 where source = 'auto_apply' and status = 'applied' and acknowledged_at is null;

create or replace function public.acknowledge_changes(p_show_id uuid, p_ids uuid[])
  returns jsonb language plpgsql security definer
  set search_path = public, pg_temp as $$
declare v_rc int;
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='acknowledge_changes is admin-only';
  end if;
  if p_ids is null then
    raise exception using errcode='22004', message='p_ids must not be null';
  end if;
  update public.show_change_log
     set acknowledged_at = now(), acknowledged_by = public.auth_email_canonical()
   where show_id = p_show_id and source = 'auto_apply' and status = 'applied'
     and acknowledged_at is null and id = any(p_ids);
  get diagnostics v_rc = row_count;
  return jsonb_build_object('ok', true, 'count', v_rc);
end;
$$;
revoke all on function public.acknowledge_changes(uuid, uuid[]) from public, anon;
grant execute on function public.acknowledge_changes(uuid, uuid[]) to authenticated;

create or replace function public.roster_shift_counts(p_show_ids uuid[])
  returns table(show_id uuid, added int, removed int, renamed int)
  language sql stable security definer set search_path = public, pg_temp as $$
  select show_id,
         count(*) filter (where change_kind = 'crew_added')::int,
         count(*) filter (where change_kind = 'crew_removed')::int,
         count(*) filter (where change_kind = 'crew_renamed')::int
    from public.show_change_log
   where show_id = any(p_show_ids)
     and source = 'auto_apply' and status = 'applied' and acknowledged_at is null
     and change_kind in ('crew_added','crew_removed','crew_renamed')
   group by show_id;
$$;
revoke all on function public.roster_shift_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.roster_shift_counts(uuid[]) to service_role;

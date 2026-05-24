-- M11.5 A3: admin reset of all picker selections for one show.
-- The SECURITY DEFINER RPC is the only advisory-lock holder for this reset
-- path. Callers must not wrap it in a JS-side per-show lock.

create or replace function public.reset_picker_epoch_atomic(p_show_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_new_epoch int;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'reset_picker_epoch_atomic is admin-only';
  end if;

  select drive_file_id
    into v_drive_file_id
    from public.shows
   where id = p_show_id;

  if v_drive_file_id is null then
    raise exception 'show not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.shows
     set picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = clock_timestamp()
   where id = p_show_id
   returning picker_epoch into v_new_epoch;

  perform public.publish_show_invalidation(p_show_id);

  return v_new_epoch;
end;
$$;

revoke all on function public.reset_picker_epoch_atomic(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reset_picker_epoch_atomic(uuid) to authenticated;

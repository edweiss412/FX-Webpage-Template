-- M11.5 A4: rotate the bearer URL token and invalidate all existing picker
-- cookies for the show in the same advisory-locked transaction.

create or replace function public.rotate_show_share_token(p_show_id uuid)
  returns table (new_share_token text, new_epoch int)
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'rotate_show_share_token is admin-only';
  end if;

  select drive_file_id
    into v_drive_file_id
    from public.shows
   where id = p_show_id;

  if v_drive_file_id is null then
    raise exception 'show not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.show_share_tokens
     set share_token = encode(extensions.gen_random_bytes(32), 'hex'),
         rotated_at = clock_timestamp()
   where show_id = p_show_id
   returning share_token into new_share_token;

  update public.shows
     set picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = clock_timestamp()
   where id = p_show_id
   returning picker_epoch into new_epoch;

  perform public.publish_show_invalidation(p_show_id);

  return next;
end;
$$;

revoke all on function public.rotate_show_share_token(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rotate_show_share_token(uuid) to authenticated;

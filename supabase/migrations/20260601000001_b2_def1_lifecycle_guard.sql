-- M12.2 Phase B2 DEF-1: rotate_show_share_token / reset_picker_epoch_atomic must refuse archived or
-- finalize-owned shows (net precondition: published && !archived && !finalize-owned). Follow-on migration
-- (create or replace) so the original M11.5 files' history is preserved. The guard RE-READS archived/
-- published AFTER the advisory lock (the pre-lock read stays drive_file_id-only): a pre-lock guard would
-- be stale once a concurrent Archive commits while waiting on the lock (R32 TOCTOU). readfinalizeowned_b2
-- is defined in 20260601000000 (applied earlier by timestamp order).

create or replace function public.rotate_show_share_token(p_show_id uuid)
  returns table (new_share_token text, new_epoch int)
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_archived boolean;
  v_published boolean;
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

  -- DEF-1 guard (post-lock re-read).
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
  if (not v_published) and public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;

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

create or replace function public.reset_picker_epoch_atomic(p_show_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_archived boolean;
  v_published boolean;
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

  -- DEF-1 guard (post-lock re-read).
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
  if (not v_published) and public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;

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

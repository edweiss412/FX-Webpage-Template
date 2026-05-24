create or replace function public.select_identity_atomic(
  p_slug text,
  p_share_token text,
  p_crew_member_id uuid
)
returns table (
  out_show_id uuid,
  out_picker_epoch int,
  out_observed_at_millis bigint,
  out_rejection_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_show_id uuid;
  v_resolved_show_id uuid;
  v_drive_file_id text;
  v_published boolean;
  v_archived boolean;
  v_crew_show uuid;
  v_claimed_via_oauth_at timestamptz;
begin
  select s.id, s.drive_file_id
    into v_show_id, v_drive_file_id
    from public.shows s
   where s.slug = p_slug
   limit 1;

  if v_show_id is null then
    out_rejection_code := 'PICKER_INVALID_SHARE_TOKEN';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  v_resolved_show_id := public.resolve_show_by_slug_and_token(p_slug, p_share_token);
  if v_resolved_show_id is null or v_resolved_show_id <> v_show_id then
    out_rejection_code := 'PICKER_INVALID_SHARE_TOKEN';
    return next;
    return;
  end if;

  select s.published, s.archived
    into v_published, v_archived
    from public.shows s
   where s.id = v_show_id;

  if v_archived or not v_published then
    out_rejection_code := 'PICKER_SHOW_UNAVAILABLE';
    return next;
    return;
  end if;

  select cm.show_id, cm.claimed_via_oauth_at
    into v_crew_show, v_claimed_via_oauth_at
    from public.crew_members cm
   where cm.id = p_crew_member_id;

  if v_crew_show is null then
    out_rejection_code := 'PICKER_CREW_MEMBER_NOT_FOUND';
    return next;
    return;
  end if;

  if v_crew_show <> v_show_id then
    out_rejection_code := 'PICKER_CREW_MEMBER_WRONG_SHOW';
    return next;
    return;
  end if;

  if v_claimed_via_oauth_at is not null then
    out_rejection_code := 'PICKER_IDENTITY_CLAIMED';
    return next;
    return;
  end if;

  select s.picker_epoch
    into out_picker_epoch
    from public.shows s
   where s.id = v_show_id;

  out_observed_at_millis := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  out_show_id := v_show_id;
  out_rejection_code := null;
  return next;
end;
$$;

revoke all on function public.select_identity_atomic(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.select_identity_atomic(text, text, uuid)
  to authenticated, service_role;

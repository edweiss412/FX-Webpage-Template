create or replace function public.claim_oauth_identity(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := p_email;
  v_locked_show_ids uuid[];
  v_claimed_count integer := 0;
  v_shows jsonb;
  v_claim_at timestamptz;
  v_claimed_rows jsonb := '[]'::jsonb;
  r record;
begin
  with show_set as (
    select distinct s.id as show_id, s.drive_file_id
      from public.crew_members cm
      join public.shows s on s.id = cm.show_id
     where cm.email = v_email
     order by s.drive_file_id
  )
  select array_agg(show_id) into v_locked_show_ids from show_set;

  if v_locked_show_ids is null or array_length(v_locked_show_ids, 1) is null then
    return jsonb_build_object(
      'claimed_count', 0,
      'claimed_rows', '[]'::jsonb,
      'shows', '[]'::jsonb,
      'mint_safe_t_millis', floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 1
    );
  end if;

  for r in
    select s.drive_file_id
      from public.shows s
     where s.id = any(v_locked_show_ids)
     order by s.drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
  end loop;

  v_claim_at := clock_timestamp();

  with updated as (
    update public.crew_members cm
       set claimed_via_oauth_at = v_claim_at
     where cm.email = v_email
       and cm.show_id = any(v_locked_show_ids)
       and cm.claimed_via_oauth_at is null
     returning cm.id as crew_member_id, cm.show_id
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'crew_member_id', crew_member_id,
           'show_id', show_id,
           'claimed_at_millis', floor(extract(epoch from v_claim_at) * 1000)::bigint
         )), '[]'::jsonb)
    into v_claimed_count, v_claimed_rows
    from updated;

  select coalesce(jsonb_agg(jsonb_build_object(
           'show_id', s.id,
           'crew_member_id', cm.id,
           'picker_epoch', s.picker_epoch
         )), '[]'::jsonb)
    into v_shows
    from public.crew_members cm
    join public.shows s on s.id = cm.show_id
   where cm.email = v_email
     and cm.show_id = any(v_locked_show_ids)
     and s.published = true
     and s.archived = false;

  return jsonb_build_object(
    'claimed_count', v_claimed_count,
    'claimed_rows', v_claimed_rows,
    'shows', v_shows,
    'mint_safe_t_millis',
      greatest(
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        coalesce(
          (select floor(extract(epoch from max(claimed_via_oauth_at)) * 1000)::bigint
             from public.crew_members
            where email = v_email
              and claimed_via_oauth_at is not null),
          0
        )
      ) + 1
  );
end;
$$;

revoke all on function public.claim_oauth_identity(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_oauth_identity(text) to service_role;

drop function if exists public.revoke_leaked_link_atomic(uuid, text, int, text);

create or replace function public.revoke_leaked_link_atomic(
  p_show_id uuid,
  p_crew_name text,
  p_token_version int,
  p_branch text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  auth_row public.crew_member_auth%rowtype;
  effective_branch text;
begin
  if p_branch not in ('surgical', 'floor_bump', 'no_op') then
    raise exception 'invalid leaked-link branch: %', p_branch
      using errcode = '22023';
  end if;

  select *
    into auth_row
    from public.crew_member_auth
   where show_id = p_show_id
     and crew_name = p_crew_name
   for update;

  if not found then
    return jsonb_build_object('branch', 'no_op', 'found', false);
  end if;

  insert into public.revoked_links (
    show_id,
    crew_name,
    token_version,
    revoked_reason
  )
  values (
    p_show_id,
    p_crew_name,
    p_token_version,
    'leaked_query_token'
  )
  on conflict (show_id, crew_name, token_version) do nothing;

  if p_token_version = auth_row.current_token_version then
    effective_branch := 'floor_bump';
    update public.crew_member_auth
       set revoked_below_version = auth_row.current_token_version
     where show_id = p_show_id
       and crew_name = p_crew_name;
  elsif p_token_version < auth_row.current_token_version then
    effective_branch := 'surgical';
  else
    -- R14 #1 (round-13 §A HIGH): future-version leak path must NOT
    -- regress max_issued_version. Pre-R14 the branch overwrote max
    -- with p_token_version, which decreased max from any prior state
    -- where max > current (e.g. current=7/max=9/floor=4 + leaked=8 →
    -- max=8, regressing). Next Issue-New-Link would reissue version
    -- 9 — possibly resurrecting a previously-issued higher-version
    -- JWT. Use greatest() so max is monotonic non-decreasing across
    -- this branch.
    effective_branch := 'floor_bump';
    update public.crew_member_auth
       set current_token_version = p_token_version,
           max_issued_version = greatest(auth_row.max_issued_version, p_token_version),
           revoked_below_version = p_token_version
     where show_id = p_show_id
       and crew_name = p_crew_name;
  end if;

  return jsonb_build_object(
    'branch', effective_branch,
    'found', true,
    'current_token_version', p_token_version
  );
end;
$$;

-- Privileged write helper: lock down EXECUTE so only the service-role
-- server path (the leaked-link middleware) may invoke this RPC.
-- Supabase's default privileges grant EXECUTE to anon + authenticated
-- on public-schema functions, so REVOKE FROM PUBLIC alone is insufficient
-- — anon and authenticated must be revoked explicitly. Other entry
-- points must go through the JWT-verified compromise-handler trust
-- boundary in middleware.ts.
revoke all on function public.revoke_leaked_link_atomic(uuid, text, int, text) from public, anon, authenticated;
grant execute on function public.revoke_leaked_link_atomic(uuid, text, int, text) to service_role;

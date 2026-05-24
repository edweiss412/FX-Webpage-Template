create or replace function public.admin_read_share_token(p_show_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case when public.is_admin() then t.share_token else null end
    from public.show_share_tokens t
   where t.show_id = p_show_id
   limit 1
$$;

revoke all on function public.admin_read_share_token(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_read_share_token(uuid) to authenticated;

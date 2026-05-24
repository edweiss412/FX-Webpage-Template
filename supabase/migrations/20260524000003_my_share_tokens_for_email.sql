create or replace function public.my_share_tokens_for_email()
returns table(slug text, share_token text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.slug, sst.share_token
    from public.crew_members cm
    join public.shows s on s.id = cm.show_id
    join public.show_share_tokens sst on sst.show_id = s.id
   where cm.email = public.auth_email_canonical()
     and s.published = true
     and s.archived = false
   order by s.slug;
$$;

revoke all on function public.my_share_tokens_for_email() from public, anon, authenticated, service_role;
grant execute on function public.my_share_tokens_for_email() to authenticated;

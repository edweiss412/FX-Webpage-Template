-- R35: show_share_tokens stays private; callers resolve bearer URLs via this
-- SECURITY DEFINER join instead of direct table access.

create or replace function public.resolve_show_by_slug_and_token(
  p_slug text,
  p_share_token text
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id
    from public.shows s
    join public.show_share_tokens t on t.show_id = s.id
   where s.slug = p_slug
     and t.share_token = p_share_token
   limit 1
$$;

revoke all on function public.resolve_show_by_slug_and_token(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_show_by_slug_and_token(text, text)
  to authenticated, service_role;

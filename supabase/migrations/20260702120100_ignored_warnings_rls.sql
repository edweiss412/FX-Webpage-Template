grant select, insert, update, delete on table public.ignored_warnings to anon, authenticated;
grant all privileges on table public.ignored_warnings to service_role;
alter table public.ignored_warnings enable row level security;
create policy admin_only on public.ignored_warnings
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

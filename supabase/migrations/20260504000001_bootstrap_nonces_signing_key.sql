create extension if not exists pg_cron;

alter table public.bootstrap_nonces
  add column if not exists signing_key_id text not null default 'k1';

grant select, insert, update, delete on table public.bootstrap_nonces to anon, authenticated;
grant all privileges on table public.bootstrap_nonces to service_role;
alter table public.bootstrap_nonces enable row level security;
drop policy if exists admin_only on public.bootstrap_nonces;
create policy admin_only on public.bootstrap_nonces
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists bootstrap_nonces_issued_at_idx
  on public.bootstrap_nonces (issued_at);

create or replace function public.cleanup_bootstrap_nonces()
  returns void
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  delete from public.bootstrap_nonces
   where issued_at < now() - interval '5 minutes';
$$;

revoke all on function public.cleanup_bootstrap_nonces() from public, anon, authenticated;
grant execute on function public.cleanup_bootstrap_nonces() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-bootstrap-nonces') then
    perform cron.unschedule('cleanup-bootstrap-nonces');
  end if;
  perform cron.schedule(
    'cleanup-bootstrap-nonces',
    '*/5 * * * *',
    'select public.cleanup_bootstrap_nonces();'
  );
end;
$$;

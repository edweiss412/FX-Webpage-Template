-- Bell realtime ping (spec §5). CONTENTLESS payload by design: the identity
-- sanitizer chokepoint (lib/adminAlerts) stays the sole owner of what
-- reaches a browser; realtime is an invalidation signal, never a data carrier.
create or replace function public.publish_admin_alerts_bell_ping()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'admin:alerts', true);
  return null;
end;
$$;
revoke all on function public.publish_admin_alerts_bell_ping() from public, anon, authenticated;

drop trigger if exists admin_alerts_bell_ping_ins on public.admin_alerts;
create trigger admin_alerts_bell_ping_ins
  after insert on public.admin_alerts
  for each statement execute function public.publish_admin_alerts_bell_ping();

drop trigger if exists admin_alerts_bell_ping_upd on public.admin_alerts;
create trigger admin_alerts_bell_ping_upd
  after update on public.admin_alerts
  for each statement execute function public.publish_admin_alerts_bell_ping();

-- Realtime Authorization: private-channel SELECT for admin JWTs only
-- (mint: /api/admin/alerts/bell/token — viewer_kind claim; spec §5.2/§5.3).
-- Sibling of fxav_show_invalidation_subscriber_select (20260504000000).
drop policy if exists fxav_admin_bell_subscriber_select on realtime.messages;
create policy fxav_admin_bell_subscriber_select
  on realtime.messages
  for select
  to authenticated
  using (
    topic = 'admin:alerts'
    and (current_setting('request.jwt.claims', true)::jsonb ->> 'viewer_kind') = 'admin'
  );

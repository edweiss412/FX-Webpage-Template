create or replace function public.canonicalize_email(email text)
  returns text
  language sql
  immutable
as $$
  select lower(btrim($1));
$$;
revoke all on function public.canonicalize_email(text) from public;
grant execute on function public.canonicalize_email(text) to anon, authenticated, service_role;

create or replace function public.auth_email_canonical()
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select public.canonicalize_email(auth.email());
$$;
revoke all on function public.auth_email_canonical() from public;
grant execute on function public.auth_email_canonical() to anon, authenticated, service_role;

create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or coalesce(
           public.auth_email_canonical() = any (
             array['dlarson@fxav.net', 'edweiss412@gmail.com']::text[]
           ),
           false
         );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create or replace function public.can_read_show(p_show_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
           select 1
             from public.crew_members c
            where c.show_id = p_show_id
              and c.email = public.auth_email_canonical()
         );
$$;
revoke all on function public.can_read_show(uuid) from public;
grant execute on function public.can_read_show(uuid) to anon, authenticated, service_role;

grant select, insert, update, delete on table public.shows_internal to anon, authenticated;
grant all privileges on table public.shows_internal to service_role;
alter table public.shows_internal enable row level security;
create policy admin_only on public.shows_internal
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.sync_log to anon, authenticated;
grant all privileges on table public.sync_log to service_role;
alter table public.sync_log enable row level security;
create policy admin_only on public.sync_log
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.reports to anon, authenticated;
grant all privileges on table public.reports to service_role;
alter table public.reports enable row level security;
create policy admin_only on public.reports
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.pending_syncs to anon, authenticated;
grant all privileges on table public.pending_syncs to service_role;
alter table public.pending_syncs enable row level security;
create policy admin_only on public.pending_syncs
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.pending_ingestions to anon, authenticated;
grant all privileges on table public.pending_ingestions to service_role;
alter table public.pending_ingestions enable row level security;
create policy admin_only on public.pending_ingestions
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.crew_member_auth to anon, authenticated;
grant all privileges on table public.crew_member_auth to service_role;
alter table public.crew_member_auth enable row level security;
create policy admin_only on public.crew_member_auth
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.revoked_links to anon, authenticated;
grant all privileges on table public.revoked_links to service_role;
alter table public.revoked_links enable row level security;
create policy admin_only on public.revoked_links
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.link_sessions to anon, authenticated;
grant all privileges on table public.link_sessions to service_role;
alter table public.link_sessions enable row level security;
create policy admin_only on public.link_sessions
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.bootstrap_nonces to anon, authenticated;
grant all privileges on table public.bootstrap_nonces to service_role;
alter table public.bootstrap_nonces enable row level security;
create policy admin_only on public.bootstrap_nonces
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.app_settings to anon, authenticated;
grant all privileges on table public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy admin_only on public.app_settings
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.deferred_ingestions to anon, authenticated;
grant all privileges on table public.deferred_ingestions to service_role;
alter table public.deferred_ingestions enable row level security;
create policy admin_only on public.deferred_ingestions
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.admin_alerts to anon, authenticated;
grant all privileges on table public.admin_alerts to service_role;
alter table public.admin_alerts enable row level security;
create policy admin_only on public.admin_alerts
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.sync_audit to anon, authenticated;
grant all privileges on table public.sync_audit to service_role;
alter table public.sync_audit enable row level security;
create policy admin_only on public.sync_audit
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.drive_watch_channels to anon, authenticated;
grant all privileges on table public.drive_watch_channels to service_role;
alter table public.drive_watch_channels enable row level security;
create policy admin_only on public.drive_watch_channels
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.report_rate_limits to anon, authenticated;
grant all privileges on table public.report_rate_limits to service_role;
alter table public.report_rate_limits enable row level security;
create policy admin_only on public.report_rate_limits
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.onboarding_scan_manifest to anon, authenticated;
grant all privileges on table public.onboarding_scan_manifest to service_role;
alter table public.onboarding_scan_manifest enable row level security;
create policy admin_only on public.onboarding_scan_manifest
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.pending_snapshot_uploads to anon, authenticated;
grant all privileges on table public.pending_snapshot_uploads to service_role;
alter table public.pending_snapshot_uploads enable row level security;
create policy admin_only on public.pending_snapshot_uploads
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.revision_race_cooldowns to anon, authenticated;
grant all privileges on table public.revision_race_cooldowns to service_role;
alter table public.revision_race_cooldowns enable row level security;
create policy admin_only on public.revision_race_cooldowns
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.wizard_finalize_checkpoints to anon, authenticated;
grant all privileges on table public.wizard_finalize_checkpoints to service_role;
alter table public.wizard_finalize_checkpoints enable row level security;
create policy admin_only on public.wizard_finalize_checkpoints
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.shows_pending_changes to anon, authenticated;
grant all privileges on table public.shows_pending_changes to service_role;
alter table public.shows_pending_changes enable row level security;
create policy admin_only on public.shows_pending_changes
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.recovery_drift_cooldowns to anon, authenticated;
grant all privileges on table public.recovery_drift_cooldowns to service_role;
alter table public.recovery_drift_cooldowns enable row level security;
create policy admin_only on public.recovery_drift_cooldowns
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.shows to anon, authenticated;
grant all privileges on table public.shows to service_role;
alter table public.shows enable row level security;
create policy crew_read on public.shows
  for select to anon, authenticated
  using (public.is_admin() or (public.can_read_show(id) and published = true));
create policy admin_insert on public.shows
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.shows
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.shows
  for delete to anon, authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.crew_members to anon, authenticated;
grant all privileges on table public.crew_members to service_role;
alter table public.crew_members enable row level security;
create policy crew_read on public.crew_members
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1
          from public.shows s
         where s.id = crew_members.show_id
           and s.published = true
      )
    )
  );
create policy admin_insert on public.crew_members
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.crew_members
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.crew_members
  for delete to anon, authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.hotel_reservations to anon, authenticated;
grant all privileges on table public.hotel_reservations to service_role;
alter table public.hotel_reservations enable row level security;
create policy crew_read on public.hotel_reservations
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1
          from public.shows s
         where s.id = hotel_reservations.show_id
           and s.published = true
      )
    )
  );
create policy admin_insert on public.hotel_reservations
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.hotel_reservations
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.hotel_reservations
  for delete to anon, authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.rooms to anon, authenticated;
grant all privileges on table public.rooms to service_role;
alter table public.rooms enable row level security;
create policy crew_read on public.rooms
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1
          from public.shows s
         where s.id = rooms.show_id
           and s.published = true
      )
    )
  );
create policy admin_insert on public.rooms
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.rooms
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.rooms
  for delete to anon, authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.transportation to anon, authenticated;
grant all privileges on table public.transportation to service_role;
alter table public.transportation enable row level security;
create policy crew_read on public.transportation
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1
          from public.shows s
         where s.id = transportation.show_id
           and s.published = true
      )
    )
  );
create policy admin_insert on public.transportation
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.transportation
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.transportation
  for delete to anon, authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.contacts to anon, authenticated;
grant all privileges on table public.contacts to service_role;
alter table public.contacts enable row level security;
create policy crew_read on public.contacts
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1
          from public.shows s
         where s.id = contacts.show_id
           and s.published = true
      )
    )
  );
create policy admin_insert on public.contacts
  for insert to anon, authenticated
  with check (public.is_admin());
create policy admin_update on public.contacts
  for update to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy admin_delete on public.contacts
  for delete to anon, authenticated
  using (public.is_admin());

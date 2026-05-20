alter table public.sync_audit
  drop constraint if exists sync_audit_applied_by_email_canonical;
update public.sync_audit
   set applied_by = lower(trim(applied_by))
 where applied_by is distinct from lower(trim(applied_by));
alter table public.sync_audit
  add constraint sync_audit_applied_by_email_canonical
    check (applied_by = lower(trim(applied_by)));

alter table public.app_settings
  drop constraint if exists app_settings_watched_folder_set_by_email_canonical,
  drop constraint if exists app_settings_pending_folder_set_by_email_canonical;
update public.app_settings
   set watched_folder_set_by_email = lower(trim(watched_folder_set_by_email))
 where watched_folder_set_by_email is distinct from lower(trim(watched_folder_set_by_email));
update public.app_settings
   set pending_folder_set_by_email = lower(trim(pending_folder_set_by_email))
 where pending_folder_set_by_email is distinct from lower(trim(pending_folder_set_by_email));
alter table public.app_settings
  add constraint app_settings_watched_folder_set_by_email_canonical
    check (watched_folder_set_by_email is null or watched_folder_set_by_email = lower(trim(watched_folder_set_by_email))),
  add constraint app_settings_pending_folder_set_by_email_canonical
    check (pending_folder_set_by_email is null or pending_folder_set_by_email = lower(trim(pending_folder_set_by_email)));

alter table public.deferred_ingestions
  drop constraint if exists deferred_ingestions_deferred_by_email_canonical;
update public.deferred_ingestions
   set deferred_by_email = lower(trim(deferred_by_email))
 where deferred_by_email is distinct from lower(trim(deferred_by_email));
alter table public.deferred_ingestions
  add constraint deferred_ingestions_deferred_by_email_canonical
    check (deferred_by_email is null or deferred_by_email = lower(trim(deferred_by_email)));

alter table public.admin_alerts
  drop constraint if exists admin_alerts_resolved_by_email_canonical;
update public.admin_alerts
   set resolved_by = lower(trim(resolved_by))
 where resolved_by is distinct from lower(trim(resolved_by));
alter table public.admin_alerts
  add constraint admin_alerts_resolved_by_email_canonical
    check (resolved_by is null or resolved_by = lower(trim(resolved_by)));

alter table public.reports
  drop constraint if exists reports_admin_reported_by_email_canonical;
update public.reports
   set reported_by = lower(trim(reported_by))
 where reported_by_kind = 'admin'
   and reported_by is distinct from lower(trim(reported_by));
alter table public.reports
  add constraint reports_admin_reported_by_email_canonical
    check (reported_by_kind <> 'admin' or reported_by = lower(trim(reported_by)));

alter table public.report_rate_limits
  drop constraint if exists report_rate_limits_admin_identity_email_canonical;
update public.report_rate_limits
   set identity = lower(trim(identity))
 where kind = 'admin'
   and identity is distinct from lower(trim(identity));
alter table public.report_rate_limits
  add constraint report_rate_limits_admin_identity_email_canonical
    check (kind <> 'admin' or identity = lower(trim(identity)));

alter table public.pending_syncs
  drop constraint if exists pending_syncs_wizard_approved_by_email_canonical;
update public.pending_syncs
   set wizard_approved_by_email = lower(trim(wizard_approved_by_email))
 where wizard_approved_by_email is distinct from lower(trim(wizard_approved_by_email));
alter table public.pending_syncs
  add constraint pending_syncs_wizard_approved_by_email_canonical
    check (wizard_approved_by_email is null or wizard_approved_by_email = lower(trim(wizard_approved_by_email)));

do $$
begin
  if to_regclass('dev.sync_audit') is not null then
    update dev.sync_audit
       set applied_by = lower(trim(applied_by))
     where applied_by is distinct from lower(trim(applied_by));
  end if;
  if to_regclass('dev.app_settings') is not null then
    update dev.app_settings
       set watched_folder_set_by_email = lower(trim(watched_folder_set_by_email))
     where watched_folder_set_by_email is distinct from lower(trim(watched_folder_set_by_email));
    update dev.app_settings
       set pending_folder_set_by_email = lower(trim(pending_folder_set_by_email))
     where pending_folder_set_by_email is distinct from lower(trim(pending_folder_set_by_email));
  end if;
  if to_regclass('dev.deferred_ingestions') is not null then
    update dev.deferred_ingestions
       set deferred_by_email = lower(trim(deferred_by_email))
     where deferred_by_email is distinct from lower(trim(deferred_by_email));
  end if;
  if to_regclass('dev.admin_alerts') is not null then
    update dev.admin_alerts
       set resolved_by = lower(trim(resolved_by))
     where resolved_by is distinct from lower(trim(resolved_by));
  end if;
  if to_regclass('dev.reports') is not null then
    update dev.reports
       set reported_by = lower(trim(reported_by))
     where reported_by_kind = 'admin'
       and reported_by is distinct from lower(trim(reported_by));
  end if;
  if to_regclass('dev.report_rate_limits') is not null then
    update dev.report_rate_limits
       set identity = lower(trim(identity))
     where kind = 'admin'
       and identity is distinct from lower(trim(identity));
  end if;
  if to_regclass('dev.pending_syncs') is not null then
    update dev.pending_syncs
       set wizard_approved_by_email = lower(trim(wizard_approved_by_email))
     where wizard_approved_by_email is distinct from lower(trim(wizard_approved_by_email));
  end if;
end
$$;

alter table if exists dev.sync_audit
  drop constraint if exists sync_audit_applied_by_email_canonical,
  add constraint sync_audit_applied_by_email_canonical
    check (applied_by = lower(trim(applied_by)));

alter table if exists dev.app_settings
  drop constraint if exists app_settings_watched_folder_set_by_email_canonical,
  drop constraint if exists app_settings_pending_folder_set_by_email_canonical,
  add constraint app_settings_watched_folder_set_by_email_canonical
    check (watched_folder_set_by_email is null or watched_folder_set_by_email = lower(trim(watched_folder_set_by_email))),
  add constraint app_settings_pending_folder_set_by_email_canonical
    check (pending_folder_set_by_email is null or pending_folder_set_by_email = lower(trim(pending_folder_set_by_email)));

alter table if exists dev.deferred_ingestions
  drop constraint if exists deferred_ingestions_deferred_by_email_canonical,
  add constraint deferred_ingestions_deferred_by_email_canonical
    check (deferred_by_email is null or deferred_by_email = lower(trim(deferred_by_email)));

alter table if exists dev.admin_alerts
  drop constraint if exists admin_alerts_resolved_by_email_canonical,
  add constraint admin_alerts_resolved_by_email_canonical
    check (resolved_by is null or resolved_by = lower(trim(resolved_by)));

alter table if exists dev.reports
  drop constraint if exists reports_admin_reported_by_email_canonical,
  add constraint reports_admin_reported_by_email_canonical
    check (reported_by_kind <> 'admin' or reported_by = lower(trim(reported_by)));

alter table if exists dev.report_rate_limits
  drop constraint if exists report_rate_limits_admin_identity_email_canonical,
  add constraint report_rate_limits_admin_identity_email_canonical
    check (kind <> 'admin' or identity = lower(trim(identity)));

alter table if exists dev.pending_syncs
  drop constraint if exists pending_syncs_wizard_approved_by_email_canonical,
  add constraint pending_syncs_wizard_approved_by_email_canonical
    check (wizard_approved_by_email is null or wizard_approved_by_email = lower(trim(wizard_approved_by_email)));

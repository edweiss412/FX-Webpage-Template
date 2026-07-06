-- S1 (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s1) — resolve
-- SHOW_UNPUBLISHED alerts structurally via a row-level trigger on the `published`
-- false->true transition, instead of hooking every writer individually. Covers
-- publish_show (_publish_show_core), the onboarding finalize-cas flip, the validation
-- fixture mint baseline restore, and any future `published` writer.
--
-- Idempotent re-apply: `create or replace function` + `drop trigger if exists` +
-- `create trigger`; the data-repair UPDATE below is naturally idempotent (a second run
-- touches zero rows because resolved_at is no longer null).

create or replace function public.resolve_show_unpublished_alert_on_publish()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.admin_alerts
     set resolved_at = now()
   where show_id = new.id and code = 'SHOW_UNPUBLISHED' and resolved_at is null;
  return new;
end $$;

drop trigger if exists shows_resolve_unpublished_alert_on_publish on public.shows;
create trigger shows_resolve_unpublished_alert_on_publish
  after update of published on public.shows
  for each row
  when (old.published is distinct from new.published and new.published)
  execute function public.resolve_show_unpublished_alert_on_publish();

-- One-time data repair: heal alerts stranded before the trigger existed (shows that were
-- republished by a writer path before this migration landed, whose SHOW_UNPUBLISHED alert
-- never got an AFTER UPDATE fire retroactively).
update public.admin_alerts a
   set resolved_at = now()
  from public.shows s
 where s.id = a.show_id
   and a.code = 'SHOW_UNPUBLISHED'
   and a.resolved_at is null
   and s.published = true;

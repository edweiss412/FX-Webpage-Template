alter table public.deferred_ingestions
  drop constraint if exists deferred_ingestions_deferred_by_scope_check;

alter table public.deferred_ingestions
  alter column deferred_by_email drop not null;

alter table public.deferred_ingestions
  add constraint deferred_ingestions_deferred_by_scope_check
  check (wizard_session_id is not null or deferred_by_email is not null);

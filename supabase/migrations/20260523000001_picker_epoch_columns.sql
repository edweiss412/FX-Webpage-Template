-- M11.5 A1: picker_epoch invalidates all device picker cookies for a show.
-- Admin/blocking writers bump it through locked SECURITY DEFINER RPCs in later
-- tasks. This trigger only timestamps the row change; it must not acquire the
-- per-show advisory lock or it would become a nested holder.

alter table public.shows
  add column if not exists picker_epoch int not null default 1,
  add column if not exists picker_epoch_bumped_at timestamptz not null default now();

alter table if exists dev.shows
  add column if not exists picker_epoch int not null default 1,
  add column if not exists picker_epoch_bumped_at timestamptz not null default now();

create or replace function public.bump_picker_epoch_bumped_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if old.picker_epoch is distinct from new.picker_epoch then
    new.picker_epoch_bumped_at := clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.bump_picker_epoch_bumped_at() from public;

drop trigger if exists shows_bump_picker_epoch_bumped_at on public.shows;
create trigger shows_bump_picker_epoch_bumped_at
  before update of picker_epoch on public.shows
  for each row
  execute function public.bump_picker_epoch_bumped_at();

drop trigger if exists shows_bump_picker_epoch_bumped_at on dev.shows;
create trigger shows_bump_picker_epoch_bumped_at
  before update of picker_epoch on dev.shows
  for each row
  execute function public.bump_picker_epoch_bumped_at();

-- PostgREST lockdown: post-pivot writes to shows flow through service-role
-- helpers or locked SECURITY DEFINER RPCs, not direct anon/authenticated DML.
revoke insert, update, delete on table public.shows from anon, authenticated;

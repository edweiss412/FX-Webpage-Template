-- Spec docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md section 4.11.
-- Nullable, no default, no backfill: null means never unpublished since this shipped.
alter table public.shows
  add column if not exists unpublished_at timestamptz;

comment on column public.shows.unpublished_at is
  'Last unpublish without archive (published true to false, archived false). Stamped by trigger shows_stamp_unpublished_at. Read by GET /api/saved-copy/status.';

-- Touches only NEW, so it needs no elevated rights (security invoker, unlike
-- bump_picker_epoch_bumped_at, which predates this convention).
create or replace function public.stamp_shows_unpublished_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.published is true and new.published is false and new.archived is false then
    new.unpublished_at := clock_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_shows_unpublished_at() from public;

drop trigger if exists shows_stamp_unpublished_at on public.shows;
create trigger shows_stamp_unpublished_at
  before update on public.shows
  for each row
  execute function public.stamp_shows_unpublished_at();

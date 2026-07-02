create table public.ignored_warnings (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  fingerprint text not null,
  code text not null,
  ignored_by text not null,
  ignored_at timestamptz not null default now(),
  constraint ignored_warnings_ignored_by_canonical
    check (ignored_by = lower(trim(ignored_by)) and ignored_by <> ''),
  constraint ignored_warnings_unique unique (show_id, fingerprint)
);
create index ignored_warnings_show_idx on public.ignored_warnings (show_id);

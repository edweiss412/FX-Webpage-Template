-- M11.5 A2: one private bearer token per show URL.
-- The token is intentionally not stored on public.shows because shows remains
-- crew-readable. Access is through later SECURITY DEFINER RPCs only.

create table if not exists public.show_share_tokens (
  show_id uuid not null,
  share_token text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.show_share_tokens
  add column if not exists show_id uuid,
  add column if not exists share_token text,
  add column if not exists created_at timestamptz,
  add column if not exists rotated_at timestamptz;

alter table public.show_share_tokens
  alter column show_id set not null,
  alter column share_token set not null,
  alter column share_token set default encode(gen_random_bytes(32), 'hex'),
  alter column created_at set not null,
  alter column created_at set default now();

alter table public.show_share_tokens
  drop constraint if exists show_share_tokens_pkey,
  add constraint show_share_tokens_pkey primary key (show_id);

alter table public.show_share_tokens
  drop constraint if exists show_share_tokens_show_id_fkey,
  add constraint show_share_tokens_show_id_fkey
    foreign key (show_id) references public.shows(id) on delete cascade;

alter table public.show_share_tokens
  drop constraint if exists show_share_tokens_share_token_key,
  add constraint show_share_tokens_share_token_key unique (share_token);

alter table public.show_share_tokens
  drop constraint if exists show_share_tokens_share_token_check,
  add constraint show_share_tokens_share_token_check
    check (share_token ~ '^[0-9a-f]{64}$');

revoke all on table public.show_share_tokens from public, anon, authenticated;
grant all privileges on table public.show_share_tokens to service_role;
alter table public.show_share_tokens enable row level security;

insert into public.show_share_tokens (show_id)
  select id from public.shows
  on conflict (show_id) do nothing;

create or replace function public.create_share_token_for_show()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.show_share_tokens (show_id)
  values (new.id)
  on conflict (show_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_share_token_for_show() from public;

drop trigger if exists shows_create_share_token_after_insert on public.shows;
create trigger shows_create_share_token_after_insert
  after insert on public.shows
  for each row
  execute function public.create_share_token_for_show();

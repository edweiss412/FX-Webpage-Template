alter table dev.shows
  add column if not exists unpublish_token uuid,
  add column if not exists unpublish_token_expires_at timestamptz;

drop index if exists dev.shows_unpublish_token_key;
create unique index if not exists shows_unpublish_token_key
  on dev.shows (unpublish_token)
  where unpublish_token is not null;

alter table dev.shows
  drop constraint if exists shows_unpublish_token_pair_check;

alter table dev.shows
  add constraint shows_unpublish_token_pair_check check (
    (
      unpublish_token is null
      and unpublish_token_expires_at is null
    )
    or
    (
      unpublish_token is not null
      and unpublish_token_expires_at is not null
    )
  );

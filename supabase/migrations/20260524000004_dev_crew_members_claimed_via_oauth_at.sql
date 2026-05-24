alter table if exists dev.crew_members
  add column if not exists claimed_via_oauth_at timestamptz;

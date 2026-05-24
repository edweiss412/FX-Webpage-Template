alter table public.crew_members
  add column if not exists claimed_via_oauth_at timestamptz null;

comment on column public.crew_members.claimed_via_oauth_at is
  'R41: stamped by claim_oauth_identity SECURITY DEFINER RPC on successful OAuth callback whose auth.users.email matches this row. Non-null = identity claimed; picker renders row as deactivated (§7.2). Permanent claim per Decision 15.';

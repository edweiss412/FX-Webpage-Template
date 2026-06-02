create table if not exists public.email_deliveries (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('realtime_problem','digest')),
  channel         text not null default 'email' check (channel in ('email','sms','webhook')),
  dedup_key       text not null,
  show_id         uuid references public.shows(id) on delete set null,
  recipient       text not null,
  triggered_codes text[] not null default '{}',
  context         jsonb not null default '{}',
  status          text not null check (status in ('sent','failed')),
  provider_message_id text,
  error           text,
  attempt_count   int  not null default 1,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  constraint email_deliveries_recipient_email_canonical
    check (recipient = lower(trim(recipient)) and recipient <> '')
);
create unique index if not exists email_deliveries_dedup on public.email_deliveries (kind, dedup_key, recipient);
alter table public.email_deliveries enable row level security;
revoke all on table public.email_deliveries from anon, authenticated;
grant all on table public.email_deliveries to service_role;
-- deny-by-default: NO anon/authenticated RLS policy is created (service-role bypasses RLS).

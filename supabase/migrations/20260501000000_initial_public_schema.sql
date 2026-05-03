create extension if not exists pgcrypto;

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  slug text not null unique,
  title text not null,
  client_label text not null,
  client_contact jsonb,
  template_version text not null,
  venue jsonb,
  dates jsonb,
  event_details jsonb,
  agenda_links jsonb,
  diagrams jsonb,
  opening_reel_drive_file_id text,
  opening_reel_drive_modified_time timestamptz,
  opening_reel_head_revision_id text,
  opening_reel_mime_type text,
  coi_status text,
  pull_sheet jsonb,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  archived boolean not null default false,
  published boolean not null default true,
  last_seen_modified_time timestamptz,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null,
  role_flags text[] not null default '{}',
  date_restriction jsonb,
  stage_restriction jsonb,
  flight_info text,
  last_changed_at timestamptz not null default now(),
  unique (show_id, name),
  constraint crew_members_email_canonical check (
    email is null or email = lower(trim(email))
  )
);

create unique index crew_members_show_email_unique
  on public.crew_members (show_id, email)
  where email is not null;

create table public.hotel_reservations (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  ordinal int not null,
  hotel_name text,
  hotel_address text,
  names text[] not null default '{}',
  confirmation_no text,
  check_in date,
  check_out date,
  notes text
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  kind text not null,
  name text not null,
  dimensions text,
  floor text,
  setup text,
  set_time text,
  show_time text,
  strike_time text,
  audio text,
  video text,
  lighting text,
  scenic text,
  power text,
  digital_signage text,
  other text,
  notes text
);

create table public.transportation (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references public.shows(id) on delete cascade,
  driver_name text,
  driver_phone text,
  driver_email text,
  vehicle text,
  license_plate text,
  color text,
  parking text,
  schedule jsonb not null default '[]'::jsonb,
  notes text,
  constraint transportation_driver_email_canonical check (
    driver_email is null or driver_email = lower(trim(driver_email))
  )
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  kind text not null,
  name text,
  email text,
  phone text,
  notes text,
  constraint contacts_email_canonical check (
    email is null or email = lower(trim(email))
  )
);

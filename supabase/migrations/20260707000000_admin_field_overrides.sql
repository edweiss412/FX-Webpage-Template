create table if not exists public.admin_overrides (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.shows(id) on delete cascade,
  domain         text not null,
  field          text not null,
  match_key      text not null,          -- '' for show singleton; parsed crew name; parsed hotel name (+ content disambiguator for same-name dups, §5.3)
  override_value jsonb not null,         -- structured (dates/venue) or json string (name/role/hotel_*)
  sheet_value    jsonb,                  -- last parsed value; refreshed each sync; null = never matched / parsed null
  active         boolean not null default true,   -- false = deactivated, row retained until repoint/discard
  deactivation_code text,                 -- R12: DURABLE pause reason. NULL when active; 'target_missing'|'name_conflict' when active=false. Set in-tx (not dependent on the best-effort alert). needs-attention renders copy from THIS.
  version        integer not null default 1,       -- R15/R30: optimistic-concurrency token guarding OVERRIDE STATE. Bumped +1 on every RPC override mutation (upsert-create/edit, revert, repoint, discard) AND on a sync-side DEACTIVATION (active=false) or reactivation. NOT bumped on a benign sync-side sheet_value refresh of a still-active override (R30) — sheet_value is a display-only column independent of override_value; bumping it would false-409 an admin's open edit on every routine cron sync (spuriously unusable). The RPC CAS detects concurrent override mutations + stale-deactivation, not benign chip refreshes.
  created_by     text not null,          -- canonicalized admin email (canonicalized at the RPC boundary; CHECK is the invariant-3 safety net)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- R12: the pause reason is durable, so needs-attention shows the right copy even if the
  -- best-effort admin_alert emit fails. Bound to `active`: present iff paused.
  constraint admin_overrides_deactivation_code_chk check (
    (active and deactivation_code is null)
    or (not active and deactivation_code in ('target_missing','name_conflict'))
  ),
  -- Invariant 3: schema-level CHECK is the email safety net (mirrors crew_members_email_canonical,
  -- 20260501000000_initial_public_schema.sql:44-46). created_by is always an admin email here
  -- (overrides have no 'system' path), so it must be lower/trim-canonical and non-empty.
  constraint admin_overrides_created_by_canonical check (
    created_by = lower(trim(created_by)) and created_by <> ''
  ),
  constraint admin_overrides_domain_field_chk check (
       (domain = 'show'  and field in ('dates','venue')          and match_key = '')
    or (domain = 'crew'  and field in ('name','role'))
    or (domain = 'hotel' and field in ('hotel_name','hotel_address'))
  ),
  constraint admin_overrides_uniq unique (show_id, domain, field, match_key)
);
create index if not exists admin_overrides_show_active_idx
  on public.admin_overrides (show_id) where active;

-- PostgREST DML lockdown (RPC-gated table discipline; invariant + BL-ADMIN-POSTGREST-DML-LOCKDOWN).
-- created_by holds an admin email (PII) → NO select for anon/authenticated either. Crew page never
-- reads this table (it reads the already-overridden live rows). All admin reads go via service-role
-- or the admin-only RLS policy below.
-- WRITES are RPC-only (INSERT/UPDATE/DELETE revoked from anon+authenticated → only the
-- service_role SECURITY DEFINER RPC mutates). READS are admin-only via RLS: SELECT is granted to
-- authenticated but an admin_only policy (public.is_admin()) confines rows to admins, so the
-- existing cookie-bound admin loaders (loadNeedsAttention, needsAttentionCount) can read the
-- inactive-override needs-attention stream WITHOUT new service-role plumbing. anon gets nothing.
-- created_by holds an admin email — visible ONLY to admins under the policy (accepted: admin emails
-- already surface across the admin UI). The crew page never reads this table.
revoke insert, update, delete on table public.admin_overrides from anon, authenticated;
revoke select                 on table public.admin_overrides from anon;
grant  select                 on table public.admin_overrides to authenticated;   -- gated by admin_only RLS below
grant  all privileges         on table public.admin_overrides to service_role;    -- service_role retains ALL (reads + RPC writes); required by postgrest-dml-lockdown registry
alter table public.admin_overrides enable row level security;
drop policy if exists admin_only on public.admin_overrides;   -- idempotency: CREATE POLICY has no IF NOT EXISTS; drop-first makes apply-twice safe
create policy admin_only on public.admin_overrides
  for select to authenticated
  using ( public.is_admin() );   -- canonical predicate (rls_policies.sql:23, ignored_warnings_rls.sql); service_role bypasses RLS

-- same migration file as admin_overrides (20260707000000_admin_field_overrides.sql)
alter table public.crew_members
  add column if not exists sheet_name text;   -- original parsed name when a name override is active; NULL otherwise
comment on column public.crew_members.sheet_name is
  'Set to the pre-override parsed name when an admin name override is active on this row (visibility alias, spec 2026-07-07 §3.5); NULL when name is un-overridden. Written only by the crew override write-transform.';

-- ============================================================================
-- Task 3 (spec 2026-07-07 §7.1-§7.6): set_field_override SECURITY DEFINER RPC.
-- Four private helpers FIRST (so the RPC can call them), then the RPC. Same
-- migration file; create-or-replace keeps apply-twice idempotency.
-- ============================================================================
-- (H1) Resolve the live row id for a (domain, match_key) under the caller's lock.
-- crew: currentLiveName (§7.6) = active name override output else match_key; unique per show.
-- hotel: R20 UNCONDITIONAL exactly-one-live-match on p_expected_live_hotel_name [+ §5.3 disambiguator
--        recomputed from NON-OVERRIDABLE booking cols check_in[+confirmation_no], NEVER names[] (R30)];
--        zero-or-many => 40001 (route maps to 409 stale_review), never a guessed row.
-- show: the singleton shows.id.
create or replace function public._resolve_live_id(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_expected_live_hotel_name text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_live_name text;
  v_disamb text;
  v_count int;
  v_id uuid;
begin
  if p_domain = 'show' then
    return p_show_id;
  elsif p_domain = 'crew' then
    select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
        where o.show_id=p_show_id and o.domain='crew' and o.field='name'
          and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
    select id into v_id from public.crew_members where show_id=p_show_id and name=v_live_name;
    if v_id is null then
      raise exception 'crew live row not found for %', v_live_name using errcode='40001'; end if;
    return v_id;
  else -- hotel
    v_disamb := case when position(chr(31) in p_match_key) > 0
                     then substr(p_match_key, position(chr(31) in p_match_key)+1) else null end;
    select count(*), (array_agg(id))[1] into v_count, v_id from public.hotel_reservations hr -- RPC2-1: min(uuid) not in PG
      where hr.show_id=p_show_id and hr.hotel_name=p_expected_live_hotel_name
        and (v_disamb is null
             -- recompute disambiguator from booking columns only (R30): 'YYYY-MM-DD' [+ \x1f + confirmation_no]
             or (coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'')
                 || coalesce(chr(31)||hr.confirmation_no,'')) = v_disamb
             or coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'') = v_disamb);
    if v_count <> 1 then
      raise exception 'hotel live row not unique (count=%)', v_count using errcode='40001'; end if;
    return v_id;
  end if;
end $$;

-- (H2) Read the current live field value as jsonb — CAS-B source + create/repoint sheet_value capture.
-- Reads the exact row _resolve_live_id resolves; dates/venue are jsonb columns, the four text fields
-- are wrapped with to_jsonb so the RPC's `is distinct from p_expected_current_value` compares like-for-like.
create or replace function public._current_field_value(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_expected_live_hotel_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_val jsonb;
begin
  if p_domain='show' then
    if p_field='dates' then select dates into v_val from public.shows where id=p_show_id;
    else                    select venue into v_val from public.shows where id=p_show_id; end if;
    return v_val;
  end if;
  v_id := public._resolve_live_id(p_show_id, p_domain, p_field, p_match_key, p_expected_live_hotel_name);
  if p_domain='crew' then
    if p_field='name' then select to_jsonb(name) into v_val from public.crew_members where id=v_id;
    else                    select to_jsonb(role) into v_val from public.crew_members where id=v_id; end if;
  else -- hotel
    if p_field='hotel_name' then select to_jsonb(hotel_name) into v_val from public.hotel_reservations where id=v_id;
    else                          select to_jsonb(hotel_address) into v_val from public.hotel_reservations where id=v_id; end if;
  end if;
  return v_val;
end $$;

-- (H3) Apply a value to ONE live row. shows: WHERE id=p_show_id (singleton); crew/hotel: WHERE id=p_target_id.
-- jsonb columns (dates/venue) take p_value directly; text columns extract the scalar with #>>'{}'.
-- (H3) p_sheet_name (R3b-3): the crew-name arm ALSO maintains crew_members.sheet_name so the §3.5/§4.4
-- visibility-alias invariant ("sheet_name = match_key iff an active name override") holds CONTINUOUSLY —
-- immediately after the RPC apply, not only after the next sync. Callers pass match_key on apply/edit/
-- (inactive) repoint and NULL on revert. Ignored by every non-(crew,name) arm.
create or replace function public._apply_override_live(
  p_show_id uuid, p_domain text, p_field text, p_target_id uuid, p_value jsonb, p_sheet_name text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_domain='show' and p_field='dates' then
    update public.shows set dates=p_value where id=p_show_id;
  elsif p_domain='show' and p_field='venue' then
    update public.shows set venue=p_value where id=p_show_id;
  elsif p_domain='crew' and p_field='name' then
    update public.crew_members set name=(p_value #>> '{}'), sheet_name=p_sheet_name where id=p_target_id;
  elsif p_domain='crew' and p_field='role' then
    update public.crew_members set role=(p_value #>> '{}') where id=p_target_id;
  elsif p_domain='hotel' and p_field='hotel_name' then
    update public.hotel_reservations set hotel_name=(p_value #>> '{}') where id=p_target_id;
  elsif p_domain='hotel' and p_field='hotel_address' then
    update public.hotel_reservations set hotel_address=(p_value #>> '{}') where id=p_target_id;
  else
    raise exception 'unknown (domain,field) (%,%)', p_domain, p_field using errcode='22023';
  end if;
  -- RPC-7 (STRUCTURAL class-defense): a targeted apply matching ZERO live rows means the resolved id was
  -- NULL/stale — RAISE rather than let the override row mutate while the live row silently no-ops. Escapes
  -- as SQLSTATE 40001 → the JS helper maps it to OVERRIDE_STALE_REVIEW (R3b-6). This closes the entire
  -- "override metadata written but live row not touched" bug class at the single write chokepoint, so a
  -- resolver regression anywhere upstream fails LOUD (409) instead of silently, rather than needing a
  -- per-op guard. (Every apply above touches exactly one row: show singleton PK, crew/hotel by id.)
  if not found then
    raise exception 'override apply matched no live row (domain=%, field=%)', p_domain, p_field using errcode='40001'; end if;
end $$;

-- (H4, F3) §7.4 value guards — enforced RPC-side under the lock (race-safe backstop; the TS
-- validateOverrideValue gives the precise pre-RPC UI message). Returns NULL = ok, else a reason token.
-- Overrides are write-time applied, so every live crew_members.name / hotel_reservations.hotel_name
-- ALREADY equals its FINAL name (R27) — a collision is equality against ANOTHER live row's current value.
-- p_exclude_id_2 (RPC2-2): a SECOND live id to exclude from the collision check — the OLD target A of an
-- active repoint, which still holds the override value at validation time but is about to be released.
-- NULL for every non-repoint call (`id is distinct from NULL` never filters).
create or replace function public._validate_override_value(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_target_id uuid, p_value jsonb,
  p_exclude_id_2 uuid default null
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_text text;
begin
  if p_domain='show' then                    -- dates/venue: a NON-EMPTY jsonb object (deep dates/venue shape
    -- is validated authoritatively TS-side in validateOverrideValue, Task 5 — non-race, knows the shape).
    if p_value is null or jsonb_typeof(p_value) <> 'object' or p_value = '{}'::jsonb then return 'invalid_shape'; end if;
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then return 'invalid_shape'; end if; -- the four text fields MUST be JSON strings (reject number/object/bool).
  v_text := p_value #>> '{}';                 -- extract the scalar.
  if v_text is null or btrim(v_text) = '' then return 'empty'; end if;
  if p_field='name'          and v_text = p_match_key then return 'noop'; end if;
  if p_field='hotel_name'    and v_text = split_part(p_match_key, chr(31), 1) then return 'noop'; end if; -- name part before the §5.3 disambiguator
  if p_field='name'          and length(v_text) > 200 then return 'too_long'; end if;
  if p_field='role'          and length(v_text) > 120 then return 'too_long'; end if;
  if p_field='hotel_name'    and length(v_text) > 200 then return 'too_long'; end if;
  if p_field='hotel_address' and length(v_text) > 300 then return 'too_long'; end if;
  if p_field='name' then
    -- collide vs any OTHER member's FINAL live name OR its PARSED identity (§7.4: a future revert that
    -- de-overrides that member would otherwise collapse two (show_id,name) rows). Parsed identity =
    -- the member's active name-override match_key if it has one, else its live name.
    if exists(
      select 1 from public.crew_members cm
       where cm.show_id=p_show_id and cm.id is distinct from p_target_id and cm.id is distinct from p_exclude_id_2
         and (cm.name = v_text
              or coalesce(
                   (select o.match_key from public.admin_overrides o
                      where o.show_id=p_show_id and o.domain='crew' and o.field='name' and o.active
                        and (o.override_value #>> '{}') = cm.name),
                   cm.name) = v_text))
    then return 'name_conflict'; end if;
  elsif p_field='hotel_name' then             -- collide vs any OTHER reservation's live (= FINAL) hotel_name (R27: FINAL only, never parsed).
    if exists(select 1 from public.hotel_reservations hr
                where hr.show_id=p_show_id and hr.id is distinct from p_target_id
                  and hr.id is distinct from p_exclude_id_2 and hr.hotel_name=v_text)
    then return 'name_conflict'; end if;
  end if;
  return null;
end $$;

-- Ownership note (RPC4-1): all FIVE functions (set_field_override + these 4 helpers) are created in THIS
-- one migration file, applied by a single role — so they share an owner. A SECURITY DEFINER function runs
-- as its owner, and an owner ALWAYS retains EXECUTE on its own functions regardless of REVOKE; these REVOKEs
-- only strip public/anon/authenticated. So the outer RPC can always call the helpers. (No cross-owner grant
-- is needed; do NOT grant helper EXECUTE to service_role — that would re-expose them via PostgREST.)
revoke execute on function public._resolve_live_id(uuid,text,text,text,text)   from public, anon, authenticated;
revoke execute on function public._current_field_value(uuid,text,text,text,text) from public, anon, authenticated;
revoke execute on function public._apply_override_live(uuid,text,text,uuid,jsonb,text) from public, anon, authenticated;
revoke execute on function public._validate_override_value(uuid,text,text,text,uuid,jsonb,uuid) from public, anon, authenticated;

create or replace function public.set_field_override(
  p_drive_file_id text, p_op text, p_domain text, p_field text, p_match_key text,
  p_new_match_key text, p_override_value jsonb, p_actor text,
  p_expected_version int, p_expected_current_value jsonb,
  p_current_ordinal int,  -- RPC-8: ADVISORY only (observed ordinal), NOT a locator — hotels resolve by the
                          -- unconditional exactly-one match on hotel_name[+disambiguator] (spec §7.2:369, R20).
                          -- Kept in the signature per spec §7.1; intentionally unused in the body.
  p_expected_live_hotel_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_show_id uuid;
  v_row public.admin_overrides%rowtype;
  v_found boolean;          -- F1: PIN the override-row lookup's FOUND; every later SELECT resets `found`.
  v_disamb text;            -- §5.3 content disambiguator carried in p_match_key (after \x1f), or null
  v_target_id uuid;         -- resolved live-row id (crew/hotel)
  v_release_id uuid;        -- F2: OLD target A id for a repoint release (resolved from A's own identity)
  v_live_name text;         -- currentLiveName (crew) / currentLiveHotelName (hotel)
  v_match_count int;
  v_captured jsonb;
  v_bval jsonb;             -- F2: CAS-B value of the NEW target B on repoint
  v_reason text;            -- F3: _validate_override_value result (NULL = ok, else a reason token)
begin
  -- (1) single-holder advisory lock in-RPC; resolve show inside the lock.
  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));
  select id into v_show_id from public.shows where drive_file_id = p_drive_file_id;
  if v_show_id is null then return jsonb_build_object('ok', false, 'code', 'SHOW_NOT_FOUND'); end if;

  -- validate op discriminator (domain/field value guards are enforced by _validate_override_value, F3).
  -- RPC3-1: NULL-safe — a NULL boolean in an IF is NOT true, so a NULL p_op would otherwise skip every
  -- op branch and fall through to the (unguarded) upsert block.
  if p_op is null or p_op not in ('upsert','revert','repoint','discard') then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- RPC-5 + RPC3-1: reject NULL or unknown (domain,field) up front, so no later CASE/else silently
  -- mistreats it (e.g. an unknown show field falling through to the venue arm).
  if p_domain is null or p_field is null
     or not ((p_domain='show'  and p_field in ('dates','venue'))
          or (p_domain='crew'  and p_field in ('name','role'))
          or (p_domain='hotel' and p_field in ('hotel_name','hotel_address'))) then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- RPC5-1: show is a SINGLETON — force the canonical empty match_key so CAS-A, the unique key
  -- `(show_id,domain,field,match_key)`, and every lookup collapse to exactly ONE override row per
  -- (show,field). Without this, a caller passing a different p_match_key would bypass the active-create
  -- collision check and insert a SECOND active show override writing the same `shows` field.
  if p_domain='show' then p_match_key := ''; p_new_match_key := ''; end if;
  -- RPC5+ (class-close for NULL required inputs): the typed JS caller never sends these NULL, but the RPC
  -- is the security boundary — fail closed before touching state. (p_match_key '' is valid; p_override_value
  -- NULL is caught by §7.4 _validate_override_value; p_drive_file_id NULL already yields SHOW_NOT_FOUND.)
  if p_match_key is null or p_actor is null or (p_op='repoint' and p_new_match_key is null) then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;

  -- read the current override row for (target) under the lock.
  select * into v_row from public.admin_overrides
   where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_match_key;
  v_found := found;   -- F1: capture NOW; crew/hotel resolution + _current_field_value below RESET `found`.

  -- RPC2-3: revert/repoint/discard are EXISTING-row ops — they MUST carry the version CAS (never the
  -- NULL-expected create path), else an inactive row could be repointed/discarded without a version check
  -- (CAS-A's NULL branch only guards ACTIVE rows). Force them into the version-match else-branch below.
  if p_op in ('revert','repoint','discard') and p_expected_version is null then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;

  -- CAS-A (R15): version guards the override row. NULL expected => create (assert no ACTIVE row).
  if p_expected_version is null then
    if v_found and v_row.active then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- active create-collision
  else
    if not v_found or v_row.version <> p_expected_version then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- 409 (mismatch)
  end if;

  -- RPC-2/RPC-3: revert/repoint/discard operate on an EXISTING override row (never a create). Require it
  -- present regardless of the p_expected_version shape, so a NULL-version caller cannot reach a live-apply
  -- or delete no-op against a missing row (`v_row.id` NULL).
  if p_op in ('revert','repoint','discard') and not v_found then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
  if p_op = 'revert' and not v_row.active then     -- revert removes an ACTIVE override; an inactive row uses discard.
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if;

  -- ===== resolve the CURRENT/CREATE target row (per domain) =====
  -- F2 INVARIANT: `p_expected_live_hotel_name` ALWAYS describes the target being created / repointed-TO
  -- (B for repoint; the sole target for create/edit/revert). The OLD target A in a repoint is resolved
  -- from the override row's OWN stored identity (v_row.override_value for a hotel_name repoint / the
  -- active hotel_name override output for a hotel_address repoint; currentLiveName(p_match_key) for crew)
  -- inside the repoint branch — NOT from p_expected_live_hotel_name (which now = B).
  if p_domain = 'show' then
    v_target_id := v_show_id; -- singleton, PK anchor
  elsif p_domain = 'crew' then
    if p_op in ('upsert','revert') then
      -- currentLiveName = active name override output else match_key (§7.6). Resolves the CURRENT target A.
      select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
          where o.show_id=v_show_id and o.domain='crew' and o.field='name'
            and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
      select id into v_target_id from public.crew_members
        where show_id=v_show_id and name=v_live_name;
      if v_target_id is null then     -- §7.6:437 zero live match when the UI expected one => 409, never a silent no-op.
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
    -- (repoint resolves A [release] + B [apply] in its own branch; discard is inactive-only, no live row.)
  elsif p_domain = 'hotel' then
    v_disamb := case when position(chr(31) in p_match_key) > 0
                     then substr(p_match_key, position(chr(31) in p_match_key)+1) else null end;
    if p_op in ('upsert','revert') then
      -- unconditional exactly-one-live-match on p_expected_live_hotel_name [+ recomputed disambiguator] (R20).
      -- (repoint resolves A + B itself in its branch; discard is inactive-only and applies to no live row.)
      select count(*), (array_agg(id))[1] into v_match_count, v_target_id from public.hotel_reservations hr -- RPC2-1: min(uuid) not in PG
        where hr.show_id=v_show_id and hr.hotel_name=p_expected_live_hotel_name
          and (v_disamb is null
               or (coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'')
                   || coalesce(chr(31)||hr.confirmation_no,'')) = v_disamb
               or coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'') = v_disamb);
      if v_match_count <> 1 then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- 0 or >1 => 409
    end if;
  end if;

  -- CAS-B (R16) — CREATE-ONLY (F2). The live field of the create target must still equal
  -- p_expected_current_value; repoint's CAS-B is against NEW target B and runs in the repoint branch.
  -- (edit is guarded by CAS-A version; revert/discard need no value CAS.) R3b-4: NOT skipped when the
  -- expected value is SQL NULL — §7.2 requires CAS-B on every create; `is distinct from` handles NULL
  -- correctly (live NULL vs expected NULL passes; a sync that filled a null field 409s). The caller
  -- always passes the field's current value (SQL/JSON null when the field was empty at UI-load).
  -- RPC-6: normalize both sides to canonical jsonb 'null' so a SQL-NULL live value and a JSON-null expected
  -- (or vice-versa) compare equal — `x is distinct from y` treats SQL NULL and 'null'::jsonb as different.
  if p_op = 'upsert' and p_expected_version is null then
    if p_domain='show' and p_field='dates' and
       coalesce((select dates from public.shows where id=v_show_id),'null'::jsonb)
         is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    if p_domain='show' and p_field='venue' and
       coalesce((select venue from public.shows where id=v_show_id),'null'::jsonb)
         is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    if p_domain='crew' then
      if coalesce((select to_jsonb(case when p_field='name' then name else role end)
            from public.crew_members where id=v_target_id),'null'::jsonb)
            is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
    if p_domain='hotel' then
      if coalesce((select to_jsonb(case when p_field='hotel_name' then hotel_name else hotel_address end)
            from public.hotel_reservations where id=v_target_id),'null'::jsonb)
            is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
  end if;

  -- ===== op semantics =====
  if p_op = 'discard' then
    if v_row.active then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if; -- R14
    delete from public.admin_overrides where id=v_row.id;
    return jsonb_build_object('ok', true, 'value', 'discarded');
  end if;

  if p_op = 'revert' then
    -- restore sheet_value to the live row, then delete the override row. sheet_name→NULL on a crew-name revert (R3b-3).
    perform public._apply_override_live(v_show_id, p_domain, p_field, v_target_id, v_row.sheet_value, null);
    delete from public.admin_overrides where id=v_row.id;
    return jsonb_build_object('ok', true, 'value', v_row.sheet_value);
  end if;

  if p_op = 'repoint' then
    if p_domain='crew' and p_field='name' and v_row.active then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if; -- R25 active-name repoint
    -- Resolve OLD target A's release id UP FRONT (active repoint only), BEFORE the §7.4 collision check, so
    -- that check can exclude A (RPC2-2 — A still holds the override value now but is about to be released;
    -- without the exclusion, repointing a hotel_name override to B keeping the same value self-conflicts).
    -- Resolve A from its OWN identity (F2), NOT p_expected_live_hotel_name (which = B).
    if v_row.active then
      if p_domain='crew' then
        -- RPC-1: crew resolver above is gated to upsert/revert, so v_target_id is NULL on repoint — resolve A
        -- HERE via currentLiveName(p_match_key). (Active crew-NAME repoint rejected above ⇒ only crew-ROLE here.)
        select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
            where o.show_id=v_show_id and o.domain='crew' and o.field='name'
              and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
        select id into v_release_id from public.crew_members where show_id=v_show_id and name=v_live_name;
      else -- hotel: A's current live hotel_name = active hotel_name override output else the parsed name in p_match_key
        select coalesce(
          (select o.override_value #>> '{}' from public.admin_overrides o
             where o.show_id=v_show_id and o.domain='hotel' and o.field='hotel_name'
               and o.match_key=p_match_key and o.active),
          split_part(p_match_key, chr(31), 1)) into v_live_name;
        v_release_id := public._resolve_live_id(v_show_id, 'hotel', p_field, p_match_key, v_live_name);
      end if;
    end if;
    -- CAS-B against the NEW target B (F2), required on every repoint-to-new (R3b-4 — NOT skipped on
    -- NULL expected; `is distinct from` handles NULL). p_expected_live_hotel_name describes B (F2 INVARIANT).
    v_bval := public._current_field_value(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name);
    if coalesce(v_bval,'null'::jsonb) is distinct from coalesce(p_expected_current_value,'null'::jsonb) then -- RPC-6 normalize
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    -- §7.4 value guard on the (possibly new) override value, targeting B, EXCLUDING the releasing A (RPC2-2).
    v_reason := public._validate_override_value(v_show_id, p_domain, p_field, p_new_match_key,
                  public._resolve_live_id(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name),
                  coalesce(p_override_value, v_row.override_value), v_release_id);
    if v_reason is not null then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    -- target-key collision at the new key (R29): active => 409; inactive => supersede (delete) in-tx.
    perform 1 from public.admin_overrides
      where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_new_match_key and id<>v_row.id and active;
    if found then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if;
    delete from public.admin_overrides
      where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_new_match_key and id<>v_row.id and not active;
    if v_row.active then
      -- release OLD target A to its stored sheet_value (role/hotel only — active name repoint rejected above).
      perform public._apply_override_live(v_show_id, p_domain, p_field, v_release_id, v_row.sheet_value, null);
    end if;
    -- RPC-10 (crew-name inactive-repoint fix): resolve B's live id NOW — BEFORE the activating UPDATE.
    -- While the override still sits at its OLD (inactive) match_key, _resolve_live_id(crew) reads B's
    -- PARSED name at p_new_match_key and finds B's real row. Re-resolving AFTER the UPDATE (as the prior
    -- code did) would derive B's expected name from the JUST-activated override output — a name no crew
    -- member has yet (the apply is what renames B) — and false-RAISE 40001 (the RPC-7 apply-no-live-row
    -- circularity), which broke the §7.2/§7.6 "inactive-repoint is the PRIMARY stale-recovery path"
    -- contract for the crew-NAME field. hotel/crew-role resolve identically pre/post-UPDATE (they key on
    -- p_expected_live_hotel_name / B's own separate name override, both unaffected by this UPDATE), so
    -- pre-resolving yields the same id there — this fix is crew-name-correct and domain-neutral.
    v_target_id := public._resolve_live_id(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name);
    -- capture B's parsed value (un-overridden => live == sheet). sheet_name→p_new_match_key on a
    -- crew-name (inactive) repoint (R3b-3); ignored by role/hotel arms.
    v_captured := public._current_field_value(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name);
    update public.admin_overrides set match_key=p_new_match_key, active=true, deactivation_code=null,
      sheet_value=v_captured, override_value=coalesce(p_override_value, override_value),
      version=version+1, updated_at=now() where id=v_row.id returning * into v_row;
    -- apply to B using the id resolved BEFORE activation (see RPC-10 above — never the post-activation re-resolve).
    perform public._apply_override_live(v_show_id, p_domain, p_field, v_target_id,
      v_row.override_value, p_new_match_key);
    return jsonb_build_object('ok', true, 'value', v_row.override_value);
  end if;

  -- p_op = 'upsert' (create or edit). RPC3-1: explicitly gate — reaching here with any non-upsert op would
  -- be a logic error (all others returned above); fail closed rather than run create/edit for it.
  if p_op <> 'upsert' then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- §7.4 value guard on the create/edit target (F3); target self excluded from collision via v_target_id.
  -- RPC-9: a value-guard failure collapses to OVERRIDE_STALE_REVIEW deliberately (spec §10:574 "reuse an
  -- existing code; do not invent one") — the TS validateOverrideValue (Task 5) gives the precise pre-RPC UI
  -- message, so a §7.4 failure reaching the RPC means the client's view is stale/inconsistent (reload).
  v_reason := public._validate_override_value(v_show_id, p_domain, p_field, p_match_key, v_target_id, p_override_value);
  if v_reason is not null then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
  if not v_found or not v_row.active then
    -- CREATE (or reactivate a retained inactive row — R28). capture the CURRENT live value as sheet_value.
    v_captured := public._current_field_value(v_show_id, p_domain, p_field, p_match_key, p_expected_live_hotel_name);
    insert into public.admin_overrides(show_id,domain,field,match_key,override_value,sheet_value,active,deactivation_code,created_by,version)
      values (v_show_id,p_domain,p_field,p_match_key,p_override_value,v_captured,true,null,lower(trim(p_actor)),1)
      on conflict (show_id,domain,field,match_key) do update
        set override_value=excluded.override_value, active=true, deactivation_code=null,
            sheet_value=excluded.sheet_value, version=public.admin_overrides.version+1, updated_at=now();
  else
    -- EDIT (active): update override_value only; PRESERVE sheet_value (R7); bump version.
    update public.admin_overrides set override_value=p_override_value, version=version+1, updated_at=now()
      where id=v_row.id;
  end if;
  -- sheet_name→match_key on crew-name create/edit (R3b-3); ignored by role/hotel/show arms.
  perform public._apply_override_live(v_show_id, p_domain, p_field, v_target_id, p_override_value, p_match_key);
  return jsonb_build_object('ok', true, 'value', p_override_value);
end $$;

revoke execute on function public.set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text)
  from public, anon, authenticated;
grant execute on function public.set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text) to service_role;

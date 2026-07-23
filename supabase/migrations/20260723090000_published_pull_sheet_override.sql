-- Published-show archived-tab override writer (spec 2026-07-23 §3.2). Sole writer of
-- public.shows.pull_sheet_override outside the cron auto-clear. In-RPC advisory lock is the
-- single holder for hashkey show:<drive_file_id>; the JS route never locks. CAS is STRUCTURAL
-- (single-arrow jsonb, IS DISTINCT FROM) so malformed stored values never text-canonicalize.
-- Idempotent: create or replace + explicit revoke/grant.
create or replace function public.set_published_pull_sheet_override(
  p_drive_file_id text,
  p_tab_name text,
  p_fingerprint text,
  p_accepted_by text,
  p_expected_override_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_published boolean;
  v_archived boolean;
  v_current jsonb;
  v_malformed boolean;
  v_current_snapshot jsonb;
  v_override jsonb;
begin
  if coalesce(p_drive_file_id, '') = '' then
    raise exception 'drive_file_id required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));

  select published, archived, pull_sheet_override
    into v_published, v_archived, v_current
    from public.shows where drive_file_id = p_drive_file_id;
  if not found then
    raise exception 'no shows row for drive_file_id' using errcode = 'P0002';
  end if;
  if v_published is distinct from true or v_archived is distinct from false then
    raise exception 'show is not published-active (lifecycle guard)' using errcode = '55000';
  end if;

  -- Accept-path arg guard (belt-and-suspenders; the route always supplies these on accept).
  if p_tab_name is not null
     and (coalesce(p_fingerprint, '') = '' or coalesce(p_accepted_by, '') = '') then
    raise exception 'accept requires fingerprint and actor' using errcode = '22023';
  end if;

  -- Structural CAS. Single-arrow keeps jsonb values as jsonb (no ->> text projection).
  v_current_snapshot := case when v_current is null then null
    else jsonb_build_object('tabName', v_current->'tabName', 'fingerprint', v_current->'fingerprint') end;

  -- Well-formed = each field absent, JSON null, or JSON string.
  v_malformed := v_current is not null and (
       (v_current ? 'tabName' and jsonb_typeof(v_current->'tabName') not in ('null', 'string'))
    or (v_current ? 'fingerprint' and jsonb_typeof(v_current->'fingerprint') not in ('null', 'string'))
  );

  if v_malformed then
    -- The client cannot faithfully represent a malformed row. Only legal transition is REVOKE
    -- (to null); the advisory lock serializes writers and a double-revoke is idempotent. An
    -- ACCEPT over a malformed row is impossible from the UI (P2 requires override null), so
    -- reject it as belt-and-suspenders.
    if p_tab_name is not null then
      raise exception 'stale override snapshot (malformed row accepts nothing)' using errcode = '40001';
    end if;
  elsif v_current_snapshot is distinct from p_expected_override_snapshot then
    raise exception 'stale override snapshot (row changed since review)' using errcode = '40001';
  end if;

  if p_tab_name is null then
    v_override := null; -- revoke
  else
    v_override := jsonb_build_object(
      'tabName', p_tab_name,
      'fingerprint', p_fingerprint,
      'acceptedBy', p_accepted_by,
      'acceptedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  update public.shows set pull_sheet_override = v_override
   where drive_file_id = p_drive_file_id;

  return jsonb_build_object('override', v_override);
end;
$$;

revoke all on function public.set_published_pull_sheet_override(text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_published_pull_sheet_override(text, text, text, text, jsonb)
  to service_role;

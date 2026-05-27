-- supabase/migrations/20260527210000_mint_validation_fixture_atomic.sql
--
-- M12 Phase 0.C Task 0.C.4 — SECURITY DEFINER RPC that mints one
-- validation fixture (shows + crew_members + validation_state.alias_map
-- slice) atomically under a per-show advisory lock per AGENTS.md
-- invariant 2.
--
-- Contract per master spec §3.3 + plan 03 Task 0.C.4:
--   * (1) Validate p_fixture_payload->>'validationTodayIso' shape + within
--         ±1 day of server current_date (R11 F9 — integer day comparison;
--         `date - date` returns INTEGER not interval).
--   * (2) Acquire pg_advisory_xact_lock(hashtext('show:' || drive_file_id))
--         BEFORE any mutation.
--   * (2.6) Self-heal show_share_tokens via INSERT ... ON CONFLICT (show_id)
--         DO NOTHING — R19 commit 43 F19 dual-source sentinel. The
--         shows_create_share_token_after_insert trigger handles the initial
--         INSERT path; this self-heal block closes the UPSERT update-path
--         gap where the trigger doesn't re-fire if the row was removed.
--   * (2.5) Full-replace crew_members per R17 commit 39 F16 — DELETE rows
--         for this show whose name is NOT in the incoming payload's
--         keep-list before UPSERTing.
--   * (3) Per-crew UPSERT with claimed_via_oauth_at = NULL on EVERY reseed
--         (R13 commit 31 F11 — restore bypass-pickable baseline).
--   * (4) Merge alias_map[combo] slice into validation_state. Stamp
--         combos_seeded_dates[combo] = $validationTodayIso. Per R57 commit
--         95 F49 amendment, DO NOT touch last_seed_date — only
--         validation_finalize_all_atomic writes that column.
--
-- Idempotent: every DML uses ON CONFLICT clauses; apply-twice safe via
-- CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.mint_validation_fixture_atomic(
  p_combo text,
  p_fixture_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drive_file_id text;
  v_slug text;
  v_show_id uuid;
  v_alias_map_slice jsonb := '{}'::jsonb;
  v_crew_member jsonb;
  v_crew_id uuid;
  v_crew_name text;
  v_crew_role_flags text[];
  v_validation_today_iso text;
BEGIN
  -- 0. Validate TZ-pinned today (rejects extreme clock skew).
  v_validation_today_iso := p_fixture_payload->>'validationTodayIso';
  IF v_validation_today_iso IS NULL OR v_validation_today_iso !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'mint_validation_fixture_atomic: validationTodayIso required (YYYY-MM-DD), got %', v_validation_today_iso;
  END IF;
  -- R11 F9 repair: `date - date` returns INTEGER (day count) in PostgreSQL,
  -- NOT interval. Use integer day comparison directly.
  IF abs(v_validation_today_iso::date - current_date) > 1 THEN
    -- not-validation-today-iso: current_date passed as error-message format arg, not a comparison
    RAISE EXCEPTION 'mint_validation_fixture_atomic: validationTodayIso % differs from server current_date % by >1 day (extreme clock skew)', v_validation_today_iso, current_date;
  END IF;

  -- 1. Resolve drive_file_id (stable per-combo synthetic ID) and acquire
  --    advisory lock. R19 commit 42 F18 — UPPERCASE combo enum verbatim;
  --    no lower() coercion (predicate (m) reads via the same formula).
  v_drive_file_id := 'validation_' || p_combo;
  v_slug := 'validation-' || lower(replace(p_combo, '_', '-'));
  PERFORM pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- 2. UPSERT show — R27 commit 57 F27 ADDED archived=false + published=true
  --    to SET clause so manually-archived/unpublished validation shows
  --    restore baseline eligibility on every reseed. The
  --    shows_create_share_token_after_insert trigger fires on initial
  --    INSERT only; section 2.6 below self-heals on UPSERT update-path.
  INSERT INTO public.shows (
    drive_file_id, slug, title, client_label, template_version,
    dates, archived, published, last_seen_modified_time
  )
  VALUES (
    v_drive_file_id,
    v_slug,
    p_fixture_payload->>'showName',
    'M12 Validation',                -- client_label NOT NULL
    'v4',                            -- template_version NOT NULL
    p_fixture_payload->'dates',
    false,
    true,
    now()
  )
  ON CONFLICT (drive_file_id) DO UPDATE SET
    title = EXCLUDED.title,
    slug = EXCLUDED.slug,            -- Codex Phase 0.C R6-F1 — repair slug drift
    dates = EXCLUDED.dates,
    archived = false,                -- R27 commit 57 F27 baseline restore
    published = true,                -- R27 commit 57 F27 baseline restore
    last_seen_modified_time = now()
  RETURNING id INTO v_show_id;

  -- 2.6. R19 commit 43 F19 — show_share_tokens self-heal (dual-source sentinel).
  --      ON CONFLICT DO NOTHING preserves the existing token in the happy path
  --      (dev's bookmarked URL stays valid); the column DEFAULT
  --      encode(gen_random_bytes(32), 'hex') mints a fresh 64-hex token if
  --      the row was removed out-of-band.
  INSERT INTO public.show_share_tokens (show_id)
  VALUES (v_show_id)
  ON CONFLICT (show_id) DO NOTHING;

  -- 2.5. R17 commit 39 F16 — FULL-REPLACE semantics for crew_members.
  --      DELETE rows for this show whose name is NOT in the incoming
  --      payload's keep-list, BEFORE the UPSERT loop. The
  --      DELETE-before-UPSERT ordering inside the per-show advisory-lock
  --      transaction ensures concurrent picker reads never observe a
  --      transient empty roster.
  WITH keep AS (
    SELECT jsonb_array_elements(p_fixture_payload->'crewMembers')->>'name' AS keep_name
  )
  DELETE FROM public.crew_members
   WHERE show_id = v_show_id
     AND name NOT IN (SELECT keep_name FROM keep);

  -- 3. Per crew_member: UPSERT crew_members, collect alias→id.
  --    Email is canonicalized in TS BEFORE landing in the payload (AGENTS.md
  --    invariant 3). The crew_members CHECK constraint
  --    crew_members_email_canonical acts as the safety-net per master spec.
  FOR v_crew_member IN SELECT * FROM jsonb_array_elements(p_fixture_payload->'crewMembers') LOOP
    v_crew_name := v_crew_member->>'name';
    v_crew_role_flags := ARRAY(SELECT jsonb_array_elements_text(v_crew_member->'roleFlags'));

    -- R15 commit 34 F14 defense-in-depth — for combo R1's alias_5a_lead
    -- specifically, reject any email whose domain matches the canonical
    -- placeholder/dev-only rejected set. The TS-side fixture-build guard
    -- (plan 03 Task 0.C.3) is the first gate; this is the latest possible
    -- moment to catch a bad config.
    IF p_combo = 'R1'
       AND v_crew_member->>'alias' = 'alias_5a_lead'
       AND v_crew_member->>'email' ~* '@(example\.com|example\.org|example\.net|[^@[:space:]]+\.test|[^@[:space:]]+\.invalid|localhost|[^@[:space:]]+\.localhost|[^@[:space:]]+\.local|dev\.local)$'
    THEN
      RAISE EXCEPTION 'mint_validation_fixture_atomic: R1.alias_5a_lead.email % matches a placeholder/dev-only reserved domain (RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-conventional) — set VALIDATION_J3_CLAIM_EMAIL to your real Google account email (see spec §3.3 step 5 R13-amendment paragraph + .env.local.example).', v_crew_member->>'email';
    END IF;

    INSERT INTO public.crew_members (
      show_id, name, email, role, role_flags, date_restriction, stage_restriction
    )
    VALUES (
      v_show_id,
      v_crew_name,
      v_crew_member->>'email',                       -- already canonicalized in TS
      -- Derive role (NOT NULL) from role_flags. Compound roles join with " / ".
      CASE
        WHEN array_length(v_crew_role_flags, 1) IS NULL THEN 'Validation Crew'
        ELSE array_to_string(v_crew_role_flags, ' / ')
      END,
      v_crew_role_flags,
      v_crew_member->'dateRestriction',
      v_crew_member->'stageRestriction'
    )
    ON CONFLICT (show_id, name) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      role_flags = EXCLUDED.role_flags,
      date_restriction = EXCLUDED.date_restriction,
      stage_restriction = EXCLUDED.stage_restriction,
      -- R13 commit 31 F11 — restore bypass-pickable baseline on every reseed.
      claimed_via_oauth_at = NULL
    RETURNING id INTO v_crew_id;

    v_alias_map_slice := v_alias_map_slice || jsonb_build_object(v_crew_member->>'alias', v_crew_id);
  END LOOP;

  -- 4. UPSERT validation_state singleton: merge alias_map[combo] = slice;
  --    stamp combos_seeded_dates[combo] = validationTodayIso. R57 commit 95
  --    F49 — mint RPC NEVER writes last_seed_date; only the finalizer does.
  --    Predicate (b) treats NULL as stale.
  INSERT INTO public.validation_state (
    key, combos_materialized, combos_seeded_dates, alias_map,
    seeded_by, seeded_supabase_project_ref
  )
  VALUES (
    'validation_seed',
    -- last_seed_date deliberately omitted — NULL on initial INSERT per R57 F49.
    ARRAY[p_combo],
    jsonb_build_object(p_combo, v_validation_today_iso),
    jsonb_build_object(p_combo, v_alias_map_slice),
    p_fixture_payload->>'seededBy',
    p_fixture_payload->>'seededProjectRef'
  )
  ON CONFLICT (key) DO UPDATE SET
    -- last_seed_date NOT updated here; validation_finalize_all_atomic owns it.
    combos_materialized = (SELECT array_agg(DISTINCT c) FROM unnest(public.validation_state.combos_materialized || ARRAY[p_combo]) c),
    combos_seeded_dates = public.validation_state.combos_seeded_dates || jsonb_build_object(p_combo, v_validation_today_iso),
    alias_map = public.validation_state.alias_map || jsonb_build_object(p_combo, v_alias_map_slice),
    seeded_supabase_project_ref = EXCLUDED.seeded_supabase_project_ref;

  RETURN jsonb_build_object('show_id', v_show_id, 'alias_map_slice', v_alias_map_slice);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_validation_fixture_atomic(text, jsonb) TO service_role;

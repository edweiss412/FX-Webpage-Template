-- supabase/migrations/20260527210001_validation_finalize_all_atomic.sql
--
-- M12 Phase 0.C Task 0.C.4 — SECURITY DEFINER RPC that promotes the
-- top-level `last_seed_date` ONLY after every requested combo's per-combo
-- seeded date matches today's pinned UTC date.
--
-- Contract per master spec §3.3.2 + plan 03 Task 0.C.4:
--   * Validates p_validation_today_iso shape + within ±1 day of server
--     current_date (R11 F9 — integer day comparison).
--   * R53 commit 93 F47 TOCTOU defense — compare-and-swap (CAS) on
--     combos_seeded_dates. The UPDATE WHERE clause requires the singleton's
--     current value to equal the snapshot we just validated against; a
--     0-row UPDATE → RAISE CONCURRENT_MODIFICATION_RACE. Sidesteps the
--     parallel-mint TOCTOU without adding a shared advisory-lock surface.
--   * Stamps last_seed_date = p_validation_today_iso ONLY on the
--     successful CAS path. Per R57 commit 95 F49 — this is the ONLY
--     surface that writes last_seed_date (mint RPC's initial INSERT
--     deliberately omits it).
--
-- Idempotent: identical sequential calls succeed (CAS only fires on TRUE
-- concurrent mutation, not on stable singleton state).

CREATE OR REPLACE FUNCTION public.validation_finalize_all_atomic(
  p_required_combos text[],
  p_validation_today_iso text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combo text;
  v_combo_date text;
  v_missing text[] := ARRAY[]::text[];
  v_stale text[]   := ARRAY[]::text[];
  v_combos_dates jsonb;
  v_rowcount integer;
BEGIN
  -- Validate p_validation_today_iso shape + within ±1 day of server current_date.
  IF p_validation_today_iso IS NULL OR p_validation_today_iso !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: p_validation_today_iso required (YYYY-MM-DD), got %', p_validation_today_iso;
  END IF;
  -- R11 F9 repair: integer day comparison (date - date returns INTEGER, not interval).
  IF abs(p_validation_today_iso::date - current_date) > 1 THEN
    -- not-validation-today-iso: current_date passed as error-message format arg, not a comparison
    RAISE EXCEPTION 'validation_finalize_all_atomic: p_validation_today_iso % differs from server current_date % by >1 day', p_validation_today_iso, current_date;
  END IF;

  -- R53 commit 93 F47 — read combos_seeded_dates ONCE into v_combos_dates,
  -- validate in PL/pgSQL, then UPDATE with WHERE clause requiring the
  -- snapshot still matches (compare-and-swap).
  SELECT combos_seeded_dates INTO v_combos_dates FROM public.validation_state WHERE key = 'validation_seed';
  IF v_combos_dates IS NULL THEN
    RAISE EXCEPTION 'validation_state.combos_seeded_dates not initialized — run mint_validation_fixture_atomic first';
  END IF;

  FOREACH v_combo IN ARRAY p_required_combos LOOP
    v_combo_date := v_combos_dates->>v_combo;
    IF v_combo_date IS NULL THEN
      v_missing := array_append(v_missing, v_combo);
    ELSIF v_combo_date <> p_validation_today_iso THEN
      v_stale := array_append(v_stale, v_combo || ':' || v_combo_date);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL OR array_length(v_stale, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: incomplete reseed (missing: %, stale: %)', v_missing, v_stale;
  END IF;

  -- All requested combos seeded in the snapshot; stamp top-level
  -- last_seed_date with CAS guard.
  --
  -- Codex Phase 0.C R9-F1 — stale-key pruning. On every successful
  -- finalize the singleton's combos_materialized / combos_seeded_dates /
  -- alias_map are SET to EXACTLY p_required_combos (pruning any stale
  -- keys from previous matrix versions). Without this, an older
  -- spec-revision's retired combo (e.g., the pre-split R7 / R8 keys)
  -- would remain in alias_map forever and validation-resolve-alias
  -- could return stale identities even after the gate reports OK.
  --
  -- The pruning lives in the finalizer (not the per-combo mint) because
  -- only --combo all has the authoritative full set; single-combo
  -- dispatch can't know which other keys are stale vs in-progress.
  UPDATE public.validation_state
    SET last_seed_date = p_validation_today_iso::date,
        combos_materialized = p_required_combos,
        combos_seeded_dates = (
          SELECT coalesce(jsonb_object_agg(k, combos_seeded_dates -> k), '{}'::jsonb)
            FROM unnest(p_required_combos) AS k
            WHERE combos_seeded_dates ? k
        ),
        alias_map = (
          SELECT coalesce(jsonb_object_agg(k, alias_map -> k), '{}'::jsonb)
            FROM unnest(p_required_combos) AS k
            WHERE alias_map ? k
        )
    WHERE key = 'validation_seed'
      AND combos_seeded_dates = v_combos_dates;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: combos_seeded_dates changed between snapshot and update; concurrent mint_validation_fixture_atomic detected — retry the finalize call. (TOCTOU defense per R52 F47 + R53 commit 93 compare-and-swap repair)';
  END IF;

  -- Codex Phase 0.C R14-F1 + R15-F1 + R16-F2 — physical stale-show
  -- pruning under per-show advisory locks. R9 pruned stale keys from
  -- validation_state only; that left retired 'validation_<combo>'
  -- show rows reachable. R15 added the per-show lock. R16 closed the
  -- TOCTOU between lock enumeration and DELETE.
  --
  -- R16-F2 (CRITICAL) — under PostgreSQL READ COMMITTED, a separate
  -- DELETE re-evaluating the broad stale predicate could match rows
  -- committed AFTER the lock-acquisition loop, deleting them lock-
  -- naked. Repair: materialize the exact stale drive_file_ids into a
  -- text[] during the lock loop, then DELETE WHERE drive_file_id =
  -- ANY(<materialized array>) — the DELETE only touches rows the
  -- lock loop covered. Rows that appear after the snapshot remain
  -- for the NEXT finalize call.
  --
  -- LIKE 'validation\_%' ESCAPE '\' scopes strictly to validation
  -- namespace (literal underscore). FK cascades on crew_members +
  -- show_share_tokens handle the per-show cleanup.
  DECLARE
    v_stale_drive_file_ids text[] := ARRAY[]::text[];
  BEGIN
    -- Codex Phase 0.C R19-F1 — fixture-ownership sentinel guard.
    -- The pre-R19 predicate used drive_file_id prefix alone, which is
    -- not durable ownership proof. A real/imported show with a Drive
    -- file id starting 'validation_' would be DELETEd. Repair: also
    -- require client_label = 'M12 Validation', which the mint RPC
    -- enforces on every reseed (now in INSERT + UPDATE SET). Non-
    -- validation shows can never carry that label unless they were
    -- minted by THIS RPC.
    FOR v_combo IN
      SELECT s.drive_file_id
        FROM public.shows s
       WHERE s.drive_file_id LIKE 'validation\_%' ESCAPE '\'
         AND s.client_label = 'M12 Validation'
         AND NOT EXISTS (
           SELECT 1 FROM unnest(p_required_combos) AS c
            WHERE s.drive_file_id = 'validation_' || c
         )
       ORDER BY s.drive_file_id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('show:' || v_combo));
      v_stale_drive_file_ids := array_append(v_stale_drive_file_ids, v_combo);
    END LOOP;

    IF array_length(v_stale_drive_file_ids, 1) IS NOT NULL THEN
      DELETE FROM public.shows
       WHERE drive_file_id = ANY(v_stale_drive_file_ids)
         AND client_label = 'M12 Validation';
    END IF;
  END;

  RETURN jsonb_build_object('finalized_combos', p_required_combos, 'last_seed_date', p_validation_today_iso);
END;
$$;

REVOKE ALL ON FUNCTION public.validation_finalize_all_atomic(text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validation_finalize_all_atomic(text[], text) TO service_role;

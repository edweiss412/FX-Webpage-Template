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
  UPDATE public.validation_state
    SET last_seed_date = p_validation_today_iso::date
    WHERE key = 'validation_seed'
      AND combos_seeded_dates = v_combos_dates;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'validation_finalize_all_atomic: combos_seeded_dates changed between snapshot and update; concurrent mint_validation_fixture_atomic detected — retry the finalize call. (TOCTOU defense per R52 F47 + R53 commit 93 compare-and-swap repair)';
  END IF;

  RETURN jsonb_build_object('finalized_combos', p_required_combos, 'last_seed_date', p_validation_today_iso);
END;
$$;

REVOKE ALL ON FUNCTION public.validation_finalize_all_atomic(text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validation_finalize_all_atomic(text[], text) TO service_role;

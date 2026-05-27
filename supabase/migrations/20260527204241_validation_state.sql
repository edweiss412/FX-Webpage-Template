-- M12 validation_state singleton — see docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md §3.3.2.
-- Singleton-enforced via key='validation_seed' PK; drift-safe CHECK; idempotent policy; type-drift fail-loud.

CREATE TABLE IF NOT EXISTS public.validation_state (
  key                              text PRIMARY KEY CHECK (key = 'validation_seed'),
  last_seed_date                   date NULL,                              -- R57 F49: NULL until validation_finalize_all_atomic stamps. Mint RPC initial INSERT MUST NOT stamp this column; only the finalizer writes it. Predicate (b) treats NULL as stale.
  combos_materialized              text[] NOT NULL,
  combos_seeded_dates              jsonb NOT NULL DEFAULT '{}'::jsonb,    -- R3: per-combo seeded dates so partial --combo all reseed cannot falsify the gate
  alias_map                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeded_by                        text NOT NULL,
  seeded_supabase_project_ref      text NOT NULL,
  seeded_at                        timestamptz NOT NULL DEFAULT now()
);

-- R59 F50 drift-repair (post-R57 nullability change).
-- Idempotent drift-repair. Pre-R57 draft specified
-- `last_seed_date date NOT NULL`; `CREATE TABLE IF NOT EXISTS` above only
-- applies the new column declaration on FIRST creation, so any dev / staging /
-- prod-equivalent stack that ran an earlier M12 draft retains the NOT NULL
-- constraint. Without this ALTER, the R57 mint RPC INSERT — which omits
-- last_seed_date — fails on drift'd stacks with `null value in column
-- "last_seed_date" violates not-null constraint`, breaking the F49 closure
-- path. ALTER COLUMN ... DROP NOT NULL is inherently idempotent so no DO $$
-- guard is needed.
ALTER TABLE public.validation_state
  ALTER COLUMN last_seed_date DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.validation_state
    DROP CONSTRAINT IF EXISTS validation_state_combos_check;
  ALTER TABLE public.validation_state
    ADD CONSTRAINT validation_state_combos_check CHECK (
      combos_materialized <@ ARRAY[
        'R1','R2','R3','R4','R5','R6','R7a','R7b','R8a','R8b',
        'SW-PRE_TRAVEL','SW-TRAVEL_IN','SW-SHOW_1','SW-SHOW_INTERIOR','SW-SHOW_LAST','SW-POST_SHOW'
      ]
    );
END $$;

ALTER TABLE public.validation_state
  ADD COLUMN IF NOT EXISTS alias_map jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN alias_map SET NOT NULL;

-- R3 amendment: per-combo seeded dates so partial --combo all reseed cannot pass check-seed.
ALTER TABLE public.validation_state
  ADD COLUMN IF NOT EXISTS combos_seeded_dates jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN combos_seeded_dates SET DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_state
  ALTER COLUMN combos_seeded_dates SET NOT NULL;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'validation_state'
      AND column_name = 'alias_map';
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'validation_state.alias_map column missing after ADD COLUMN — investigate';
  END IF;
  IF col_type <> 'jsonb' THEN
    RAISE EXCEPTION 'validation_state.alias_map has wrong type % (expected jsonb) — manual corrective migration required', col_type;
  END IF;
END $$;

-- R17 F15 — PostgREST DML lockdown for RPC-gated table
-- (AGENTS.md cross-cutting #1). Writes flow EXCLUSIVELY through
-- two SECURITY DEFINER RPCs (mint_validation_fixture_atomic +
-- validation_finalize_all_atomic) which hold the per-show advisory
-- lock per AGENTS.md invariant 2. The admin_only RLS policy below
-- alone does NOT prevent direct PostgREST DML because the policy
-- USING/WITH CHECK predicates evaluate after the table-level GRANT
-- check — an admin session that authenticated via Supabase auth can
-- INSERT/UPDATE/DELETE directly via the PostgREST builder, bypassing
-- the advisory lock and the audit-log emission. Explicit
-- table-level REVOKE closes that bypass at the schema level. SELECT
-- remains granted to anon/authenticated so the future audit UI
-- (admin-gated by the admin_only RLS policy) can read the singleton.
-- service_role keeps full DML for the RPCs (which run SECURITY DEFINER
-- under postgres/service_role).
GRANT SELECT ON TABLE public.validation_state TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.validation_state FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.validation_state TO service_role;
ALTER TABLE public.validation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only ON public.validation_state;
CREATE POLICY admin_only ON public.validation_state
  FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

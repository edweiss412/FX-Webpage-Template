/**
 * tests/db/reseedFixtures.test.ts — Task 4 (validation-reset-button).
 *
 * Real-DB integration tests for mintFixtureCombos + finalizeFixtures.
 * Runs against local Supabase at TEST_DATABASE_URL (default 127.0.0.1:54322).
 * SAFETY: finalize PRUNES shows — never run against a remote URL.
 *
 * Tests:
 *   (a) mint-all + finalize-all → seeded count == fixtures' combo count;
 *       validation_state.combos_materialized lists all combos.
 *   (b) single-combo regression: mintFixtureCombos for ONE combo WITHOUT
 *       finalizeFixtures → that combo's show exists AND a pre-seeded
 *       other-combo show survives (no prune); validation_state not rewritten.
 */
import { execFileSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { createClient } from "@supabase/supabase-js";

import { buildFixtures, R_COMBOS, SW_COMBOS, type Combo } from "@/lib/validation/fixtures";
import {
  mintFixtureCombos,
  finalizeFixtures,
  type LooseSupabaseClient,
} from "@/lib/validation/reseedFixtures";
import { safeValidationCleanup } from "./_validation-cleanup-helpers";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// SAFETY: refuse if TEST_DATABASE_URL points at a remote host.
const LOCAL_DB_URL_REGEX =
  /^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i;
if (!LOCAL_DB_URL_REGEX.test(DATABASE_URL)) {
  throw new Error(
    `reseedFixtures.test.ts: TEST_DATABASE_URL='${DATABASE_URL}' is not a local DB. ` +
      "finalizeFixtures PRUNES validation shows — refusing to run against a remote URL.",
  );
}

function runPsql(sql: string): string {
  return execFileSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

// Service-role client for the local Supabase instance.
// The anon key is used locally — the mint/finalize RPCs are SECURITY DEFINER
// and the local instance has service_role as the superuser password.
const SUPABASE_URL = "http://127.0.0.1:54321";
// Local Supabase's service-role key (from .env.local / supabase status).
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Loose-typed client — mirrors the cast in scripts/validation-reseed.ts.
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as LooseSupabaseClient;

// Derive "today" from the SERVER current_date (what mint_validation_fixture_atomic's
// >1-day clock-skew guard compares against) so this can never drift into a time-bomb:
// a hardcoded past date silently breaks every CI run once the calendar advances >1 day
// past it (it broke repo-wide when the clock rolled to 2026-06-24).
const VALIDATION_TODAY_ISO = runPsql("SELECT current_date::text;");

const ALL_COMBOS: Combo[] = [...R_COMBOS, ...SW_COMBOS];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("mintFixtureCombos + finalizeFixtures", { timeout: 60_000 }, () => {
  beforeAll(() => {
    safeValidationCleanup();
  });
  afterEach(() => {
    safeValidationCleanup();
  });

  test("(a) mint-all + finalize-all seeds all combos and updates combos_materialized", async () => {
    // env required by buildFixtures for R1's J3 claim email
    process.env.VALIDATION_J3_CLAIM_EMAIL = "test.validation.user@gmail.com";
    const fixtures = buildFixtures(VALIDATION_TODAY_ISO);

    // mint all
    const { minted } = await mintFixtureCombos(serviceClient, fixtures, VALIDATION_TODAY_ISO);
    expect(minted).toBe(fixtures.length);

    // finalize
    await finalizeFixtures(serviceClient, ALL_COMBOS, VALIDATION_TODAY_ISO);

    // show count in DB
    const showCount = parseInt(
      runPsql(
        `SELECT count(*) FROM public.shows
           WHERE drive_file_id LIKE 'validation\\_%' ESCAPE '\\'
             AND client_label = 'M12 Validation';`,
      ),
      10,
    );
    expect(showCount).toBe(fixtures.length);

    // combos_materialized lists all combos (text[] → array_to_json → parse)
    const materialized = runPsql(
      `SELECT array_to_json(combos_materialized)::text FROM public.validation_state
         WHERE key = 'validation_seed';`,
    );
    expect(materialized).not.toBe("");
    const parsed: string[] = JSON.parse(materialized);
    expect(parsed.sort()).toEqual([...ALL_COMBOS].sort());
  });

  test("(b) single-combo mint WITHOUT finalize: that combo exists AND pre-seeded other combo survives", async () => {
    process.env.VALIDATION_J3_CLAIM_EMAIL = "test.validation.user@gmail.com";
    const allFixtures = buildFixtures(VALIDATION_TODAY_ISO);

    // Pre-seed a DIFFERENT combo (R2) via a full mint+finalize so
    // validation_state exists with combos_materialized = ["R2"].
    const r2Fixtures = allFixtures.filter((f) => f.combo === "R2");
    await mintFixtureCombos(serviceClient, r2Fixtures, VALIDATION_TODAY_ISO);
    await finalizeFixtures(serviceClient, ["R2"], VALIDATION_TODAY_ISO);

    // Mint ONLY R1 — NO finalize.
    const r1Fixtures = allFixtures.filter((f) => f.combo === "R1");
    const { minted } = await mintFixtureCombos(serviceClient, r1Fixtures, VALIDATION_TODAY_ISO);
    expect(minted).toBe(1);

    // R1 show must exist.
    const r1Count = parseInt(
      runPsql(
        `SELECT count(*) FROM public.shows
           WHERE drive_file_id = 'validation_R1'
             AND client_label = 'M12 Validation';`,
      ),
      10,
    );
    expect(r1Count).toBe(1);

    // R2 show MUST STILL EXIST — no prune occurred (finalize was NOT called).
    const r2Count = parseInt(
      runPsql(
        `SELECT count(*) FROM public.shows
           WHERE drive_file_id = 'validation_R2'
             AND client_label = 'M12 Validation';`,
      ),
      10,
    );
    expect(r2Count).toBe(1);

    // last_seed_date must NOT have been written — only finalizeFixtures writes it.
    // The mint RPC's initial INSERT deliberately omits last_seed_date (F49).
    const lastSeedDate = runPsql(
      `SELECT coalesce(last_seed_date::text, 'NULL') FROM public.validation_state
         WHERE key = 'validation_seed';`,
    );
    // R2's finalize set it, so it equals VALIDATION_TODAY_ISO (not updated to a new value).
    // More importantly: combos_materialized now contains BOTH combos (additive append
    // by the mint RPC), NOT pruned to just ["R1"] as finalizeFixtures would do.
    const materialized = runPsql(
      `SELECT array_to_json(combos_materialized)::text FROM public.validation_state
         WHERE key = 'validation_seed';`,
    );
    const parsedMaterialized: string[] = JSON.parse(materialized);
    // Both combos present — mint appends, does NOT prune.
    expect(parsedMaterialized).toContain("R1");
    expect(parsedMaterialized).toContain("R2");
    // last_seed_date was set by the R2 finalize and must NOT have been cleared.
    expect(lastSeedDate).toBe(VALIDATION_TODAY_ISO);
  });
});

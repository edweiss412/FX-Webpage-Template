// lib/validation/reseedFixtures.ts — Task 4 (validation-reset-button).
//
// Shared mint + finalize helpers extracted from scripts/validation-reseed.ts.
// Used by both the CLI and the upcoming admin "reseed" server action.
//
// Design: mint and finalize are TWO SEPARATE functions because
// validation_finalize_all_atomic rewrites combos_materialized AND prunes
// validation shows not in p_required_combos. The CLI calls finalizeFixtures
// ONLY for --combo all; a single-combo run must NOT prune. The admin reseed
// button always seeds all 16 combos (mint-all + finalize-all).
//
// Per master spec §3.3 + §9.1.2 + plan Task 4 brief.

import type { FixtureRow, Combo } from "@/lib/validation/fixtures";

// ---------------------------------------------------------------------------
// Loose client type — mirrors the inline type in scripts/validation-reseed.ts.
// The validation tooling doesn't carry generated DB types, so we use a minimal
// structural type accepted by both createClient() output and test doubles.
// ---------------------------------------------------------------------------
export type LooseSupabaseClient = {
  rpc: (
    fnName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

// ---------------------------------------------------------------------------
// mintFixtureCombos — mint loop ONLY, NO finalize.
//
// For each fixture in `fixtures`, calls mint_validation_fixture_atomic.
// The fixtures array may be the full 16-combo set or a single-combo subset —
// the caller decides. Does NOT call validation_finalize_all_atomic.
//
// Returns { minted: number } — count of successfully minted combos.
// Throws on the first RPC error.
// ---------------------------------------------------------------------------
export async function mintFixtureCombos(
  client: LooseSupabaseClient,
  fixtures: FixtureRow[],
  validationTodayIso: string,
  seededBy = "lib/validation/reseedFixtures (mintFixtureCombos)",
  seededProjectRef = "local",
): Promise<{ minted: number }> {
  let minted = 0;
  for (const fixture of fixtures) {
    const payload = {
      showName: fixture.showName,
      dates: fixture.dates,
      crewMembers: fixture.crewMembers.map((c) => ({
        alias: c.alias,
        name: c.name,
        email: c.email,
        roleFlags: c.roleFlags,
        dateRestriction: fixture.dateRestriction,
        stageRestriction: fixture.stageRestriction,
      })),
      // validationTodayIso is passed in by the caller — it must be the SAME
      // value used to call buildFixtures() to avoid UTC-midnight drift.
      validationTodayIso,
      seededBy,
      seededProjectRef,
    };
    const { data, error } = await client.rpc("mint_validation_fixture_atomic", {
      p_combo: fixture.combo,
      p_fixture_payload: payload,
    });
    if (error) {
      throw new Error(
        `mint_validation_fixture_atomic(${fixture.combo}) failed: ${error.message ?? JSON.stringify(error)}`,
      );
    }
    if (data === null || data === undefined) {
      throw new Error(
        `mint_validation_fixture_atomic(${fixture.combo}) returned no data — expected {show_id, alias_map_slice}.`,
      );
    }
    minted += 1;
  }
  return { minted };
}

// ---------------------------------------------------------------------------
// finalizeFixtures — the single validation_finalize_all_atomic call.
//
// MUST be called with the SAME validationTodayIso used to build the fixtures
// (to avoid UTC-midnight drift between mint and finalize). The RPC requires
// p_validation_today_iso; it also rewrites combos_materialized = requiredCombos
// and PRUNES validation shows NOT in that list.
//
// Call ONLY when reseeding the full set (--combo all / admin reseed button).
// A single-combo run must NOT call this function.
// ---------------------------------------------------------------------------
export async function finalizeFixtures(
  client: LooseSupabaseClient,
  requiredCombos: Combo[],
  validationTodayIso: string,
): Promise<void> {
  const { data, error } = await client.rpc("validation_finalize_all_atomic", {
    p_required_combos: requiredCombos,
    p_validation_today_iso: validationTodayIso,
  });
  if (error) {
    throw new Error(
      `validation_finalize_all_atomic failed: ${error.message ?? JSON.stringify(error)}`,
    );
  }
  if (data === null || data === undefined) {
    throw new Error(
      "validation_finalize_all_atomic returned no data — expected {finalized_combos, last_seed_date}.",
    );
  }
}

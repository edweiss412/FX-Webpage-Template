// scripts/validation-reseed.ts — M12 Phase 0.C Task 0.C.4.
//
// Per master spec §3.3 + §9.1.2. Mints validation fixtures via two
// SECURITY DEFINER RPCs:
//   * mint_validation_fixture_atomic — per-combo atomic UPSERT (shows +
//     show_share_tokens self-heal + crew_members full-replace + alias_map
//     slice merge) under per-show advisory lock.
//   * validation_finalize_all_atomic — promotes last_seed_date AFTER every
//     requested combo's per-combo seeded date matches today. Only called
//     on --combo all per R55 F48 dispatch contract.
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { loadValidationEnv } from "./lib/validation-env";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "./lib/validation-target";
import {
  buildFixtures,
  R_COMBOS,
  SW_COMBOS,
  type Combo,
  type FixtureRow,
} from "./lib/validation-fixtures";

const USAGE = `Usage: pnpm validation:reseed [--combo <id>|all] [--allow-local-override] [--help]

Per master spec §3.3 + §9.1.2 — full-replace seed of the M12 validation
fixtures (16 combos × 9/1 aliases = 96 leaves) into the prod-equivalent
Supabase project.

Options:
  --combo <id>            Single combo to reseed (R1..R8b, SW-PRE_TRAVEL,
                          SW-TRAVEL_IN, SW-SHOW_1, SW-SHOW_INTERIOR,
                          SW-SHOW_LAST, SW-POST_SHOW) OR \`all\`.
  --allow-local-override  Permit running against http://localhost / 127.0.0.1
                          (refused by default; the script defends against
                          accidental seeding of local dev DBs).
  --help                  Print this message and exit 0.

Required environment variables (§9.1.2 reseed row):
  VALIDATION_SUPABASE_URL
  VALIDATION_SUPABASE_SECRET_KEY
  VALIDATION_SUPABASE_PROJECT_REF
  VALIDATION_J3_CLAIM_EMAIL          (dev's real Google account email —
                                      Google OAuth cannot authenticate
                                      against placeholder/dev-only reserved
                                      domains; predicate (k) in check-seed
                                      enforces this)
`;

const ALL_COMBOS: Combo[] = [...R_COMBOS, ...SW_COMBOS];

function log(msg: string): void {
  process.stderr.write(`[validation-reseed] ${msg}\n`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(
      `${name} is required — set it in .env.local per .env.local.example + spec §9.1.2.`,
    );
  }
  return v;
}

// Loose-typed SupabaseClient — the validation tooling doesn't have generated
// DB types (the runtime project uses arbitrary RPC names) and the script
// runs as service_role; trust the response shape and check {data, error}.
type LooseSupabaseClient = {
  rpc: (
    fnName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function mintCombo(
  supabase: LooseSupabaseClient,
  fixture: FixtureRow,
  validationTodayIso: string,
  seededBy: string,
  seededProjectRef: string,
): Promise<void> {
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
    validationTodayIso,
    seededBy,
    seededProjectRef,
  };
  const { data, error } = await supabase.rpc("mint_validation_fixture_atomic", {
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
}

async function finalizeAll(
  supabase: LooseSupabaseClient,
  requiredCombos: Combo[],
  validationTodayIso: string,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "validation_finalize_all_atomic",
    {
      p_required_combos: requiredCombos,
      p_validation_today_iso: validationTodayIso,
    },
  );
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

async function main(): Promise<void> {
  // Codex Phase 0.C R4 F2 — auto-load .env.local at CLI startup to mirror
  // Next.js's canonical env-loading order (loadEnvConfig). Without this,
  // operators following the documented .env.local setup get missing-env
  // failures before any seed/check runs.
  loadValidationEnv();
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", default: false },
      combo: { type: "string" },
      "allow-local-override": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  // Target-selection guard (rejects localhost without --allow-local-override).
  assertProdEquivalentTarget(
    process.env.VALIDATION_SUPABASE_URL,
    values["allow-local-override"] ?? false,
  );

  // Required env vars per spec §9.1.2 reseed row.
  const supabaseUrl = requireEnv("VALIDATION_SUPABASE_URL");
  const supabaseKey = requireEnv("VALIDATION_SUPABASE_SECRET_KEY");
  const supabaseProjectRef = requireEnv("VALIDATION_SUPABASE_PROJECT_REF");
  // F2 wrong-project guard (Codex Phase 0.C R1).
  assertSupabaseTargetMatchesProjectRef(
    supabaseUrl,
    supabaseProjectRef,
    values["allow-local-override"] ?? false,
  );
  // buildFixtures() guards VALIDATION_J3_CLAIM_EMAIL itself; abort early
  // if unset to give the actionable diagnostic before any RPC.
  requireEnv("VALIDATION_J3_CLAIM_EMAIL");

  const requestedCombo = values.combo ?? "all";
  const combosToReseed: Combo[] =
    requestedCombo === "all"
      ? ALL_COMBOS
      : ALL_COMBOS.includes(requestedCombo as Combo)
      ? [requestedCombo as Combo]
      : [];
  if (combosToReseed.length === 0) {
    throw new Error(
      `Unknown combo '${requestedCombo}'. Valid: 'all' or one of ${ALL_COMBOS.join(", ")}.`,
    );
  }

  // Canonical UTC `today` value — passed to every RPC call so per-combo
  // stamps don't drift across UTC-midnight crossings mid-run.
  const validationTodayIso = new Date().toISOString().slice(0, 10);

  log(
    `target=${supabaseUrl} project_ref=${supabaseProjectRef} combos=[${combosToReseed.join(",")}] today=${validationTodayIso}`,
  );

  // Cast to LooseSupabaseClient since the validation tooling doesn't carry
  // generated DB types and supabase-js's strict generic on rpc() requires
  // matching FunctionName/FunctionArgs from those generated types.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as LooseSupabaseClient;

  const allFixtures = buildFixtures(validationTodayIso);
  const fixturesByCombo = new Map<Combo, FixtureRow>(
    allFixtures.map((fx) => [fx.combo, fx]),
  );

  const seededBy = `validation-reseed cli (${process.env.USER ?? "unknown"})`;

  let succeeded = 0;
  for (const combo of combosToReseed) {
    const fixture = fixturesByCombo.get(combo);
    if (!fixture) {
      throw new Error(`Internal error: no fixture found for combo ${combo}`);
    }
    log(`mint ${combo}…`);
    await mintCombo(
      supabase,
      fixture,
      validationTodayIso,
      seededBy,
      supabaseProjectRef,
    );
    succeeded += 1;
  }

  // R55 commit 94 F48 — finalizer ONLY fires on --combo all. Single-combo
  // dispatch leaves last_seed_date alone; check-seed predicate (b') reads
  // combos_seeded_dates[<single>] instead.
  if (requestedCombo === "all") {
    log("finalize…");
    await finalizeAll(supabase, ALL_COMBOS, validationTodayIso);
  }

  process.stdout.write(
    `seeded ${succeeded} combos at ${new Date().toISOString()}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[validation-reseed] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

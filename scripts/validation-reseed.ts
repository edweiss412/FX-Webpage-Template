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
import { buildFixtures, R_COMBOS, SW_COMBOS, type Combo } from "../lib/validation/fixtures";
import {
  mintFixtureCombos,
  finalizeFixtures,
  type LooseSupabaseClient,
} from "../lib/validation/reseedFixtures";

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
  const fixturesByCombo = new Map(allFixtures.map((fx) => [fx.combo, fx]));
  const requestedFixtures = combosToReseed.map((combo) => {
    const fixture = fixturesByCombo.get(combo);
    if (!fixture) throw new Error(`Internal error: no fixture found for combo ${combo}`);
    return fixture;
  });

  const seededBy = `validation-reseed cli (${process.env.USER ?? "unknown"})`;

  log(`mint [${combosToReseed.join(",")}]…`);
  const { minted: succeeded } = await mintFixtureCombos(
    supabase,
    requestedFixtures,
    validationTodayIso,
    seededBy,
    supabaseProjectRef,
  );

  // R55 commit 94 F48 — finalizer ONLY fires on --combo all. Single-combo
  // dispatch leaves last_seed_date alone; check-seed predicate (b') reads
  // combos_seeded_dates[<single>] instead.
  if (requestedCombo === "all") {
    log("finalize…");
    await finalizeFixtures(supabase, ALL_COMBOS, validationTodayIso);
  }

  process.stdout.write(`seeded ${succeeded} combos at ${new Date().toISOString()}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `[validation-reseed] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

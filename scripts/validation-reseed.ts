// scripts/validation-reseed.ts — M12 Phase 0.C Task 0.C.1.
//
// Per master spec §3.3 + §9.1.2 (canonical per-CLI env-var contract). This is
// the SKELETON commit (Task 0.C.1) — full fixture minting wires in at Task
// 0.C.4 once the mint_validation_fixture_atomic + validation_finalize_all_atomic
// RPCs land.
//
// Required env vars per §9.1.2 reseed row:
//   VALIDATION_SUPABASE_URL          — Vercel Production-scope Supabase URL
//   VALIDATION_SUPABASE_SECRET_KEY   — Vercel Production-scope service-role key
//   VALIDATION_SUPABASE_PROJECT_REF  — Vercel Production-scope project ref
//   VALIDATION_J3_CLAIM_EMAIL        — dev's real Google account email (R13/R15)
import { parseArgs } from "node:util";

import { assertProdEquivalentTarget } from "./lib/validation-target";

const USAGE = `Usage: pnpm validation:reseed [--combo <id>|all] [--allow-local-override] [--help]

Per master spec §3.3 + §9.1.2 — full-replace seed of the M12 validation
fixtures (16 combos × 9/1 aliases = 96 leaves) into the prod-equivalent
Supabase project.

Options:
  --combo <id>            Single combo to reseed (R1..R8b, SW-PRE_TRAVEL,
                          SW-TRAVEL_DAY, SW-SHOW_FIRST, SW-DARK_DAY,
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

function main(): void {
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

  // Task 0.C.2 — target-selection guard (rejects localhost without override).
  assertProdEquivalentTarget(
    process.env.VALIDATION_SUPABASE_URL,
    values["allow-local-override"] ?? false,
  );

  // Task 0.C.1 lands only the help-text skeleton. Subsequent tasks (0.C.3
  // fixture build, 0.C.4 RPC call sites) will populate this body.
  process.stderr.write(
    "validation:reseed body not yet implemented — Task 0.C.1 scaffold only.\n",
  );
  process.exit(2);
}

main();

// scripts/validation-check-seed.ts — M12 Phase 0.C Task 0.C.1 (scaffold).
//
// Per master spec §3.3.2 — 12 predicates (a, b, b', c-g, i, k, l, m, n).
// Full implementation lands in Task 0.C.5.
import { parseArgs } from "node:util";

import { assertProdEquivalentTarget } from "./lib/validation-target";

const USAGE = `Usage: pnpm validation:check-seed [--combo <id>|all] [--allow-local-override] [--today YYYY-MM-DD] [--help]

Per master spec §3.3.2 — evaluates the picker-fixture lockstep contract
against the live validation_state singleton + crew_members / show_share_tokens
joins. Exit 0 on PASS; exit 1 with diagnostic on first failed predicate.

Options:
  --combo <id>            Combo scope: \`all\` (predicate (b) — last_seed_date)
                          or a single combo enum (predicate (b') —
                          combos_seeded_dates[<combo>]). Defaults to \`all\`.
  --allow-local-override  Permit running against http://localhost / 127.0.0.1.
  --today YYYY-MM-DD      Override the canonical UTC \`today\` date used by
                          predicates (b/b'/i). Defaults to
                          \`new Date().toISOString().slice(0, 10)\`.
  --help                  Print this message and exit 0.

Required environment variables (§9.1.2 check-seed row):
  VALIDATION_SUPABASE_URL
  VALIDATION_SUPABASE_SECRET_KEY
  VALIDATION_SUPABASE_PROJECT_REF
  VALIDATION_J3_CLAIM_EMAIL
`;

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", default: false },
      combo: { type: "string" },
      "allow-local-override": { type: "boolean", default: false },
      today: { type: "string" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  assertProdEquivalentTarget(
    process.env.VALIDATION_SUPABASE_URL,
    values["allow-local-override"] ?? false,
  );

  process.stderr.write(
    "validation:check-seed body not yet implemented — Task 0.C.1 scaffold only.\n",
  );
  process.exit(2);
}

main();

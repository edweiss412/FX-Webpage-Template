// scripts/validation-resolve-alias.ts — M12 Phase 0.C Task 0.C.1 (scaffold).
//
// Per master spec §9.1.2 — positional args <combo> <alias>; reads
// validation_state.alias_map[combo][alias] and prints the crew_members UUID
// on stdout. Full implementation lands in Task 0.C.6.
import { parseArgs } from "node:util";

const USAGE = `Usage: pnpm validation:resolve-alias <combo> <alias> [--allow-local-override] [--help]

Per master spec §9.1.2 — resolves an (combo, alias) pair against the live
validation_state.alias_map jsonb tree and prints the crew_members UUID on
stdout. Exit 0 with UUID on success; exit 1 with diagnostic if the combo
or alias is missing from alias_map.

Positional arguments:
  <combo>                 Combo enum (R1..R8b, SW-PRE_TRAVEL, ...)
  <alias>                 Alias enum (alias_5a_lead, alias_5b_lead_a1, ...,
                          alias_6f_empty).

Options:
  --allow-local-override  Permit running against http://localhost / 127.0.0.1.
  --help                  Print this message and exit 0.

Required environment variables (§9.1.2 resolve-alias row):
  VALIDATION_SUPABASE_URL
  VALIDATION_SUPABASE_SECRET_KEY
  VALIDATION_SUPABASE_PROJECT_REF
`;

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", default: false },
      "allow-local-override": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  process.stderr.write(
    "validation:resolve-alias body not yet implemented — Task 0.C.1 scaffold only.\n",
  );
  process.exit(2);
}

main();

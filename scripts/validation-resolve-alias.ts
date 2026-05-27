// scripts/validation-resolve-alias.ts — M12 Phase 0.C Task 0.C.6.
//
// Per master spec §9.1.2 — positional args <combo> <alias>; reads
// validation_state.alias_map[combo][alias] and prints the crew_members
// UUID on stdout. Exit 0 with UUID on success; exit 1 with diagnostic
// if combo or alias is missing from alias_map.
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { loadValidationEnv } from "./lib/validation-env";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "./lib/validation-target";

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

type LooseSupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{
          data: unknown;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

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
  // Codex Phase 0.C R4 F2 — auto-load .env.local (mirrors Next.js loader).
  loadValidationEnv();
  const { values, positionals } = parseArgs({
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

  if (positionals.length !== 2) {
    process.stderr.write(USAGE);
    throw new Error(
      `validation:resolve-alias requires exactly 2 positional arguments (combo + alias); got ${positionals.length}.`,
    );
  }
  const [combo, alias] = positionals;
  if (!combo || !alias) {
    throw new Error(
      "validation:resolve-alias: combo and alias must be non-empty strings.",
    );
  }

  assertProdEquivalentTarget(
    process.env.VALIDATION_SUPABASE_URL,
    values["allow-local-override"] ?? false,
  );

  const supabaseUrl = requireEnv("VALIDATION_SUPABASE_URL");
  const supabaseKey = requireEnv("VALIDATION_SUPABASE_SECRET_KEY");
  const projectRef = requireEnv("VALIDATION_SUPABASE_PROJECT_REF");
  // F2 wrong-project guard (Codex Phase 0.C R1).
  assertSupabaseTargetMatchesProjectRef(
    supabaseUrl,
    projectRef,
    values["allow-local-override"] ?? false,
  );

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as LooseSupabaseClient;

  const { data, error } = await supabase
    .from("validation_state")
    .select("alias_map")
    .eq("key", "validation_seed")
    .maybeSingle();
  if (error) {
    throw new Error(
      `validation_state read failed: ${error.message ?? JSON.stringify(error)}`,
    );
  }
  if (data === null || data === undefined) {
    throw new Error(
      "validation_state row missing — run `pnpm validation:reseed --combo all` first.",
    );
  }
  const aliasMap = (data as { alias_map: Record<string, Record<string, string>> })
    .alias_map;
  const slice = aliasMap?.[combo];
  if (!slice || typeof slice !== "object") {
    throw new Error(
      `alias_map missing combo '${combo}'. Available combos: ${Object.keys(aliasMap ?? {}).join(", ") || "<none>"}.`,
    );
  }
  const uuid = slice[alias];
  if (!uuid) {
    throw new Error(
      `alias_map[${combo}] missing alias '${alias}'. Available aliases for ${combo}: ${Object.keys(slice).join(", ")}.`,
    );
  }

  process.stdout.write(`${uuid}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `[validation-resolve-alias] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

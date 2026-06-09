/**
 * scripts/generate-schema-manifest.ts  (pnpm gen:schema-manifest)
 *
 * Introspects the LOCAL all-migrations-applied Supabase Postgres and writes
 * supabase/__generated__/schema-manifest.json — the canonical "what the repo's
 * migrations produce in `public`" snapshot. Run this after adding or altering a
 * migration (you've already applied it locally to test it per the TDD
 * invariant), then commit the updated manifest. The validation-schema-parity CI
 * gate asserts the persistent validation project is a superset of this file, so
 * a forgotten `supabase db query --linked` apply surfaces as a red gate instead
 * of a silently-degraded live surface (the #9 incident).
 *
 * DB target: SCHEMA_MANIFEST_DB_URL if set, else the well-known local URL. This
 * deliberately does NOT read TEST_DATABASE_URL (that points at the validation
 * project in CI; generating from validation would bake drift INTO the manifest).
 *
 * Usage:
 *   pnpm gen:schema-manifest          # introspect local, write the manifest
 *   pnpm gen:schema-manifest --check  # write nothing; exit 1 if it would change
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  INTROSPECT_PUBLIC_COLUMNS_SQL,
  manifestFromRows,
  parsePsqlRows,
  serializeManifest,
} from "./schema-manifest/lib";

export const MANIFEST_PATH = "supabase/__generated__/schema-manifest.json";
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function localManifestDbUrl(): string {
  const raw = process.env.SCHEMA_MANIFEST_DB_URL;
  if (raw === undefined) return LOCAL_DB_URL;
  if (raw.trim() === "") {
    throw new Error("SCHEMA_MANIFEST_DB_URL is set but empty — unset it to use the local default.");
  }
  return raw;
}

export function introspectPublicSchema(dbUrl: string): string {
  const stdout = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: INTROSPECT_PUBLIC_COLUMNS_SQL,
    encoding: "utf8",
  });
  return serializeManifest(manifestFromRows(parsePsqlRows(stdout)));
}

function main(): void {
  const check = process.argv.includes("--check");
  const json = introspectPublicSchema(localManifestDbUrl());

  if (check) {
    let current = "";
    try {
      current = readFileSync(MANIFEST_PATH, "utf8");
    } catch {
      /* missing → treated as drift below */
    }
    if (current !== json) {
      process.stderr.write(
        `${MANIFEST_PATH} is stale. Run \`pnpm gen:schema-manifest\` and commit the result.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`${MANIFEST_PATH} is fresh.\n`);
    return;
  }

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, json);
  process.stdout.write(
    `Wrote ${MANIFEST_PATH} (${Object.keys(JSON.parse(json)).length} tables).\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

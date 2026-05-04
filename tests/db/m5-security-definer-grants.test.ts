/**
 * M5 SECURITY DEFINER sweep.
 *
 * These migrations define public-schema SECURITY DEFINER helpers. Supabase
 * exposes public functions as REST RPCs, so each helper must explicitly
 * revoke EXECUTE from PUBLIC, anon, and authenticated. Trigger-only helpers
 * are tightened too as defense-in-depth.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type DefinerFunction = {
  migration: string;
  signature: string;
  serviceRoleCallable: boolean;
};

const functions: DefinerFunction[] = [
  {
    migration: "supabase/migrations/20260504000000_realtime_private_channel_authorization.sql",
    signature: "public.publish_show_invalidation_after_statement()",
    serviceRoleCallable: false,
  },
  {
    migration: "supabase/migrations/20260504000000_realtime_private_channel_authorization.sql",
    signature: "public.publish_show_invalidation(uuid)",
    serviceRoleCallable: true,
  },
  {
    migration: "supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql",
    signature: "public.cleanup_bootstrap_nonces()",
    serviceRoleCallable: true,
  },
  {
    migration: "supabase/migrations/20260504000002_revoke_leaked_link_atomic.sql",
    signature: "public.revoke_leaked_link_atomic(uuid, text, int, text)",
    serviceRoleCallable: true,
  },
];

function migrationSql(path: string): string {
  return readFileSync(path, "utf8");
}

function functionName(signature: string): string {
  return signature.slice("public.".length, signature.indexOf("("));
}

describe("M5 SECURITY DEFINER migration grant sweep", () => {
  test.each(functions)("$signature locks search_path", ({ migration, signature }) => {
    const name = functionName(signature);
    expect(migrationSql(migration)).toMatch(
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp`,
        "i",
      ),
    );
  });

  test.each(functions)(
    "$signature revokes EXECUTE from PUBLIC, anon, authenticated",
    ({ migration, signature }) => {
      expect(migrationSql(migration)).toContain(
        `revoke all on function ${signature} from public, anon, authenticated;`,
      );
    },
  );

  test.each(functions.filter((entry) => entry.serviceRoleCallable))(
    "$signature grants EXECUTE only to service_role",
    ({ migration, signature }) => {
      const sql = migrationSql(migration);
      expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
      expect(sql).not.toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+${signature.replace(/[().]/g, "\\$&")}\\s+to\\s+(public|anon|authenticated)\\b`,
          "i",
        ),
      );
    },
  );
});

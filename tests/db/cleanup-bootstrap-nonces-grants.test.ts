/**
 * tests/db/cleanup-bootstrap-nonces-grants.test.ts (M5 round-8 §A HIGH)
 *
 * public.cleanup_bootstrap_nonces() is a SECURITY DEFINER cron helper. The
 * sandbox cannot connect to the local Supabase Postgres instance, so this
 * regression pins the migration SQL that creates the eventual proacl shape:
 * service_role only, no PUBLIC/anon/authenticated execute path.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql",
  "utf8",
);
const mintMigration = readFileSync(
  "supabase/migrations/20260505000002_mint_bootstrap_nonce_atomic.sql",
  "utf8",
);

describe("public.cleanup_bootstrap_nonces grants", () => {
  test("function is security definer with locked-down search_path", () => {
    expect(migration).toMatch(
      /create or replace function public\.cleanup_bootstrap_nonces\(\)[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/i,
    );
  });

  test("migration revokes EXECUTE from PUBLIC, anon, and authenticated, then grants service_role", () => {
    expect(migration).toContain(
      "revoke all on function public.cleanup_bootstrap_nonces() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.cleanup_bootstrap_nonces() to service_role;",
    );
    expect(migration).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.cleanup_bootstrap_nonces\(\)\s+to\s+(public|anon|authenticated)\b/i,
    );
  });
});

describe("public.mint_bootstrap_nonce_atomic grants", () => {
  test("function is security definer with locked-down search_path", () => {
    expect(mintMigration).toMatch(
      /create or replace function public\.mint_bootstrap_nonce_atomic\([\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/i,
    );
  });

  test("function takes try advisory lock and inserts bootstrap nonce in the same body", () => {
    expect(mintMigration).toMatch(/\bpg_try_advisory_xact_lock\s*\(/i);
    expect(mintMigration).toMatch(/insert into public\.bootstrap_nonces/i);
  });

  test("migration revokes EXECUTE from PUBLIC, anon, and authenticated, then grants service_role", () => {
    expect(mintMigration).toContain("revoke all on function public.mint_bootstrap_nonce_atomic(");
    expect(mintMigration).toContain(") from public, anon, authenticated;");
    expect(mintMigration).toContain(
      "grant execute on function public.mint_bootstrap_nonce_atomic(",
    );
    expect(mintMigration).toContain(") to service_role;");
    expect(mintMigration).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.mint_bootstrap_nonce_atomic\([^;]+to\s+(public|anon|authenticated)\b/i,
    );
  });
});

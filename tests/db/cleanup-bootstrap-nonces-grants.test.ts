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

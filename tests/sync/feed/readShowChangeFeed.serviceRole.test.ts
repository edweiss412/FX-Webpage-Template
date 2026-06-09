/**
 * Task 5.4 — pin the feed read to the SERVICE-ROLE client; prove anon PostgREST is denied.
 *
 * Two guards:
 *  1. Source guard (static): readShowChangeFeed.ts constructs the service-role client and
 *     NEVER a cookie-bound/anon client (createSupabaseServerClient / createServerClient).
 *     A refactor that swaps in the cookie-bound client would read crew PII (before_image /
 *     held_value) under the caller's RLS context — or return zero rows for a legitimate
 *     admin server caller — so the posture is pinned at the source.
 *  2. Runtime lockdown proof (real-Postgres): an anon PostgREST select on show_change_log /
 *     sync_holds returns zero rows / is RLS-denied (the Phase-1 F9 posture), while the
 *     service-role readShowChangeFeed returns the seeded rows.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test } from "vitest";

import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";

const SOURCE_PATH = "lib/sync/feed/readShowChangeFeed.ts";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const runPsql = (sql: string) =>
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;

// Local Supabase REST URL + anon (publishable) key surfaced by `supabase status`.
// Not a secret — the public anon key for the local stack (same convention as
// tests/db/postgrest-dml-lockdown.test.ts).
const ANON_REST_URL = process.env.SUPABASE_TEST_ANON_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

describe("readShowChangeFeed service-role posture", () => {
  describe("source guard", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");

    test("imports the service-role client constructor", () => {
      expect(source).toMatch(/createSupabaseServiceRoleClient/);
    });

    test("never references a cookie-bound / anon server client", () => {
      expect(source).not.toMatch(/createSupabaseServerClient/);
      expect(source).not.toMatch(/createServerClient/);
    });

    test("its only Supabase client is the service-role client", () => {
      // Every .from(...) call must run on the service-role-derived client. We
      // pin that by asserting (a) the service-role client is the ONLY client
      // constructed, and (b) no createClient(...) anon construction leaks in.
      expect(source).not.toMatch(/createClient\s*\(/);
      const serviceRoleConstructions = source.match(/createSupabaseServiceRoleClient\s*\(/g) ?? [];
      expect(serviceRoleConstructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("runtime lockdown proof (real-Postgres)", () => {
    const prefix = `feed-sr-${randomUUID()}`;
    let showId: string;

    afterEach(() => {
      runPsql(`delete from public.shows where drive_file_id like ${q(prefix + "%")};`);
    });

    test("anon PostgREST is denied; service-role readShowChangeFeed returns the rows", async () => {
      showId = runPsql(`
        with s as (
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
          values (${q(prefix + "-a")}, ${q(prefix + "-a")}, 'Feed SR', 'FXAV', 'v4', true)
          returning id
        ),
        log as (
          insert into public.show_change_log
            (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, before_image, after_image, status)
          select id, ${q(prefix + "-a")}, now() - interval '1 min',
            'auto_apply', 'crew_added', 'Sam', 'Crew added: Sam',
            '{"email":"sam@secret"}'::jsonb, '{"name":"Sam"}'::jsonb, 'applied' from s
          returning id
        ),
        hold as (
          insert into public.sync_holds
            (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
          select id, ${q(prefix + "-a")}, 'crew_email', 'Sam',
            '{"name":"Sam","email":"sam@old"}'::jsonb,
            '{"disposition":"email_change","name":"Sam","email":"sam@new"}'::jsonb,
            now(), 'mi11_pending', 'system' from s
          returning id
        )
        select id from s;
      `);

      const anon = createClient(ANON_REST_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Anti-tautology control: the SAME anon client reaches PostgREST and gets a
      // clean (non-key-error) response on an anon-readable table, so a zero-row /
      // denial on the feed tables below is RLS posture, not a broken key/gateway.
      const anonControl = await anon.from("shows").select("id").limit(1);
      expect(anonControl.error).toBeNull();

      // Anon PostgREST select → RLS/REVOKE-denied: no rows AND no PII (before_image
      // / held_value) leaks back, even on an explicit attempt to read it.
      const anonLog = await anon
        .from("show_change_log")
        .select("id, before_image")
        .eq("show_id", showId);
      expect(anonLog.error).not.toBeNull(); // permission denied (Phase-1 F9 lockdown)
      expect(anonLog.data ?? []).toHaveLength(0);
      expect(JSON.stringify(anonLog.data ?? [])).not.toContain("sam@secret");

      const anonHolds = await anon
        .from("sync_holds")
        .select("id, held_value")
        .eq("show_id", showId);
      expect(anonHolds.error).not.toBeNull(); // permission denied (Phase-1 F9 lockdown)
      expect(anonHolds.data ?? []).toHaveLength(0);
      expect(JSON.stringify(anonHolds.data ?? [])).not.toContain("sam@old");

      // The service-role read (the only legitimate path) returns the seeded rows.
      const { entries } = await readShowChangeFeed(showId);
      expect(entries.find((e) => e.entityRef === "Sam" && e.status === "applied")).toBeDefined();
      expect(entries.find((e) => e.status === "pending")).toBeDefined();
    });
  });
});

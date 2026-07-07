/**
 * tests/db/telemetryConsoleReads.rpc.test.ts
 *
 * The real PostgREST rpc() smoke for the two telemetry aggregate functions —
 * the CI-enforced validation-DEPLOYMENT proof (spec §14, §15 SETTLED contract).
 * Direct SQL (telemetryConsoleReads.test.ts) proves BEHAVIOR but bypasses
 * PostgREST; this exercises the real service_role rpc() path with the exact
 * runtime param names the loaders use, so a stale schema cache, param-name
 * drift, or a function missing from the target project fails here first.
 *
 * GATED: runs ONLY when RUN_VALIDATION_RPC_SMOKE is set (the x-audits
 * telemetry-rpc-smoke job sets it plus the validation secrets). It SKIPS under
 * local `pnpm test` and unit-suite (var unset), so it never breaks the
 * full-suite gate; when it runs it is FAIL-CLOSED on missing/mismatched env.
 */
import { describe, expect, it } from "vitest";
import { HEALTH_CODES, DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const DB =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const isLoopback = (s: string) => /127\.0\.0\.1|localhost/.test(s);

describe.skipIf(!process.env.RUN_VALIDATION_RPC_SMOKE)(
  "telemetry console reads — real rpc() smoke (validation-scoped)",
  () => {
    it("service_role rpc() reaches the same project's PostgREST with runtime param names", async () => {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(url && key, "SUPABASE_URL + SUPABASE_SECRET_KEY required (fail-closed)").toBeTruthy();

      // Same-project guard, fail-closed. Loopback (local supabase) has no project
      // ref: both DB and URL must be loopback. Remote (validation pooler): the
      // `postgres.<REF>@…pooler` username ref must equal the `<REF>.supabase.co` host ref.
      if (isLoopback(DB) || isLoopback(url!)) {
        expect(
          isLoopback(DB) && isLoopback(url!),
          "local DB and local SUPABASE_URL must agree",
        ).toBe(true);
      } else {
        const dbRef = /postgres\.([a-z0-9]+)@/.exec(DB)?.[1];
        const urlRef = new URL(url!).host.split(".")[0];
        expect(urlRef, "SUPABASE_URL project ref must match TEST_DATABASE_URL project").toBe(dbRef);
      }

      const supabase = createSupabaseServiceRoleClient();

      const a = await supabase.rpc("admin_event_stats_24h", {
        _now: new Date("2020-01-02T05:30:00Z").toISOString(),
      });
      expect(a.error, JSON.stringify(a.error)).toBeNull();
      expect(Array.isArray(a.data)).toBe(true);
      expect(a.data?.[0]).toHaveProperty("buckets");

      const b = await supabase.rpc("admin_alert_summary", {
        _health_codes: HEALTH_CODES,
        _degraded_codes: DEGRADED_HEALTH_CODES,
      });
      expect(b.error, JSON.stringify(b.error)).toBeNull();
      expect(b.data?.[0]).toHaveProperty("total");
    });
  },
);

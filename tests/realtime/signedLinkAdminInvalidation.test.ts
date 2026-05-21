/**
 * tests/realtime/signedLinkAdminInvalidation.test.ts (M9.5 AC-9.5-4 + AC-9.5-6)
 *
 * Verifies the realtime invalidation pathway end-to-end for the M9.5
 * admin link-rotation controls:
 *
 *   1. A viewer (anon) subscribes to the per-show invalidation channel.
 *   2. An admin (authenticated JWT carrying app_metadata.role='admin')
 *      calls issue_new_link_rpc via psql.
 *   3. The crew_member_auth UPDATE fires the
 *      publish_show_invalidation_after_statement trigger.
 *   4. The subscriber receives a broadcast event within 2 seconds.
 *
 * Auth-context contract (Codex R6 MEDIUM fix): issue_new_link_rpc
 * gates on public.is_admin(), which checks app_metadata.role=='admin'
 * OR an active admin_emails row. SERVICE-ROLE bypasses RLS but does
 * NOT satisfy is_admin(). The realtime test fires the RPC from an
 * authenticated admin context via psql + admin JWT (the same pattern
 * Tasks 1.2 + 1.3 already use); service-role is used ONLY for seed
 * and cleanup (table-level writes that don't pass through the RPC's
 * auth guard).
 *
 * Gating: describe.skipIf bypasses the test cleanly when the local
 * Supabase stack isn't up. CI runs with live infra picks it up.
 *
 * COMMIT (not ROLLBACK) in the psql block: the RPC body must commit
 * for the AFTER UPDATE trigger to fire publish_show_invalidation_
 * after_statement → realtime.send(). The try/finally cleans up the
 * seeded show row regardless.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const HAS_LIVE_INFRA = Boolean(url && serviceKey && anonKey);

const ADMIN_JWT_SUB = "00000000-0000-0000-0000-000000000020";

function jwtAdmin(): string {
  return JSON.stringify({
    sub: ADMIN_JWT_SUB,
    app_metadata: { role: "admin" },
  });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

describe.skipIf(!HAS_LIVE_INFRA)(
  "M9.5 — admin Issue-new propagates to open viewer subscription < 2s",
  () => {
    test("issue_new_link_rpc (admin JWT) fires publish_show_invalidation trigger → broadcast received", async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Seed: service-role insert of a show + crew_member_auth row.
      // These are table-level writes, not RPC-mediated; service-role
      // is appropriate here because is_admin() doesn't gate the
      // surrounding `shows`/`crew_member_auth` policies for the seed
      // write path.
      const driveFileId = `m9_5_rt_${randomUUID()}`;
      const showInsert = await admin
        .from("shows")
        .insert({
          title: "M9.5 realtime test",
          slug: driveFileId,
          drive_file_id: driveFileId,
          published: true,
        })
        .select("id")
        .single();
      if (showInsert.error || !showInsert.data) {
        throw new Error(`show seed failed: ${showInsert.error?.message}`);
      }
      const showId = showInsert.data.id as string;
      const crewName = `Realtime Alice ${randomUUID()}`;

      const authInsert = await admin
        .from("crew_member_auth")
        .insert({ show_id: showId, crew_name: crewName });
      if (authInsert.error) {
        throw new Error(
          `crew_member_auth seed failed: ${authInsert.error.message}`,
        );
      }

      try {
        const anon = createClient(url!, anonKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const channel = anon.channel(`show:${showId}:invalidation`, {
          config: { broadcast: { self: false }, private: true },
        });

        const eventReceived = new Promise<{ event: string }>(
          (resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    "realtime invalidation event not received within 2000ms",
                  ),
                ),
              2_000,
            );
            channel.on("broadcast", { event: "invalidate" }, (payload) => {
              clearTimeout(timeout);
              resolve({ event: payload.event ?? "(no event field)" });
            });
            channel.subscribe((status) => {
              if (status === "SUBSCRIBED") {
                // Fire the admin Issue-new via psql + admin JWT. Service-
                // role does NOT satisfy is_admin() (R6 MEDIUM). Assert
                // status='ok' BEFORE waiting on the broadcast so an
                // auth failure surfaces immediately instead of timing
                // out at 2s.
                let out: string;
                try {
                  out = runPsql(`
                    begin;
                    set local role authenticated;
                    set local request.jwt.claims = '${jwtAdmin()}';
                    select 'result=' || (
                      public.issue_new_link_rpc(
                        ${sqlString(showId)}::uuid,
                        ${sqlString(crewName)}
                      )
                    )::text;
                    commit;
                  `);
                } catch (err) {
                  clearTimeout(timeout);
                  reject(
                    err instanceof Error
                      ? err
                      : new Error(`psql failed: ${String(err)}`),
                  );
                  return;
                }
                if (!out.includes('"status" : "ok"')) {
                  clearTimeout(timeout);
                  reject(
                    new Error(
                      `RPC did not return ok status; psql output: ${out}`,
                    ),
                  );
                }
              }
            });
          },
        );

        const evt = await eventReceived;
        expect(evt.event).toBe("invalidate");
      } finally {
        await admin.from("shows").delete().eq("id", showId);
      }
    }, 10_000);
  },
);

/**
 * tests/realtime/signedLinkAdminInvalidation.test.ts (M9.5 AC-9.5-4 + AC-9.5-6)
 *
 * Verifies the realtime invalidation pathway end-to-end for the M9.5
 * admin link-rotation controls:
 *
 *   1. A subscriber authenticates against the private realtime channel
 *      using a subscriber-token JWT that matches the production shape
 *      minted by app/api/realtime/subscriber-token/route.ts (claims:
 *      show_id + sub=<admin> + role=authenticated + viewer_kind=admin,
 *      HS256 against SUPABASE_JWT_SECRET).
 *   2. supabase.realtime.setAuth(jwt) is called BEFORE the
 *      `show:<id>:invalidation` channel is opened private:true
 *      (mirrors lib/realtime/subscribeToShow.ts).
 *   3. An admin (authenticated DB JWT carrying app_metadata.role='admin')
 *      calls issue_new_link_rpc via psql.
 *   4. The crew_member_auth UPDATE fires the
 *      publish_show_invalidation_after_statement trigger.
 *   5. The subscriber receives a broadcast event within 2 seconds.
 *
 * Codex R3 MEDIUM-1 fix: the prior implementation subscribed via an
 * anon client with no setAuth call, so the realtime.messages RLS
 * policy (to authenticated) would deny the subscription and the test
 * would fail-by-timeout (indistinguishable from "trigger never fired").
 * Now mints the production-shape subscriber JWT and authenticates
 * before subscribing.
 *
 * Codex R3 MEDIUM-1 fix (b): show seed now includes client_label and
 * template_version (both NOT NULL on public.shows). A live-infra run
 * with the prior seed would have failed before the RPC was invoked.
 *
 * Auth-context contract (Codex R6 MEDIUM lineage from prior round):
 * issue_new_link_rpc gates on public.is_admin(); SERVICE-ROLE bypasses
 * RLS but does NOT satisfy is_admin(). The realtime test fires the
 * RPC from an authenticated admin context via psql + admin JWT (the
 * same pattern Tasks 1.2 + 1.3 use); service-role is used ONLY for
 * seed and cleanup.
 *
 * Gating: describe.skipIf bypasses the test when any of the live-infra
 * env vars are missing — including SUPABASE_JWT_SECRET +
 * SUPABASE_REALTIME_ISS which mint the subscriber JWT.
 *
 * COMMIT (not ROLLBACK) in the psql block: the AFTER UPDATE trigger
 * fires at commit time. The try/finally cleans up the seeded show row.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const realtimeJwtSecret = process.env.SUPABASE_JWT_SECRET;
const realtimeIssuer = process.env.SUPABASE_REALTIME_ISS;
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// All five env vars must be present for the test to exercise the
// production realtime path end-to-end. Missing any one fails open
// (skip) so local runs without the full stack don't false-negative.
const HAS_LIVE_INFRA = Boolean(
  url && serviceKey && anonKey && realtimeJwtSecret && realtimeIssuer,
);

const ADMIN_JWT_SUB = "00000000-0000-0000-0000-000000000020";

function adminClaims(): string {
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

async function mintSubscriberJwt(showId: string): Promise<string> {
  // Mirrors app/api/realtime/subscriber-token/route.ts EXACTLY:
  //   { show_id, sub: '<admin>', role: 'authenticated', viewer_kind: 'admin' }
  // signed HS256 against SUPABASE_JWT_SECRET, iss=SUPABASE_REALTIME_ISS.
  const exp = Math.floor(Date.now() / 1000) + 5 * 60;
  return new SignJWT({
    show_id: showId,
    role: "authenticated",
    viewer_kind: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("<admin>")
    .setIssuer(realtimeIssuer!)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(realtimeJwtSecret!));
}

describe.skipIf(!HAS_LIVE_INFRA)(
  "M9.5 — admin Issue-new propagates to open viewer subscription < 2s",
  () => {
    test("issue_new_link_rpc fires publish_show_invalidation trigger → authenticated private subscriber receives broadcast", async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Seed shows row with ALL NOT NULL columns (Codex R3 MEDIUM-1
      // fix part b): title, slug, drive_file_id, client_label,
      // template_version, published.
      const driveFileId = `m9_5_rt_${randomUUID()}`;
      const showInsert = await admin
        .from("shows")
        .insert({
          title: "M9.5 realtime test",
          slug: driveFileId,
          drive_file_id: driveFileId,
          client_label: "FXAV",
          template_version: "test",
          published: true,
        })
        .select("id")
        .single();
      if (showInsert.error || !showInsert.data) {
        throw new Error(`show seed failed: ${showInsert.error?.message}`);
      }
      const showId = showInsert.data.id as string;
      const crewName = `Realtime Alice ${randomUUID()}`;

      // R2 HIGH-1 fix: the active-roster gate in both RPCs requires
      // a matching public.crew_members row inside the advisory lock.
      const memberInsert = await admin
        .from("crew_members")
        .insert({ show_id: showId, name: crewName, role: "LEAD" });
      if (memberInsert.error) {
        throw new Error(
          `crew_members seed failed: ${memberInsert.error.message}`,
        );
      }

      const authInsert = await admin
        .from("crew_member_auth")
        .insert({ show_id: showId, crew_name: crewName });
      if (authInsert.error) {
        throw new Error(
          `crew_member_auth seed failed: ${authInsert.error.message}`,
        );
      }

      try {
        // Codex R3 MEDIUM-1 fix part a: subscribe via an authenticated
        // realtime session, NOT an anon client. Mirrors the production
        // path in lib/realtime/subscribeToShow.ts which mints the JWT
        // via /api/realtime/subscriber-token then calls
        // supabase.realtime.setAuth(jwt) BEFORE opening the channel.
        const subscriberJwt = await mintSubscriberJwt(showId);
        const subscriber = createClient(url!, anonKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        subscriber.realtime.setAuth(subscriberJwt);

        const channel = subscriber.channel(`show:${showId}:invalidation`, {
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
            channel.subscribe((status, err) => {
              if (status === "SUBSCRIBED") {
                let out: string;
                try {
                  out = runPsql(`
                    begin;
                    set local role authenticated;
                    set local request.jwt.claims = '${adminClaims()}';
                    select 'result=' || (
                      public.issue_new_link_rpc(
                        ${sqlString(showId)}::uuid,
                        ${sqlString(crewName)}
                      )
                    )::text;
                    commit;
                  `);
                } catch (psqlErr) {
                  clearTimeout(timeout);
                  reject(
                    psqlErr instanceof Error
                      ? psqlErr
                      : new Error(`psql failed: ${String(psqlErr)}`),
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
                return;
              }
              // Codex R3 recommendation: non-SUBSCRIBED terminal
              // statuses MUST fail immediately so authorization
              // regressions cannot masquerade as 2s timeouts. The
              // production statuses Realtime emits are:
              //   SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR
              if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              ) {
                clearTimeout(timeout);
                reject(
                  new Error(
                    `realtime subscription failed with status=${status}${
                      err ? ` (err: ${err.message ?? String(err)})` : ""
                    }`,
                  ),
                );
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

/**
 * scripts/ci/realtime-relay-diagnostic.ts — TEMPORARY CI diagnostic (PR #505).
 *
 * Ground-truth probe of the DB→Realtime broadcast relay inside the CI stack,
 * with no app server involved: subscribe to a private channel over ws with the
 * service key, call publish_show_invalidation(), and report whether the frame
 * arrives, plus realtime.messages row counts and replication-slot state.
 * Non-fatal: exits 0 always; the workflow step prints its output for triage.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false);

async function main(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { execFileSync } = await import("node:child_process");
  const { seedShowWithCrew, deleteSeededShow } =
    await import("../../tests/e2e/helpers/seedShowWithCrew");
  const { admin } = await import("../../tests/e2e/helpers/supabaseAdmin");
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const dbUrl =
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const psql = (sql: string): string => {
    try {
      return execFileSync("psql", [dbUrl, "-t", "-A", "-c", sql], { encoding: "utf8" }).trim();
    } catch (err) {
      return `psql failed: ${String(err).slice(0, 120)}`;
    }
  };
  console.log(
    "[diag] realtime.messages partitions/rows:",
    psql("select count(*) from realtime.messages;"),
  );
  console.log(
    "[diag] replication slots:",
    psql("select slot_name, active, wal_status from pg_replication_slots;"),
  );
  console.log("[diag] wal_level:", psql("show wal_level;"));
  console.log(
    "[diag] realtime schema functions:",
    psql(
      "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='realtime' and proname in ('send','broadcast_changes');",
    ),
  );

  const seeded = await seedShowWithCrew({ crew: [{ name: "Diag", role: "DiagRole" }] });
  const { default: WS } = await import("ws");
  const client = createClient(url, key, {
    realtime: { transport: WS as unknown as typeof WebSocket },
  });
  try {
    await client.realtime.setAuth(key);
    let frameAt: number | undefined;
    const channel = client.channel(`show:${seeded.showId}:invalidation`, {
      config: { private: true, broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "invalidate" }, () => {
      frameAt = Date.now();
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("subscribe timeout")), 15_000);
      channel.subscribe((status) => {
        console.log("[diag] channel status:", status);
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(t);
          reject(new Error(`subscribe failed: ${status}`));
        }
      });
    });
    const before = psql("select count(*) from realtime.messages;");
    const commitAt = Date.now();
    const rpcRes = await admin.rpc("publish_show_invalidation", { p_show_id: seeded.showId });
    console.log("[diag] publish rpc error:", rpcRes.error?.message ?? "none");
    const deadline = Date.now() + 10_000;
    while (!frameAt && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log("[diag] realtime.messages rows before publish:", before);
    console.log(
      "[diag] realtime.messages rows after publish:",
      psql("select count(*) from realtime.messages;"),
    );
    console.log(
      "[diag] latest message row:",
      psql(
        "select topic, extension, inserted_at from realtime.messages order by inserted_at desc limit 1;",
      ),
    );
    console.log("[diag] frame delivered:", frameAt ? `${frameAt - commitAt}ms` : "NO FRAME in 10s");
    console.log(`[diag] RELAY RESULT: ${frameAt ? "DELIVERED" : "UNDELIVERED"}`);
  } finally {
    await deleteSeededShow(seeded.driveFileId);
    try {
      await client.realtime.disconnect();
    } catch {
      // teardown noise is irrelevant to the diagnostic
    }
  }
}

main()
  .catch((err) => {
    console.error("[diag] fault:", err);
  })
  .finally(() => {
    // Diagnostic never fails the workflow.
    process.exit(0);
  });

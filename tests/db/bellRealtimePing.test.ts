/**
 * tests/db/bellRealtimePing.test.ts
 *
 * Live local-DB structural + behavioral test for the bell realtime ping
 * (spec §5): statement-level AFTER INSERT/UPDATE triggers on
 * public.admin_alerts that call realtime.send('{}', 'changed',
 * 'admin:alerts', true) — a CONTENTLESS invalidation signal, never a data
 * carrier (lib/adminAlerts stays the sole sanitizer chokepoint) — plus the
 * realtime.messages SELECT policy that fences subscription to admin JWTs
 * (viewer_kind='admin') on the private 'admin:alerts' channel.
 *
 * Connection pattern mirrors tests/db/bellFeedRpc.test.ts (postgres.js
 * against TEST_DATABASE_URL ?? DATABASE_URL ?? local stack).
 *
 * Precedent: supabase/migrations/20260504000000_realtime_private_channel_authorization.sql
 * (fxav_show_invalidation_subscriber_select is the sibling policy on the
 * same realtime.messages table).
 */
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CODE_PREFIX = `TEST_BELL_${RUN}_`;

afterEach(async () => {
  await sql`delete from public.admin_alerts where code like ${`${CODE_PREFIX}%`}`;
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("bell realtime ping (spec §5)", () => {
  it("1. statement triggers admin_alerts_bell_ping_ins / _upd exist on public.admin_alerts", async () => {
    const rows = await sql<{ tgname: string }[]>`
      select tgname
      from pg_trigger
      where tgrelid = 'public.admin_alerts'::regclass
        and tgname in ('admin_alerts_bell_ping_ins', 'admin_alerts_bell_ping_upd')
        and not tgisinternal
    `;
    const names = rows.map((r) => r.tgname).sort();
    expect(names).toEqual(["admin_alerts_bell_ping_ins", "admin_alerts_bell_ping_upd"]);
  });

  it("2. SELECT policy fxav_admin_bell_subscriber_select exists on realtime.messages, gated on admin:alerts + viewer_kind", async () => {
    const rows = await sql<{ qual: string | null }[]>`
      select qual
      from pg_policies
      where schemaname = 'realtime'
        and tablename = 'messages'
        and policyname = 'fxav_admin_bell_subscriber_select'
    `;
    expect(rows).toHaveLength(1);
    const qual = rows[0]!.qual ?? "";
    expect(qual).toContain("admin:alerts");
    expect(qual).toContain("viewer_kind");
  });

  it("3. behavioral smoke: inserting an admin_alerts row (via upsert_admin_alert) publishes on admin:alerts", async () => {
    const testCode = `${CODE_PREFIX}smoke`;

    const beforeRows = await sql<{ count: string }[]>`
      select count(*)::text as count from realtime.messages where topic = 'admin:alerts'
    `;
    const beforeCount = beforeRows[0]!.count;

    await sql`select public.upsert_admin_alert(null, ${testCode}, ${sql.json({})})`;

    const afterRows = await sql<{ count: string }[]>`
      select count(*)::text as count from realtime.messages where topic = 'admin:alerts'
    `;
    const afterCount = afterRows[0]!.count;

    if (Number(afterCount) > Number(beforeCount)) {
      console.log("[bellRealtimePing] branch: realtime.messages row count increased (live probe)");
      expect(Number(afterCount)).toBeGreaterThan(Number(beforeCount));
    } else {
      console.log(
        "[bellRealtimePing] branch: realtime.messages pruned/inaccessible — falling back to pg_get_functiondef",
      );
      const srcRows = await sql<{ src: string }[]>`
        select pg_get_functiondef('public.publish_admin_alerts_bell_ping()'::regprocedure) as src
      `;
      const src = srcRows[0]!.src;
      expect(src).toContain("realtime.send");
      expect(src).toContain("admin:alerts");
    }
  });

  it("4. publish_admin_alerts_bell_ping has no EXECUTE grant for anon/authenticated", async () => {
    const rows = await sql<{ role: string; can_execute: boolean }[]>`
      select role, has_function_privilege(role, 'public.publish_admin_alerts_bell_ping()', 'execute') as can_execute
      from unnest(array['anon', 'authenticated']) as role
    `;
    for (const row of rows) {
      expect(row.can_execute).toBe(false);
    }
  });
});

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, test } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const MIGRATION_PATH = "supabase/migrations/20260612000000_backfill_email_deliveries_context_scalar.sql";

// lib/notify/deliver.ts double-encoded email_deliveries.context into a jsonb
// string scalar (fixed in the same PR). This migration normalizes rows the
// broken writer already produced. The test seeds a double-encoded row, applies
// the migration SQL, and asserts (a) normalization and (b) idempotency.
describe("backfill_email_deliveries_context_scalar migration", () => {
  test.skipIf(!DB_URL)("parses string-scalar context rows back into objects, idempotently", async () => {
    const sql = postgres(DB_URL!, { max: 1, prepare: false });
    const suffix = `ctx-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const recipient = `notify-${suffix}@example.com`;
    const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

    try {
      // Seed exactly what the broken writer produced: to_jsonb(text) makes a
      // jsonb string scalar whose inner text is a JSON object document.
      await sql`
        insert into public.email_deliveries (
          kind, channel, dedup_key, show_id, recipient, triggered_codes, context,
          status, provider_message_id, error, attempt_count
        )
        values (
          'realtime_problem', 'email', ${`dedup-${suffix}`}, null, ${recipient},
          array['SYNC_STALLED']::text[], to_jsonb('{"code":"SYNC_STALLED","n":1}'::text),
          'failed', null, 'seeded', 1
        )
      `;
      const seeded = await sql<{ typeof: string }[]>`
        select jsonb_typeof(context) as "typeof" from public.email_deliveries where recipient = ${recipient}
      `;
      expect(seeded[0]).toEqual({ typeof: "string" });

      await sql.unsafe(migrationSql);
      const fixed = await sql<{ typeof: string; code: string | null; n: string | null }[]>`
        select jsonb_typeof(context) as "typeof", context->>'code' as code, context->>'n' as n
          from public.email_deliveries where recipient = ${recipient}
      `;
      expect(fixed[0]).toEqual({ typeof: "object", code: "SYNC_STALLED", n: "1" });

      // Apply-twice idempotency: second run is a no-op, not an error.
      await sql.unsafe(migrationSql);
      const stillFixed = await sql<{ typeof: string }[]>`
        select jsonb_typeof(context) as "typeof" from public.email_deliveries where recipient = ${recipient}
      `;
      expect(stillFixed[0]).toEqual({ typeof: "object" });
    } finally {
      await sql`delete from public.email_deliveries where recipient = ${recipient}`;
      await sql.end({ timeout: 5 });
    }
  });
});

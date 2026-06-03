import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";

import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";

const DB_URL = process.env.TEST_DATABASE_URL;

describe("deliverRealtimeCandidates real DB sent-race guard", () => {
  test.skipIf(!DB_URL)(
    "treats a zero-row failed-ledger upsert as a sent-race skip without EMAIL_DELIVERY_FAILED",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `deliver-sent-race-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const recipient = `notify-${suffix}@example.com`;
      let showId: string | undefined;

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${driveFileId}, ${`show-${suffix}`}, 'Sent Race Show', 'Client', 'v4', true, false)
          returning id
        `;
        showId = show!.id;
        const [alert] = await sql<{ id: string; us: string }[]>`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values (${showId}::uuid, 'SHEET_UNAVAILABLE', '{"sheet_name":"Sent Race Show"}'::jsonb, now() - interval '2 hours')
          returning id, (floor(extract(epoch from raised_at) * 1e6)::bigint)::text as us
        `;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

        const dedupKey = `${showId}:SHEET_UNAVAILABLE:${alert!.us}`;
        const candidate: RealtimeCandidate = {
          kind: "show",
          dedupKey,
          alertId: alert!.id,
          showId,
          code: "SHEET_UNAVAILABLE",
          raisedAt: new Date(),
          slug: `show-${suffix}`,
          showTitle: "Sent Race Show",
          contextSheetName: "Sent Race Show",
        };
        let insertedSentRaceRow = false;
        const raceSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
          if (
            !insertedSentRaceRow &&
            /insert\s+into\s+public\.email_deliveries/i.test(text) &&
            /status\s*=\s*'failed'/i.test(text)
          ) {
            insertedSentRaceRow = true;
            await sql`
              insert into public.email_deliveries (
                kind, channel, dedup_key, show_id, recipient, triggered_codes, context,
                status, provider_message_id, error, attempt_count, sent_at
              )
              values (
                'realtime_problem', 'email', ${dedupKey}, ${showId!}::uuid, ${recipient},
                array['SHEET_UNAVAILABLE']::text[], '{}'::jsonb, 'sent', 'race-winner',
                null, 0, now()
              )
            `;
          }
          return await (sql as unknown as DeliverySql)(strings, ...values);
        }) as DeliverySql;

        const result = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: "https://crew.fxav.app" },
          {
            sql: raceSql,
            sendEmail: vi.fn(async () => ({
              ok: false as const,
              kind: "infra_error" as const,
              message: "provider down",
            })),
          },
        );

        expect(result).toEqual({ kind: "ok", sent: 0, failed: 0, skipped: 1, retryLater: 0 });
        const deliveryFailed = await sql<{ occurrence_count: number }[]>`
          select occurrence_count
            from public.admin_alerts
           where show_id = ${showId}::uuid
             and code = 'EMAIL_DELIVERY_FAILED'
             and resolved_at is null
        `;
        expect(deliveryFailed).toHaveLength(0);
      } finally {
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.admin_emails where email = ${recipient}`;
        if (showId) {
          await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
        }
        await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});

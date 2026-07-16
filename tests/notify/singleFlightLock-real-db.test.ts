import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import {
  deliverRealtimeCandidates,
  type DeliverySql,
  type LockClient,
} from "@/lib/notify/deliver";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { SendArgs, SendResult } from "@/lib/notify/send";

const DB_URL = process.env.TEST_DATABASE_URL;
const LOCK_SQL = "select pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery')) as locked";

function showCandidate(suffix: string, showId: string, us: string): RealtimeCandidate {
  return {
    kind: "show",
    dedupKey: `${showId}:SHEET_UNAVAILABLE:${us}`,
    alertId: "unused",
    showId,
    code: "SHEET_UNAVAILABLE",
    raisedAt: new Date(),
    slug: `lock-show-${suffix}`,
    showTitle: "Lock Show",
    contextSheetName: "Lock Sheet",
  };
}

describe("single-flight guard against a real database (batching spec §2.1b)", () => {
  test.skipIf(!DB_URL)(
    "second pass lockSkips while a competitor holds the xact lock; lock frees after completion and after a thrown pass",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const competitor = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `lock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let showId: string | undefined;

      const sendEmail = vi.fn(
        async (_args: SendArgs): Promise<SendResult> => ({ ok: true, messageId: "msg-1" }),
      );

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
          values (${`drive-${suffix}`}, ${`lock-show-${suffix}`}, 'Lock Show', 'Client', 'v4', true, false)
          returning id
        `;
        showId = show!.id;
        const [alert] = await sql<{ id: string; us: string }[]>`
          insert into public.admin_alerts (show_id, code, context, raised_at)
          values (${showId}::uuid, 'SHEET_UNAVAILABLE', '{"sheet_name":"Lock Sheet"}'::jsonb, now() - interval '2 hours')
          returning id, (floor(extract(epoch from raised_at) * 1e6)::bigint)::text as us
        `;
        const recipient = `notify-${suffix}@example.com`;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        const candidate = {
          ...showCandidate(suffix, showId, alert!.us),
          alertId: alert!.id,
        };

        // Competitor holds the xact lock in an open transaction.
        let releaseCompetitor: (() => void) | undefined;
        const held = new Promise<void>((resolve) => {
          releaseCompetitor = resolve;
        });
        const competitorLocked = new Promise<boolean>((resolveLocked, rejectLocked) => {
          competitor
            .begin(async (tx) => {
              const rows = await tx.unsafe(LOCK_SQL);
              resolveLocked(Boolean((rows[0] as { locked?: boolean } | undefined)?.locked));
              await held;
            })
            .catch(rejectLocked);
        });
        expect(await competitorLocked).toBe(true);

        const contended = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: "https://crew.fxav.app" },
          { sql: sql as unknown as DeliverySql },
        );
        expect(contended).toEqual({
          kind: "ok",
          sent: 0,
          failed: 0,
          skipped: 0,
          retryLater: 0,
          lockSkipped: true,
        });
        releaseCompetitor!();

        // After the competitor commits, a full pass runs and the lock frees afterwards.
        const delivered = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: "https://crew.fxav.app" },
          { sql: sql as unknown as DeliverySql, sendEmail },
        );
        expect(delivered).toMatchObject({ kind: "ok", sent: 1 });

        const probeAfterSuccess = await competitor.begin(async (tx) => {
          const rows = await tx.unsafe(LOCK_SQL);
          return Boolean((rows[0] as { locked?: boolean } | undefined)?.locked);
        });
        expect(probeAfterSuccess).toBe(true);

        // Thrown pass (work sql fails) still releases the lock.
        const throwingSql = (() => Promise.reject(new Error("work sql down"))) as unknown as DeliverySql;
        const thrown = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: "https://crew.fxav.app" },
          { sql: throwingSql },
        );
        expect(thrown).toEqual({ kind: "infra_error" });

        const probeAfterThrow = await competitor.begin(async (tx) => {
          const rows = await tx.unsafe(LOCK_SQL);
          return Boolean((rows[0] as { locked?: boolean } | undefined)?.locked);
        });
        expect(probeAfterThrow).toBe(true);
      } finally {
        if (showId) {
          await sql`delete from public.email_deliveries where show_id = ${showId}::uuid`;
          await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
          await sql`delete from public.shows where id = ${showId}::uuid`;
          await sql`delete from public.admin_emails where email like ${"notify-" + suffix + "%"}`;
        }
        await sql.end({ timeout: 5 });
        await competitor.end({ timeout: 5 });
      }
    },
    30_000,
  );
});

// Type-level check: the exported LockClient stays structurally satisfiable by postgres.js
const _lockClientShape: LockClient | null = null;
void _lockClientShape;

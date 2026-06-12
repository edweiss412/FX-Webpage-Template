/**
 * tests/notify/run-notify-toggle-gate-real-db.test.ts (M12.13 Task 9 — spec
 * §4.2 + §4.5 negative coverage)
 *
 * End-to-end OFF suppression with the REAL persisted toggle (not a mocked
 * getter): `app_settings.alert_on_auto_publish` is written false via SQL, the
 * REAL detector finds a live undo candidate, and `runRealtimeNotify` (reading
 * the toggle through the REAL `getAlertOnAutoPublish` service-role getter)
 * drops it as a deliberate skip — no toggleFaults, no delivery attempt.
 *
 * Requires the LOCAL stack: the postgres seed path (TEST_DATABASE_URL) and the
 * getter's REST path (SUPABASE_URL, defaulting to http://127.0.0.1:54321) must
 * target the SAME database, which only holds for the local 127.0.0.1 stack.
 */
import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";

import { listRealtimeCandidates, type CandidateSql } from "@/lib/notify/detect/candidates";
import { runRealtimeNotify } from "@/lib/notify/runNotify";

const DB_URL = process.env.TEST_DATABASE_URL;
const REST_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_STACK =
  !!DB_URL && /127\.0\.0\.1|localhost/.test(DB_URL) && /127\.0\.0\.1|localhost/.test(REST_URL);

describe("alert_on_auto_publish OFF suppresses undo delivery end-to-end (real persisted toggle)", () => {
  test.skipIf(!LOCAL_STACK)(
    "persisted false toggle → detector still finds the candidate → runRealtimeNotify drops it deliberately",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-toggle-off-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const token = "78787878-7878-4878-8878-787878787878";
      let showId: string | undefined;
      let priorToggle: boolean | null = null;

      try {
        const [settings] = await sql<{ alert_on_auto_publish: boolean }[]>`
          select alert_on_auto_publish from public.app_settings where id = 'default'
        `;
        expect(settings).toBeDefined();
        priorToggle = settings!.alert_on_auto_publish;
        await sql`update public.app_settings set alert_on_auto_publish = false where id = 'default'`;

        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${driveFileId}, ${`show-${suffix}`}, 'Toggle Gate Show', 'Client', 'v4', true, false, ${token}::uuid, ${new Date(Date.now() + 12 * 3_600_000)})
          returning id
        `;
        showId = show!.id;

        // The REAL detector finds the candidate — suppression is the gate's
        // job, never the detector's. Scope to this test's show so residue
        // rows from sibling suites cannot blur the assertion.
        const detected = await listRealtimeCandidates(sql as unknown as CandidateSql);
        expect(detected.kind).toBe("ok");
        if (detected.kind !== "ok") throw new Error("detection failed");
        const mine = detected.candidates.filter(
          (c) => c.kind === "auto_publish_undo" && c.showId === showId,
        );
        expect(mine).toHaveLength(1);

        const deliver = vi.fn(async () => ({
          kind: "ok" as const,
          sent: 0,
          failed: 0,
          skipped: 0,
          retryLater: 0,
        }));
        const result = await runRealtimeNotify({
          deps: {
            // getAlertOnAutoPublish deliberately OMITTED — the REAL getter
            // reads the persisted false through the service-role client.
            runMaintenance: async () => [],
            configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
            getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
            activeRecipients: async () => ({
              kind: "ok",
              recipients: [`notify-${suffix}@example.com`],
            }),
            listRealtimeCandidates: async () => ({ kind: "ok", candidates: mine }),
            deliverRealtimeCandidates: deliver,
          },
        });

        // Dropped as a DELIBERATE skip: the undo skip reason, no toggleFaults
        // (OFF is not a fault — statusFor keeps the scheduler at 200), and no
        // delivery attempt for the bearer-token email.
        expect(result.delivery).toEqual({ kind: "skipped", reason: "alert_on_auto_publish_off" });
        expect(deliver).not.toHaveBeenCalled();
      } finally {
        if (priorToggle !== null) {
          await sql`update public.app_settings set alert_on_auto_publish = ${priorToggle} where id = 'default'`;
        }
        if (showId) {
          await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
        }
        await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});

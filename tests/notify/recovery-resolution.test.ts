import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";
import {
  resolveRecoveredSyncProblemAlert,
  STATUS_TO_CODE,
  type RecoveryResolutionSql,
} from "@/lib/notify/detect/recoveryResolution";

function fakeSql(rows: Array<Record<string, unknown>> = []) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: String.raw(strings, ...values.map((_value, index) => `$${index + 1}`)),
      values,
    });
    return Promise.resolve(rows);
  }) as unknown as RecoveryResolutionSql;
  return { sql, calls };
}

describe("notify recovery-resolution status map", () => {
  test("maps last_sync_status buckets to catalog codes and never raw causes", () => {
    expect(STATUS_TO_CODE).toEqual({
      drive_error: "DRIVE_FETCH_FAILED",
      parse_error: "PARSE_ERROR_LAST_GOOD",
      sheet_unavailable: "SHEET_UNAVAILABLE",
    });
    expect(Object.values(STATUS_TO_CODE)).not.toContain("SYNC_FILE_FAILED");
    expect(Object.values(STATUS_TO_CODE)).not.toContain("STAGED_PARSE_SOURCE_GONE");
  });

  test("conditional resolve fires when current show status no longer maps to the alert code", async () => {
    const { sql, calls } = fakeSql([{ id: "alert-1" }]);

    await expect(
      resolveRecoveredSyncProblemAlert(
        { alertId: "alert-1", showId: "show-1", code: "DRIVE_FETCH_FAILED" },
        sql,
      ),
    ).resolves.toEqual({ kind: "ok", resolved: true });

    expect(calls[0]?.values).toEqual(["alert-1", "show-1", "DRIVE_FETCH_FAILED"]);
    expect(calls[0]?.text).toMatch(
      /update\s+public\.admin_alerts\s+set\s+resolved_at\s*=\s*now\(\)/i,
    );
    expect(calls[0]?.text).toMatch(/case\s+s\.last_sync_status/i);
    expect(calls[0]?.text).toMatch(/when\s+'drive_error'\s+then\s+'DRIVE_FETCH_FAILED'/i);
    expect(calls[0]?.text).toMatch(/when\s+'parse_error'\s+then\s+'PARSE_ERROR_LAST_GOOD'/i);
    expect(calls[0]?.text).toMatch(/when\s+'sheet_unavailable'\s+then\s+'SHEET_UNAVAILABLE'/i);
    expect(calls[0]?.text).not.toMatch(/last_sync_error/i);
  });

  test("conditional resolve no-ops when a concurrent/current show status still maps to that code", async () => {
    const { sql } = fakeSql([]);

    await expect(
      resolveRecoveredSyncProblemAlert(
        { alertId: "alert-1", showId: "show-1", code: "DRIVE_FETCH_FAILED" },
        sql,
      ),
    ).resolves.toEqual({ kind: "ok", resolved: false });
  });

  test("code switch resolves the old code because the current status maps to a different code", async () => {
    const { sql, calls } = fakeSql([{ id: "alert-1" }]);

    await resolveRecoveredSyncProblemAlert(
      { alertId: "alert-1", showId: "show-1", code: "DRIVE_FETCH_FAILED" },
      sql,
    );

    expect(calls[0]?.text).toMatch(/case\s+s\.last_sync_status[\s\S]*=\s+\$3/i);
  });

  test("sheet_unavailable covers source-gone raw causes through the status-only map", async () => {
    const { sql, calls } = fakeSql([]);

    await resolveRecoveredSyncProblemAlert(
      { alertId: "alert-1", showId: "show-1", code: "SHEET_UNAVAILABLE" },
      sql,
    );

    expect(calls[0]?.values).toEqual(["alert-1", "show-1", "SHEET_UNAVAILABLE"]);
    expect(calls[0]?.text).toMatch(/when\s+'sheet_unavailable'\s+then\s+'SHEET_UNAVAILABLE'/i);
    expect(calls[0]?.text).not.toMatch(/STAGED_PARSE_SOURCE_GONE|last_sync_error/i);
  });

  test("thrown SQL fault returns infra_error and never throws", async () => {
    const sql = vi.fn(() =>
      Promise.reject(new Error("db down")),
    ) as unknown as RecoveryResolutionSql;

    await expect(
      resolveRecoveredSyncProblemAlert(
        { alertId: "alert-1", showId: "show-1", code: "DRIVE_FETCH_FAILED" },
        sql,
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });
});

const DB_URL = process.env.TEST_DATABASE_URL;

describe("notify recovery-resolution real DB race", () => {
  test.skipIf(!DB_URL)(
    "two-connection race: conditional resolve does not clobber a concurrently re-set current alert",
    async () => {
      const sql1 = postgres(DB_URL!, { max: 1, prepare: false });
      const sql2 = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const slug = `slug-${suffix}`;

      try {
        const [show] = await sql1<{ id: string }[]>`
          insert into public.shows (
            drive_file_id, slug, title, client_label, template_version, last_sync_status
          )
          values (${driveFileId}, ${slug}, 'Recovery Race', 'Client', 'v4', 'ok')
          returning id
        `;
        const [alert] = await sql1<{ id: string }[]>`
          insert into public.admin_alerts (show_id, code, context)
          values (${show!.id}::uuid, 'DRIVE_FETCH_FAILED', '{}'::jsonb)
          returning id
        `;

        await sql2`
          update public.shows
             set last_sync_status = 'drive_error',
                 last_sync_error = 'SYNC_FILE_FAILED'
           where id = ${show!.id}::uuid
        `;

        await expect(
          resolveRecoveredSyncProblemAlert(
            { alertId: alert!.id, showId: show!.id, code: "DRIVE_FETCH_FAILED" },
            sql1 as unknown as RecoveryResolutionSql,
          ),
        ).resolves.toEqual({ kind: "ok", resolved: false });

        const [row] = await sql1<{ resolved_at: Date | null }[]>`
          select resolved_at from public.admin_alerts where id = ${alert!.id}::uuid
        `;
        expect(row?.resolved_at).toBeNull();
      } finally {
        await sql1`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql1.end({ timeout: 5 });
        await sql2.end({ timeout: 5 });
      }
    },
  );
});

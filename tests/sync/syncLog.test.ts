import { describe, expect, test, vi } from "vitest";
import { makePostgresSyncLogSink } from "@/lib/sync/syncLog";

describe("sync_log sink", () => {
  test("writes structured pipeline outcomes into the existing sync_log schema", async () => {
    const unsafe = vi.fn(async () => []);
    const sink = makePostgresSyncLogSink({ unsafe });

    await sink({
      driveFileId: "file-1",
      outcome: "skipped",
      code: "WEBHOOK_NOOP_ALREADY_SYNCED",
      payload: { kind: "watermark", modifiedTime: "2026-05-09T12:00:00.000Z" },
    });

    expect(unsafe).toHaveBeenCalledWith(expect.stringContaining("insert into public.sync_log"), [
      "file-1",
      "WEBHOOK_NOOP_ALREADY_SYNCED",
      "skipped:WEBHOOK_NOOP_ALREADY_SYNCED",
      // Raw array (NOT JSON.stringify'd): postgres.js serializes a `$N::jsonb`
      // param exactly once via the cast; pre-serializing here would
      // double-encode it into a jsonb string scalar.
      [
        {
          kind: "watermark",
          modifiedTime: "2026-05-09T12:00:00.000Z",
          outcome: "skipped",
          code: "WEBHOOK_NOOP_ALREADY_SYNCED",
        },
      ],
      // duration_ms: this entry carries no attempt boundary, so it persists as NULL.
      null,
    ]);
  });
});

// Task 1 (2026-08-09 sync-log show attribution): the sink resolves show_id from
// drive_file_id at write time and persists duration_ms. Both columns are declared
// in master spec §12 and were written by no routine writer — `pnpm observe synclog
// --show <uuid>` returned nothing for every show (probe: 5073 rows, count(show_id) = 0).
describe("sync_log sink — show attribution and duration (spec §3.1, §3.3)", () => {
  // normalize(): strip `--` comments FIRST, then collapse whitespace. Both steps are
  // mandatory — the shipped statement carries an explanatory comment, so a
  // whitespace-only normalizer fails on correct code, and a comment-blind one lets a
  // commented-out subselect satisfy the assertion.
  const normalize = (raw: string) =>
    raw
      .replace(/--[^\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  test("resolves show_id by subselect and binds duration_ms — exact statement, not containment", async () => {
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });

    await sink({ driveFileId: "file-1", outcome: "applied", durationMs: 42 } as never);

    const sql = normalize(unsafe.mock.calls[0]![0] as string);
    expect(sql).toBe(
      "insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms) " +
        "values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb, $5)",
    );

    // $1 is reused for the subselect AND drive_file_id, so the array is five, not six.
    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params).toHaveLength(5);
    expect(params[0]).toBe("file-1");
    expect(params[4]).toBe(42);
  });

  test("an entry with no durationMs binds SQL NULL, never undefined", async () => {
    // postgres.js raises UNDEFINED_VALUE for an undefined bind parameter and
    // writeSyncLog sets no transform.undefined, so every NULL-duration writer in
    // spec §3.3.1 would THROW rather than persist. `?? null`, never the bare read.
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });

    await sink({ driveFileId: "file-2", outcome: "skipped" } as never);

    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params).toHaveLength(5);
    expect(params[4]).toBeNull();
    expect(params[4]).not.toBeUndefined();
  });

  test("a null drive_file_id still binds, and resolves to a null show_id", async () => {
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });

    await sink({ driveFileId: null, outcome: "skipped", durationMs: 7 } as never);

    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBeNull();
    expect(params[4]).toBe(7);
  });
});

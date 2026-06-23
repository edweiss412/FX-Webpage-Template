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
    ]);
  });
});

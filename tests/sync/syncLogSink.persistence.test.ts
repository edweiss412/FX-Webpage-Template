import { describe, expect, test, vi } from "vitest";
import { makePostgresSyncLogSink } from "@/lib/sync/syncLog";

// Flow 6.2 §3.2: the cron sync_log sink must persist the applied-outcome parse
// warnings that logSync threads into entry.parseWarnings (previously dropped by
// warningsFor). parse_warnings is the LAST positional param of the insert.
describe("sync_log sink — parse-warnings persistence (flow 6.2 §3.2)", () => {
  test("applied entry appends parseWarnings after the payload row", async () => {
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    const parseWarnings = [
      { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "x" },
      { code: "FIELD_UNREADABLE", severity: "warn", message: "y" },
    ];
    await sink({
      driveFileId: "file-1",
      outcome: "applied",
      payload: { kind: "delta" },
      parseWarnings,
    } as never);
    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params[params.length - 1]).toEqual([
      { kind: "delta", outcome: "applied", code: null },
      ...parseWarnings,
    ]);
  });

  test("entry with no parseWarnings is byte-identical to today (payload row only)", async () => {
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    await sink({
      driveFileId: "file-2",
      outcome: "skipped",
      code: "WEBHOOK_NOOP_ALREADY_SYNCED",
      payload: { kind: "watermark" },
    } as never);
    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params[params.length - 1]).toEqual([
      { kind: "watermark", outcome: "skipped", code: "WEBHOOK_NOOP_ALREADY_SYNCED" },
    ]);
  });

  test("applied entry with parseWarnings and no payload has no leading payload row", async () => {
    const unsafe = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    const parseWarnings = [{ code: "ROLE_TOKEN_AUTOCORRECTED", severity: "warn", message: "z" }];
    await sink({ driveFileId: "file-3", outcome: "applied", parseWarnings } as never);
    const params = unsafe.mock.calls[0]![1] as unknown[];
    expect(params[params.length - 1]).toEqual([...parseWarnings]);
  });
});

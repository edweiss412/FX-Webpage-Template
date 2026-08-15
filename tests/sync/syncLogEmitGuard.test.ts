// tests/sync/syncLogEmitGuard.test.ts
//
// Spec: docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md
//
// A sync never fails because logging failed. `sync_log` emits ride a SEPARATE postgres
// connection (`writeSyncLog`, lib/sync/syncLog.ts), so the sink can fail while the sync it
// observes is healthy — and the shared chokepoint `await deps.logSync?.(entry)` inside the
// exported `logSync` helper sits under the per-show advisory lock. Unguarded, a transient
// sink fault throws out of the lock callback and rolls the sync back: the log write fails
// the thing it exists to observe.
//
// AC-1 (helper guard) and AC-4 (success path unchanged) live here.
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { LogRecord } from "@/lib/log";
import { setLogSink } from "@/lib/log";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  logSync,
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileResult,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

/**
 * Record-level capture, not a `vi.spyOn(log, "error")` argument check (AC-1's stated seam).
 * An argument spy observes the FIELDS the caller passed, BEFORE `buildRecord`
 * (lib/log/logger.ts) runs `serializeError` and `sanitizeContext` over them — so it cannot
 * prove what the persisted diagnostic actually says, and a double-serialized `error` field
 * (which collapses to "[object Object]") passes it.
 *
 * The sink stays installed for the file rather than being torn down with `resetLogSink()`:
 * `resetLogSink` restores the DEFAULT sink, whose lazy `import("./persist")` is the exact
 * post-teardown `EnvironmentTeardownError` hazard tests/setup.ts installs a console-only
 * sink to avoid. tests/setup.ts states the per-file convention: "Test files that assert on
 * emitted records install their OWN sink (this is overridden per-file)."
 */
const records: LogRecord[] = [];

function escalations(): LogRecord[] {
  return records.filter((r) => r.code === "SYNC_LOG_EMIT_FAILED");
}

/** The one non-skipped result shape the unit rows emit; the helper early-returns on skips. */
const RESULT: ProcessOneFileResult = { outcome: "hard_fail", code: "SYNC_FILE_FAILED" };

function fileMeta(id: string): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

/** Minimal locked tx: the lock-held assertion and the DEF-4 archived re-read, nothing else. */
function lockedTx(): LockedShowTx<SyncPipelineTx> {
  return {
    async queryOne<T>(sql: string) {
      if (/from public\.shows where drive_file_id/i.test(sql)) return { archived: false } as T;
      return { held: true } as T;
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

describe("sync_log emit guard — the helper chokepoint (AC-1, AC-4)", () => {
  beforeEach(() => {
    records.length = 0;
    setLogSink((record) => {
      records.push(record);
    });
  });

  test("a rejecting sink is swallowed and escalated, not propagated", async () => {
    const sinkError = new Error("probe-sink-connection-reset");

    await expect(
      logSync(
        {
          logSync: async () => {
            throw sinkError;
          },
        },
        "drive-file-1",
        RESULT,
      ),
    ).resolves.toBeUndefined();

    const escalated = escalations();
    expect(escalated).toHaveLength(1);
    expect(escalated[0].driveFileId).toBe("drive-file-1");
    // Post-buildRecord: the shape `persistAppEvent` would write. The logger serializes
    // exactly once, so the thrown message survives into the persisted diagnostic. Passing
    // `serializeError(sinkError)` at the call site instead feeds a plain object back through
    // serializeError's non-Error branch (`String(value)`) and this collapses to
    // "[object Object]" — the double-serialize mutant this row kills.
    expect(escalated[0].context.error).toMatchObject({
      message: "probe-sink-connection-reset",
    });
  });

  test("the escalation is fire-and-forget — the helper resolves while the emit is in flight", async () => {
    let releaseSink: () => void = () => {};
    const sinkGate = new Promise<void>((resolve) => {
      releaseSink = resolve;
    });
    let sinkCompleted = false;
    setLogSink(async (record) => {
      records.push(record);
      await sinkGate;
      sinkCompleted = true;
    });

    const outcome = await Promise.race([
      logSync(
        {
          logSync: async () => {
            throw new Error("probe-sink-down");
          },
        },
        "drive-file-2",
        RESULT,
      ).then(() => "resolved" as const),
      new Promise<"still-pending">((resolve) => setTimeout(() => resolve("still-pending"), 50)),
    ]);

    // An AWAITED escalation would hold the caller — and, at the in-lock call sites, the
    // advisory lock — for the app_events sink's full latency (invariant 10).
    expect(outcome).toBe("resolved");
    expect(sinkCompleted).toBe(false);
    expect(escalations()).toHaveLength(1);

    releaseSink();
    await sinkGate;
  });

  test("a resolving sink is unchanged: same entry, zero escalations (AC-4)", async () => {
    const entries: unknown[] = [];

    await logSync(
      {
        logSync: async (entry) => {
          entries.push(entry);
        },
        attemptStartedAtMs: 1_000,
        now: () => new Date(1_250),
      },
      "drive-file-3",
      RESULT,
      { probe: "payload" },
    );

    expect(entries).toEqual([
      {
        driveFileId: "drive-file-3",
        outcome: "hard_fail",
        code: "SYNC_FILE_FAILED",
        payload: { probe: "payload" },
        durationMs: 250,
      },
    ]);
    expect(escalations()).toHaveLength(0);
  });

  test("integration: processOneFile_unlocked returns the sync's own outcome under a rejecting sink", async () => {
    const file = fileMeta("drive-file-4");
    const prepared = await prepareProcessOneFile(
      "drive-file-4",
      "cron",
      file,
      { perFileProcessor: vi.fn(async () => ({ outcome: "skip" as const, reason: "unchanged" })) },
      async () => null,
    );

    const result = await processOneFile_unlocked(
      lockedTx(),
      "drive-file-4",
      "cron",
      file,
      {
        logSync: async () => {
          throw new Error("probe-sink-down-in-lock");
        },
      },
      prepared,
    );

    // The outcome the sync itself earned, not the sink's failure.
    expect(result).toEqual({ outcome: "skipped", reason: "unchanged" });
    expect(escalations()).toHaveLength(1);
    expect(escalations()[0].driveFileId).toBe("drive-file-4");
  });
});

/**
 * Spec §3.3 / §3.1 (docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * an escaped throw out of the manual sync runners records ONE `parse_error` row and rethrows the
 * ORIGINAL error — but only when the attempt's tracked sink had written nothing yet.
 *
 * This is the ledger probe (`BL-MANUAL-SYNC-UNEMITTED`), inverted into a test: that probe installed
 * `processDeps.logSync`, threw from `runOne`, and measured `{"thrown":"probe-prepare-failure",
 * "logSyncCalls":0}`.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import { log } from "@/lib/log";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { ParseResult } from "@/lib/parser/types";
import {
  runManualSyncForShow,
  runManualSyncForShow_unlocked,
  type RunManualSyncForShowDeps,
} from "@/lib/sync/runManualSyncForShow";
import {
  classifySyncFailure,
  errorPayload,
  STAGED_PARSE_REVISION_RACE,
  STAGED_PARSE_REVISION_RACE_COOLDOWN,
  STAGED_PARSE_SOURCE_GONE,
  type PreparedProcessOneFile,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
  type SyncLogEntry,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import { premiseHolds } from "@/tests/_shared/premise";

const FILE_ID = "manual-throw-emission-file";
const WATCHED_FOLDER = "folder-1";

function fileMetaFixture(): DriveListedFile {
  return {
    driveFileId: FILE_ID,
    name: "Manual Throw Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-08-14T12:00:00.000Z",
    parents: [WATCHED_FOLDER],
    headRevisionId: "head-1",
  };
}

/** Minimal locked-tx double: the preflight guard reads `shows.archived` and nothing else here. */
function fakeTx(): LockedShowTx<SyncPipelineTx> {
  return {
    async queryOne<T>(sql: string) {
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/select archived/i.test(sql)) return { archived: false } as T;
      return null as T;
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

type WrapperArgs = {
  /** Stands in for the real processOneFile — the `runOne` the wrapper awaits. */
  processOneFile: NonNullable<RunManualSyncForShowDeps["processOneFile"]>;
  sink: NonNullable<ProcessOneFileDeps["logSync"]>;
};

async function runWrapper(args: WrapperArgs) {
  const tx = fakeTx();
  return runManualSyncForShow(FILE_ID, "manual", {
    checkFinalizeOwnership: async () => false,
    getActiveWatchedFolderId: async () => ({ folderId: WATCHED_FOLDER }),
    fetchDriveFileMetadata: async () => fileMetaFixture(),
    withPipelineLock: (async (_id: string, fn: (t: typeof tx) => unknown) => fn(tx)) as NonNullable<
      RunManualSyncForShowDeps["withPipelineLock"]
    >,
    processOneFile: args.processOneFile,
    processDeps: { logSync: args.sink },
  });
}

describe("runManualSyncForShow — escaped throws reach sync_log (spec §3.3)", () => {
  test("premise: the injected runOne is actually reached on the happy path", async () => {
    const entries: SyncLogEntry[] = [];
    const runOne = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
    }));

    await runWrapper({
      processOneFile: runOne as never,
      sink: async (entry) => {
        entries.push(entry);
      },
    });

    premiseHolds(
      "the wrapper's preflight/watched-folder gates let the attempt reach runOne",
      runOne.mock.calls.length === 1,
    );
  });

  test("runOne throws before any row → one parse_error row, ORIGINAL error rethrown", async () => {
    const thrown = new Error("probe-prepare-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runWrapper({
        processOneFile: (async () => {
          throw thrown;
        }) as never,
        sink: async (entry) => {
          entries.push(entry);
        },
      }),
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "parse_error",
      code: classifySyncFailure(thrown),
      // Payload too (tests review R1 F4): the forensic cause is the point of the row.
      payload: errorPayload(thrown),
    });
    // Escaped-throw rule (spec §1.1): the attempt aborted, so no duration is claimed.
    expect(entries[0]?.durationMs).toBeUndefined();
  });

  test("runOne emits, then throws → NO second row (tracked-sink dedupe)", async () => {
    const thrown = new Error("probe-post-emission-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runWrapper({
        // The wrapper forwards a WRAPPED sink, so the double must emit through the deps object it
        // receives — that is exactly the tracked instance the catch keys on.
        processOneFile: (async (
          _driveFileId: string,
          _mode: string,
          _fileMeta: DriveListedFile,
          processDeps?: ProcessOneFileDeps,
        ) => {
          await processDeps?.logSync?.({
            driveFileId: FILE_ID,
            outcome: "hard_fail",
            code: "MI-4",
          });
          throw thrown;
        }) as never,
        sink: async (entry) => {
          entries.push(entry);
        },
      }),
    ).rejects.toBe(thrown);

    // The recorded outcome stands; inventing a parse_error over it is the corruption the tracker
    // exists to prevent (AC-5).
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "hard_fail", code: "MI-4" });
  });

  test("sink failure inside the catch → ORIGINAL error surfaces, SYNC_LOG_EMIT_FAILED escalated", async () => {
    const thrown = new Error("probe-prepare-failure");
    const sinkError = new Error("probe-sink-down");
    const errorSpy = vi.spyOn(log, "error").mockResolvedValue(undefined);

    try {
      await expect(
        runWrapper({
          processOneFile: (async () => {
            throw thrown;
          }) as never,
          sink: async () => {
            throw sinkError;
          },
        }),
      ).rejects.toBe(thrown);

      const escalations = errorSpy.mock.calls.filter(
        ([, fields]) => (fields as { code?: string }).code === "SYNC_LOG_EMIT_FAILED",
      );
      expect(escalations).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

/**
 * One fixture per `PreparedProcessOneFile` kind. The parameterized forwarding case below drives all
 * six because §3.1's whole argument — threading `prepared` buys the retry path the full cron
 * emission surface — rests on `processOneFile_unlocked` receiving each kind verbatim.
 */
const PREPARED_FIXTURES: Array<{
  kind: PreparedProcessOneFile["kind"];
  prepared: PreparedProcessOneFile;
}> = [
  {
    kind: "skip",
    prepared: {
      kind: "skip",
      result: { outcome: "skipped", reason: "watermark_unchanged" },
    },
  },
  {
    kind: "asset_recovery",
    prepared: { kind: "asset_recovery", result: { outcome: "asset_recovery" } },
  },
  {
    kind: "revision_race_cooldown",
    prepared: {
      kind: "revision_race_cooldown",
      result: {
        outcome: "revision_race_cooldown",
        code: STAGED_PARSE_REVISION_RACE_COOLDOWN,
        cooldownRemainingMs: 1_000,
        retryCount: 2,
      },
      payload: { drive_file_id: FILE_ID },
    },
  },
  {
    kind: "revision_race",
    prepared: {
      kind: "revision_race",
      result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
      racedHeadRevisionId: "head-2",
      payload: { drive_file_id: FILE_ID },
    },
  },
  {
    kind: "fetch_failure",
    prepared: {
      kind: "fetch_failure",
      binding: { bindingToken: "head-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
      error: new Error("probe-fetch-failure"),
      code: STAGED_PARSE_SOURCE_GONE,
    },
  },
  {
    kind: "ready",
    prepared: {
      kind: "ready",
      resolvedMode: "manual",
      binding: { bindingToken: "head-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
      parseResult: {
        show: { title: "Manual Throw Fixture" },
        warnings: [],
      } as unknown as ParseResult,
    },
  },
];

const APPLIED_RESULT: ProcessOneFileResult = {
  outcome: "applied",
  showId: "show-1",
  parseWarnings: [],
  appliedRoleMappings: [],
};

describe("runManualSyncForShow_unlocked — prepared threading + escaped throws (spec §3.1)", () => {
  test.each(PREPARED_FIXTURES)(
    "forwards the $kind prepared value as a sixth argument",
    async ({ prepared }) => {
      const calls: unknown[][] = [];
      const processOneFile_unlocked = (async (...args: unknown[]) => {
        calls.push(args);
        return APPLIED_RESULT;
      }) as NonNullable<RunManualSyncForShowDeps["processOneFile_unlocked"]>;

      await runManualSyncForShow_unlocked(
        fakeTx(),
        FILE_ID,
        "manual",
        fileMetaFixture(),
        { processOneFile_unlocked, processDeps: { logSync: async () => {} } },
        prepared,
      );

      premiseHolds("the runner reached the injected processOneFile_unlocked", calls.length === 1);
      // Six, not five: the shipped five-argument forward is exactly why processOneFile_unlocked
      // threw SyncInfraError on every non-archived existing-show retry.
      expect(calls[0]).toHaveLength(6);
      expect(calls[0]?.[5]).toBe(prepared);
    },
  );

  test("runUnlocked throws before any row → one parse_error row, ORIGINAL error rethrown", async () => {
    const thrown = new Error("probe-unlocked-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runManualSyncForShow_unlocked(
        fakeTx(),
        FILE_ID,
        "manual",
        fileMetaFixture(),
        {
          processOneFile_unlocked: async () => {
            throw thrown;
          },
          processDeps: {
            logSync: async (entry) => {
              entries.push(entry);
            },
          },
        },
        PREPARED_FIXTURES[5]?.prepared as PreparedProcessOneFile,
      ),
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "parse_error",
      code: classifySyncFailure(thrown),
      // Payload too (tests review R1 F4): the forensic cause is the point of the row.
      payload: errorPayload(thrown),
    });
    expect(entries[0]?.durationMs).toBeUndefined();
  });

  test("runUnlocked emits, then throws → NO second row (tracked-sink dedupe)", async () => {
    const thrown = new Error("probe-unlocked-post-emission-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runManualSyncForShow_unlocked(
        fakeTx(),
        FILE_ID,
        "manual",
        fileMetaFixture(),
        {
          processOneFile_unlocked: (async (
            _tx: unknown,
            _driveFileId: string,
            _mode: string,
            _fileMeta: DriveListedFile,
            deps?: ProcessOneFileDeps,
          ) => {
            await deps?.logSync?.({ driveFileId: FILE_ID, outcome: "stage" });
            throw thrown;
          }) as NonNullable<RunManualSyncForShowDeps["processOneFile_unlocked"]>,
          processDeps: {
            logSync: async (entry) => {
              entries.push(entry);
            },
          },
        },
        PREPARED_FIXTURES[5]?.prepared as PreparedProcessOneFile,
      ),
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "stage" });
  });

  test("sink failure inside the catch → ORIGINAL error surfaces, SYNC_LOG_EMIT_FAILED escalated", async () => {
    const thrown = new Error("probe-unlocked-failure");
    const errorSpy = vi.spyOn(log, "error").mockResolvedValue(undefined);

    try {
      await expect(
        runManualSyncForShow_unlocked(
          fakeTx(),
          FILE_ID,
          "manual",
          fileMetaFixture(),
          {
            processOneFile_unlocked: async () => {
              throw thrown;
            },
            processDeps: {
              logSync: async () => {
                throw new Error("probe-sink-down");
              },
            },
          },
          PREPARED_FIXTURES[5]?.prepared as PreparedProcessOneFile,
        ),
      ).rejects.toBe(thrown);

      const escalations = errorSpy.mock.calls.filter(
        ([, fields]) => (fields as { code?: string }).code === "SYNC_LOG_EMIT_FAILED",
      );
      expect(escalations).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

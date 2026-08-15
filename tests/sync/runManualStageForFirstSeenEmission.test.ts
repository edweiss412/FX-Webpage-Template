/**
 * Spec §3.2 (docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * every terminal `runManualStageForFirstSeen` outcome writes exactly one sync_log row, from ONE
 * exhaustive emit site — and a thrown attempt records `parse_error` ONLY when no row landed.
 *
 * These drive the REAL runManualStageForFirstSeen through the seam the defect lived in (the
 * injected `logSync` sink), not the helper the shipped tests injected below it. Every expected
 * value is derived from the injected fixture, never hardcoded.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import { log } from "@/lib/log";
import type { ParseResult } from "@/lib/parser/types";
import type { Phase1Result } from "@/lib/sync/phase1";
import type { Phase2Result } from "@/lib/sync/phase2";
import {
  runManualStageForFirstSeen,
  type RunManualStageForFirstSeenDeps,
} from "@/lib/sync/runManualStageForFirstSeen";
import {
  classifySyncFailure,
  errorPayload,
  type SyncLogEntry,
} from "@/lib/sync/runScheduledCronSync";
import { premiseHolds } from "@/tests/_shared/premise";

const FILE_ID = "first-seen-emission-file";

/** The post-tail statement this suite uses as its "throws AFTER the row landed" injection point. */
const RESOLVE_STALE_ALERTS_SQL = /admin_alerts[\s\S]*resolved_at/i;

/** Minimal locked-tx double: only the members this path actually touches. */
class FakeTx {
  alerts: Array<{ showId: string | null; code: string }> = [];
  /** When set, `queryOne` rejects for the statement this matches (post-tail throw injection). */
  rejectQueryMatching: RegExp | null = null;

  async queryOne<T>(sql: string): Promise<T> {
    if (this.rejectQueryMatching?.test(sql)) {
      throw new Error("probe-post-tail-failure");
    }
    if (/pg_locks/i.test(sql)) return { held: true } as T;
    if (/role_token_mappings/i.test(sql)) return { rows: [] } as T;
    return undefined as T;
  }
  async upsertAdminAlert(input: { showId: string | null; code: string }): Promise<string | null> {
    this.alerts.push({ showId: input.showId, code: input.code });
    return "alert-1";
  }
  async deleteLivePendingIngestion(): Promise<void> {}
  async upsertLivePendingSync(): Promise<{ stagedId: string }> {
    return { stagedId: "staged-unused" };
  }
  async readShowId(): Promise<string | null> {
    return null;
  }
}

function fileMetaFixture(): DriveListedFile {
  return {
    driveFileId: FILE_ID,
    name: "first-seen.xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-08-14T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

function parseResultFixture(): ParseResult {
  return {
    show: {
      title: "First Seen Emission",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: "2026-08-14", showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

/** Deterministic clock: one value per call, the last one repeating. */
function makeClock(...msValues: number[]): () => Date {
  let index = 0;
  return () => {
    const ms = msValues[Math.min(index, msValues.length - 1)] as number;
    index += 1;
    return new Date(ms);
  };
}

type RunArgs = {
  phase1: Phase1Result | (() => Promise<Phase1Result>);
  phase2?: Phase2Result | (() => Promise<Phase2Result>);
  clock?: () => Date;
  tx?: FakeTx;
  /** The sink under test. Defaults to a recorder; the throw cases supply a rejecting one. */
  sink: (entry: SyncLogEntry) => Promise<void>;
};

function buildDeps(args: RunArgs): RunManualStageForFirstSeenDeps {
  return {
    fileMeta: fileMetaFixture(),
    parseResult: parseResultFixture(),
    binding: { bindingToken: "rev-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
    runPhase1: (async () =>
      typeof args.phase1 === "function"
        ? await args.phase1()
        : args.phase1) as unknown as NonNullable<RunManualStageForFirstSeenDeps["runPhase1"]>,
    ...(args.phase2
      ? {
          runPhase2: (async () =>
            typeof args.phase2 === "function"
              ? await (args.phase2 as () => Promise<Phase2Result>)()
              : args.phase2) as unknown as NonNullable<RunManualStageForFirstSeenDeps["runPhase2"]>,
        }
      : {}),
    ...(args.clock ? { now: args.clock } : {}),
    logSync: args.sink,
  };
}

/** Recording run: returns every entry the production emit sites handed the sink. */
async function runStage(args: Omit<RunArgs, "sink">): Promise<{
  entries: SyncLogEntry[];
  tx: FakeTx;
  result: Awaited<ReturnType<typeof runManualStageForFirstSeen>>;
}> {
  const tx = args.tx ?? new FakeTx();
  const entries: SyncLogEntry[] = [];
  const result = await runManualStageForFirstSeen(
    tx as never,
    FILE_ID,
    buildDeps({
      ...args,
      tx,
      sink: async (entry) => {
        entries.push(entry);
      },
    }),
  );
  return { entries, tx, result };
}

/** Throwing-path run: the caller owns the sink (recorder, or one that rejects). */
async function runStageWithSink(
  args: RunArgs,
): Promise<Awaited<ReturnType<typeof runManualStageForFirstSeen>>> {
  const tx = args.tx ?? new FakeTx();
  return runManualStageForFirstSeen(tx as never, FILE_ID, buildDeps({ ...args, tx }));
}

function appliedPhase2(): Phase2Result {
  return {
    outcome: "applied",
    showId: "11111111-1111-4111-8111-111111111111",
    parseWarnings: [],
    appliedRoleMappings: [],
  };
}

describe("runManualStageForFirstSeen — single-site sync_log emission (spec §3.2)", () => {
  test("stage → exactly one `stage` row carrying the attempt duration", async () => {
    // Duration is derived from the injected clock (start T0, emit T1), never hardcoded.
    const startMs = 1_700_000_000_000;
    const emitMs = startMs + 4_321;
    const { entries, result } = await runStage({
      phase1: { outcome: "stage", triggeredReviewItems: [], stagedId: "staged-77" },
      clock: makeClock(startMs, emitMs),
    });

    premiseHolds(
      "the injected phase-1 stage result reaches the staged terminal outcome",
      result.outcome === "parsed_pending_review",
    );
    expect(entries).toHaveLength(1);
    // Exact shape, not a subset (tests review R1 F3): `stagedId` is deliberately absent, because
    // SyncLogEntry has no such field and logSync drops it — identical to the cron `stage` twin. A
    // partial matcher would also tolerate stray fields appearing on the row.
    expect(entries[0]).toEqual({
      driveFileId: FILE_ID,
      outcome: "stage",
      durationMs: emitMs - startMs,
    });
  });

  test("hard_fail → one `hard_fail` row carrying phase 1's code", async () => {
    const errorCode = "MI4_UNRESOLVED";
    const { entries, result } = await runStage({
      phase1: { outcome: "hard_fail", code: errorCode, failedCodes: [errorCode], message: "nope" },
    });

    premiseHolds(
      "the injected phase-1 hard_fail reaches the hard_failed terminal outcome",
      result.outcome === "hard_failed",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "hard_fail", code: errorCode });
  });

  test("pass → one `skipped` row reasoned `first_seen_phase1_pass`", async () => {
    const { entries, result } = await runStage({ phase1: { outcome: "pass" } });

    premiseHolds(
      "the injected phase-1 pass reaches the degenerate parsed terminal outcome",
      result.outcome === "parsed",
    );
    expect(entries).toHaveLength(1);
    // logSync maps a result's `reason` onto the entry's `code` column.
    expect(entries[0]).toMatchObject({ outcome: "skipped", code: "first_seen_phase1_pass" });
  });

  test.each([
    {
      label: "auto_apply_with_holds",
      phase1: { outcome: "auto_apply_with_holds", mi11Items: [] } as Phase1Result,
    },
    {
      label: "shrink_held",
      phase1: {
        outcome: "shrink_held",
        message: "held",
        heldModifiedTime: "2026-08-14T12:00:00.000Z",
        shrinkItems: [],
      } as Phase1Result,
    },
  ])(
    "$label → parsed result carrying the degenerate discriminator + a distinct reason",
    async ({ phase1 }) => {
      const { entries, result } = await runStage({ phase1 });

      premiseHolds(
        "the unexpected phase-1 variant still resolves to the parsed terminal outcome",
        result.outcome === "parsed",
      );
      expect(result).toMatchObject({ outcome: "parsed", degenerate: "unexpected_phase1_outcome" });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        outcome: "skipped",
        code: "first_seen_unexpected_phase1_outcome",
      });
    },
  );

  test("defer → one `skipped` row with the cron-parity debounce payload", async () => {
    const reason = "mi8_modtime_unstable" as const;
    const { entries, result } = await runStage({ phase1: { outcome: "defer", reason } });

    premiseHolds(
      "the injected phase-1 defer reaches the deferred terminal outcome",
      result.outcome === "deferred",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      outcome: "skipped",
      code: reason,
      payload: { kind: "mi8_debounce_skip", reason },
    });
  });

  test("phase-2 stale → ONE hard_fail row (the applied tail must not also fire)", async () => {
    const staleCode = "STALE_MANUAL_REPLAY_ABORTED" as const;
    const { entries, result } = await runStage({
      phase1: { outcome: "auto_publish_ready" },
      phase2: { outcome: "stale", code: staleCode },
    });

    premiseHolds(
      "the stale phase-2 result reaches the hard_failed terminal outcome",
      result.outcome === "hard_failed",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "hard_fail", code: staleCode });
  });

  test("applied → exactly one row, written by the existing tail (no second site)", async () => {
    const { entries, result } = await runStage({
      phase1: { outcome: "auto_publish_ready" },
      phase2: appliedPhase2(),
    });

    premiseHolds(
      "the applied phase-2 result reaches the applied terminal outcome",
      result.outcome === "applied",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "applied" });
  });
});

describe("runManualStageForFirstSeen — thrown attempts (spec §3.2, AC-3/AC-5)", () => {
  test("thrown runPhase1 → one parse_error row with NULL duration, original error rethrown", async () => {
    const thrown = new Error("probe-phase1-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runStageWithSink({
        phase1: async () => {
          throw thrown;
        },
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
      // Payload too (tests review R1 F4): without it, dropping `payload: errorPayload(error)` from
      // the production catch leaves this assertion green and the forensic cause unrecorded.
      payload: errorPayload(thrown),
    });
    // Escaped-throw rule (spec §1.1): the attempt aborted, so no duration is claimed.
    expect(entries[0]?.durationMs).toBeUndefined();
  });

  test("thrown runPhase2 → one parse_error row, original error rethrown", async () => {
    const thrown = new Error("probe-phase2-failure");
    const entries: SyncLogEntry[] = [];

    await expect(
      runStageWithSink({
        phase1: { outcome: "auto_publish_ready" },
        phase2: async () => {
          throw thrown;
        },
        sink: async (entry) => {
          entries.push(entry);
        },
      }),
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      outcome: "parse_error",
      code: classifySyncFailure(thrown),
      payload: errorPayload(thrown),
    });
  });

  test("throw AFTER the tail row landed → no second row (tracked-sink dedupe)", async () => {
    // Premise: the same fixture WITHOUT the injected failure writes the applied row, proving the
    // injected throw lands strictly after the emission point.
    const premiseRun = await runStage({
      phase1: { outcome: "auto_publish_ready" },
      phase2: appliedPhase2(),
    });
    premiseHolds(
      "the post-tail injection point is reached only after the applied row is written",
      premiseRun.entries.length === 1 && premiseRun.entries[0]?.outcome === "applied",
    );

    const tx = new FakeTx();
    tx.rejectQueryMatching = RESOLVE_STALE_ALERTS_SQL;
    const entries: SyncLogEntry[] = [];

    await expect(
      runStageWithSink({
        phase1: { outcome: "auto_publish_ready" },
        phase2: appliedPhase2(),
        tx,
        sink: async (entry) => {
          entries.push(entry);
        },
      }),
    ).rejects.toThrow("probe-post-tail-failure");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "applied" });
  });

  test("sink failure inside the catch → ORIGINAL error surfaces, SYNC_LOG_EMIT_FAILED escalated", async () => {
    const thrown = new Error("probe-phase1-failure");
    const sinkError = new Error("probe-sink-down");
    const errorSpy = vi.spyOn(log, "error").mockResolvedValue(undefined);

    try {
      await expect(
        runStageWithSink({
          phase1: async () => {
            throw thrown;
          },
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

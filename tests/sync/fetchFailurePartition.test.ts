/**
 * Spec §3.5 (docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * every cell of `handleFetchFailure_unlocked`'s MODELED input partition writes exactly one sync_log
 * row, and on the arms this arc repairs the recorded code equals the arm's RETURNED terminal code.
 *
 * Reviewing "every non-applied processOneFile_unlocked outcome emits" refuted it twice — R1 found
 * two dark branches, R4 found two more inside a function R1's sweep had already visited. So the
 * unit of proof here is the partition, not a branch list: code class × show presence ×
 * existing-pending. It is a REGRESSION PIN over that partition, not an exhaustiveness proof — the
 * function branches on data, so no `never`-check can force a future arm into the matrix (§3.5
 * states the limit; the derived cover is the filed BL-SYNC-LOG-ATTRIBUTION-METATEST).
 *
 * The override-TOCTOU skip is carried in this same file because its production repair lands in the
 * same task, so this file's `red=` covers everything that task implements.
 */
import { describe, expect, test } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  processOneFile_unlocked,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_FILE_FAILED,
  type PreparedProcessOneFile,
  type ProcessOneFileResult,
  type SyncLogEntry,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import { premiseHolds } from "@/tests/_shared/premise";

const FILE_ID = "fetch-failure-partition-file";
const SHOW_ID = "22222222-2222-4222-8222-222222222222";

type RecoveryRow = {
  driveFileId: string | null;
  outcome: string;
  code?: string;
  payload?: Record<string, unknown>;
};

function fileMetaFixture(): DriveListedFile {
  return {
    driveFileId: FILE_ID,
    name: "Fetch Failure Fixture.xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-08-14T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

type CellState = {
  showPresent: boolean;
  existingPending: boolean;
  /** Override snapshot the locked re-read reports (override-TOCTOU case only). */
  lockedOverride?: { tabName: string; fingerprint: string } | null;
};

/** Tx double recording ONLY what this partition needs: the recovery-sink writes and the reads. */
class PartitionTx {
  recoveryRows: RecoveryRow[] = [];
  pendingIngestionUpserts: unknown[] = [];
  alerts: Array<{ showId: string | null; code: string }> = [];

  constructor(private readonly state: CellState) {}

  async queryOne<T>(sql: string): Promise<T> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (/^select archived/i.test(normalized)) return { archived: false } as T;
    if (/pull_sheet_override/i.test(normalized)) {
      return {
        pull_sheet_override:
          this.state.lockedOverride === undefined || this.state.lockedOverride === null
            ? null
            : { tab_name: this.state.lockedOverride.tabName, ...this.state.lockedOverride },
      } as T;
    }
    // resolveStaleSyncProblemAlerts_unlocked's update; nothing else reaches queryOne here.
    return null as T;
  }
  async readLivePendingSync() {
    return this.state.existingPending ? { stagedId: "staged-1" } : null;
  }
  async readShowForPhase1() {
    if (!this.state.showPresent) return null;
    return {
      showId: SHOW_ID,
      driveFileId: FILE_ID,
      lastSeenModifiedTime: "2026-08-13T12:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: { show: { title: "Partition Show" } } as unknown as ParseResult,
      priorParseWarningsRaw: null,
      published: true,
    };
  }
  async updateShowParseError() {
    return SHOW_ID;
  }
  async markShowSheetUnavailable() {
    return { showId: SHOW_ID, lastSeenModifiedTime: null, title: "Partition Show" };
  }
  async markShowDriveError() {
    return { showId: SHOW_ID, lastSeenModifiedTime: null, title: "Partition Show" };
  }
  async upsertLivePendingIngestion(row: unknown) {
    this.pendingIngestionUpserts.push(row);
  }
  async insertSyncLog(entry: RecoveryRow) {
    this.recoveryRows.push(entry);
  }
  async upsertAdminAlert(input: { showId: string | null; code: string }) {
    this.alerts.push(input);
    return "alert-1";
  }
}

function fetchFailurePrepared(code: string): PreparedProcessOneFile {
  return {
    kind: "fetch_failure",
    binding: { bindingToken: "head-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
    error: new Error("probe-fetch-failure"),
    code: code as Extract<PreparedProcessOneFile, { kind: "fetch_failure" }>["code"],
  };
}

async function runCell(
  code: string,
  state: CellState,
): Promise<{ tx: PartitionTx; result: ProcessOneFileResult; injected: SyncLogEntry[] }> {
  const tx = new PartitionTx(state);
  const injected: SyncLogEntry[] = [];
  const result = await processOneFile_unlocked(
    tx as unknown as LockedShowTx<SyncPipelineTx>,
    FILE_ID,
    "cron",
    fileMetaFixture(),
    {
      logSync: async (entry) => {
        injected.push(entry);
      },
    },
    fetchFailurePrepared(code),
  );
  return { tx, result, injected };
}

/**
 * The modeled partition, written as a literal 12-element array (never a computed list, which can
 * silently become empty). `repaired: true` marks the arms this arc lights up — those additionally
 * assert the row's code equals the RETURNED terminal code; the pre-existing arms are pinned in
 * their ratified `outcome: "error"` recovery shape instead (§3.5 R5 F1).
 */
const CELLS: Array<{
  label: string;
  code: string;
  showPresent: boolean;
  existingPending: boolean;
  expected: { outcome: string; code: string };
  repaired: boolean;
}> = [
  // ── existing pending review: every cell was DARK before this arc ──
  {
    label: "source_gone × show × pending",
    code: STAGED_PARSE_SOURCE_GONE,
    showPresent: true,
    existingPending: true,
    expected: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    repaired: true,
  },
  {
    label: "source_gone × no-show × pending",
    code: STAGED_PARSE_SOURCE_GONE,
    showPresent: false,
    existingPending: true,
    expected: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    repaired: true,
  },
  {
    label: "last_good × show × pending",
    code: "PARSE_ERROR_LAST_GOOD",
    showPresent: true,
    existingPending: true,
    expected: { outcome: "parse_error", code: "PARSE_ERROR_LAST_GOOD" },
    repaired: true,
  },
  {
    // The first-seen carve, on the early return: the row must state SYNC_FILE_FAILED (what the
    // branch RETURNS), never PARSE_ERROR_LAST_GOOD (its input).
    label: "last_good × no-show × pending (carve)",
    code: "PARSE_ERROR_LAST_GOOD",
    showPresent: false,
    existingPending: true,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: true,
  },
  {
    label: "generic × show × pending",
    code: SYNC_FILE_FAILED,
    showPresent: true,
    existingPending: true,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: true,
  },
  {
    label: "generic × no-show × pending",
    code: SYNC_FILE_FAILED,
    showPresent: false,
    existingPending: true,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: true,
  },
  // ── no pending, show present: the pre-existing emitting arms, pinned as-is ──
  {
    label: "source_gone × show",
    code: STAGED_PARSE_SOURCE_GONE,
    showPresent: true,
    existingPending: false,
    expected: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    repaired: false,
  },
  {
    label: "last_good × show",
    code: "PARSE_ERROR_LAST_GOOD",
    showPresent: true,
    existingPending: false,
    expected: { outcome: "parse_error", code: "PARSE_ERROR_LAST_GOOD" },
    repaired: false,
  },
  {
    label: "generic × show",
    code: SYNC_FILE_FAILED,
    showPresent: true,
    existingPending: false,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: false,
  },
  // ── no pending, no show: both arms upsert a pending_ingestions row and were DARK ──
  {
    label: "source_gone × no-show",
    code: STAGED_PARSE_SOURCE_GONE,
    showPresent: false,
    existingPending: false,
    expected: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    repaired: true,
  },
  {
    label: "last_good × no-show (carve)",
    code: "PARSE_ERROR_LAST_GOOD",
    showPresent: false,
    existingPending: false,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: true,
  },
  {
    label: "generic × no-show",
    code: SYNC_FILE_FAILED,
    showPresent: false,
    existingPending: false,
    expected: { outcome: "parse_error", code: SYNC_FILE_FAILED },
    repaired: true,
  },
];

describe("handleFetchFailure_unlocked: every partition cell writes exactly one row (AC-7)", () => {
  test.each(CELLS)("$label", async (cell) => {
    const { tx, result, injected } = await runCell(cell.code, {
      showPresent: cell.showPresent,
      existingPending: cell.existingPending,
    });

    // Premise: this cell's fixture actually selects the arm whose emission is under test.
    premiseHolds(
      `cell ${cell.label} returns its expected terminal value`,
      !("skipped" in result) &&
        result.outcome === cell.expected.outcome &&
        (result as { code?: string }).code === cell.expected.code,
    );

    // Exactly-once is a property of the ATTEMPT, not of one channel (tests review R1 F1): a row
    // added on the OTHER writer family would leave a per-sink count of 1 while two rows land.
    expect(tx.recoveryRows.length + injected.length).toBe(1);
    expect(injected).toHaveLength(0);
    expect(tx.recoveryRows).toHaveLength(1);
    const row = tx.recoveryRows[0] as RecoveryRow;
    expect(row.driveFileId).toBe(FILE_ID);
    if (cell.repaired) {
      // Terminal-VALUE rule: record what the arm returned, never its input.
      expect(row.outcome).toBe(cell.expected.outcome);
      expect(row.code).toBe(cell.expected.code);
    } else {
      // Ratified recovery-row shape (§3.5 R5 F1): pinned as-is, not corrected.
      expect(row.outcome).toBe("error");
      expect(row.code).toBe(cell.code);
    }
  });

  test("the partition is enumerated, not computed", () => {
    // A test.each over an accidentally-empty list reports zero failures and proves nothing.
    premiseHolds("all 12 modeled cells are registered", CELLS.length === 12);
    expect(new Set(CELLS.map((c) => c.label)).size).toBe(12);
  });
});

describe("pull-sheet-override TOCTOU skip records its row (§3.5)", () => {
  test("a snapshot that changed under the lock writes one skip row with a duration", async () => {
    const tx = new PartitionTx({
      showPresent: true,
      existingPending: false,
      // The locked re-read reports a DIFFERENT override than the parse was produced under.
      lockedOverride: { tabName: "OLD GEAR", fingerprint: "fingerprint-after" },
    });
    const injected: SyncLogEntry[] = [];
    const startMs = 1_700_000_000_000;
    const emitMs = startMs + 777;

    const result = await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      FILE_ID,
      "cron",
      fileMetaFixture(),
      {
        logSync: async (entry) => {
          injected.push(entry);
        },
        attemptStartedAtMs: startMs,
        now: () => new Date(emitMs),
      },
      {
        kind: "ready",
        resolvedMode: "cron",
        binding: { bindingToken: "head-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
        parseResult: { show: { title: "Partition Show" }, warnings: [] } as unknown as ParseResult,
        pullSheetOverrideUsed: { tabName: "OLD GEAR", fingerprint: "fingerprint-before" },
      },
    );

    premiseHolds(
      "the locked snapshot differs, so the TOCTOU skip is the arm under test",
      !("skipped" in result) &&
        result.outcome === "skipped" &&
        (result as { reason?: string }).reason === "pull_sheet_override_changed_under_lock",
    );
    // Exactly-once across BOTH families, same reason as the matrix above (tests review R1 F1).
    expect(injected.length + tx.recoveryRows.length).toBe(1);
    expect(tx.recoveryRows).toHaveLength(0);
    expect(injected).toHaveLength(1);
    expect(injected[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "skipped",
      code: "pull_sheet_override_changed_under_lock",
    });
    // Threaded start ⇒ the skip row carries the attempt duration, like its neighbors.
    expect(injected[0]?.durationMs).toBe(emitMs - startMs);
  });
});

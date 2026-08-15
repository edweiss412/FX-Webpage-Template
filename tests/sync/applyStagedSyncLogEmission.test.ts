/**
 * Spec §3.4 (docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * a committed LIVE staged apply writes exactly one `sync_log` row, emitted post-commit at the
 * shared `applyStaged` chokepoint — not injected per-route, and not from the in-tx tail.
 *
 * Before this arc the live staged-apply path wrote NO attempt row on any outcome: the tail is
 * invoked with only a tx-bound `upsertAdminAlert` (no sink), neither live route supplied tail deps,
 * and an existing-show apply never reaches the tail at all (it is gated on autoPublishFirstSeen).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  applyStaged,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import {
  classifySyncFailure,
  emitSuccessfulPhase2Tail,
  errorPayload,
  type SyncLogEntry,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import { premiseHolds } from "@/tests/_shared/premise";

const logMock = vi.hoisted(() => ({
  error: vi.fn(async () => {}),
  warn: vi.fn(async () => {}),
  info: vi.fn(async () => {}),
  debug: vi.fn(async () => {}),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));
vi.mock("@/lib/log/emitLeadRoleApplied", () => ({ emitLeadRoleApplied: vi.fn() }));
vi.mock("@/lib/log/emitIdentityLinkRenameUnlanded", () => ({
  emitIdentityLinkRenameUnlanded: vi.fn(),
}));

const FILE_ID = "drive-file-1";
const SHOW_ID = "show-1";
const START_MS = 1_700_000_000_000;
const EMIT_MS = START_MS + 8_642;

/**
 * The warnings the injected phase-2 result carries. Expectations DERIVE from this object — a
 * hardcoded `[]` would pass even if the emit sourced its warnings from nowhere.
 */
const PHASE2_WARNINGS = [
  { code: "AGENDA_DAY_EMPTIED", severity: "warn", message: "day 2 emptied" },
] as unknown as ParseResult["warnings"];

function parseResultFixture(): ParseResult {
  return {
    show: {
      title: "Staged Apply Emission",
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

function driveMeta(): DriveListedFile & { trashed: boolean } {
  return {
    driveFileId: FILE_ID,
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-08-14T12:00:00.000Z",
    parents: ["watched-folder"],
    headRevisionId: "head-1",
    trashed: false,
  };
}

function pending(overrides: Partial<PendingSyncForApply> = {}): PendingSyncForApply {
  return {
    driveFileId: FILE_ID,
    stagedId: "staged-live",
    sourceKind: "manual",
    wizardSessionId: null,
    baseModifiedTime: "2026-08-14T10:00:00.000Z",
    stagedModifiedTime: "2026-08-14T12:00:00.000Z",
    parseResult: parseResultFixture(),
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    parseResultCorrupt: false,
    priorLastSyncStatus: "ok",
    priorLastSyncError: null,
    warningSummary: "none",
    pullSheetOverrideApplied: null,
    ...overrides,
  };
}

function fakeTx(): LockedShowTx<SyncPipelineTx> {
  return {
    async queryOne<T>(sql: string) {
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/upsert_admin_alert/i.test(sql)) return { id: "alert-1" } as T;
      return null as T;
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

/** First call is the attempt start; every later call is the emit instant. */
function makeClock(): () => Date {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return new Date(START_MS);
    }
    return new Date(EMIT_MS);
  };
}

type Scenario = {
  firstSeen?: boolean;
  sink?: NonNullable<ApplyStagedDeps["logSync"]>;
  overrides?: ApplyStagedDeps;
};

function deps(scenario: Scenario = {}): ApplyStagedDeps {
  const tx = fakeTx();
  const base = {
    withPipelineLock: vi.fn(async (_driveFileId, fn) =>
      fn(tx),
    ) as ApplyStagedDeps["withPipelineLock"],
    readLivePendingSyncForApply: vi.fn(async () =>
      scenario.firstSeen
        ? pending({
            // First-seen: no shows row exists, so the staged baseline is null — otherwise the
            // baseline check reports STAGED_PARSE_SUPERSEDED and the tail is never reached.
            baseModifiedTime: null,
            triggeredReviewItems: [
              { id: "fs-1", invariant: "FIRST_SEEN_REVIEW" } as unknown as TriggeredReviewItem,
            ],
          })
        : pending(),
    ),
    // First-seen means NO pre-existing show row; the existing-show case reports one.
    readShowForApply: vi.fn(async () =>
      scenario.firstSeen
        ? null
        : {
            showId: SHOW_ID,
            lastSeenModifiedTime: "2026-08-14T10:00:00.000Z",
            diagrams: { snapshot_revision_id: "rev-prior" },
          },
    ),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
    liveAssetReviewEffects: {
      parseResult: parseResultFixture(),
      adminAlertCode: null,
      skipDiagramsWrite: false,
    },
    runPhase2: vi.fn(async () => ({
      outcome: "applied" as const,
      appliedRoleMappings: [],
      showId: SHOW_ID,
      parseWarnings: PHASE2_WARNINGS,
    })),
    insertSyncAudit: vi.fn(async () => "audit-1"),
    deleteLivePendingSync: vi.fn(async () => undefined),
    restoreShowStatus: vi.fn(async () => undefined),
    upsertLivePendingIngestion: vi.fn(async () => undefined),
    bumpReviewerAuthFloors: vi.fn(async () => undefined),
    upsertAdminAlert: vi.fn(async () => undefined),
    resolveAdminAlerts: vi.fn(async () => undefined),
    readLandedSnapshotStatus: vi.fn(async () => null),
    now: makeClock(),
    ...(scenario.sink ? { logSync: scenario.sink } : {}),
  };
  return { ...base, ...(scenario.overrides ?? {}) } as ApplyStagedDeps;
}

function runApply(scenario: Scenario = {}) {
  return applyStaged(
    {
      driveFileId: FILE_ID,
      sourceScope: "live",
      stagedId: "staged-live",
      // The first-seen fixture carries a FIRST_SEEN_REVIEW item, which the apply requires an
      // answer for (else it returns MISSING_REVIEWER_CHOICE and never reaches the tail).
      reviewerChoices: scenario.firstSeen ? [{ item_id: "fs-1", action: "apply" }] : [],
      appliedByEmail: "doug@fxav.test",
    },
    deps(scenario),
  );
}

beforeEach(() => {
  logMock.error.mockClear();
});

describe("applyStaged writes the applied sync_log row post-commit (spec §3.4, AC-4)", () => {
  test("existing-show apply → one applied row carrying the apply's warnings and duration", async () => {
    const entries: SyncLogEntry[] = [];
    const result = await runApply({
      sink: async (entry) => {
        entries.push(entry);
      },
    });

    premiseHolds(
      "the apply committed, so an attempt row is owed",
      !("skipped" in result) && result.outcome === "applied",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ driveFileId: FILE_ID, outcome: "applied" });
    // Source-derived: the row's warnings are the injected phase-2 result's, not a literal.
    expect(entries[0]?.parseWarnings).toEqual(PHASE2_WARNINGS);
    expect(entries[0]?.durationMs).toBe(EMIT_MS - START_MS);
    // SyncLogEntry carries no showId field — attribution resolves in the sink's subselect, so it
    // is asserted only in the env-bound case, against the DB column.
    expect(entries[0]).not.toHaveProperty("showId");
  });

  test("first-seen apply → still exactly ONE row (the in-tx tail stays sinkless)", async () => {
    const entries: SyncLogEntry[] = [];
    const result = await runApply({
      firstSeen: true,
      sink: async (entry) => {
        entries.push(entry);
      },
    });

    premiseHolds(
      "the first-seen fixture reached the applied outcome through the auto-publish tail",
      !("skipped" in result) && result.outcome === "applied",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outcome: "applied" });
  });

  test("a sink SMUGGLED into firstPublishedTailDeps never fires; one post-commit row stands", async () => {
    const entries: SyncLogEntry[] = [];
    const smuggled = vi.fn(async () => {});

    const tailRuns: number[] = [];
    const result = await runApply({
      firstSeen: true,
      sink: async (entry) => {
        entries.push(entry);
      },
      overrides: {
        // Delegates to the REAL tail and records that it ran. Without this the premise below is
        // satisfied by an apply that never reaches the tail at all — deleting the production
        // invocation would leave the assertion green (tests review R1 F2).
        emitSuccessfulPhase2Tail: (async (args: Parameters<typeof emitSuccessfulPhase2Tail>[0]) => {
          tailRuns.push(1);
          return emitSuccessfulPhase2Tail(args);
        }) as NonNullable<ApplyStagedDeps["emitSuccessfulPhase2Tail"]>,
        // Cast through the wider type: the field is typed Omit<..., "logSync">, but TypeScript is
        // structural, so the runtime strip at the invocation site is the actual guarantee.
        firstPublishedTailDeps: {
          upsertAdminAlert: async () => "alert-1",
          logSync: smuggled,
        } as unknown as NonNullable<ApplyStagedDeps["firstPublishedTailDeps"]>,
      },
    });

    premiseHolds(
      "the tail actually EXECUTED, so a smuggled sink could have fired",
      tailRuns.length === 1 && !("skipped" in result) && result.outcome === "applied",
    );
    expect(smuggled).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
  });

  test("a throwing sink keeps the applied result and escalates SYNC_LOG_EMIT_FAILED", async () => {
    const result = await runApply({
      sink: async () => {
        throw new Error("probe-sink-down");
      },
    });

    // Fail-open: a recording failure must not turn a committed apply into an error response.
    expect(result).toMatchObject({ outcome: "applied", showId: SHOW_ID });
    const escalations = (
      logMock.error.mock.calls as unknown as Array<[string, { code?: string }]>
    ).filter(([, fields]) => fields.code === "SYNC_LOG_EMIT_FAILED");
    expect(escalations).toHaveLength(1);
  });

  test("a throwing live apply whose CATCH sink also fails still rethrows the ORIGINAL error", async () => {
    // A distinct catch from the applied-success emitter above (tests review R1 F5): removing this
    // catch's inner sink guard would let the sink error replace the phase-2 error, and no other
    // case here exercises that surface.
    const thrown = new Error("probe-phase2-explosion");

    await expect(
      runApply({
        sink: async () => {
          throw new Error("probe-sink-down");
        },
        overrides: {
          runPhase2: (async () => {
            throw thrown;
          }) as NonNullable<ApplyStagedDeps["runPhase2"]>,
        },
      }),
    ).rejects.toBe(thrown);

    const escalations = (
      logMock.error.mock.calls as unknown as Array<[string, { code?: string }]>
    ).filter(([, fields]) => fields.code === "SYNC_LOG_EMIT_FAILED");
    expect(escalations).toHaveLength(1);
  });

  test("a throwing live apply records one parse_error row and rethrows the ORIGINAL error", async () => {
    const thrown = new Error("probe-phase2-explosion");
    const entries: SyncLogEntry[] = [];

    await expect(
      runApply({
        sink: async (entry) => {
          entries.push(entry);
        },
        overrides: {
          runPhase2: (async () => {
            throw thrown;
          }) as NonNullable<ApplyStagedDeps["runPhase2"]>,
        },
      }),
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "parse_error",
      // Code AND payload, not just the outcome: without these, dropping either thread from the
      // production emitter leaves this green (tests review R1 F4).
      code: classifySyncFailure(thrown),
      payload: errorPayload(thrown),
    });
    // Escaped-throw rule (spec §1.1): the attempt aborted, so no duration is claimed.
    expect(entries[0]?.durationMs).toBeUndefined();
  });
});

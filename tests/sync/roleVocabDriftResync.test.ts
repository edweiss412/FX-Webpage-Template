/**
 * Role-vocab mapping convergence (spec 2026-07-16-role-vocab-mapping-convergence).
 * Task 3 covers the threading layer: the drift-eligibility set flows through
 * ProcessOneFileDeps → prepareProcessOneFile → the gate opts, and the gate's
 * `driftResync` proceed flag is carried onto the "ready" prepared variant.
 *
 * Later tasks (in-lock recheck, Phase 2 stale guard, tick wiring, DB-bound e2e)
 * append their own top-level `describe` blocks to this file.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { PerFileProcessorResult, SyncMode } from "@/lib/sync/perFileProcessor";
import { ARCHIVED_SKIP_REASON } from "@/lib/sync/lifecycleGuards";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type PreparedProcessOneFile,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

function fileMeta(id: string, modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function parsedSheet(): ParsedSheet {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [
      {
        name: "Alice",
        email: "alice@example.com",
        phone: null,
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [],
    rooms: [
      {
        kind: "gs",
        name: "General Session",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
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

function parseResult(): ParseResult {
  return {
    ...parsedSheet(),
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
  };
}

/**
 * Minimal injected pipeline that carries `prepareProcessOneFile` to a "ready" result without any
 * Drive/DB I/O. `gate` stands in for `perFileProcessor`; the drift cases inject a gate that mirrors
 * Task 2's real behavior (cron + eligible → proceed with `driftResync`).
 */
function pipelineStubs(
  gate: (
    driveFileId: string,
    mode: SyncMode,
    fileMeta: DriveListedFile,
    opts?: { roleVocabDriftEligible?: boolean },
  ) => Promise<PerFileProcessorResult>,
): ProcessOneFileDeps {
  const binding: Phase1Binding = {
    bindingToken: "token-1",
    modifiedTime: "2026-05-08T12:00:00.000Z",
  };
  return {
    perFileProcessor: gate,
    captureBinding: vi.fn(async () => binding),
    fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
    parseSheet: vi.fn(() => parsedSheet()),
    enrichWithDrivePins: vi.fn(async () => parseResult()),
    readShowPullSheetOverride: vi.fn(async () => null),
  };
}

/** Mirrors the shipped gate (perFileProcessor): cron + eligible + at-watermark → drift rescue. */
function driftAwareGate() {
  return vi.fn(
    async (
      _driveFileId: string,
      mode: SyncMode,
      _meta: DriveListedFile,
      opts?: { roleVocabDriftEligible?: boolean },
    ): Promise<PerFileProcessorResult> => {
      if (mode === "cron" && opts?.roleVocabDriftEligible === true) {
        return { outcome: "proceed", mode: "cron", driftResync: true };
      }
      return { outcome: "proceed", mode: mode === "push" ? "push" : mode };
    },
  );
}

describe("role-vocab drift resync threading (prepareProcessOneFile)", () => {
  test("cron: eligible set → gate receives roleVocabDriftEligible:true and ready carries driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["file-1"]) },
      async () => null, // readCooldown: keep the cron cooldown check DB-free
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: true,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).toMatchObject({ kind: "ready", driftResync: true });
  });

  test("cron: file NOT in the set → gate receives roleVocabDriftEligible:false and no driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["other-file"]) },
      async () => null,
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: false,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).not.toHaveProperty("driftResync");
  });

  test("cron: deps omits the set entirely → gate receives roleVocabDriftEligible:false, no driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      pipelineStubs(gate),
      async () => null,
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: false,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).not.toHaveProperty("driftResync");
  });

  test.each(["manual", "push", "onboarding_scan"] as const)(
    "%s caller never marks driftResync even if a set is (defensively) present",
    async (mode) => {
      const gate = driftAwareGate();
      const prepared = await prepareProcessOneFile(
        "file-1",
        mode,
        fileMeta("file-1"),
        // A non-cron caller would never populate this, but even if it leaked in, the gate
        // ignores eligibility outside cron — the flag is computed and passed, driftResync stays off.
        { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["file-1"]) },
        async () => null,
      );

      expect(gate).toHaveBeenCalledWith("file-1", mode, expect.anything(), {
        roleVocabDriftEligible: true,
      });
      expect(prepared.kind).toBe("ready");
      expect(prepared).not.toHaveProperty("driftResync");
    },
  );
});

/**
 * Task 4: in-lock drift recheck (spec §3.3 "Recheck placement is load-bearing"). The recheck runs
 * in `processOneFile_unlocked` as the FIRST drift step under the held lock — before
 * `runPhase1_unlocked`, which mutates durable state on non-happy paths. A blocked recheck
 * (unpublish / live-pending race) returns `drift_recheck_failed` with ZERO Phase 1 side effects.
 * The archive race is owned by the pre-existing DEF-4 archived re-read (ARCHIVED_SKIP_REASON), which
 * fires before the recheck. Non-drift runs never issue the recheck query.
 *
 * The fake tx routes `queryOne` by SQL: the lock-assertion probe → held, `select archived …` →
 * configurable archived, the recheck predicate (`… as ok`) → configurable ok. Phase-1 write
 * surfaces are recorded so "zero side effects" is asserted structurally.
 */
type QueryOneCall = { sql: string; params: unknown[] };

const RECHECK_SQL_MARKER = "not exists (select 1 from public.pending_syncs p";

function driftLockedTx(opts: { archived?: boolean; recheckOk?: boolean } = {}) {
  const queries: QueryOneCall[] = [];
  const writes: string[] = [];
  const recordWrite = (name: string) => async () => {
    writes.push(name);
  };
  const tx = {
    queries,
    writes,
    async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
      queries.push({ sql, params });
      if (sql.includes("pg_locks")) return { held: true } as T;
      if (sql.includes("select archived from public.shows")) {
        return { archived: opts.archived ?? false } as T;
      }
      if (sql.includes(RECHECK_SQL_MARKER)) return { ok: opts.recheckOk ?? true } as T;
      return null as T;
    },
    async readLiveDeferral() {
      return null;
    },
    async deleteLiveDeferral() {},
    // Phase-1 durable-write surfaces — recorded so a blocked recheck can assert none fired.
    upsertLivePendingSync: vi.fn(recordWrite("upsertLivePendingSync")),
    upsertLivePendingIngestion: vi.fn(recordWrite("upsertLivePendingIngestion")),
    updateShowParseError: vi.fn(recordWrite("updateShowParseError")),
    updateShowShrinkHeld: vi.fn(recordWrite("updateShowShrinkHeld")),
    updateShowPendingReview: vi.fn(recordWrite("updateShowPendingReview")),
    applyShowSnapshot: vi.fn(recordWrite("applyShowSnapshot")),
  };
  return tx;
}

function readyPrepared(driftResync: boolean): PreparedProcessOneFile {
  return {
    kind: "ready",
    resolvedMode: "cron",
    binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
    parseResult: parseResult(),
    ...(driftResync ? { driftResync: true as const } : {}),
  };
}

function driftDeps(overrides: Partial<ProcessOneFileDeps> = {}): ProcessOneFileDeps {
  return {
    runPhase1: vi.fn(async () => ({ outcome: "pass" as const })),
    runPhase2: vi.fn(async () => ({
      outcome: "applied" as const,
      appliedRoleMappings: [],
      showId: "show-1",
      parseWarnings: [],
    })),
    logSync: vi.fn(async () => undefined),
    ...overrides,
  };
}

const recheckIssued = (tx: ReturnType<typeof driftLockedTx>) =>
  tx.queries.some((q) => q.sql.includes(RECHECK_SQL_MARKER));

describe("role-vocab drift resync in-lock recheck (processOneFile_unlocked)", () => {
  test("unpublish race: driftResync run, locked recheck blocked → drift_recheck_failed, zero Phase 1", async () => {
    const tx = driftLockedTx({ recheckOk: false });
    const deps = driftDeps();
    const result = await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      deps,
      readyPrepared(true),
    );

    expect(result).toEqual({ outcome: "skipped", reason: "drift_recheck_failed" });
    expect(recheckIssued(tx)).toBe(true);
    expect(deps.runPhase1).not.toHaveBeenCalled();
    expect(deps.runPhase2).not.toHaveBeenCalled();
    expect(tx.writes).toEqual([]);
  });

  test("live-pending race: driftResync run, in-lock live pending row → drift_recheck_failed, zero Phase 1", async () => {
    // recheckOk:false models the SQL's `not exists(live pending_syncs)` leg failing.
    const tx = driftLockedTx({ recheckOk: false });
    const deps = driftDeps();
    const result = await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      deps,
      readyPrepared(true),
    );

    expect(result).toEqual({ outcome: "skipped", reason: "drift_recheck_failed" });
    expect(deps.runPhase1).not.toHaveBeenCalled();
    expect(tx.writes).toEqual([]);
  });

  test("archive race: driftResync run racing an archive → ARCHIVED_SKIP_REASON (DEF-4), not drift_recheck_failed", async () => {
    const tx = driftLockedTx({ archived: true, recheckOk: false });
    const deps = driftDeps();
    const result = await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      deps,
      readyPrepared(true),
    );

    expect(result).toEqual({ outcome: "skipped", reason: ARCHIVED_SKIP_REASON });
    // The DEF-4 archived re-read fires FIRST — the drift recheck is never reached.
    expect(recheckIssued(tx)).toBe(false);
    expect(deps.runPhase1).not.toHaveBeenCalled();
    expect(tx.writes).toEqual([]);
  });

  test("non-drift cron run: recheck query is NEVER issued", async () => {
    const tx = driftLockedTx({ recheckOk: false });
    // Short-circuit Phase 1 to a `stage` outcome so no Phase-2 apply surface is needed.
    const deps = driftDeps({
      runPhase1: vi.fn(async () => ({
        outcome: "stage" as const,
        stagedId: "staged-1",
        triggeredReviewItems: [],
      })),
    });
    const result = await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      deps,
      readyPrepared(false),
    );

    expect(recheckIssued(tx)).toBe(false);
    expect(result).toEqual({ outcome: "stage", stagedId: "staged-1" });
    expect(deps.runPhase1).toHaveBeenCalledOnce();
  });
});

/**
 * Task 5: the driftResync marker is threaded from the "ready" pipeline into the Phase 2 args
 * object so runPhase2_unlocked can relax the stale CAS to less_than_or_equal (spec §3.3). Assert
 * the args object handed to deps.runPhase2 carries (or omits) driftResync per the pipeline flag.
 * Uses an auto_publish_ready Phase 1 outcome so priorShow is null (no readShowForPhase1 surface
 * needed); the tail past runPhase2 may throw on the minimal fake tx, which is irrelevant — the
 * assertion is on the recorded runPhase2 call args.
 */
describe("role-vocab drift resync Phase 2 args threading (processOneFile_unlocked)", () => {
  async function driveToPhase2(driftResync: boolean) {
    const tx = driftLockedTx({ recheckOk: true });
    const runPhase2 = vi.fn(async () => ({
      outcome: "applied" as const,
      appliedRoleMappings: [],
      showId: "show-1",
      parseWarnings: [],
    }));
    const deps = driftDeps({
      runPhase1: vi.fn(async () => ({ outcome: "auto_publish_ready" as const })),
      runPhase2,
    });
    await processOneFile_unlocked(
      tx as unknown as LockedShowTx<SyncPipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      deps,
      readyPrepared(driftResync),
    ).catch(() => undefined);
    return runPhase2;
  }

  test("driftResync run: runPhase2 args carry driftResync:true", async () => {
    const runPhase2 = await driveToPhase2(true);
    expect(runPhase2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ driftResync: true }),
    );
  });

  test("non-drift run: runPhase2 args omit driftResync", async () => {
    const runPhase2 = await driveToPhase2(false);
    expect(runPhase2).toHaveBeenCalledTimes(1);
    expect(runPhase2.mock.calls[0]?.[1]).not.toHaveProperty("driftResync");
  });
});

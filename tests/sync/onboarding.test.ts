import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { CrewMemberRow, ParsedSheet, ParseResult, RoomRow } from "@/lib/parser/types";
import type { Phase1PendingIngestionRow, Phase1PendingSyncRow, Phase1Tx } from "@/lib/sync/phase1";
import {
  ONBOARDING_PREPARE_CONCURRENCY,
  type RunOnboardingScanDeps,
} from "@/lib/sync/runOnboardingScan";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

type FakeManifest = {
  folderId: string;
  wizardSessionId: string;
  driveFileId: string;
  mimeType: string;
  name: string;
  status: string;
};

function crew(name: string): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function room(name = "General Session"): RoomRow {
  return {
    kind: "gs",
    name,
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
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Onboarding Show",
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
      coi_status: "Pending",
      po: "PO-1",
      proposal: "Proposal-1",
      invoice: "Invoice-1",
      invoice_notes: null,
    },
    crewMembers: [crew("Alice")],
    hotelReservations: [],
    rooms: [room()],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

function file(driveFileId: string, name = `${driveFileId}.xlsx`): DriveListedFile {
  return {
    driveFileId,
    name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

class FakeOnboardingTx implements Phase1Tx {
  activeWizardSessionId = W1;
  indexesPresent = true;
  pendingSyncs: Phase1PendingSyncRow[] = [];
  pendingIngestions: Array<Phase1PendingIngestionRow & { discoveredDuringFolderId: string }> = [];
  manifest: FakeManifest[] = [];
  syncLog: Array<{ code: string; driveFileId?: string; payload?: Record<string, unknown> }> = [];
  adminAlerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }> =
    [];
  operations: string[] = [];
  superseded = false;
  conflictOnPendingSync: "42P10" | "23505" | null = null;

  async ensureWizardIsolationIndexes() {
    this.operations.push("ensureWizardIsolationIndexes");
    return this.indexesPresent
      ? ({ ok: true } as const)
      : ({
          ok: false,
          missing: [
            "pending_syncs_live_drive_file_idx",
            "pending_syncs_session_drive_file_idx",
            "pending_ingestions_live_drive_file_idx",
            "pending_ingestions_session_drive_file_idx",
          ] as string[],
        } as const);
  }

  async readShowForPhase1() {
    return null;
  }

  async readLivePendingSync(driveFileId: string) {
    return (
      this.pendingSyncs.find(
        (row) =>
          row.driveFileId === driveFileId && row.wizardSessionId === this.activeWizardSessionId,
      ) ?? null
    );
  }

  async upsertLivePendingIngestion(row: Phase1PendingIngestionRow) {
    this.operations.push(`upsertWizardPendingIngestion:${row.driveFileId}`);
    if (row.wizardSessionId !== this.activeWizardSessionId) {
      this.superseded = true;
      return;
    }
    this.pendingIngestions = this.pendingIngestions.filter(
      (existing) =>
        !(
          existing.driveFileId === row.driveFileId &&
          existing.wizardSessionId === row.wizardSessionId
        ),
    );
    this.pendingIngestions.push({ ...row, discoveredDuringFolderId: "folder-1" });
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    this.pendingIngestions = this.pendingIngestions.filter(
      (row) =>
        !(row.driveFileId === driveFileId && row.wizardSessionId === this.activeWizardSessionId),
    );
  }

  async upsertLivePendingSync(row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string }) {
    this.operations.push(`upsertWizardPendingSync:${row.driveFileId}`);
    if (this.conflictOnPendingSync) {
      throw Object.assign(new Error("partial-index conflict"), {
        code: this.conflictOnPendingSync,
      });
    }
    if (row.wizardSessionId !== this.activeWizardSessionId) {
      this.superseded = true;
      return { stagedId: "" };
    }
    const stagedId = row.stagedId ?? `staged-${row.driveFileId}`;
    this.pendingSyncs = this.pendingSyncs.filter(
      (existing) =>
        !(
          existing.driveFileId === row.driveFileId &&
          existing.wizardSessionId === row.wizardSessionId
        ),
    );
    this.pendingSyncs.push({ ...row, stagedId });
    return { stagedId };
  }

  async updateShowParseError() {
    throw new Error("onboarding scan must not mutate shows");
  }

  async updateShowPendingReview() {
    throw new Error("onboarding scan must not mutate shows");
  }

  async deleteWizardPendingSyncsExcept(wizardSessionId: string) {
    this.pendingSyncs = this.pendingSyncs.filter((row) => row.wizardSessionId === wizardSessionId);
  }

  async upsertManifest(row: FakeManifest) {
    this.operations.push(`upsertManifest:${row.driveFileId}:${row.status}`);
    if (row.wizardSessionId !== this.activeWizardSessionId) {
      this.superseded = true;
      return false;
    }
    this.manifest = this.manifest.filter(
      (existing) =>
        !(
          existing.driveFileId === row.driveFileId &&
          existing.wizardSessionId === row.wizardSessionId
        ),
    );
    this.manifest.push(row);
    return true;
  }

  async logSync(entry: { code: string; driveFileId?: string; payload?: Record<string, unknown> }) {
    this.syncLog.push(entry);
  }

  async upsertAdminAlert(input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }): Promise<string | null> {
    this.adminAlerts.push(input);
    return "alert-1";
  }

  async queryOne<T>() {
    return { held: true, locked: true } as T;
  }
}

async function runWith(
  tx: FakeOnboardingTx,
  files: DriveListedFile[],
  parseResults: Record<string, ParseResult>,
  overrides: Partial<RunOnboardingScanDeps> = {},
) {
  vi.resetModules();
  const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
  const result = await runOnboardingScan("folder-1", W1, {
    tx,
    listFolder: vi.fn(async () => files),
    captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
      bindingToken: meta.modifiedTime,
      modifiedTime: meta.modifiedTime,
    })),
    fetchMarkdownAtRevision: vi.fn(async (driveFileId: string) => `markdown:${driveFileId}`),
    parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async (parsed: ParsedSheet) => {
      const driveFileId = (parsed as unknown as { markdown: string }).markdown.replace(
        "markdown:",
        "",
      );
      return parseResults[driveFileId] ?? parseResult();
    }),
    ...overrides,
  });
  return { result };
}

describe("runOnboardingScan", () => {
  test("runs Phase 1 only and stages wizard-scoped pending_syncs plus manifest rows", async () => {
    const tx = new FakeOnboardingTx();

    const { result } = await runWith(tx, [file("file-1")], {
      "file-1": parseResult(),
    });

    expect(result).toMatchObject({ outcome: "completed" });
    expect(tx.pendingSyncs).toMatchObject([
      {
        driveFileId: "file-1",
        wizardSessionId: W1,
        sourceKind: "onboarding_scan",
        triggeredReviewItems: [expect.objectContaining({ invariant: "ONBOARDING_SCAN_REVIEW" })],
      },
    ]);
    expect(tx.manifest).toEqual([
      {
        folderId: "folder-1",
        wizardSessionId: W1,
        driveFileId: "file-1",
        mimeType: "application/vnd.google-apps.spreadsheet",
        name: "file-1.xlsx",
        status: "staged",
      },
    ]);
  });

  test("assert-fails unexpected Phase 1 defer outcomes instead of silently dropping the file", async () => {
    const tx = new FakeOnboardingTx();

    const { result } = await runWith(
      tx,
      [file("file-1")],
      { "file-1": parseResult() },
      {
        runPhase1: vi.fn(async () => ({
          outcome: "defer" as const,
          reason: "mi8_modtime_unstable" as const,
        })),
      },
    );

    expect(result).toMatchObject({ outcome: "completed" });
    expect(tx.manifest).toMatchObject([
      {
        driveFileId: "file-1",
        status: "hard_failed",
      },
    ]);
    expect(tx.syncLog).toEqual([
      {
        code: "onboarding_scan_unexpected_phase1_defer",
        driveFileId: "file-1",
        payload: { reason: "mi8_modtime_unstable" },
      },
    ]);
  });

  test("hard failures write wizard-scoped pending_ingestions and hard_failed manifest rows", async () => {
    const tx = new FakeOnboardingTx();

    await runWith(tx, [file("file-1")], {
      "file-1": parseResult({
        hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "missing version" }],
      }),
    });

    expect(tx.pendingIngestions).toMatchObject([
      {
        driveFileId: "file-1",
        wizardSessionId: W1,
        discoveredDuringFolderId: "folder-1",
        lastErrorCode: "MI-1_VERSION_DETECTION_FAILED",
      },
    ]);
    expect(tx.manifest).toMatchObject([{ driveFileId: "file-1", status: "hard_failed" }]);
  });

  test("missing wizard-isolation indexes abort before onboarding upserts", async () => {
    const tx = new FakeOnboardingTx();
    tx.indexesPresent = false;

    const { result } = await runWith(tx, [file("file-1")], { "file-1": parseResult() });

    expect(result).toMatchObject({
      outcome: "schema_missing",
      code: "WIZARD_ISOLATION_INDEXES_MISSING",
    });
    expect(tx.operations).toEqual(["ensureWizardIsolationIndexes"]);
    expect(tx.syncLog).toEqual([
      expect.objectContaining({ code: "onboarding_scan_aborted_migration_state" }),
    ]);
  });

  test("wizard-session CAS supersession stops later rows without live-row conflict", async () => {
    const tx = new FakeOnboardingTx();
    const originalUpsert = tx.upsertLivePendingSync.bind(tx);
    tx.upsertLivePendingSync = async (row) => {
      if (row.driveFileId === "file-2") tx.activeWizardSessionId = W2;
      return originalUpsert(row);
    };

    const { result } = await runWith(tx, [file("file-1"), file("file-2"), file("file-3")], {
      "file-1": parseResult(),
      "file-2": parseResult(),
      "file-3": parseResult(),
    });

    expect(result).toMatchObject({
      outcome: "superseded",
      code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
    });
    expect(tx.pendingSyncs.map((row) => row.driveFileId)).toEqual(["file-1"]);
    expect(tx.manifest.map((row) => row.driveFileId)).toEqual(["file-1"]);
    expect(tx.syncLog).toEqual([
      expect.objectContaining({ code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN" }),
    ]);
    expect(tx.syncLog).not.toEqual([expect.objectContaining({ code: "LIVE_ROW_CONFLICT" })]);
  });

  test("partial-index SQLSTATE conflict writes live_row_conflict manifest and continues", async () => {
    const tx = new FakeOnboardingTx();
    const originalUpsert = tx.upsertLivePendingSync.bind(tx);
    tx.upsertLivePendingSync = async (row) => {
      tx.conflictOnPendingSync = row.driveFileId === "file-1" ? "42P10" : null;
      return originalUpsert(row);
    };

    const { result } = await runWith(tx, [file("file-1"), file("file-2")], {
      "file-1": parseResult(),
      "file-2": parseResult(),
    });

    expect(result).toMatchObject({ outcome: "completed" });
    expect(tx.manifest).toEqual([
      expect.objectContaining({ driveFileId: "file-1", status: "live_row_conflict" }),
      expect.objectContaining({ driveFileId: "file-2", status: "staged" }),
    ]);
    expect(tx.syncLog).toEqual([
      expect.objectContaining({
        code: "onboarding_scan_live_row_conflict",
        driveFileId: "file-1",
        payload: expect.objectContaining({ sqlstate: "42P10", kind: "invalid_arbiter_inference" }),
      }),
    ]);
    expect(tx.adminAlerts).toEqual([
      {
        showId: null,
        code: "LIVE_ROW_CONFLICT",
        context: expect.objectContaining({
          drive_file_id: "file-1",
          file_name: "file-1.xlsx",
          sqlstate: "42P10",
          kind: "invalid_arbiter_inference",
          wizard_session_id: W1,
        }),
      },
    ]);
  });

  test("session superseded between aborted per-file tx and recovery tx returns superseded with no recovery artifacts", async () => {
    const tx = new FakeOnboardingTx();
    const originalUpsert = tx.upsertLivePendingSync.bind(tx);
    tx.upsertLivePendingSync = async (row) => {
      if (row.driveFileId === "file-1") {
        // Cancel/restart race: the wizard session is superseded after the
        // conflicting statement aborts the per-file tx but before the fresh
        // recovery tx runs — its upsertManifest must observe the mismatch.
        tx.activeWizardSessionId = W2;
        tx.conflictOnPendingSync = "42P10";
      } else {
        tx.conflictOnPendingSync = null;
      }
      return originalUpsert(row);
    };

    const { result } = await runWith(tx, [file("file-1"), file("file-2")], {
      "file-1": parseResult(),
      "file-2": parseResult(),
    });

    expect(result).toMatchObject({
      outcome: "superseded",
      code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
      processed: [],
    });
    // No recovery artifacts for the inactive session: no manifest row, no
    // LIVE_ROW_CONFLICT admin alert, no live-row-conflict sync_log entry.
    expect(tx.manifest).toEqual([]);
    expect(tx.adminAlerts).toEqual([]);
    expect(tx.syncLog).toEqual([
      expect.objectContaining({ code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN" }),
    ]);
  });

  test("unexpected onboarding Phase 1 pass writes hard_failed manifest instead of fake staged row", async () => {
    const tx = new FakeOnboardingTx();
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");

    const result = await runOnboardingScan("folder-1", W1, {
      tx,
      listFolder: vi.fn(async () => [file("file-1")]),
      captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
        bindingToken: meta.modifiedTime,
        modifiedTime: meta.modifiedTime,
      })),
      fetchMarkdownAtRevision: vi.fn(async () => "markdown:file-1"),
      parseSheet: vi.fn(() => ({ markdown: "markdown:file-1" }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async () => parseResult()),
      runPhase1: vi.fn(async () => ({ outcome: "pass" as const })),
    });

    expect(result).toMatchObject({ outcome: "completed" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.manifest).toEqual([
      expect.objectContaining({ driveFileId: "file-1", status: "hard_failed" }),
    ]);
    expect(tx.syncLog).toEqual([
      expect.objectContaining({
        code: "onboarding_scan_unexpected_phase1_pass",
        driveFileId: "file-1",
      }),
    ]);
  });

  test("serializes concurrent wizard pending writes for the same drive_file_id with the show advisory lock", async () => {
    vi.resetModules();
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
    const tx1 = new FakeOnboardingTx();
    const tx2 = new FakeOnboardingTx();
    const events: string[] = [];
    let held = false;
    let releaseCurrent!: () => void;
    const waiters: Array<() => void> = [];
    const releaseFirst = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    let firstStarted = false;

    const withShowLock = vi.fn(
      async (
        driveFileId: string,
        fn: (lockedTx: unknown) => Promise<unknown>,
        options?: { tx?: unknown },
      ) => {
        events.push(`request:${driveFileId}`);
        if (held) {
          events.push(`wait:${driveFileId}`);
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
        held = true;
        events.push(`start:${driveFileId}`);
        try {
          if (!firstStarted) {
            firstStarted = true;
            await releaseFirst;
          }
          return await fn(options?.tx);
        } finally {
          events.push(`commit:${driveFileId}`);
          held = false;
          waiters.shift()?.();
        }
      },
    );

    const scanDeps = (tx: FakeOnboardingTx) =>
      ({
        tx,
        withShowLock,
        listFolder: vi.fn(async () => [file("file-1")]),
        captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
          bindingToken: meta.modifiedTime,
          modifiedTime: meta.modifiedTime,
        })),
        fetchMarkdownAtRevision: vi.fn(async () => "markdown:file-1"),
        parseSheet: vi.fn(() => ({ markdown: "markdown:file-1" }) as unknown as ParsedSheet),
        enrichWithDrivePins: vi.fn(async () => parseResult()),
      }) as unknown as RunOnboardingScanDeps;

    const first = runOnboardingScan("folder-1", W1, scanDeps(tx1));
    await vi.waitFor(() => expect(events).toContain("start:file-1"));
    const second = runOnboardingScan("folder-1", W1, scanDeps(tx2));
    await vi.waitFor(() => expect(events).toContain("wait:file-1"));
    releaseCurrent();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ outcome: "completed" }),
      expect.objectContaining({ outcome: "completed" }),
    ]);
    expect(events).toEqual([
      "request:file-1",
      "start:file-1",
      "request:file-1",
      "wait:file-1",
      "commit:file-1",
      "start:file-1",
      "commit:file-1",
    ]);
  });

  test("prepares sheets concurrently (bounded) while preserving listed order", async () => {
    vi.resetModules();
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
    const tx = new FakeOnboardingTx();

    // More files than the concurrency cap so the test pins BOTH that prepare
    // overlaps (parallel) AND that it never exceeds the cap (bounded).
    const fileCount = ONBOARDING_PREPARE_CONCURRENCY + 4;
    const files = Array.from({ length: fileCount }, (_, i) => file(`file-${i + 1}`));
    const parseResults: Record<string, ParseResult> = Object.fromEntries(
      files.map((f) => [f.driveFileId, parseResult()]),
    );

    let active = 0;
    let maxActive = 0;
    const completionOrder: string[] = [];
    // Stagger per-file delays so EARLIER files (file-1 …) finish LAST. This
    // forces preparation to complete out of input order, so the manifest-order
    // assertion below is a real proof that the parallel prepare reassembles
    // results by INPUT index — a completion-order implementation would scramble
    // the manifest. (Uniform delays could let a broken impl pass by luck.)
    const delayFor = (driveFileId: string) => {
      const index = Number(driveFileId.replace("file-", "")); // 1-based
      return 5 + (fileCount - index) * 4;
    };
    const fetchMarkdownAtRevision = vi.fn(async (driveFileId: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delayFor(driveFileId)));
      active -= 1;
      completionOrder.push(driveFileId);
      return `markdown:${driveFileId}`;
    });

    const result = await runOnboardingScan("folder-1", W1, {
      tx,
      listFolder: vi.fn(async () => files),
      captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
        bindingToken: meta.modifiedTime,
        modifiedTime: meta.modifiedTime,
      })),
      fetchMarkdownAtRevision,
      parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async (parsed: ParsedSheet) => {
        const driveFileId = (parsed as unknown as { markdown: string }).markdown.replace(
          "markdown:",
          "",
        );
        return parseResults[driveFileId] ?? parseResult();
      }),
    });

    const inputOrder = files.map((f) => f.driveFileId);

    expect(result).toMatchObject({ outcome: "completed" });
    // Parallel up to the cap, never beyond it. Sequential prepare → 1.
    expect(maxActive).toBe(ONBOARDING_PREPARE_CONCURRENCY);
    // Premise guard: preparation genuinely completed out of input order, so the
    // manifest-order assertion below is a real proof, not a coincidence of
    // uniform timing.
    expect(completionOrder).not.toEqual(inputOrder);
    // The lock-ordered scan phase still processes files in listed order, so the
    // manifest order must equal the input order despite out-of-order preparation.
    expect(tx.manifest.map((row) => row.driveFileId)).toEqual(inputOrder);
  });

  test("reuses one scan connection for the readiness probe and every per-file transaction", async () => {
    vi.resetModules();
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
    const tx = new FakeOnboardingTx();
    let opened = 0;
    let closed = 0;
    let withTxCalls = 0;
    const createScanTxRunner = vi.fn((_folderId: string, _wizardSessionId: string) => {
      opened += 1;
      return {
        withTx: async <R>(fn: (t: typeof tx) => Promise<R> | R): Promise<R> => {
          withTxCalls += 1;
          return await fn(tx);
        },
        close: async () => {
          closed += 1;
        },
      };
    });

    const files = [file("file-1"), file("file-2"), file("file-3")];
    const result = await runOnboardingScan("folder-1", W1, {
      createScanTxRunner: createScanTxRunner as unknown as NonNullable<
        RunOnboardingScanDeps["createScanTxRunner"]
      >,
      listFolder: vi.fn(async () => files),
      captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
        bindingToken: meta.modifiedTime,
        modifiedTime: meta.modifiedTime,
      })),
      fetchMarkdownAtRevision: vi.fn(async (driveFileId: string) => `markdown:${driveFileId}`),
      parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async () => parseResult()),
    });

    expect(result).toMatchObject({ outcome: "completed" });
    // ONE connection opened (and closed) for readiness + all three files — not 1 + N.
    expect(opened).toBe(1);
    expect(closed).toBe(1);
    // readiness probe + one transaction per file, all on that single connection.
    expect(withTxCalls).toBe(1 + files.length);
    expect(tx.manifest.map((row) => row.driveFileId)).toEqual(["file-1", "file-2", "file-3"]);
  });
});

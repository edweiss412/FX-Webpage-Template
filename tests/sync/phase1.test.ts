import { afterEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type {
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  RoomRow,
  TriggeredReviewItem,
} from "@/lib/parser/types";

type FakeShowRow = {
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  priorParseResult: ParseResult;
};

type FakePendingSync = {
  driveFileId: string;
  wizardSessionId: string | null;
  baseModifiedTime: string | null;
  stagedModifiedTime: string;
  parseResult: ParseResult;
  triggeredReviewItems: TriggeredReviewItem[];
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
  stagedId: string;
  sourceKind: string;
  warningSummary: string;
};

type FakePendingIngestion = {
  driveFileId: string;
  wizardSessionId: string | null;
  driveFileName: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  lastWarnings: unknown[];
  lastSeenModifiedTime: string;
};

function crew(name: string, overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...overrides,
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

function hotel(ordinal: number): HotelReservationRow {
  return {
    ordinal,
    hotel_name: `Hotel ${ordinal}`,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

function contact(name: string): ContactRow {
  return {
    kind: "venue",
    name,
    email: `${name.toLowerCase()}@venue.example`,
    phone: null,
    notes: null,
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Show Title",
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
      invoice_notes: "Notes",
    },
    crewMembers: [crew("Alice")],
    hotelReservations: [hotel(1)],
    rooms: [room()],
    transportation: null,
    contacts: [contact("Kurt")],
    pullSheet: [{ caseLabel: "A", items: [{ qty: 1, cat: null, subCat: null, item: "Cable" }] }],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

class FakePhase1Tx {
  shows = new Map<string, FakeShowRow>();
  pendingSyncs: FakePendingSync[] = [];
  pendingIngestions: FakePendingIngestion[] = [];
  operations: string[] = [];

  async readShowForPhase1(driveFileId: string) {
    this.operations.push(`readShow:${driveFileId}`);
    return this.shows.get(driveFileId) ?? null;
  }

  async readLivePendingSync(driveFileId: string) {
    this.operations.push(`readLivePendingSync:${driveFileId}:wizard_session_id IS NULL`);
    return (
      this.pendingSyncs.find(
        (row) => row.driveFileId === driveFileId && row.wizardSessionId === null,
      ) ?? null
    );
  }

  async upsertLivePendingIngestion(row: FakePendingIngestion) {
    this.operations.push(`upsertLivePendingIngestion:${row.driveFileId}`);
    this.pendingIngestions = this.pendingIngestions.filter(
      (existing) => !(existing.driveFileId === row.driveFileId && existing.wizardSessionId === null),
    );
    this.pendingIngestions.push(row);
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    this.operations.push(`deleteLivePendingIngestion:${driveFileId}:wizard_session_id IS NULL`);
    this.pendingIngestions = this.pendingIngestions.filter(
      (existing) => !(existing.driveFileId === driveFileId && existing.wizardSessionId === null),
    );
  }

  async upsertLivePendingSync(row: Omit<FakePendingSync, "stagedId"> & { stagedId?: string }) {
    this.operations.push(`upsertLivePendingSync:${row.driveFileId}`);
    const existing = this.pendingSyncs.find(
      (pending) => pending.driveFileId === row.driveFileId && pending.wizardSessionId === null,
    );
    const stagedId =
      existing && existing.stagedModifiedTime === row.stagedModifiedTime
        ? existing.stagedId
        : (row.stagedId ?? "new-staged-id");
    const next: FakePendingSync = { ...row, stagedId };
    this.pendingSyncs = this.pendingSyncs.filter(
      (pending) => !(pending.driveFileId === row.driveFileId && pending.wizardSessionId === null),
    );
    this.pendingSyncs.push(next);
    return { stagedId };
  }

  async updateShowParseError(driveFileId: string, error: { code: string; message: string }) {
    this.operations.push(`updateShowParseError:${driveFileId}`);
    const row = this.shows.get(driveFileId);
    if (row) {
      row.lastSyncStatus = "parse_error";
      row.lastSyncError = `${error.code}: ${error.message}`;
    }
  }

  async updateShowPendingReview(driveFileId: string) {
    this.operations.push(`updateShowPendingReview:${driveFileId}`);
    const row = this.shows.get(driveFileId);
    if (row) {
      row.lastSyncStatus = "pending_review";
      row.lastSyncError = null;
    }
  }

  async deleteWizardPendingSyncsExcept(wizardSessionId: string) {
    this.operations.push(`deleteWizardPendingSyncsExcept:${wizardSessionId}`);
    this.pendingSyncs = this.pendingSyncs.filter(
      (row) => row.wizardSessionId === null || row.wizardSessionId === wizardSessionId,
    );
  }
}

const baseArgs = {
  driveFileId: "file-1",
  mode: "cron" as const,
  fileMeta: fileMeta(),
  binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
};

type FlagResult = { kind: "value"; autoPublish: boolean } | { kind: "infra_error" };
async function runWith(
  tx: FakePhase1Tx,
  next: ParseResult,
  overrides = {},
  deps: { getAutoPublishCleanFirstSeen?: () => Promise<FlagResult> } = {
    // Default the auto-publish flag ON so existing first-seen tests stay hermetic (no real DB read).
    getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: true }),
  },
) {
  vi.resetModules();
  const { runPhase1 } = await import("@/lib/sync/phase1");
  return runPhase1(tx, { ...baseArgs, parseResult: next, ...overrides }, deps);
}

describe("runPhase1 routing and writes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not acquire advisory locks or open transaction boundaries", async () => {
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    await runWith(tx, parseResult());

    expect(tx.operations.join("\n")).not.toMatch(/pg_.*advisory|BEGIN|COMMIT|ROLLBACK/i);
  });

  test.each([
    [
      "MI-1_VERSION_DETECTION_FAILED",
      parseResult({ hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "no version" }] }),
    ],
    ["MI-2_EMPTY_TITLE", parseResult({ show: { ...parseResult().show, title: "" } })],
    [
      "MI-3_NO_VALID_DATES",
      parseResult({
        show: {
          ...parseResult().show,
          dates: { travelIn: null, set: null, showDays: [], travelOut: null },
        },
      }),
    ],
    ["MI-4_NO_CREW", parseResult({ crewMembers: [] })],
    ["MI-5_NO_ROOMS", parseResult({ rooms: [] })],
    ["MI-5a_DUPLICATE_CREW_NAME", parseResult({ crewMembers: [crew("Alice"), crew("Alice")] })],
    [
      "MI-5b_DUPLICATE_CREW_EMAIL",
      parseResult({
        crewMembers: [
          crew("Alice", { email: "alice@example.com" }),
          crew("Alicia", { email: "ALICE@example.com" }),
        ],
      }),
    ],
  ])("first-seen %s hard-fails into pending_ingestions before auto-publish", async (code, next) => {
    const tx = new FakePhase1Tx();

    const result = await runWith(tx, next);

    expect(result).toMatchObject({ outcome: "hard_fail", code });
    expect(tx.pendingIngestions).toMatchObject([
      {
        driveFileId: "file-1",
        wizardSessionId: null,
        driveFileName: "Show Sheet",
        lastErrorCode: code,
        lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      },
    ]);
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("first-seen parseable live sheets return auto_publish_ready without staging", async () => {
    const tx = new FakePhase1Tx();

    const result = await runWith(tx, parseResult());

    expect(result).toEqual({ outcome: "auto_publish_ready" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.pendingIngestions).toEqual([]);
  });

  test("first-seen live sheets with asset review items auto-publish (Phase 2: asset items are notifications, never staged)", async () => {
    const tx = new FakePhase1Tx();

    const result = await runWith(
      tx,
      parseResult({
        warnings: [
          {
            severity: "warn",
            code: "DIAGRAMS_EMBEDDED_NONE_FOUND",
            message: "No embedded diagrams were found.",
          },
        ],
      }),
    );

    // Phase 2 Task 2.1 (PF34): asset/sync-layer items auto-apply (notification-only feed rows),
    // never route to a live pending_sync stage. A first-seen sheet with only such items still
    // reaches auto_publish_ready (the clean-first-seen FIRST_SEEN_REVIEW injection only fires when
    // there are zero review items, which is intact, but asset items are no longer staged either).
    expect(result.outcome).toBe("auto_publish_ready");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("Task 4.2: auto-publish OFF stages a CLEAN first-seen as FIRST_SEEN_REVIEW (not auto_publish_ready)", async () => {
    const tx = new FakePhase1Tx();
    const result = await runWith(tx, parseResult(), {}, {
      getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: false }),
    });
    expect(result.outcome).toBe("stage");
    expect(tx.pendingSyncs[0]?.triggeredReviewItems).toEqual([
      expect.objectContaining({ invariant: "FIRST_SEEN_REVIEW" }),
    ]);
  });

  test("Task 4.2 + Phase 2: auto-publish OFF + asset-item first-seen auto-publishes (asset items are not 'clean' but no longer staged)", async () => {
    const tx = new FakePhase1Tx();
    const result = await runWith(
      tx,
      parseResult({
        warnings: [
          { severity: "warn", code: "DIAGRAMS_EMBEDDED_NONE_FOUND", message: "No embedded diagrams were found." },
        ],
      }),
      {},
      { getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: false }) },
    );
    // Phase 2 (PF34): the asset item auto-applies (no stage). Because reviewItems is non-empty,
    // the clean-first-seen FIRST_SEEN_REVIEW injection does NOT fire, so this falls through to
    // auto_publish_ready. The auto-publish OFF flag only gates a CLEAN first-seen (zero review items).
    expect(result.outcome).toBe("auto_publish_ready");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("Task 4.2: a flag-read infra_error does NOT auto-publish — it throws (sync is retried)", async () => {
    const tx = new FakePhase1Tx();
    await expect(
      runWith(tx, parseResult(), {}, {
        getAutoPublishCleanFirstSeen: async () => ({ kind: "infra_error" }),
      }),
    ).rejects.toThrow(/Phase1InfraError|getAutoPublishCleanFirstSeen|flag read failed/);
    expect(tx.pendingSyncs).toEqual([]); // no stage, no auto-publish
  });

  test("warningSummary renders human messages, never raw parser codes (no-raw-error-codes invariant 5)", async () => {
    const tx = new FakePhase1Tx();
    // Phase 2: existing-show routine MI changes no longer stage. The warningSummary is carried on a
    // staged pending_sync, which now only happens on the sentinel / clean-first-seen-OFF path. Use a
    // first-seen sheet with auto-publish OFF (these warnings are not review items, so the sheet is
    // 'clean' for review purposes → FIRST_SEEN_REVIEW stages and carries the summary).
    const withWarnings = parseResult({
      warnings: [
        {
          severity: "info",
          code: "TYPO_NORMALIZED",
          message: "Typo alias 'Hotal' normalized to canonical 'Hotel'",
          blockRef: { kind: "venue" },
        },
        {
          severity: "warn",
          code: "UNKNOWN_FIELD",
          message: "Unrecognized venue row label: 'CONTACT'",
          blockRef: { kind: "venue" },
        },
        {
          severity: "warn",
          code: "UNKNOWN_ROLE_TOKEN",
          message: "Unknown role token 'XR' for 'Calvin Saller' — dropped",
          blockRef: { kind: "crew" },
        },
      ],
    });

    const result = await runWith(tx, withWarnings, {}, {
      getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: false }),
    });
    expect(result.outcome).toBe("stage");

    const summary = tx.pendingSyncs[0]?.warningSummary ?? "";
    expect(summary, "summary must include the parser's human message").toContain(
      "Unrecognized venue row label: 'CONTACT'",
    );
    expect(summary, "summary must include the second human message").toContain(
      "Unknown role token 'XR' for 'Calvin Saller' — dropped",
    );
    // Admin-log-only info severity (TYPO_NORMALIZED) is filtered before reaching Doug.
    expect(summary, "TYPO_NORMALIZED severity=info is filtered").not.toContain(
      "Hotal",
    );
    // No raw parser code strings ever leak through.
    expect(summary).not.toContain("UNKNOWN_FIELD");
    expect(summary).not.toContain("UNKNOWN_ROLE_TOKEN");
    expect(summary).not.toContain("TYPO_NORMALIZED");
  });

  test("onboarding-scan parseable sheets stage with ONBOARDING_SCAN_REVIEW", async () => {
    const tx = new FakePhase1Tx();

    const result = await runWith(tx, parseResult(), {
      mode: "onboarding_scan",
      wizardSessionId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.outcome).toBe("stage");
    expect(tx.pendingSyncs[0]?.triggeredReviewItems).toEqual([
      expect.objectContaining({ invariant: "ONBOARDING_SCAN_REVIEW" }),
    ]);
  });

  test("onboarding-scan hard-fails without ONBOARDING_SCAN_REVIEW", async () => {
    const tx = new FakePhase1Tx();

    const result = await runWith(tx, parseResult({ crewMembers: [] }), {
      mode: "onboarding_scan",
      wizardSessionId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toMatchObject({ outcome: "hard_fail", code: "MI-4_NO_CREW" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.pendingIngestions[0]?.wizardSessionId).toBe("22222222-2222-4222-8222-222222222222");
  });

  test("existing-show hard fail is status-only and does not advance last_seen_modified_time", async () => {
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(tx, parseResult({ rooms: [] }));

    expect(result).toMatchObject({ outcome: "hard_fail", code: "MI-5_NO_ROOMS" });
    expect(tx.shows.get("file-1")).toMatchObject({
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "parse_error",
    });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.pendingIngestions).toEqual([]);
  });

  test("cron MI-8 financial collapse defers while Drive modifiedTime is unstable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:03:00.000Z"));
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(
      tx,
      parseResult({ show: { ...parseResult().show, po: null } }),
      { fileMeta: fileMeta(), mode: "cron" },
    );

    expect(result).toEqual({ outcome: "defer", reason: "mi8_modtime_unstable" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.pendingIngestions).toEqual([]);
    expect(tx.operations).toEqual(["readShow:file-1"]);
  });

  test("cron MI-8 financial collapse auto-applies after Drive modifiedTime is stable (Phase 2: MI-8 is notification-only)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:05:00.000Z"));
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(
      tx,
      parseResult({ show: { ...parseResult().show, po: null } }),
      { fileMeta: fileMeta(), mode: "cron" },
    );

    // The debounce still DEFERS while young; once stable, MI-8 is a field_changed notification → pass.
    expect(result.outcome).toBe("pass");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("cron MI-8b COI delta defers while Drive modifiedTime is unstable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:03:00.000Z"));
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(
      tx,
      parseResult({ show: { ...parseResult().show, coi_status: "Approved" } }),
      { fileMeta: fileMeta(), mode: "cron" },
    );

    expect(result).toEqual({ outcome: "defer", reason: "mi8b_modtime_unstable" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.operations).toEqual(["readShow:file-1"]);
  });

  test("cron MI-8b COI delta auto-applies after Drive modifiedTime is stable (Phase 2: notification-only)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:05:00.000Z"));
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(
      tx,
      parseResult({ show: { ...parseResult().show, coi_status: "Approved" } }),
      { fileMeta: fileMeta(), mode: "cron" },
    );

    expect(result.outcome).toBe("pass");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test.each(["manual", "onboarding_scan"] as const)(
    "%s mode bypasses MI-8 debounce even when Drive modifiedTime is young",
    async (mode) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-08T12:03:00.000Z"));
      const tx = new FakePhase1Tx();
      tx.shows.set("file-1", {
        driveFileId: "file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult(),
      });

      const result = await runWith(
        tx,
        parseResult({ show: { ...parseResult().show, po: null } }),
        { fileMeta: fileMeta(), mode },
      );

      if (mode === "onboarding_scan") {
        // The onboarding sentinel still stages regardless of the MI-8 change.
        expect(result.outcome).toBe("stage");
        expect(tx.pendingSyncs[0]?.triggeredReviewItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ invariant: "ONBOARDING_SCAN_REVIEW" }),
          ]),
        );
      } else {
        // Phase 2: manual still bypasses the debounce (no defer), but MI-8 now auto-applies → pass.
        expect(result.outcome).toBe("pass");
        expect(tx.operations).not.toContain("upsertLivePendingSync");
      }
    },
  );

  test("cron MI-8c structural pull-sheet collapse auto-applies immediately despite young Drive modifiedTime (Phase 2: notification-only, no MI-8 debounce)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:03:00.000Z"));
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(tx, parseResult({ pullSheet: null }), {
      fileMeta: fileMeta(),
      mode: "cron",
    });

    // MI-8c is not an MI-8/8b debounce member, so it never defers; it auto-applies → pass.
    expect(result.outcome).toBe("pass");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test.each([
    [
      "MI-6",
      parseResult({ crewMembers: ["A", "B", "C", "D", "E", "F", "G"].map((name) => crew(name)) }),
      parseResult({ crewMembers: ["A", "B", "C", "D"].map((name) => crew(name)) }),
    ],
    [
      "MI-7",
      parseResult({ hotelReservations: [hotel(1), hotel(2), hotel(3), hotel(4)] }),
      parseResult({ hotelReservations: [hotel(1)] }),
    ],
    [
      "MI-7b",
      parseResult({ rooms: [room("General Session"), room("Breakout")] }),
      parseResult({ rooms: [room("General Session")] }),
    ],
    ["MI-8", parseResult(), parseResult({ show: { ...parseResult().show, po: null } })],
    ["MI-8b", parseResult(), parseResult({ show: { ...parseResult().show, coi_status: "Approved" } })],
    ["MI-8c", parseResult(), parseResult({ pullSheet: null })],
    [
      "MI-9",
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["LEAD"] })] }),
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1"] })] }),
    ],
    [
      "MI-9",
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1"] })] }),
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1", "LEAD"] })] }),
    ],
    [
      "MI-11",
      parseResult({ crewMembers: [crew("Alice", { email: "alice@example.com" })] }),
      parseResult({ crewMembers: [crew("Alice", { email: "new@example.com" })] }),
    ],
    [
      "MI-12",
      parseResult({ crewMembers: [crew("Alice", { email: "same@example.com" })] }),
      parseResult({ crewMembers: [crew("Alicia", { email: "same@example.com" })] }),
    ],
    [
      "MI-13",
      parseResult({ crewMembers: [crew("Alice", { email: "alice@example.com" })] }),
      parseResult({ crewMembers: [crew("Alicia", { email: "alicia@example.com" })] }),
    ],
    [
      "MI-14",
      parseResult({ crewMembers: [crew("Alice", { email: null })] }),
      parseResult({ crewMembers: [crew("Alicia", { email: null })] }),
    ],
  ])(
    "existing-show %s: MI-11 routes to auto_apply_with_holds, every other invariant auto-applies (Phase 2 decision rule)",
    async (expectedInvariant, prior, next) => {
      const tx = new FakePhase1Tx();
      tx.shows.set("file-1", {
        driveFileId: "file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: prior,
      });

      const result = await runWith(tx, next);

      // The whole-parse live staging path is retired for existing shows: nothing routes to it.
      expect(tx.operations).not.toContain("upsertLivePendingSync");
      expect(tx.pendingSyncs).toEqual([]);

      if (expectedInvariant === "MI-11") {
        // MI-11 is the ONLY gated invariant → auto_apply_with_holds carrying the MI-11 items.
        expect(result.outcome).toBe("auto_apply_with_holds");
        if (result.outcome !== "auto_apply_with_holds") throw new Error("unreachable");
        expect(result.mi11Items).toEqual(
          expect.arrayContaining([expect.objectContaining({ invariant: "MI-11" })]),
        );
      } else {
        // Every other invariant (MI-6..MI-14 except MI-11) is a notification → auto-applies → pass.
        expect(result.outcome).toBe("pass");
      }
      // The legacy pending_review status flip no longer happens (no live stage for existing shows).
      expect(tx.shows.get("file-1")?.lastSyncStatus).toBe("ok");
    },
  );

  test.each([
    [
      "non-LEAD capability swap",
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1"] })] }),
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["V1"] })] }),
    ],
    [
      "non-LEAD additive capability",
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1"] })] }),
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["A1", "BO"] })] }),
    ],
    [
      "LEAD preserved while department changes",
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["LEAD", "A1"] })] }),
      parseResult({ crewMembers: [crew("Alice", { role_flags: ["LEAD", "V1"] })] }),
    ],
  ])("%s bypasses Phase 1 review under MI-9 LEAD-bit narrowing", async (_label, prior, next) => {
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: prior,
    });

    const result = await runWith(tx, next);

    expect(result.outcome).toBe("pass");
    expect(tx.pendingSyncs).toHaveLength(0);
    expect(tx.shows.get("file-1")?.lastSyncStatus).toBe("ok");
  });

  test("clean existing-show parse passes without pending writes", async () => {
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: parseResult(),
    });

    const result = await runWith(tx, parseResult());

    expect(result).toEqual({ outcome: "pass" });
    expect(tx.pendingSyncs).toEqual([]);
    expect(tx.pendingIngestions).toEqual([]);
  });

  test("Phase 2: an existing MI-7 section shrink auto-applies and never (re)writes a live pending_sync", async () => {
    const prior = parseResult({ hotelReservations: [hotel(1), hotel(2), hotel(3), hotel(4)] });
    const next = parseResult({ hotelReservations: [hotel(1)] });
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      priorParseResult: prior,
    });

    const result = await runWith(tx, next);

    // MI-7 is a section_shrunk notification → auto-applies. The whole-parse live staging path is
    // retired (PF31): the decision rule never calls upsertLivePendingSync for an existing show.
    expect(result.outcome).toBe("pass");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("onboarding scan purges pending rows from prior wizard sessions only", async () => {
    const tx = new FakePhase1Tx();
    tx.pendingSyncs.push(
      {
        driveFileId: "old-wizard-file",
        wizardSessionId: "11111111-1111-4111-8111-111111111111",
        baseModifiedTime: null,
        stagedModifiedTime: "2026-05-08T11:00:00.000Z",
        parseResult: parseResult(),
        triggeredReviewItems: [],
        priorLastSyncStatus: null,
        priorLastSyncError: null,
        stagedId: "old",
        sourceKind: "onboarding_scan",
        warningSummary: "",
      },
      {
        driveFileId: "current-wizard-file",
        wizardSessionId: "22222222-2222-4222-8222-222222222222",
        baseModifiedTime: null,
        stagedModifiedTime: "2026-05-08T11:00:00.000Z",
        parseResult: parseResult(),
        triggeredReviewItems: [],
        priorLastSyncStatus: null,
        priorLastSyncError: null,
        stagedId: "current",
        sourceKind: "onboarding_scan",
        warningSummary: "",
      },
    );

    await runWith(tx, parseResult(), {
      mode: "onboarding_scan",
      wizardSessionId: "22222222-2222-4222-8222-222222222222",
    });

    expect(tx.pendingSyncs.map((row) => row.driveFileId)).not.toContain("old-wizard-file");
    expect(tx.pendingSyncs.map((row) => row.driveFileId)).toContain("current-wizard-file");
  });
});

/**
 * Unit B (audit #14) regression pin — a first-seen `hard_fail` surfaces via a LIVE
 * (wizard_session_id NULL) `pending_ingestions` row, that row reaches the Needs-Attention inbox
 * as a catalog-safe `pending_ingestion` item + count, and a subsequent clean stage clears it.
 *
 * No production edit — HEAD already writes/clears the row at lib/sync/phase1.ts:366-377 & :486.
 * This is a coverage-only guard (teeth verified by temporarily deleting the else-branch — see
 * commit body). Asserts against the recorded tx row + buildNeedsAttention output + the
 * resolveIngestionCopy output, NOT a rendered container (anti-tautology).
 */
import { describe, expect, it, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Args, Phase1Binding, Phase1Tx } from "@/lib/sync/phase1";
import { runPhase1 } from "@/lib/sync/phase1";
import { buildNeedsAttention, resolveIngestionCopy } from "@/lib/admin/needsAttention";

function fileMeta(driveFileId: string, name: string): DriveListedFile {
  return {
    driveFileId,
    name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-01-01T00:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "rev-1",
  };
}

const BINDING: Phase1Binding = {
  bindingToken: "rev-1",
  modifiedTime: "2026-01-01T00:00:00.000Z",
};

/** A v4 sheet; `title: ""` fails MI-2 → first-seen hard_fail with failedCodes[0] === "MI-2_EMPTY_TITLE". */
function parsedSheet(title: string): ParsedSheet {
  return {
    show: {
      title,
      client_label: "QR",
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
    hardErrors: [],
  } as unknown as ParsedSheet;
}

const parseResult = (title: string): ParseResult => parsedSheet(title) as unknown as ParseResult;

type PendingIngestionRow = {
  driveFileId: string;
  wizardSessionId: string | null;
  driveFileName: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  lastWarnings: ParseResult["warnings"];
  lastSeenModifiedTime: string;
};

/** first-seen (readShowForPhase1 → null) fake tx recording ingestion upsert/delete + stage upsert. */
function makeFirstSeenTx() {
  const upsertLivePendingIngestion = vi.fn(async (_row: PendingIngestionRow) => {});
  const deleteLivePendingIngestion = vi.fn(async (_driveFileId: string) => {});
  const tx = {
    async readShowForPhase1() {
      return null; // first-seen
    },
    async readLivePendingSync() {
      return null;
    },
    upsertLivePendingIngestion,
    deleteLivePendingIngestion,
    async upsertLivePendingSync() {
      return { stagedId: "staged-1" };
    },
    async updateShowPendingReview() {},
    async updateShowParseError() {
      return null;
    },
  } as unknown as Phase1Tx;
  return { tx, upsertLivePendingIngestion, deleteLivePendingIngestion };
}

function cronArgs(driveFileId: string, name: string, title: string): Phase1Args {
  return {
    driveFileId,
    mode: "cron",
    fileMeta: fileMeta(driveFileId, name),
    parseResult: parseResult(title),
    binding: BINDING,
  };
}

describe("Unit B — first-seen hard_fail surfaces via live pending_ingestions", () => {
  it("writes a live (wizard_session_id NULL) pending row on a first-seen hard_fail", async () => {
    const { tx, upsertLivePendingIngestion } = makeFirstSeenTx();
    const result = await runPhase1(tx, cronArgs("file-b1", "Doug's Sheet", "")); // empty title → hard_fail

    expect(result.outcome).toBe("hard_fail");
    expect(upsertLivePendingIngestion).toHaveBeenCalledTimes(1);
    const row = upsertLivePendingIngestion.mock.calls[0]![0];
    expect(row.wizardSessionId, "cron port → LIVE row (null session)").toBeNull();
    // Derived from the fixture's actual hard-fail invariant (MI-2), NOT hardcoded.
    expect(row.lastErrorCode).toBe("MI-2_EMPTY_TITLE");
    expect(result.outcome === "hard_fail" && result.code).toBe("MI-2_EMPTY_TITLE");
    expect(row.driveFileName).toBe("Doug's Sheet");

    // Copy is catalog-safe — never a raw SCREAMING_CODE (invariant 5).
    const copy = resolveIngestionCopy({
      code: row.lastErrorCode,
      driveFileName: row.driveFileName,
    });
    expect(copy).not.toMatch(/[A-Z0-9]+_[A-Z0-9_]+/);
    expect(copy.length).toBeGreaterThan(0);
  });

  it("the live row reaches the Needs-Attention inbox as a pending_ingestion item + count", async () => {
    const { tx, upsertLivePendingIngestion } = makeFirstSeenTx();
    await runPhase1(tx, cronArgs("file-b2", "Second Sheet", ""));
    const row = upsertLivePendingIngestion.mock.calls[0]![0];

    // Feed the recorded LIVE row (session null) through buildNeedsAttention as an ingestion entry.
    const na = buildNeedsAttention({
      ingestions: [
        {
          id: "ingestion-1",
          driveFileId: row.driveFileId,
          driveFileName: row.driveFileName,
          lastErrorCode: row.lastErrorCode,
          lastAttemptAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 1, syncs: 0 },
    });

    const pendingItems = na.items.filter((i) => i.variant === "pending_ingestion");
    expect(
      pendingItems,
      "the live row must classify into one pending_ingestion inbox item",
    ).toHaveLength(1);
    const item = pendingItems[0]!;
    expect(item.variant === "pending_ingestion" && item.driveFileId).toBe(row.driveFileId);
    // Item copy IS the catalog-safe resolver output (never a raw code).
    expect(item.variant === "pending_ingestion" && item.copy).toBe(
      resolveIngestionCopy({ code: row.lastErrorCode, driveFileName: row.driveFileName }),
    );
    // The badge-visible total counts it (main-nav badge increments).
    expect(na.totalCount).toBeGreaterThanOrEqual(1);
    expect(na.ingestionTotal).toBe(1);
  });

  it("clears the row on a subsequent clean first-seen stage (deleteLivePendingIngestion)", async () => {
    const { tx, deleteLivePendingIngestion } = makeFirstSeenTx();
    // A CLEAN first-seen sheet with the auto-publish flag OFF stages a FIRST_SEEN_REVIEW, whose
    // branch deletes any stale live pending_ingestion row (phase1.ts:486).
    const result = await runPhase1(tx, cronArgs("file-b3", "Clean Sheet", "Real Title"), {
      getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: false }),
    });

    expect(result.outcome).toBe("stage");
    expect(deleteLivePendingIngestion).toHaveBeenCalledWith("file-b3");
  });
});

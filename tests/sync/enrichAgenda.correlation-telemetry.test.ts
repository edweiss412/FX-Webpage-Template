import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Finding #16: durability + correlation for the agenda-refresh telemetry.
//   1. Durability — `download`/`extracted` were info-WITHOUT-code (console-only). They now
//      carry AGENDA_PDF_DOWNLOADED / AGENDA_EXTRACTED so a successful refresh persists.
//   2. Correlation — the durable emits (gone/fault/link-unresolved/download/extracted) now
//      carry the link's Drive fileId as the RESERVED top-level `driveFileId` field so an
//      extraction failure self-joins to the exact PDF.
//
// Concrete failure mode this catches: "a successful refresh / extraction failure is
// ephemeral or un-joinable to a sheet." Real logger via setLogSink (top-level driveFileId
// is a RESERVED LogRecord field, not a context key) + a controlled extractor mock so the
// fresh download+extracted path is reached deterministically.

const extractMock = vi.fn();
vi.mock("@/lib/agenda/extractAgendaSchedule", () => ({
  extractAgendaSchedule: (bytes: Uint8Array, opts?: unknown) => extractMock(bytes, opts),
}));

import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { enrichAgenda } from "@/lib/sync/enrichAgenda";
import type { DriveClient, DriveFileMeta } from "@/lib/sync/enrichWithDrivePins";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { ParseResult } from "@/lib/parser/types";
import { EXTRACTOR_VERSION } from "@/lib/agenda/constants";
import { DriveFetchError } from "@/lib/drive/fetch";

type AgendaLink = { label: string; fileId?: string; url?: string; extracted?: AgendaExtraction };

function highExtraction(over: Partial<AgendaExtraction> = {}): AgendaExtraction {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: EXTRACTOR_VERSION,
    days: [
      {
        dayLabel: "Tue",
        date: null,
        sessions: [{ time: "9 AM", title: "Kickoff", room: null, tracks: [], drift: null }],
      },
    ],
    ...over,
  };
}

function meta(fileId: string, over: Partial<DriveFileMeta> = {}): DriveFileMeta {
  return {
    driveFileId: fileId,
    headRevisionId: `rev-${fileId}`,
    md5Checksum: "x".repeat(32),
    mimeType: "application/pdf",
    modifiedTime: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function makeResult(agendaLinks: AgendaLink[]): ParseResult {
  return { show: { agenda_links: agendaLinks }, warnings: [] } as unknown as ParseResult;
}

function makeClient(over: Partial<DriveClient> = {}): DriveClient {
  return {
    getFile: async (id: string) => meta(id),
    listFolder: async () => ({ folderId: "f", files: [] }),
    getAgendaChips: async () => ({ kind: "rows", rows: [] }),
    downloadFileBytes: async () => ({ kind: "bytes", bytes: new Uint8Array([0x25, 0x50]) }),
    ...over,
  } as unknown as DriveClient;
}

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}

beforeEach(() => {
  extractMock.mockReset();
  extractMock.mockResolvedValue(highExtraction());
});
afterEach(() => resetLogSink());

describe("enrichAgenda telemetry durability + correlation (finding #16)", () => {
  test("fresh refresh: download + extracted now carry their code AND driveFileId (persist-eligible)", async () => {
    const sink = capture();
    // No stored `extracted` → cache-miss → download + extract path runs → verdict fresh
    // (getFile returns rev-F1 before AND after, so revStable).
    await enrichAgenda(makeResult([{ label: "Agenda A", fileId: "F1" }]), makeClient(), "sheet-1");

    const download = sink.filter((r) => r.code === "AGENDA_PDF_DOWNLOADED");
    expect(download, "download emit is now coded → persist-eligible").toHaveLength(1);
    expect(download[0]!.level).toBe("info");
    expect(download[0]!.source).toBe("sync.enrichAgenda");
    expect(download[0]!.driveFileId, "download self-correlates to the PDF").toBe("F1");

    const extracted = sink.filter((r) => r.code === "AGENDA_EXTRACTED");
    expect(extracted, "extracted emit is now coded → persist-eligible").toHaveLength(1);
    expect(extracted[0]!.level).toBe("info");
    expect(extracted[0]!.source).toBe("sync.enrichAgenda");
    expect(extracted[0]!.driveFileId, "extracted self-correlates to the PDF").toBe("F1");
    // The verdict was actually reached (fresh), proving the emit is on the real refresh path.
    expect(extracted[0]!.context.verdict).toBe("fresh");
  });

  test("getFile 404 (gone): the durable AGENDA_GETFILE_GONE record carries driveFileId", async () => {
    const sink = capture();
    await enrichAgenda(
      makeResult([
        {
          label: "Agenda A",
          fileId: "F-DELETED",
          extracted: highExtraction({ sourceRevision: "rev-OLD" }),
        },
      ]),
      makeClient({
        getFile: async () => {
          throw new DriveFetchError("not found", 404);
        },
      }),
      "sheet-1",
    );
    const rec = sink.filter((r) => r.code === "AGENDA_GETFILE_GONE");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.driveFileId, "gone breadcrumb joins to the exact PDF").toBe("F-DELETED");
  });

  test("getFile 503 (fault): the durable AGENDA_GETFILE_FAULT record carries driveFileId", async () => {
    const sink = capture();
    await enrichAgenda(
      makeResult([{ label: "Agenda A", fileId: "F-THROTTLED", extracted: highExtraction() }]),
      makeClient({
        getFile: async () => {
          throw new DriveFetchError("unavailable", 503);
        },
      }),
      "sheet-1",
    );
    const rec = sink.filter((r) => r.code === "AGENDA_GETFILE_FAULT");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.driveFileId, "fault breadcrumb joins to the exact PDF").toBe("F-THROTTLED");
  });

  test("link with no resolvable fileId: AGENDA_LINK_UNRESOLVED persists (no driveFileId to add)", async () => {
    // The link has no fileId, so there is nothing to correlate — the record stays as-is
    // (spreadsheetId already present). Guards against a regression that would demand a
    // driveFileId that legitimately does not exist here.
    const sink = capture();
    await enrichAgenda(
      makeResult([{ label: "Agenda A", url: "agenda.pdf" }]),
      makeClient(),
      "sheet-1",
    );
    const rec = sink.filter((r) => r.code === "AGENDA_LINK_UNRESOLVED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.context.spreadsheetId).toBe("sheet-1");
    expect(rec[0]!.driveFileId).toBeNull();
  });
});

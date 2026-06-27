/**
 * tests/sync/enrichAgenda.test.ts (agenda Phase B, Task 10)
 *
 * Unit coverage for the best-effort sync step that recovers agenda fileIds via
 * document-order ordinal chip correlation, gates + caches on Drive metadata,
 * downloads + extracts the PDF, and emits the three §12.4 data-quality codes —
 * all without ever throwing out of the scan (spec §4.5.1–§4.5.4).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const extractMock = vi.fn();
vi.mock("@/lib/agenda/extractAgendaSchedule", () => ({
  extractAgendaSchedule: (bytes: Uint8Array) => extractMock(bytes),
}));

import { enrichAgenda } from "@/lib/sync/enrichAgenda";
import type { DriveClient, DriveFileMeta } from "@/lib/sync/enrichWithDrivePins";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { ParseResult } from "@/lib/parser/types";
import { EXTRACTOR_VERSION } from "@/lib/agenda/constants";

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

function makeResult(agendaLinks: AgendaLink[]): ParseResult {
  return {
    show: { agenda_links: agendaLinks },
    warnings: [],
  } as unknown as ParseResult;
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

function makeClient(over: Partial<DriveClient> = {}): DriveClient {
  return {
    getFile: async (id) => meta(id),
    listFolder: async () => ({ folderId: "f", files: [] }),
    getAgendaChips: async () => ({ kind: "rows", rows: [] }),
    downloadFileBytes: async () => ({ kind: "bytes", bytes: new Uint8Array([0x25, 0x50]) }),
    ...over,
  };
}

const codes = (r: ParseResult) => r.warnings.map((w) => w.code);

beforeEach(() => {
  extractMock.mockReset();
  extractMock.mockResolvedValue(highExtraction());
});

describe("enrichAgenda — optional-method guard", () => {
  test("returns early (no throw) when the Drive client lacks the agenda methods", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI" }]);
    const client = { getFile: async (id: string) => meta(id) } as unknown as DriveClient;
    await expect(enrichAgenda(result, client, "sheet-1")).resolves.toBeUndefined();
    expect(result.show.agenda_links[0]!.fileId).toBeUndefined();
  });
});

describe("enrichAgenda — Codex whole-diff regressions", () => {
  test("an empty/missing headRevisionId is NOT cacheable → re-extracts (R1 #1)", async () => {
    // Prior extracted with an empty sourceRevision + getFile returning an empty
    // headRevisionId. The OLD cache (`'' === ''`) would skip re-extraction forever;
    // the fix treats a non-string/empty revision as non-cacheable.
    const result = makeResult([
      {
        label: "AGENDA LINK - RFI",
        fileId: "F1",
        extracted: highExtraction({ sourceRevision: "" }),
      },
    ]);
    const client = makeClient({ getFile: async (id) => meta(id, { headRevisionId: "" }) });
    await enrichAgenda(result, client, "s");
    expect(extractMock).toHaveBeenCalledTimes(1); // re-extracted, not permanently cached
  });

  test("a real matching revision DOES cache-skip (control)", async () => {
    const result = makeResult([
      {
        label: "AGENDA LINK - RFI",
        fileId: "F1",
        extracted: highExtraction({ sourceRevision: "rev-F1" }),
      },
    ]);
    await enrichAgenda(result, makeClient(), "s");
    expect(extractMock).not.toHaveBeenCalled(); // cached: rev-F1 matches + version matches
  });

  test("a client WITHOUT getAgendaChips still enriches url-parsed fileId links (R1 #3)", async () => {
    // Url-form link already has a parser-supplied fileId (no chip recovery needed).
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1" }]);
    const client = makeClient({ getAgendaChips: undefined });
    await enrichAgenda(result, client, "s");
    expect(result.show.agenda_links[0]!.extracted).toBeDefined();
    expect(result.show.agenda_links[0]!.extracted!.confidence).toBe("high");
  });
});

describe("enrichAgenda — ordinal chip correlation", () => {
  test("binds i-th chipFileId to i-th fileId-less entry in grid order", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI" }, { label: "AGENDA LINK - PCF" }]);
    const client = makeClient({
      getAgendaChips: async () => ({
        kind: "rows",
        rows: [
          { label: "AGENDA LINK - RFI", chipFileId: "RFI" },
          { label: "AGENDA LINK - PCF", chipFileId: "PCF" },
        ],
      }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.fileId).toBe("RFI");
    expect(result.show.agenda_links[1]!.fileId).toBe("PCF");
  });

  test("interleaved url-form entry holds its ordinal slot; only fileId-less entries adopt chips", async () => {
    const result = makeResult([
      { label: "AGENDA LINK - RFI", fileId: "URL_RFI" },
      { label: "AGENDA LINK - PCF" },
    ]);
    const client = makeClient({
      getAgendaChips: async () => ({
        kind: "rows",
        rows: [
          { label: "AGENDA LINK - RFI", chipFileId: null },
          { label: "AGENDA LINK - PCF", chipFileId: "PCF" },
        ],
      }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.fileId).toBe("URL_RFI"); // parser-supplied, kept
    expect(result.show.agenda_links[1]!.fileId).toBe("PCF");
  });
});

describe("enrichAgenda — divergence backstop", () => {
  test("count mismatch → no bind, AGENDA_PDF_UNREADABLE once; url-form entry still extracted", async () => {
    const result = makeResult([
      { label: "AGENDA LINK - RFI", fileId: "URL_RFI" },
      { label: "AGENDA LINK - PCF" },
    ]);
    const client = makeClient({
      getAgendaChips: async () => ({ kind: "rows", rows: [{ label: "X", chipFileId: "Z" }] }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[1]!.fileId).toBeUndefined(); // no bind
    expect(codes(result).filter((c) => c === "AGENDA_PDF_UNREADABLE")).toHaveLength(1);
    // url-form entry kept its fileId and was extracted
    expect(result.show.agenda_links[0]!.extracted?.confidence).toBe("high");
  });

  test("label mismatch at a position → divergence (no bind)", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI" }, { label: "AGENDA LINK - PCF" }]);
    const client = makeClient({
      getAgendaChips: async () => ({
        kind: "rows",
        rows: [
          { label: "AGENDA LINK - RFI", chipFileId: "RFI" },
          { label: "AGENDA LINK - WRONG", chipFileId: "PCF" },
        ],
      }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.fileId).toBeUndefined();
    expect(result.show.agenda_links[1]!.fileId).toBeUndefined();
    expect(codes(result)).toContain("AGENDA_PDF_UNREADABLE");
  });
});

describe("enrichAgenda — getAgendaChips infra_error", () => {
  test("leaves links unenriched, no warning, no download, no throw", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI" }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([1]),
    }));
    const client = makeClient({
      getAgendaChips: async () => ({ kind: "infra_error" }),
      downloadFileBytes,
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.fileId).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });
});

describe("enrichAgenda — getAgendaChips gating", () => {
  test("not called when every entry already has a fileId", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    const getAgendaChips = vi.fn(async () => ({ kind: "rows" as const, rows: [] }));
    const client = makeClient({ getAgendaChips });
    await enrichAgenda(result, client, "sheet-1");
    expect(getAgendaChips).not.toHaveBeenCalled();
    expect(result.show.agenda_links[0]!.extracted?.confidence).toBe("high");
  });
});

describe("enrichAgenda — metadata gate + cache", () => {
  test("non-PDF mime → AGENDA_PDF_UNREADABLE, no download", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([1]),
    }));
    const client = makeClient({
      getFile: async (id) => meta(id, { mimeType: "image/png" }),
      downloadFileBytes,
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(codes(result)).toEqual(["AGENDA_PDF_UNREADABLE"]);
    expect(downloadFileBytes).not.toHaveBeenCalled();
  });

  test("cache hit (same revision + extractorVersion) → no download, no extract, extracted untouched", async () => {
    const prior = highExtraction({ sourceRevision: "rev-F1" });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1", extracted: prior }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([1]),
    }));
    const client = makeClient({ downloadFileBytes });
    await enrichAgenda(result, client, "sheet-1");
    expect(downloadFileBytes).not.toHaveBeenCalled();
    expect(extractMock).not.toHaveBeenCalled();
    expect(result.show.agenda_links[0]!.extracted).toBe(prior);
  });

  test("extractorVersion bump invalidates cache even at the same revision → re-extract", async () => {
    const stale = highExtraction({
      sourceRevision: "rev-F1",
      extractorVersion: EXTRACTOR_VERSION - 1,
    });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1", extracted: stale }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([1]),
    }));
    const client = makeClient({ downloadFileBytes });
    await enrichAgenda(result, client, "sheet-1");
    expect(downloadFileBytes).toHaveBeenCalledTimes(1);
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(result.show.agenda_links[0]!.extracted?.extractorVersion).toBe(EXTRACTOR_VERSION);
    expect(result.show.agenda_links[0]!.extracted?.sourceRevision).toBe("rev-F1");
  });
});

describe("enrichAgenda — data-quality codes", () => {
  test("confidence:'low' (with sessions) → AGENDA_SCHEDULE_LOW_CONFIDENCE", async () => {
    extractMock.mockResolvedValue(highExtraction({ confidence: "low" }));
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(codes(result)).toEqual(["AGENDA_SCHEDULE_LOW_CONFIDENCE"]);
  });

  test("corrections>0 → AGENDA_SCHEDULE_TIME_ADJUSTED (independent of high confidence)", async () => {
    extractMock.mockResolvedValue(highExtraction({ corrections: 2 }));
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(codes(result)).toEqual(["AGENDA_SCHEDULE_TIME_ADJUSTED"]);
  });

  test("0 sessions → AGENDA_PDF_UNREADABLE (not low-confidence)", async () => {
    extractMock.mockResolvedValue({
      confidence: "low",
      corrections: 0,
      days: [],
      extractorVersion: EXTRACTOR_VERSION,
    });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(codes(result)).toEqual(["AGENDA_PDF_UNREADABLE"]);
  });

  test("downloadFileBytes unavailable → AGENDA_PDF_UNREADABLE", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    const client = makeClient({ downloadFileBytes: async () => ({ kind: "unavailable" }) });
    await enrichAgenda(result, client, "sheet-1");
    expect(codes(result)).toEqual(["AGENDA_PDF_UNREADABLE"]);
    expect(extractMock).not.toHaveBeenCalled();
  });

  test("downloadFileBytes infra_error → no warning, no extract", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1" }]);
    const client = makeClient({ downloadFileBytes: async () => ({ kind: "infra_error" }) });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.warnings).toEqual([]);
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe("enrichAgenda — stale-good preservation", () => {
  test("transient download infra_error at a NEW revision leaves prior high-confidence extracted intact", async () => {
    const prior = highExtraction({ sourceRevision: "old-rev" });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1", extracted: prior }]);
    const client = makeClient({
      getFile: async (id) => meta(id, { headRevisionId: "new-rev" }), // cache miss
      downloadFileBytes: async () => ({ kind: "infra_error" }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.extracted).toBe(prior); // untouched
    expect(result.warnings).toEqual([]);
  });

  test("getFile throw is swallowed (best-effort) and leaves the link as-is", async () => {
    const prior = highExtraction({ sourceRevision: "old-rev" });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1", extracted: prior }]);
    const client = makeClient({
      getFile: async () => {
        throw new Error("META: drive 503");
      },
    });
    await expect(enrichAgenda(result, client, "sheet-1")).resolves.toBeUndefined();
    expect(result.show.agenda_links[0]!.extracted).toBe(prior);
    expect(result.warnings).toEqual([]);
  });
});

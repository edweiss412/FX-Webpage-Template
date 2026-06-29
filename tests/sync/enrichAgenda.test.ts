/**
 * tests/sync/enrichAgenda.test.ts (agenda Phase B, Task 10 + Task-6 verdict layer)
 *
 * Unit coverage for the best-effort sync step that recovers agenda fileIds via
 * document-order ordinal chip correlation, gates + caches on Drive metadata,
 * downloads + extracts the PDF, and emits the three §12.4 data-quality codes —
 * all without ever throwing out of the scan (spec §4.5.1–§4.5.4).
 *
 * Task-6 additions: per-link freshness verdict (PerLinkVerdict discriminated union),
 * per-PDF before/after revision stability fence, AGENDA_MAX_PDFS_PER_SHEET cap,
 * per-ordinal label-matched chip recovery (ordinal+label, not strict alignment),
 * AbortSignal support, and cache-hit short-circuit returning stored extraction.
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
import { EXTRACTOR_VERSION, AGENDA_MAX_PDFS_PER_SHEET } from "@/lib/agenda/constants";

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
  test("returns empty report (no throw) when the Drive client lacks the agenda methods", async () => {
    const result = makeResult([{ label: "AGENDA LINK - RFI" }]);
    const client = { getFile: async (id: string) => meta(id) } as unknown as DriveClient;
    const report = await enrichAgenda(result, client, "sheet-1");
    expect(report).toEqual({ perLink: [] });
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
    // A client that can download but OMITS getAgendaChips (optional method absent).
    const client: DriveClient = {
      getFile: async (id) => meta(id),
      listFolder: async () => ({ folderId: "f", files: [] }),
      downloadFileBytes: async () => ({ kind: "bytes", bytes: new Uint8Array([0x25, 0x50]) }),
    };
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

describe("enrichAgenda — per-ordinal label-matched recovery (replaces strict-alignment)", () => {
  test("count mismatch (rows < links) → no bind for fileId-less entry without a chip row; url-form entry still extracted", async () => {
    // rows.length (1) < links.length (2): old code would emit AGENDA_PDF_UNREADABLE;
    // new per-ordinal code: rows[0].label "X" ≠ link[0].label (URL_RFI already has fileId
    // anyway); rows[1] undefined → no bind for link[1]. No warning from chip recovery.
    const result = makeResult([
      { label: "AGENDA LINK - RFI", fileId: "URL_RFI" },
      { label: "AGENDA LINK - PCF" },
    ]);
    const client = makeClient({
      getAgendaChips: async () => ({ kind: "rows", rows: [{ label: "X", chipFileId: "Z" }] }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[1]!.fileId).toBeUndefined(); // no bind (no row for ordinal 1)
    // url-form entry kept its fileId and was extracted
    expect(result.show.agenda_links[0]!.extracted?.confidence).toBe("high");
    // No chip-recovery warning (per-ordinal silently skips mismatches)
    expect(codes(result).filter((c) => c === "AGENDA_PDF_UNREADABLE")).toHaveLength(0);
  });

  test("label mismatch at ordinal i → that ordinal not bound; matched ordinals still recover", async () => {
    // Old behavior: any mismatch → divergence → no bind for ANY entry.
    // New behavior: per-ordinal — ordinal 0 label matches → binds; ordinal 1 mismatches → skips.
    const result = makeResult([{ label: "AGENDA LINK - RFI" }, { label: "AGENDA LINK - PCF" }]);
    const client = makeClient({
      getAgendaChips: async () => ({
        kind: "rows",
        rows: [
          { label: "AGENDA LINK - RFI", chipFileId: "RFI" }, // matches ordinal 0
          { label: "AGENDA LINK - WRONG", chipFileId: "PCF" }, // mismatches ordinal 1
        ],
      }),
    });
    await enrichAgenda(result, client, "sheet-1");
    expect(result.show.agenda_links[0]!.fileId).toBe("RFI"); // recovered (matched)
    expect(result.show.agenda_links[1]!.fileId).toBeUndefined(); // not recovered (mismatch)
    // No warning from chip recovery — per-ordinal mismatch is silently skipped
    expect(codes(result).filter((c) => c === "AGENDA_PDF_UNREADABLE")).toHaveLength(0);
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

  test("a chip read failure does NOT suppress stale detection for an already-fileId link (Codex whole-diff R3)", async () => {
    // Mixed sheet: ordinal 0 is fileId-LESS (would need smart-chip recovery, so it
    // triggers getAgendaChips, which infra_errors); ordinal 1 ALREADY has a fileId
    // with a STALE stored extracted. The chip failure must NOT abort the whole pass:
    // ordinal 1 must still run its own getFile revision check and be marked
    // known_stale so the endpoint clears its stale schedule (instead of letting it
    // survive into publish).
    const result = makeResult([
      { label: "AGENDA LINK - RFI" }, // fileId-LESS → needs chips
      {
        label: "AGENDA LINK - PCF",
        fileId: "F2",
        extracted: highExtraction({ sourceRevision: "rev-OLD" }), // stale vs current rev-F2
      },
    ]);
    const client = makeClient({
      getAgendaChips: async () => ({ kind: "infra_error" }), // INFO-tab read fails
      getFile: async (id) => meta(id), // F2 → headRevisionId "rev-F2" (readable, differs)
      downloadFileBytes: async () => ({ kind: "infra_error" }), // not fresh
    });
    const report = await enrichAgenda(result, client, "sheet-1");
    // The pass is NOT globally aborted (would be `[]` with the bug).
    const v = report.perLink.find((p) => p.ordinal === 1);
    expect(v?.verdict).toBe("known_stale");
    // ordinal 0 stayed fileId-less (unrecovered) and produced no verdict — fine.
    expect(report.perLink.some((p) => p.ordinal === 0)).toBe(false);
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

  test("getFile throw → unknown verdict, link.extracted left as-is", async () => {
    const prior = highExtraction({ sourceRevision: "old-rev" });
    const result = makeResult([{ label: "AGENDA LINK - RFI", fileId: "F1", extracted: prior }]);
    const client = makeClient({
      getFile: async () => {
        throw new Error("META: drive 503");
      },
    });
    const report = await enrichAgenda(result, client, "sheet-1");
    expect(report.perLink).toHaveLength(1);
    expect(report.perLink[0]!.verdict).toBe("unknown");
    expect(result.show.agenda_links[0]!.extracted).toBe(prior); // preserved
    expect(result.warnings).toEqual([]);
  });
});

// ── Task-6: per-link freshness verdict (PerLinkVerdict discriminated union) ────────
describe("enrichAgenda — per-link freshness verdict", () => {
  // (a) Per-PDF mid-download revision change → known_stale
  test("(a) rev changes between before/after getFile → known_stale, no extraction payload, link.extracted not mutated", async () => {
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1" }]);
    let callCount = 0;
    const client = makeClient({
      getFile: async (id) => {
        callCount++;
        // First call: rev_before; second call (stability fence): different rev
        return meta(id, {
          headRevisionId: callCount === 1 ? "rev-before" : "rev-after-changed",
        });
      },
    });
    const report = await enrichAgenda(result, client, "s");
    expect(report.perLink).toHaveLength(1);
    expect(report.perLink[0]!.verdict).toBe("known_stale");
    expect(report.perLink[0]).not.toHaveProperty("extraction");
    expect(result.show.agenda_links[0]!.extracted).toBeUndefined(); // link NOT mutated
  });

  // (b) Stable rev + high-conf → fresh with extraction.sourceRevision on the report
  test("(b) stable rev + high-conf → fresh verdict with extraction.sourceRevision; link.extracted mutated for cron compat", async () => {
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1" }]);
    const report = await enrichAgenda(result, makeClient(), "s");
    expect(report.perLink).toHaveLength(1);
    const verdict = report.perLink[0]!;
    expect(verdict.verdict).toBe("fresh");
    if (verdict.verdict !== "fresh") throw new Error("expected fresh");
    expect(verdict.extraction.sourceRevision).toBe("rev-F1");
    expect(verdict.extraction.extractorVersion).toBe(EXTRACTOR_VERSION);
    // Backward compat: link.extracted is also updated so cron/scan callers see it
    expect(result.show.agenda_links[0]!.extracted?.sourceRevision).toBe("rev-F1");
  });

  // (b2) Cache hit → fresh with STORED extraction, no download, no getAgendaChips
  test("(b2) cache hit → fresh with stored extraction object; downloadFileBytes not called", async () => {
    const prior = highExtraction({ sourceRevision: "rev-F1" });
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1", extracted: prior }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }));
    const getAgendaChips = vi.fn(async () => ({ kind: "rows" as const, rows: [] }));
    const client = makeClient({ downloadFileBytes, getAgendaChips });
    const report = await enrichAgenda(result, client, "s");
    const verdict = report.perLink[0]!;
    expect(verdict.verdict).toBe("fresh");
    if (verdict.verdict !== "fresh") throw new Error("expected fresh");
    expect(verdict.extraction).toBe(prior); // exact stored object reference
    expect(downloadFileBytes).not.toHaveBeenCalled();
    // getAgendaChips not called: link already has fileId, so needsChips=false
    expect(getAgendaChips).not.toHaveBeenCalled();
  });

  // (c) Old stored sourceRevision, getFile readable + differs, download fails → known_stale
  test("(c) old stored sourceRevision + download infra_error → known_stale; prior extraction preserved", async () => {
    const prior = highExtraction({ sourceRevision: "old-rev" });
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1", extracted: prior }]);
    const client = makeClient({
      getFile: async (id) => meta(id, { headRevisionId: "new-rev" }), // cache miss
      downloadFileBytes: async () => ({ kind: "infra_error" }),
    });
    const report = await enrichAgenda(result, client, "s");
    expect(report.perLink[0]!.verdict).toBe("known_stale");
    expect(result.show.agenda_links[0]!.extracted).toBe(prior); // prior preserved
  });

  // (c2) Version-stale: stored extractorVersion=0 with matching sourceRevision → known_stale
  // Proves version mismatch alone is stale even when revision matches.
  test("(c2) stored extractorVersion=0 + matching sourceRevision → known_stale (version mismatch alone is stale)", async () => {
    const staleVersion = highExtraction({
      sourceRevision: "rev-F1",
      extractorVersion: 0, // EXTRACTOR_VERSION - 1; v1 stays current, v0 is stale
    });
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1", extracted: staleVersion }]);
    // download fails → can't refresh → known_stale
    const client = makeClient({
      downloadFileBytes: async () => ({ kind: "infra_error" }),
    });
    const report = await enrichAgenda(result, client, "s");
    expect(report.perLink[0]!.verdict).toBe("known_stale"); // NOT "unknown"
  });

  // (c2-converse) extractorVersion=1 (current) + matching sourceRevision → fresh (cache hit)
  // Proves v1 is never treated as stale and causes a proper cache hit.
  test("(c2-converse) stored extractorVersion=1 + matching sourceRevision → fresh cache hit; download never called", async () => {
    const current = highExtraction({ sourceRevision: "rev-F1" }); // extractorVersion = EXTRACTOR_VERSION = 1
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1", extracted: current }]);
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }));
    const client = makeClient({ downloadFileBytes });
    const report = await enrichAgenda(result, client, "s");
    expect(report.perLink[0]!.verdict).toBe("fresh");
    expect(downloadFileBytes).not.toHaveBeenCalled(); // confirmed cache hit
  });

  // (d) getFile infra_error (throws) → unknown
  test("(d) getFile throws → unknown verdict; link.extracted preserved", async () => {
    const prior = highExtraction({ sourceRevision: "old-rev" });
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1", extracted: prior }]);
    const client = makeClient({
      getFile: async () => {
        throw new Error("Drive 503");
      },
    });
    const report = await enrichAgenda(result, client, "s");
    expect(report.perLink[0]!.verdict).toBe("unknown");
    expect(report.perLink[0]).not.toHaveProperty("extraction");
    expect(result.show.agenda_links[0]!.extracted).toBe(prior); // preserved
    expect(result.warnings).toEqual([]);
  });

  // (e) AbortSignal already aborted → no Drive calls, empty perLink
  test("(e) AbortSignal aborted → empty perLink; no getFile/download/chips calls", async () => {
    const result = makeResult([{ label: "AGENDA LINK", fileId: "F1" }]);
    const getFile = vi.fn(async (id: string) => meta(id));
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }));
    const getAgendaChips = vi.fn(async () => ({ kind: "rows" as const, rows: [] }));
    const client = makeClient({ getFile, downloadFileBytes, getAgendaChips });
    const ac = new AbortController();
    ac.abort();
    const report = await enrichAgenda(result, client, "s", { signal: ac.signal });
    expect(report.perLink).toEqual([]);
    expect(getFile).not.toHaveBeenCalled();
    expect(downloadFileBytes).not.toHaveBeenCalled();
    expect(getAgendaChips).not.toHaveBeenCalled();
  });

  // (f) Per-show PDF cap + capped smart-chip recovery
  // N+1 fileId-less links, N+1 chip rows: first N recovered+extracted; N+1 skipped.
  // getAgendaChips called exactly ONCE (sheet-level).
  test("(f) cap at AGENDA_MAX_PDFS_PER_SHEET: first N links recovered+extracted; N+1 skipped; chips called once", async () => {
    const N = AGENDA_MAX_PDFS_PER_SHEET; // = 6
    const links = Array.from({ length: N + 1 }, (_, i) => ({
      label: `AGENDA LINK ${i + 1}`,
    }));
    const result = makeResult(links);
    const rows = links.map((link, i) => ({
      label: link.label,
      chipFileId: `FILE-${i}`,
    }));

    const getAgendaChips = vi.fn(async () => ({ kind: "rows" as const, rows }));
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }));
    const client = makeClient({ getAgendaChips, downloadFileBytes });

    const report = await enrichAgenda(result, client, "s");

    // getAgendaChips called exactly ONCE (sheet-level, not per-link)
    expect(getAgendaChips).toHaveBeenCalledTimes(1);

    // First N links: recovered + extracted (fresh verdict)
    for (let i = 0; i < N; i++) {
      expect(result.show.agenda_links[i]!.fileId).toBe(`FILE-${i}`);
      expect(report.perLink[i]?.verdict).toBe("fresh");
      expect(report.perLink[i]?.recoveredFileId).toBe(`FILE-${i}`);
    }

    // N+1 link (index N): NOT recovered (beyond cap), NOT extracted
    expect(result.show.agenda_links[N]!.fileId).toBeUndefined();
    // No verdict emitted for the capped (skipped) link
    expect(report.perLink).toHaveLength(N);
    // downloadFileBytes called N times (first N), NOT N+1
    expect(downloadFileBytes).toHaveBeenCalledTimes(N);
  });

  // (f2) Label-mismatch within first N → no wrong bind; other ordinals still recover
  test("(f2) label mismatch at ordinal i<N → no fileId for i (no wrong bind); matching ordinal still recovers", async () => {
    const result = makeResult([
      { label: "AGENDA LINK A" }, // ordinal 0 — label will match
      { label: "AGENDA LINK B" }, // ordinal 1 — label will NOT match
    ]);
    const getAgendaChips = vi.fn(async () => ({
      kind: "rows" as const,
      rows: [
        { label: "AGENDA LINK A", chipFileId: "FILE-A" }, // matches ordinal 0
        { label: "AGENDA LINK WRONG", chipFileId: "FILE-B" }, // mismatches ordinal 1
      ],
    }));
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }));
    const client = makeClient({ getAgendaChips, downloadFileBytes });

    const report = await enrichAgenda(result, client, "s");

    // ordinal 0: label matched → recovered + extracted + fresh verdict
    expect(result.show.agenda_links[0]!.fileId).toBe("FILE-A");
    const v0 = report.perLink.find((v) => v.ordinal === 0);
    expect(v0?.verdict).toBe("fresh");
    expect(v0?.recoveredFileId).toBe("FILE-A");

    // ordinal 1: label mismatched → NOT recovered (no wrong bind), NOT downloaded
    expect(result.show.agenda_links[1]!.fileId).toBeUndefined();
    const v1 = report.perLink.find((v) => v.ordinal === 1);
    expect(v1).toBeUndefined(); // no verdict emitted (no fileId → skipped in loop)

    // downloadFileBytes called once (for ordinal 0 only; ordinal 1 has no fileId)
    expect(downloadFileBytes).toHaveBeenCalledTimes(1);
  });
});

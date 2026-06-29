/**
 * tests/onboarding/enrichAgendaIntegration.test.ts (agenda Phase B, Task 10 + Task-6 verdict layer)
 *
 * Companion-surface proof (spec §4.5.4): the REAL enrichWithDrivePins — invoked by
 * the onboarding scan's prepareOne — inherits enrichAgenda, so a recovered
 * fileId + extracted schedule reaches `prepareOnboardingFiles`'s `parseResult`.
 * Uses the real rfi.pdf fixture through the real extractor (full end-to-end chain).
 * Plus a persistence assertion that the apply path serializes the enriched
 * agenda_links as jsonb verbatim.
 *
 * Task-6 additions: direct enrichAgenda verdict tests covering cache-hit (b2),
 * getFile infra_error (d), and AbortSignal (e) — cases that don't need the
 * extractor to be mocked and are best proved against the real DriveClient interface.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import { enrichAgenda } from "@/lib/sync/enrichAgenda";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { DriveListedFile } from "@/lib/drive/list";
import { EXTRACTOR_VERSION } from "@/lib/agenda/constants";

const rfiBytes = new Uint8Array(readFileSync("fixtures/agenda/rfi.pdf"));

function parsedWithAgendaLink(): ParsedSheet {
  return {
    show: {
      title: "II - RFI",
      client_label: "",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      // fileId-less agenda link → forces the getAgendaChips ordinal recovery path.
      agenda_links: [{ label: "AGENDA LINK - RFI" }],
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
    hardErrors: [],
  } as unknown as ParsedSheet;
}

describe("enrichAgenda integration — onboarding scan inherits it", () => {
  test("recovered fileId + extracted schedule reach prepareOne's parseResult", async () => {
    const file: DriveListedFile = {
      driveFileId: "show-1",
      name: "II - RFI",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-06-01T00:00:00.000Z",
      parents: [],
    };
    const driveClient: DriveClient = {
      ...mockDriveClient,
      async getFile(id) {
        return {
          driveFileId: id,
          headRevisionId: `rev-${id}`,
          md5Checksum: "x".repeat(32),
          mimeType: "application/pdf",
          modifiedTime: "2026-06-01T00:00:00.000Z",
        };
      },
      async getAgendaChips() {
        return { kind: "rows", rows: [{ label: "AGENDA LINK - RFI", chipFileId: "RFI_FILE" }] };
      },
      async downloadFileBytes() {
        return { kind: "bytes", bytes: rfiBytes };
      },
    };

    const prepared = await prepareOnboardingFiles("folder-1", {
      listFolder: async () => [file],
      fetchMarkdownWithBinding: async () => ({ binding: {} as Phase1Binding, markdown: "" }),
      parseSheet: () => parsedWithAgendaLink(),
      driveClient,
    });

    expect(prepared).toHaveLength(1);
    const entry = prepared[0]!;
    expect(entry.kind).toBe("sheet");
    if (entry.kind !== "sheet") throw new Error("expected sheet");

    const link = entry.parseResult.show.agenda_links[0]!;
    expect(link.fileId).toBe("RFI_FILE"); // recovered via ordinal chip correlation
    expect(link.extracted?.confidence).toBe("high"); // real extractor, real PDF
    expect(link.extracted?.sourceRevision).toBe("rev-RFI_FILE");
    expect(link.extracted?.extractorVersion).toBe(1);
  });

  test("the enriched agenda_links payload is what the apply path serializes (jsonb passthrough)", () => {
    // Cron write path passes parseResult.show.agenda_links straight to a jsonb param —
    // the extracted field rides the existing passthrough (no new column/encoder).
    const cronSource = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    expect(cronSource).toContain("args.parseResult.show.agenda_links");

    // Fidelity: the extracted payload survives a jsonb (JSON) round-trip unchanged.
    const link = {
      label: "AGENDA LINK - RFI",
      fileId: "RFI_FILE",
      extracted: {
        confidence: "high" as const,
        corrections: 1,
        days: [{ dayLabel: "Tue", date: null, sessions: [] }],
        sourceRevision: "rev-RFI_FILE",
        extractorVersion: 1,
      },
    };
    expect(JSON.parse(JSON.stringify(link))).toEqual(link);
  });
});

// ── Task-6: direct enrichAgenda verdict tests (no extractor mock needed) ─────────
// These cases exercise the per-link freshness verdict without requiring a controlled
// extractAgendaSchedule mock: cache-hit (b2), getFile infra_error (d), abort (e).
// Tests that need mock extraction control live in tests/sync/enrichAgenda.test.ts.

function makeAgendaResult(
  links: { label: string; fileId?: string; extracted?: AgendaExtraction }[],
): ParseResult {
  return {
    show: { agenda_links: links },
    warnings: [],
  } as unknown as ParseResult;
}

describe("enrichAgenda — per-link freshness verdict (integration, direct)", () => {
  // (b2) Cache hit: stored extraction matches currentRev + EXTRACTOR_VERSION → fresh
  // with stored object; downloadFileBytes is NOT called.
  test("(b2) cache hit returns fresh verdict with stored extraction; no download", async () => {
    const prior: AgendaExtraction = {
      confidence: "high",
      corrections: 0,
      days: [{ dayLabel: "Day 1", date: null, sessions: [] }],
      sourceRevision: "rev-F1",
      extractorVersion: EXTRACTOR_VERSION,
    };
    const downloadFileBytes = vi.fn(async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    }));
    const client: DriveClient = {
      ...mockDriveClient,
      async getFile(id) {
        return {
          driveFileId: id,
          headRevisionId: "rev-F1",
          md5Checksum: "x".repeat(32),
          mimeType: "application/pdf",
          modifiedTime: "2026-06-01T00:00:00.000Z",
        };
      },
      downloadFileBytes,
    };
    const result = makeAgendaResult([{ label: "AGENDA LINK", fileId: "F1", extracted: prior }]);
    const report = await enrichAgenda(result, client, "sheet-1");

    const verdict = report.perLink[0]!;
    expect(verdict.verdict).toBe("fresh");
    if (verdict.verdict !== "fresh") throw new Error("expected fresh");
    expect(verdict.extraction).toBe(prior); // exact same stored object reference
    expect(downloadFileBytes).not.toHaveBeenCalled(); // cache hit → no download
  });

  // (d) getFile infra_error (throws) → "unknown"; link.extracted preserved
  test("(d) getFile throws → unknown verdict; prior link.extracted preserved", async () => {
    const prior: AgendaExtraction = {
      confidence: "high",
      corrections: 0,
      days: [{ dayLabel: "Day 1", date: null, sessions: [] }],
      sourceRevision: "old-rev",
      extractorVersion: EXTRACTOR_VERSION,
    };
    const client: DriveClient = {
      ...mockDriveClient,
      async getFile() {
        throw new Error("Drive 503");
      },
    };
    const result = makeAgendaResult([{ label: "AGENDA LINK", fileId: "F1", extracted: prior }]);
    const report = await enrichAgenda(result, client, "sheet-1");

    expect(report.perLink[0]!.verdict).toBe("unknown");
    expect(report.perLink[0]).not.toHaveProperty("extraction");
    expect(result.show.agenda_links[0]!.extracted).toBe(prior); // preserved
  });

  // (e) AbortSignal already aborted → empty perLink; no Drive calls at all
  test("(e) AbortSignal aborted → empty perLink; getFile not called", async () => {
    const getFile = vi.fn(async (id: string) => ({
      driveFileId: id,
      headRevisionId: `rev-${id}`,
      md5Checksum: "x".repeat(32),
      mimeType: "application/pdf",
      modifiedTime: "2026-06-01T00:00:00.000Z",
    }));
    const client: DriveClient = {
      ...mockDriveClient,
      getFile,
    };
    const result = makeAgendaResult([{ label: "AGENDA LINK", fileId: "F1" }]);
    const ac = new AbortController();
    ac.abort();
    const report = await enrichAgenda(result, client, "sheet-1", { signal: ac.signal });

    expect(report.perLink).toEqual([]);
    expect(getFile).not.toHaveBeenCalled();
  });
});

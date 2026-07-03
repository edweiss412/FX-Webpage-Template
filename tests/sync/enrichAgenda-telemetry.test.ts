import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { enrichAgenda } from "@/lib/sync/enrichAgenda";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import type { ParseResult } from "@/lib/parser/types";

// S5 (AGENDA_ENRICH_THREW code-stamp on the outer catch) + S8 (AGENDA_LINK_UNRESOLVED new warn for
// a malformed agenda_link with no resolvable fileId). setLogSink capture — no @/lib/log mock.

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

function makeResult(links: Array<{ label: string; fileId?: string; url?: string }>): ParseResult {
  return { show: { agenda_links: links }, warnings: [] } as unknown as ParseResult;
}
function makeClient(over: Partial<DriveClient> = {}): DriveClient {
  return {
    getFile: async (id: string) => ({
      driveFileId: id,
      headRevisionId: `rev-${id}`,
      md5Checksum: "x".repeat(32),
      mimeType: "application/pdf",
      modifiedTime: "2026-06-01T00:00:00.000Z",
    }),
    listFolder: async () => ({ folderId: "f", files: [] }),
    getAgendaChips: async () => ({ kind: "rows" as const, rows: [] }),
    downloadFileBytes: async () => ({
      kind: "bytes" as const,
      bytes: new Uint8Array([0x25, 0x50]),
    }),
    ...over,
  } as unknown as DriveClient;
}

describe("enrichAgenda telemetry", () => {
  test("S8: a link with no resolvable fileId → log.warn AGENDA_LINK_UNRESOLVED (ordinal + label)", async () => {
    const sink = capture();
    await enrichAgenda(
      makeResult([{ label: "Agenda A", url: "agenda.pdf" }]),
      makeClient(),
      "sheet-1",
    );
    const rec = sink.filter((r) => r.code === "AGENDA_LINK_UNRESOLVED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.source).toBe("sync.enrichAgenda");
    expect(rec[0]!.context.spreadsheetId).toBe("sheet-1");
    expect(rec[0]!.context.ordinal).toBe(0);
    expect(rec[0]!.context.label).toBe("Agenda A");
  });

  test("S5: an outer-catch throw is coded AGENDA_ENRICH_THREW", async () => {
    const sink = capture();
    await enrichAgenda(
      makeResult([{ label: "Agenda A", url: "agenda.pdf" }]),
      makeClient({
        getAgendaChips: async () => {
          throw new Error("chips boom");
        },
      }),
      "sheet-2",
    );
    const rec = sink.filter((r) => r.code === "AGENDA_ENRICH_THREW");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(rec[0]!.source).toBe("sync.enrichAgenda");
  });
});

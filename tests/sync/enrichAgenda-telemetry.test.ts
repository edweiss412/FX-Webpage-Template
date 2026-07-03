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

// A fileId-less agenda link that is a BARE FILENAME / non-http(s) text has no clickable
// target → user-facing AGENDA_LINK_NOT_CLICKABLE warning. An external http(s) URL (any case)
// stays SILENT to the user. The forensic AGENDA_LINK_UNRESOLVED fires for BOTH shapes.
// enrichAgenda returns EnrichAgendaReport and MUTATES the passed-in result.warnings.
describe("enrichAgenda AGENDA_LINK_NOT_CLICKABLE", () => {
  function hasNotClickable(result: ParseResult): boolean {
    return result.warnings.some((w) => w.code === "AGENDA_LINK_NOT_CLICKABLE");
  }

  test("bare filename (no clickable target) → warning pushed + forensic fires", async () => {
    const sink = capture();
    const result = makeResult([{ label: "Day 1 Agenda", url: "agenda_final.pdf" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(hasNotClickable(result)).toBe(true);
    expect(sink.some((r) => r.code === "AGENDA_LINK_UNRESOLVED")).toBe(true);
  });

  test("external http(s) URL → NO warning, forensic still fires", async () => {
    const sink = capture();
    const result = makeResult([{ label: "Day 1 Agenda", url: "https://example.com/agenda" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(hasNotClickable(result)).toBe(false);
    expect(sink.some((r) => r.code === "AGENDA_LINK_UNRESOLVED")).toBe(true);
  });

  test("uppercase scheme URL (case-insensitive) → NO warning, forensic still fires", async () => {
    const sink = capture();
    const result = makeResult([{ label: "Day 1 Agenda", url: "HTTPS://example.com/agenda" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(hasNotClickable(result)).toBe(false);
    expect(sink.some((r) => r.code === "AGENDA_LINK_UNRESOLVED")).toBe(true);
  });

  test("undefined url (no clickable target) → warning pushed + forensic fires", async () => {
    const sink = capture();
    const result = makeResult([{ label: "Day 1 Agenda" }]);
    await enrichAgenda(result, makeClient(), "sheet-1");
    expect(hasNotClickable(result)).toBe(true);
    expect(sink.some((r) => r.code === "AGENDA_LINK_UNRESOLVED")).toBe(true);
  });

  test("chip-read infra_error → NO user-facing warning (recovery couldn't run); forensic still fires", async () => {
    // A bare-filename link that would normally warn, BUT the chip read infra-failed this pass,
    // so its fileId-less-ness is not conclusive — suppress AGENDA_LINK_NOT_CLICKABLE (same
    // "absence of recovery, not a fault" principle as the existing infra_error handling).
    const sink = capture();
    const result = makeResult([{ label: "Day 1 Agenda", url: "agenda_final.pdf" }]);
    await enrichAgenda(
      result,
      makeClient({ getAgendaChips: async () => ({ kind: "infra_error" as const }) }),
      "sheet-1",
    );
    expect(hasNotClickable(result)).toBe(false);
    expect(sink.some((r) => r.code === "AGENDA_LINK_UNRESOLVED")).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { ParseResult, ParsedSheet } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";

// Pass-through mock so ONE test can force extractSourceAnchors to throw deterministically
// (garbage bytes are not a reliable throw across SheetJS builds — R3-F1). Default = real impl,
// so the equality test below still computes real `expected`.
vi.mock("@/lib/drive/sourceAnchors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drive/sourceAnchors")>();
  return { ...actual, extractSourceAnchors: vi.fn(actual.extractSourceAnchors) };
});

function xlsxBuffer(aoa: string[][], sheetName: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>)
    .buffer as ArrayBuffer;
}

// INFO is on SOURCE_LINK_ALLOWLIST; this exact fixture yields the `venue` region anchor
// {title:"INFO",gid,a1:"A3:B4"} — copied from the proven case in tests/drive/sourceAnchors.test.ts:11-20.
const INFO_AOA: string[][] = [
  ["CLIENT", "ACME"],
  [],
  ["VENUE", "Four Seasons"],
  ["Hotel Address", "525 N"],
];
const file: DriveListedFile = {
  driveFileId: "show-1",
  name: "show-1.xlsx",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-05-08T12:00:00.000Z",
  parents: ["folder-1"],
};

function deps(over: Partial<Parameters<typeof prepareOnboardingFiles>[1]> = {}) {
  return {
    listFolder: vi.fn(async () => [file]),
    fetchMarkdownWithBinding: vi.fn(async (id: string) => ({
      binding: { bindingToken: `tok-${id}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
      markdown: "md",
      bytes: xlsxBuffer(INFO_AOA, "INFO"),
    })),
    parseSheet: vi.fn(() => ({}) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async () => ({ warnings: [] }) as unknown as ParseResult),
    driveClient: {} as never,
    listSheetGids: vi.fn(async () => new Map([["INFO", 4242]])),
    ...over,
  };
}

describe("prepareOnboardingFiles — region source anchors persisted for finalize", () => {
  it("computes region anchors for every sheet and returns them (non-empty, == extractSourceAnchors)", async () => {
    const gids = new Map([["INFO", 4242]]);
    const bytes = xlsxBuffer(INFO_AOA, "INFO");
    const expected = extractSourceAnchors(bytes, gids); // data source, not the render
    expect(expected.venue).toBeDefined(); // proven-anchorable fixture (else a broken {}-returning impl would pass)
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      deps({
        fetchMarkdownWithBinding: vi.fn(async () => ({
          binding: { bindingToken: "t", modifiedTime: "2026-05-08T12:00:00.000Z" },
          markdown: "md",
          bytes,
        })),
        listSheetGids: vi.fn(async () => gids),
      }),
    );
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual(expected);
  });

  it("is best-effort: gid fetch failure → sourceAnchors {} and scan continues", async () => {
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      deps({
        listSheetGids: vi.fn(async () => {
          throw new Error("sheets down");
        }),
      }),
    );
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual({});
  });

  it("is best-effort: missing bytes → sourceAnchors {}", async () => {
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      deps({
        fetchMarkdownWithBinding: vi.fn(async () => ({
          binding: { bindingToken: "t", modifiedTime: "2026-05-08T12:00:00.000Z" },
          markdown: "md",
        })),
      }),
    );
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual({});
  });

  it("is best-effort: extractSourceAnchors throwing → sourceAnchors {} and scan continues", async () => {
    // Deterministic throw via the pass-through mock (R3-F1).
    vi.mocked(extractSourceAnchors).mockImplementationOnce(() => {
      throw new Error("xlsx boom");
    });
    const prepared = await prepareOnboardingFiles("folder-1", deps());
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet"); // did NOT throw → scan continued
    expect(row.sourceAnchors).toEqual({});
  });
});

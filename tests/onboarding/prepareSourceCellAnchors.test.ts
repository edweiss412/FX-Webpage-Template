import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import { normalizeDate } from "@/lib/parser/blocks/_helpers";
import type { ParseResult, ParseWarning, ParsedSheet } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";

function xlsxBuffer(aoa: string[][], sheetName = "Main"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  const u8 = new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>,
  );
  return u8.buffer as ArrayBuffer;
}

const DATES_AOA: string[][] = [
  ["DATES", "", "", "", ""],
  ["", "SHOW DAY 1", "", "5/11/2026", "8:00 AM - Registration"],
  ["", "SHOW DAY 2", "", "5/12/2026", "GS: ... - 6:00 PM"], // unparseable → warned
];

const CREW_AOA: string[][] = [
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "Jane Doe", "- WIDGETMASTER", "555"],
];

const file: DriveListedFile = {
  driveFileId: "show-1",
  name: "show-1.xlsx",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-05-08T12:00:00.000Z",
  parents: ["folder-1"],
};

function scheduleWarning(iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_TIME_UNPARSED",
    message: `SHOW DAY ${iso} TIME cell …`,
    blockRef: { kind: "dates", index: 1, iso },
  };
}

function depsWith(
  warnings: ParseWarning[],
  over: Partial<Parameters<typeof prepareOnboardingFiles>[1]> = {},
) {
  return {
    listFolder: vi.fn(async () => [file]),
    fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
      binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
      markdown: "md",
      bytes: xlsxBuffer(DATES_AOA),
    })),
    parseSheet: vi.fn(() => ({}) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async () => ({ warnings }) as unknown as ParseResult),
    driveClient: {} as never,
    ...over,
  };
}

describe("prepareOnboardingFiles — exact-cell source anchors", () => {
  it("attaches sourceCell to a SCHEDULE_TIME_UNPARSED warning (TIME cell of the matching day)", async () => {
    const iso = normalizeDate("5/12/2026")!;
    const listSheetGids = vi.fn(async () => new Map([["Main", 4242]]));
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      depsWith([scheduleWarning(iso)], { listSheetGids }),
    );

    expect(listSheetGids).toHaveBeenCalledTimes(1);
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected a sheet row");
    // SHOW DAY 2 is at AOA row index 2; its TIME cell is column 4 → derived, not hardcoded.
    const expectedA1 = XLSX.utils.encode_cell({ r: 2, c: 4 });
    expect(row.parseResult.warnings[0]!.sourceCell).toEqual({
      title: "Main",
      gid: 4242,
      a1: expectedA1,
    });
  });

  it("attaches sourceCell to an UNKNOWN_ROLE_TOKEN warning (crew ROLE cell) on the onboarding path", async () => {
    // Crew lives on the INFO tab (the scanner is INFO-only — crew is one block per
    // show on INFO; whole-diff R1). Fixture sheet name = INFO accordingly.
    const listSheetGids = vi.fn(async () => new Map([["INFO", 4242]]));
    const roleWarning: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: "x",
      blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
    };
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      depsWith([roleWarning], {
        listSheetGids,
        fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
          binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
          markdown: "md",
          bytes: xlsxBuffer(CREW_AOA, "INFO"),
        })),
      }),
    );
    expect(listSheetGids).toHaveBeenCalledTimes(1);
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected a sheet row");
    // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
    expect(row.parseResult.warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 4242, a1: "C2" });
  });

  it("does NOT fetch tab gids when no cell-anchored warning is present (no extra round-trip)", async () => {
    const listSheetGids = vi.fn(async () => new Map([["Main", 4242]]));
    const other: ParseWarning = { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" };
    const prepared = await prepareOnboardingFiles("folder-1", depsWith([other], { listSheetGids }));

    expect(listSheetGids).not.toHaveBeenCalled();
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected a sheet row");
    expect(row.parseResult.warnings[0]!.sourceCell).toBeUndefined();
  });

  it("is best-effort: a gid-fetch failure leaves the warning link-less, scan continues", async () => {
    const iso = normalizeDate("5/12/2026")!;
    const listSheetGids = vi.fn(async () => {
      throw new Error("sheets API down");
    });
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      depsWith([scheduleWarning(iso)], { listSheetGids }),
    );

    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected a sheet row");
    expect(row.parseResult.warnings[0]!.sourceCell).toBeUndefined();
  });
});

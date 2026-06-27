/**
 * tests/drive/agendaDrive.test.ts (agenda Phase B, Task 8)
 *
 * The real `downloadFileBytes` + `getAgendaChips` DriveClient methods, exercised
 * against a mocked `googleapis`. Pins the discriminated-union mapping (invariant
 * 9): bytes / unavailable (404,403) / infra_error (5xx, network) for the byte
 * download, and rows / infra_error for the chip read — plus ordinal grid-order
 * row selection through the shared `isAgendaLinkRow` predicate.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/drive/client", () => ({
  getDriveAuth: () => ({}),
}));

const driveFilesGet = vi.fn();
const sheetsSpreadsheetsGet = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    drive: () => ({ files: { get: driveFilesGet } }),
    sheets: () => ({ spreadsheets: { get: sheetsSpreadsheetsGet } }),
  },
}));

import { downloadFileBytes, getAgendaChips } from "@/lib/drive/agendaDrive";

function chipUriCell(formattedValue: string, uri: string | null) {
  return {
    formattedValue,
    chipRuns: uri ? [{ chip: { richLinkProperties: { uri } } }] : [],
  };
}

beforeEach(() => {
  driveFilesGet.mockReset();
  sheetsSpreadsheetsGet.mockReset();
});

describe("downloadFileBytes — discriminated byte download", () => {
  test("200 → { kind: 'bytes' }", async () => {
    const payload = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    driveFilesGet.mockResolvedValue({ data: payload.buffer });
    const result = await downloadFileBytes("file-1");
    expect(result.kind).toBe("bytes");
    expect(result.kind === "bytes" && Array.from(result.bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  test("404 → { kind: 'unavailable' }", async () => {
    driveFilesGet.mockRejectedValue({ response: { status: 404 } });
    expect(await downloadFileBytes("gone")).toEqual({ kind: "unavailable" });
  });

  test("403 → { kind: 'unavailable' }", async () => {
    driveFilesGet.mockRejectedValue({ response: { status: 403 } });
    expect(await downloadFileBytes("forbidden")).toEqual({ kind: "unavailable" });
  });

  test("500 → { kind: 'infra_error' } (never collapsed into unavailable)", async () => {
    driveFilesGet.mockRejectedValue({ response: { status: 500 } });
    expect(await downloadFileBytes("flaky")).toEqual({ kind: "infra_error" });
  });

  test("network error (no status) → { kind: 'infra_error' }", async () => {
    driveFilesGet.mockRejectedValue(new Error("socket hang up"));
    expect(await downloadFileBytes("offline")).toEqual({ kind: "infra_error" });
  });
});

describe("getAgendaChips — grid-order chip recovery", () => {
  test("returns one row per agenda-link row in grid order with chipFileId from chip uri", async () => {
    sheetsSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          {
            data: [
              {
                rowData: [
                  { values: [{ formattedValue: "CLIENT" }, { formattedValue: "Acme" }] },
                  {
                    values: [
                      { formattedValue: "AGENDA LINK - RFI" },
                      chipUriCell(
                        "RFI Agenda.pdf",
                        "https://drive.google.com/file/d/RFI_FILE_ID/view",
                      ),
                    ],
                  },
                  {
                    values: [
                      { formattedValue: "AGENDA LINK - PCF" },
                      chipUriCell(
                        "PCF Agenda.pdf",
                        "https://drive.google.com/file/d/PCF_FILE_ID/view",
                      ),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const result = await getAgendaChips("sheet-1");
    expect(result).toEqual({
      kind: "rows",
      rows: [
        { label: "AGENDA LINK - RFI", chipFileId: "RFI_FILE_ID" },
        { label: "AGENDA LINK - PCF", chipFileId: "PCF_FILE_ID" },
      ],
    });
  });

  test("plain-URL value (no chip) → chipFileId null; blank-value + non-agenda rows excluded", async () => {
    sheetsSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          {
            data: [
              {
                rowData: [
                  // plain URL, no chip
                  {
                    values: [
                      { formattedValue: "AGENDA" },
                      { formattedValue: "https://example.com/a.pdf" },
                    ],
                  },
                  // blank value → excluded by isAgendaLinkRow
                  { values: [{ formattedValue: "AGENDA LINK - X" }, { formattedValue: "   " }] },
                  // not an agenda label → excluded
                  { values: [{ formattedValue: "AGENDA DAY" }, { formattedValue: "Tue" }] },
                ],
              },
            ],
          },
        ],
      },
    });
    const result = await getAgendaChips("sheet-2");
    expect(result).toEqual({ kind: "rows", rows: [{ label: "AGENDA", chipFileId: null }] });
  });

  test("malformed/partial chipRuns → chipFileId null (NOT infra_error)", async () => {
    sheetsSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          {
            data: [
              {
                rowData: [
                  {
                    values: [
                      { formattedValue: "AGENDA LINK - RFI" },
                      { formattedValue: "RFI.pdf", chipRuns: [{ chip: {} }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(await getAgendaChips("sheet-3")).toEqual({
      kind: "rows",
      rows: [{ label: "AGENDA LINK - RFI", chipFileId: null }],
    });
  });

  test("Sheets API throw → { kind: 'infra_error' } (real union, never empty rows)", async () => {
    sheetsSpreadsheetsGet.mockRejectedValue(new Error("META: sheets api 503"));
    expect(await getAgendaChips("sheet-down")).toEqual({ kind: "infra_error" });
  });
});

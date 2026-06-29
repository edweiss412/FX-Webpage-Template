/**
 * tests/drive/agendaDrive.test.ts (agenda Phase B, Task 8 + Task 5 guards)
 *
 * The real `downloadFileBytes` + `getAgendaChips` DriveClient methods, exercised
 * against a mocked `googleapis`. Pins the discriminated-union mapping (invariant
 * 9): bytes / unavailable (404,403) / infra_error (5xx, network) for the byte
 * download, and rows / infra_error for the chip read — plus ordinal grid-order
 * row selection through the shared `isAgendaLinkRow` predicate.
 *
 * Task 5 additions: byte-cap, idle-stall, slow-drip-deadline (downloadFileBytes)
 * and chips-hang, chips-pre-aborted, chips-transient-retry (getAgendaChips).
 */
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { Readable } from "stream";

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
import { AGENDA_PDF_MAX_BYTES } from "@/lib/agenda/constants";
import { DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";

function chipUriCell(formattedValue: string, uri: string | null) {
  return {
    formattedValue,
    chipRuns: uri ? [{ chip: { richLinkProperties: { uri } } }] : [],
  };
}

/** Build a minimal valid Sheets response payload with an AGENDA LINK row. */
function sheetsPayloadWithRow(label: string, chipUri: string | null) {
  return {
    data: {
      sheets: [
        {
          data: [
            {
              rowData: [
                {
                  values: [{ formattedValue: label }, chipUriCell("Some.pdf", chipUri)],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

beforeEach(() => {
  driveFilesGet.mockReset();
  sheetsSpreadsheetsGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── downloadFileBytes ──────────────────────────────────────────────────────────

describe("downloadFileBytes — discriminated byte download", () => {
  test("200 (stream) → { kind: 'bytes' }", async () => {
    const payload = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const stream = Readable.from([Buffer.from(payload)]);
    driveFilesGet.mockResolvedValue({ data: stream });
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

  // ── Task 5 guard tests ────────────────────────────────────────────────────

  test("stream exceeds AGENDA_PDF_MAX_BYTES → { kind: 'unavailable' } (byte cap)", async () => {
    // One chunk just over the cap — readBoundedNodeStream throws ByteLimitExceededError
    const overCap = new Uint8Array(AGENDA_PDF_MAX_BYTES + 1);
    const stream = Readable.from([overCap]);
    driveFilesGet.mockResolvedValue({ data: stream });
    const result = await downloadFileBytes("big-file");
    expect(result).toEqual({ kind: "unavailable" });
  });

  test("stream stalls (no progress) → stall guard fires → { kind: 'infra_error' }", async () => {
    vi.useFakeTimers();
    // A Readable that never pushes data — stall guard should trip at DRIVE_ASSET_STALL_TIMEOUT_MS
    const stream = new Readable({ read() {} });
    driveFilesGet.mockResolvedValue({ data: stream });

    const resultPromise = downloadFileBytes("stalled-file");
    // Advance past the idle stall timeout (but NOT past AGENDA_PDF_DEADLINE_MS = 120s)
    await vi.advanceTimersByTimeAsync(DRIVE_ASSET_STALL_TIMEOUT_MS + 100);
    const result = await resultPromise;
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("slow-drip under byte cap but exceeds opts.deadlineMs → { kind: 'infra_error' } (resources released)", async () => {
    vi.useFakeTimers();
    const DEADLINE_MS = 200; // small deadline so the test is fast
    // Stream that accepts pushes but never ends on its own
    const stream = new Readable({ read() {} });
    driveFilesGet.mockResolvedValue({ data: stream });

    const resultPromise = downloadFileBytes("slow-file", { deadlineMs: DEADLINE_MS });

    // Push one tiny chunk to prove the stall guard (30s) doesn't trip here —
    // only the total-time deadline should fire.
    stream.push(new Uint8Array(100));

    // Advance past the deadline (but well under DRIVE_ASSET_STALL_TIMEOUT_MS = 30s)
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + 50);
    const result = await resultPromise;
    expect(result).toEqual({ kind: "infra_error" });
  });
});

// ── getAgendaChips ─────────────────────────────────────────────────────────────

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
    // Two rejections to cover the transient retry path (status=null → isTransient → retry)
    sheetsSpreadsheetsGet.mockRejectedValue(new Error("META: sheets api 503"));
    expect(await getAgendaChips("sheet-down")).toEqual({ kind: "infra_error" });
  });

  // ── Task 5 guard tests ────────────────────────────────────────────────────

  test("Sheets request hangs past opts.deadlineMs → { kind: 'infra_error' } (NOT a hang)", async () => {
    vi.useFakeTimers();
    const DEADLINE_MS = 100;
    // Never resolves — simulates a hung network call
    sheetsSpreadsheetsGet.mockReturnValue(new Promise(() => {}));

    const resultPromise = getAgendaChips("sheet-hang", { deadlineMs: DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + 50);
    const result = await resultPromise;
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("pre-aborted opts.signal → { kind: 'infra_error' } without calling Sheets", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await getAgendaChips("sheet-cancelled", { signal: controller.signal });
    expect(result).toEqual({ kind: "infra_error" });
    expect(sheetsSpreadsheetsGet).not.toHaveBeenCalled();
  });

  test("transient 5xx → ONE retry → success on retry", async () => {
    // First call: transient 5xx; second call: success
    sheetsSpreadsheetsGet
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce(
        sheetsPayloadWithRow(
          "AGENDA LINK - RFI",
          "https://drive.google.com/file/d/RETRY_FILE_ID/view",
        ),
      );

    const result = await getAgendaChips("sheet-retry");
    expect(result).toEqual({
      kind: "rows",
      rows: [{ label: "AGENDA LINK - RFI", chipFileId: "RETRY_FILE_ID" }],
    });
    expect(sheetsSpreadsheetsGet).toHaveBeenCalledTimes(2);
  });
});

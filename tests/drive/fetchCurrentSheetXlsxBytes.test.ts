import { describe, expect, test, vi } from "vitest";
import type { drive_v3 } from "googleapis";

function fakeDrive(parts: { files?: Partial<drive_v3.Resource$Files> }): drive_v3.Drive {
  return parts as unknown as drive_v3.Drive;
}

const meta = (headRevisionId: string) => ({
  data: {
    id: "sheet-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-07-01T00:00:00.000Z",
    headRevisionId,
    exportLinks: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "https://docs.google.com/export/current.xlsx",
    },
  },
});

describe("fetchCurrentSheetXlsxBytes", () => {
  test("returns the exported bytes when the binding token stays stable", async () => {
    const filesGet = vi.fn().mockResolvedValue(meta("head-1"));
    const bytes = new ArrayBuffer(8);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(bytes) });
    const { fetchCurrentSheetXlsxBytes } = await import("@/lib/drive/fetch");

    const out = await fetchCurrentSheetXlsxBytes("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(out).toBe(bytes);
    expect(filesGet).toHaveBeenCalledTimes(2); // before + after
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("throws when the binding token changes during export", async () => {
    const filesGet = vi
      .fn()
      .mockResolvedValueOnce(meta("head-1"))
      .mockResolvedValueOnce(meta("head-2"));
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)) });
    const { fetchCurrentSheetXlsxBytes } = await import("@/lib/drive/fetch");

    await expect(
      fetchCurrentSheetXlsxBytes("sheet-1", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/revision token .* changed/i);
  });
});

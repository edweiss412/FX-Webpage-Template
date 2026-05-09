import { beforeEach, describe, expect, test, vi } from "vitest";
import type { drive_v3 } from "googleapis";

const synthesizeMarkdownFromXlsx = vi.hoisted(() => vi.fn());

vi.mock("@/lib/drive/exportSheetToMarkdown", () => ({
  synthesizeMarkdownFromXlsx,
}));

function fakeDrive(parts: {
  files?: Partial<drive_v3.Resource$Files>;
  revisions?: Partial<drive_v3.Resource$Revisions>;
}): drive_v3.Drive {
  return parts as unknown as drive_v3.Drive;
}

describe("Drive fetch wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synthesizeMarkdownFromXlsx.mockReturnValue("| CLIENT |\n| :---: |\n| ACME |");
  });

  test("fetchDriveFileMetadata wraps files.get with the fields sync needs", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
        trashed: true,
        headRevisionId: "head-1",
        md5Checksum: "abc123",
      },
    });
    const { fetchDriveFileMetadata } = await import("@/lib/drive/fetch");

    const meta = await fetchDriveFileMetadata("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
    });

    expect(meta).toEqual({
      driveFileId: "sheet-1",
      name: "Show Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["folder-1"],
      trashed: true,
      headRevisionId: "head-1",
      md5Checksum: "abc123",
    });
    expect(filesGet).toHaveBeenCalledWith({
      fileId: "sheet-1",
      fields: "id, name, mimeType, modifiedTime, parents, trashed, headRevisionId, md5Checksum",
      supportsAllDrives: true,
    });
  });

  test("fetchSheetAsMarkdown is a test-only helper that binds to the current modifiedTime token", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
        },
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });
    const { fetchSheetAsMarkdown } = await import("@/lib/drive/fetch");

    const markdown = await fetchSheetAsMarkdown("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(markdown).toBe("| CLIENT |\n| :---: |\n| ACME |");
    expect(filesGet).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("fetchSheetAsMarkdownAtRevision exports xlsx bytes when the metadata token remains stable", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
          "application/pdf": "https://docs.google.com/export/rev-1-pdf",
        },
      },
    });
    const bytes = new ArrayBuffer(8);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
    });
    const { fetchSheetAsMarkdownAtRevision, XLSX_EXPORT_MIME_TYPE } = await import(
      "@/lib/drive/fetch"
    );

    const markdown = await fetchSheetAsMarkdownAtRevision(
      "sheet-1",
      "2026-05-08T12:00:00.000Z",
      {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      },
    );

    expect(markdown).toBe("| CLIENT |\n| :---: |\n| ACME |");
    expect(filesGet).toHaveBeenCalledTimes(2);
    expect(filesGet).toHaveBeenCalledWith({
      fileId: "sheet-1",
      fields:
        "id, name, mimeType, modifiedTime, parents, trashed, headRevisionId, md5Checksum, exportLinks",
      supportsAllDrives: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://docs.google.com/export/current.xlsx", {
      headers: {
        Authorization: "Bearer ya29.test-token",
        Accept: XLSX_EXPORT_MIME_TYPE,
      },
    });
    expect(synthesizeMarkdownFromXlsx).toHaveBeenCalledWith(bytes);
  });

  test("fetchSheetAsMarkdownAtRevision accepts a real headRevisionId token when Drive provides one", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        headRevisionId: "head-1",
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
        },
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    await fetchSheetAsMarkdownAtRevision("sheet-1", "head-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("fetchSheetAsMarkdownAtRevision fails closed when Drive lacks an xlsx export link", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        exportLinks: {
          "application/pdf": "https://docs.google.com/export/rev-1-pdf",
        },
      },
    });
    const fetchImpl = vi.fn();
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/xlsx export link/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fetchSheetAsMarkdownAtRevision throws when the xlsx export endpoint fails", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
        },
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: vi.fn(),
    });
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/HTTP 410/);
  });

  test("fetchSheetAsMarkdownAtRevision aborts before export when the bound token is stale", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:05:00.000Z",
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
        },
      },
    });
    const fetchImpl = vi.fn();
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/bound revision token/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fetchSheetAsMarkdownAtRevision aborts after export when Drive changes mid-flight", async () => {
    const filesGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "sheet-1",
          name: "Show Sheet",
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:00:00.000Z",
          exportLinks: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              "https://docs.google.com/export/current.xlsx",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "sheet-1",
          name: "Show Sheet",
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:06:00.000Z",
          exportLinks: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              "https://docs.google.com/export/current.xlsx",
          },
        },
      });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/changed during xlsx export/);
    expect(synthesizeMarkdownFromXlsx).not.toHaveBeenCalled();
  });
});

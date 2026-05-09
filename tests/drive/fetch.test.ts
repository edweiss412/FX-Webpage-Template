import { describe, expect, test, vi } from "vitest";
import type { drive_v3 } from "googleapis";

function fakeDrive(parts: {
  files?: Partial<drive_v3.Resource$Files>;
  revisions?: Partial<drive_v3.Resource$Revisions>;
}): drive_v3.Drive {
  return parts as unknown as drive_v3.Drive;
}

describe("Drive fetch wrappers", () => {
  test("fetchDriveFileMetadata wraps files.get with the fields sync needs", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
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
      headRevisionId: "head-1",
      md5Checksum: "abc123",
    });
    expect(filesGet).toHaveBeenCalledWith({
      fileId: "sheet-1",
      fields: "id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum",
      supportsAllDrives: true,
    });
  });

  test("fetchSheetAsMarkdown wraps files.export with the markdown MIME type", async () => {
    const exportFile = vi.fn().mockResolvedValue({ data: "# Show Sheet\n" });
    const { fetchSheetAsMarkdown, MARKDOWN_EXPORT_MIME_TYPE } = await import("@/lib/drive/fetch");

    const markdown = await fetchSheetAsMarkdown("sheet-1", {
      drive: fakeDrive({ files: { export: exportFile } }),
    });

    expect(markdown).toBe("# Show Sheet\n");
    expect(exportFile).toHaveBeenCalledWith(
      {
        fileId: "sheet-1",
        mimeType: MARKDOWN_EXPORT_MIME_TYPE,
      },
      { responseType: "text" },
    );
  });

  test("fetchSheetAsMarkdownAtRevision pins the read to a specific revision", async () => {
    const revisionsGet = vi.fn().mockResolvedValue({ data: Buffer.from("# Revision R1\n") });
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    const markdown = await fetchSheetAsMarkdownAtRevision("sheet-1", "rev-1", {
      drive: fakeDrive({ revisions: { get: revisionsGet } }),
    });

    expect(markdown).toBe("# Revision R1\n");
    expect(revisionsGet).toHaveBeenCalledWith(
      {
        fileId: "sheet-1",
        revisionId: "rev-1",
        alt: "media",
      },
      { responseType: "text" },
    );
  });
});

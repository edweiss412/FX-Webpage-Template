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
    const { fetchSheetAsMarkdownAtRevision, XLSX_EXPORT_MIME_TYPE } =
      await import("@/lib/drive/fetch");

    const markdown = await fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

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

  // === Drive API error-shape pins (edge-case coverage) ===
  //
  // PINNED NON-DISTINCTION: lib/drive/fetch.ts has NO try/catch around
  // drive.files.get — a rejected files.get propagates the ORIGINAL error
  // object unchanged (same identity, same message), regardless of whether
  // the failure is a 403 rate-limit (reason 'rateLimitExceeded' /
  // 'userRateLimitExceeded'), a 403 permission denial, a 404, or a 500.
  // No classification, no wrapping in DriveFetchError, no retry. Callers
  // that need to distinguish rate-limit from permission errors must
  // inspect the gaxios error themselves. Building a classification layer
  // here would be a feature, not a fix — these tests document the current
  // contract so any future change to it is deliberate.
  function gaxiosLikeError(status: number, reason: string | null, message: string): Error {
    return Object.assign(new Error(message), {
      code: status,
      status,
      errors: reason ? [{ reason, message }] : [],
      response: { status },
    });
  }

  test.each([
    [403, "rateLimitExceeded", "User rate limit exceeded."],
    [403, "userRateLimitExceeded", "User rate limit exceeded."],
    [
      403,
      "insufficientFilePermissions",
      "The user does not have sufficient permissions for file sheet-1.",
    ],
    [404, "notFound", "File not found: sheet-1."],
    [500, "internalError", "Internal Error"],
  ] as const)(
    "fetchDriveFileMetadata propagates a files.get %i (%s) rejection unchanged — no wrapping, no classification (pinned)",
    async (status, reason, message) => {
      const apiError = gaxiosLikeError(status, reason, message);
      const filesGet = vi.fn().mockRejectedValue(apiError);
      const { fetchDriveFileMetadata, DriveFetchError } = await import("@/lib/drive/fetch");

      const promise = fetchDriveFileMetadata("sheet-1", {
        drive: fakeDrive({ files: { get: filesGet } }),
      });

      // Identity pin: the EXACT error object rejects through — the helper
      // neither wraps it in DriveFetchError nor rewrites its message.
      await expect(promise).rejects.toBe(apiError);
      await promise.catch((err: Error) => {
        expect(err).not.toBeInstanceOf(DriveFetchError);
        expect(err.message).toBe(message);
      });
    },
  );

  test("fetchSheetAsMarkdownAtRevision also propagates a files.get 403 rate-limit rejection unchanged (pinned)", async () => {
    const apiError = gaxiosLikeError(403, "rateLimitExceeded", "User rate limit exceeded.");
    const filesGet = vi.fn().mockRejectedValue(apiError);
    const fetchImpl = vi.fn();
    const { fetchSheetAsMarkdownAtRevision, DriveFetchError } = await import("@/lib/drive/fetch");

    const promise = fetchSheetAsMarkdownAtRevision("sheet-1", "2026-05-08T12:00:00.000Z", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    await expect(promise).rejects.toBe(apiError);
    await promise.catch((err: Error) => {
      expect(err).not.toBeInstanceOf(DriveFetchError);
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // === Missing revision-token pins ===
  //
  // When a files.get response carries NEITHER headRevisionId NOR
  // modifiedTime, the required-metadata guard (toDriveFileMetadata /
  // fetchFileForExport — both validate modifiedTime) fires FIRST, so the
  // exported entry points throw the generic "omitted required metadata"
  // DriveFetchError. bindingToken's own throw at lib/drive/fetch.ts:48
  // ("omitted revision token for <fileId>" — which DOES interpolate the
  // file id, not the name) is unreachable through any exported API: every
  // caller passes a file whose modifiedTime was already validated
  // non-empty, so `headRevisionId ?? modifiedTime` always yields a token.
  // These tests pin that precedence.
  test("fetchDriveFileMetadata fails closed with DriveFetchError when both headRevisionId and modifiedTime are absent (required-metadata guard wins; pinned)", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        // no modifiedTime, no headRevisionId
      },
    });
    const { fetchDriveFileMetadata, DriveFetchError } = await import("@/lib/drive/fetch");

    const promise = fetchDriveFileMetadata("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
    });

    await expect(promise).rejects.toThrow(/omitted required metadata/);
    await promise.catch((err: Error) => {
      expect(err).toBeInstanceOf(DriveFetchError);
    });
  });

  test("fetchSheetAsMarkdownAtRevision throws the required-metadata guard (NOT bindingToken's 'omitted revision token') when both tokens are absent (pinned)", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        // no modifiedTime, no headRevisionId — bindingToken would throw
        // "omitted revision token for sheet-1", but fetchFileForExport's
        // metadata validation fires first.
        exportLinks: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "https://docs.google.com/export/current.xlsx",
        },
      },
    });
    const fetchImpl = vi.fn();
    const { fetchSheetAsMarkdownAtRevision } = await import("@/lib/drive/fetch");

    const promise = fetchSheetAsMarkdownAtRevision("sheet-1", "head-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    await expect(promise).rejects.toThrow(/omitted required metadata/);
    await promise.catch((err: Error) => {
      expect(err.message).not.toMatch(/omitted revision token/);
    });
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

  // === fetchSheetMarkdownWithBinding ===
  //
  // Captures the binding token FROM the export's before-`get` instead of taking
  // a pre-captured revisionId, so onboarding preparation needs only 2 files.get
  // (before + after) per sheet instead of 3 (a separate captureBinding get +
  // before + after). No TOCTOU widening: the binding IS the before-`get` token
  // and the after-`get` still guards mid-flight change.
  test("fetchSheetMarkdownWithBinding captures the binding from the before-get in exactly 2 files.get calls", async () => {
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
    const bytes = new ArrayBuffer(8);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
    });
    const { fetchSheetMarkdownWithBinding, XLSX_EXPORT_MIME_TYPE } =
      await import("@/lib/drive/fetch");

    const { binding, markdown } = await fetchSheetMarkdownWithBinding("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(binding).toEqual({ bindingToken: "head-1", modifiedTime: "2026-05-08T12:00:00.000Z" });
    expect(markdown).toBe("| CLIENT |\n| :---: |\n| ACME |");
    // before-get + after-get ONLY — no separate captureBinding metadata fetch.
    expect(filesGet).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith("https://docs.google.com/export/current.xlsx", {
      headers: {
        Authorization: "Bearer ya29.test-token",
        Accept: XLSX_EXPORT_MIME_TYPE,
      },
    });
    expect(synthesizeMarkdownFromXlsx).toHaveBeenCalledWith(bytes);
  });

  test("fetchSheetMarkdownWithBinding binds to modifiedTime when Drive omits headRevisionId", async () => {
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
    const { fetchSheetMarkdownWithBinding } = await import("@/lib/drive/fetch");

    const { binding } = await fetchSheetMarkdownWithBinding("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(binding).toEqual({
      bindingToken: "2026-05-08T12:00:00.000Z",
      modifiedTime: "2026-05-08T12:00:00.000Z",
    });
  });

  test("fetchSheetMarkdownWithBinding fails closed when Drive lacks an xlsx export link", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        id: "sheet-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        exportLinks: { "application/pdf": "https://docs.google.com/export/rev-1-pdf" },
      },
    });
    const fetchImpl = vi.fn();
    const { fetchSheetMarkdownWithBinding } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetMarkdownWithBinding("sheet-1", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/xlsx export link/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fetchSheetMarkdownWithBinding aborts after export when Drive changes mid-flight", async () => {
    const filesGet = vi
      .fn()
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        data: {
          id: "sheet-1",
          name: "Show Sheet",
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:06:00.000Z",
          headRevisionId: "head-2",
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
    const { fetchSheetMarkdownWithBinding } = await import("@/lib/drive/fetch");

    await expect(
      fetchSheetMarkdownWithBinding("sheet-1", {
        drive: fakeDrive({ files: { get: filesGet } }),
        fetch: fetchImpl,
        getAccessToken: async () => "ya29.test-token",
      }),
    ).rejects.toThrow(/changed during xlsx export/);
    expect(synthesizeMarkdownFromXlsx).not.toHaveBeenCalled();
  });
});

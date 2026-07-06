import { beforeEach, describe, expect, test, vi } from "vitest";
import type { drive_v3 } from "googleapis";

const synthesizeMarkdownFromXlsx = vi.hoisted(() => vi.fn());

vi.mock("@/lib/drive/exportSheetToMarkdown", () => ({
  synthesizeMarkdownFromXlsx,
}));

function fakeDrive(parts: {
  files?: Partial<drive_v3.Resource$Files>;
}): drive_v3.Drive {
  return parts as unknown as drive_v3.Drive;
}

const ARCHIVED_TAB = {
  tabName: "OLD PULL SHEET",
  headerPreviews: ["RIA - CHICAGO, IL"],
  fingerprint: "f".repeat(64),
  included: true,
  contentChangedSinceAccept: false,
};

describe("fetchSheetMarkdownWithBinding archived-tab threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synthesizeMarkdownFromXlsx.mockReturnValue({
      markdown: "| PULL SHEET |\n| :---: |\n| Shure SM58 |",
      archivedPullSheetTabs: [ARCHIVED_TAB],
    });
  });

  test("threads includePullSheetFromTab to the exporter and surfaces archivedPullSheetTabs", async () => {
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
    const { fetchSheetMarkdownWithBinding } = await import("@/lib/drive/fetch");

    const res = await fetchSheetMarkdownWithBinding("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
      includePullSheetFromTab: "OLD PULL SHEET",
    });

    // (a) the option reached the exporter
    expect(synthesizeMarkdownFromXlsx).toHaveBeenCalledWith(bytes, {
      includePullSheetFromTab: "OLD PULL SHEET",
    });
    // (b) the field is surfaced up
    expect(res.archivedPullSheetTabs).toEqual([ARCHIVED_TAB]);
    expect(res.archivedPullSheetTabs?.[0]?.included).toBe(true);
    expect(res.markdown).toContain("Shure SM58");
  });

  test("no includePullSheetFromTab => exporter called with bytes only, tabs still surfaced", async () => {
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
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    const { fetchSheetMarkdownWithBinding } = await import("@/lib/drive/fetch");

    const res = await fetchSheetMarkdownWithBinding("sheet-1", {
      drive: fakeDrive({ files: { get: filesGet } }),
      fetch: fetchImpl,
      getAccessToken: async () => "ya29.test-token",
    });

    expect(synthesizeMarkdownFromXlsx).toHaveBeenCalledWith(new ArrayBuffer(8));
    expect(synthesizeMarkdownFromXlsx).not.toHaveBeenCalledWith(new ArrayBuffer(8), undefined);
    expect(res.archivedPullSheetTabs).toEqual([ARCHIVED_TAB]);
  });
});

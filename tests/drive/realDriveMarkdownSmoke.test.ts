import { describe, expect, test } from "vitest";
import { getDriveClient } from "@/lib/drive/client";
import {
  fetchSheetAsMarkdownAtRevision,
  MARKDOWN_EXPORT_MIME_TYPE,
} from "@/lib/drive/fetch";

const fixtureSpreadsheetId =
  process.env.M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID ??
  process.env.GOOGLE_DRIVE_SMOKE_SPREADSHEET_ID ??
  process.env.DRIVE_SMOKE_SPREADSHEET_ID;

const hasLiveDriveConfig = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && fixtureSpreadsheetId);

describe.skipIf(!hasLiveDriveConfig)("real Drive markdown export smoke", () => {
  test("live fixture revision exposes text/markdown and exports through the pinned wrapper", async () => {
    const drive = getDriveClient();
    const metadata = await drive.files.get({
      fileId: fixtureSpreadsheetId as string,
      fields: "id, name, mimeType, modifiedTime, headRevisionId",
      supportsAllDrives: true,
    });
    const headRevisionId = metadata.data.headRevisionId;

    expect(headRevisionId, "fixture spreadsheet must expose a headRevisionId").toBeTruthy();

    const revision = await drive.revisions.get({
      fileId: fixtureSpreadsheetId as string,
      revisionId: headRevisionId as string,
      fields: "exportLinks",
    });

    expect(revision.data.exportLinks).toHaveProperty(MARKDOWN_EXPORT_MIME_TYPE);

    const markdown = await fetchSheetAsMarkdownAtRevision(
      fixtureSpreadsheetId as string,
      headRevisionId as string,
      { drive },
    );

    expect(markdown.length).toBeGreaterThan(0);
  });
});

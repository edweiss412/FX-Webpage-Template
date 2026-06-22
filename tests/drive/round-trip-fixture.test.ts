import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getDriveClient } from "@/lib/drive/client";
import { fetchSheetAsMarkdownAtRevision } from "@/lib/drive/fetch";
import { parseSheet } from "@/lib/parser";
import { loadLocalEnv } from "./loadLocalEnv";

loadLocalEnv();

const fixtureSpreadsheetId = process.env.M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID;
const hasLiveDriveConfig = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && fixtureSpreadsheetId);
const fixtureName = "2025-05-redefining-fixed-income-private-credit.md";

describe.skipIf(!hasLiveDriveConfig)("M6 real Drive fixture round trip", () => {
  test("xlsx-synthesized markdown parses to the same structure as the canonical fixture", async () => {
    const drive = getDriveClient();
    const metadata = await drive.files.get({
      fileId: fixtureSpreadsheetId as string,
      fields: "id, name, mimeType, modifiedTime, headRevisionId",
      supportsAllDrives: true,
    });
    const bindingToken = metadata.data.headRevisionId ?? metadata.data.modifiedTime;
    expect(bindingToken, "fixture spreadsheet must expose a bindable revision token").toBeTruthy();

    const freshMarkdown = await fetchSheetAsMarkdownAtRevision(
      fixtureSpreadsheetId as string,
      bindingToken as string,
      { drive },
    );
    const fixtureMarkdown = readFileSync(
      join(process.cwd(), "fixtures/shows/raw", fixtureName),
      "utf8",
    );

    expect(parseSheet(freshMarkdown, fixtureName)).toEqual(
      parseSheet(fixtureMarkdown, fixtureName),
    );
  }, 60_000);
});

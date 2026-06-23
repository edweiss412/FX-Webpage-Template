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

// Compare the LIVE sheet's production synthesis against the committed PRODUCTION
// fixture — the exact output of Drive XLSX export -> synthesizeMarkdownFromXlsx
// (the renderer production actually feeds parseSheet), captured under
// fixtures/shows/exporter-xlsx/.
//
// This previously compared against fixtures/shows/raw/2025-05-redefining-...md,
// which is the OLDER Drive-MCP-`read_file_content` renderer — a DIFFERENT renderer
// (see fixtures/shows/exporter-xlsx/README.md). The 2026-06-18 synthesis-fidelity
// fixes ("preserve DETAILS value column / restore event_details" + "skip archived
// OLD tabs") regenerated the exporter-xlsx fixtures but not the raw ones, so the
// two renderers diverged across event_details/rooms/transportation/pullSheet and
// this (creds-gated, CI-skipped) test silently went red. Same-renderer (live
// production vs committed production) is the correct round trip.
const fixtureName = "redefining-fi.md";
const fixturePath = join(process.cwd(), "fixtures/shows/exporter-xlsx", fixtureName);

describe.skipIf(!hasLiveDriveConfig)("M6 real Drive fixture round trip", () => {
  test("live production synthesis matches the committed exporter-xlsx fixture", async () => {
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
    const fixtureMarkdown = readFileSync(fixturePath, "utf8");

    // Same renderer => byte-identical. A drift here means the live sheet changed
    // OR synthesizeMarkdownFromXlsx changed: regenerate
    // fixtures/shows/exporter-xlsx/redefining-fi.md from the current export (per
    // that dir's README) and update the parser fixtures' expectations in lockstep.
    expect(freshMarkdown).toBe(fixtureMarkdown);
    // Belt-and-suspenders: the structural parse must also match (distinguishes a
    // whitespace-only synthesis change from a semantic one in the failure output).
    expect(parseSheet(freshMarkdown, fixtureName)).toEqual(
      parseSheet(fixtureMarkdown, fixtureName),
    );
  }, 60_000);
});

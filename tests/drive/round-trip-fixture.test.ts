import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getDriveClient } from "@/lib/drive/client";
import { fetchSheetAsMarkdownAtRevision } from "@/lib/drive/fetch";
import { parseSheet } from "@/lib/parser";
import { loadLocalEnv } from "./loadLocalEnv";

loadLocalEnv();

const hasLiveDriveConfig = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Round-trip each committed PRODUCTION fixture against its live sheet: the
// exporter-xlsx/*.md files are the exact output of Drive XLSX export ->
// synthesizeMarkdownFromXlsx (the renderer production feeds parseSheet), captured
// 2026-06-18. We re-run that synthesis against the live sheet and assert it still
// matches byte-for-byte.
//
// (NOT fixtures/shows/raw/*.md — that is the OLDER Drive-MCP-`read_file_content`
// renderer, a DIFFERENT renderer; see fixtures/shows/exporter-xlsx/README.md. The
// 2026-06-18 synthesis-fidelity fixes diverged the two renderers, which is why this
// test was repointed at exporter-xlsx in PR #94.)
//
// All 7 fixtures are guarded (not just redefining) so a synthesis change or a live
// test-sheet edit that isn't propagated to ANY fixture fails loudly. The sheet ids
// are the fxav-test-shows COPIES already published in that dir's README, so they
// are inlined; the only secret needed to run is GOOGLE_SERVICE_ACCOUNT_JSON.
const PRODUCTION_FIXTURES: ReadonlyArray<{ fixture: string; spreadsheetId: string }> = [
  { fixture: "redefining-fi.md", spreadsheetId: "1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg" },
  { fixture: "consultants.md", spreadsheetId: "1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4" },
  { fixture: "fintech.md", spreadsheetId: "1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY" },
  { fixture: "east-coast.md", spreadsheetId: "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY" },
  { fixture: "ria.md", spreadsheetId: "1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw" },
  { fixture: "fixed-income.md", spreadsheetId: "1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4" },
  { fixture: "rpas.md", spreadsheetId: "1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo" },
];

describe.skipIf(!hasLiveDriveConfig)("real Drive production-fixture round trip", () => {
  test.each(PRODUCTION_FIXTURES)(
    "$fixture: live production synthesis matches the committed exporter-xlsx fixture",
    async ({ fixture, spreadsheetId }) => {
      const drive = getDriveClient();
      const metadata = await drive.files.get({
        fileId: spreadsheetId,
        fields: "id, name, mimeType, modifiedTime, headRevisionId",
        supportsAllDrives: true,
      });
      const bindingToken = metadata.data.headRevisionId ?? metadata.data.modifiedTime;
      expect(
        bindingToken,
        "fixture spreadsheet must expose a bindable revision token",
      ).toBeTruthy();

      const freshMarkdown = await fetchSheetAsMarkdownAtRevision(
        spreadsheetId,
        bindingToken as string,
        { drive },
      );
      const fixtureMarkdown = readFileSync(
        join(process.cwd(), "fixtures/shows/exporter-xlsx", fixture),
        "utf8",
      );

      // Same renderer => byte-identical. A drift means the live sheet changed OR
      // synthesizeMarkdownFromXlsx changed: regenerate fixtures/shows/exporter-xlsx/
      // <fixture> from the current export (per that dir's README) and update the
      // parser fixtures' expectations in lockstep.
      expect(freshMarkdown).toBe(fixtureMarkdown);
      // Belt-and-suspenders: the structural parse must also match (distinguishes a
      // whitespace-only synthesis change from a semantic one in the failure output).
      expect(parseSheet(freshMarkdown, fixture)).toEqual(parseSheet(fixtureMarkdown, fixture));
    },
    60_000,
  );
});

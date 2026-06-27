import { google } from "googleapis";
import { getDriveAuth } from "@/lib/drive/client";
import { DRIVE_FILES_GET_TIMEOUT_MS, withDriveRetry } from "@/lib/drive/fetch";

/**
 * Fetch a spreadsheet's tab title→gid map via the Sheets API. The gid
 * (`sheetId`) is required to build an exact-cell `SourceAnchor` deep link and is
 * NOT present in the xlsx export, so it needs its own metadata read. This is one
 * Sheets API round-trip, so callers gate it on actually needing an anchor (a
 * cell-anchored warning being present) rather than calling it per sheet.
 *
 * Mirrors `listSpreadsheetSheets` in runScheduledCronSync but returns the map
 * directly. Tabs missing a title or numeric sheetId are skipped.
 */
export async function fetchSheetTitleToGid(spreadsheetId: string): Promise<Map<string, number>> {
  const sheetsClient = google.sheets({ version: "v4", auth: getDriveAuth() });
  // DXT-3: bound this onboarding-scan-path Sheets metadata read with a per-call
  // gaxios timeout under withDriveRetry (gaxios-7 "TimeoutError" → driveErrorStatus
  // 504; retry:false keeps withDriveRetry the single retry layer).
  const response = await withDriveRetry(() =>
    sheetsClient.spreadsheets.get(
      { spreadsheetId, fields: "sheets(properties(sheetId,title))" },
      { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
    ),
  );
  const out = new Map<string, number>();
  for (const sheet of (response.data.sheets ?? []) as unknown[]) {
    const props = (sheet as { properties?: { title?: string | null; sheetId?: number | null } })
      .properties;
    if (props && typeof props.title === "string" && typeof props.sheetId === "number") {
      out.set(props.title, props.sheetId);
    }
  }
  return out;
}

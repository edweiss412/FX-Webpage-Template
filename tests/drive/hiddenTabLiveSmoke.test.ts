/**
 * Live smoke: proves the tab-visibility flag `GridBlock.sheetHidden` reads from a GENUINE
 * Google-Sheets xlsx export, not just the hand-built fixture, guarding the mocked-only-
 * tautology class. The premise the hidden-tab `#REF!` suppression rests on is that
 * Google's export carries `<sheet state="hidden">` for every tab hidden in the Sheets UI;
 * the committed exporter-xlsx corpus cannot pin it (none of its seven workbooks has a
 * hidden tab), so this reads the live show that motivated the rule and checks the WHOLE
 * tab set against the Sheets API's own `hidden` field. Opt-in: set FXAV_LIVE_SHEETS=1 and
 * have GOOGLE_SERVICE_ACCOUNT_JSON in .env.local. Skipped in normal CI (no network, no creds).
 *
 *   FXAV_LIVE_SHEETS=1 pnpm vitest run tests/drive/hiddenTabLiveSmoke.test.ts
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { synthesizeBlocksFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { premise } from "@/tests/_shared/premise";

const LIVE = !!process.env.FXAV_LIVE_SHEETS;
/** "II - FinTech Forum CTO Summit 2026" in fxav-test-shows: nine hidden tabs on 2026-09-03,
 *  among them the five IMPORTRANGE lookup tabs whose `#REF!` warnings motivated the rule. */
const FINTECH = "1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function serviceAccount(): { client_email: string; private_key: string } {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("GOOGLE_SERVICE_ACCOUNT_JSON="));
  if (!line) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing from .env.local");
  let raw = line.slice("GOOGLE_SERVICE_ACCOUNT_JSON=".length).trim();
  if (/^['"]/.test(raw)) raw = raw.slice(1, -1);
  return JSON.parse(raw);
}

describe.skipIf(!LIVE)("GridBlock.sheetHidden — live Google export smoke", () => {
  test("every tab's sheetHidden matches the Sheets API hidden flag, and at least one tab is hidden", async () => {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount(),
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ],
    });
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const exported = await drive.files.export(
      { fileId: FINTECH, mimeType: XLSX_MIME },
      { responseType: "arraybuffer" },
    );
    const { blocks } = synthesizeBlocksFromXlsx(exported.data as ArrayBuffer);
    // One visibility verdict per tab that yielded a grid block, derived from the blocks.
    const fromBytes = new Map<string, boolean>();
    for (const b of blocks) if (b.kind === "grid") fromBytes.set(b.sheetName, b.sheetHidden);

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: FINTECH,
      fields: "sheets(properties(title,hidden))",
    });
    const fromApi = new Map<string, boolean>();
    for (const s of meta.data.sheets ?? []) {
      const p = s.properties;
      if (p?.title) fromApi.set(p.title, p.hidden === true);
    }

    // The premise must be able to fail: a show with no hidden tab proves nothing here.
    premise("hidden tabs on the live show", [...fromApi.values()].filter(Boolean).length, 0);
    premise("tabs that yielded grid blocks", fromBytes.size, 1);
    for (const [title, hidden] of fromBytes) {
      expect({ title, hidden }).toEqual({ title, hidden: fromApi.get(title) });
    }
  });
});

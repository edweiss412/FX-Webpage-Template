/**
 * Live smoke: proves extractEmbeddedObjects works on GENUINE Google-Sheets XLSX
 * exports (not just the hand-built fixture), guarding the mocked-only-tautology
 * class. Opt-in: set FXAV_LIVE_SHEETS=1 and have GOOGLE_SERVICE_ACCOUNT_JSON in
 * .env.local. Skipped in normal CI (no network, no creds).
 *
 *   FXAV_LIVE_SHEETS=1 pnpm vitest run tests/drive/embeddedObjectsLiveSmoke.test.ts
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";
import { ALLOWED_DIAGRAM_MIMES } from "@/lib/data/diagrams";

const LIVE = !!process.env.FXAV_LIVE_SHEETS;
const FOLDER = "1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C"; // fxav-test-shows
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function serviceAccount(): { client_email: string; private_key: string } {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("GOOGLE_SERVICE_ACCOUNT_JSON="));
  if (!line) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing from .env.local");
  let raw = line.slice("GOOGLE_SERVICE_ACCOUNT_JSON=".length).trim();
  if (/^['"]/.test(raw)) raw = raw.slice(1, -1);
  return JSON.parse(raw);
}

describe.skipIf(!LIVE)("extractEmbeddedObjects — live Google export smoke", () => {
  test("finds ≥1 DIAGRAMS-tab raster object across the test-show corpus", async () => {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount(),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });
    const token = (await auth.getAccessToken()) as string;

    const list = await drive.files.list({
      q: `'${FOLDER}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 100,
    });
    const files = list.data.files ?? [];
    expect(files.length).toBeGreaterThan(0);

    let showsWithDiagrams = 0;
    for (const f of files) {
      const url = `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const { objectsByTab, allTabTitles } = extractEmbeddedObjects(await res.arrayBuffer());
      const diagramsTitle = allTabTitles.find(
        (t) => t.localeCompare("diagrams", undefined, { sensitivity: "accent" }) === 0,
      );
      const objs = diagramsTitle ? (objectsByTab.get(diagramsTitle) ?? []) : [];
      if (objs.length > 0) {
        showsWithDiagrams++;
        expect(objs.every((o) => ALLOWED_DIAGRAM_MIMES.has(o.mimeType))).toBe(true);
      }
    }
    // The corpus surveyed 2026-07 had 1-3 embedded floor-plan images per show.
    expect(showsWithDiagrams).toBeGreaterThan(0);
  }, 60_000);
});

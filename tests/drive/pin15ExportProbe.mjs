import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { google } from "googleapis";
import * as XLSX from "xlsx";

const REPORT_PATH = "docs/m6/pin-1.5-export-probe.md";
const CANDIDATE_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html",
  "text/csv",
];

function loadDotenvLocal() {
  const raw = readFileSyncIfExists(".env.local");
  if (!raw) return;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = rawLine.indexOf("=");
    if (idx < 0) continue;
    const key = rawLine.slice(0, idx).trim();
    let value = rawLine.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = process.env[key] ?? value;
  }
}

function readFileSyncIfExists(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function scrubExportLinks(exportLinks) {
  if (!exportLinks) return {};
  return Object.fromEntries(
    Object.entries(exportLinks).map(([mimeType, url]) => [
      mimeType,
      typeof url === "string" ? url : String(url),
    ]),
  );
}

function summarizeWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: false });
  return {
    sheetNames: workbook.SheetNames,
    sheetCount: workbook.SheetNames.length,
    sheets: workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
      return {
        name,
        range: sheet?.["!ref"] ?? null,
        mergeCount: sheet?.["!merges"]?.length ?? 0,
        rowCountFromData: rows.length,
        firstRows: rows.slice(0, 5),
      };
    }),
  };
}

function summarizeHtml(text) {
  return {
    parsesAsHtml: /<html[\s>]/i.test(text) || /<table[\s>]/i.test(text),
    hasAnchorMarkers: /<a\s+name=/i.test(text),
    tableCount: (text.match(/<table[\s>]/gi) ?? []).length,
    first200: text.slice(0, 200),
  };
}

function summarizeCsv(text) {
  return {
    lineCount: text.split(/\r?\n/).length,
    firstLines: text.split(/\r?\n/).slice(0, 8),
    firstTabOnlyLimitation: true,
  };
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

loadDotenvLocal();

const spreadsheetId = process.env.M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID;
if (!spreadsheetId) {
  throw new Error("M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID is required");
}
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is required");
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ],
});
const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const file = await drive.files.get({
  fileId: spreadsheetId,
  fields: "id,name,mimeType,modifiedTime,parents,headRevisionId,md5Checksum,exportLinks",
  supportsAllDrives: true,
});

const revisions = await drive.revisions.list({
  fileId: spreadsheetId,
  fields: "revisions(id,modifiedTime,mimeType,publishedOutsideDomain,exportLinks),nextPageToken",
  pageSize: 100,
});

const revisionId = file.data.headRevisionId ?? revisions.data.revisions?.at(-1)?.id ?? null;
let revision = null;
if (revisionId) {
  try {
    revision = await drive.revisions.get({
      fileId: spreadsheetId,
      revisionId,
      fields: "id,exportLinks,mimeType,modifiedTime,publishedOutsideDomain",
    });
  } catch (error) {
    revision = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const accessToken = await auth.getAccessToken();
if (!accessToken) throw new Error("Google auth did not return an access token");
const fileExportLinks = scrubExportLinks(file.data.exportLinks);
const revisionExportLinks =
  revision && "data" in revision ? scrubExportLinks(revision.data.exportLinks) : {};

const candidateResults = [];
for (const mimeType of CANDIDATE_MIME_TYPES) {
  const url = revisionExportLinks[mimeType] ?? fileExportLinks[mimeType];
  const result = { mimeType, hasExportLink: Boolean(url), source: revisionExportLinks[mimeType] ? "revision" : fileExportLinks[mimeType] ? "file" : "none" };
  if (!url) {
    candidateResults.push(result);
    continue;
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: mimeType,
    },
  });
  result.status = response.status;
  result.ok = response.ok;
  result.contentType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  result.byteLength = arrayBuffer.byteLength;
  if (response.ok && mimeType.includes("spreadsheetml.sheet")) {
    result.xlsx = summarizeWorkbook(Buffer.from(arrayBuffer));
  } else if (response.ok && mimeType === "text/html") {
    result.html = summarizeHtml(Buffer.from(arrayBuffer).toString("utf8"));
  } else if (response.ok && mimeType === "text/csv") {
    result.csv = summarizeCsv(Buffer.from(arrayBuffer).toString("utf8"));
  } else {
    result.first200 = Buffer.from(arrayBuffer).toString("utf8").slice(0, 200);
  }
  candidateResults.push(result);
}

const spreadsheet = await sheets.spreadsheets.get({
  spreadsheetId,
  fields:
    "spreadsheetId,properties.title,sheets(properties(title,sheetId,index,gridProperties(rowCount,columnCount)),merges)",
});

const ranges = (spreadsheet.data.sheets ?? []).map((sheet) => `'${sheet.properties?.title}'`);
const values = await sheets.spreadsheets.values.batchGet({
  spreadsheetId,
  ranges,
  majorDimension: "ROWS",
  valueRenderOption: "FORMATTED_VALUE",
  dateTimeRenderOption: "FORMATTED_STRING",
});

const fileSummary = {
  id: file.data.id,
  name: file.data.name,
  mimeType: file.data.mimeType,
  modifiedTime: file.data.modifiedTime,
  parents: file.data.parents,
  headRevisionId: file.data.headRevisionId ?? null,
  md5Checksum: file.data.md5Checksum ?? null,
  exportLinks: fileExportLinks,
};

const revisionsSummary = {
  nextPageToken: revisions.data.nextPageToken ?? null,
  count: revisions.data.revisions?.length ?? 0,
  revisions: (revisions.data.revisions ?? []).map((r) => ({
    id: r.id,
    modifiedTime: r.modifiedTime,
    mimeType: r.mimeType,
    publishedOutsideDomain: r.publishedOutsideDomain,
    exportLinks: scrubExportLinks(r.exportLinks),
  })),
};

const revisionSummary =
  revision && "data" in revision
    ? {
        id: revision.data.id,
        mimeType: revision.data.mimeType,
        modifiedTime: revision.data.modifiedTime,
        publishedOutsideDomain: revision.data.publishedOutsideDomain,
        exportLinks: revisionExportLinks,
      }
    : revision ?? { skipped: "no headRevisionId and revisions.list returned no candidate revision" };

const sheetsSummary = {
  spreadsheetId: spreadsheet.data.spreadsheetId,
  title: spreadsheet.data.properties?.title,
  sheets: (spreadsheet.data.sheets ?? []).map((sheet) => ({
    title: sheet.properties?.title,
    sheetId: sheet.properties?.sheetId,
    index: sheet.properties?.index,
    gridProperties: sheet.properties?.gridProperties,
    merges: sheet.merges ?? [],
  })),
};

const valuesSummary = {
  valueRanges: (values.data.valueRanges ?? []).map((range) => ({
    range: range.range,
    majorDimension: range.majorDimension,
    rowCount: range.values?.length ?? 0,
    firstRows: (range.values ?? []).slice(0, 8),
  })),
};

const folderId = file.data.parents?.[0] ?? null;
const report = [
  "# M6 Pin-stop 1.5 Export Probe",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Fixture: ${file.data.name ?? spreadsheetId}`,
  "",
  `Derived folder id: ${folderId ?? "none"}`,
  "",
  section("(a) files.get", `\`\`\`json\n${json(fileSummary)}\n\`\`\``),
  section("(b) revisions.list", `\`\`\`json\n${json(revisionsSummary)}\n\`\`\``),
  section("(c) revisions.get / current export links", `\`\`\`json\n${json(revisionSummary)}\n\`\`\``),
  section("(d) candidate export MIME results", `\`\`\`json\n${json(candidateResults)}\n\`\`\``),
  section("(e) spreadsheets.get sheet properties", `\`\`\`json\n${json(sheetsSummary)}\n\`\`\``),
  section("(f) spreadsheets.values.batchGet", `\`\`\`json\n${json(valuesSummary)}\n\`\`\``),
].join("\n");

await mkdir("docs/m6", { recursive: true });
await writeFile("docs/m6/.keep", "");
writeFileSync(REPORT_PATH, report);
console.log(`Wrote ${REPORT_PATH}`);
if (folderId) console.log(`M6_REAL_DRIVE_FIXTURE_FOLDER_ID=${folderId}`);

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import type { ParsedSheet } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import { enrichWithDrivePins, type DriveClient } from "@/lib/sync/enrichWithDrivePins";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/** Minimal workbook listing the given sheet names, none carrying a drawing. */
function miniXlsx(sheetNames: string[]): ArrayBuffer {
  const sheets = sheetNames
    .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const wbRels = sheetNames
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}</Relationships>`,
    ),
  };
  for (let i = 0; i < sheetNames.length; i++) {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
    );
  }
  const zip = zipSync(files, { mtime: new Date("2020-01-01T00:00:00Z") });
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
}

function emptyParsed(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "FinTech Forum 2026",
      client_label: "",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

const fileMeta = {
  driveFileId: "sheet-1",
  headRevisionId: "rev-9",
  md5Checksum: "m".repeat(32),
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-07-01T00:00:00.000Z",
};

// Onboarding-shaped client: ONLY getFile + listFolder (no listSpreadsheetSheets,
// no getSpreadsheetRevisionId). Proves the XLSX path is self-sufficient.
const reducedClient: DriveClient = {
  async getFile() {
    return fileMeta;
  },
  async listFolder() {
    return { folderId: "f", files: [] };
  },
};

describe("XLSX-media extraction path in enrichWithDrivePins", () => {
  test("produces DIAGRAMS-tab entries from xlsxBytes with a getFile/listFolder-only client", async () => {
    const result = await enrichWithDrivePins(emptyParsed(), reducedClient, {
      driveFileId: "sheet-1",
      fileMeta,
      xlsxBytes: sampleXlsx(),
    });
    const ex = extractEmbeddedObjects(sampleXlsx());
    const expected = ex.objectsByTab.get("DIAGRAMS")!;
    expect(result.diagrams.embeddedImages).toHaveLength(expected.length); // 2 (deduped, emf dropped)
    for (const e of result.diagrams.embeddedImages) {
      expect(e.contentUrl).toBeNull();
      expect(e.recovery_disposition).toBe("normal");
      expect(e.sheetTab).toBe("DIAGRAMS");
      expect(e.sheetsRevisionId).toBe("rev-9"); // fileMeta.headRevisionId
      expect(e.mediaPartName).toMatch(/^xl\/media\//);
      // fingerprint derived from the extractor's own bytes for this objectId (anti-tautology)
      expect(e.embeddedFingerprint).toBe(sha256Base64Url(ex.bytesByObjectId.get(e.objectId)!));
    }
  });

  test("falls back to fileMeta.modifiedTime when headRevisionId is empty", async () => {
    const result = await enrichWithDrivePins(emptyParsed(), reducedClient, {
      driveFileId: "sheet-1",
      fileMeta: { ...fileMeta, headRevisionId: "" },
      xlsxBytes: sampleXlsx(),
    });
    expect(result.diagrams.embeddedImages[0]?.sheetsRevisionId).toBe(fileMeta.modifiedTime);
  });

  test("emits DIAGRAMS_TAB_MISSING when the OOXML has no diagrams-titled tab", async () => {
    const result = await enrichWithDrivePins(emptyParsed(), reducedClient, {
      driveFileId: "sheet-1",
      fileMeta,
      xlsxBytes: miniXlsx(["RUN OF SHOW", "INFO"]),
    });
    expect(result.diagrams.embeddedImages).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain("DIAGRAMS_TAB_MISSING");
  });

  test("emits DIAGRAMS_EMBEDDED_NONE_FOUND when the tab exists but has no raster media", async () => {
    const result = await enrichWithDrivePins(emptyParsed(), reducedClient, {
      driveFileId: "sheet-1",
      fileMeta,
      xlsxBytes: miniXlsx(["DIAGRAMS"]),
    });
    expect(result.diagrams.embeddedImages).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain("DIAGRAMS_EMBEDDED_NONE_FOUND");
  });
});

// BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT (spec 2026-08-09-m-wave-2-design §2.2):
// zero-width characters must be stripped at the point Drive-supplied strings enter
// the PERSISTED payload. `parseSheet` strips its markdown/filename inputs at entry
// (lib/parser/index.ts), but the enrichment layer constructs payload strings from
// Drive/Sheets/OOXML metadata that never passes through the parser:
//   - embeddedImages[].sheetTab   (both branches: Sheets-API title, OOXML tab title)
//   - embeddedImages[].alt        (Sheets-API embedded-object alt)
//   - linkedFolderItems[].alt     (Drive file name)
//   - archivedPullSheetTabs[].tabName / .headerPreviews[]  (OOXML tab name / raw grid)
// Failure mode caught: a Drive-side string carrying a ZWSP/ZWNJ/ZWJ/BOM lands in the
// persisted payload, defeating string equality (override tabName matching, dedup,
// crew-visible rendering) while looking identical on screen.
//
// The DISCRIMINATING arms are the seeded ones: each plants a zero-width character in
// exactly one Drive-supplied input and asserts the ENRICHED payload is zero-width-free.
// The clean arm proves the strip is not lossy (premise both signs: the harness really
// produces these fields, and stripping does not mangle clean values).
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";

import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { enrichWithDrivePins, type DriveClient } from "@/lib/sync/enrichWithDrivePins";
import { finalizeArchivedTabs } from "@/lib/sync/pullSheetOverride";
import { premiseHolds } from "@/tests/_shared/premise";
import { buildXlsx } from "../helpers/buildXlsx";

/** ZWSP U+200B - ZWJ U+200D, plus BOM U+FEFF — the parser's shared strip class. */
const ZW = /[​-‍﻿]/;
const ZWSP = "​";

/** Every payload string carrying a zero-width codepoint, as `<path.to.field>`. */
function zwHits(payload: unknown): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      if (ZW.test(v)) hits.push(path);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(payload, "payload");
  return hits;
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
    archivedPullSheetTabs: [],
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
const baseCtx = { driveFileId: "sheet-1", fileMeta };

/** getFile/listFolder-only client (the onboarding shape); no Sheets API surface. */
const reducedClient: DriveClient = {
  async getFile() {
    return fileMeta;
  },
  async listFolder() {
    return { folderId: "f", files: [] };
  },
};

/** Sheets-API-branch client with one image-like embedded object. */
function sheetsClient(tabTitle: string, alt: string): DriveClient {
  return {
    ...reducedClient,
    async listSpreadsheetSheets() {
      return [
        {
          title: tabTitle,
          embeddedObjects: [
            {
              objectId: "o1",
              mimeType: "image/png",
              alt,
              contentUrl: "https://content.local/o1",
            },
          ],
        },
      ];
    },
    async getSpreadsheetRevisionId() {
      return "sheet-revision-42";
    },
    async getEmbeddedImageBytes() {
      return new TextEncoder().encode("bytes");
    },
  };
}

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/** The committed drawing-bearing fixture with its DIAGRAMS tab retitled to carry a ZWSP. */
function sampleXlsxWithZwTabTitle(): ArrayBuffer {
  const files = unzipSync(new Uint8Array(sampleXlsx()));
  const wb = strFromU8(files["xl/workbook.xml"]!);
  premiseHolds("fixture workbook declares the DIAGRAMS tab", wb.includes('name="DIAGRAMS"'));
  files["xl/workbook.xml"] = strToU8(wb.replace('name="DIAGRAMS"', () => `name="DIAGRAMS${ZWSP}"`));
  const zip = zipSync(files);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

/** Archived-tab workbook: OLD tab whose NAME and show-identity row carry a ZWSP. */
const oldRegion = (identity: string) => [
  ["PULL SHEET", "PULL SHEET"],
  [identity],
  [],
  ["QTY", "ITEM"],
  ["2", "Shure SM58"],
];

describe("enriched-payload zero-width freedom (BL-ZERO-WIDTH-POST-PARSE-ENRICHMENT)", () => {
  it("Sheets-API branch: sheetTab and alt strip zero-width from Drive metadata", async () => {
    const dirtyTitle = `DIAGRAMS${ZWSP}`;
    const dirtyAlt = `Ballroom${ZWSP} layout`;
    premiseHolds("planted tab title carries ZW", ZW.test(dirtyTitle));
    premiseHolds("planted alt carries ZW", ZW.test(dirtyAlt));

    const result = await enrichWithDrivePins(
      emptyParsed(),
      sheetsClient(dirtyTitle, dirtyAlt),
      baseCtx,
    );

    premiseHolds(
      "the harness produced an embedded image at all",
      result.diagrams.embeddedImages.length === 1,
    );
    expect(result.diagrams.embeddedImages[0]?.sheetTab).toBe("DIAGRAMS");
    expect(result.diagrams.embeddedImages[0]?.alt).toBe("Ballroom layout");
    expect(zwHits(result)).toEqual([]);
  });

  it("XLSX-media branch: sheetTab strips zero-width from the OOXML tab title", async () => {
    const result = await enrichWithDrivePins(emptyParsed(), reducedClient, {
      ...baseCtx,
      xlsxBytes: sampleXlsxWithZwTabTitle(),
    });

    premiseHolds(
      "the retitled tab was still recognized as DIAGRAMS and produced images",
      result.diagrams.embeddedImages.length > 0,
    );
    for (const image of result.diagrams.embeddedImages) {
      expect(image.sheetTab).toBe("DIAGRAMS");
    }
    expect(zwHits(result)).toEqual([]);
  });

  it("linked-folder branch: alt strips zero-width from the Drive file name", async () => {
    const dirtyName = `A ball${ZWSP}room.png`;
    premiseHolds("planted file name carries ZW", ZW.test(dirtyName));
    const client: DriveClient = {
      ...reducedClient,
      async listFolder(folderId) {
        return {
          folderId,
          files: [
            {
              driveFileId: "image-1",
              name: dirtyName,
              mimeType: "image/png",
              modifiedTime: "2026-04-01T00:00:00.000Z",
              headRevisionId: "rev-image-1",
              md5Checksum: "a".repeat(32),
            },
          ],
        };
      },
    };
    const parsed = emptyParsed({
      diagrams: {
        linkedFolder: {
          driveFolderId: "folder-1",
          driveFolderUrl: "https://drive.google.com/drive/folders/folder-1",
        },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });

    const result = await enrichWithDrivePins(parsed, client, baseCtx);

    premiseHolds(
      "the harness produced a linked-folder item at all",
      result.diagrams.linkedFolderItems.length === 1,
    );
    expect(result.diagrams.linkedFolderItems[0]?.alt).toBe("A ballroom.png");
    expect(zwHits(result)).toEqual([]);
  });

  it("archived-tab attach path: tabName and headerPreviews strip zero-width", async () => {
    const dirtyTab = `OLD PULL${ZWSP} SHEET`;
    const dirtyIdentity = `RIA${ZWSP} - CHICAGO, IL`;
    premiseHolds("planted tab name carries ZW", ZW.test(dirtyTab));
    premiseHolds("planted identity row carries ZW", ZW.test(dirtyIdentity));

    const out = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: dirtyTab, grid: oldRegion(dirtyIdentity) }]),
    );
    premiseHolds(
      "the OLD tab was detected as an archived pull-sheet tab",
      out.archivedPullSheetTabs.length === 1,
    );
    premiseHolds(
      "the raw preview derives from the planted identity row",
      (out.archivedPullSheetTabs[0]?.headerPreviews[0] ?? "").includes("CHICAGO"),
    );

    const enriched = await enrichWithDrivePins(emptyParsed(), reducedClient, baseCtx);
    const result: ParseResult = finalizeArchivedTabs(enriched, out.archivedPullSheetTabs);

    expect(result.archivedPullSheetTabs[0]?.tabName).toBe("OLD PULL SHEET");
    expect(result.archivedPullSheetTabs[0]?.headerPreviews[0]).toBe("RIA - CHICAGO, IL");
    expect(zwHits(result)).toEqual([]);
  });

  it("clean fixtures pass through verbatim (the strip is not lossy)", async () => {
    const cleanResult = await enrichWithDrivePins(
      emptyParsed(),
      sheetsClient("DIAGRAMS", "Ballroom layout"),
      baseCtx,
    );
    expect(cleanResult.diagrams.embeddedImages[0]?.sheetTab).toBe("DIAGRAMS");
    expect(cleanResult.diagrams.embeddedImages[0]?.alt).toBe("Ballroom layout");

    const out = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: "OLD PULL SHEET", grid: oldRegion("RIA - CHICAGO, IL") }]),
    );
    expect(out.archivedPullSheetTabs[0]?.tabName).toBe("OLD PULL SHEET");
    expect(out.archivedPullSheetTabs[0]?.headerPreviews[0]).toBe("RIA - CHICAGO, IL");
    expect(zwHits(out.archivedPullSheetTabs)).toEqual([]);
  });
});

// AC-M2 structural uniqueness proof: the zero-width character class has exactly ONE
// production definition site — lib/parser/zeroWidth.ts. Every other production file
// under the §2.2 uniqueness scope (lib/parser/**, lib/sync/**, lib/drive/**) imports
// the helper instead of re-typing the class. The scan is COMMENT-STRIPPED (a comment
// MENTIONING the class is documentation, not a boundary) and matches BOTH forms —
// escaped `\u200B`-class sequences AND raw zero-width glyph literals (the form a
// naive escaped-only scan misses; hotelConfTokens carried exactly that pre-branch).
// Enumerated mirrors that deliberately stay OUTSIDE this scope (spec §2.2): the
// mutation oracle's local strip (tests/parser/mutation/oracle.ts — oracle
// independence is the point) and test-fixture literals under tests/** (assertion
// inputs, not boundaries). Neither lives under the scanned roots.
describe("zero-width character-class uniqueness (lib/parser, lib/sync, lib/drive)", () => {
  const REPO_ROOT = process.cwd();
  const SCAN_ROOTS = ["lib/parser", "lib/sync", "lib/drive"];
  const HELPER = "lib/parser/zeroWidth.ts";

  /** Escaped forms: \u200B..\u200D / \uFEFF, brace variants included. */
  const ESCAPED_FORM = /\\u\{?0*(?:200[BCD]|FEFF)\}?/i;
  /** Raw glyph literals of the same class. */
  const RAW_FORM = new RegExp("[\\u200B-\\u200D\\uFEFF]");
  const hasZwClassLiteral = (path: string, source: string): boolean => {
    const stripped = stripCommentsForFile(source, path);
    return ESCAPED_FORM.test(stripped) || RAW_FORM.test(stripped);
  };

  const productionTsFiles = (root: string): string[] =>
    readdirSync(join(REPO_ROOT, root), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx")))
      .map((e) => join(e.parentPath, e.name).slice(REPO_ROOT.length + 1));

  it("the ONLY production definition site is lib/parser/zeroWidth.ts", () => {
    const files = SCAN_ROOTS.flatMap(productionTsFiles);
    premiseHolds("the scan walked a real tree", files.length > 50);
    premiseHolds("the scan includes the helper module itself", files.includes(HELPER));

    const definitionSites = files.filter((f) =>
      hasZwClassLiteral(f, readFileSync(join(REPO_ROOT, f), "utf8")),
    );
    // The helper being the expected single hit (not excluded from the scan) is the
    // guard's own premise: it proves the scan can see the class at all.
    expect(definitionSites).toEqual([HELPER]);
  });

  it("premise mutants: the scan detects both literal forms and ignores comments", () => {
    // Planted escaped-form mutant fails by name.
    expect(hasZwClassLiteral("mutant.ts", "const zw = /[\\u200B-\\u200D\\uFEFF]/g;\n")).toBe(true);
    // Planted raw-glyph mutant fails by name (the form an escaped-only scan misses).
    expect(hasZwClassLiteral("mutant.ts", 'const zw = "\u200B";\n')).toBe(true);
    // Brace variant.
    expect(hasZwClassLiteral("mutant.ts", 'const zw = "\\u{200B}";\n')).toBe(true);
    // A comment MENTION does not hit — escaped form in a line comment...
    expect(hasZwClassLiteral("clean.ts", "// strips \\u200B and friends\nconst x = 1;\n")).toBe(
      false,
    );
    // ...and a raw glyph in a block comment.
    expect(hasZwClassLiteral("clean.ts", "/* raw \u200B glyph */\nconst x = 1;\n")).toBe(false);
  });
});

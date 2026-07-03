/**
 * Builds a deterministic, non-sensitive minimal OOXML (.xlsx) fixture exercising
 * the DIAGRAMS-tab embedded-image extractor:
 *   - DIAGRAMS tab: PNG_A + PNG_SHARED placed twice (dedup) + one .emf (raster-filter drop)
 *   - INFO tab: PNG_B (per-tab attribution — must NOT surface via DIAGRAMS)
 * PNGs are generated programmatically (valid 1x1 RGB) so the fixture carries no
 * real venue data. Regenerate with: pnpm tsx tests/fixtures/diagrams/buildEmbeddedSampleXlsx.ts
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u32(n: number): Uint8Array {
  return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = strToU8(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return new Uint8Array([...u32(data.length), ...body, ...u32(crc32(body))]);
}
/** Valid 1x1 RGB PNG of the given color. */
function makePng(r: number, g: number, b: number): Uint8Array {
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array([...u32(1), ...u32(1), 8, 2, 0, 0, 0]); // 1x1, 8-bit, RGB
  const raw = Uint8Array.from([0, r, g, b]); // filter byte 0 + one RGB pixel
  const idat = new Uint8Array(deflateSync(raw));
  return new Uint8Array([
    ...sig,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

const PNG_A = makePng(255, 0, 0);
const PNG_B = makePng(0, 0, 255);
const PNG_SHARED = makePng(0, 255, 0);
const EMF_JUNK = strToU8("not-a-real-emf-but-carries-a-.emf-extension");

const files: Record<string, Uint8Array> = {
  "[Content_Types].xml": strToU8(
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`,
  ),
  "_rels/.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  ),
  "xl/workbook.xml": strToU8(
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DIAGRAMS" sheetId="1" r:id="rId1"/><sheet name="INFO" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  ),
  "xl/_rels/workbook.xml.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
  ),
  "xl/worksheets/sheet1.xml": strToU8(
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>`,
  ),
  "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
  ),
  "xl/worksheets/sheet2.xml": strToU8(
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>`,
  ),
  "xl/worksheets/_rels/sheet2.xml.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/></Relationships>`,
  ),
  "xl/drawings/drawing1.xml": strToU8(
    `<xdr:wsDr xmlns:xdr="x" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a r:embed="rIdA"/><a r:embed="rIdS1"/><a r:embed="rIdS2"/><a r:embed="rIdE"/></xdr:wsDr>`,
  ),
  "xl/drawings/_rels/drawing1.xml.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageA.png"/><Relationship Id="rIdS1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageShared.png"/><Relationship Id="rIdS2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageShared.png"/><Relationship Id="rIdE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageJunk.emf"/></Relationships>`,
  ),
  "xl/drawings/drawing2.xml": strToU8(
    `<xdr:wsDr xmlns:xdr="x" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a r:embed="rIdB"/></xdr:wsDr>`,
  ),
  "xl/drawings/_rels/drawing2.xml.rels": strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageB.png"/></Relationships>`,
  ),
  "xl/media/imageA.png": PNG_A,
  "xl/media/imageB.png": PNG_B,
  "xl/media/imageShared.png": PNG_SHARED,
  "xl/media/imageJunk.emf": EMF_JUNK,
};

export function buildEmbeddedSampleXlsx(): Uint8Array {
  // Fixed in-range mtime (2020-01-01) keeps the zip byte-deterministic across
  // regenerations. fflate rejects pre-1980 dates (DOS date range).
  return zipSync(files, { mtime: new Date("2020-01-01T00:00:00Z") });
}

if (process.argv[1]?.endsWith("buildEmbeddedSampleXlsx.ts")) {
  writeFileSync(new URL("./embedded-sample.xlsx", import.meta.url), buildEmbeddedSampleXlsx());
  // eslint-disable-next-line no-console
  console.log("wrote tests/fixtures/diagrams/embedded-sample.xlsx");
}

import * as XLSX from "xlsx";

/**
 * Build an in-memory xlsx ArrayBuffer from named sheets + row grids, using the SAME
 * `xlsx` (SheetJS) library that `lib/drive/exportSheetToMarkdown.ts` reads with. Lets
 * exporter tests construct workbooks (e.g. an `OLD PULL SHEET` tab) without committing
 * binary fixtures.
 */
export function buildXlsx(sheets: { name: string; grid: string[][] }[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const { name, grid } of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(grid);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  // SheetJS `type: "array"` may hand back a Uint8Array; normalize to a true ArrayBuffer.
  if (out instanceof Uint8Array) {
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  return out as ArrayBuffer;
}

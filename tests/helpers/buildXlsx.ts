import * as XLSX from "xlsx";

/**
 * Build an in-memory xlsx ArrayBuffer from named sheets + row grids, using the SAME
 * `xlsx` (SheetJS) library that `lib/drive/exportSheetToMarkdown.ts` reads with. Lets
 * exporter tests construct workbooks (e.g. an `OLD PULL SHEET` tab) without committing
 * binary fixtures.
 *
 * `hidden` writes the tab's OOXML visibility (`<sheet state="hidden">` / `"veryHidden"`),
 * the same field Google's xlsx export carries for a tab hidden in the Sheets UI. SheetJS
 * reads it back as `Workbook.Sheets[i].Hidden` (0 visible, 1 hidden, 2 very hidden).
 */
export function buildXlsx(
  sheets: { name: string; grid: string[][]; hidden?: boolean | 1 | 2 }[],
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const visibility: { Hidden: 0 | 1 | 2 }[] = [];
  for (const { name, grid, hidden } of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(grid);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
    visibility.push({ Hidden: hidden === true ? 1 : hidden === 1 || hidden === 2 ? hidden : 0 });
  }
  if (visibility.some((v) => v.Hidden !== 0)) workbook.Workbook = { Sheets: visibility };
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  // SheetJS `type: "array"` may hand back a Uint8Array; normalize to a true ArrayBuffer.
  if (out instanceof Uint8Array) {
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  return out as ArrayBuffer;
}

/**
 * Splice a HIDDEN tab into an existing workbook right after `after`, keeping every other tab
 * and its visibility. For probes that drop a dead lookup tab into a committed corpus workbook
 * at a chosen position (Codex R3: position matters, `parseGearTab` scans across tab boundaries).
 */
export function withHiddenTabAfter(
  buffer: ArrayBuffer,
  after: string,
  name: string,
  grid: string[][],
): ArrayBuffer {
  const workbook = XLSX.read(buffer, { type: "array" });
  const at = workbook.SheetNames.indexOf(after);
  if (at === -1) throw new Error(`withHiddenTabAfter: no tab named ${after}`);
  const visibility = workbook.SheetNames.map(
    (_, i) => workbook.Workbook?.Sheets?.[i] ?? ({ Hidden: 0 } as const),
  );
  workbook.SheetNames.splice(at + 1, 0, name);
  workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(grid);
  visibility.splice(at + 1, 0, { Hidden: 1 });
  workbook.Workbook = { ...(workbook.Workbook ?? {}), Sheets: visibility };
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  if (out instanceof Uint8Array) {
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  return out as ArrayBuffer;
}

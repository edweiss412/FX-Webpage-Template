import * as XLSX from "xlsx";

type CellGrid = string[][];

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  const value = cell.w ?? cell.v;
  if (value === null || value === undefined) return "";
  return String(value);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function escapeCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "&#10;")
    .replace(/\|/g, "\\|")
    .replace(/(\\#[A-Z0-9/]+)!/g, "$1\\!");
}

function expandMerges(grid: CellGrid, merges: readonly XLSX.Range[] = []): void {
  for (const merge of merges) {
    const source = grid[merge.s.r]?.[merge.s.c] ?? "";
    if (isBlank(source)) continue;
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      grid[row] ??= [];
      for (let col = merge.s.c; col <= merge.e.c; col += 1) {
        grid[row][col] = source;
      }
    }
  }
}

function sheetGrid(sheet: XLSX.WorkSheet): CellGrid {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: CellGrid = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const outputRow: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      outputRow.push(cellText(sheet[XLSX.utils.encode_cell({ r: row, c: col })]));
    }
    grid.push(outputRow);
  }

  expandMerges(grid, sheet["!merges"]);
  return grid;
}

function rowIsBlank(row: readonly string[]): boolean {
  return row.every(isBlank);
}

function splitBlocks(grid: CellGrid): CellGrid[] {
  const blocks: CellGrid[] = [];
  let current: CellGrid = [];

  for (const row of grid) {
    if (rowIsBlank(row)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(row);
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map(trimBlock).filter((block) => block.length > 0);
}

function trimBlock(block: CellGrid): CellGrid {
  const firstNonBlankCol = block.reduce<number | null>((first, row) => {
    for (let col = 0; col < row.length; col += 1) {
      if (!isBlank(row[col] ?? "")) return first === null ? col : Math.min(first, col);
    }
    return first;
  }, null);
  if (firstNonBlankCol === null) return [];

  const lastNonBlankCol = block.reduce((last, row) => {
    for (let col = row.length - 1; col >= 0; col -= 1) {
      if (!isBlank(row[col] ?? "")) return Math.max(last, col);
    }
    return last;
  }, firstNonBlankCol);

  return block.map((row) => row.slice(firstNonBlankCol, lastNonBlankCol + 1));
}

function tableMarkdown(block: CellGrid): string {
  const width = block.reduce((max, row) => Math.max(max, row.length), 0);
  const rows = block.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? "")),
  );
  const delimiter = Array.from({ length: width }, () => ":---:");

  return [
    `| ${rows[0]?.join(" | ") ?? ""} |`,
    `| ${delimiter.join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function synthesizeMarkdownFromXlsx(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const tables: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    for (const block of splitBlocks(sheetGrid(sheet))) {
      tables.push(tableMarkdown(block));
    }
  }

  return tables.join("\n\n");
}

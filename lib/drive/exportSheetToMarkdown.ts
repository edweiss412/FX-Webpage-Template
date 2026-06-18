import * as XLSX from "xlsx";

type CellGrid = string[][];

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  const value = cell.w ?? cell.v;
  if (value === null || value === undefined) return "";
  return String(value);
}

function isBlank(value: string): boolean {
  return !/\S/.test(value);
}

function stripEdgeWhitespace(value: string): string {
  return value.replace(/^\s+|\s+$/g, "");
}

function escapeCell(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\|/g, "\\|")
    .replace(/(\\#[A-Z0-9/]+)!/g, "$1\\!");
  return normalizeNewlines(escaped);
}

function normalizeNewlines(value: string): string {
  if (!/[\r\n]/.test(value)) return value;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (shouldPreserveNewlines(normalized)) return normalized.replace(/\n/g, "&#10;");
  return normalized
    .split("\n")
    .map(stripEdgeWhitespace)
    .filter((line) => line.length > 0)
    .join(" ");
}

function shouldPreserveNewlines(value: string): boolean {
  if (value.startsWith("PULL SHEET/")) return true;
  if (/\*GETS RESET/.test(value)) return true;
  const lines = value.split("\n").map(stripEdgeWhitespace);
  if (lines.some((line) => /^\(\d+\)\s+/.test(line))) return false;
  if (lines.length >= 3) return false;
  if (lines[1] && /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}/.test(lines[1])) return false;
  if (lines[1]?.startsWith("(")) return false;
  if (lines[1]?.startsWith("<")) return false;
  if (lines.slice(1).some((line) => /^[A-Z][A-Za-z ]+:\s/.test(line))) return false;
  return true;
}

function expandMerges(grid: CellGrid, merges: readonly XLSX.Range[] = []): void {
  for (const merge of merges) {
    const source = grid[merge.s.r]?.[merge.s.c] ?? "";
    if (isBlank(source)) continue;
    grid[merge.s.r] ??= [];
    const targetRow = grid[merge.s.r];
    for (let col = merge.s.c; col <= merge.e.c; col += 1) {
      if (targetRow && isBlank(targetRow[col] ?? "")) {
        targetRow[col] = source;
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

function normalizePullSheetGrid(sheetName: string, grid: CellGrid): CellGrid {
  if (!/PULL SHEET/i.test(sheetName)) return grid;
  const firstDataRow = grid.findIndex((row) => {
    const quantity = Number(row[0]);
    return Number.isFinite(quantity) && !isBlank(row[1] ?? "");
  });
  if (firstDataRow <= 0) return grid;

  const titleParts = grid
    .slice(0, firstDataRow)
    .flatMap((row) => row.filter((value) => !isBlank(value)))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (titleParts.length === 0) return grid;

  const width = Math.max(
    1,
    ...grid.slice(firstDataRow).map((row) => {
      for (let col = row.length - 1; col >= 0; col -= 1) {
        if (!isBlank(row[col] ?? "")) return col + 1;
      }
      return 0;
    }),
  );
  return [Array.from({ length: width }, () => titleParts.join("/")), ...grid.slice(firstDataRow)];
}

function normalizeBlock(block: CellGrid): CellGrid {
  // NOTE: a bare "DETAILS" block was previously collapsed to label-only
  // (`block.map((row) => [row[0]])`) on the premise that v2 DETAILS sections
  // carry no values. The 2026-06-18 grounding audit disproved that premise:
  // the live source sheets (incl. originals outside the test folder, e.g.
  // Asset-Mgmt INFO!B53-72) populate col B (Stage Size, Opening Reel, Polling,
  // Power, ...). The "label-only" shape was an artifact of the old Drive-MCP
  // markdown converter, not the source. The value column is now preserved so
  // parseEventDetails populates event_details + openingReel.
  // See DEFERRED.md AUDIT-2026-06-18-PARSE-FIDELITY-DEF-1.
  if (
    /^GENERAL SESSION/i.test(block[0]?.[0] ?? "") &&
    /^(?:GS|BO) Setup$/i.test(block[1]?.[0] ?? "")
  ) {
    return block.slice(1);
  }
  return block;
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
    const grid = normalizePullSheetGrid(sheetName, sheetGrid(sheet));
    for (const block of splitBlocks(grid).map(normalizeBlock)) {
      tables.push(tableMarkdown(block));
    }
  }

  return tables.join("\n\n");
}

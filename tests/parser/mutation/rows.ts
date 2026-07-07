// tests/parser/mutation/rows.ts
export type RowClass = "header" | "alignment" | "spacer" | "data";
export type Row = { line: number; cells: string[]; cls: RowClass };
export type LogicalSection = {
  index: number;
  headerRow: Row | null;
  rows: Row[];
  runIndex: number;
};
export type Run = { index: number; sections: LogicalSection[]; startLine: number };
export type Segmentation = { runs: Run[]; sections: LogicalSection[] };

/**
 * A markdown pipe-table row split into trimmed cell strings (framing pipes dropped).
 *
 * DELIBERATELY mirrors the live parser's `lib/parser/blocks/_helpers.ts:splitRow`
 * (`line.split("|").slice(1,-1)`): the parser does NOT honor `\|` escapes at split
 * time — it splits on the raw pipe and strips the backslash later in `clean()` (plan-R11).
 * So an escaped `\|` inside a cell fragments into TWO cells here EXACTLY as it does for the
 * parser. This preserves the metamorphic property: a mutation on one fragment is still a
 * single-site change in PARSER-space (baseline and mutant both flow through the same
 * splitRow), so it does not manufacture a false alarm. The harness follows parser behavior
 * rather than "correct" markdown escaping ON PURPOSE — pinned by the escaped-pipe test below.
 */
export function splitCells(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  // EXACT parser parity: `split("|").slice(1,-1)` (splitRow). This DROPS the final segment
  // when the trailing pipe is ABSENT (`| A | B` → ["A"]), matching parseSheet's cell model —
  // NOT an "optional trailing pipe" strip, which would over-count that pinned edge (plan-R13).
  return t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

const ALIGN = /^:?-{1,}:?$/;

export function classifyRow(cells: string[], isHeader?: (cells: string[]) => boolean): RowClass {
  const nonEmpty = cells.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "spacer";
  if (nonEmpty.every((c) => ALIGN.test(c))) return "alignment";
  if (isHeader && isHeader(cells)) return "header";
  return "data";
}

/**
 * Segment markdown into pipe RUNS (blank-line delimited) and, within each run,
 * header-anchored LOGICAL SECTIONS. A section starts at each header row and owns
 * subsequent rows until the next header row or the run boundary. Rows before the
 * first header in a run form a headerless (`headerRow: null`) section.
 */
export function segment(md: string, isHeader: (cells: string[]) => boolean): Segmentation {
  const lines = md.split("\n");
  const runs: Run[] = [];
  const sections: LogicalSection[] = [];
  let curRun: Run | null = null;
  let curSec: LogicalSection | null = null;

  const closeRun = () => {
    if (curSec && curRun && !curRun.sections.includes(curSec)) curRun.sections.push(curSec);
    curSec = null;
    curRun = null;
  };

  lines.forEach((line, i) => {
    if (line.trim() === "" || !line.trim().startsWith("|")) {
      // blank line (or non-table line) ends the current run
      closeRun();
      return;
    }
    if (!curRun) {
      curRun = { index: runs.length, sections: [], startLine: i };
      runs.push(curRun);
      curSec = null;
    }
    const cells = splitCells(line);
    const cls = classifyRow(cells, isHeader);
    const row: Row = { line: i, cells, cls };
    if (cls === "header") {
      if (curSec) curRun.sections.push(curSec);
      curSec = { index: sections.length, headerRow: row, rows: [row], runIndex: curRun.index };
      sections.push(curSec);
    } else {
      if (!curSec) {
        curSec = { index: sections.length, headerRow: null, rows: [], runIndex: curRun.index };
        sections.push(curSec);
      }
      curSec.rows.push(row);
    }
  });
  closeRun();
  return { runs, sections };
}

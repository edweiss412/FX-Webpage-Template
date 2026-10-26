import * as XLSX from "xlsx";
import { synthesizeBlocksFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { blockRowsForScan, normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import { isAgendaLinkRow } from "@/lib/parser/agendaLinkRow";
import { clean } from "@/lib/parser/blocks/_helpers";
import { travelHeaderIndices } from "@/lib/parser/blocks/travelFlights";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/**
 * Cells located by CONTENT, for warnings that carry no coordinate of their own:
 * UNKNOWN_SECTION_HEADER (the header text), AGENDA_LINK_NOT_CLICKABLE (the agenda-link row),
 * and the three TRAVEL_FLIGHT codes (the TRAVEL table header). Plus the visible-tab map that
 * PULL_SHEET_ON_ARCHIVED_TAB links through by tab name.
 *
 * Hidden tabs contribute nothing. Google Sheets refuses a hidden gid in a deep link and lands
 * on the last visible tab with the range dropped, so a link there opens the wrong place. A
 * missing link is the better failure.
 */
export type ContentAnchors = {
  /** The first cell of every row, keyed by `normalizeCellKey` of its text. */
  rowLabels: { label: string; anchor: SourceAnchor }[];
  /** The label cell of every row `isAgendaLinkRow` accepts, in sheet order. */
  agendaLinks: SourceAnchor[];
  /** The NAME cell of every row carrying the TRAVEL header signature, in sheet order. */
  travelHeaders: SourceAnchor[];
  /** Title to gid for every visible tab that has a gid. */
  visibleTabs: Map<string, number>;
};

/** Title to gid for the workbook's VISIBLE tabs that `titleToGid` knows. `sheetRows: 1` keeps
 *  the read cheap; SheetJS still reports `Workbook.Sheets[i].Hidden` under it, where
 *  `bookSheets` does not (probed 2026-10-25). */
export function visibleTabGids(
  buffer: ArrayBuffer,
  titleToGid: ReadonlyMap<string, number>,
): Map<string, number> {
  const workbook = XLSX.read(buffer, { type: "array", sheetRows: 1 });
  const out = new Map<string, number>();
  for (const [i, title] of workbook.SheetNames.entries()) {
    if ((workbook.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0) continue;
    const gid = titleToGid.get(title);
    if (typeof gid === "number") out.set(title, gid);
  }
  return out;
}

export function extractContentAnchors(
  buffer: ArrayBuffer,
  titleToGid: ReadonlyMap<string, number>,
): ContentAnchors {
  const out: ContentAnchors = {
    rowLabels: [],
    agendaLinks: [],
    travelHeaders: [],
    visibleTabs: visibleTabGids(buffer, titleToGid),
  };
  const { blocks } = synthesizeBlocksFromXlsx(buffer);
  for (const block of blocks) {
    // Opaque blocks are included OLD-tab pull-sheet regions with no grid behind them.
    if (block.kind !== "grid" || block.sheetHidden) continue;
    const gid = titleToGid.get(block.sheetName);
    if (typeof gid !== "number") continue;
    blockRowsForScan(block).forEach((row, i) => {
      const src = block.rows[i];
      if (!src || src.absRow === null) return; // a synthesized row has no source cell
      const cells = row.map((c) => clean(c));
      const label = cells[0] ?? "";
      if (!label) return;
      const anchor: SourceAnchor = {
        title: block.sheetName,
        gid,
        a1: XLSX.utils.encode_cell({ r: src.absRow, c: block.absCol0 }),
        scope: "cell",
      };
      out.rowLabels.push({ label: normalizeCellKey(label), anchor });
      if (isAgendaLinkRow(label, cells[1] ?? "")) out.agendaLinks.push(anchor);
      if (travelHeaderIndices(cells)) out.travelHeaders.push(anchor);
    });
  }
  return out;
}

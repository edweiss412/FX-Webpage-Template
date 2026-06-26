import * as XLSX from "xlsx";
import { buildAbsGrid } from "@/lib/drive/sourceAnchors";
import { clean, normalizeDate } from "@/lib/parser/blocks/_helpers";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/**
 * extractShowDayTimeAnchors — locate the source cell behind each show-day's TIME
 * value so a SCHEDULE_TIME_UNPARSED warning can deep-link to the exact cell.
 *
 * The parser runs on the synthesized markdown (which loses A1 coordinates), so we
 * re-scan the RAW workbook here. We key each anchor by the show-day ISO date (the
 * stable semantic key) rather than by markdown row index — the markdown synthesis
 * pipeline (splitBlocks / normalizeBlock) can shift row order, but a show-day's
 * date is unique, so attaching by date avoids any divergence with the parse.
 *
 * Detection mirrors `readShowDayTimeCells` (lib/parser/blocks/scheduleTimes.ts):
 * a row's SHOW DAY label, then the date at +2 and the TIME cell at +3. We anchor
 * on the SHOW DAY cell's CONTENT (not an absolute column) so the offsets hold
 * wherever the DATES block sits. The TIME cell's tab is the containing sheet; its
 * gid comes from `titleToGid` (sheet metadata). A row is skipped when the +2 cell
 * isn't a date, the sheet has no gid, or the TIME column is past the used range —
 * a missing anchor degrades to no link, never a wrong one.
 */
export type ShowDayTimeAnchor = { iso: string; anchor: SourceAnchor };

const SHOW_DAY_RE = /^SHOW\s+DAY\b/i;

export function extractShowDayTimeAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): ShowDayTimeAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: ShowDayTimeAnchor[] = [];

  for (const sheetName of workbook.SheetNames) {
    // Mirror synthesizeMarkdownFromXlsx's skip of archived "OLD ..." tabs so we
    // never anchor into a stale prior show's grid.
    if (/\bOLD\b/i.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;
    const gid = titleToGid.get(sheetName);
    if (typeof gid !== "number") continue; // no gid → no anchor possible

    const grid = buildAbsGrid(sheet);
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      for (let c = grid.minCol; c <= grid.maxCol; c++) {
        if (!SHOW_DAY_RE.test(clean(grid.cell(r, c)))) continue;
        // SHOW DAY at column c → date at c+2, TIME cell at c+3.
        const rawDate = clean(grid.cell(r, c + 2));
        const iso = rawDate ? normalizeDate(rawDate) : null;
        if (!iso) break; // a SHOW DAY row without a readable date → no anchor
        const timeCol = c + 3;
        if (timeCol > grid.maxCol) break;
        const a1 = XLSX.utils.encode_cell({ r, c: timeCol });
        out.push({ iso, anchor: { title: sheetName, gid, a1 } });
        break; // one SHOW DAY label per row
      }
    }
  }

  return out;
}

/**
 * resolveSourceCell — pick the single anchor matching a warning's show-day date.
 * Returns null when there's no match OR the date is ambiguous (more than one
 * show-day row shares it — a data error), so a wrong-cell link is never produced.
 */
export function resolveSourceCell(
  anchors: ShowDayTimeAnchor[],
  iso: string | undefined | null,
): SourceAnchor | null {
  if (!iso) return null;
  const matches = anchors.filter((a) => a.iso === iso);
  return matches.length === 1 ? matches[0]!.anchor : null;
}

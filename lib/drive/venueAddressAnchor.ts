import * as XLSX from "xlsx";
import { synthesizeBlocksFromXlsx, type SynthesizedBlock } from "@/lib/drive/exportSheetToMarkdown";
import { resolveAlias } from "@/lib/parser/aliases";
import {
  REGION_ANCHOR_SPEC,
  SOURCE_LINK_ALLOWLIST,
  type SourceAnchor,
} from "@/lib/sheet-links/buildSheetDeepLink";

/**
 * The empty address cell a VENUE_ADDRESS_MISSING warning is about (warning-card-fixes spec
 * §4.2 item 3), found in the venue block itself so both venue layouts are reached:
 *
 *   - 2-column: `Hotel Address | <value>`, the label in the block's first column (i = 0);
 *   - 3-column scope layout: `| | VENUE ADDRESS | <value> |`, the label on a blank-col0
 *     continuation row (i = 1), which the UNKNOWN_FIELD scan skips.
 *
 * Tab and header come from `REGION_ANCHOR_SPEC.venue`, the same choice `extractSourceAnchors`
 * makes for the venue region. A cell is returned only when the venue block(s) hold exactly one
 * address row AND its value cell is blank; anything else is `null` and the caller falls back to
 * the venue region. Never a wrong cell, the same posture as `resolveUnknownFieldCell`.
 *
 * No `.trim()` / `.toLowerCase()` here: every lib/drive file is scanned by
 * tests/admin/no-inline-email-normalization.test.ts. Blankness is `/\S/` (the lib/drive idiom)
 * and label matching goes through `resolveAlias`, which normalizes inside lib/parser.
 */
export function resolveVenueAddressCell(
  blocks: readonly SynthesizedBlock[],
  titleToGid: ReadonlyMap<string, number>,
): SourceAnchor | null {
  const spec = REGION_ANCHOR_SPEC.venue;
  if (spec.strategy !== "header-block") return null;
  let tab: string | null = null;
  let gid: number | null = null;
  for (const t of spec.tabs) {
    const g = titleToGid.get(t);
    if (g !== undefined && (SOURCE_LINK_ALLOWLIST as readonly string[]).includes(t)) {
      tab = t;
      gid = g;
      break;
    }
  }
  if (tab === null || gid === null) return null;

  const hits: { absRow: number; col: number; value: string }[] = [];
  for (const block of blocks) {
    if (block.kind !== "grid" || block.sheetName !== tab) continue;
    // The raw cell, as `headerBlock` tests it.
    const headerAt = block.rows.findIndex((row) => spec.header.test(row.cells[0] ?? ""));
    if (headerAt === -1) continue;
    for (const row of block.rows.slice(headerAt)) {
      if (row.absRow === null) continue;
      const i = [0, 1].find((k) => resolveAlias(row.cells[k] ?? "") === "venue.address");
      if (i === undefined) continue;
      // A grid block's cells are a contiguous column slice from absCol0.
      hits.push({ absRow: row.absRow, col: block.absCol0 + i + 1, value: row.cells[i + 1] ?? "" });
    }
  }
  if (hits.length !== 1) return null;
  const hit = hits[0]!;
  if (/\S/.test(hit.value)) return null;
  return {
    title: tab,
    gid,
    a1: XLSX.utils.encode_cell({ r: hit.absRow, c: hit.col }),
    scope: "cell",
  };
}

export function extractVenueAddressAnchor(
  buffer: ArrayBuffer,
  titleToGid: ReadonlyMap<string, number>,
): SourceAnchor | null {
  return resolveVenueAddressCell(synthesizeBlocksFromXlsx(buffer).blocks, titleToGid);
}

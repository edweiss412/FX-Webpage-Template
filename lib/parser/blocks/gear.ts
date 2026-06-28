/**
 * GEAR date-grid parser (spec §3.1).
 *
 * Modern FXAV sheets carry a GEAR tab whose equipment is laid out as a date-grid:
 * a `Rental Dates` banner row followed by a DOUBLED `| Item | Item | <date> … |`
 * header, then per-room sub-headers and full-width equipment rows whose date
 * columns carry per-day quantities. We parse that grid into per-room A/V/L/scenic/
 * other discipline strings using the closed classification registry
 * (`lib/parser/gearClassification.ts`), to be merged onto the existing `rooms`
 * columns in `parseSheet` (no schema change).
 *
 * Scope: the production exporter shape ONLY (the doubled `| Item | Item |` header).
 * The legacy "raw" Drive-renderer family emits a single `| Item | | … |` header
 * (empty col1); `hasGearDateGrid` returns false for it → `parseGearTab` returns []
 * (anti-corruption — we never emit a half-parsed gear-only room).
 */

import type { RoomKind } from "../types";
import { splitRow, clean } from "./_helpers";
import {
  classifyGearItem,
  gearBucketFor,
  isGroupingOnly,
  type GearDiscipline,
} from "../gearClassification";

export type GearRoom = {
  kind: RoomKind;
  name: string;
  audio: string | null;
  video: string | null;
  lighting: string | null;
  scenic: string | null;
  other: string | null;
};

const DATE_TOKEN_RE = /^\d{1,2}-[A-Z][a-z]{2}$/;

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^[\s:|*-]*$/.test(c));
}

function norm(s: string): string {
  return clean(s).toLowerCase().trim();
}

/** Collect every non-separator markdown table row as a trimmed cell array, in order. */
function tableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = splitRow(t);
    if (isSeparatorRow(cells)) continue;
    rows.push(cells);
  }
  return rows;
}

function isRentalDatesRow(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => clean(c).length > 0);
  return nonEmpty.length > 0 && nonEmpty.every((c) => /rental dates/i.test(c));
}

/** The R8-M2 discriminator: the prod exporter DOUBLES the Item column (`| Item | Item |`). */
function isDoubledItemHeader(cells: string[]): boolean {
  if (norm(cells[0] ?? "") !== "item" || norm(cells[1] ?? "") !== "item") return false;
  return cells.slice(2).some((c) => DATE_TOKEN_RE.test(clean(c)));
}

/**
 * The shared date-grid signature check over already-split cell rows: a Rental Dates
 * banner row immediately followed (separator/blank rows excluded) by a DOUBLED
 * `| Item | Item | <date> … |` header. Used by both `hasGearDateGrid` (markdown) and
 * the source-anchor gate (XLSX grid) so the predicate lives in one place (Task 8).
 */
export function rowsHaveGearDateGrid(rows: string[][]): boolean {
  for (let i = 0; i < rows.length - 1; i++) {
    if (isRentalDatesRow(rows[i]!) && isDoubledItemHeader(rows[i + 1]!)) return true;
  }
  return false;
}

/** The SOLE date-grid signature predicate over markdown (spec §3.1). */
export function hasGearDateGrid(markdown: string): boolean {
  return rowsHaveGearDateGrid(tableRows(markdown));
}

const ROOM_PREFIX_RE =
  /^(GENERAL SESSION|BREAKOUT( SESSION)?\s*\d*|LUNCH( ROOM| SESSION)?|ADDITIONAL( ROOM)?)\s*-?\s*/i;

function newRoom(header: string): GearRoom {
  const upper = header.toUpperCase();
  let kind: RoomKind = "additional";
  if (/^GENERAL\b/.test(upper)) kind = "gs";
  else if (/^BREAKOUT\b/.test(upper)) kind = "breakout";
  const stripped = header
    .replace(ROOM_PREFIX_RE, "")
    .replace(/\s*(Dimensions|Floor)\s*$/i, "")
    .trim();
  return {
    kind,
    name: stripped.length > 0 ? stripped : header.trim(),
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    other: null,
  };
}

function appendDiscipline(room: GearRoom, disc: GearDiscipline, value: string): void {
  const existing = room[disc];
  room[disc] = (existing ? existing + "\n" : "") + value;
}

export function parseGearTab(markdown: string): GearRoom[] {
  if (!hasGearDateGrid(markdown)) return [];
  const rows = tableRows(markdown);

  let start = -1;
  for (let i = 0; i < rows.length - 1; i++) {
    if (isRentalDatesRow(rows[i]!) && isDoubledItemHeader(rows[i + 1]!)) {
      start = i + 2;
      break;
    }
  }
  if (start < 0) return [];

  const out: GearRoom[] = [];
  let cur: GearRoom | null = null;
  let bucket: "audio" | "lighting" | null = null;

  const flush = (): void => {
    if (cur && (cur.audio || cur.video || cur.lighting || cur.scenic || cur.other)) out.push(cur);
    cur = null;
  };

  for (let i = start; i < rows.length; i++) {
    const cells = rows[i]!;
    const col0 = clean(cells[0] ?? "");
    if (/^back to info/i.test(col0)) break;
    if (col0.length === 0) continue;

    // A 2-cell row is a room sub-header (kind from the leading word; prefix-stripped name).
    if (cells.length === 2) {
      flush();
      cur = newRoom(col0);
      bucket = null;
      continue;
    }

    // Full-width row → equipment line item.
    if (!cur) continue; // defensive: equipment before any room header
    const item = col0;

    // Package bucket-setters update the active bucket even when not emitted.
    const b = gearBucketFor(item);
    if (b) bucket = b;
    if (isGroupingOnly(item)) continue; // structural grouping header — not an item

    const disc = classifyGearItem(item, bucket);

    // Quantity + no-duplication (R3-M1): strip a leading (N) from the display text
    // before re-prepending; fall back to the max numeric date-column cell.
    const leadingMatch = /^\s*\((\d+)\)\s*/.exec(item);
    const leadingN = leadingMatch ? parseInt(leadingMatch[1]!, 10) : null;
    const displayItem = item.replace(/^\s*\(\d+\)\s*/, "").trim();
    let maxDate: number | null = null;
    for (const c of cells.slice(2)) {
      const cc = clean(c);
      if (cc.length === 0) continue;
      const n = Number(cc);
      if (Number.isFinite(n)) maxDate = maxDate === null ? n : Math.max(maxDate, n);
    }
    const qty = leadingN ?? maxDate;
    const emitted = qty != null ? `(${qty}) ${displayItem}` : displayItem;
    appendDiscipline(cur, disc, emitted);
  }
  flush();
  return out;
}

import type { CrewMemberRow } from "../types";
import type { ParseAggregator } from "../warnings";
import { clean } from "./_helpers";
import {
  travelFlightNameUnmatched,
  travelFlightUnparseable,
  travelFlightAmbiguousTable,
} from "./travelFlightWarnings";

const DATE_RE = /^\d{1,2}\/\d{1,2}$/;

/**
 * A flattened TRAVEL FLIGHT DETAILS cell → flight_info, or null if it has no
 * M/D leg date (the exporter flattens the source cell to one space-separated
 * line, so the only leg boundary is the date token). The render splits the
 * result on " | "; a literal source pipe is normalized to "/" so it cannot
 * create a spurious leg.
 */
export function normalizeTravelCell(raw: string): string | null {
  const safe = raw.replace(/\|/g, "/");
  const tokens = safe.split(/\s+/).filter((t) => t.length > 0);
  const dateIdx = tokens.flatMap((t, i) => (DATE_RE.test(t) ? [i] : []));
  if (dateIdx.length === 0) return null;
  const conf = tokens.slice(0, dateIdx[0]!).join(" ");
  const legs: string[] = [];
  for (let k = 0; k < dateIdx.length; k += 1) {
    const start = dateIdx[k]!;
    const end = k + 1 < dateIdx.length ? dateIdx[k + 1]! : tokens.length;
    legs.push(tokens.slice(start, end).join(" "));
  }
  const joined = legs.join(" | ");
  return conf ? `${conf} ${joined}` : joined;
}

const SENTINELS = new Set(["DRIVING", "LOCAL", "N/A", "TBD", "TBA"]);
const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^[\s:|*-]*$/.test(c));
const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Split ONE pipe-row into cells on UNESCAPED pipes (a `|` is a delimiter iff
 * preceded by an even number of `\`). Then `clean()` unescapes each cell. */
function splitEscapedCells(line: string): string[] {
  const t = line.trim();
  const cells: string[] = [];
  let cur = "";
  let i = 0;
  // skip leading pipe
  if (t.startsWith("|")) i = 1;
  for (; i < t.length; i += 1) {
    const ch = t[i]!;
    if (ch === "\\") { cur += ch + (t[i + 1] ?? ""); i += 1; continue; }
    if (ch === "|") { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur); // trailing cell after last pipe (the row ends with `|` so this is empty → dropped below)
  // drop the trailing empty cell produced by the row's closing pipe
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === "") cells.pop();
  return cells.map((c) => clean(c));
}

const isHeaderLine = (line: string): { nameIdx: number; flightIdx: number } | null => {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const cells = splitEscapedCells(line).map((c) => c.toUpperCase());
  if ((cells[0] ?? "") !== "NAME") return null;
  const flightIdx = cells.findIndex((c) => c === "FLIGHT DETAILS");
  if (flightIdx === -1) return null;
  const hasSibling = cells.some((c) => c === "FLIGHT BOOKED" || c === "OK TO BOOK?");
  if (!hasSibling) return null;
  return { nameIdx: 0, flightIdx };
};

/**
 * One entry per full-TRAVEL-signature HEADER row found anywhere in the markdown.
 * We scan EVERY line (never skipping past a discovered block) so two header
 * signatures inside a single contiguous pipe block — e.g. a stale TRAVEL table
 * pasted directly above the current one with no blank separator — are both
 * detected and trip the duplicate-table fail-safe (R2). A header is only ever a
 * row whose col-A cell is exactly `NAME` plus the FLIGHT-DETAILS + booking-sibling
 * signature, so data rows never match and a single table yields exactly one entry.
 */
function findTravelBlocks(markdown: string): Array<{ lines: string[]; nameIdx: number; flightIdx: number }> {
  const lines = markdown.split("\n");
  const isPipe = (l: string) => l.trim().startsWith("|");
  const blocks: Array<{ lines: string[]; nameIdx: number; flightIdx: number }> = [];
  for (let h = 0; h < lines.length; h += 1) {
    const hdr = isHeaderLine(lines[h]!);
    if (!hdr) continue;
    let end = h;
    while (end + 1 < lines.length && isPipe(lines[end + 1]!)) end += 1;
    blocks.push({ lines: lines.slice(h, end + 1), nameIdx: hdr.nameIdx, flightIdx: hdr.flightIdx });
    // Do NOT skip to `end`: a second header signature inside this same contiguous
    // pipe block must still be found so blocks.length > 1 trips the fail-safe.
  }
  return blocks;
}

export function parseTravelFlights(
  markdown: string,
  crewMembers: CrewMemberRow[],
  agg: ParseAggregator,
): void {
  const blocks = findTravelBlocks(markdown);
  if (blocks.length === 0) return;
  if (blocks.length > 1) { agg.warnings.push(travelFlightAmbiguousTable()); return; }
  const { lines, nameIdx, flightIdx } = blocks[0]!;
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitEscapedCells(lines[r]!);
    if (isSeparator(cells)) continue;
    const nameRaw = (cells[nameIdx] ?? "").trim();
    if (nameRaw === "") break; // blank-NAME legend / end of crew block
    const flightRaw = (cells[flightIdx] ?? "").trim();
    if (flightRaw === "" || SENTINELS.has(flightRaw.toUpperCase())) continue; // silent non-flyer
    const flightInfo = normalizeTravelCell(flightRaw);
    if (flightInfo === null) { agg.warnings.push(travelFlightUnparseable(nameRaw, flightRaw)); continue; }
    const matches = crewMembers.filter((m) => normalizeName(m.name ?? "") === normalizeName(nameRaw));
    if (matches.length !== 1) { agg.warnings.push(travelFlightNameUnmatched(nameRaw)); continue; }
    if (matches[0]!.flight_info == null) matches[0]!.flight_info = flightInfo; // TECH precedence
  }
}

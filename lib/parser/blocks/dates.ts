/**
 * DATES block parser (§2.3).
 *
 * Extracts travelIn, set, showDays[], and travelOut from a raw markdown string.
 * Returns ISO 'YYYY-MM-DD' strings for all date values.
 *
 * Supported template versions:
 *   v4  — DATES table has 5 columns: [DATES, label, DAY, DATE, TIME/AGENDA].
 *          Labels: TRAVEL IN, SET, SHOW DAY N, TRAVEL OUT
 *   v2  — Same 5-col structure but labels may be: TRAVEL (first = in, last = out),
 *          SET, SHOW DAY N, TRAVEL / SET (combined travel+set day)
 *   v1  — 2-col DATES table: [label, date+extra-text].
 *          Labels: Travel, Set, Show, Travel
 *
 * All date parsing is pure regex + Date construction — no date library dependency.
 */

import {
  parseTableRows,
  clean,
  presence,
  normalizeDate,
  decodeEntities,
  ISO_DATE_RE,
  LONGFORM_MDY_RE,
  LONGFORM_DMY_RE,
} from "./_helpers";
import { matchesSectionHeader } from "./_sectionHeaderMatch";
import type { ShowRow, UseRawResolution, DateOrderFields } from "@/lib/parser/types";
import {
  type ParseAggregator,
  emitEmptySection,
  emitDateOrderSuggestsDmy,
} from "@/lib/parser/warnings";
import { contentHashForDateTokens } from "@/lib/parser/useRawContentHash";

export const SECTION_HEADER_TOKENS = ["DATES"] as const;

// ── Label classification ──────────────────────────────────────────────────────

type DateRowKind =
  | "travel_in"
  | "travel_out"
  | "set"
  | "travel_set" // combined "TRAVEL / SET" row
  | "show_day"
  | "unknown";

function classifyLabel(label: string): DateRowKind {
  const u = label.toUpperCase().trim();

  if (/TRAVEL\s*\/\s*SET/.test(u)) return "travel_set";
  if (/^SHOW/.test(u)) return "show_day";
  if (/TRAVEL\s+IN/.test(u)) return "travel_in";
  if (/TRAVEL\s+OUT/.test(u)) return "travel_out";
  // Plain "TRAVEL" — caller disambiguates first vs. last occurrence
  if (/^TRAVEL$/.test(u)) return "travel_out"; // sentinel overridden below
  if (/^SET$/.test(u)) return "set";

  return "unknown";
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseDates(
  markdown: string,
  version: "v1" | "v2" | "v4",

  agg?: ParseAggregator,
): ShowRow["dates"] {
  const result: ShowRow["dates"] = {
    travelIn: null,
    set: null,
    showDays: [],
    travelOut: null,
    loadIn: null,
    setupTime: null,
    setAgendaRaw: null,
  };

  // v2 can still have a 2-col DATES table (e.g. 2024-05-east-coast-family-office),
  // detected by whether the first DATES data row has only 2 cells.
  const out =
    version === "v1" || isV1ShapedDatesBlock(markdown)
      ? parseV1Dates(markdown, result, agg)
      : parseV2V4Dates(markdown, result, agg);

  // D1: the dates object is fixed-shape (never null), so an absent DATES block and
  // a present-but-unparsed one look identical to the caller. Re-probe for a DATES
  // header row and fail loud when one exists but no date resolved (e.g. trailing
  // free-text qualifiers like "- AFTER 8PM" defeated every row).
  const datesEmpty =
    !out.travelIn &&
    !out.set &&
    out.showDays.length === 0 &&
    !out.travelOut &&
    !out.loadIn &&
    !out.setupTime &&
    !out.setAgendaRaw;
  const hasDatesHeader = parseTableRows(markdown).some((r) =>
    matchesSectionHeader(clean(r[0] ?? ""), SECTION_HEADER_TOKENS),
  );
  if (datesEmpty && hasDatesHeader) emitEmptySection(agg, "dates");
  return out;
}

// ── Shape detection ───────────────────────────────────────────────────────────

/**
 * Returns true if the DATES block in this markdown uses the 2-col shape
 * (label | date+text) rather than the 5-col shape (DATES | label | DAY | DATE | agenda).
 *
 * Used to handle the 2024-05-east-coast fixture which detectVersion() correctly
 * classifies as v2 (it has "Hotal Contact Info") but whose DATES table predates
 * the 5-col structure introduced in later v2 sheets.
 */
function isV1ShapedDatesBlock(markdown: string): boolean {
  const rows = parseTableRows(markdown);
  let found = false;
  for (const row of rows) {
    if (!found) {
      if (matchesSectionHeader(clean(row[0] ?? ""), SECTION_HEADER_TOKENS)) found = true;
      continue;
    }
    // First non-empty data row after DATES header.
    if (row.length === 0) continue;
    // v1 shape: the date LABEL sits in col 0 (e.g. "Travel"/"Set"/"Show").
    // Don't gate on an exact 2-col width — the exporter emits a trailing
    // qualifier column (e.g. `| Travel | 5/13/24 | - SAME DAY AS SET |`), so a
    // v1 block can be 3 cells wide. Gate on col 0 being a date label instead.
    const col0 = clean(row[0] ?? "").toUpperCase();
    if (/^(TRAVEL|SET|SHOW)\b/.test(col0)) return true;
    // 5-col (v2/v4) shape: cell[0] is empty, cell[1] is the label.
    return false;
  }
  return false;
}

// ── v1 parser ─────────────────────────────────────────────────────────────────

function parseV1Dates(
  markdown: string,
  result: ShowRow["dates"],
  agg?: ParseAggregator,
): ShowRow["dates"] {
  const rows = parseTableRows(markdown);
  let inDatesBlock = false;
  let travelCount = 0;
  // §4.3 — accumulate DATES-block date cells in encounter order, BEFORE the
  // showDays.sort() below, so the sequence check sees true row order. TRAVEL/SET
  // are prefix (normalizeDate) parses; SHOW is a multi (extractAllDates) parse.
  const dateRows: Array<{ kind: "prefix" | "multi"; cell: string }> = [];
  // §6 — slot-tagged tokens (parallel to dateRows) for the "use raw" resolution.
  const slotTokens: DateSlotTokens = { travelIn: null, set: null, showDays: [], travelOut: null };

  for (const row of rows) {
    if (!inDatesBlock) {
      if (matchesSectionHeader(clean(row[0] ?? ""), SECTION_HEADER_TOKENS)) {
        inDatesBlock = true;
      }
      continue;
    }

    if (row.length < 2) continue;

    const label = clean(row[0] ?? "");
    const rawValue = clean(row[1] ?? "");
    if (!label && !rawValue) continue;

    const labelU = label.toUpperCase();
    // Non-dates label in column 0 = left the DATES block
    if (label && !["TRAVEL", "SET", "SHOW", "DATES"].includes(labelU) && !/^SHOW/.test(labelU)) {
      break;
    }

    if (!label || !rawValue) continue;

    if (labelU === "TRAVEL") {
      travelCount++;
      dateRows.push({ kind: "prefix", cell: rawValue });
      const iso = normalizeDate(rawValue);
      const tok = tokensFromCell("prefix", rawValue)[0] ?? null;
      if (travelCount === 1) {
        result.travelIn = iso;
        slotTokens.travelIn = tok;
      } else {
        result.travelOut = iso;
        slotTokens.travelOut = tok;
      }
    } else if (labelU === "SET") {
      dateRows.push({ kind: "prefix", cell: rawValue });
      result.set = normalizeDate(rawValue);
      slotTokens.set = tokensFromCell("prefix", rawValue)[0] ?? null;
    } else if (/^SHOW/.test(labelU)) {
      dateRows.push({ kind: "multi", cell: rawValue });
      slotTokens.showDays.push(...tokensFromCell("multi", rawValue));
      const allDates = extractAllDates(rawValue);
      for (const iso of allDates) {
        if (!result.showDays.includes(iso)) {
          result.showDays.push(iso);
        }
      }
    }
  }

  // §4.3 — run the block-level order check on encounter-order tokens BEFORE sort.
  checkDateOrder(collectDateTokens(dateRows), agg, slotTokens);

  result.showDays.sort();
  return result;
}

// ── v2/v4 parser ──────────────────────────────────────────────────────────────

function parseV2V4Dates(
  markdown: string,
  result: ShowRow["dates"],
  agg?: ParseAggregator,
): ShowRow["dates"] {
  const rows = parseTableRows(markdown);
  let inDatesBlock = false;
  const plainTravelRows: Array<string | null> = [];
  // §4.3 — encounter-order date cells, captured BEFORE showDays.sort(). Every v2/v4
  // date row is a prefix (normalizeDate) parse — no multi-token extractAllDates path
  // exists here — so every collected cell is `kind: "prefix"`.
  const dateRows: Array<{ kind: "prefix" | "multi"; cell: string }> = [];
  // §6 — slot-tagged tokens (parallel to result/dateRows) for the "use raw"
  // resolution. `plainTravelTokens` mirrors `plainTravelRows` through the same
  // first=in/last=out disambiguation below.
  const slotTokens: DateSlotTokens = { travelIn: null, set: null, showDays: [], travelOut: null };
  const plainTravelTokens: Array<DateToken | null> = [];
  const firstTok = (raw: string) => tokensFromCell("prefix", raw)[0] ?? null;

  for (const row of rows) {
    if (!inDatesBlock) {
      if (matchesSectionHeader(clean(row[0] ?? ""), SECTION_HEADER_TOKENS)) {
        inDatesBlock = true;
      }
      continue;
    }

    const firstCell = clean(row[0] ?? "");
    if (firstCell && !matchesSectionHeader(firstCell, SECTION_HEADER_TOKENS)) {
      break;
    }

    if (row.length < 4) continue;

    const label = clean(row[1] ?? "");
    const rawDate = clean(row[3] ?? "");
    if (!label) continue;

    const kind = classifyLabel(label);

    // §4.3 — collect the date cell (col3) for every date-bearing row, in encounter
    // order, before any sort. All are prefix parses (the walker reads one date/row).
    if (kind !== "unknown") {
      dateRows.push({ kind: "prefix", cell: rawDate });
    }

    switch (kind) {
      case "travel_in":
        result.travelIn = presence(rawDate) ? normalizeDate(rawDate) : null;
        slotTokens.travelIn = presence(rawDate) ? firstTok(rawDate) : null;
        break;

      case "travel_out":
        if (label.toUpperCase() === "TRAVEL") {
          plainTravelRows.push(presence(rawDate) ? normalizeDate(rawDate) : null);
          plainTravelTokens.push(presence(rawDate) ? firstTok(rawDate) : null);
        } else {
          result.travelOut = presence(rawDate) ? normalizeDate(rawDate) : null;
          slotTokens.travelOut = presence(rawDate) ? firstTok(rawDate) : null;
        }
        break;

      case "travel_set": {
        const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
        const tok = presence(rawDate) ? firstTok(rawDate) : null;
        result.set = iso;
        slotTokens.set = tok;
        if (!result.travelIn) {
          result.travelIn = iso;
          slotTokens.travelIn = tok;
        }
        const times = extractClockTimes(row[4] ?? "");
        if (times[0] && !result.loadIn) result.loadIn = times[0]; // travel_set fills loadIn only if unset
        if (times[1] && result.setupTime == null) result.setupTime = times[1];
        if (result.setAgendaRaw == null) {
          const tsCell = row[4] ?? "";
          result.setAgendaRaw = clean(tsCell) ? tsCell : null; // fill-if-unset (mirrors loadIn precedence)
        }
        break;
      }

      case "set": {
        result.set = presence(rawDate) ? normalizeDate(rawDate) : null;
        slotTokens.set = presence(rawDate) ? firstTok(rawDate) : null;
        const times = extractClockTimes(row[4] ?? "");
        if (times[0]) result.loadIn = times[0]; // explicit SET row overrides any travel_set value
        if (times[1]) result.setupTime = times[1];
        const setCell = row[4] ?? "";
        result.setAgendaRaw = clean(setCell) ? setCell : null; // explicit SET overrides (raw, undecoded)
        break;
      }

      case "show_day": {
        const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
        if (iso && !result.showDays.includes(iso)) {
          result.showDays.push(iso);
          const tok = firstTok(rawDate);
          if (tok) slotTokens.showDays.push(tok);
        }
        break;
      }

      case "unknown":
        break;
    }
  }

  // Disambiguate plain "TRAVEL" rows: first = travelIn, last = travelOut.
  // If travelIn is already set (e.g. from a TRAVEL / SET combined row), ALL
  // plain TRAVEL rows are treated as travelOut (take the last one). The slot
  // tokens mirror this exactly so the "use raw" resolution's date fields align.
  if (plainTravelRows.length >= 1) {
    if (!result.travelIn) {
      // No explicit travelIn yet: first plain TRAVEL = in, last = out
      result.travelIn = plainTravelRows[0] ?? null;
      slotTokens.travelIn = plainTravelTokens[0] ?? null;
      if (plainTravelRows.length >= 2) {
        result.travelOut = plainTravelRows[plainTravelRows.length - 1] ?? null;
        slotTokens.travelOut = plainTravelTokens[plainTravelTokens.length - 1] ?? null;
      }
    } else {
      // travelIn already known (explicit TRAVEL IN or TRAVEL/SET): last plain TRAVEL = out
      result.travelOut = plainTravelRows[plainTravelRows.length - 1] ?? null;
      slotTokens.travelOut = plainTravelTokens[plainTravelTokens.length - 1] ?? null;
    }
  }

  // §4.3 — run the block-level order check on encounter-order tokens BEFORE sort.
  checkDateOrder(collectDateTokens(dateRows), agg, slotTokens);

  result.showDays.sort();
  return result;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Extract ALL clock times (HH:MM with optional AM/PM) from a free-text TIME cell,
 * in document order. COLON-REQUIRED (no-colon "8PM" / semicolon "5;30pm" are
 * NOT matched here — that tolerance is exclusive to the SHOW DAY tokenizer in
 * scheduleTimes.ts, §4.2 R12 finding 19). "LOAD IN" / "AFTER 8PM" → []. §4.2.
 */
/**
 * Clock tokens (colon-required HH:MM[am/pm]) with offsets, over `text` AS GIVEN —
 * the caller is responsible for `decodeEntities(clean(...))`-ing first. The returned
 * `start`/`end` index `text`. Shared by `extractClockTimes` and `tokenizeSetSchedule`
 * (scheduleBookends.ts) so SET run-of-show clock values equal `loadIn`/`setupTime`. D-SET1.
 */
export function extractClockTimeTokens(
  text: string,
): { clock: string; start: number; end: number }[] {
  const re = /\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/g;
  const out: { clock: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[0]!; // a regex match always has [0] (noUncheckedIndexedAccess widens to string|undefined)
    const idx = m.index!; // matchAll always sets .index (typed number|undefined)
    const clock = raw
      .replace(/\s+/g, " ")
      .replace(/([AaPp][Mm])$/, (s) => s.toUpperCase())
      .trim();
    out.push({ clock, start: idx, end: idx + raw.length });
  }
  return out;
}

export function extractClockTimes(raw: string): string[] {
  const c = decodeEntities(clean(raw));
  if (!c) return [];
  return extractClockTimeTokens(c).map((t) => t.clock);
}

export function extractAllDates(text: string): string[] {
  const results: string[] = [];
  const slash =
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*)?\d{1,2}\/\d{1,2}\/\d{2,4}/gi;
  const patterns: RegExp[] = [
    slash,
    new RegExp(ISO_DATE_RE.source, "g"),
    new RegExp(LONGFORM_MDY_RE.source, "gi"),
    new RegExp(LONGFORM_DMY_RE.source, "gi"),
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Route through normalizeDate to enforce calendar-validity (rejects Feb 30, Apr 31, etc.)
      const iso = normalizeDate(m[0].trim());
      if (iso !== null) results.push(iso);
    }
  }
  return results;
}

// ── §4.3 DATE_ORDER_SUGGESTS_DMY — token collector + block-level sequence check ─
//
// A NEW dedicated pure collector (spec §4.3): `extractAllDates` cannot back this
// check — it returns normalized ISO (no raw tokens), scans per regex family rather
// than in true within-cell offset order, and has no numeric-dash family. The
// collector mirrors EXACTLY what each row's real parser consumes, in cardinality
// and family: `normalizeDate` rows (TRAVEL / SET / travel_set) are PREFIX parses —
// at most ONE leading token, ALL families (ISO / numeric slash / numeric 4-digit-
// year dash / longform); `extractAllDates` rows (v1 SHOW) are MULTI parses — every
// match in within-cell offset order, NO numeric-dash family. 2-digit dash years are
// NOT tokens (the parser rejects them). It is read-only relative to parsing.

/** One collected DATES-block date token with both hypothesis readings (spec §4.3). */
export type DateToken = { raw: string; mdyIso: string | null; dmyIso: string | null };

const DOW_PREFIX_RE =
  /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*/i;

/**
 * Calendar-validity builder mirroring `normalizeDate` (`_helpers.ts:178-189`):
 * bounds ISO/dash years to 2000–2099, rejects out-of-range month/day, and rejects
 * roll-over dates (Feb 30, Apr 31, …) via a round-trip Date construction.
 */
function buildIsoChecked(
  month: number,
  day: number,
  year: number,
  boundYear: boolean,
): string | null {
  if (boundYear && (year < 2000 || year > 2099)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Dual-read a numeric `a?b?y` token: mdy = a-as-month, dmy = b-as-month. */
function numericDualRead(
  a: number,
  b: number,
  yearStr: string,
  boundYear: boolean,
): { mdyIso: string | null; dmyIso: string | null } {
  const ry = parseInt(yearStr, 10);
  // Slash 2-digit years assume 20XX (mirrors normalizeDate `:157-158`); dash years
  // are always 4-digit so this is a no-op for them.
  const year = ry < 100 ? 2000 + ry : ry;
  return {
    mdyIso: buildIsoChecked(a, b, year, boundYear),
    dmyIso: buildIsoChecked(b, a, year, boundYear),
  };
}

/** ISO / longform tokens are fixed points — the single parsed value fills BOTH reads. */
function fixedPointToken(raw: string): DateToken {
  const iso = normalizeDate(raw);
  return { raw, mdyIso: iso, dmyIso: iso };
}

/** Classify a single already-isolated date token into a DateToken (with dual read). */
function tokenFromRaw(raw: string, allowDash: boolean): DateToken | null {
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) return fixedPointToken(raw);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) return { raw, ...numericDualRead(+slash[1]!, +slash[2]!, slash[3]!, false) };
  if (allowDash) {
    const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // 4-digit year ONLY
    if (dash) return { raw, ...numericDualRead(+dash[1]!, +dash[2]!, dash[3]!, true) };
  }
  // Longform (already matched upstream) — fixed point.
  return fixedPointToken(raw);
}

/** Read at most the LEADING date token of a prefix cell (mirrors normalizeDate precedence). */
function leadingToken(cell: string): DateToken | null {
  const s = cell.replace(DOW_PREFIX_RE, "");
  const iso = s.match(/^\d{4}-\d{1,2}-\d{1,2}\b/);
  if (iso) return fixedPointToken(iso[0]);
  const slash = s.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (slash) return tokenFromRaw(slash[0], false);
  const dash = s.match(/^\d{1,2}-\d{1,2}-\d{4}\b/); // 4-digit year ONLY; 2-digit is not a token
  if (dash) return tokenFromRaw(dash[0], true);
  const lfMDY = s.match(LONGFORM_MDY_RE);
  if (lfMDY && lfMDY.index === 0) return fixedPointToken(lfMDY[0]);
  const lfDMY = s.match(LONGFORM_DMY_RE);
  if (lfDMY && lfDMY.index === 0) return fixedPointToken(lfDMY[0]);
  return null;
}

// Combined-alternation single pass for MULTI (extractAllDates-path) cells: ISO first,
// then numeric slash, then longform MDY, then longform DMY — mirroring normalizeDate
// precedence but WITHOUT the numeric-dash family (SHOW cells never carry it). Matches
// emerge in genuine within-cell offset order.
const MULTI_TOKEN_RE = new RegExp(
  `(?:${ISO_DATE_RE.source})` +
    `|(?:\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})` +
    `|(?:${LONGFORM_MDY_RE.source})` +
    `|(?:${LONGFORM_DMY_RE.source})`,
  "gi",
);

/**
 * Collect DATES-block date tokens per row kind (spec §4.3). `prefix` rows contribute
 * ≤1 leading token (all families); `multi` rows contribute every match in offset
 * order (no numeric-dash family). Read-only; feeds ONLY `checkDateOrder`.
 */
export function collectDateTokens(
  rows: Array<{ kind: "prefix" | "multi"; cell: string }>,
): DateToken[] {
  const tokens: DateToken[] = [];
  for (const { kind, cell } of rows) {
    if (kind === "prefix") {
      const t = leadingToken(cell);
      if (t) tokens.push(t);
    } else {
      for (const m of cell.matchAll(MULTI_TOKEN_RE)) {
        const t = tokenFromRaw(m[0], false); // no dash in multi cells
        if (t) tokens.push(t);
      }
    }
  }
  return tokens;
}

/**
 * Slot-tagged DATES tokens (spec §6). Parallel to the flat `collectDateTokens`
 * list but tagged by which ShowRow.dates slot each token feeds, so the "use raw"
 * resolution can build both the MDY (`parsed`) and DMY (`replacement`) date fields.
 */
export type DateSlotTokens = {
  travelIn: DateToken | null;
  set: DateToken | null;
  showDays: DateToken[];
  travelOut: DateToken | null;
};

/** Tokens for one date cell — prefix cells yield ≤1 leading token; multi cells all. */
export function tokensFromCell(kind: "prefix" | "multi", cell: string): DateToken[] {
  if (kind === "prefix") {
    const t = leadingToken(cell);
    return t ? [t] : [];
  }
  const out: DateToken[] = [];
  for (const m of cell.matchAll(MULTI_TOKEN_RE)) {
    const t = tokenFromRaw(m[0], false);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Build the DATE_ORDER_SUGGESTS_DMY "use raw" resolution (spec §6). `parsed.dates`
 * = the MDY interpretation, `replacement.dmyDates` = the DMY reinterpretation of
 * the SAME slot tokens; scalar slots map their token's mdyIso/dmyIso (or null),
 * showDays maps every token's reading, nulls dropped, sorted ascending (matching
 * how ShowRow.dates.showDays is stored). `contentHash` pins the whole ordered
 * block via the §5 length-prefixed token serialization.
 *
 * The `invalid-dmy` guard is defensive: `checkDateOrder` returns early when any
 * token's dmyIso is null (condition b), so this warning never fires on an
 * invalid-DMY block — but the guard keeps the resolution honest if the builder is
 * ever reached with such a token.
 */
function buildDateResolution(tokens: DateToken[], slots: DateSlotTokens | undefined): UseRawResolution {
  const contentHash = contentHashForDateTokens(tokens.map((t) => t.raw));
  if (tokens.some((t) => t.dmyIso === null)) {
    return { resolvable: false, reason: "invalid-dmy" };
  }
  const s: DateSlotTokens = slots ?? { travelIn: null, set: null, showDays: tokens, travelOut: null };
  const scalar = (t: DateToken | null, which: "mdyIso" | "dmyIso") => (t ? t[which] : null);
  const showDaysBy = (which: "mdyIso" | "dmyIso") =>
    s.showDays
      .map((t) => t[which])
      .filter((x): x is string => x !== null)
      .sort();
  const parsed: DateOrderFields = {
    travelIn: scalar(s.travelIn, "mdyIso"),
    set: scalar(s.set, "mdyIso"),
    showDays: showDaysBy("mdyIso"),
    travelOut: scalar(s.travelOut, "mdyIso"),
  };
  const dmy: DateOrderFields = {
    travelIn: scalar(s.travelIn, "dmyIso"),
    set: scalar(s.set, "dmyIso"),
    showDays: showDaysBy("dmyIso"),
    travelOut: scalar(s.travelOut, "dmyIso"),
  };
  return {
    resolvable: true,
    contentHash,
    parsed: { kind: "dates", dates: parsed },
    replacement: { kind: "dates", dmyDates: dmy },
  };
}

/**
 * Block-level DATE_ORDER_SUGGESTS_DMY check (spec §4.3). Emits ≤1 warning IFF all of:
 *   (guard) ≥2 parseable tokens (at least one non-null reading each);
 *   (a) the mdyIso sequence, nulls skipped, strictly DECREASES at some adjacent pair;
 *   (b) NO token has dmyIso null AND the full dmyIso sequence is NON-decreasing.
 * `rawSnippet` = the raw token at the first MDY-decreasing position. No-op if `agg`
 * is undefined. `slots` (spec §6) carries the slot→token mapping the emitted
 * warning's `resolution` needs; the low-level unit callers omit it (they do not
 * inspect `resolution`).
 */
export function checkDateOrder(
  tokens: DateToken[],
  agg?: ParseAggregator,
  slots?: DateSlotTokens,
): void {
  if (!agg) return;

  // Guard: fewer than 2 parseable dates → vacuously ordered, no check.
  const parseable = tokens.filter((t) => t.mdyIso !== null || t.dmyIso !== null);
  if (parseable.length < 2) return;

  // (a) MDY hypothesis violated — first strict decrease across non-null mdy readings.
  const mdyTokens = tokens.filter((t) => t.mdyIso !== null);
  let violationRaw: string | null = null;
  for (let i = 1; i < mdyTokens.length; i++) {
    if (mdyTokens[i - 1]!.mdyIso! > mdyTokens[i]!.mdyIso!) {
      violationRaw = mdyTokens[i]!.raw;
      break;
    }
  }
  if (violationRaw === null) return;

  // (b) DMY hypothesis intact — one DMY-invalid numeric kills it; full seq must be ↑.
  if (tokens.some((t) => t.dmyIso === null)) return;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i - 1]!.dmyIso! > tokens[i]!.dmyIso!) return;
  }

  emitDateOrderSuggestsDmy(agg, {
    rawSnippet: violationRaw,
    resolution: buildDateResolution(tokens, slots),
  });
}

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [{ site: "date order MDY/DMY sequence check", code: "DATE_ORDER_SUGGESTS_DMY" }];

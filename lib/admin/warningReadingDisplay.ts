/**
 * The reading-display rules, in one place (warning-card-fixes spec §5.6, §7.3).
 *
 * Every cap and format the warning cards, the published card and the Hotels reservation
 * marker use to show "what the sheet says" and "what we read" lives here, so those
 * surfaces cannot drift apart. Pure and client-safe: no node built-ins, no server import.
 */
import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { isWarnSeverity } from "@/lib/parser/dataGaps";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";

/** Characters of the raw cell shown on a "Sheet says" line before it is cut. */
export const SHEET_SAYS_CAP = 160;
/** Names listed on a "We read" line before the rest are counted. */
export const WE_READ_NAMES_CAP = 6;
/** Case header previews listed on an archived pull sheet card before the rest are counted. */
export const CASE_PREVIEWS_CAP = 3;
/** Characters of one case header preview shown before it is cut. */
export const CASE_PREVIEW_CHARS = 40;

/** The four codes whose card offers the reading choice. Moved here from UseRawControl's
 *  module-local set so the control and the "show a reading" rule read one set. */
export const USE_RAW_CODES: ReadonlySet<string> = new Set([
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
]);

/** The judgment codes that name one hotel reservation by `blockRef.index` (spec §5.1). */
export const HOTEL_RESERVATION_JUDGMENT_CODES: ReadonlySet<string> = new Set([
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
]);

/** The one spelling of "this row is a judgment call": a warn-severity ambiguity code. The
 *  card kind, the Accept wording and the Accepted partition all call it. */
export function isJudgmentCall(w: Pick<ParseWarning, "severity" | "code">): boolean {
  return isWarnSeverity(w) && isAmbiguityCode(w.code);
}

const isNonBlankString = (v: unknown): v is string => typeof v === "string" && /\S/.test(v);

/** The raw cell, whitespace-collapsed and cut at SHEET_SAYS_CAP. Null when there is
 *  nothing to show. */
export function sheetSaysText(raw: unknown): string | null {
  if (!isNonBlankString(raw)) return null;
  const text = normalizeSnippet(raw);
  return text.length > SHEET_SAYS_CAP ? `${text.slice(0, SHEET_SAYS_CAP)}…` : text;
}

/** The guest names we read, as a count and a list. Null unless `readAs` is the hotels
 *  shape the inline emitter writes. */
export function weReadGuestsText(readAs: unknown): string | null {
  if (typeof readAs !== "object" || readAs === null) return null;
  if (!("kind" in readAs) || readAs.kind !== "hotels") return null;
  if (!("names" in readAs) || !Array.isArray(readAs.names)) return null;
  const names = (readAs.names as unknown[]).filter(isNonBlankString).map((n) => n.trim());
  const n = names.length;
  if (n === 0) return "no guests";
  if (n === 1) return `1 guest: ${names[0]}`;
  if (n <= WE_READ_NAMES_CAP) return `${n} guests: ${names.join(", ")}`;
  return `${n} guests: ${names.slice(0, WE_READ_NAMES_CAP).join(", ")}, and ${n - WE_READ_NAMES_CAP} more`;
}

/** The previews part of the archived card's `Cases` line (the card prints the label).
 *  A blank or non-string preview reads `(no header text)`, so the count stays the case
 *  count. Null when there is no preview. */
export function casePreviewsText(previews: unknown): string | null {
  if (!Array.isArray(previews) || previews.length === 0) return null;
  const shown = (previews as unknown[]).slice(0, CASE_PREVIEWS_CAP).map((p) => {
    if (!isNonBlankString(p)) return "‘(no header text)’";
    const cut = p.length > CASE_PREVIEW_CHARS ? `${p.slice(0, CASE_PREVIEW_CHARS)}…` : p;
    return `‘${cut}’`;
  });
  const rest = previews.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

/** True iff the card shows a reading: the use-raw choice control renders, or the inline
 *  hotel guest split shows its read-only comparison (spec §5.6). */
export function readingShown(w: ParseWarning): boolean {
  if (USE_RAW_CODES.has(w.code) && w.resolution?.resolvable === true) return true;
  return (
    w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS" &&
    w.resolution?.resolvable === false &&
    sheetSaysText(w.rawSnippet) !== null
  );
}

/**
 * Search normalization (spec §5.1): ONE function for the index and the query, so
 * the two sides can never fold text differently.
 *
 * 1. Unicode NFKD, then drop combining marks ("Café" → "cafe").
 * 2. Lower case.
 * 3. Delete a hyphen or apostrophe between two letters or digits ("Wi-Fi" →
 *    "wifi", "Doug's" → "dougs", "load-in" → "loadin").
 * 4. Split on any run of characters that are not letters or digits.
 *
 * Every token carries `start`/`end` offsets into the ORIGINAL display string, not
 * the folded one, because highlight ranges (spec §6.4) slice what the viewer
 * sees. Folding is done one display character at a time for exactly that reason:
 * a character that folds to several letters (the "ﬁ" ligature) or to nothing (a
 * decomposed combining accent) still maps back to its own display span.
 */
export type Token = { text: string; start: number; end: number };

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const COMBINING_MARKS = /\p{M}/gu;
/**
 * Hyphen and apostrophe forms, compared AFTER folding: NFKD already maps the
 * non-breaking hyphen (U+2011) to U+2010 and the fullwidth forms to ASCII. The
 * typographic apostrophe (U+2019) has no decomposition, so it is listed. Dashes
 * (en, em) are not hyphens and stay separators.
 */
const JOINERS = new Set(["-", "‐", "'", "’"]);

/** One folded character and the display span of the character it came from. */
type Unit = { ch: string; start: number; end: number };

function fold(displayChar: string): string {
  return displayChar.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

function toUnits(display: string): Unit[] {
  const units: Unit[] = [];
  let offset = 0;
  for (const displayChar of display) {
    const start = offset;
    const end = offset + displayChar.length;
    offset = end;
    const folded = fold(displayChar);
    // A pure combining mark folds to nothing; keep it as an empty unit so the
    // token it decorates still covers it in the display string.
    if (folded === "") units.push({ ch: "", start, end });
    for (const ch of folded) units.push({ ch, start, end });
  }
  return units;
}

function isLetterOrDigit(ch: string): boolean {
  return LETTER_OR_DIGIT.test(ch);
}

/** The next unit that carries a character, skipping folded-away marks. */
function nextChar(units: Unit[], from: number): string | null {
  for (let k = from; k < units.length; k++) {
    const ch = units[k]!.ch;
    if (ch !== "") return ch;
  }
  return null;
}

export function normalize(display: string): Token[] {
  const units = toUnits(display);
  const tokens: Token[] = [];
  let current: Token | null = null;
  for (let k = 0; k < units.length; k++) {
    const unit = units[k]!;
    if (unit.ch === "") {
      if (current) current.end = unit.end;
      continue;
    }
    if (isLetterOrDigit(unit.ch)) {
      if (current) {
        current.text += unit.ch;
        current.end = unit.end;
      } else {
        current = { text: unit.ch, start: unit.start, end: unit.end };
      }
      continue;
    }
    // A token is open only while the previous character was a letter or digit,
    // so "open + next is a letter or digit" is exactly "between two of them".
    if (current && JOINERS.has(unit.ch)) {
      const next = nextChar(units, k + 1);
      if (next !== null && isLetterOrDigit(next)) continue;
    }
    if (current) tokens.push(current);
    current = null;
  }
  if (current) tokens.push(current);
  return tokens;
}

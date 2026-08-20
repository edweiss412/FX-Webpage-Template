/**
 * Declared-limit pin collision (spec
 * `docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md`).
 *
 * A **declared-limit pin** is a test asserting a ZERO which the surface's own
 * documentation calls a known miss. The zero is a RECORD of current behavior, not a
 * guarantee about it, so a plan that moves the recognizer under such a pin flips it
 * from a record into a false assertion.
 *
 * PURE. This module is a map from (model, surfaces, prepared suite texts) to findings.
 * All I/O lives in `scripts/spec-lint.ts` and in the existing `FileResolver`.
 *
 * **The core owns no JavaScript grammar beyond a single-line call-opener match**
 * (spec §1.1 item 3). It never parses a test body and never looks for the zero
 * assertion itself — that road needs block extents over TypeScript and is the
 * recognizer growth `lib/specLint/` already measured at 20 diff rounds with a flat
 * finding rate (`docs/review-rounds/feat/speclint-prose-count-parity/`).
 *
 * **The core scans PREPARED lines and never second-guesses them** (spec §3.1). The
 * ADAPTER blanks every non-code span position-for-position — comments via the shared
 * `stripCommentsSafely`, template-literal bodies and MULTI-LINE ordinary strings from
 * TypeScript parser ranges — so a line the core sees is a line that executes. The
 * TypeScript parser is the oracle for what is code; this file owns no notion of
 * comment, template or string state, deliberately, so it cannot grow a lexer to guess
 * at one.
 */

/**
 * A declared-limit pin. Its IDENTITY is `(path, title)` (spec §3.1) — never its line,
 * which is a lint-time locator that rots at every edit elsewhere in the file.
 */
export interface Pin {
  /** Repo-relative suite path. */
  path: string;
  /**
   * 1-based line of the ENCLOSING TEST TITLE. The grain is the test, not the
   * individual zero it tabulates (spec §8 item 12): a test whose body iterates a
   * six-row table of declared misses is ONE pin, and its line is the title's.
   */
  line: number;
  /**
   * The DECODED content of the title literal (spec §3.1 item 2), never its source
   * spelling. The runtime test name is the decoded string, so an author quoting the
   * pin copies the decoded form; comparing a source spelling against the plan would
   * draw a false advisory on a title the accept-set explicitly admits.
   */
  title: string;
}

/**
 * One row of the disposition registry (spec §5) — a phrase-bearing title that is NOT
 * a live pin, because it narrates a limit that CLOSED.
 *
 * **Keyed at the SAME GRANULARITY as the thing it disposes of, and that is
 * load-bearing.** A pin's identity is `(path, title)`, so a disposition row is
 * `(path, title)` too. A row keyed on the PATH alone would absorb every future pin in
 * that file: the suite would be pre-dispositioned and a genuinely new declared-limit
 * pin added there tomorrow would be silently exempt — invisible in every positive
 * test, because the absorbed thing does not exist yet.
 */
export interface PinDisposition {
  path: string;
  title: string;
  reason: string;
}

/**
 * The accept set, fixed at three (spec §3.1 item 3, §8 item 6). It is the ledger
 * entry's list verbatim. A pin phrased another way ("stays a limit", "still missed") is
 * invisible, and WIDENING THIS SET IS AN ACCEPT-SET CHANGE WITH ITS OWN CORPUS NUMBERS,
 * never a review round — each widening enlarges the target, which is the ratchet the
 * narrowing rule exists to stop.
 */
const PHRASES = ["known miss", "documented limit", "declared miss"] as const;

/**
 * Opens a call to `test` or `it`, at the start of the line modulo leading whitespace.
 *
 * `describe` is absent by construction (spec §2.3): a group title summarizes, and the
 * zero lives in member tests that carry their own phrase-bearing titles. `.each` is
 * excluded by the same construction rather than by a special case — the `\(` demands
 * the open paren immediately after the callee, so `test.each([…])("…")` never matches
 * (spec §8 item 3). Reading it would mean reading ACROSS the case table, which is the
 * block-extent road §1.1 item 3 declines.
 */
const OPENER = /^[ \t]*(?:test|it)[ \t]*\(/;

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  0: "\0",
};

/**
 * Decode a string-literal body (spec §3.1 item 2).
 *
 * The runtime test name is the DECODED string, so a plan author quoting the pin copies
 * the decoded form; comparing a source spelling against the plan would draw a false
 * advisory on a title the accept-set explicitly admits. `\\` yielding ONE backslash is
 * called out in the spec because a decoder implementing only the quote, newline and tab
 * escapes passes almost every fixture while violating it.
 */
function decode(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    if (next === undefined) {
      // A trailing lone backslash decodes to itself rather than swallowing the end.
      out += "\\";
      break;
    }
    if (next === "u" || next === "x") {
      const decoded = decodeNumericEscape(body, i);
      if (decoded !== null) {
        out += decoded.text;
        i = decoded.lastIndex;
        continue;
      }
      // A malformed \u or \x is not a numeric escape; fall through to the
      // identity rule below rather than dropping the character silently.
    }
    out += SIMPLE_ESCAPES[next] ?? next;
    i += 1;
  }
  return out;
}

/** `\xHH`, `\uHHHH`, `\u{H…}`. Returns null when the escape is malformed. */
function decodeNumericEscape(
  body: string,
  backslashIndex: number,
): { text: string; lastIndex: number } | null {
  const kind = body[backslashIndex + 1];
  const start = backslashIndex + 2;
  if (kind === "x") {
    const hex = body.slice(start, start + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
    return { text: String.fromCodePoint(parseInt(hex, 16)), lastIndex: start + 1 };
  }
  if (body[start] === "{") {
    const close = body.indexOf("}", start);
    if (close === -1) return null;
    const hex = body.slice(start + 1, close);
    if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) return null;
    const code = parseInt(hex, 16);
    if (code > 0x10ffff) return null;
    return { text: String.fromCodePoint(code), lastIndex: close };
  }
  const hex = body.slice(start, start + 4);
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
  return { text: String.fromCodePoint(parseInt(hex, 16)), lastIndex: start + 3 };
}

/**
 * Read the first argument's string literal, which must OPEN AND CLOSE on this same line
 * (spec §3.1 item 2, §8 item 5). Returns null for every shape the arm declines:
 * a template literal, a non-literal first argument, and a literal left unterminated on
 * the opener's line.
 */
function firstArgumentLiteral(line: string, afterOpenParen: number): string | null {
  let i = afterOpenParen;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i += 1;
  const quote = line[i];
  // A backtick is a template literal: substitution would make the title non-constant,
  // and a constant one is an ordinary edit away from a quoted literal (spec §8 item 4).
  if (quote !== '"' && quote !== "'") return null;
  let body = "";
  for (let j = i + 1; j < line.length; j += 1) {
    const ch = line[j]!;
    if (ch === "\\") {
      // Escape-aware, so a `\"` inside the title does not end the literal early — the
      // failure a naive quote-to-quote match makes, which then never sees the phrase.
      body += ch + (line[j + 1] ?? "");
      j += 1;
      continue;
    }
    if (ch === quote) return decode(body);
    body += ch;
  }
  return null; // unterminated on this line
}

/**
 * Discover the declared-limit pins in ONE suite file's PREPARED lines.
 *
 * Pure and line-local. Every span that does not execute — comments, template bodies,
 * multi-line ordinary strings — was already blanked position-for-position by the
 * adapter, so a line reaching here is a line that runs. This function deliberately owns
 * no notion of that blanking and cannot second-guess it.
 *
 * Matches are returned in line order, WITHOUT deduplication: the identity `(path,
 * title)` is collapsed later, once per surface, by the obligation (spec §3.2). Doing it
 * here would hide a repeated title from a caller that has a legitimate reason to see
 * both lines.
 */
export function discoverPins(
  path: string,
  lines: readonly string[],
  dispositions: readonly PinDisposition[],
): Pin[] {
  const disposed = new Set(dispositions.map((d) => `${d.path} ${d.title}`));
  const pins: Pin[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const opener = OPENER.exec(line);
    if (opener === null) continue;
    const title = firstArgumentLiteral(line, opener[0].length);
    if (title === null) continue;
    const haystack = title.toLowerCase();
    if (!PHRASES.some((phrase) => haystack.includes(phrase))) continue;
    // Keyed on the PAIR, never the path: a path-keyed row would absorb every future
    // pin in that file, invisibly, because the absorbed thing does not exist yet.
    if (disposed.has(`${path} ${title}`)) continue;
    pins.push({ path, line: index + 1, title });
  }
  return pins;
}

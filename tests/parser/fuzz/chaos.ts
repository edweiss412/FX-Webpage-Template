// tests/parser/fuzz/chaos.ts
//
// `chaosMarkdown`: a MODEL-FREE, hostile-markdown arbitrary for the Tier-1
// robustness property (spec §4.1 — "parseSheet never throws, is
// deterministic, and returns a structurally valid ParsedSheet" over inputs
// that share NO structural assumption with `lib/parser`'s expected sheet
// shape). Unlike the mutation-harness fixtures (tests/parser/mutation/), this
// generator never starts from a real markdown fixture — it builds hostile
// text from scratch.
//
// ---------------------------------------------------------------------------
// Real fast-check 4.9.0 API, confirmed by direct probing (not assumed from
// the plan's illustrative pseudocode — see task-3 brief CRITICAL caution #1):
//
//   fc.string({ maxLength, unit })
//     `maxLength` bounds the NUMBER OF UNITS composing the string, not the
//     resulting string's `.length` (UTF-16 code units) — confirmed via
//     lib/cjs/fast-check.js:2879-2880 ("does not have to be confound with
//     `.length` on an instance of string").
//
//     - `unit: "binary"` — EACH unit is exactly ONE code point drawn from the
//       full Unicode range 0000-10FFFF (excluding lone surrogate halves).
//       Confirmed empirically: `fc.string({maxLength: N, unit: "binary"})`
//       never yields more than N code points (verified N=5..200, 500
//       samples). This gives a clean 1-unit == 1-code-point relationship, so
//       `maxLength` directly bounds code-point count — exactly the
//       "generate in code points, then assert Buffer.byteLength" contract
//       the brief calls for.
//     - `unit: "grapheme"` (or omitted default, which resolves to
//       stringUnit("grapheme","ascii") per lib/cjs/fast-check.js:5626) does
//       NOT have this property: a single "grapheme" unit can be a multi-code-
//       point cluster (combining marks / ZWJ sequences) — empirically
//       observed up to ~1.4 code points/unit at maxLength=200, unbounded in
//       principle. Using it would break the structural byte guarantee, so
//       this file never uses "grapheme"/"grapheme-composite" for the hostile
//       payload; only `"binary"`-style single-code-point units are used
//       (via a custom `Arbitrary<string>` unit, so we can additionally
//       exclude a few structural delimiter code points — see below).
//
//   Worst-case bytes: a single code point can encode as up to 4 UTF-8 bytes
//   (astral plane, U+10000-U+10FFFF). So `maxLength` code points -> at most
//   `maxLength * 4` bytes. This is the "4B/code point" arithmetic the brief
//   requires, and it is now backed by a verified API guarantee rather than
//   an assumption.
//
// ---------------------------------------------------------------------------
// Structural delimiter exclusion:
//
// The generator composes "lines" by joining line-strings with "\n"/"\r\n",
// and (for pipe-delimited rows) "cells" by joining with "|". If the hostile
// CONTENT of a line/cell could itself contain a raw "\n", "\r", or "|" code
// point, the resulting sample could blow past the line-count or pipe-count
// caps in a way this file's own budget arithmetic can't see or bound (an
// embedded "\n" silently manufactures an extra "line" the array lengths below
// never accounted for). So the per-code-point arbitrary below EXCLUDES
// U+000A (\n), U+000D (\r), and U+007C (|) from the domain it draws from, via
// a `.filter()` on the low-level integer/code-point picker.
//
// This `.filter()` is NOT the "byte-budget-via-filter" pattern the brief
// forbids (that pattern is: generate a string, then throw away/truncate
// over-budget results, which silently misreports what was covered). Here the
// filter narrows an ATOMIC building block (which single code point comes
// out of ~1.1M candidates) by excluding exactly 3 values (+ the 2048
// surrogate-half values that are never valid standalone code points anyway)
// — a ~0.19% rejection rate on a domain fast-check freely resamples from.
// The byte-budget guarantee itself comes from `maxLength` alone (asserted
// statically below), completely independent of what this filter excludes.
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Structural delimiter-free code-point unit.

const SURROGATE_MIN = 0xd800;
const SURROGATE_MAX = 0xdfff;
const BANNED_CODE_POINTS = new Set<number>([
  0x0a, // \n — line separator; must stay under this file's control
  0x0d, // \r — ditto (CRLF variants are introduced structurally, not via content)
  0x7c, // | — cell separator; must stay under this file's control
]);

/** One Unicode code point (0000-10FFFF, no lone surrogate halves, no \n \r |). */
const hostileCodePointUnit: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((cp) => !(cp >= SURROGATE_MIN && cp <= SURROGATE_MAX) && !BANNED_CODE_POINTS.has(cp))
  .map((cp) => String.fromCodePoint(cp));

/**
 * A string of at most `maxCodePoints` hostile code points. Because each
 * "unit" is exactly one code point (see file header), `maxLength` directly
 * bounds code-point count, so worst-case UTF-8 bytes are `maxCodePoints * 4`.
 */
function hostileString(maxCodePoints: number): fc.Arbitrary<string> {
  return fc.string({ maxLength: maxCodePoints, unit: hostileCodePointUnit });
}

// Header-ish tokens (brief step 3): short, constant, ASCII, always well under
// any of this file's per-line/per-cell budgets — no byte-budget risk from
// including them as an alternative to hostile content.
const HEADER_TOKENS = ["CREW", "HOTEL", "DATES", "VENUE", "GENERAL SESSION", "| | |"] as const;

/** Trailing line separator: mostly "\n", occasionally "\r\n" (2B worst case). */
const lineSeparator: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constant("\n") },
  { weight: 1, arbitrary: fc.constant("\r\n") },
);

/** Wraps a line-content arbitrary so every produced chunk carries its own
 * trailing separator — avoids needing a second pass to compute how many
 * separators go between N generated lines. */
function withTrailingSeparator(content: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc.tuple(content, lineSeparator).map(([c, sep]) => c + sep);
}

// ---------------------------------------------------------------------------
// STATIC BYTE BUDGET — three independently-capped line families (brief step
// 3: a single unbounded family would let fast-check's shrinker/explorer push
// toward all-worst-case lines, e.g. 400 long lines, blowing the total cap).
//
//   long lines   (<= MAX_LONG_LINES): one hostile "cell" spanning the whole
//                line, <= LONG_LINE_MAX_CP code points.
//   wide rows    (<= MAX_WIDE_ROWS):  <= WIDE_ROW_MAX_CELLS pipe-joined
//                hostile cells, each <= WIDE_CELL_MAX_CP code points.
//   normal lines (<= MAX_NORMAL_LINES): a single hostile cell (or a header
//                token), <= NORMAL_LINE_MAX_CP code points.
//
// Per-line worst-case bytes = code points * 4 (astral worst case) + pipes (1B
// each, ASCII) + trailing separator (<= 2B for "\r\n").
const MAX_LONG_LINES = 20;
const LONG_LINE_MAX_CP = 2_560;

const MAX_WIDE_ROWS = 8;
const WIDE_ROW_MAX_CELLS = 120;
const WIDE_CELL_MAX_CP = 3;

const MAX_NORMAL_LINES = 371;
const NORMAL_LINE_MAX_CP = 25;

const SEPARATOR_MAX_BYTES = 2; // "\r\n"
const PIPE_BYTES = 1; // ASCII "|"

const LONG_LINE_WORST_BYTES = LONG_LINE_MAX_CP * 4 + SEPARATOR_MAX_BYTES;
const WIDE_ROW_WORST_BYTES =
  WIDE_ROW_MAX_CELLS * WIDE_CELL_MAX_CP * 4 +
  (WIDE_ROW_MAX_CELLS - 1) * PIPE_BYTES +
  SEPARATOR_MAX_BYTES;
const NORMAL_LINE_WORST_BYTES = NORMAL_LINE_MAX_CP * 4 + SEPARATOR_MAX_BYTES;

const WORST_CASE_TOTAL_BYTES =
  MAX_LONG_LINES * LONG_LINE_WORST_BYTES +
  MAX_WIDE_ROWS * WIDE_ROW_WORST_BYTES +
  MAX_NORMAL_LINES * NORMAL_LINE_WORST_BYTES;

const BYTE_CAP = 262_144;

// Literal-arithmetic assertion (task-3 brief step 3): fails at MODULE LOAD
// (import time, before any test runs) if the constants above ever drift out
// of budget — e.g. 20*(2560*4+2) + 8*(120*3*4+119*1+2) + 371*(25*4+2)
//   = 20*10242 + 8*1561 + 371*102
//   = 204840 + 12488 + 37842
//   = 255170 < 262144  (<< the byte cap, ~7KB of slack)
if (WORST_CASE_TOTAL_BYTES >= BYTE_CAP) {
  throw new Error(
    `chaos.ts: worst-case byte budget ${WORST_CASE_TOTAL_BYTES} >= cap ${BYTE_CAP} — ` +
      "tighten MAX_*/*.MAX_CP constants before this generator can be used.",
  );
}

// Also assert the per-line pipe cap statically: a wide row has at most
// WIDE_ROW_MAX_CELLS - 1 pipes (cells.join("|")), must stay <= 121.
const WIDE_ROW_WORST_PIPES = WIDE_ROW_MAX_CELLS - 1;
if (WIDE_ROW_WORST_PIPES > 121) {
  throw new Error(`chaos.ts: wide-row pipe count ${WIDE_ROW_WORST_PIPES} exceeds the 121 cap.`);
}

// ---------------------------------------------------------------------------
// Line-family arbitraries.

const longLineContent = fc.oneof(
  { weight: 9, arbitrary: hostileString(LONG_LINE_MAX_CP) },
  { weight: 1, arbitrary: fc.constantFrom(...HEADER_TOKENS) },
);
const longLines = fc.array(withTrailingSeparator(longLineContent), {
  maxLength: MAX_LONG_LINES,
});

const wideRowContent: fc.Arbitrary<string> = fc
  .array(hostileString(WIDE_CELL_MAX_CP), { maxLength: WIDE_ROW_MAX_CELLS })
  .map((cells) => cells.join("|"));
const wideRows = fc.array(
  withTrailingSeparator(
    fc.oneof(
      { weight: 9, arbitrary: wideRowContent },
      { weight: 1, arbitrary: fc.constant("| | |") },
    ),
  ),
  { maxLength: MAX_WIDE_ROWS },
);

const normalLineContent = fc.oneof(
  { weight: 9, arbitrary: hostileString(NORMAL_LINE_MAX_CP) },
  { weight: 1, arbitrary: fc.constantFrom(...HEADER_TOKENS) },
);
const normalLines = fc.array(withTrailingSeparator(normalLineContent), {
  maxLength: MAX_NORMAL_LINES,
});

/**
 * Model-free hostile markdown (spec §4.1 Tier 1). No assumption about
 * FXAV's sheet shape (no CREW:/HOTEL: block scaffolding beyond the
 * occasional literal header token) — just byte/shape-budgeted chaos:
 * unicode edge cases (zero-width joiners, bidi overrides, control
 * characters — all reachable via the full 0000-10FFFF `hostileCodePointUnit`
 * range), CRLF variants, oversized single "cells", and wide pipe-delimited
 * rows, all held under a structural byte/line/pipe/cell-length budget so the
 * fuzz corpus never grows unbounded (see arithmetic above).
 */
export const chaosMarkdown: fc.Arbitrary<string> = fc
  .tuple(longLines, wideRows, normalLines)
  .map(([long, wide, normal]) => [...long, ...wide, ...normal].join(""));

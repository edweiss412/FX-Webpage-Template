import type { DocModel, InlineSpan } from "./parse";
import type { Finding, InventoryGroup, InventoryOccurrence } from "./types";

const LEXICON = /\b\d+(?:\.\d+)?\b/g;
const NOUN_AFTER = /^\s+([a-z][a-z-]{2,})/;
const EXCLUSION_CONTEXTS = [
  /\d{4}-\d{2}-\d{2}/g, // ISO dates
  /v?\d+\.\d+\.\d+/g, // version strings
  /\d+:\d+/g, // clock times
  /0x[0-9a-fA-F]+/g, // hex literals
];
const SNIPPET_BEFORE = 41;
const SNIPPET_AFTER = 40;

interface Range {
  start: number;
  end: number;
}

function rangesOn(line: string, res: RegExp[]): Range[] {
  const out: Range[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const inRange = (i: number, rs: Range[]): boolean => rs.some((r) => i >= r.start && i < r.end);

// ===========================================================================
// Prose-count parity arms (spec docs/superpowers/specs/2026-08-10-speclint-
// prose-count-parity.md). Three advisory codes beside NUMERIC_NOUN_MISMATCH.
//
// This module performs NO I/O: shape (a)'s script text arrives as a
// `{path -> text}` argument, resolved by runLint through the injected
// FileResolver (spec §2).
// ===========================================================================

/**
 * The committed prototype's number-word list — the contract's accept-set
 * (spec §3: "the digit forms plus the number-words the instrument parses",
 * `docs/superpowers/specs/probes/2026-08-10-prose-count-probe-v5.ts:21`).
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};
const WORD_ALTERNATION = Object.keys(NUMBER_WORDS).join("|");

/** Shape (b)'s cardinality lexicon: digit forms plus the word list. */
const CARDINAL_RE = new RegExp(String.raw`\b(\d{1,4}|${WORD_ALTERNATION})\b`, "gi");
/** Every number a dated qualifier could bind, for the nearest-predecessor rule. */
const QUANTITY_RE = new RegExp(String.raw`\b(\d+(?:\.\d+)?|${WORD_ALTERNATION})\b`, "gi");

// ---- the shared three-part exclusion rule (spec §1.1), operationally LINE-BASED ----

/**
 * A THOUSANDS-GROUPED numeral (`1,000`), which none of the three arms can read: every
 * scanner here is anchored on `\b`, so the comma splits `1,000` into `1` and `000` and it
 * is the TRAILING group the noun follows. Shape (a) then compared 0 against a constant of
 * 1000 and reported drift between two figures that agree (review R7, probed).
 *
 * The whole run is therefore excluded from all three arms rather than parsed: a grouped
 * numeral is rare in this corpus's counting prose, and declining to compare one is the
 * conservative direction (a tripwire that does not fire), where reading its tail is a
 * confident false advisory. DOCUMENTED LIMIT, pinned by fixture.
 *
 * The shape is deliberately "digit runs joined by commas" rather than strict thousands
 * grouping. A strict `\d{1,3}(?:,\d{3})+` leaves the MALFORMED neighbours — `1234,567`,
 * `1,0200` — outside the exclusion, and those are precisely the strings whose trailing run
 * the arm would then read as a count. Every one of them is unreadable for the same reason,
 * so all of them fall silent.
 */
const GROUPED_NUMERAL = [/\b\d+(?:,\d+)+\b/g];

/** (iii) a line carrying an ISO date is a dated historical record; never compared. */
const ISO_DATE_LINE = /\d{4}-\d{2}-\d{2}/;
/**
 * (ii) the dated qualifier phrase: `at <authoring-stage> time`.
 *
 * A CLOSED accept-set of stage nouns, not a wildcard. `at ... time` with any word in
 * the middle also matches ordinary connectives — "at the same time" is the obvious one
 * — and matching those EXCEEDS the normative exclusion rather than approximating it:
 * the spec names dated PROVENANCE phrases, so a discourse connective is outside the
 * accept-set and must not silence an advisory (whole-diff review R4, probed). The spec
 * names the first two; the rest are the same authoring-stage family, and a stage word
 * that is not listed simply does not exclude, which is the tripwire-visible direction.
 */
const QUALIFIER_STAGES = [
  "plan",
  "planning",
  "authoring",
  "author",
  "draft",
  "drafting",
  "spec",
  "design",
  "review",
  "implementation",
  "ship",
  "filing",
  "writing",
  "measurement",
  "probe",
  "dispatch",
];
const DATED_QUALIFIER_RE = new RegExp(
  String.raw`\bat\s+(?:${QUALIFIER_STAGES.join("|")})\s+time\b`,
  "gi",
);
/** A qualifier binds a number only when it follows within the same clause. */
const QUALIFIER_REACH = 40;
/**
 * ...and "the same clause" is enforced, not just approximated by the reach: a sentence
 * or clause terminator between the number and the qualifier means they belong to
 * different clauses, so the qualifier binds nothing (whole-diff review R4 probed
 * `covers 4 sites. At plan time ...` binding across the full stop).
 *
 * A bare `.` is NOT a clause break: `covers 38 sites, i.e. all entries at plan time` is
 * one clause and its qualifier must still bind (review R5, probed). So a period counts
 * only before a capitalised word — the standard sentence-boundary heuristic — while `!`,
 * `?` and `;` count outright.
 */
const CLAUSE_TERMINATOR = /[!?;]|\.\s+(?=[A-Z])/;

function quantityRanges(text: string): Range[] {
  const out: Range[] = [];
  QUANTITY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUANTITY_RE.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Start offsets of the numbers dated qualifiers remove from `text`.
 *
 * ONE number per qualifier: its NEAREST predecessor, and only when that
 * predecessor ends within QUALIFIER_REACH characters (spec §1.1 (ii), R6 F1 —
 * without nearest-binding, `all 37 sites (36 at plan time)` would exclude both).
 */
function qualifierBoundStarts(text: string): Set<number> {
  const out = new Set<number>();
  const nums = quantityRanges(text);
  DATED_QUALIFIER_RE.lastIndex = 0;
  let q: RegExpExecArray | null;
  while ((q = DATED_QUALIFIER_RE.exec(text)) !== null) {
    let nearest: Range | null = null;
    for (const n of nums) {
      if (n.end > q.index) continue;
      if (nearest === null || n.end > nearest.end) nearest = n;
    }
    if (nearest === null) continue;
    // One character past the qualifier's start, so a sentence-ending period can see the
    // capital that follows it.
    const gap = text.slice(nearest.end, q.index + 1);
    if (gap.length - 1 > QUALIFIER_REACH || CLAUSE_TERMINATOR.test(gap)) continue;
    out.add(nearest.start);
  }
  return out;
}

/**
 * The RATIFIED normalization for `NUMERIC_NOUN_MISMATCH`: lowercase and strip one
 * trailing `s` (`docs/superpowers/specs/2026-07-19-spec-lint.md:103`). Shape (a) uses
 * `singularNoun` instead — widening this one would move that check's whole corpus
 * population, which is not this arc's to move.
 */
const singular = (word: string): string => word.replace(/s$/, "");

/**
 * Shape (a)'s singularizer: the REGULAR English plural rules, as a closed set.
 *
 * Spec §3.1 says the derived noun and the prose noun each "singularize" without naming
 * a rule, and stripping only a terminal `s` is narrower than that — `categories` became
 * `categorie` and never matched `EXPECTED_CATEGORY_COUNT` (whole-diff review R5, probed;
 * the same class covers `statuses`, `processes`, `batches`).
 *
 * DOCUMENTED LIMIT: irregular plurals (`indices`, `matrices`, `children`) are NOT
 * handled and are not going to be — that is a lexicon, not a rule, and the cost of
 * missing one is a tripwire that does not fire rather than a wrong flag. The rules here
 * are the ones that hold without a word list.
 */
function singularNoun(word: string): string {
  const w = word.toLowerCase();
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  // A trailing `s` after `ss`/`us`/`is` is part of a SINGULAR word (`status`, `process`),
  // not a plural marker — the same exclusion `isPluralWord` applies below. Without it
  // `status` became `statu` and never met `statuses`.
  if (/(?:ss|us|is)$/.test(w)) return w;
  return w.replace(/s$/, "");
}

// ---- shape (a): script-constant parity (spec §3.1) ----

/**
 * Where a `/` starts a REGEX rather than dividing: after an operator, a bracket, a
 * separator, or one of the keywords a regex can follow. After a VALUE — an identifier, a
 * number, `]` — it divides.
 *
 * `)` is the genuinely ambiguous one — `if (x) /re/.test(y)` against `(a + b) / 2` — and
 * BOTH answers were refuted in turn: as division it exposed the regex body (R10), and as a
 * regex it swallowed real code up to a later slash and re-synchronised there (R12). So it
 * is not answered by a default at all. The scan remembers, per open paren, whether a
 * control-flow head opened it, and a `)` allows a regex exactly when it closes one of
 * those. `}` stays regex-allowed: a block can be followed by one, and an object literal
 * divided by something is not code this corpus writes.
 */
const REGEX_PRECEDING = new Set("([{,;:=!&|?+-*%~^<>}".split(""));
/** A `(` opened by one of these heads closes into a position where a regex may appear. */
const CONTROL_HEADS = new Set(["if", "for", "while", "switch", "catch", "with"]);
/**
 * The RESERVED words a regex may follow — the closed set, minus the five that are values.
 *
 * Enumerating "the keywords I could think of" is what R11 refuted: `export default /'/;`
 * is valid JavaScript, `default` was not on the list, and the slash read as division
 * exposed the regex body. A reserved word is never a value, so it can never be a left
 * operand of division; the five that ARE values are excluded by name. That is the class,
 * not the instance.
 */
const REGEX_VALUE_WORDS = ["this", "super", "true", "false", "null"];
const REGEX_KEYWORDS = new Set(
  [
    "await",
    "async",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "get",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "of",
    "return",
    "set",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ].filter((word) => !REGEX_VALUE_WORDS.includes(word)),
);
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * The decision needs only the last significant code CHARACTER and, when that character is
 * part of an identifier, the whole identifier — so those are what the scan carries. An
 * earlier version kept a fixed-width window of preceding code, which had to reason about
 * whether the window had cut a longer identifier down to something keyword-shaped
 * (`myreturn` seen as `return`); tracking the identifier itself removes the question.
 */
function regexCanFollow(
  lastChar: string,
  prevChar: string,
  lastWord: string,
  afterControlParen: boolean,
): boolean {
  if (lastChar === "") return true;
  if (lastChar === ")") return afterControlParen;
  // `++` and `--` are the operators that leave a VALUE behind them, so a slash after one
  // divides. Their character is otherwise regex-preceding, and `i++ / 2` read as a regex
  // desynchronised the scan (review R19, probed).
  if ((lastChar === "+" || lastChar === "-") && prevChar === lastChar) return false;
  if (REGEX_PRECEDING.has(lastChar)) return true;
  return REGEX_KEYWORDS.has(lastWord);
}

/** Read TEXTUALLY, never imported — the originating spec's own boundary. */
const CONST_DECL_RE =
  /^(?:export )?const ([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;]*?)\s*;?\s*(?:\/\/.*)?$/;
const EXPECTED_IDENT_RE = /^EXPECTED_[A-Z0-9_]+$/;
/**
 * Shape (a)'s following-noun pattern, deliberately NOT the shared `NOUN_AFTER`.
 *
 * `NOUN_AFTER` is lowercase-only because `2026-07-19-spec-lint.md:103` ratifies that
 * for `NUMERIC_NOUN_MISMATCH`, and changing it would move that check's whole corpus
 * population. But nothing in spec §3.1 narrows shape (a)'s noun match by case, so
 * inheriting the restriction silently dropped `covers 4 Sites` while flagging
 * `covers 4 sites` — a capitalization-only difference in behaviour (whole-diff review
 * R4, probed). Shape (a) therefore reads its own noun, case-insensitively, and
 * lowercases before singularizing.
 */
const NOUN_AFTER_ANY_CASE = /^\s+([A-Za-z][A-Za-z-]{2,})/;
const INT_LITERAL_RE = /^\d+$/;
/**
 * A mention must be the WHOLE path token, so both sides reject any character that
 * would make the match a prefix or suffix of a longer name.
 *
 * The two sides are deliberately not the same class. On the left, a `.` always
 * continues a token (`x.scripts/foo.mjs`). On the right it depends: `foo.mjs.bak`
 * and `foo.mjs-copy` and `foo.mjs/child` are DIFFERENT files, while `foo.mjs.` is
 * the same file at the end of a sentence — which is ordinary prose here. So the
 * right boundary rejects an identifier or separator character outright, and rejects
 * a `.` only when a further alphanumeric follows it.
 *
 * Whole-diff review R3 found the earlier right boundary (`[A-Za-z0-9_]` alone)
 * matching all three of those longer names, which let an unrelated file resolve the
 * real script's constants and draw a false advisory.
 *
 * Held as pattern SOURCE rather than as `RegExp`s because both are composed into one
 * lookaround per script path (see `scriptMentionMatcher`).
 */
const MENTION_LEFT_CLASS = "[A-Za-z0-9_./-]";
const MENTION_RIGHT_PATTERN = "(?:[A-Za-z0-9_/-]|\\.[A-Za-z0-9])";

interface ScriptConstant {
  ident: string;
  value: number;
  /** `EXPECTED_SITE_TOTAL` -> `site` (spec §3.1). */
  noun: string;
}

function constantNoun(ident: string): string {
  const body = ident.replace(/^EXPECTED_/, "").replace(/_(?:TOTAL|COUNT)$/, "");
  return singularNoun(body);
}

/**
 * The module-local `const EXPECTED_* = <integer>` declarations in a script.
 *
 * OPERATIONAL RULE, stated because it is an approximation of the spec's semantic
 * one: a declaration qualifies when it starts at COLUMN 0 and its whole
 * `const IDENT = <digits>` fits on that one line. The arm reads script text
 * TEXTUALLY and never imports it — the originating spec's own boundary — so it has
 * no scope information, and indentation is the only structural signal available.
 * This is the same move the spec makes for its exclusions, which are line-based
 * because `DocModel` has no paragraph model: the rule names what the code can see.
 *
 * DOCUMENTED LIMIT (whole-diff review R3): indentation is not JavaScript scope, and
 * the proxy is wrong in both directions. An indented TOP-LEVEL declaration is
 * skipped, which costs a tripwire that never fires. A column-0 declaration nested
 * inside a block is accepted, which can cost one advisory — bounded by the arm being
 * advisory and by the noun predicate, since the constant still has to match a
 * cardinality's noun on a line naming the script. Both directions are pinned as
 * fixtures so the boundary is executable rather than described. Deciding scope
 * properly means parsing, which is a later arc's call with its own evidence.
 */
/**
 * Script lines a declaration may be read from: every character the JavaScript lexer would
 * NOT treat as code — comment bodies, string literals, template interiors — replaced by a
 * space, so both the line count and every column survive. `null` means the scan could not
 * finish (see below).
 *
 * Declaration-SHAPED text is not a declaration. A commented-out
 * `const EXPECTED_SITE_TOTAL = 37;` sitting at column 0 above the live value drew a
 * FALSE advisory — the wrong direction, and the one the consequence bound cares about
 * (whole-diff review R5, probed).
 *
 * Two earlier versions counted backticks instead of tracking state, and each was refuted
 * by an input that INVERTED the tracking rather than merely losing it: an escaped backtick
 * (R6), then a backtick inside an ordinary string (R8). Inverted state is the dangerous
 * failure — it exposes a template's dead declaration while blanking the live one below,
 * which is a false advisory, not a missed one. So a delimiter is now a delimiter only where
 * the language says it is.
 *
 * A REGEX literal is a span of its own, because leaving it as code was the third refutation
 * (R9, probed): `/'/` opens a string the scan closes on the next apostrophe, a SECOND
 * quote-carrying regex re-closes it, and between the two the state is inverted — the
 * re-balancing that an end-of-input check cannot catch. Telling a regex from division needs
 * the preceding token, so that is what is tracked, with the standard rule: after an
 * operator, an opening bracket, a separator, or one of the keywords a regex can follow, a
 * `/` starts one; after a value — an identifier, a number, `)`, `]` — it divides. A regex
 * cannot span a line, so an open one at a newline is an unfinished scan.
 *
 * When the scan cannot finish — an unterminated string, template, block comment, or regex
 * at end of input — it returns `null` and the script contributes NO constants. A scan that
 * has lost track of where code is must not hand over a declaration it believes in. The
 * preceding-token rule is a heuristic, so misreading division as a regex is possible; it
 * blanks code, which costs a finding and cannot invent one, and `scriptConstants` refuses
 * any identifier declared twice at column 0, so no lexical gap can make the arm pick the
 * WRONG one of two declarations.
 */
export function readableScriptLines(text: string): string[] | null {
  type ScanState =
    | "code"
    | "line-comment"
    | "block-comment"
    | "single"
    | "double"
    | "template"
    | "regex";
  const closers: Record<string, ScanState> = { "'": "single", '"': "double", "`": "template" };
  const out: string[] = [];
  let state: ScanState = "code";
  let line = "";
  // The preceding significant code character, and the identifier it belongs to, for the
  // regex-or-division decision.
  let lastChar = "";
  let prevChar = "";
  let lastWord = "";
  // Whitespace ENDS the trailing identifier without erasing it — `return /re/` needs the
  // word across the space, while `export default` must not fuse into one token.
  let inWord = false;
  // The word before `lastWord`, for the one two-word control head: `for await (`.
  let prevWord = "";
  // Per OPEN paren, whether a control-flow head opened it; and, for the character just
  // consumed, whether the `)` that closed it was one of those.
  const controlParens: boolean[] = [];
  let afterControlParen = false;
  const pushCode = (c: string): void => {
    // `lastChar` still holds the character before this one, so an identifier character
    // there means `lastWord` ends immediately before the paren — across a space or not.
    if (c === "(") {
      const head = lastWord === "await" ? prevWord : lastWord;
      controlParens.push(IDENT_CHAR.test(lastChar) && CONTROL_HEADS.has(head));
    }
    if (c === ")") afterControlParen = controlParens.pop() ?? false;
    if (c === " " || c === "\t") {
      inWord = false;
      return;
    }
    if (IDENT_CHAR.test(c)) {
      if (!inWord) prevWord = lastWord;
      lastWord = inWord ? lastWord + c : c;
      inWord = true;
    } else {
      lastWord = "";
      inWord = false;
    }
    prevChar = lastChar;
    lastChar = c;
  };
  let inClass = false;
  // Template nesting. A backtick inside `${...}` opens a NEW template rather than closing
  // the outer one, so the scan carries a stack: a template frame for each open literal, and
  // an interpolation frame — counting its own braces — for each `${` inside one. Without
  // it, `` `${x ? ` ... ` : ""}` `` closed the outer template at the inner backtick and
  // exposed the template's text as live code (review R14, probed).
  type Frame = { kind: "template" } | { kind: "interp"; braces: number };
  const frames: Frame[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === "\n") {
      // A regex literal cannot contain a line break, so an open one here means the `/` was
      // division and the scan is lost. Say so immediately rather than hoping a later `/`
      // re-closes it — that re-closing is the R9 shape, one level down.
      if (state === "regex") return null;
      out.push(line);
      line = "";
      if (state === "line-comment") state = "code";
      continue;
    }
    if (state === "code") {
      if (c === "/" && (next === "/" || next === "*")) {
        state = next === "/" ? "line-comment" : "block-comment";
        line += " ";
        continue;
      }
      if (c === "/" && regexCanFollow(lastChar, prevChar, lastWord, afterControlParen)) {
        state = "regex";
        inClass = false;
        line += " ";
        continue;
      }
      if (c === "`") {
        frames.push({ kind: "template" });
        state = "template";
        line += " ";
        continue;
      }
      const top = frames[frames.length - 1];
      if (top?.kind === "interp") {
        if (c === "{") top.braces++;
        else if (c === "}") {
          if (top.braces === 0) {
            frames.pop();
            state = "template";
            line += " ";
            continue;
          }
          top.braces--;
        }
      }
      const opened = closers[c];
      if (opened !== undefined) state = opened;
      line += opened === undefined ? c : " ";
      if (opened === undefined) pushCode(c);
      continue;
    }
    line += " ";
    if (state === "line-comment") continue;
    if (state === "block-comment") {
      if (c === "*" && next === "/") {
        state = "code";
        line += " ";
        i++;
      }
      continue;
    }
    if (state === "regex") {
      if (c === "\\") {
        if (next !== undefined && next !== "\n") {
          line += " ";
          i++;
        }
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) {
        state = "code";
        pushCode("/");
      }
      continue;
    }
    // Inside a string or a template: an escape consumes the next character, unless that
    // character is the newline, which must stay a line break for the line accounting.
    if (c === "\\") {
      if (next !== undefined && next !== "\n") {
        line += " ";
        i++;
      }
      continue;
    }
    if (state === "template" && c === "$" && next === "{") {
      frames.push({ kind: "interp", braces: 0 });
      state = "code";
      line += " ";
      i++;
      continue;
    }
    if (state === "template" && c === "`") {
      frames.pop();
      state = "code";
      continue;
    }
    if (closers[c] === state) state = "code";
  }
  out.push(line);
  if (frames.length > 0) return null;
  return state === "code" || state === "line-comment" ? out : null;
}

/**
 * NOUNS declared more than once at column 0 in the RAW text — counted before any blanking,
 * so the count does not depend on the scan being right.
 *
 * Keyed on the noun rather than the identifier because the noun is what the arm COMPARES:
 * `EXPECTED_SITE_COUNT` and `EXPECTED_SITE_TOTAL` are two answers to "how many sites", and
 * an identifier-keyed net let that pair through (review R10, probed).
 *
 * This is the net under the lexer. Every refuted version of that scan (R5, R6, R8, R9) was
 * fooled into reading the WRONG one of two declaration-shaped lines, and each repair closed
 * one lexical hole. Refusing an identifier that appears twice closes the whole class
 * instead: a decoy has to sit at column 0 to be read at all, so with two candidates the arm
 * declines outright. A later gap in the scan can then cost a finding, but it cannot invent
 * one — which is the only asymmetry the consequence bound cares about.
 */
function duplicateDeclarations(text: string): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const raw of text.split("\n")) {
    if (/^\s/.test(raw)) continue;
    const m = CONST_DECL_RE.exec(raw);
    if (m === null) continue;
    const noun = constantNoun(m[1]!);
    if (seen.has(noun)) dupes.add(noun);
    seen.add(noun);
  }
  return dupes;
}

function scriptConstants(text: string): ScriptConstant[] {
  const out: ScriptConstant[] = [];
  const declaredTwice = duplicateDeclarations(text);
  for (const raw of readableScriptLines(text) ?? []) {
    if (/^\s/.test(raw)) continue;
    const m = CONST_DECL_RE.exec(raw);
    if (m === null) continue;
    const ident = m[1]!;
    const init = m[2]!;
    if (!EXPECTED_IDENT_RE.test(ident) || !INT_LITERAL_RE.test(init)) continue;
    if (declaredTwice.has(constantNoun(ident))) continue;
    out.push({ ident, value: Number(init), noun: constantNoun(ident) });
  }
  return out;
}

const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One matcher for a script path: its full path OR its BASENAME (spec §3.1), each
 * bounded so a mention glued into a longer token does not count.
 *
 * LOOP-FREE by construction, and that is load-bearing rather than stylistic. The
 * hand-rolled `indexOf` scan this replaces had an `equality-flip` mutant
 * (`i !== -1` becoming `i === -1`) that spins forever whenever the needle is
 * ABSENT — the common case — because `indexOf` keeps returning -1. A hung mutant is
 * still KILLED by the 30s per-test timeout, so the price was wall clock rather than
 * a wrong verdict, and it cost the enrolled mutation run hours. A pattern has no
 * loop to mutate.
 *
 * Compiled per PATH, never per line: the callers test one matcher against every
 * candidate line, so compiling inside that loop would build hundreds of thousands
 * of regexes on a large document. Non-global, so `.test` carries no `lastIndex`
 * state and the matcher is safe to reuse.
 *
 * Lookbehind is ES2018 and this pattern is built at runtime from a string, so the
 * ES2017 `target` never sees it; every consumer is Node-side (the spec:lint CLI
 * and its suites).
 *
 * `allowBasename` is false when the basename does NOT identify one script. Spec §3.1's
 * association is that a doc "names a script", and `check.mjs` names none in particular
 * when two directories hold one — matching both drew an advisory against a file the doc
 * never mentioned (review R6, probed). The full path still matches, so an unambiguous
 * reference keeps working.
 */
export const basenameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Basenames shared by two or more of `paths`; those cannot identify one script. */
export function ambiguousBasenames(paths: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const p of paths) {
    const base = basenameOf(p);
    if (seen.has(base)) dupes.add(base);
    seen.add(base);
  }
  return dupes;
}

export function scriptMentionMatcher(path: string, allowBasename = true): RegExp {
  const slash = path.lastIndexOf("/");
  const forms = slash === -1 || !allowBasename ? [path] : [path, path.slice(slash + 1)];
  const alternation = forms.map(escapeForRegExp).join("|");
  return new RegExp(`(?<!${MENTION_LEFT_CLASS})(?:${alternation})(?!${MENTION_RIGHT_PATTERN})`);
}

/**
 * Decimal tails ("4.2"), identifier-glued digits, section references ("§12.4") and
 * milestone ids ("M9.5") are not cardinalities — spec §3.2's final ladder row.
 *
 * Shared with shape (a), which had NO lexical guard of its own and so read `§ 38 sites` as
 * a claim of 38 (review R10, probed). The ladder row was written for shape (b) and simply
 * never reached the other arm, exactly as the lowercase-only noun rule did at R4. Nothing
 * in spec §3.1 admits a section label as a cardinality, and the guard only ever removes
 * advisories.
 */
function lexicallyCardinal(before: string): boolean {
  const prevChar = before.slice(-1);
  return (
    prevChar !== "." &&
    !/[A-Za-z0-9]$/.test(prevChar) &&
    !/§\s*[\d.]*$/.test(before) &&
    !/\b[Mm]\d*\.?$/.test(before)
  );
}

// ---- shape (b): sibling-list cardinality (spec §3.2) ----

const BULLET_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
/** Checklist / task-scaffolding bullets are NOT enumeration members. */
const CHECKLIST_RE =
  /^\s*(?:\[[ x]\]\s*)?\*{0,2}(?:Step|Task|Substep|Phase)\s*\d|^\s*-?\s*\[[ x]\]/i;
const CLAIM_VALUE_MIN = 2;
const CLAIM_VALUE_MAX = 40;
const CLAIM_TAIL_MAX = 60;
const ADJACENCY_LOOKAHEAD = 2;
const HEAD_WORD_WINDOW = 3;
const SENTENCE_END = /[.!?](\s|$)/;
const COLON_TERMINATED = /:\s*$/;

const isPluralWord = (word: string): boolean => /[a-z]s$/.test(word) && !/(ss|us|is)$/.test(word);

interface Cardinal {
  index: number;
  end: number;
  raw: string;
  value: number;
  head: string;
  lexOk: boolean;
}

function cardinalsOn(line: string, spanRanges: Range[], markerEnd: number): Cardinal[] {
  const out: Cardinal[] = [];
  CARDINAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CARDINAL_RE.exec(line)) !== null) {
    if (inRange(m.index, spanRanges)) continue;
    const raw = m[1]!;
    const value = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw.toLowerCase()] ?? NaN);
    if (!Number.isFinite(value)) continue;
    const rest = line.slice(m.index + raw.length);
    if (!/^\s/.test(rest)) continue;
    const words: string[] = [];
    let cur = rest;
    for (let k = 0; k < HEAD_WORD_WINDOW; k++) {
      const w = /^\s+([a-zA-Z][a-zA-Z-]*)/.exec(cur);
      if (w === null) break;
      words.push(w[1]!.toLowerCase());
      cur = cur.slice(w[0].length);
    }
    if (words.length === 0) continue;
    let head = words[0]!;
    for (let k = words.length - 1; k >= 0; k--) {
      if (isPluralWord(words[k]!)) {
        head = words[k]!;
        break;
      }
    }
    // Lexical guards, plus the ordered-list marker, which is shape (b)'s alone.
    const lexOk = lexicallyCardinal(line.slice(0, m.index)) && !(m.index <= markerEnd);
    out.push({ index: m.index, end: m.index + raw.length, raw, value, head, lexOk });
  }
  return out;
}

/**
 * A CommonMark thematic break — three or more `-` or `*`, spaces and tabs allowed between
 * them, nothing else on the line.
 *
 * `_` is a thematic-break character too, but it is never a bullet marker, so an `___` line
 * already ends a list through the ordinary fall-through below; recognizing it here would
 * add a branch no input can reach.
 */
/** A marker with no content — CommonMark's empty list item, which `BULLET_RE` cannot match. */
const EMPTY_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])[ \t]*$/;

/**
 * A marker's TYPE: the bullet character, or an ordered marker's delimiter. Two items are in
 * the same list only when these agree, so `1.` and `9.` are one list and `1.` and `1)` are two.
 */
const markerType = (marker: string): string => marker.slice(-1);

/**
 * Blocks that ALWAYS interrupt a paragraph, so meeting one at the list's own indent ends the
 * list for certain rather than continuing an item lazily: an ATX heading and a blockquote.
 * Fenced blocks and thematic breaks interrupt too and are handled by their own branches.
 */
const PARAGRAPH_INTERRUPTER = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>)/;

function isThematicBreak(line: string): boolean {
  const body = line.trim();
  const c = body[0];
  if (c !== "-" && c !== "*") return false;
  let n = 0;
  for (const ch of body) {
    if (ch === c) n++;
    else if (ch !== " " && ch !== "\t") return false;
  }
  return n >= 3;
}

/**
 * Sibling items of the list starting at `start`, or `null` when the list's extent is not
 * DETERMINABLE from the text.
 *
 * `stopAtChecklist` is the contract's final counter (spec §3.2's stop-at-break
 * row): the enumeration ends where task scaffolding begins.
 *
 * The `null` is the R20 class sweep's answer, and it is a REFUSAL rather than a reading. This
 * counter is line-based; CommonMark's list extent depends on paragraph continuation, on which
 * markers may interrupt a paragraph, and on setext underlines, none of which a line scan can
 * decide. Three shapes were probed producing a FALSE advisory — a lazy prose line and a GFM
 * table row each turned a 3-item list into "1 items", and an empty marker did the same — and
 * the fix for each was a different CommonMark rule. So rather than approximate the grammar one
 * construct at a time, the counter reports only when the list's end is CERTAIN and refuses
 * otherwise: a miss costs a tripwire, where a reading that guesses wrong invents one.
 *
 * Certain: end of document, a second blank line, anything at all after ONE blank line (which
 * closes the item's paragraph, so nothing below can continue it lazily), a thematic break or
 * fence at the list's own indent, an ATX heading or blockquote (both always interrupt a
 * paragraph), a marker of a DIFFERENT type (which starts a new list, so this one has ended),
 * and the ratified checklist stop. Refused: an empty marker at the list's own indent, and an
 * unindented non-bullet line with the paragraph still open — the latter deferred rather than
 * refused outright, since it only matters when a sibling follows it; with nothing below, both
 * readings give the same count.
 */
function countListItems(model: DocModel, start: number, stopAtChecklist: boolean): number | null {
  const first = BULLET_RE.exec(model.lines[start]!);
  if (first === null) return 0;
  const indent = first[1]!.length;
  // Where this list's item CONTENT starts: a block must reach this column to belong to an
  // item. CommonMark lets a fence sit up to three spaces in and still be a top-level block,
  // so "deeper than the marker" was not the test (review R17, probed) — and the column is
  // measured from the line rather than assumed, since `-   first` pads its marker and puts
  // the content four columns in (review R18, probed).
  const contentIndent = first[0]!.length - first[3]!.length;
  // CommonMark: two items belong to the same list only when they use the same bullet character
  // or the same ordered delimiter, so `-` then `*` is TWO lists. Counting across the change
  // over-counted a list that had already ended, which drew a false advisory whenever the claim
  // matched the first run (R20 sweep, probed) — and under-reported the tripwire the other way.
  const listType = markerType(first[2]!);
  // Is this list NESTED inside an item of a shallower one? A marker outdented past this list
  // closes it and continues the enclosing list, so it is this list's end; but with no enclosing
  // list there is nothing for it to continue, and CommonMark keeps it here as a sibling whose
  // marker merely sits further left. Both readings are reachable in the corpus — treating the
  // nested case as a sibling swallowed six following lists into one count of 19 — and the
  // enclosing block is what tells them apart, so it is read rather than assumed.
  let nested = false;
  for (let i = start - 1; i >= 0; i--) {
    const above = model.lines[i]!;
    if (above.trim() === "") continue;
    if (/^(\s*)/.exec(above)![1]!.length >= indent) continue;
    nested = BULLET_RE.test(above) || EMPTY_ITEM_RE.test(above);
    break;
  }
  let count = 0;
  let blanks = 0;
  /** Set once a line was read whose reading the list's extent depends on. */
  let ambiguous = false;
  /** Indent of the OPEN fence's delimiter, or null outside a fence. */
  let fenceIndent: number | null = null;
  for (let i = start; i < model.lines.length; i++) {
    const line = model.lines[i]!;
    // A bullet-SHAPED line inside a fenced block is not a sibling item (review R12,
    // probed: two real bullets with a `- ` line inside an indented `~~~` fence counted
    // three). The fence belongs to the item it sits under, so it is skipped rather than
    // treated as the list's end.
    if (model.fencedInfo[i] !== undefined) {
      if (fenceIndent === null) {
        // The OPENING delimiter decides: a fence indented past the item marker is that
        // item's content and is skipped; one at the list's own indent ends the list, and
        // skipping it would swallow whatever follows into this list (review R13, probed).
        fenceIndent = /^(\s*)/.exec(line)![1]!.length;
        if (fenceIndent < contentIndent) break;
      } else if (model.fencedInfo[i] === null) {
        fenceIndent = null;
      }
      blanks = 0;
      continue;
    }
    if (line.trim() === "") {
      blanks++;
      if (blanks >= 2) break;
      continue;
    }
    // A thematic break WINS over a list item in CommonMark, so `- - -` is an <hr> that ends
    // the list rather than a third sibling (review R20, probed). Indented to the item's
    // content column it is a break inside that item, which the list carries over like any
    // other item content.
    if (isThematicBreak(line)) {
      if (/^(\s*)/.exec(line)![1]!.length < contentIndent) break;
      blanks = 0;
      continue;
    }
    // A marker with NOTHING after it. `BULLET_RE` requires content, so this line would
    // otherwise end the list and undercount it — but CommonMark's answer is not simply "an
    // item" either: an empty marker cannot interrupt a paragraph, and a lone `-` under a
    // paragraph line is a setext underline. At the list's own indent the reading changes the
    // count, so the counter refuses rather than pick one (probed for all three marker kinds).
    // Deeper than the list it is inside an item and the sibling count is the same either way.
    const empty = EMPTY_ITEM_RE.exec(line);
    if (empty !== null) {
      if (empty[1]!.length >= contentIndent) {
        blanks = 0;
        continue;
      }
      return null;
    }
    const b = BULLET_RE.exec(line);
    if (b !== null) {
      // Reaching the item's content column makes this a nested list, which belongs to the item
      // above it. Short of that column it cannot be content, so it is a sibling of THIS list
      // unless the list is itself nested, where an outdent closes it instead (both readings
      // probed). Review R1's probe refuted reading the marker's WIDTH here rather than its
      // column, which ran straight past an outdent and swallowed the item below it.
      if (b[1]!.length >= contentIndent) {
        blanks = 0;
        continue;
      }
      if (markerType(b[2]!) !== listType) break;
      if (nested && b[1]!.length < indent) break;
      if (stopAtChecklist && CHECKLIST_RE.test(b[3]!)) break;
      if (ambiguous) return null;
      blanks = 0;
      count++;
      continue;
    }
    if (/^(\s*)/.exec(line)![1]!.length >= contentIndent) {
      blanks = 0;
      continue;
    }
    // Certain terminators: a heading and a blockquote interrupt a paragraph, so the list ends
    // here whatever preceded. So does anything at all once a blank line has closed the item's
    // paragraph — lazy continuation needs an OPEN one. Everything else is the ambiguity above.
    if (blanks === 0 && !PARAGRAPH_INTERRUPTER.test(line)) {
      ambiguous = true;
      continue;
    }
    break;
  }
  return count;
}

// ---- shape (c): quoted-template quantity drift (spec §3.3) ----

const TEMPLATE_MIN_LEN = 40;
const TEMPLATE_MAX_LEN = 400;
const TEMPLATE_SIMILARITY = 0.85;
/**
 * Every leading MARKER, in any order and any nesting: blockquote arrows, bullets, ordered
 * markers.
 *
 * The rule that an ordered marker is not a quantity is ratified; it was simply unreachable
 * behind other markers. Stripping the three in a FIXED order fixed `> 1. …` (review R15)
 * and still left `- > 1. …` (review R16) — so this is one alternation, repeated by the
 * regex engine, which has no order to get wrong and no loop to bound.
 */
const MARKER_PREFIX = /^(?:(?:>\s*)+|[-*+]\s+|\d+[.)]\s+)+/;
const DIGIT_SEQ_RE = /\d+/g;
const NON_TOKEN_RE = /[^a-z0-9]+/g;

interface TemplateCandidate {
  docLine: number;
  text: string;
  /** SET of ASCII-alphanumeric tokens, numerals INCLUDED (spec §3.3, R7 F1). */
  tokens: Set<string>;
  /** DIGIT-ONLY quantities; number-words apply to shape (b) only (spec §3.3). */
  quantities: string[];
}

function templateCandidates(model: DocModel): TemplateCandidate[] {
  const out: TemplateCandidate[] = [];
  for (let idx = 0; idx < model.lines.length; idx++) {
    if (model.fencedInfo[idx] !== undefined) continue;
    const text = model.lines[idx]!.trim().replace(MARKER_PREFIX, "");
    if (text.length < TEMPLATE_MIN_LEN || text.length > TEMPLATE_MAX_LEN) continue;
    if (!/\d/.test(text)) continue;
    if (ISO_DATE_LINE.test(text)) continue;
    // A line is a candidate only when EVERY quantity on it is comparable. Dropping some
    // and keeping others makes the two lists differ in LENGTH, and shape (c) reads any
    // difference as drift — so two lines that both say `4 sites`, one of them dated,
    // compared [] against ["4"] and reported drift between figures that agree (review R7,
    // probed). An exclusion must produce SILENCE, never a finding of its own making.
    const bound = qualifierBoundStarts(text);
    const grouped = rangesOn(text, GROUPED_NUMERAL);
    DIGIT_SEQ_RE.lastIndex = 0;
    const runs = [...text.matchAll(DIGIT_SEQ_RE)];
    if (runs.some((r) => bound.has(r.index) || inRange(r.index, grouped))) continue;
    const quantities = runs.map((r) => r[0]);
    const tokens = new Set(
      text
        .toLowerCase()
        .replace(NON_TOKEN_RE, " ")
        .trim()
        .split(" ")
        .filter((t) => t.length > 0),
    );
    out.push({ docLine: idx + 1, text, tokens, quantities });
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * @param ambiguousBases basenames that identify NO single script, computed over the whole
 *   tracked universe by the caller. It cannot be re-derived from `scriptTexts`: that map
 *   holds only the scripts a document actually mentions, and a full-path mention of ONE of
 *   two `check.mjs` files narrows the map to that one, which makes the shared basename look
 *   unambiguous again and re-admits the false advisory the rule exists to stop (review R7,
 *   probed). Omitted, it falls back to the keys present — the best a caller who knows of no
 *   other scripts can say, and correct for the direct-call fixtures.
 */
export function checkNumerics(
  model: DocModel,
  candidateSpans: InlineSpan[],
  scriptTexts?: Readonly<Record<string, string>>,
  ambiguousBases?: ReadonlySet<string>,
): { findings: Finding[]; inventory: InventoryGroup[] } {
  interface Hit {
    raw: string;
    docLine: number;
    column: number; // 1-based UTF-16
    snippet: string;
    noun: string | null;
  }
  const hits: Hit[] = [];

  for (let idx = 0; idx < model.lines.length; idx++) {
    if (model.fencedInfo[idx] !== undefined) continue; // fenced or delimiter
    const line = model.lines[idx]!;
    const lineNo = idx + 1;
    const spanRanges: Range[] = candidateSpans
      .filter((s) => s.line === lineNo)
      .map((s) => ({ start: s.column - 1, end: s.column - 1 + s.content.length }));
    const exclRanges = rangesOn(line, EXCLUSION_CONTEXTS);
    LEXICON.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LEXICON.exec(line)) !== null) {
      if (inRange(m.index, spanRanges) || inRange(m.index, exclRanges)) continue;
      const column = m.index + 1;
      const noun = NOUN_AFTER.exec(line.slice(m.index + m[0].length));
      hits.push({
        raw: m[0],
        docLine: lineNo,
        column,
        snippet: line.slice(Math.max(0, column - SNIPPET_BEFORE), column + SNIPPET_AFTER),
        noun: noun ? noun[1]! : null,
      });
    }
  }

  // Noun-anchored mismatch: normalized noun bound to ≥2 distinct raws.
  const findings: Finding[] = [];
  const byNoun = new Map<string, Hit[]>();
  for (const h of hits) {
    if (h.noun === null) continue;
    const norm = singular(h.noun.toLowerCase());
    const list = byNoun.get(norm);
    if (list) list.push(h);
    else byNoun.set(norm, [h]);
  }
  const mismatches: { first: Hit; all: Hit[] }[] = [];
  for (const group of byNoun.values()) {
    const raws = new Set(group.map((h) => h.raw));
    if (raws.size >= 2) mismatches.push({ first: group[0]!, all: group });
  }
  mismatches.sort((a, b) => a.first.docLine - b.first.docLine || a.first.column - b.first.column);
  for (const mm of mismatches) {
    findings.push({
      check: "numerics",
      code: "NUMERIC_NOUN_MISMATCH",
      severity: "advisory",
      docLine: mm.first.docLine,
      column: mm.first.column,
      message: `"${mm.first.noun}" appears with ${new Set(mm.all.map((h) => h.raw)).size} distinct numbers`,
      detail: mm.all.map((h) => `doc line ${h.docLine}: "${h.raw} ${h.noun}"`).join("; "),
    });
  }

  // ---- shape (a): SCRIPT_CONSTANT_PARITY (spec §3.1) ----
  if (scriptTexts !== undefined) {
    // Matcher compiled ONCE per script, outside the per-hit loop below.
    const ambiguous = ambiguousBases ?? ambiguousBasenames(Object.keys(scriptTexts));
    const constantsByPath = Object.entries(scriptTexts)
      .map(([path, text]) => ({
        path,
        mentions: scriptMentionMatcher(path, !ambiguous.has(basenameOf(path))),
        constants: scriptConstants(text),
      }))
      .filter((entry) => entry.constants.length > 0);
    const boundCache = new Map<number, Set<number>>();
    for (const h of hits) {
      if (!INT_LITERAL_RE.test(h.raw)) continue;
      const line = model.lines[h.docLine - 1]!;
      const following = NOUN_AFTER_ANY_CASE.exec(line.slice(h.column - 1 + h.raw.length));
      if (following === null) continue;
      if (inRange(h.column - 1, rangesOn(line, GROUPED_NUMERAL))) continue;
      if (!lexicallyCardinal(line.slice(0, h.column - 1))) continue;
      if (ISO_DATE_LINE.test(line)) continue; // exclusion (iii)
      let bound = boundCache.get(h.docLine);
      if (bound === undefined) {
        bound = qualifierBoundStarts(line);
        boundCache.set(h.docLine, bound);
      }
      if (bound.has(h.column - 1)) continue; // exclusion (ii)
      const noun = singularNoun(following[1]!);
      const claimed = Number(h.raw);
      // A line naming TWO scripts that each declare this noun associates the count with
      // neither: comparing against both reported two advisories for a line whose claims
      // were both correct (review R17, probed). Same rule as the ambiguous basename — a
      // reference that identifies more than one script identifies none.
      const named = constantsByPath.filter(
        (e) => e.mentions.test(line) && e.constants.some((c) => c.noun === noun),
      );
      if (named.length > 1) continue;
      for (const { path, constants } of named) {
        for (const c of constants) {
          if (c.noun !== noun || c.value === claimed) continue;
          findings.push({
            check: "numerics",
            code: "SCRIPT_CONSTANT_PARITY",
            severity: "advisory",
            docLine: h.docLine,
            column: h.column,
            message: `prose says ${claimed} ${following[1]}, but ${c.ident} = ${c.value}`,
            detail: `${path} declares ${c.ident} = ${c.value}; this line claims ${claimed}`,
          });
        }
      }
    }
  }

  // ---- shape (b): SIBLING_LIST_CARDINALITY (spec §3.2) ----
  for (let idx = 0; idx < model.lines.length; idx++) {
    if (model.fencedInfo[idx] !== undefined) continue;
    const line = model.lines[idx]!;
    if (ISO_DATE_LINE.test(line)) continue; // exclusion (iii)
    const claimBullet = BULLET_RE.exec(line);
    const markerEnd = claimBullet !== null ? claimBullet[1]!.length + claimBullet[2]!.length : -1;
    const spanRanges: Range[] = model.spans
      .filter((s) => s.line === idx + 1)
      .map((s) => ({ start: s.column - 1, end: s.column - 1 + s.content.length }));
    // A grouped numeral is unreadable here for the same reason as in shape (a): `12,345`
    // would offer `12` as a claim, with the noun three words away (review R7).
    const cards = cardinalsOn(line, [...spanRanges, ...rangesOn(line, GROUPED_NUMERAL)], markerEnd);
    if (cards.length === 0) continue;
    // Only the line's LAST recognized cardinality can qualify (spec §3.2's
    // "claim in the line's last clause", as the instrument measures it).
    const claim = cards[cards.length - 1]!;
    if (!isPluralWord(claim.head)) continue;
    // List adjacency, applied BEFORE the value gate (spec §3.2 predicate provenance).
    let listIdx = -1;
    for (let d = 1; d <= ADJACENCY_LOOKAHEAD && idx + d < model.lines.length; d++) {
      const candidate = model.lines[idx + d]!;
      if (candidate.trim() === "") continue;
      if (BULLET_RE.test(candidate)) listIdx = idx + d;
      break;
    }
    if (listIdx < 0) continue;
    const adjacent = countListItems(model, listIdx, false);
    if (adjacent === null || adjacent < 1) continue;
    if (claim.value < CLAIM_VALUE_MIN || claim.value > CLAIM_VALUE_MAX) continue;
    if (SENTENCE_END.test(line.slice(claim.end))) continue;
    if (!COLON_TERMINATED.test(line) && line.length - claim.end > CLAIM_TAIL_MAX) continue;
    const listBullet = BULLET_RE.exec(model.lines[listIdx]!)!;
    if (claimBullet !== null && listBullet[1]!.length <= claimBullet[1]!.length) continue;
    if (!claim.lexOk) continue;
    if (qualifierBoundStarts(line).has(claim.index)) continue; // exclusion (ii)
    const counted = countListItems(model, listIdx, true);
    if (counted === null || counted === claim.value) continue;
    findings.push({
      check: "numerics",
      code: "SIBLING_LIST_CARDINALITY",
      severity: "advisory",
      docLine: idx + 1,
      column: claim.index + 1,
      message: `claim of ${claim.value} ${claim.head} over an adjacent list of ${counted} items`,
      detail: `claim "${claim.raw} ${claim.head}"; list starts at doc line ${listIdx + 1} with ${counted} sibling items`,
    });
  }

  // ---- shape (c): TEMPLATE_QUANTITY_DRIFT (spec §3.3) ----
  // ALL-PAIRS within the document — the instrument's greedy-anchor grouping drops
  // qualifying pairs (spec §3, layer 2 divergence list).
  const candidates = templateCandidates(model);
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.text === b.text) continue;
      if (a.quantities.join(",") === b.quantities.join(",")) continue;
      const similarity = jaccard(a.tokens, b.tokens);
      if (similarity < TEMPLATE_SIMILARITY) continue;
      findings.push({
        check: "numerics",
        code: "TEMPLATE_QUANTITY_DRIFT",
        severity: "advisory",
        docLine: a.docLine,
        column: 1,
        message: `near-identical line repeated at doc line ${b.docLine} carries [${a.quantities.join(", ")}] here and [${b.quantities.join(", ")}] there`,
        detail: `similarity ${similarity.toFixed(2)}; doc line ${a.docLine}: "${a.text}"; doc line ${b.docLine}: "${b.text}"`,
      });
    }
  }

  // Inventory: group by RAW; groups by Number(raw) then raw; occurrences by (docLine, column).
  const byRaw = new Map<string, InventoryOccurrence[]>();
  for (const h of hits) {
    const occ: InventoryOccurrence = { docLine: h.docLine, column: h.column, snippet: h.snippet };
    const list = byRaw.get(h.raw);
    if (list) list.push(occ);
    else byRaw.set(h.raw, [occ]);
  }
  const inventory: InventoryGroup[] = [...byRaw.entries()]
    .map(([raw, occurrences]) => ({
      raw,
      occurrences: occurrences.sort((a, b) => a.docLine - b.docLine || a.column - b.column),
    }))
    .sort((a, b) => Number(a.raw) - Number(b.raw) || (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0));

  return { findings, inventory };
}

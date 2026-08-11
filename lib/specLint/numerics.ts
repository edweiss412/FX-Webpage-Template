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

/** (iii) a line carrying an ISO date is a dated historical record; never compared. */
const ISO_DATE_LINE = /\d{4}-\d{2}-\d{2}/;
/**
 * (ii) the dated qualifier family, derived from the spec's two named phrases
 * ("at plan time", "at authoring time") rather than enumerated: `at` + one or two
 * words + `time`. DOCUMENTED LIMIT: the derivation also matches non-provenance
 * connectives ("at the same time"), which suppresses an advisory rather than
 * inventing one — the tripwire direction (spec §4: silence means "no qualifying
 * structure", never "verified consistent").
 */
const DATED_QUALIFIER_RE = /\bat\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*)?\s+time\b/gi;
/** A qualifier binds a number only when it follows within the same clause. */
const QUALIFIER_REACH = 40;

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
    if (nearest !== null && q.index - nearest.end <= QUALIFIER_REACH) out.add(nearest.start);
  }
  return out;
}

const singular = (word: string): string => word.replace(/s$/, "");

// ---- shape (a): script-constant parity (spec §3.1) ----

/** Read TEXTUALLY, never imported — the originating spec's own boundary. */
const CONST_DECL_RE =
  /^(?:export )?const ([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;]*?)\s*;?\s*(?:\/\/.*)?$/;
const EXPECTED_IDENT_RE = /^EXPECTED_[A-Z0-9_]+$/;
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
  return singular(body.toLowerCase());
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
function scriptConstants(text: string): ScriptConstant[] {
  const out: ScriptConstant[] = [];
  for (const raw of text.split("\n")) {
    if (/^\s/.test(raw)) continue;
    const m = CONST_DECL_RE.exec(raw);
    if (m === null) continue;
    const ident = m[1]!;
    const init = m[2]!;
    if (!EXPECTED_IDENT_RE.test(ident) || !INT_LITERAL_RE.test(init)) continue;
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
 */
export function scriptMentionMatcher(path: string): RegExp {
  const slash = path.lastIndexOf("/");
  const forms = slash === -1 ? [path] : [path, path.slice(slash + 1)];
  const alternation = forms.map(escapeForRegExp).join("|");
  return new RegExp(`(?<!${MENTION_LEFT_CLASS})(?:${alternation})(?!${MENTION_RIGHT_PATTERN})`);
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
    // Lexical guards: decimal tails ("4.2"), identifier-glued digits, section
    // references ("§12.4"), milestone ids ("M9.5"), and the ordered-list marker
    // itself are not cardinalities (spec §3.2's final ladder row).
    const before = line.slice(0, m.index);
    const prevChar = before.slice(-1);
    const lexOk =
      prevChar !== "." &&
      !/[A-Za-z0-9]$/.test(prevChar) &&
      !/§\s*[\d.]*$/.test(before) &&
      !/\b[Mm]\d*\.?$/.test(before) &&
      !(m.index <= markerEnd);
    out.push({ index: m.index, end: m.index + raw.length, raw, value, head, lexOk });
  }
  return out;
}

/**
 * Sibling items of the list starting at `start`.
 *
 * `stopAtChecklist` is the contract's final counter (spec §3.2's stop-at-break
 * row): the enumeration ends where task scaffolding begins.
 */
function countListItems(model: DocModel, start: number, stopAtChecklist: boolean): number {
  const first = BULLET_RE.exec(model.lines[start]!);
  if (first === null) return 0;
  const indent = first[1]!.length;
  let count = 0;
  let blanks = 0;
  for (let i = start; i < model.lines.length; i++) {
    const line = model.lines[i]!;
    if (line.trim() === "") {
      blanks++;
      if (blanks >= 2) break;
      continue;
    }
    const b = BULLET_RE.exec(line);
    if (b !== null && b[1]!.length === indent) {
      if (stopAtChecklist && CHECKLIST_RE.test(b[3]!)) break;
      blanks = 0;
      count++;
      continue;
    }
    if (b !== null && b[1]!.length > indent) {
      blanks = 0;
      continue;
    }
    if (/^(\s*)/.exec(line)![1]!.length > indent) {
      blanks = 0;
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
const BULLET_PREFIX = /^[-*+]\s+/;
const ORDERED_PREFIX = /^\d+[.)]\s+/;
const DIGIT_RUN_RE = /\d+/g;
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
    const text = model.lines[idx]!.trim().replace(BULLET_PREFIX, "").replace(ORDERED_PREFIX, "");
    if (text.length < TEMPLATE_MIN_LEN || text.length > TEMPLATE_MAX_LEN) continue;
    if (!/\d/.test(text)) continue;
    if (ISO_DATE_LINE.test(text)) continue;
    const bound = qualifierBoundStarts(text);
    const quantities: string[] = [];
    DIGIT_RUN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIGIT_RUN_RE.exec(text)) !== null) {
      if (!bound.has(m.index)) quantities.push(m[0]);
    }
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

export function checkNumerics(
  model: DocModel,
  candidateSpans: InlineSpan[],
  scriptTexts?: Readonly<Record<string, string>>,
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
    const constantsByPath = Object.entries(scriptTexts)
      .map(([path, text]) => ({
        path,
        mentions: scriptMentionMatcher(path),
        constants: scriptConstants(text),
      }))
      .filter((entry) => entry.constants.length > 0);
    const boundCache = new Map<number, Set<number>>();
    for (const h of hits) {
      if (h.noun === null || !INT_LITERAL_RE.test(h.raw)) continue;
      const line = model.lines[h.docLine - 1]!;
      if (ISO_DATE_LINE.test(line)) continue; // exclusion (iii)
      let bound = boundCache.get(h.docLine);
      if (bound === undefined) {
        bound = qualifierBoundStarts(line);
        boundCache.set(h.docLine, bound);
      }
      if (bound.has(h.column - 1)) continue; // exclusion (ii)
      const noun = singular(h.noun.toLowerCase());
      const claimed = Number(h.raw);
      for (const { path, mentions, constants } of constantsByPath) {
        if (!mentions.test(line)) continue;
        for (const c of constants) {
          if (c.noun !== noun || c.value === claimed) continue;
          findings.push({
            check: "numerics",
            code: "SCRIPT_CONSTANT_PARITY",
            severity: "advisory",
            docLine: h.docLine,
            column: h.column,
            message: `prose says ${claimed} ${h.noun}, but ${c.ident} = ${c.value}`,
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
    const cards = cardinalsOn(line, spanRanges, markerEnd);
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
    if (countListItems(model, listIdx, false) < 1) continue;
    if (claim.value < CLAIM_VALUE_MIN || claim.value > CLAIM_VALUE_MAX) continue;
    if (SENTENCE_END.test(line.slice(claim.end))) continue;
    if (!COLON_TERMINATED.test(line) && line.length - claim.end > CLAIM_TAIL_MAX) continue;
    const listBullet = BULLET_RE.exec(model.lines[listIdx]!)!;
    if (claimBullet !== null && listBullet[1]!.length <= claimBullet[1]!.length) continue;
    if (!claim.lexOk) continue;
    if (qualifierBoundStarts(line).has(claim.index)) continue; // exclusion (ii)
    const counted = countListItems(model, listIdx, true);
    if (counted === claim.value) continue;
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

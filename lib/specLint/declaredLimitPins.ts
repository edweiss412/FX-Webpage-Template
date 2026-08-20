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

import type { DocModel } from "./parse";
import type { EnrolledSurface, FileResolver, Finding } from "./types";

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
 * Decode a string-literal body (spec §3.1 item 2), or DECLINE it.
 *
 * The runtime test name is the DECODED string, so a plan author quoting the pin copies
 * the decoded form; comparing a source spelling against the plan would draw a false
 * advisory on a title the accept-set explicitly admits. `\\` yielding ONE backslash is
 * called out in the spec because a decoder implementing only the quote, newline and tab
 * escapes passes almost every fixture while violating it.
 *
 * ── NUMERIC ESCAPES ARE DECODED, NOT DECLINED ────────────────────────────────
 * `\xHH`, `\uHHHH` and `\u{…}` resolve; a MALFORMED one falls through to the identity
 * rule rather than declining the line. An earlier repair deleted this machinery because
 * 26 of the surface's first 48 mutation survivors lived in it — but those survivors meant
 * the paths were UNTESTED, not dead, and deleting them made the arm go SILENT on a class
 * it can reach: two live test titles in this repo already carry `\x1b`, on a suite of an
 * enrolled surface. A decline with no channel is not the conservative direction, it is
 * the fail-open one wearing its clothes. So the paths are back and they are TESTED.
 */
function decode(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    // TOTAL rather than asserted: `charAt` returns "" past the end. `decode` only ever
    // runs on a TERMINATED literal, whose body cannot end in an unescaped backslash —
    // that backslash would have escaped the closing quote — so the empty case is
    // unreachable today. It is written totally anyway, because that reachability is a
    // PROSE argument and a later edit to the scanner could quietly falsify it, at which
    // point a non-null assertion would append the string "undefined" to a title.
    const next = body.charAt(i + 1);
    if (next === "u" || next === "x") {
      const decoded = decodeNumericEscape(body, i);
      if (decoded !== null) {
        out += decoded.text;
        i = decoded.lastIndex;
        continue;
      }
      // A MALFORMED numeric escape is not a numeric escape. It falls through to the
      // identity rule below rather than being dropped, so the title still decodes to
      // something faithful instead of the arm going silent on the whole line.
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
    // ONE match rather than find-brace/slice/validate. Not a tidy-up: the separate
    // find-brace guard, once mutated, stops firing and the function returns
    // `lastIndex: -1`, which REWINDS the decode cursor and re-scans from the start
    // forever. A match cannot yield a negative index, so the hang stops being
    // expressible. The {1,6} bound lives on INSIDE the pattern and keeps its fixture.
    const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(body.slice(start));
    if (braced === null) return null;
    const code = parseInt(braced[1]!, 16);
    if (code > 0x10ffff) return null;
    return { text: String.fromCodePoint(code), lastIndex: start + braced[0].length - 1 };
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
  // The leading run is consumed by a MATCH, not by a loop, and that is a correctness
  // requirement rather than a style choice.
  //
  // An earlier repair wrote this as `while (line.charAt(i) === " " || ...) i += 1`, to
  // delete the bounds comparison a mutant had survived on. That trade was WRONG: an
  // unbounded loop moves TERMINATION into the predicate, so an equality-flip mutant
  // (`===` to `!==`) spins forever, because `charAt` keeps returning "" past the end
  // where the bounded form simply stopped. It cost two whole scoring runs, both killed
  // at ~12 minutes with the harness's per-mutant budget burned by the hang.
  //
  // A regex match terminates by construction NO MATTER WHAT a mutant does to it, and it
  // still carries no comparison operator to mutate. That is the property the bounded
  // loop had and the totalised loop threw away.
  // `^[ \t]*` matches EVERY string — the star admits the empty run — so `exec` cannot
  // return null here and there is no fallback branch to get wrong. Asserted rather than
  // branched, because a branch that cannot be taken is a site a mutant lives in for free.
  const leading = /^[ \t]*/.exec(line.slice(afterOpenParen))!;
  const i = afterOpenParen + leading[0].length;
  const quote = line.charAt(i);
  // A backtick is a template literal: substitution would make the title non-constant,
  // and a constant one is an ordinary edit away from a quoted literal (spec §8 item 4).
  if (quote !== '"' && quote !== "'") return null;
  // ITERATED, not indexed, for the same termination reason as the leading run above: a
  // `for…of` over a finite string ends no matter what a mutant does to the body, where
  // the unbounded indexed form spins forever once `ch === ""` is flipped and the line
  // holds an unterminated literal (`test("`). Escape state is a FLAG rather than
  // index arithmetic, which also removes the lookahead and the manual advance.
  let body = "";
  let escaped = false;
  for (const ch of line.slice(i + 1)) {
    if (escaped) {
      body += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      // Escape-aware, so a `\"` inside the title does not end the literal early — the
      // failure a naive quote-to-quote match makes, which then never sees the phrase.
      body += ch;
      escaped = true;
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
  const disposed = new Set(dispositions.map((d) => `${d.path}\u0000${d.title}`));
  const pins: Pin[] = [];
  // `entries()` rather than an index loop: the bound and the increment stop existing,
  // so neither has an off-by-one to get wrong.
  for (const [index, line] of lines.entries()) {
    const opener = OPENER.exec(line);
    if (opener === null) continue;
    const title = firstArgumentLiteral(line, opener[0].length);
    if (title === null) continue;
    const haystack = title.toLowerCase();
    if (!PHRASES.some((phrase) => haystack.includes(phrase))) continue;
    // Keyed on the PAIR, never the path: a path-keyed row would absorb every future
    // pin in that file, invisibly, because the absorbed thing does not exist yet.
    if (disposed.has(`${path}\u0000${title}`)) continue;
    pins.push({ path, line: index + 1, title });
  }
  return pins;
}

/** A `**Files:**` or `**Files**` header, optionally written as a list item. */
const FILES_HEADER = /^[ \t]*(?:[-*+][ \t]+)?\*\*Files:?\*\*/;
const UNORDERED_ITEM = /^[ \t]*[-*+][ \t]+/;
/** An indented continuation of the list item above it. */
const INDENTED_CONTINUATION = /^[ \t]+\S/;

/**
 * Does this text name SOMETHING PATH-SHAPED? Used only to classify the header's FORM
 * (spec §3.2), never to decide enrolment — the candidate set for that is the closed
 * set of enrolled paths.
 *
 * Two shapes, because both are live. 642 headers name a path with a directory
 * separator; a further 54 name only a ROOT file (`BACKLOG.md`, `package.json`,
 * `AGENTS.md`), and a slash-bearing probe wrongly excluded every one of them until
 * round 6. The bare-file form requires a TWO-character extension so ordinary prose
 * abbreviations ("t.b.d", "e.g.") do not read as a filename and silently reclassify a
 * list-form header as inline.
 */
const PATH_SHAPED =
  /(?:^|[^A-Za-z0-9._/-])(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,})(?![A-Za-z0-9._/-])/;

/** Spec §3.2's delimiter class: what may NOT abut a path for the token to be delimited. */
const PATH_CHAR = /[A-Za-z0-9._/-]/;

/**
 * A plan's Files declarations, as line indices (spec §3.2). Fenced lines are inert:
 * `model.fencedInfo[i]` is `undefined` ONLY for a line outside every fence, so this
 * single test excludes both fence bodies and their delimiters.
 */
function filesDeclarations(model: DocModel): number[][] {
  const declarations: number[][] = [];
  for (const [i, line] of model.lines.entries()) {
    if (model.fencedInfo[i] !== undefined) continue;
    const header = FILES_HEADER.exec(line);
    if (header === null) continue;

    // INLINE — the header's own remainder names a path, so the declaration is THAT
    // LINE ALONE and nothing below it is read. An inline declaration is complete where
    // it is written, and reading on absorbs whatever follows: a live plan carries
    // `**Files:** \`BACKLOG.md\`` followed by a blank and a TASK CHECKLIST, and
    // skipping that blank made one ordinary prior-art citation in a checklist step
    // advise about an unrelated pin.
    if (PATH_SHAPED.test(line.slice(header[0].length))) {
      declarations.push([i]);
      continue;
    }

    // LIST — the header names no path and the line IMMEDIATELY below opens an
    // unordered item. NO BLANK LINE IS EVER SKIPPED: the blank is the signal that the
    // list below belongs to something else.
    const next = i + 1;
    // Indexed ONCE and tested for presence, rather than compared against a length: the
    // bounds comparison stops existing, and each remaining conjunct answers for a case
    // that is actually exercised — a header on the LAST line (no next line at all), and
    // a next line that opens a FENCE.
    const nextLine = model.lines[next];
    if (
      nextLine !== undefined &&
      model.fencedInfo[next] === undefined &&
      UNORDERED_ITEM.test(nextLine)
    ) {
      const span = [i];
      for (let j = next; j < model.lines.length; j += 1) {
        if (model.fencedInfo[j] !== undefined) break;
        const item = model.lines[j] ?? "";
        if (item.trim() === "") break; // first blank ends the run
        if (!UNORDERED_ITEM.test(item) && !INDENTED_CONTINUATION.test(item)) break;
        span.push(j);
      }
      declarations.push(span);
    }

    // ANYTHING ELSE — an ordered run, a blank, a table, a fence — is DECLINED (spec §8
    // items 11 and 14). Sampling the 19 ordered runs shows their numbered items are as
    // often TASK STEPS as files, so the arm cannot classify one and declines rather than
    // guessing. The failure direction is a missed advisory, never a false one.
    //
    // NOTHING IS RECORDED for a declined header, and that is not an omission: the
    // declaration would be the header REMAINDER alone, and a remainder carrying an
    // enrolled path is PATH_SHAPED, which would have classified it INLINE above. So the
    // declined branch can never name a surface, and a push here would be dead weight a
    // mutant could live in for free.
  }
  return declarations;
}

/**
 * Does `line` name `path` as a DELIMITED TOKEN (spec §3.2)?
 *
 * A bare substring test is unsound in BOTH directions and both are one ordinary
 * authoring edit from a live corpus entry: a `.bak` sibling CONTAINS a live entry while
 * naming a different file (the trailing side), and an `archive/`-prefixed path contains
 * it too (the leading side, which an implementation checking only the character AFTER
 * the match gets wrong).
 *
 * Every occurrence is examined, not just the first: a line can carry the path twice,
 * once abutted and once clean, and stopping at the first match would report the wrong
 * answer for the line.
 */
function namesPath(line: string, path: string): boolean {
  // The search ADVANCES IN THE HEADER, so this terminates by construction: `at` strictly
  // increases and `indexOf` eventually returns -1 no matter what a mutant does to the
  // condition. The earlier `for (;;)` form did not — flipping `at === -1` left it
  // re-searching from the same offset forever, and a hanging mutant burns the harness's
  // whole per-mutant budget. Two scoring runs died that way before the shape was fixed
  // here and in the literal scanner.
  //
  // `charAt` on both sides, so the out-of-range case needs no comparison of its own:
  // it returns "" past either end, which is not a path character.
  // BOUNDED IN THE HEADER by `line.length`, and that is a termination requirement rather
  // than a style choice. The previous form resumed an `indexOf` from a value the loop
  // condition controlled: invert `at !== -1` and the update becomes `indexOf(path, 0)`,
  // which returns -1 forever whenever the path is absent, so the scan restarts from zero
  // and never ends. A hung mutant SCORES AS DETECTION here, so it costs three minutes of
  // wall clock and reports nothing — which is precisely why it survived an audit that
  // checked the loop's SHAPE instead of what its update computes when the guard flips.
  //
  // No mutation of the predicate can extend a walk whose ceiling is the string's own
  // length. Note the repair ADDS a comparison rather than removing one, so it is not
  // site-shrinking wearing termination's clothes.
  for (let at = 0; at < line.length; at += 1) {
    if (!line.startsWith(path, at)) continue;
    // `charAt` on both sides: it returns "" past either end, which is not a path
    // character, so the out-of-range case needs no branch of its own.
    const before = line.charAt(at - 1);
    const after = line.charAt(at + path.length);
    if (!PATH_CHAR.test(before) && !PATH_CHAR.test(after)) return true;
  }
  return false;
}

/**
 * Every enrolled surface a plan names, mapped to the Files-declaration line that named
 * it — the line an advisory about that surface anchors at (spec §3.3).
 *
 * The FIRST naming wins, so the anchor is stable when a plan names one surface in two
 * declarations. Line numbers are 1-based on the way out.
 */
export function namedSurfaceAnchors(
  model: DocModel,
  surfaces: readonly EnrolledSurface[],
): Map<string, number> {
  const anchors = new Map<string, number>();
  for (const declaration of filesDeclarations(model)) {
    for (const index of declaration) {
      const line = model.lines[index]!;
      for (const surface of surfaces) {
        if (anchors.has(surface.id)) continue;
        const paths = [surface.sourcePath, ...surface.suitePaths];
        if (paths.some((path) => namesPath(line, path))) {
          // Anchored at the DECLARATION's header line, not the matching item, so every
          // pin of one surface shares one anchor — which is why a finding's identity is
          // `(code, suitePath, title)` and never its position (spec §3.3).
          anchors.set(surface.id, declaration[0]! + 1);
        }
      }
    }
  }
  return anchors;
}

/**
 * The set of enrolled surface ids a plan NAMES in its Files declarations (spec §3.2).
 *
 * The enrolled table is a PARAMETER: this module imports no registry, so the mutation
 * harness scores the logic while the registry stays the registry.
 */
export function namedSurfaces(
  model: DocModel,
  surfaces: readonly EnrolledSurface[],
): Set<string> {
  return new Set(namedSurfaceAnchors(model, surfaces).keys());
}

/**
 * A suite's text after PREPARATION (spec §3.1) — or the fact that it could not be
 * parsed at all. The core receives this RESULT and never parses anything itself, so
 * whether diagnostics were taken before or after blanking is a property of the ADAPTER
 * and is invisible here. Task 7b proves that ordering against the real function.
 */
export type PreparedSuite =
  | { status: "ok"; lines: readonly string[] }
  | { status: "parse-failed" };

/** Injected by the adapter, which owns the only TypeScript parse (spec §4). */
export type SuitePreparer = (path: string, rawLines: readonly string[]) => PreparedSuite;

const ADVISORY = "advisory" as const;
const CHECK = "taskContract" as const;

/**
 * The obligation and both finding codes (spec §3.3, §3.4).
 *
 * Emission order is doc order of first naming, then suite order, then pin order within
 * a suite. NO ORDERING GUARANTEE BEYOND THAT is offered, and none should be relied on:
 * a finding's IDENTITY is `(code, suitePath, title)`, never its anchor position, and
 * several findings legitimately share one anchor line.
 */
export function checkDeclaredLimitPins(
  model: DocModel,
  kind: "spec" | "plan",
  surfaces: readonly EnrolledSurface[] | null,
  resolver: FileResolver,
  prepare: SuitePreparer,
  dispositions: readonly PinDisposition[],
): Finding[] {
  // A spec carries no Files list, so the collision is a plan-time fact; and a NULL
  // injected table means the arm runs nothing, which keeps every existing caller
  // compiling and byte-identical in behavior.
  if (kind !== "plan" || surfaces === null) return [];

  const anchors = namedSurfaceAnchors(model, surfaces);
  if (anchors.size === 0) return [];

  const byId = new Map(surfaces.map((surface) => [surface.id, surface]));
  // The obligation searches the WHOLE document, fenced blocks included, and it must:
  // a decoded title containing a NEWLINE is named across two plan lines, and a
  // per-line matcher would fail it and emit a permanent advisory nobody could silence
  // (spec §8 item 13).
  const documentText = model.lines.join("\n");
  const tracked = new Set(resolver.listTrackedFiles());

  const findings: Finding[] = [];
  /** Spec §3.2's ONLY deduplication: one pin reachable through several surfaces is
   *  reported once. There is no other collapse — in particular NOT on the anchor. */
  const reportedPins = new Set<string>();

  // NOT sorted: `filesDeclarations` walks lines in ascending order and a Map preserves
  // insertion order, so `anchors` is ALREADY in doc order of first naming. A comparator
  // here could never reorder anything — it was dead, and dead code is deleted rather
  // than defended with an equivalence argument that a later refactor could falsify.
  for (const [id, anchorLine] of anchors) {
    const surface = byId.get(id);
    if (surface === undefined) continue;

    for (const suitePath of surface.suitePaths) {
      const unreadable = (): void => {
        findings.push({
          check: CHECK,
          code: "DECLARED_LIMIT_PIN_SUITE_UNREADABLE",
          severity: ADVISORY,
          docLine: anchorLine,
          column: 1,
          message: `surface ${id} names a deciding suite this lint could not read: ${suitePath}`,
        });
      };

      // Each channel CONTINUES to the next suite and never returns from the SURFACE.
      // Live surfaces genuinely carry several suites with the pins in the later one, so
      // abandoning the surface on one bad suite silently suppresses a live pin while
      // passing every single-suite fixture.

      // Channel 2 first, because it is the one a tracking-blind implementation misses:
      // the read seam resolves any file on disk, so an untracked suite reads fine and
      // reports "no pins" with nothing saying the tree and the index disagree.
      if (!tracked.has(suitePath)) {
        unreadable();
        continue;
      }
      // Channel 1 — unreadable, or a symlink.
      const raw = resolver.readFileLines(suitePath);
      if (raw === null) {
        unreadable();
        continue;
      }
      // Channel 3 — preparation could not parse it. Scanning the raw text is NOT the
      // conservative fallback it looks like: an unterminated `/*` above a live pin
      // leaves two real pins textually visible while neither executes, so a raw scan
      // produces WRONG ADVISORIES, which is the direction the consequence bound
      // forbids. Declining and saying so is the safe side (spec §8 item 15).
      const prepared = prepare(suitePath, raw);
      if (prepared.status !== "ok") {
        unreadable();
        continue;
      }

      for (const pin of discoverPins(suitePath, prepared.lines, dispositions)) {
        const identity = `${pin.path}\u0000${pin.title}`;
        if (reportedPins.has(identity)) continue;
        reportedPins.add(identity);
        // Naming is a VERBATIM SUBSTRING test (spec §8 item 7). A plan that paraphrases
        // a pin still draws; the advisory prints the exact string to include, so the
        // repair is a copy-paste and the failure direction is a nuisance line, never a
        // missed collision.
        if (documentText.includes(pin.title)) continue;
        findings.push({
          check: CHECK,
          code: "DECLARED_LIMIT_PIN_UNNAMED",
          severity: ADVISORY,
          docLine: anchorLine,
          column: 1,
          message: `${pin.path}:${pin.line} pins a declared limit that this plan does not name: "${pin.title}"`,
          detail: `surface ${id}; name it in the plan (retire it, or say it is left alone), or waive this advisory.`,
        });
      }
    }
  }
  return findings;
}

/**
 * Everything the arm needs, injected as ONE value so `runLint` grows one optional
 * parameter rather than three. A null/absent value means the arm runs nothing — the
 * same static/injected split the exec, parse, probe and fixture arms already use, which
 * keeps every existing caller compiling and byte-identical in behavior.
 *
 * `dispositions` and `prepareSuite` are optional because Task 5 wires INJECTION ONLY.
 * The adapter passes RAW suite lines here; real preparation is Task 7b's, and wiring it
 * early would turn that task's authored red green the moment it was written.
 */
export interface DeclaredLimitPinInputs {
  surfaces: readonly EnrolledSurface[];
  dispositions?: readonly PinDisposition[];
  prepareSuite?: SuitePreparer;
}

/** Identity preparation: the core scans exactly the lines the resolver returned. */
export const RAW_SUITE_PREPARER: SuitePreparer = (_path, lines) => ({ status: "ok", lines });

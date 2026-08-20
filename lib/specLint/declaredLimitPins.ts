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
  for (let i = 0; i < model.lines.length; i += 1) {
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;
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
    if (
      next < model.lines.length &&
      model.fencedInfo[next] === undefined &&
      UNORDERED_ITEM.test(model.lines[next]!)
    ) {
      const span = [i];
      for (let j = next; j < model.lines.length; j += 1) {
        if (model.fencedInfo[j] !== undefined) break;
        const item = model.lines[j]!;
        if (item.trim() === "") break; // first blank ends the run
        if (!UNORDERED_ITEM.test(item) && !INDENTED_CONTINUATION.test(item)) break;
        span.push(j);
      }
      declarations.push(span);
      continue;
    }

    // ANYTHING ELSE — an ordered run, a blank, a table, a fence — is DECLINED, and the
    // declaration is the header remainder alone (spec §8 items 11 and 14). Sampling the
    // 19 ordered runs shows their numbered items are as often TASK STEPS as files, so
    // the arm cannot classify one and declines rather than guessing. The failure
    // direction is a missed advisory, never a false one.
    declarations.push([i]);
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
  for (let from = 0; ; ) {
    const at = line.indexOf(path, from);
    if (at === -1) return false;
    const before = at > 0 ? line[at - 1]! : "";
    const after = at + path.length < line.length ? line[at + path.length]! : "";
    if (!PATH_CHAR.test(before) && !PATH_CHAR.test(after)) return true;
    from = at + 1;
  }
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

  for (const [id, anchorLine] of [...anchors].sort((a, b) => a[1] - b[1])) {
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

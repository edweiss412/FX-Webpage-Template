/**
 * tests/cross-cutting/psqlStartupFiles/scan.ts
 *
 * Static discovery for PSQL-STARTUP-FILE-NO-X-CLASSWIDE. Finds every `psql`
 * invocation in tracked non-docs source and reports whether it suppresses the
 * three startup files (`$PSQLRC`, `$HOME/.psqlrc`, the compiled-in system
 * psqlrc) that psql reads BEFORE anything on stdin or `-c`. Consumed by
 * `tests/cross-cutting/psqlStartupFileSuppression.test.ts`, which is where the
 * vector is written up.
 *
 * ── What is enforced ───────────────────────────────────────────────────────
 *
 * 1. JS/TS spawn family with a LITERAL binary — `execFileSync`/`execFile`/
 *    `spawnSync`/`spawn`, bare or as a member (`child_process.spawnSync`), whose
 *    argv[0] is `"psql"` or a path ending `/psql`. Parsed with the TypeScript
 *    AST, so prettier's multi-line opener (`execFileSync(\n  "psql",`) and
 *    interleaved comments cost nothing — no regex to outrun.
 * 2. JS/TS shell strings — `execSync("psql …")` / `exec("psql …")`, and the
 *    spawn family when argv[0] is a SHELL rather than psql
 *    (`spawnSync("sh", ["-c", "psql …"])`, `/bin/bash`, …), where every argv
 *    element is read as shell text. Template literals and `+` concatenations
 *    count: `` `psql ${dsn}` ``, `"psql " + dsn` and `` `${binDir}/psql` `` are
 *    read with each runtime piece standing in as an opaque word.
 * 3. `.sh` scripts — LEXED the way the shell lexes (see `lexShellWords`), then
 *    split into commands on operators. A command is a psql invocation when some
 *    word's basename is `psql`, unless the word before it is a probe or
 *    package-manager word (`-v` — which covers `command -v psql`, the CI
 *    availability check, ~14 occurrences in `.github/workflows/` — plus
 *    `which`, `type`, `hash`, `whereis`, `install`, `apt-get`, `echo`, …). That
 *    is a DENYLIST, not an allowlist of command-position prefixes: an allowlist
 *    has to enumerate every wrapper (`docker exec "$C"`, an UNQUOTED
 *    `docker exec $C`, `sudo`, `env`, `time`, `xargs`) and silently misses the
 *    one it forgot, which is the wrong failure mode for a security guard.
 * 4. Workflow YAML — the raw source slice of every `run:` scalar, scanned with
 *    the same shell reader, plus the DECODED scalar as a fallback when the raw
 *    slice yields nothing (a double-quoted scalar can spell the command
 *    `\\x70sql` or hide it behind an escaped newline). Both `run: |` blocks and
 *    quoted single-line `run: "psql …"`. A step `name:` that merely mentions
 *    psql is not a call site.
 *
 * The file list is a FILESYSTEM WALK from the repo root, not a hardcoded
 * roster: a psql site added in a brand-new directory fails by default. The
 * ratified `docs/**` exclusion is ROOT-relative (see IGNORED_AT_ROOT) — reading
 * it as a basename at every depth is what hid `tests/docs/**`, a real directory
 * of executable tests, from the scan entirely.
 *
 * ── Reading psql's option grammar ──────────────────────────────────────────
 *
 * See `argvSuppressesStartupFiles`. A membership test on the token list is
 * wrong in three directions, each confirmed against the installed binary: the
 * combined cluster `-qAtX` (which a substring match calls unprotected), an `X`
 * consumed as another option's ARGUMENT (`-FX`, `-F -X`), and a flag sitting
 * after the first positional, which `POSIXLY_CORRECT=1` discards entirely.
 *
 * ── What this guard IS, and what it is not ────────────────────────────────
 *
 * It is a REGRESSION NET for ordinary code: it makes an unprotected psql call
 * added in the normal course of work fail loudly, and it enforces the two
 * things that make `-X` actually work (a real flag, placed before the first
 * positional). It is NOT a security boundary against an author who is trying to
 * evade it — a static reader of two grammars cannot be, and pretending
 * otherwise would be the same overclaim that made earlier cuts of this file
 * wrong.
 *
 * Where it cannot read something it REFUSES TO CERTIFY rather than guessing, so
 * the failure mode is a loud message a human resolves. Ten rounds of
 * cross-model review drove that posture into the following, each verified
 * against the installed binary:
 *
 * • An expanded word is not its source spelling. `z=F; psql -${z}X` runs as
 *   `psql -FX`, where X is the field separator. Any token carrying `$`, and any
 *   argv element the AST cannot read, refuses to certify.
 * • argv position matters. Under `POSIXLY_CORRECT=1` getopt stops permuting at
 *   the first non-option, so a flag after the DSN is discarded — suppression is
 *   only credited before the first positional.
 * • psql's own option grammar decides what an `X` is: arg-taking shorts
 *   (`-FX`, `-F -X`), long options and their UNIQUE abbreviations (`--co -X`),
 *   and `--` end-of-options.
 *
 * Genuinely out of reach, with what backstops each:
 *
 * • A command word produced by EXPANSION (`$PG psql`, an alias). Lexical
 *   spellings ARE read — `p"s"ql`, `p\s\q\l`, a backslash-newline splice, a
 *   `/path/psql` — and so are `bash -c "…"`, `eval "…"`, `{ shell: true }`, and
 *   command substitutions. BACKSTOP: `scanBinaryIndirection`, which LEXES every
 *   string literal rather than requiring it to start with psql. An earlier cut
 *   did require that, and this file claimed it sufficed; review disproved the
 *   claim with five ordinary shapes at once (`sudo -u postgres psql …`,
 *   `PGHOST=… psql …`, `echo …\npsql …`, `true && psql …`, `cat … | psql …`).
 * • A command assembled with no surviving literal at all (`execSync(build())`,
 *   a name from config or env). Nothing static can see it. BACKSTOP: none —
 *   this is the acknowledged hole, and it is why `-X` is ALSO enforced by
 *   position at every real call site rather than only by this scan.
 * • Anything outside the scanned extensions — a Makefile, a package.json
 *   script. Checked at authoring time (2026-08-03): neither exists here. A new
 *   one would be invisible; extend SCANNED_EXTENSIONS with it.
 * • Deliberately adversarial spellings beyond the above. The lexer handles the
 *   ones review demonstrated, but the space is unbounded and this file does not
 *   claim to close it.
 *
 * ── Exemptions ─────────────────────────────────────────────────────────────
 *
 * A site may opt out with `psql-startup-files-ok: <reason>` in a comment on the
 * invocation line or the line above (`//` in JS/TS, `#` in shell/YAML). The
 * reason is mandatory — a bare marker does not exempt — and BOTH the marker and
 * its reason must sit inside an actual COMMENT. Two review probes drove that:
 * `psql … ; x="psql-startup-files-ok: unrelated value"` past an earlier cut that
 * matched the marker anywhere on the line, turning a data value into a silent
 * exemption; and a bare marker inside a CLOSED block comment, immediately
 * followed on the same line by `execFileSync("psql", …)`, past a later cut that
 * took the reason to end-of-line — letting the statement itself serve as the
 * justification. The reason is now clamped to the end of the containing comment
 * range.
 * No site in the tree uses one: `scripts/ci/supabase-local-bootstrap.sh` was the candidate (it runs psql
 * via `docker exec` inside the supabase_db container, where HOME is the
 * container's, not the runner's) and took a plain inline `-X` instead, because
 * a mounted or image-baked psqlrc is exactly as invisible there and `-X` costs
 * nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { parseDocument, visit, isPair, isScalar, type Node as YamlNode } from "yaml";

export const EXEMPTION_MARKER = "psql-startup-files-ok:";

export type PsqlSiteForm = "execFileSync" | "execFile" | "spawnSync" | "spawn" | "shell";

/**
 * Stands in for an argv element the AST could not read (an identifier, a
 * spread, a call, a conditional). It is NOT dropped: `execFileSync("psql",
 * [dsn, "-X"])` recovers tokens `["-X"]` if you drop it, and the analyzer then
 * certifies a call whose `-X` sits AFTER the positional DSN — exactly the
 * POSIXLY_CORRECT defect, reintroduced through token recovery. Rendering it as
 * a positional makes the analyzer stop there, which is the conservative and
 * correct reading: the guard cannot know it is not the DSN.
 */
export const DYNAMIC_TOKEN = "<dynamic>";

export type PsqlSite = {
  /** Repo-relative, POSIX separators. */
  file: string;
  /** 1-indexed line carrying the `psql` command token. */
  line: number;
  /** Offset of the `psql` command word within the scanned text. Only meaningful
   * for shell scans, where a COMPOSED JS string has to map a position back to
   * the physical source line the characters came from — line-quantised mapping
   * put two concatenation fragments sharing one composed line on the same
   * physical line, which is not where either of them is. */
  offset: number;
  form: PsqlSiteForm;
  /** Literal argv tokens recovered; non-literal elements are dropped. */
  tokens: string[];
  /** Words before the command word in the same command (`sudo -u postgres`).
   * Lets a caller tell a real wrapper prefix from English prose. */
  precedingWords: string[];
  /** True when the site was found INSIDE a command substitution rather than at
   * the top level of the text. */
  nested: boolean;
  /** True when that substitution was spelled with BACKTICKS. Load-bearing for
   * the indirection tripwire, and only for backticks: in operator-guidance
   * prose a backtick is a markdown code span, not a shell substitution, and
   * `via \`psql "$DSN" -f <migration>\`` is documentation. `$(…)` carries no
   * such ambiguity — gating it on the outer head word hid every ordinary
   * `jq -n --arg rows "$(psql -qAt mydb)"`. */
  nestedInBacktick: boolean;
  /** True when an element could not be read statically (spread, identifier, …). */
  hasDynamicTokens: boolean;
  suppressesStartupFiles: boolean;
  exemptReason: string | null;
};

export type IndirectionHit = { file: string; line: number; text: string };

export type PsqlUsage = {
  sites: PsqlSite[];
  indirections: IndirectionHit[];
  /** Repo-relative paths the walk could not read. A non-empty list means the
   * census is INCOMPLETE and the meta-test fails — see `walk`. */
  unreadable: string[];
  filesScanned: number;
};

const SPAWN_CALLEES = new Set<PsqlSiteForm>(["execFileSync", "execFile", "spawnSync", "spawn"]);
const SHELL_CALLEES = new Set(["execSync", "exec"]);

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"];
const SHELL_EXTENSIONS = [".sh", ".bash"];
const YAML_EXTENSIONS = [".yml", ".yaml"];
const SCANNED_EXTENSIONS = [...JS_EXTENSIONS, ...SHELL_EXTENSIONS, ...YAML_EXTENSIONS];

/**
 * The guard's own two files. They hold `"psql"` literals (the binary-name
 * comparison) and dozens of psql command-line FIXTURES that are not call sites,
 * and would otherwise trip the indirection tripwire on the guard itself.
 * Excluded from indirection scanning only — both are still walked and still
 * scanned for call sites, and neither has one.
 */
const SELF = [
  "tests/cross-cutting/psqlStartupFiles/scan.ts",
  "tests/cross-cutting/psqlStartupFileSuppression.test.ts",
];

/** Directories the walk never descends into. `docs` is deliberate: spec and
 * plan prose quotes `execFileSync("psql", …)` and is not a call site. */
const IGNORED_ANYWHERE = new Set([".git", "node_modules", "__generated__"]);

/**
 * Skipped only at the REPO ROOT. Matching these by basename at every depth is
 * what hid `tests/docs/**` — five real test files — from the scan entirely, and
 * would equally hide a nested `build`/`dist`/`out`. The ratified exclusion is
 * `docs/**`, which is root-relative.
 */
const IGNORED_AT_ROOT = new Set([
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "dist",
  "build",
  "out",
  "docs",
  "playwright-report",
  "test-results",
]);

// ── flag clusters ────────────────────────────────────────────────────────

/**
 * True when `token` is a psql flag that suppresses startup-file reads: a
 * single-dash cluster containing `X` (`-X`, `-qAtX`, `-XqAt`), or the long form
 * `--no-psqlrc`.
 */
export function tokenSuppressesStartupFiles(token: string): boolean {
  if (token === "--no-psqlrc") return true;
  if (!/^-[A-Za-z]+$/.test(token)) return false;
  return token.slice(1).includes("X");
}

/** psql short options that CONSUME the next argument (`psql --help`). An `X`
 * sitting in that slot is a value, not a flag. */
const SHORT_WITH_ARG = new Set(["c", "d", "f", "v", "L", "o", "F", "P", "R", "T", "h", "p", "U"]);

/** Every long option psql accepts, so an abbreviation can be resolved. */
const ALL_LONG_OPTIONS = [
  "--command",
  "--dbname",
  "--file",
  "--list",
  "--set",
  "--variable",
  "--version",
  "--no-psqlrc",
  "--help",
  "--echo-all",
  "--echo-errors",
  "--echo-queries",
  "--echo-hidden",
  "--log-file",
  "--no-readline",
  "--output",
  "--quiet",
  "--single-step",
  "--single-line",
  "--no-align",
  "--field-separator",
  "--html",
  "--pset",
  "--record-separator",
  "--tuples-only",
  "--table-attr",
  "--expanded",
  "--field-separator-zero",
  "--record-separator-zero",
  "--host",
  "--port",
  "--username",
  "--no-password",
  "--password",
  "--csv",
];

/**
 * Resolve a long option the way getopt_long does: an exact match, or a prefix
 * that is UNAMBIGUOUS. `psql --co -X` errors "option `--co\' requires an
 * argument" and then consumes `-X` as the command — so an abbreviation that the
 * guard read as an unknown flag would certify a call that suppresses nothing.
 */
function resolveLongOption(name: string): string | null {
  if (ALL_LONG_OPTIONS.includes(name)) return name;
  const matches = ALL_LONG_OPTIONS.filter((option) => option.startsWith(name));
  return matches.length === 1 ? matches[0]! : null;
}

/** The long spellings of the same, in their separated (`--field-separator X`)
 * form. The `--opt=value` form carries its own argument and is not listed. */
const LONG_WITH_ARG = new Set([
  "--command",
  "--dbname",
  "--file",
  "--set",
  "--variable",
  "--log-file",
  "--output",
  "--field-separator",
  "--pset",
  "--record-separator",
  "--table-attr",
  "--host",
  "--port",
  "--username",
]);

/**
 * Does this argv actually suppress startup-file reads?
 *
 * A membership test on the token list is not enough — three probe-backed ways it
 * gets the answer wrong, all found in cross-model review:
 *
 * 1. **`X` consumed as another option's argument.** `psql -F` errors with
 *    "option requires an argument -- F"; `psql -FX` and `psql -F -X` both
 *    connect, because `X` IS the field separator. Neither suppresses anything.
 * 2. **`X` after `--`.** Everything past `--` is positional.
 * 3. **`-X` after the DSN, under `POSIXLY_CORRECT=1`.** GNU getopt stops
 *    permuting at the first non-option, so `psql <DSN> -X …` reads `-X` as the
 *    positional USERNAME and ignores every flag after it:
 *
 *        $ POSIXLY_CORRECT=1 psql 'postgresql://…' -X -v ON_ERROR_STOP=1 -qAt -c 'select 42'
 *        psql: warning: extra command-line argument "-v" ignored
 *        …
 *
 *    Startup files stay ENABLED. So suppression is only real when it appears
 *    before the first positional argument — which is why every call site in this
 *    repo passes its flags first and the DSN last.
 */
export function argvSuppressesStartupFiles(tokens: readonly string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    // A word containing an expansion is NOT its source spelling: `-${z}X` with
    // z=F expands to `-FX`, where X is the field separator and suppresses
    // nothing (verified: `z=F; psql -${z}X --version` runs as `psql -FX`).
    // Unreadable means uncertifiable.
    if (token.includes("$") || token === DYNAMIC_TOKEN) return false;
    if (token === "--") return false; // rest is positional
    if (token.startsWith("--")) {
      const spelled = token.split("=", 1)[0]!;
      const name = resolveLongOption(spelled) ?? spelled;
      if (name === "--no-psqlrc") return true;
      if (LONG_WITH_ARG.has(name) && !token.includes("=")) i++; // eats the next token
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      for (const letter of token.slice(1)) {
        if (letter === "X") return true;
        if (SHORT_WITH_ARG.has(letter)) break; // rest of the cluster is its value
      }
      // A trailing arg-taking letter with nothing after it eats the next token.
      const last = token.at(-1)!;
      if (SHORT_WITH_ARG.has(last)) i++;
      continue;
    }
    // A positional argument (DBNAME, then USERNAME). Under POSIXLY_CORRECT this
    // ends option parsing, so anything after it cannot be relied on.
    return false;
  }
  return false;
}

// ── exemption markers ────────────────────────────────────────────────────

/**
 * Where a comment starts on `line`, or -1. The marker only exempts from INSIDE a
 * comment: a review probe drove `psql … ; x="psql-startup-files-ok: unrelated
 * value"` past the guard, because a plain indexOf cannot tell a comment from a
 * string that happens to contain the marker. An exemption is a deliberate,
 * reviewable act — a data value must never grant one.
 */
/**
 * Comment-start index for EVERY line, computed with quote state carried ACROSS
 * lines. A per-line scan cannot see that a line sits inside a string opened
 * earlier, so a `#` (or `//`) on a continuation line looks like a comment and
 * grants an exemption from string data — an R3 probe did exactly that with a
 * multi-line shell string. Both grammars get the same treatment.
 */
/**
 * JS/TS comment starts, from the TypeScript SCANNER rather than a hand-rolled
 * reader. Hand-rolling repeatedly got string state wrong — a nested template
 * backtick was read as closing the outer template, and JSX text was read as
 * code, each turning `//` string data into a "comment" that granted an
 * exemption. The compiler already knows exactly where comments are; asking it
 * removes the entire class rather than the two instances review happened to
 * find.
 */
function jsCommentRangesPerLine(text: string, file: string): CommentRanges {
  const lines = text.split("\n");
  const out: CommentRanges = lines.map(() => []);
  const sourceFile = parseJs(text, file);

  const record = (pos: number, end: number): void => {
    const from = sourceFile.getLineAndCharacterOfPosition(pos);
    const to = sourceFile.getLineAndCharacterOfPosition(end);
    if (from.line === to.line) {
      out[from.line]!.push([from.character, to.character]);
      return;
    }
    out[from.line]!.push([from.character, Infinity]);
    for (let l = from.line + 1; l < to.line && l < out.length; l++) out[l]!.push([0, Infinity]);
    if (to.line < out.length) out[to.line]!.push([0, to.character]);
  };

  // Only at STATEMENT boundaries. getLeading/TrailingCommentRanges are text
  // scanners, not AST-aware: called at an arbitrary node end they will read the
  // `//` inside JSX text as a comment. Statement boundaries are genuine trivia
  // positions, and an exemption marker is by definition either on its own line
  // before a statement or trailing one.
  const seen = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (ts.isStatement(node)) {
      for (const ranges of [
        ts.getLeadingCommentRanges(text, node.getFullStart()),
        ts.getTrailingCommentRanges(text, node.getEnd()),
      ]) {
        for (const range of ranges ?? []) {
          if (seen.has(range.pos)) continue;
          seen.add(range.pos);
          record(range.pos, range.end);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

type CommentRanges = Array<Array<[number, number]>>;

function commentIndexPerLine(text: string, style: CommentStyle): CommentRanges {
  const lines = text.split("\n");
  const out: CommentRanges = [];
  let carriedQuote: string | null = null;
  let inBlockComment = false;

  for (const line of lines) {
    if (inBlockComment) {
      const close = line.indexOf("*/");
      if (close === -1) {
        out.push([[0, Infinity]]); // the whole line is inside a block comment
        continue;
      }
      inBlockComment = false;
      // Anything after the close is ordinary code; fall through and rescan it.
    }
    let quote: string | null = carriedQuote;
    let found = -1;
    for (let i = 0; i < line.length; i++) {
      const character = line[i]!;
      // JS honours a backslash escape inside single quotes; POSIX shell does not.
      if (character === "\\" && (style === "js" || quote !== "'")) {
        i++;
        continue;
      }
      if (quote !== null) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || (style === "js" && character === "`")) {
        quote = character;
        continue;
      }
      if (style === "hash") {
        if (character === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
          found = i;
          break;
        }
      } else if (character === "/" && line[i + 1] === "/") {
        found = i;
        break;
      } else if (character === "/" && line[i + 1] === "*") {
        const close = line.indexOf("*/", i + 2);
        if (close === -1) {
          found = i;
          inBlockComment = true;
          break;
        }
        // A block comment that CLOSES on this line does not make the REST of
        // the line comment-qualified; skip it and keep scanning.
        i = close + 1;
      }
    }
    // In SHELL, a single- or double-quoted string spans newlines, so the quote
    // state carries. In JS only a template literal does. Resetting shell quotes
    // at the newline let a marker in string data on the PRECEDING line grant an
    // exemption — the R3 regression test missed it by leaving a closing line in
    // between, which is why the adjacency case is now covered explicitly.
    carriedQuote = style === "hash" ? quote : quote === "`" ? "`" : null;
    out.push(found === -1 ? [] : [[found, Infinity]]);
  }
  return out;
}

type CommentStyle = "js" | "hash";

function exemptionOnLines(
  lines: readonly string[],
  lineNumber: number,
  commentAt: CommentRanges,
): string | null {
  for (const index of [lineNumber - 1, lineNumber - 2]) {
    const candidate = lines[index];
    if (candidate === undefined) continue;
    const at = candidate.indexOf(EXEMPTION_MARKER);
    if (at === -1) continue;
    // CONTAINMENT, not "after a comment started": `/* x */ const s = "// …"`
    // has a real comment on the line, and the marker is not inside it.
    const inside = (commentAt[index] ?? []).find(([from, to]) => at >= from && at < to);
    if (!inside) continue;
    // The reason must be INSIDE the comment too. Slicing to end-of-line let
    // `/* psql-startup-files-ok: */ execFileSync("psql", …)` adopt its own
    // statement as the "reason" — a bare marker exempting a live call, which is
    // exactly what requiring a reason is supposed to prevent.
    const reason = candidate
      .slice(at + EXEMPTION_MARKER.length, inside[1] === Infinity ? undefined : inside[1])
      .replace(/\*\/\s*$/, "")
      .trim();
    if (reason.length > 0) return reason;
  }
  return null;
}

// ── shell reading ────────────────────────────────────────────────────────

/**
 * ── The shell layer is a LEXER, not a line slicer ─────────────────────────
 *
 * Successive review rounds each found another way a regex over raw text
 * disagreed with what the shell actually passes to psql:
 *
 *   -F" -X"        one argv word `-F -X`, but split into two apparent options
 *   -F\ -X         same, via an escaped space
 *   -F 2>err -X    the shell REMOVES the redirection, so -F swallows -X
 *   psql -qAt \ # …   `\` + space is NOT a continuation; the next line is a
 *                     separate command that carries the -X
 *   p"s"ql, p\s\q\l   ordinary lexical spellings of the command word
 *   /opt/psql-X/bin/psql   an earlier `psql` inside the PATH
 *
 * They are one defect: the scanner was reading text where the shell reads
 * WORDS. `lexShellWords` performs the word splitting, quote removal, escape
 * processing, redirection removal and operator recognition that the shell does
 * before argv exists, and everything downstream consumes words.
 */
type ShellWord = {
  text: string;
  line: number;
  offset: number;
  /** Raw index in the scanned text for EACH character of `text`. Quoting and
   * escaping mean the word's characters are not contiguous with its start —
   * adding an offset measured in the quote-stripped script to the opening
   * quote's index undercounts every delimiter, which is how a `bash -c` script
   * mapped its psql onto the PRECEDING physical line and inherited an
   * exemption written for an unrelated call. */
  offsets: number[];
  operator: boolean;
};

const OPERATOR_STARTS = new Set([";", "&", "|", "(", ")", "\n"]);

/** A file descriptor sitting in front of a redirection operator: a plain number
 * (`2>err`) or bash's dynamic form (`{fd}>err`, which assigns the fd to `fd`).
 * Neither reaches argv. */
const FD_PREFIX = /^(?:\d+|\{[A-Za-z_]\w*\})$/;

/** Index of the closing delimiter matching the opener at `start`. */
function matchBrace(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const character = text[i]!;
    if (character === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    // A `)` inside quotes is DATA — `$(echo ")"; psql …)` closes at the last
    // paren, not the quoted one, and treating it as the close made every later
    // invocation in the substitution invisible.
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === open) depth++;
    else if (character === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

type NestedShell = { text: string; line: number; offset: number; backtick: boolean };

function lexShellWords(text: string, nested: NestedShell[] = []): ShellWord[] {
  const words: ShellWord[] = [];
  let buffer = "";
  let bufferOffsets: number[] = [];
  let started = false;
  let startLine = 0;
  let startOffset = 0;
  let line = 0;
  /** Redirections and their targets never reach argv. */
  let dropWord = false;

  const flush = (): void => {
    if (started) {
      if (!dropWord)
        words.push({
          text: buffer,
          line: startLine,
          offset: startOffset,
          offsets: bufferOffsets,
          operator: false,
        });
      dropWord = false;
    }
    buffer = "";
    bufferOffsets = [];
    started = false;
  };
  const begin = (index: number): void => {
    if (!started) {
      started = true;
      startLine = line;
      startOffset = index;
      buffer = "";
      bufferOffsets = [];
    }
  };
  /** Append to the current word, recording where each character came from. */
  const append = (piece: string, at: number): void => {
    buffer += piece;
    for (let k = 0; k < piece.length; k++) bufferOffsets.push(at);
  };

  for (let i = 0; i < text.length; i++) {
    const character = text[i]!;

    if (character === "\\") {
      const next = text[i + 1];
      if (next === "\n") {
        // A backslash IMMEDIATELY followed by the newline is a continuation:
        // the word (if any) keeps going. Whitespace in between is not.
        line++;
        i++;
        continue;
      }
      if (next !== undefined) {
        begin(i);
        append(next, i + 1);
        i++;
        continue;
      }
      continue;
    }

    // `$(...)`, `` `...` ``, `<(...)` and `>(...)` all EXECUTE their body, so
    // the body is scanned as shell text in its own right. `${...}` is an
    // expansion, not execution: it is consumed whole so brace-protected
    // whitespace cannot split a redirection target into a phantom argv word.
    if (character === "$" && text[i + 1] === "{") {
      begin(i);
      const close = matchBrace(text, i + 1, "{", "}");
      const slice = text.slice(i, close + 1);
      // …but the expansion's OPERAND executes: `${RESULT:-$(psql …)}` runs psql
      // whenever RESULT is unset, and the same holds for every default /
      // assign / alternate / error form (`:-` `-` `:=` `=` `:+` `+` `:?` `?`,
      // and the pattern operands of `#` `%` `/`). Consuming the expansion whole
      // made all of them invisible. Re-lex the body so nested substitutions are
      // still collected — the expansion itself stays ONE opaque word, which is
      // the property the whole-consumption exists to preserve.
      const inner: NestedShell[] = [];
      lexShellWords(text.slice(i + 2, close), inner);
      for (const entry of inner)
        nested.push({
          text: entry.text,
          line: line + entry.line,
          offset: i + 2 + entry.offset,
          backtick: entry.backtick,
        });
      append(slice, i);
      line += (slice.match(/\n/g) ?? []).length;
      i = close;
      continue;
    }
    if (
      (character === "$" && text[i + 1] === "(") ||
      character === "`" ||
      ((character === "<" || character === ">") && text[i + 1] === "(")
    ) {
      const isBacktick = character === "`";
      const open = isBacktick ? i : i + 1;
      const close = isBacktick
        ? text.indexOf("`", i + 1) === -1
          ? text.length
          : text.indexOf("`", i + 1)
        : matchBrace(text, open, "(", ")");
      nested.push({
        text: text.slice(open + 1, close),
        line,
        offset: open + 1,
        backtick: isBacktick,
      });
      line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
      // The substitution stands in as an opaque word so surrounding argv is
      // still read correctly.
      begin(i);
      append("${}", i);
      i = close;
      continue;
    }

    // ANSI-C (`$'…'`) and locale (`$"…"`) quoting are ordinary quoted words.
    if (character === "$" && (text[i + 1] === "'" || text[i + 1] === '"')) {
      continue; // the quote itself is handled on the next iteration
    }

    if (character === "'") {
      begin(i);
      const close = text.indexOf("'", i + 1);
      const body = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
      for (let k = 0; k < body.length; k++) append(body[k]!, i + 1 + k);
      line += (body.match(/\n/g) ?? []).length;
      i = close === -1 ? text.length : close;
      continue;
    }

    if (character === '"') {
      begin(i);
      i++;
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\" && text[i + 1] !== undefined) {
          i++;
          if (text[i] === "\n") line++; // a continuation still eats a line
          append(text[i]!, i);
          continue;
        }
        // `"$(psql …)"` and "`psql …`" still EXECUTE inside double quotes.
        if (text[i] === "$" && text[i + 1] === "(") {
          const close = matchBrace(text, i + 1, "(", ")");
          nested.push({ text: text.slice(i + 2, close), line, offset: i + 2, backtick: false });
          // A MULTILINE substitution consumes physical lines; not counting them
          // reported later invocations one line early, which let them inherit a
          // marker comment written for something else.
          line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
          append("${}", i);
          i = close;
          continue;
        }
        if (text[i] === "`") {
          const close = text.indexOf("`", i + 1);
          const end = close === -1 ? text.length : close;
          nested.push({ text: text.slice(i + 1, end), line, offset: i + 1, backtick: true });
          line += (text.slice(i, end + 1).match(/\n/g) ?? []).length;
          append("${}", i);
          i = end;
          continue;
        }
        if (text[i] === "\n") line++;
        append(text[i]!, i);
      }
      continue;
    }

    if (character === "#" && !started) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }

    if (character === "\n") {
      flush();
      words.push({ text: "\n", line, offset: i, offsets: [i], operator: true });
      line++;
      continue;
    }

    if (/\s/.test(character)) {
      flush();
      continue;
    }

    // Redirections: an optional fd, the operator, and an optionally ATTACHED
    // target. The shell strips all of it, so neither reaches argv.
    //
    // `<` and `>` are METACHARACTERS: they terminate whatever word is being
    // accumulated, they do not join it. Gating this branch on "no word in
    // progress" made `psql -F>/dev/null -X mydb` read as the single token
    // `-F>/dev/null` followed by a standalone `-X` — a FALSE SAFE, since bash
    // removes the redirection and psql really receives `-F -X mydb`, where
    // `-X` is the field separator.
    if (!started || FD_PREFIX.test(buffer) || character === "<" || character === ">") {
      // Longest-first: `<<<` before `<<`, `<>` and `>|` before the bare forms,
      // or the shorter match leaves a stray `<`/`>` that reads as a SECOND
      // redirection and eats the following argv word.
      const redirection = /^(?:&>>|&>|<<<|<<-|<<|>>|>&|<&|<>|>\||[<>])/.exec(text.slice(i));
      if (redirection && (character === "<" || character === ">" || character === "&")) {
        const isBackgroundAmp = character === "&" && text[i + 1] !== ">";
        if (!isBackgroundAmp) {
          // A pending FD buffer belongs to this redirection (`2>err`, and
          // bash's dynamic `{fd}>err`), not to argv — discard it rather than
          // emitting it as a token. Missing `{fd}` was a FALSE SAFE: bash
          // removes the whole redirection, so `psql -F {fd}>/dev/null -X mydb`
          // really runs as `-F -X mydb`, where `-X` is the field separator and
          // suppresses nothing — while the scanner consumed the phantom word as
          // `-F`'s value and certified the `-X` behind it.
          if (!FD_PREFIX.test(buffer)) flush();
          buffer = "";
          bufferOffsets = [];
          started = false;
          i += redirection[0].length - 1;
          // An attached target follows immediately; otherwise the next word is
          // the target and is dropped when it is flushed.
          const rest = text.slice(i + 1);
          const attached = /^(?:\$\{[^}]*\}|"[^"]*"|'[^']*'|\\.|[^\s;&|()<>])+/.exec(rest);
          if (attached) i += attached[0].length;
          else dropWord = true;
          continue;
        }
      }
    }

    if (OPERATOR_STARTS.has(character)) {
      flush();
      const two = text.slice(i, i + 2);
      const operator = two === "&&" || two === "||" ? two : character;
      words.push({
        text: operator,
        line,
        offset: i,
        offsets: [...operator].map((_, k) => i + k),
        operator: true,
      });
      i += operator.length - 1;
      continue;
    }

    begin(i);
    append(character, i);
  }
  flush();
  return words;
}

/** The command word, with any directory prefix removed. */
function basename(word: string): string {
  return word.slice(word.lastIndexOf("/") + 1);
}

/** argv[0] values whose FLAGS may also deny (`command -v psql`). */
const PROBE_COMMANDS = new Set(["command", "which", "type", "hash", "whereis", "apt-get", "apt"]);

/** Preceding words that make `psql` an argument rather than the command:
 * availability probes and package tooling. Only honored at command position —
 * see the call site. */
const NOT_AN_INVOCATION = new Set([
  "-v",
  "-V",
  // NOT `-p`: `command -p psql …` RUNS psql with the default PATH; it does not
  // inspect it. `command -v psql` remains denied, which is the CI probe.
  "which",
  "type",
  "whereis",
  "hash",
  "install",
  "apt-get",
  "apt",
  "yum",
  "dnf",
  "apk",
  "brew",
  "echo",
  "printf",
]);

/**
 * Index of the `#` that starts a comment, ignoring `#` inside quotes, or -1.
 * Backslash escapes are honored inside double quotes (and unquoted), because a
 * review probe used `\"` to close a string the scanner still thought was open,
 * which made the rest of the line look like a comment and granted an exemption
 * from a data value. Single quotes take no escapes, per POSIX.
 */
/**
 * Scan shell text (a `.sh` file, or the raw slice of a workflow `run:` scalar).
 * `lineOffset` is added to the 0-indexed line within `text`.
 */
/**
 * Find every psql invocation in shell text. Word-level throughout: the text is
 * lexed the way the shell lexes it, split into commands on operators, and each
 * command's argv is what psql would actually receive.
 */
function scanShellText(text: string, file: string, lineOffset: number): PsqlSite[] {
  const rawLines = text.split("\n");
  const commentAt = commentIndexPerLine(text, "hash");
  const sites: PsqlSite[] = [];

  const nestedBodies: NestedShell[] = [];
  const words = lexShellWords(text, nestedBodies);
  for (const inner of nestedBodies) {
    for (const site of scanShellText(inner.text, file, lineOffset + inner.line))
      sites.push({
        ...site,
        // `inner.text` is a raw SLICE of this text, so its indices are simply
        // shifted; no quote stripping happened between them.
        offset: inner.offset + site.offset,
        nested: true,
        // Backtick-ness is inherited: a `$(…)` inside a backtick span is still
        // inside the markdown-ambiguous region.
        nestedInBacktick: inner.backtick || site.nestedInBacktick,
      });
  }
  let command: ShellWord[] = [];
  const commands: ShellWord[][] = [];
  for (const word of words) {
    if (word.operator) {
      if (command.length > 0) commands.push(command);
      command = [];
      continue;
    }
    command.push(word);
  }
  if (command.length > 0) commands.push(command);

  for (const argv of commands) {
    // `bash -c "psql …"`, `sh -lc "…"`, `docker exec … sh -c "…"`, `eval "…"`,
    // and the other ordinary command-STRING consumers: `su - postgres -c "…"`,
    // `runuser -u postgres -c "…"`, `env -S "…"`, `ssh host "…"`, `watch "…"`.
    // The quoted script EXECUTES; scanning it is not optional. This list is an
    // ALLOWLIST by necessity — knowing WHICH argument is a script requires
    // knowing the program — and is therefore inherently incomplete; the
    // indirection tripwire is the backstop on the JS side.
    for (const [position, word] of argv.entries()) {
      const name = basename(word.text);
      const isInterpreter = SHELL_BINARIES.has(name) || DASH_C_CONSUMERS.has(name);
      const isEval = name === "eval";
      const isDashS = name === "env";
      // The long-option branch below also fires for `su`/`runuser`, which are in
      // DASH_C_CONSUMERS, and for `env` via isDashS.
      // `ssh host "psql …"` and `watch "psql …"` name no flag: the script is
      // simply a later word that is itself a command line.
      const isTrailing = TRAILING_SCRIPT_CONSUMERS.has(name);
      if (!isInterpreter && !isEval && !isDashS && !isTrailing) continue;
      if (isTrailing) {
        // Scan EVERY whitespace-bearing word after the program, skipping option
        // values. Taking the first one and stopping mistook an ordinary
        // `-o "ProxyCommand=nc %h %p"` for the remote command and never reached
        // the real `ssh host "psql …"` behind it.
        for (let i = position + 1; i < argv.length; i++) {
          const candidate = argv[i]!;
          if (!/\s/.test(candidate.text)) continue;
          if (candidate.text.startsWith("-")) continue; // `-oProxyCommand=…`
          const previous = argv[i - 1]?.text ?? "";
          if (SSH_ARG_FLAGS.test(previous)) continue; // `-o` + its separate value
          for (const site of scanShellText(candidate.text, file, lineOffset + candidate.line))
            sites.push({ ...site, offset: candidate.offsets[site.offset] ?? candidate.offset });
        }
        continue;
      }
      for (let i = position + 1; i < argv.length; i++) {
        const candidate = argv[i]!;
        // `sh -ce`, `-cu`, `-cv`, `-cx` all execute the next word; requiring `c`
        // to be LAST missed every cluster with an option after it.
        // Long spellings are documented options, not exotica:
        // `su --command=…` / `--session-command=…`, `runuser` likewise, and
        // `env --split-string=…`. Both `=value` and separate-word forms.
        const longScript = /^--(?:command|session-command|split-string)(=|$)/.exec(candidate.text);
        if (longScript) {
          if (longScript[1] === "=") {
            const attached = candidate.text.slice(candidate.text.indexOf("=") + 1);
            for (const site of scanShellText(attached, file, lineOffset + candidate.line))
              sites.push({ ...site, offset: candidate.offset });
            break;
          }
          const next = argv[i + 1];
          if (next !== undefined)
            for (const site of scanShellText(next.text, file, lineOffset + next.line))
              sites.push({ ...site, offset: next.offsets[site.offset] ?? next.offset });
          break;
        }
        if (isInterpreter && !/^-[a-z]*c[a-z]*$/.test(candidate.text)) continue;
        if (isDashS && !/^-[a-zA-Z]*S/.test(candidate.text)) continue;
        // `bash -c -- 'psql …'` is valid: `--` ends option parsing and the
        // script is the NEXT word. Taking `--` as the script scanned nothing.
        let scriptIndex = isEval ? i : i + 1;
        // `env -S'psql …'` attaches the script to the flag itself.
        if (isDashS && candidate.text.length > 2 && /^-[a-zA-Z]*S./.test(candidate.text)) {
          const attached = candidate.text.slice(candidate.text.indexOf("S") + 1);
          for (const site of scanShellText(attached, file, lineOffset + candidate.line))
            sites.push({ ...site, offset: candidate.offset });
          break;
        }
        if (argv[scriptIndex]?.text === "--") scriptIndex++;
        const script = argv[scriptIndex];
        if (script === undefined) break;
        for (const site of scanShellText(script.text, file, lineOffset + script.line))
          sites.push({
            // The script word was QUOTE-STRIPPED, so its characters are not
            // contiguous with its start. Map through the per-character index
            // the lexer recorded; adding a stripped-text offset to the opening
            // quote's index undercounts every delimiter and landed psql on the
            // preceding physical line.
            ...site,
            offset: script.offsets[site.offset] ?? script.offset,
          });
        break;
      }
    }

    const index = argv.findIndex((word) => basename(word.text) === "psql");
    if (index === -1) continue;
    // The denylist decides whether psql is the COMMAND or an argument to a
    // probe, so it may only fire when the deny word is itself argv[0] (`which
    // psql`) or is a flag of an argv[0] probe (`command -v psql`). Matching any
    // preceding word discarded real invocations under a wrapper -- `env -u echo
    // psql …` runs psql, and so does `xargs -I -v psql …`.
    const previous = argv[index - 1];
    const head = argv[0];
    const denied =
      previous !== undefined &&
      NOT_AN_INVOCATION.has(previous.text) &&
      (previous === head || (head !== undefined && PROBE_COMMANDS.has(basename(head.text))));
    if (denied) continue;

    const rest = argv.slice(index + 1);
    const tokens = rest.map((word) => word.text);
    const hit = argv[index]!;
    sites.push({
      file,
      line: hit.line + lineOffset + 1,
      offset: hit.offset,
      form: "shell",
      tokens,
      precedingWords: argv.slice(0, index).map((word) => word.text),
      nested: false,
      nestedInBacktick: false,
      hasDynamicTokens: tokens.some((token) => token.includes("$")),
      suppressesStartupFiles: argvSuppressesStartupFiles(tokens),
      exemptReason: exemptionOnLines(rawLines, hit.line + 1, commentAt),
    });
  }
  return sites;
}

/** True when a JS/TS string literal is itself a shell command line running psql. */
function shellStringSites(
  composed: Composed,
  file: string,
  lines: string[],
  commentAt: CommentRanges,
): PsqlSite[] {
  // The psql word's own OFFSET in the composed value maps back to the physical
  // line its characters came from. Deriving the line arithmetically from the
  // expression's opening line plus its span was wrong in all three directions
  // review probed — a later concatenation fragment, an interpolation in a
  // multi-line template, and a cooked `\n` in a literal that spans physical
  // lines — and mapping by composed LINE is still wrong, because two fragments
  // on different physical lines can share one composed line.
  return scanShellText(composed.text, file, 0).map((site) => {
    const actualLine = (composed.lineAt[site.offset] ?? composed.lineAt[0] ?? 0) + 1;
    return {
      ...site,
      line: actualLine,
      // An INEXACT map may point at a line whose comment belongs to something
      // else, so no exemption is granted at all. Failing closed here is the
      // whole reason the flag exists: the alternative is a site silently
      // exempted by a marker written for its neighbour.
      exemptReason: composed.exact ? exemptionOnLines(lines, actualLine, commentAt) : null,
    };
  });
}

// ── JS/TS ────────────────────────────────────────────────────────────────

function calleeName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * The text of a string-ish expression, with every runtime piece replaced by a
 * placeholder word. Covers `` `psql ${dsn}` ``, `"psql " + dsn` and
 * `` `${binDir}/psql` `` — all three of which a literal-only reader saw as
 * nothing at all, while the header claimed the indirection tripwire caught
 * them. It did not: the literal is `psql ` or a template head, never exactly
 * `"psql"`.
 */
/**
 * A composed string plus a PER-CHARACTER physical line map. Deriving the line
 * from the expression's opening line plus its total span was wrong in all three
 * directions review probed: a later concatenation fragment, an interpolation in
 * a multi-line template, and a cooked `\n` inside a literal that itself spans
 * physical lines. A wrong line is not cosmetic — `exemptionOnLines` reads the
 * reported line, so it could match a marker written for a different statement.
 */
type Composed = {
  text: string;
  lineAt: number[];
  /** False when some fragment's raw source could not be walked through JS's
   * escape grammar. The reported line is then a best effort, and exemption
   * lookup is SKIPPED so an unrelated marker cannot exempt this site. */
  exact: boolean;
};

/**
 * The physical line each character of `cooked` came from, by walking `raw`
 * through JS's string-escape grammar. `raw` includes its delimiters.
 * Returns null when the walk does not reproduce `cooked` exactly, which is the
 * signal to stop trusting the mapping rather than to guess one.
 */
function mapRawToLines(raw: string, cooked: string, startLine: number): number[] | null {
  const lines: number[] = [];
  let produced = "";
  let line = startLine;
  // Skip the opening delimiter: `"`, `'`, a backtick, or a template middle/tail
  // opener (`}`); template heads end with `${`, which the caller's slice keeps.
  let i = raw.length > 0 && /["'`}]/.test(raw[0]!) ? 1 : 0;
  const end = raw.length > i && /["'`]/.test(raw.at(-1)!) ? raw.length - 1 : raw.length;
  const emit = (piece: string): void => {
    produced += piece;
    for (let k = 0; k < piece.length; k++) lines.push(line);
  };
  while (i < end) {
    const character = raw[i]!;
    if (character === "\\") {
      const next = raw[i + 1];
      if (next === undefined) return null;
      // A line continuation produces NOTHING and consumes a physical line.
      if (next === "\n" || next === "\u2028" || next === "\u2029") {
        line++;
        i += 2;
        continue;
      }
      if (next === "\r") {
        line++;
        i += raw[i + 2] === "\n" ? 3 : 2;
        continue;
      }
      const simple: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
      };
      if (next === "x") {
        const hex = raw.slice(i + 2, i + 4);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
        emit(String.fromCharCode(parseInt(hex, 16)));
        i += 4;
        continue;
      }
      if (next === "u") {
        if (raw[i + 2] === "{") {
          const close = raw.indexOf("}", i + 3);
          if (close === -1) return null;
          const hex = raw.slice(i + 3, close);
          if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
          emit(String.fromCodePoint(parseInt(hex, 16)));
          i = close + 1;
          continue;
        }
        const hex = raw.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        emit(String.fromCharCode(parseInt(hex, 16)));
        i += 6;
        continue;
      }
      emit(simple[next] ?? next);
      i += 2;
      continue;
    }
    // A REAL newline inside a template literal is both a cooked `\n` and a
    // physical line. CRLF cooks to a single `\n`.
    if (character === "\r") {
      emit("\n");
      line++;
      i += raw[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (character === "\n") {
      emit("\n");
      line++;
      i++;
      continue;
    }
    emit(character);
    i++;
  }
  return produced === cooked ? lines : null;
}

function composedText(node: ts.Node, sourceFile: ts.SourceFile): Composed | null {
  const out: Composed = { text: "", lineAt: [], exact: true };

  /** Append a literal fragment, mapping each character to its physical line. */
  const fragment = (cooked: string, pos: number, end: number): void => {
    const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line;
    // Walk the RAW source through JS's escape grammar so each cooked character
    // gets the physical line it actually came from. Counting newlines on both
    // sides and calling them "aligned" was not enough: a backslash-newline
    // CONTINUATION consumes a physical line while producing no cooked
    // character, so the counts disagreed, the whole fragment pinned to its
    // opening line, and an unprotected psql one line down inherited an
    // exemption written for an unrelated call above it.
    const mapped = mapRawToLines(sourceFile.text.slice(pos, end), cooked, startLine);
    if (mapped === null) {
      // Refuse to certify a mapping that could not be derived. The line is
      // still the fragment's own, and `exact: false` skips exemption lookup so
      // an unrelated marker can never apply.
      out.exact = false;
      for (const character of cooked) {
        out.text += character;
        out.lineAt.push(startLine);
      }
      return;
    }
    out.text += cooked;
    // One at a time: spreading a long literal's map overflows the argument
    // limit.
    for (const mappedLine of mapped) out.lineAt.push(mappedLine);
  };

  /** Append the opaque stand-in for a runtime piece, at its own line. */
  const placeholder = (at: ts.Node): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(at.getStart(sourceFile)).line;
    out.text += "${}";
    out.lineAt.push(line, line, line);
  };

  const walk = (current: ts.Node): boolean => {
    const literal = literalText(current);
    if (literal !== null) {
      fragment(literal, current.getStart(sourceFile), current.getEnd());
      return true;
    }
    if (ts.isTemplateExpression(current)) {
      fragment(current.head.text, current.head.getStart(sourceFile), current.head.getEnd());
      for (const span of current.templateSpans) {
        placeholder(span.expression);
        fragment(span.literal.text, span.literal.getStart(sourceFile), span.literal.getEnd());
      }
      return true;
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = walk(current.left);
      const right = walk(current.right);
      if (!left && !right) return false;
      return true;
    }
    placeholder(current);
    return false;
  };

  return walk(node) ? out : null;
}

function isPsqlBinary(text: string): boolean {
  return text === "psql" || text.endsWith("/psql");
}

/**
 * A string that IS a psql command line, not merely the binary name. The
 * tripwire has to see these: `const cmd = "psql -qAt $DSN"; execSync(cmd)` is
 * ordinary code, and reading only argv[0]-shaped literals let it through with
 * zero sites AND zero indirections.
 */
function looksLikePsqlCommandLine(text: string): boolean {
  // LEX it; do not pattern-match the head. An earlier cut required the string
  // to START with psql, and the header claimed that sufficed to backstop
  // runtime-assembled commands. Review disproved the claim with five ORDINARY
  // shapes at once — `sudo -u postgres psql …`, `PGHOST=… psql …`,
  // `echo ready\npsql …`, `true && psql …`, `cat dump.sql | psql …`. The shell
  // reader already knows where a command word is, so ask it.
  const sites = scanShellText(text, "<literal>", 0);
  if (sites.length === 0) return false;
  // Bounded so PROSE that quotes a command does not become a hit. Every clause
  // has a named counterexample from this repo's own strings:
  //   • short           — a 12-word cap; long sentences mention flags too.
  //   • carries a flag  — "psql output must contain ---LOCKS--- marker".
  //   • argument-shaped follower — `psql failed: …` (a word ending in `:`).
  //   • wrapper-only prefix — "parses pipe-separated psql -qAt rows", where
  //     the words before psql are English, not `sudo` / `PGHOST=` / a flag.
  const WRAPPERS =
    /^(?:sudo|doas|su|runuser|env|command|exec|time|timeout|nice|ionice|nohup|stdbuf|xargs|flock|setsid|chroot|ssh|docker|docker-compose|compose|kubectl|podman|nerdctl|cat|true|false|echo|printf|sh|bash|zsh)$/;
  // Shell CONTROL syntax, which precedes a command without being a wrapper:
  // `! psql …`, `if psql …; then`, `while psql …; do`, `{ psql …; }`,
  // `coproc psql …`. These are WEAK: they let a flagged command through, but on
  // their own they do not vouch for a FLAGLESS one, because "if psql fails" is
  // also a sentence.
  const CONTROL = /^(?:!|\{|if|then|elif|else|while|until|do|coproc)$/;
  const isStrongPrefixWord = (word: string, index: number, before: readonly string[]): boolean =>
    /^[A-Za-z_]\w*=/.test(word) ||
    /^-/.test(word) ||
    WRAPPERS.test(basename(word)) ||
    word === "--" ||
    /^-/.test(before[index - 1] ?? "") ||
    /^-/.test(before[index - 2] ?? "") ||
    (index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ""))) ||
    (index > 1 && WRAPPERS.test(basename(before[index - 2] ?? "")));
  const prefixIsCommandish = (before: readonly string[]): boolean =>
    before.every(
      (word, index) =>
        CONTROL.test(word) ||
        /^[A-Za-z_]\w*=/.test(word) ||
        /^-/.test(word) ||
        WRAPPERS.test(basename(word)) ||
        // a wrapper's own argument: `timeout 30 psql …`, `sudo -u postgres psql …`
        word === "--" ||
        /^-/.test(before[index - 1] ?? "") ||
        // …including the argument AFTER a flag's value:
        // `ssh -o StrictHostKeyChecking=no database psql …` puts the remote host
        // two words past the `-o`, and requiring the immediate predecessor to be
        // the flag rejected an entirely ordinary command.
        /^-/.test(before[index - 2] ?? "") ||
        (index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ""))) ||
        (index > 1 && WRAPPERS.test(basename(before[index - 2] ?? ""))),
    );
  return sites.some((site) => {
    const words = text.trim().split(/\s+/).length;
    // A BACKTICK in operator-guidance PROSE is a markdown code span, not a
    // shell substitution: `' to validation via \`psql "$T" -f <m>\`'` is
    // documentation. The signal is the OUTER text's head word, NOT its length —
    // capping length wrongly rejected `echo one two … $(psql …)`. This applies
    // ONLY to backticks: `$(…)` has no markdown reading, and gating it on the
    // head word hid every ordinary `jq -n --arg rows "$(psql -qAt mydb)"` or
    // `curl -d "$(psql …)"` behind a program not in WRAPPERS.
    if (site.nestedInBacktick) {
      const head = (text.trim().split(/\s+/)[0] ?? "").replace(/^["']/, "");
      if (!/^[A-Za-z_]\w*=/.test(head) && !WRAPPERS.test(basename(head))) return false;
    }
    const hasFlag = site.tokens.some(
      (t) => /^-{1,2}[A-Za-z0-9]/.test(t) || t.startsWith("service="),
    );
    // The main precision carrier: every word before the command must look like a
    // wrapper, an assignment, or a flag — not English. That is what keeps
    // "parses pipe-separated psql -qAt rows" out.
    const commandishPrefix = prefixIsCommandish(site.precedingWords);
    // psql needs no flags at all — `psql mydb`, `psql "$DSN"`,
    // `sudo -u postgres psql mydb`, `psql <dump.sql` (the shell eats the
    // redirection before argv exists). Three bounds keep prose out, each with a
    // named counterexample from this repo's own strings:
    //   argv length  — "psql output must contain ---LOCKS--- marker"
    //   string length — a STANDING_ALLOWLIST reason, whose command stops after
    //     two words only because a `(` splits it
    //   no `word:`   — `psql invocation failed: …`, `psql exit ${code}: …`
    // The string-length bound is lifted only by a STRONG prefix word. Charging
    // a validated wrapper's own words against the command hid
    // `docker compose -f … exec -T postgres psql mydb`, which is nine words of
    // which seven are the prefix that already vouched for it — but shell
    // CONTROL syntax vouches for nothing on its own, since "if psql fails" is a
    // sentence and `if psql mydb; then` is not.
    const hasStrongPrefix = site.precedingWords.some((word, index) =>
      isStrongPrefixWord(word, index, site.precedingWords),
    );
    const isTerseCommand =
      site.tokens.length <= 3 &&
      !site.tokens.some((t) => /:$/.test(t)) &&
      (site.precedingWords.length === 0 ? words <= 8 : hasStrongPrefix);
    if (!hasFlag && !isTerseCommand) return false;
    if (/:$/.test(site.tokens[0] ?? "")) return false;
    return commandishPrefix;
  });
}

const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh"]);

/** Programs whose `-c` argument is a command STRING the shell then runs. */
const DASH_C_CONSUMERS = new Set(["su", "runuser", "chroot", "doas"]);

/** Programs whose command string is simply a later word (`ssh host "psql …"`,
 * `watch "psql …"`), with no flag naming it. */
const TRAILING_SCRIPT_CONSUMERS = new Set(["ssh", "watch"]);

/** ssh options that take a SEPARATE value, so the following word is that value
 * rather than the host or the remote command. */
const SSH_ARG_FLAGS = /^-[bcDEeFIiJLlmOopQRSWw]$/;

/** argv[0] is a shell, so its argv carries a command LINE rather than psql. */
function isShellBinary(text: string): boolean {
  return SHELL_BINARIES.has(text.slice(text.lastIndexOf("/") + 1));
}

/** JSX only parses as JSX when the ScriptKind says so — otherwise `<span>` is
 * read as a type assertion and the `//` in its TEXT looks like a comment. */
function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(mjs|cjs|js)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseJs(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * Suppression that holds under BOTH readings of a spawn-family argv: as literal
 * argv, and as the command line the shell would re-parse under `{ shell: true }`.
 *
 * Node joins argv with spaces when `shell` is truthy, so the shell then removes
 * redirections and re-splits words. `execFileSync("psql", ["-F", "2>/dev/null",
 * "-X", "mydb"], { shell: true })` really runs `psql -F -X mydb`, where `-X` is
 * the field separator and suppresses nothing — while a literal reading saw a
 * standalone `-X` and certified it. Requiring BOTH readings avoids inspecting
 * the options object at all, which is deliberate: a reader that recognized only
 * an unquoted `shell:` key missed `{ "shell": true }`, `{ ["shell"]: true }`,
 * `{ shell }` shorthand and an external identifier.
 */
function argvSuppressesUnderBothReadings(tokens: readonly string[]): boolean {
  if (!argvSuppressesStartupFiles(tokens)) return false;
  // `<dynamic>` carries `<` and `>`, which the shell would read as redirections;
  // stand it in with the same opaque word the lexer uses elsewhere.
  const asCommand = ["psql", ...tokens.map((t) => (t === DYNAMIC_TOKEN ? "${}" : t))].join(" ");
  const reparsed = scanShellText(asCommand, "<argv>", 0)[0];
  return reparsed === undefined || argvSuppressesStartupFiles(reparsed.tokens);
}

export function scanJsSource(source: string, file: string): PsqlSite[] {
  const sourceFile = parseJs(source, file);
  const lines = source.split("\n");
  const commentAt = jsCommentRangesPerLine(source, file);
  const sites: PsqlSite[] = [];

  const visitNode = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const first = node.arguments[0];
      const firstComposed = first ? composedText(first, sourceFile) : null;
      const firstText = firstComposed?.text ?? null;

      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        firstText &&
        isPsqlBinary(firstText)
      ) {
        const tokens: string[] = [];
        let hasDynamicTokens = false;
        const argv = node.arguments[1];
        if (argv && ts.isArrayLiteralExpression(argv)) {
          for (const element of argv.elements) {
            const text = literalText(element);
            if (text === null) {
              hasDynamicTokens = true;
              tokens.push(DYNAMIC_TOKEN);
            } else tokens.push(text);
          }
        } else if (argv !== undefined) {
          hasDynamicTokens = true;
        }
        const line = lineOf(sourceFile, first!.getStart(sourceFile));
        sites.push({
          file,
          line,
          form: callee as PsqlSiteForm,
          tokens,
          precedingWords: [],
          offset: 0,
          nested: false,
          nestedInBacktick: false,
          hasDynamicTokens,
          suppressesStartupFiles: argvSuppressesUnderBothReadings(tokens),
          exemptReason: exemptionOnLines(lines, line, commentAt),
        });
      }

      // Literal shell strings handed to execSync("psql …") / exec("psql …").
      if (callee && SHELL_CALLEES.has(callee)) {
        for (const argument of node.arguments) {
          const text = composedText(argument, sourceFile);
          if (text === null) continue;
          sites.push(...shellStringSites(text, file, lines, commentAt));
        }
      }

      // A spawn-family argv[0] that is a literal COMMAND LINE rather than a
      // bare binary is only meaningful with a shell, so scan it as shell text
      // and never mind how the option was spelled. Reading the option object
      // was the bug: `{ "shell": true }`, `{ ["shell"]: true }`, `{ shell }`
      // shorthand and an external `options` identifier are all ordinary, and a
      // reader that recognized only an unquoted `shell:` key saw none of them.
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        first &&
        firstComposed !== null &&
        !isPsqlBinary(firstComposed.text) &&
        !isShellBinary(firstComposed.text)
      ) {
        sites.push(...shellStringSites(firstComposed, file, lines, commentAt));
      }

      // A shell binary run through the spawn family — spawnSync("sh", ["-c",
      // "psql …"]). argv[0] is not psql, so the branch above never sees it;
      // every literal element of the argv array is read as shell text instead.
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        firstText &&
        isShellBinary(firstText)
      ) {
        const argv = node.arguments[1];
        if (argv && ts.isArrayLiteralExpression(argv)) {
          for (const element of argv.elements) {
            const text = composedText(element, sourceFile);
            if (text === null) continue;
            sites.push(...shellStringSites(text, file, lines, commentAt));
          }
        }
      }
    }
    ts.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
  return sites;
}

/**
 * Hard tripwire for the one thing the AST match cannot see: the binary name
 * bound to an identifier, or a shell command assembled at runtime. Reports any
 * `"psql"`-valued string literal that is NOT argv[0] of a recognized call.
 */
export function scanBinaryIndirection(source: string, file: string): IndirectionHit[] {
  const sourceFile = parseJs(source, file);
  const recognized = new Set<number>();
  const hits: IndirectionHit[] = [];

  const mark = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const first = node.arguments[0];
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        first &&
        literalText(first) !== null
      )
        recognized.add(first.getStart(sourceFile));
    }
    ts.forEachChild(node, mark);
  };
  mark(sourceFile);

  const visitNode = (node: ts.Node): void => {
    const composed = composedText(node, sourceFile);
    const text = composed?.text ?? null;
    const suspicious = text !== null && (isPsqlBinary(text) || looksLikePsqlCommandLine(text));
    if (suspicious && !recognized.has(node.getStart(sourceFile))) {
      hits.push({
        file,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        text: node.getText(sourceFile),
      });
    }
    ts.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
  return hits;
}

// ── workflow YAML ────────────────────────────────────────────────────────

export function scanWorkflowSource(source: string, file: string): PsqlSite[] {
  const sites: PsqlSite[] = [];
  let document;
  try {
    document = parseDocument(source, { keepSourceTokens: true });
  } catch {
    return sites;
  }
  const lineStartOf = (offset: number): number => source.slice(0, offset).split("\n").length - 1;

  visit(document, {
    Pair(_key: unknown, pair: unknown) {
      const node = pair as { key?: unknown; value?: unknown };
      if (!isPair(pair as YamlNode as never)) return;
      const key = node.key as { value?: unknown } | undefined;
      if (!key || key.value !== "run") return;
      // A `run: *cmd` ALIAS is not a scalar node. Anchors/aliases are
      // documented GitHub Actions reuse, so resolving is required, not
      // generous.
      const raw0 = node.value as { source?: unknown; resolve?: unknown };
      const value =
        raw0 && typeof (raw0 as { resolve?: unknown }).resolve === "function"
          ? ((raw0 as { resolve: (d: unknown) => unknown }).resolve(document) ?? node.value)
          : node.value;
      if (!isScalar(value as never)) return;
      const range = (value as { range?: [number, number, number] }).range;
      if (!range) return;
      const rawSlice = source.slice(range[0], range[1]);
      // A BLOCK scalar's first line is its HEADER (`|` or `>`, with optional
      // chomping/indent indicators and a trailing comment), not shell text. A
      // bare `>` was lexed as a redirection whose target swallowed the `psql`
      // command word, so the raw pass found nothing and the decoded fallback
      // pinned the site to the `run:` key instead of the physical line. Blank
      // the header rather than dropping it, so line numbers still line up.
      const raw = /^[|>][0-9+-]{0,2}\s*(?:#.*)?$/.test(rawSlice.split("\n", 1)[0] ?? "")
        ? rawSlice.replace(/^[^\n]*/, "")
        : rawSlice;
      // Anchor the line to the `run:` KEY. An alias resolves to a node defined
      // elsewhere (whose line is not where the command runs), and a decoded
      // escape can land on a physical line that is blank.
      const keyRange = (node.key as { range?: [number, number, number] } | undefined)?.range;
      const offset = lineStartOf(keyRange ? keyRange[0] : range[0]);
      // An ALIAS (`run: *cmd`) resolves to a scalar defined ELSEWHERE, so its
      // internal line offsets belong to the anchor, not to this step. Adding
      // them to the `run:` key's line invents a position: an eight-line
      // workflow reported its site on line 10. Pin every site from an alias to
      // the key itself, which is the documented anchoring contract.
      const aliased = range[0] < (keyRange?.[0] ?? 0);
      const found = scanShellText(raw, file, offset).map((site) =>
        aliased ? { ...site, line: offset + 1 } : site,
      );
      // A double-quoted scalar can DECODE to a psql command whose raw slice
      // holds no recognizable word (`\\x70sql`, `\\u0070sql`, an escaped
      // newline). Scan the decoded value too and keep whatever the raw pass
      // missed; the decoded pass reports the scalar's own line.
      const decoded = (value as { value?: unknown }).value;
      // Scan the decoded scalar TOO, not only when the raw pass came up empty:
      // `run: "$(psql -X DSN)\npsql -qAt DSN"` has a raw-visible protected
      // substitution AND a decoded-only unprotected command, and "raw wins"
      // hid the second one entirely. Dedupe on the argv, not the line.
      if (typeof decoded === "string" && decoded !== rawSlice) {
        const seen = new Set(found.map((site) => site.tokens.join("\u0000")));
        for (const site of scanShellText(decoded, file, offset)) {
          // A DECODED line number is an offset into the decoded value, which
          // does not correspond to a physical line (an escaped `\n` consumes
          // none). Pin these to the `run:` key rather than inventing a line
          // that may be blank or absent.
          if (!seen.has(site.tokens.join("\u0000"))) found.push({ ...site, line: offset + 1 });
        }
      }
      sites.push(...found);
    },
  });
  return sites;
}

// ── dispatch + walk ──────────────────────────────────────────────────────

function extensionOf(file: string): string {
  const at = file.lastIndexOf(".");
  return at === -1 ? "" : file.slice(at);
}

/**
 * An exemption marker covers ONE invocation. `exemptionOnLines` is line-scoped —
 * it answers "is there a marker on this line or the one above" — which let a
 * single marker bleed across sites: two calls on adjacent lines both claimed a
 * marker written for the first, and `psql a; psql b # marker` exempted both.
 * A marker claimed by more than one site therefore exempts NONE of them, which
 * is the fail-closed direction and produces a loud message rather than a silent
 * pass. (No site in the tree uses an exemption, so this costs nothing today; it
 * exists so the first one cannot quietly cover its neighbour.)
 */
function dropSharedExemptions(sites: PsqlSite[]): PsqlSite[] {
  const claims = new Map<string, number>();
  for (const site of sites) {
    if (site.exemptReason === null) continue;
    const key = `${site.exemptReason}\u0000${site.line}`;
    claims.set(key, (claims.get(key) ?? 0) + 1);
  }
  // A reason claimed on two DIFFERENT lines is the adjacent-line bleed; the same
  // reason twice on ONE line is the same-line bleed. Count by reason overall.
  const byReason = new Map<string, number>();
  for (const site of sites) {
    if (site.exemptReason === null) continue;
    byReason.set(site.exemptReason, (byReason.get(site.exemptReason) ?? 0) + 1);
  }
  return sites.map((site) =>
    site.exemptReason !== null && (byReason.get(site.exemptReason) ?? 0) > 1
      ? { ...site, exemptReason: null }
      : site,
  );
}

export function scanSource(source: string, file: string): PsqlSite[] {
  const extension = extensionOf(file);
  if (YAML_EXTENSIONS.includes(extension))
    return dropSharedExemptions(scanWorkflowSource(source, file));
  if (SHELL_EXTENSIONS.includes(extension))
    return dropSharedExemptions(scanShellText(source, file, 0));
  return dropSharedExemptions(scanJsSource(source, file));
}

/**
 * A path the walk could not read. RECORDED, never swallowed: an earlier cut
 * returned early on `readdirSync` failure with a comment claiming that could not
 * hide a call site. A review probe disproved it — `chmod 000 scripts/ci` dropped
 * the census from 73 to 71 and the guard still passed, which is precisely the
 * silent under-count this whole file exists to prevent. Unreadable now fails the
 * meta-test.
 */
function walk(directory: string, out: string[], unreadable: string[], depth = 0): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    unreadable.push(directory);
    return;
  }
  for (const entry of entries) {
    if (IGNORED_ANYWHERE.has(entry)) continue;
    if (depth === 0 && IGNORED_AT_ROOT.has(entry)) continue;
    const full = join(directory, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      unreadable.push(full);
      continue;
    }
    if (stats.isDirectory()) walk(full, out, unreadable, depth + 1);
    else if (SCANNED_EXTENSIONS.includes(extensionOf(entry))) out.push(full);
  }
}

export function collectPsqlUsage(repoRoot: string): PsqlUsage {
  const files: string[] = [];
  const unreadableAbsolute: string[] = [];
  walk(repoRoot, files, unreadableAbsolute);
  files.sort();

  const sites: PsqlSite[] = [];
  const indirections: IndirectionHit[] = [];
  const unreadable = unreadableAbsolute.map((p) => relative(repoRoot, p).split(sep).join("/"));
  for (const full of files) {
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      unreadable.push(relative(repoRoot, full).split(sep).join("/"));
      continue;
    }
    // NO `source.includes("psql")` prefilter. It looks free and it silently
    // undid every decoding fix in this file: `p"s"ql`, `p\s\q\l`, a
    // backslash-newline splice, YAML `\x70sql`, and `"ps" + "ql"` all invoke
    // psql while containing no literal `psql`, so the prefiltered walk never
    // handed them to the scanner that knows how to read them.
    const rel = relative(repoRoot, full).split(sep).join("/");
    sites.push(...scanSource(source, rel));
    if (JS_EXTENSIONS.includes(extensionOf(full)) && !SELF.includes(rel))
      indirections.push(...scanBinaryIndirection(source, rel));
  }
  return { sites, indirections, unreadable, filesScanned: files.length };
}

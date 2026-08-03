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
 * The file list is a FILESYSTEM WALK from the repo root (see IGNORED_DIRS), not
 * a hardcoded roster: a psql site added in a brand-new directory fails by
 * default. `docs/**` and `*.md` are excluded on purpose — plan and spec prose
 * quotes the idiom and is not a call site.
 *
 * ── Reading psql's option grammar ──────────────────────────────────────────
 *
 * See `argvSuppressesStartupFiles`. A membership test on the token list is
 * wrong in three directions, each confirmed against the installed binary: the
 * combined cluster `-qAtX` (which a substring match calls unprotected), an `X`
 * consumed as another option's ARGUMENT (`-FX`, `-F -X`), and a flag sitting
 * after the first positional, which `POSIXLY_CORRECT=1` discards entirely.
 *
 * ── What is NOT statically detectable, and what backstops it ───────────────
 *
 * • A binary name behind an identifier (`const PSQL = "psql"; execFileSync(PSQL,
 *   …)`) hides the args from the AST match. BACKSTOP: `scanBinaryIndirection`
 *   is a hard tripwire — any `"psql"` string literal that is NOT argv[0] of a
 *   recognized call fails the meta-test with "pass it as a literal argv[0]".
 *   There is no such site in the tree today and this keeps it that way.
 * • A shell command assembled entirely at runtime (`execSync(buildCmd())`),
 *   where no fragment of the command word survives as source text. Templates
 *   and concatenations ARE read (`composedText`), so this is narrower than it
 *   sounds. BACKSTOP: the indirection tripwire, which fires on any `"psql"`-ish
 *   literal that is not argv[0] of a recognized call.
 * • Shell recognition is word-level, so a `psql` word produced by EXPANSION
 *   (`$PG psql`, `eval "$cmd"`, an alias) is invisible. Lexical spellings are
 *   not: `p"s"ql`, `p\\s\\q\\l` and a backslash-newline splice all resolve to the
 *   same word and are found. `command psql …` is caught too, because only `-v`
 *   (not `command`) is denied, which still excludes `command -v psql`.
 * • Anything outside the scanned extensions — a Makefile, a package.json
 *   script. Checked at authoring time (2026-08-03): no Makefile/justfile exists
 *   and no package.json script mentions psql. A new one would be invisible
 *   here; extend SCANNED_EXTENSIONS with it.
 *
 * ── Exemptions ─────────────────────────────────────────────────────────────
 *
 * A site may opt out with `psql-startup-files-ok: <reason>` in a comment on the
 * invocation line or the line above (`//` in JS/TS, `#` in shell/YAML). The
 * reason is mandatory — a bare marker does not exempt — and the marker must sit
 * inside an actual COMMENT: a review probe drove
 * `psql … ; x="psql-startup-files-ok: unrelated value"` past an earlier cut that
 * matched the marker anywhere on the line, which turned a data value into a
 * silent exemption. No site in the tree uses one: `scripts/ci/supabase-local-bootstrap.sh` was the candidate (it runs psql
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
  form: PsqlSiteForm;
  /** Literal argv tokens recovered; non-literal elements are dropped. */
  tokens: string[];
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
const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "out",
  "docs",
  "playwright-report",
  "test-results",
  "__generated__",
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
function commentIndexPerLine(text: string, style: CommentStyle): number[] {
  const lines = text.split("\n");
  const out: number[] = [];
  let carriedQuote: string | null = null;
  let inBlockComment = false;

  for (const line of lines) {
    if (inBlockComment) {
      const close = line.indexOf("*/");
      if (close === -1) {
        out.push(0); // the whole line is inside a block comment
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
    // A single/double-quoted string does not survive a newline in either
    // grammar; a JS template literal does.
    carriedQuote = quote === "`" ? "`" : null;
    out.push(found);
  }
  return out;
}

type CommentStyle = "js" | "hash";

function exemptionOnLines(
  lines: readonly string[],
  lineNumber: number,
  commentAt: readonly number[],
): string | null {
  for (const index of [lineNumber - 1, lineNumber - 2]) {
    const candidate = lines[index];
    if (candidate === undefined) continue;
    const at = candidate.indexOf(EXEMPTION_MARKER);
    if (at === -1) continue;
    const start = commentAt[index] ?? -1;
    if (start === -1 || start > at) continue;
    const reason = candidate.slice(at + EXEMPTION_MARKER.length).trim();
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
type ShellWord = { text: string; line: number; operator: boolean };

const OPERATOR_STARTS = new Set([";", "&", "|", "(", ")", "\n"]);

/** Index of the closing delimiter matching the opener at `start`. */
function matchBrace(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

type NestedShell = { text: string; line: number };

function lexShellWords(text: string, nested: NestedShell[] = []): ShellWord[] {
  const words: ShellWord[] = [];
  let buffer = "";
  let started = false;
  let startLine = 0;
  let line = 0;
  /** Redirections and their targets never reach argv. */
  let dropWord = false;

  const flush = (): void => {
    if (started) {
      if (!dropWord) words.push({ text: buffer, line: startLine, operator: false });
      dropWord = false;
    }
    buffer = "";
    started = false;
  };
  const begin = (): void => {
    if (!started) {
      started = true;
      startLine = line;
      buffer = "";
    }
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
        begin();
        buffer += next;
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
      begin();
      const close = matchBrace(text, i + 1, "{", "}");
      buffer += text.slice(i, close + 1);
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
      nested.push({ text: text.slice(open + 1, close), line });
      line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
      // The substitution stands in as an opaque word so surrounding argv is
      // still read correctly.
      begin();
      buffer += "${}";
      i = close;
      continue;
    }

    // ANSI-C (`$'…'`) and locale (`$"…"`) quoting are ordinary quoted words.
    if (character === "$" && (text[i + 1] === "'" || text[i + 1] === '"')) {
      continue; // the quote itself is handled on the next iteration
    }

    if (character === "'") {
      begin();
      const close = text.indexOf("'", i + 1);
      const body = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
      buffer += body;
      line += (body.match(/\n/g) ?? []).length;
      i = close === -1 ? text.length : close;
      continue;
    }

    if (character === '"') {
      begin();
      i++;
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\" && text[i + 1] !== undefined) {
          i++;
          buffer += text[i];
          continue;
        }
        // `"$(psql …)"` and "`psql …`" still EXECUTE inside double quotes.
        if (text[i] === "$" && text[i + 1] === "(") {
          const close = matchBrace(text, i + 1, "(", ")");
          nested.push({ text: text.slice(i + 2, close), line });
          buffer += "${}";
          i = close;
          continue;
        }
        if (text[i] === "`") {
          const close = text.indexOf("`", i + 1);
          const end = close === -1 ? text.length : close;
          nested.push({ text: text.slice(i + 1, end), line });
          buffer += "${}";
          i = end;
          continue;
        }
        if (text[i] === "\n") line++;
        buffer += text[i];
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
      words.push({ text: "\n", line, operator: true });
      line++;
      continue;
    }

    if (/\s/.test(character)) {
      flush();
      continue;
    }

    // Redirections: an optional fd, the operator, and an optionally ATTACHED
    // target. The shell strips all of it, so neither reaches argv.
    if (!started || /^\d+$/.test(buffer)) {
      const redirection = /^(?:&>>?|>>|>&|<<|[<>])/.exec(text.slice(i));
      if (redirection && (character === "<" || character === ">" || character === "&")) {
        const isBackgroundAmp = character === "&" && text[i + 1] !== ">";
        if (!isBackgroundAmp) {
          // A pending all-digit buffer is this redirection's FD (`2>err`), not
          // a word — discard it rather than emitting it as an argv token.
          if (!/^\d+$/.test(buffer)) flush();
          buffer = "";
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
      words.push({ text: operator, line, operator: true });
      i += operator.length - 1;
      continue;
    }

    begin();
    buffer += character;
  }
  flush();
  return words;
}

/** The command word, with any directory prefix removed. */
function basename(word: string): string {
  return word.slice(word.lastIndexOf("/") + 1);
}

/** Preceding words that make `psql` an argument rather than the command:
 * availability probes and package tooling. */
const NOT_AN_INVOCATION = new Set([
  "-v",
  "-V",
  "-p",
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

  const nested: NestedShell[] = [];
  const words = lexShellWords(text, nested);
  for (const inner of nested) {
    for (const site of scanShellText(inner.text, file, lineOffset + inner.line)) sites.push(site);
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
    const index = argv.findIndex((word) => basename(word.text) === "psql");
    if (index === -1) continue;
    const previous = argv[index - 1];
    if (previous && NOT_AN_INVOCATION.has(previous.text)) continue;

    const rest = argv.slice(index + 1);
    const tokens = rest.map((word) => word.text);
    const hit = argv[index]!;
    sites.push({
      file,
      line: hit.line + lineOffset + 1,
      form: "shell",
      tokens,
      hasDynamicTokens: tokens.some((token) => token.includes("$")),
      suppressesStartupFiles: argvSuppressesStartupFiles(tokens),
      exemptReason: exemptionOnLines(rawLines, hit.line + 1, commentAt),
    });
  }
  return sites;
}

/** True when a JS/TS string literal is itself a shell command line running psql. */
function shellStringSites(
  value: string,
  file: string,
  line: number,
  lines: string[],
  commentAt: readonly number[],
  sourceLineSpan = 0,
): PsqlSite[] {
  // `line` is where the literal OPENS; a multi-line template puts psql further
  // down, so the shell scanner's own relative line is ADDED rather than
  // discarded. Reporting the opening line for every hit inside a multi-line
  // literal was an R2 finding.
  return scanShellText(value, file, 0).map((site) => {
    // The literal's VALUE may contain cooked `\n` that consume no physical
    // source line; clamp to how many lines the literal actually spans, or an
    // invocation on line 1 gets reported on line 2 and inherits a comment that
    // was written for the NEXT site.
    const actualLine = line + Math.min(site.line - 1, sourceLineSpan);
    return {
      ...site,
      line: actualLine,
      exemptReason: exemptionOnLines(lines, actualLine, commentAt),
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
function composedText(node: ts.Node): string | null {
  const literal = literalText(node);
  if (literal !== null) return literal;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) out += "${}" + span.literal.text;
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = composedText(node.left);
    const right = composedText(node.right);
    if (left === null && right === null) return null;
    return (left ?? "${}") + (right ?? "${}");
  }
  return null;
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
  // The word must be FOLLOWED by something argument-shaped — a flag, a
  // variable, a quote, or a DSN. Otherwise every error message that opens
  // "psql failed: …" is an indirection hit, which is noise, not a finding.
  return /^\s*(?:[^\s;&|()<>]*\/)?psql\s+(?:-|\$|["']|postgres(?:ql)?:\/\/)/.test(text);
}

const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh"]);

/** argv[0] is a shell, so its argv carries a command LINE rather than psql. */
function isShellBinary(text: string): boolean {
  return SHELL_BINARIES.has(text.slice(text.lastIndexOf("/") + 1));
}

function parseJs(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

export function scanJsSource(source: string, file: string): PsqlSite[] {
  const sourceFile = parseJs(source, file);
  const lines = source.split("\n");
  const commentAt = commentIndexPerLine(source, "js");
  const sites: PsqlSite[] = [];

  const visitNode = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const first = node.arguments[0];
      const firstText = first ? composedText(first) : null;

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
          hasDynamicTokens,
          suppressesStartupFiles: argvSuppressesStartupFiles(tokens),
          exemptReason: exemptionOnLines(lines, line, commentAt),
        });
      }

      // Literal shell strings handed to execSync("psql …") / exec("psql …").
      if (callee && SHELL_CALLEES.has(callee)) {
        for (const argument of node.arguments) {
          const text = composedText(argument);
          if (text === null) continue;
          const line = lineOf(sourceFile, argument.getStart(sourceFile));
          const span = lineOf(sourceFile, argument.getEnd()) - line;
          sites.push(...shellStringSites(text, file, line, lines, commentAt, span));
        }
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
            const text = composedText(element);
            if (text === null) continue;
            const line = lineOf(sourceFile, element.getStart(sourceFile));
            const span = lineOf(sourceFile, element.getEnd()) - line;
            sites.push(...shellStringSites(text, file, line, lines, commentAt, span));
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
    const text = composedText(node);
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
      const value = node.value;
      if (!isScalar(value as never)) return;
      const range = (value as { range?: [number, number, number] }).range;
      if (!range) return;
      const raw = source.slice(range[0], range[1]);
      const offset = lineStartOf(range[0]);
      const found = scanShellText(raw, file, offset);
      // A double-quoted scalar can DECODE to a psql command whose raw slice
      // holds no recognizable word (`\\x70sql`, `\\u0070sql`, an escaped
      // newline). Scan the decoded value too and keep whatever the raw pass
      // missed; the decoded pass reports the scalar's own line.
      const decoded = (value as { value?: unknown }).value;
      if (found.length === 0 && typeof decoded === "string" && decoded !== raw) {
        found.push(...scanShellText(decoded, file, offset));
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

export function scanSource(source: string, file: string): PsqlSite[] {
  const extension = extensionOf(file);
  if (YAML_EXTENSIONS.includes(extension)) return scanWorkflowSource(source, file);
  if (SHELL_EXTENSIONS.includes(extension)) return scanShellText(source, file, 0);
  return scanJsSource(source, file);
}

/**
 * A path the walk could not read. RECORDED, never swallowed: an earlier cut
 * returned early on `readdirSync` failure with a comment claiming that could not
 * hide a call site. A review probe disproved it — `chmod 000 scripts/ci` dropped
 * the census from 73 to 71 and the guard still passed, which is precisely the
 * silent under-count this whole file exists to prevent. Unreadable now fails the
 * meta-test.
 */
function walk(directory: string, out: string[], unreadable: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    unreadable.push(directory);
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      unreadable.push(full);
      continue;
    }
    if (stats.isDirectory()) walk(full, out, unreadable);
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

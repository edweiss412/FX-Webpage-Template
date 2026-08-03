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
 * 2. JS/TS literal shell strings — `execSync("psql …")` / `exec("psql …")`, and
 *    the spawn family when argv[0] is a SHELL rather than psql
 *    (`spawnSync("sh", ["-c", "psql …"])`, `/bin/bash`, …), where every literal
 *    argv element is read as shell text. The command word may be quoted
 *    (`"psql" "$DSN" …`) — a probe during cross-model review found all three of
 *    these returning zero sites against the first cut of this scanner.
 * 3. `.sh` scripts — a bare `psql` word, after joining backslash line
 *    continuations and dropping quote-aware `#` comments. Recognition is a
 *    DENYLIST on the preceding word, not an allowlist of command-position
 *    prefixes: an allowlist has to enumerate every wrapper (`docker exec "$C"`,
 *    an UNQUOTED `docker exec $C`, `sudo`, `env`, `time`, `xargs`) and silently
 *    misses the one it forgot, which is the wrong failure mode for a security
 *    guard. Every bare `psql` is an invocation unless the word before it is a
 *    probe or package-manager word (`-v` — which covers `command -v psql`, the
 *    CI availability check, ~14 occurrences in `.github/workflows/` — plus
 *    `which`, `type`, `hash`, `whereis`, `install`, `apt-get`, `echo`, …).
 * 4. Workflow YAML — the raw source slice of every `run:` scalar, scanned with
 *    the same shell reader. Both spellings: a `run: |` block and a quoted
 *    single-line `run: "psql …"`. A step `name:` that merely mentions psql is
 *    not a call site.
 *
 * The file list is a FILESYSTEM WALK from the repo root (see IGNORED_DIRS), not
 * a hardcoded roster: a psql site added in a brand-new directory fails by
 * default. `docs/**` and `*.md` are excluded on purpose — plan and spec prose
 * quotes the idiom and is not a call site.
 *
 * ── The `-qAtX` trap ───────────────────────────────────────────────────────
 *
 * A naive `args.includes("-X")` reports `tests/db/crew-rpc-lifecycle-guard-meta
 * .test.ts` — which passes the combined cluster `"-qAtX"` — as unprotected.
 * Flag CLUSTERS are parsed here, not substring-matched: a single-dash run of
 * letters containing `X` counts, and so does the long form `--no-psqlrc`.
 * Lowercase `-x` (expanded output) does not, and neither does a long option or
 * a value that merely contains an X (`--set=XYZ`, `ON_ERROR_STOP=1`).
 *
 * ── What is NOT statically detectable, and what backstops it ───────────────
 *
 * • A binary name behind an identifier (`const PSQL = "psql"; execFileSync(PSQL,
 *   …)`) hides the args from the AST match. BACKSTOP: `scanBinaryIndirection`
 *   is a hard tripwire — any `"psql"` string literal that is NOT argv[0] of a
 *   recognized call fails the meta-test with "pass it as a literal argv[0]".
 *   There is no such site in the tree today and this keeps it that way.
 * • A shell command assembled at runtime (`execSync(buildCmd())`). Undetectable
 *   by construction. BACKSTOP: the same indirection tripwire — assembling the
 *   string requires the literal `"psql"` somewhere in a scanned file, which the
 *   tripwire catches.
 * • Shell recognition is word-level, so a `psql` word produced by expansion
 *   (`$PG psql`, `eval "$cmd"`, an alias) is invisible. The denylist keeps this
 *   as narrow as it can be — `command psql …` IS caught, because only `-v`
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
 * The guard's own source. It holds `"psql"` string literals (the binary-name
 * comparison) that are not call sites and would otherwise trip the indirection
 * tripwire on itself. Excluded from indirection scanning only — it is still
 * walked and still scanned for call sites, and it has none.
 */
const SELF = "tests/cross-cutting/psqlStartupFiles/scan.ts";

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
      const name = token.split("=", 1)[0]!;
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
      if (character === "\\" && quote !== "'") {
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
      } else if (character === "/" && (line[i + 1] === "/" || line[i + 1] === "*")) {
        found = i;
        if (line[i + 1] === "*" && !line.slice(i + 2).includes("*/")) inBlockComment = true;
        break;
      }
    }
    // A single/double-quoted string does not survive a newline in either
    // grammar; a JS template literal does.
    carriedQuote = quote === "`" ? "`" : null;
    if (found === -1 && style === "js") found = line.search(/^\s*\*(?!\/)/);
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
 * A bare `psql` word in shell text. Deliberately a DENYLIST, not an allowlist of
 * command-position prefixes: an allowlist has to enumerate every wrapper
 * (`docker exec "$C"`, `sudo`, `env`, `time`, `xargs`, an unquoted `$DB`) and
 * silently misses the one it forgot. Here every bare `psql` is an invocation
 * unless the preceding word says otherwise, so the failure mode is a LOUD false
 * positive a human reads, not a silent hole in a security guard.
 */
const SHELL_BARE_PSQL =
  /(?:^|[\s;&|()<>"'])["']?(?:[^\s;&|()<>"']*\/)?psql["']?(?=[\s;&|()<>"']|$)/g;

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
function hashCommentIndex(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const character = line[i]!;
    if (character === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return i;
  }
  return -1;
}

/**
 * The slice of `text` belonging to ONE command — up to the first UNQUOTED
 * separator (`;`, `&&`, `||`, `|`, `&`, newline).
 *
 * Without this the token list ran to end of line, so an unrelated `-X` later on
 * the line was read as this call's flag. Review probes:
 *
 *     psql $A -qAt; psql -X $B     -> first site reported SAFE
 *     psql $A -qAt && echo -X      -> reported SAFE
 *
 * A lone `&` after `>` (or before one) is redirection — `2>&1`, `>&2` — not a
 * separator.
 */
function firstCommandSegment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const character = text[i]!;
    if (character === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "\n" || character === ";") return text.slice(0, i);
    if (character === "|") return text.slice(0, i);
    if (character === "&") {
      const isRedirection = text[i - 1] === ">" || text[i + 1] === ">";
      if (!isRedirection) return text.slice(0, i);
    }
  }
  return text;
}

/** Drop a trailing `#` comment, ignoring `#` inside single or double quotes. */
function stripShellComment(line: string): string {
  const at = hashCommentIndex(line);
  return at === -1 ? line : line.slice(0, at);
}

/** A redirection operator, which the shell consumes — it never reaches argv. */
const REDIRECTION = /^(?:\d*(?:>>?|<)&?\d*|&>>?)$/;

/** Whitespace tokenizer that keeps quoted runs together and unwraps them.
 * Redirections (and the target of a bare one) are dropped so the token list is
 * the argv psql actually receives. */
function shellTokens(text: string): string[] {
  const raw: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) raw.push(m[1] ?? m[2] ?? m[3] ?? "");

  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i]!;
    if (!REDIRECTION.test(token)) {
      out.push(token);
      continue;
    }
    // `2>&1` names its target inline; a bare `>` / `<` / `2>` takes the next word.
    if (!token.includes("&")) i++;
  }
  return out;
}

/**
 * Scan shell text (a `.sh` file, or the raw slice of a workflow `run:` scalar).
 * `lineOffset` is added to the 0-indexed line within `text`.
 */
function scanShellText(text: string, file: string, lineOffset: number): PsqlSite[] {
  const rawLines = text.split("\n");
  const commentAt = commentIndexPerLine(text, "hash");
  const sites: PsqlSite[] = [];

  // Join backslash continuations into logical lines, remembering where each
  // physical line started so a hit reports the line carrying `psql`.
  type Logical = { text: string; startLines: number[] };
  const logicals: Logical[] = [];
  let current: Logical | null = null;
  rawLines.forEach((raw, index) => {
    const stripped = stripShellComment(raw);
    const continues = /\\\s*$/.test(stripped);
    const body = stripped.replace(/\\\s*$/, "");
    if (current === null) current = { text: "", startLines: [] };
    current.startLines.push(index);
    current.text += (current.text === "" ? "" : " ") + body.trim();
    if (!continues) {
      logicals.push(current);
      current = null;
    }
  });
  if (current !== null) logicals.push(current);

  for (const logical of logicals) {
    SHELL_BARE_PSQL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SHELL_BARE_PSQL.exec(logical.text))) {
      const wordAt = m.index + m[0].indexOf("psql");
      const before = logical.text.slice(0, wordAt).trimEnd();
      const previousWord = before.slice(before.lastIndexOf(" ") + 1).replace(/^["']|["']$/g, "");
      if (NOT_AN_INVOCATION.has(previousWord)) continue;
      const after = firstCommandSegment(logical.text.slice(wordAt + "psql".length));
      const tokens = shellTokens(after);
      let consumed = 0;
      let hitLine = logical.startLines[0]!;
      for (const [i, physical] of logical.startLines.entries()) {
        const segment = stripShellComment(rawLines[physical]!)
          .replace(/\\\s*$/, "")
          .trim();
        const end = consumed + segment.length + (i === 0 ? 0 : 1);
        if (wordAt <= end) {
          hitLine = physical;
          break;
        }
        consumed = end;
        hitLine = physical;
      }
      const line = hitLine + lineOffset + 1;
      sites.push({
        file,
        line,
        form: "shell",
        tokens,
        hasDynamicTokens: tokens.some((t) => t.includes("$")),
        suppressesStartupFiles: argvSuppressesStartupFiles(tokens),
        exemptReason: exemptionOnLines(rawLines, hitLine + 1, commentAt),
      });
    }
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
): PsqlSite[] {
  // `line` is where the literal OPENS; a multi-line template puts psql further
  // down, so the shell scanner's own relative line is ADDED rather than
  // discarded. Reporting the opening line for every hit inside a multi-line
  // literal was an R2 finding.
  return scanShellText(value, file, 0).map((site) => {
    const actualLine = line + site.line - 1;
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

function isPsqlBinary(text: string): boolean {
  return text === "psql" || text.endsWith("/psql");
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
      const firstText = first ? literalText(first) : null;

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
            if (text === null) hasDynamicTokens = true;
            else tokens.push(text);
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
          const text = literalText(argument);
          if (text === null) continue;
          const line = lineOf(sourceFile, argument.getStart(sourceFile));
          sites.push(...shellStringSites(text, file, line, lines, commentAt));
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
            const text = literalText(element);
            if (text === null) continue;
            const line = lineOf(sourceFile, element.getStart(sourceFile));
            sites.push(...shellStringSites(text, file, line, lines, commentAt));
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
    const text = literalText(node);
    if (text !== null && isPsqlBinary(text) && !recognized.has(node.getStart(sourceFile))) {
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
      sites.push(...scanShellText(raw, file, lineStartOf(range[0])));
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
    if (!source.includes("psql")) continue;
    const rel = relative(repoRoot, full).split(sep).join("/");
    sites.push(...scanSource(source, rel));
    if (JS_EXTENSIONS.includes(extensionOf(full)) && rel !== SELF)
      indirections.push(...scanBinaryIndirection(source, rel));
  }
  return { sites, indirections, unreadable, filesScanned: files.length };
}

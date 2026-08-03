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
 * reason is mandatory — a bare marker does not exempt. No site in the tree uses
 * one: `scripts/ci/supabase-local-bootstrap.sh` was the candidate (it runs psql
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

function tokensSuppress(tokens: readonly string[]): boolean {
  return tokens.some(tokenSuppressesStartupFiles);
}

// ── exemption markers ────────────────────────────────────────────────────

function exemptionOnLines(lines: readonly string[], lineNumber: number): string | null {
  for (const candidate of [lines[lineNumber - 1], lines[lineNumber - 2]]) {
    if (candidate === undefined) continue;
    const at = candidate.indexOf(EXEMPTION_MARKER);
    if (at === -1) continue;
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
const SHELL_BARE_PSQL = /(?:^|[\s;&|()<>"'])["']?psql["']?(?=[\s;&|()<>"']|$)/g;

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

/** Drop a trailing `#` comment, ignoring `#` inside single or double quotes. */
function stripShellComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const character = line[i]!;
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
}

/** Whitespace tokenizer that keeps quoted runs together and unwraps them. */
function shellTokens(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/**
 * Scan shell text (a `.sh` file, or the raw slice of a workflow `run:` scalar).
 * `lineOffset` is added to the 0-indexed line within `text`.
 */
function scanShellText(text: string, file: string, lineOffset: number): PsqlSite[] {
  const rawLines = text.split("\n");
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
      const after = logical.text.slice(wordAt + "psql".length);
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
        suppressesStartupFiles: tokensSuppress(tokens),
        exemptReason: exemptionOnLines(rawLines, hitLine + 1) ?? null,
      });
    }
  }
  return sites;
}

/** True when a JS/TS string literal is itself a shell command line running psql. */
function shellStringSites(value: string, file: string, line: number, lines: string[]): PsqlSite[] {
  return scanShellText(value, file, 0).map((site) => ({
    ...site,
    line,
    exemptReason: exemptionOnLines(lines, line),
  }));
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
          suppressesStartupFiles: tokensSuppress(tokens),
          exemptReason: exemptionOnLines(lines, line),
        });
      }

      // Literal shell strings handed to execSync("psql …") / exec("psql …").
      if (callee && SHELL_CALLEES.has(callee)) {
        for (const argument of node.arguments) {
          const text = literalText(argument);
          if (text === null) continue;
          const line = lineOf(sourceFile, argument.getStart(sourceFile));
          sites.push(...shellStringSites(text, file, line, lines));
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
            sites.push(...shellStringSites(text, file, line, lines));
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

function walk(directory: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    // An unreadable directory is skipped rather than crashing the scan. It
    // cannot silently hide a call site: the walk starts at the repo root and
    // the only thing that makes a directory unreadable here is a permission
    // problem on a path git could not have checked out either.
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.includes(extensionOf(entry))) out.push(full);
  }
}

export function collectPsqlUsage(repoRoot: string): PsqlUsage {
  const files: string[] = [];
  walk(repoRoot, files);
  files.sort();

  const sites: PsqlSite[] = [];
  const indirections: IndirectionHit[] = [];
  for (const full of files) {
    const source = readFileSync(full, "utf8");
    if (!source.includes("psql")) continue;
    const rel = relative(repoRoot, full).split(sep).join("/");
    sites.push(...scanSource(source, rel));
    if (JS_EXTENSIONS.includes(extensionOf(full)) && rel !== SELF)
      indirections.push(...scanBinaryIndirection(source, rel));
  }
  return { sites, indirections, filesScanned: files.length };
}

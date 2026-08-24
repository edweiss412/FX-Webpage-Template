/**
 * tests/cross-cutting/psqlStartupFileSuppression.test.ts
 *
 * Structural meta-test for PSQL-STARTUP-FILE-NO-X-CLASSWIDE.
 *
 * THE VECTOR (proved against the installed binary, whole-diff review R3 on
 * `test/step3-live-render-cluster`, 2026-08-02): psql reads `$PSQLRC`, then
 * `$HOME/.psqlrc`, then the compiled-in system psqlrc BEFORE it executes
 * anything arriving on stdin or `-c`. A startup file containing
 *
 *     \connect postgresql://…@192.0.2.3:5432/postgres
 *
 * silently replaces a validated-local connection, so every statement the caller
 * believed it was running against 127.0.0.1:54322 runs remotely instead. Every
 * loopback assertion in this repo (`assertLoopback`, the observe CLI `--env`
 * guardrail, `db-reset-pool.mjs`'s non-loopback refusal) validates a URL STRING
 * and is therefore blind to it. `psql -X` suppresses all three startup files and
 * is the documented contract.
 *
 * This file pins the class closed. The scan is a FILESYSTEM WALK (see
 * `psqlStartupFiles/scan.ts`), not a hardcoded file list, so a NEW psql call
 * site fails by default.
 *
 * Pure — no DB, no network.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { Scalar, parseDocument, visit } from "yaml";
import { describe, expect, test } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";

import {
  EXEMPTION_MARKER,
  OPERATOR_STARTS,
  analyzeNaming,
  scanShellIndirection,
  argvSuppressesStartupFiles,
  collectPsqlUsage,
  REDIRECTION_PARTITION,
  rootSkipNamesFromGitignore,
  scanBinaryIndirection,
  scanSource,
  scanWorkflowIndirection,
  scanWorkflowSource,
  RAW_IS_SHELL_TEXT_STYLES,
  tokenSuppressesStartupFiles,
} from "./psqlStartupFiles/scan";

const REPO_ROOT = join(__dirname, "..", "..");

/** The extensions the walk actually scans (scan.ts `SCANNED_EXTENSIONS`). */
const SCANNABLE_EXTENSION = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx|sh|bash|yml|yaml)$/;

/** Real files used as live probes. Both are load-bearing: the first is a
 * separate-`"-X"` site, the second is the combined-cluster spelling that a naive
 * `args.includes("-X")` guard reports as unprotected. */
const SEPARATE_X_SITE = "tests/db/show_share_tokens.test.ts";
const COMBINED_CLUSTER_SITE = "tests/db/crew-rpc-lifecycle-guard-meta.test.ts";
const GUARD_MODULE = "tests/cross-cutting/psqlStartupFiles/scan.ts";

function sitesIn(source: string, file: string) {
  return scanSource(source, file);
}

/**
 * ONE full-tree walk for the whole file, computed LAZILY.
 *
 * It reads ~2950 files and takes seconds. Doing it at MODULE level ran it
 * during collection, before any test had started, which blocked the serial
 * vitest project's single thread — and `picker-flow-e2e-ci-wiring`, which
 * shares shard 1 and carries a 5s per-test timeout, timed out twice on CI as a
 * result. Deferring it into the tests that need it keeps the cost inside a
 * timeout this file owns.
 */
let liveUsage: ReturnType<typeof collectPsqlUsage> | null = null;
function liveTreeUsage(): ReturnType<typeof collectPsqlUsage> {
  liveUsage ??= collectPsqlUsage(REPO_ROOT);
  return liveUsage;
}
/** Generous, because the walk is the point of these tests.
 *
 * Raised from 60s once the guard began reading the workflow binding surface,
 * the composed container argv, and the full assignment grammar: the walk went
 * from ~10s to ~22s locally, and a CI runner is slower than this machine. The
 * cheap fix — a per-line `psql` substring guard, worth ~6s — is the exact shape
 * the R4 meta-test forbids module-wide, so the budget moves instead of the
 * guard. Still a bound, not an absence of one: a walk that regresses into
 * minutes fails here rather than hanging a shard. */
const WALK_TIMEOUT_MS = 120_000;

// ── flag-cluster parsing (the -qAtX trap) ───────────────────────────────

// ── psql option grammar (R2 BLOCKING) ───────────────────────────────────

describe("argvSuppressesStartupFiles — real psql option grammar", () => {
  test.each([
    [["-X"], true],
    [["-qAtX"], true],
    [["-XqAt"], true],
    [["--no-psqlrc"], true],
    [["-v", "ON_ERROR_STOP=1", "-X"], true],
    [["-c", "select 1", "-X"], true],
    [["-F", "\t", "-X"], true],
    [["--field-separator=|", "-X"], true],
    [["-X", "dsn"], true],
    // `X` consumed as another option's ARGUMENT suppresses nothing. Probed
    // against the installed binary: `psql -F` errors "option requires an
    // argument -- F", while `psql -FX` and `psql -F -X` both connect.
    [["-FX"], false],
    [["-F", "-X"], false],
    [["--field-separator", "-X"], false],
    [["--", "-X"], false],
    // After a positional, POSIXLY_CORRECT=1 stops option parsing entirely.
    [["dsn", "-X"], false],
    [["-qAt"], false],
    [["-x"], false],
  ])("%j -> %s", (argv, expected) => {
    expect(argvSuppressesStartupFiles(argv)).toBe(expected);
  });
});

describe("tokenSuppressesStartupFiles", () => {
  test.each([
    ["-X", true],
    ["-qAtX", true],
    ["-XqAt", true],
    ["-qXAt", true],
    ["--no-psqlrc", true],
    ["-qAt", false],
    ["-At", false],
    ["-c", false],
    ["-qAtc", false],
    ["-v", false],
    ["-F\t", false],
    ["ON_ERROR_STOP=1", false],
    ["-x", false], // lowercase -x is expanded output, NOT startup-file suppression
    ["--expanded", false],
    ["", false],
  ])("%j -> %s", (token, expected) => {
    expect(tokenSuppressesStartupFiles(token)).toBe(expected);
  });

  test("a long option that merely contains X is not accepted", () => {
    expect(tokenSuppressesStartupFiles("--set=XYZ")).toBe(false);
  });

  test("a bare value that contains X is not accepted", () => {
    expect(tokenSuppressesStartupFiles("SELECT 'X'")).toBe(false);
  });
});

// ── JS/TS call-site recognition, every spelling in the tree ─────────────

describe("scanSource — JS/TS spawn family", () => {
  test("single-line execFileSync without -X is a violation", () => {
    const sites = sitesIn(
      `execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], { input: sql });`,
      "tests/x.test.ts",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe("execFileSync");
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("prettier's multi-line opener — `psql` on the line AFTER the paren", () => {
    const sites = sitesIn(
      [
        "return execFileSync(",
        '  "psql",',
        '  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", MIGRATION_PATH],',
        "  { encoding: 'utf8' },",
        ").trim();",
      ].join("\n"),
      "tests/x.test.ts",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sites[0]!.line).toBe(2);
  });

  test('a separate "-X" argument satisfies the contract', () => {
    const sites = sitesIn(
      `execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", dsn]);`,
      "tests/x.test.ts",
    );
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("the combined -qAtX cluster satisfies the contract (naive includes() trap)", () => {
    const source = `execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-qAtX", databaseUrl]);`;
    expect(source.includes('"-X"')).toBe(false); // the naive check would fail here
    expect(sitesIn(source, "tests/x.test.ts")[0]!.suppressesStartupFiles).toBe(true);
  });

  test.each(["spawnSync", "spawn", "execFile"])("%s is recognized", (callee) => {
    const sites = sitesIn(`const p = ${callee}("psql", [url, "-qAt"]);`, "tests/x.test.ts");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe(callee);
  });

  test("a member-expression callee (child_process.spawnSync) is recognized", () => {
    const sites = sitesIn(`child_process.spawnSync("psql", [url, "-qAt"]);`, "tests/x.test.ts");
    expect(sites).toHaveLength(1);
  });

  test("an absolute binary path ending in /psql is recognized", () => {
    const sites = sitesIn(`execFileSync("/usr/bin/psql", [url, "-qAt"]);`, "scripts/x.mjs");
    expect(sites).toHaveLength(1);
  });

  test("a spread arg list is scanned for the literal -X and marked dynamic", () => {
    const withX = sitesIn(
      `execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", ...args, dbUrl]);`,
      "tests/x.ts",
    );
    expect(withX[0]!.suppressesStartupFiles).toBe(true);
    expect(withX[0]!.hasDynamicTokens).toBe(true);

    const withoutX = sitesIn(
      `execFileSync("psql", ["-v", "ON_ERROR_STOP=1", ...args, dbUrl]);`,
      "tests/x.ts",
    );
    expect(withoutX[0]!.suppressesStartupFiles).toBe(false);
  });

  test("`psql` inside a comment or an unrelated string is not a call site", () => {
    const source = [
      '// so `pexec("psql", …, { input: sql })` leaves psql blocking on stdin',
      "const msg = `psql failed: command psql ${DSN} -qAt exited 2`;",
      'expect(src).not.toMatch(/execFileSync\\(\\s*"psql"/);',
    ].join("\n");
    expect(sitesIn(source, "tests/x.test.ts")).toHaveLength(0);
  });

  // Three shapes the first cut of the scanner missed. Each was surfaced by a
  // runtime probe during cross-model review, and each returned zero sites.
  test('a shell binary in argv[0] — spawnSync("sh", ["-c", "psql …"])', () => {
    const sites = sitesIn(
      `execFileSync("sh", ["-c", "psql $DSN -qAt -c select"]);`,
      "scripts/x.mjs",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe("shell");
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(
      sitesIn(`spawnSync("/bin/bash", ["-c", "psql -X $DSN -qAt"]);`, "scripts/x.mjs")[0]!
        .suppressesStartupFiles,
    ).toBe(true);
  });

  test("a multi-line literal reports the line psql is ON, not the opening line", () => {
    const source = ["execSync(`echo ready", "psql $DSN -qAt", "`);"].join("\n");
    const sites = sitesIn(source, "scripts/x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
  });

  test("a QUOTED command word inside a shell string", () => {
    const sites = sitesIn(`execSync("\\"psql\\" $DSN -qAt -c select");`, "scripts/x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a literal shell string invoking psql is recognized", () => {
    const sites = sitesIn(`execSync("psql -U postgres -c 'select 1'");`, "scripts/x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe("shell");
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(
      sitesIn(`execSync("psql -X -U postgres");`, "scripts/x.mjs")[0]!.suppressesStartupFiles,
    ).toBe(true);
  });
});

// ── R3: the shell layer is a lexer, not a line slicer ──────────────────

describe("R3 escaping mutants — each was certified SAFE before the fix", () => {
  test.each([
    // A non-literal argv element is a POSITIONAL; dropping it recreated the
    // POSIXLY_CORRECT defect through token recovery.
    ['execFileSync("psql", [dsn, "-X"]);', "x.ts"],
    ['execFileSync("psql", [...pre, "-X"]);', "x.ts"],
    ['execFileSync("psql", [a ? b : c, "--no-psqlrc"]);', "x.ts"],
    // The shell hands psql ONE argv word here; -F swallows it.
    ['psql -F" -X" $DSN\n', "x.sh"],
    ["psql -F\\ -X $DSN\n", "x.sh"],
    // The shell REMOVES the redirection, so -F swallows -X.
    ["psql -F 2>err -X $DSN\n", "x.sh"],
    ["psql -F 2>>err -X $DSN\n", "x.sh"],
    ["psql -F >out -X $DSN\n", "x.sh"],
    ["psql -F </dev/null -X $DSN\n", "x.sh"],
    // `\` + SPACE is not a continuation: the -X belongs to the next command.
    ['psql -qAt \\ # comment\n-X "$DSN"\n', "x.sh"],
    // An earlier `psql` inside the PATH is not the command word.
    ['/opt/psql-X-tools/bin/psql "$DSN" -qAt\n', "x.sh"],
  ])("%j is NOT certified", (source, file) => {
    const sites = sitesIn(source, file);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["quote concatenation", 'p"s"ql -qAt $DSN\n'],
    ["escaped letters", "p\\s\\q\\l -qAt $DSN\n"],
    ["backslash-newline splice", "ps\\\nql -qAt $DSN\n"],
  ])("a command word spelled via %s is still found", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["template", "execSync(`psql ${dsn} -qAt`);"],
    ["concatenation", 'execSync("psql " + dsn);'],
    ["sh -c template", 'spawnSync("sh", ["-c", `psql ${dsn} -qAt`]);'],
    ["template binary", "execFileSync(`${binDir}/psql`, args);"],
  ])("a runtime-composed %s is discovered, not invisible", (_name, source) => {
    const sites = sitesIn(source, "scripts/x.mjs");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a psql command that only exists in the DECODED yaml scalar is found", () => {
    for (const raw of ['"echo ready\\npsql -qAt $DSN"', '"\\x70sql -qAt $DSN"']) {
      const source = ["jobs:", "  x:", "    steps:", `      - run: ${raw}`, ""].join("\n");
      const sites = sitesIn(source, ".github/workflows/x.yml");
      expect(sites, raw).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    }
  });

  test("options-first with a dynamic DSN last is still certified", () => {
    expect(sitesIn('execFileSync("psql", ["-X", dsn]);', "x.ts")[0]!.suppressesStartupFiles).toBe(
      true,
    );
  });

  test.each([
    ["an escaped apostrophe in a JS string", `const s = 'a\\'b // MARKER unrelated value';`],
    ["a CLOSED block comment earlier on the line", `/* x */ const s = "// MARKER unrelated";`],
  ])("%s does not fake a comment", (_name, tail) => {
    const sites = sitesIn(
      `execFileSync("psql", ["-qAt", d]); ${tail.replace("MARKER", EXEMPTION_MARKER)}`,
      "scripts/x.mjs",
    );
    expect(sites[0]!.exemptReason).toBeNull();
  });
});

// ── R4: nested shells, option abbreviations, and the prefilter ─────────

describe("R4 escaping mutants — each was certified SAFE or invisible before", () => {
  test("the walk has NO psql prefilter — it would undo every decoding fix", () => {
    // `p"s"ql -qAt $DSN` invokes psql and contains no literal "psql", so a
    // `source.includes("psql")` prefilter never hands it to the scanner that
    // knows how to read it. That prefilter shipped, and silently disabled the
    // R3 fixes on the live tree.
    const source = 'p"s"ql -qAt $DSN\n';
    expect(source.includes("psql")).toBe(false);
    expect(sitesIn(source, "x.sh")).toHaveLength(1);
    // Strip comments first: the module DOCUMENTS the removed prefilter, and a
    // raw substring check would match the prose that explains why it is gone.
    const guardCode = stripCommentsForFile(
      readFileSync(join(REPO_ROOT, GUARD_MODULE), "utf8"),
      GUARD_MODULE,
    );
    expect(guardCode).not.toContain('includes("psql")');
  });

  test.each([
    // psql resolves UNIQUE long-option abbreviations, so `--co` is `--command`
    // and swallows the -X: `psql --co` errors "requires an argument".
    [["--co", "-X", "dsn"], false],
    [["--fil", "-X", "dsn"], false],
    [["--ho", "-X", "dsn"], false],
    [["--no-psq", "dsn"], true],
    // Ambiguous prefixes (--no-psqlrc vs --no-password vs --no-align) are an
    // error in psql too, so refusing to certify is correct.
    [["--no-p", "dsn"], false],
  ])("%j -> %s (long-option abbreviation)", (argv, expected) => {
    expect(argvSuppressesStartupFiles(argv)).toBe(expected);
  });

  test.each([
    ["command substitution", 'out="$(psql -qAt DSN)"\n'],
    ["bare command substitution", "out=$(psql -qAt DSN)\n"],
    ["backticks in a string", 'out="`psql -qAt DSN`"\n'],
    ["bare backticks", "out=`psql -qAt DSN`\n"],
    ["process substitution", "cat <(psql -qAt DSN)\n"],
    ["ANSI-C quoting", "$'psql' -qAt DSN\n"],
    ["locale quoting", '$"psql" -qAt DSN\n'],
  ])("a psql inside %s executes, so it is a site", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a brace expansion cannot split a redirection target into a phantom flag", () => {
    // The shell removes `>${x// /}` entirely, so -F swallows -X.
    const sites = sitesIn("psql -F >${x// /} -X DSN\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["a command line bound to a variable", 'const cmd = "psql -qAt $DSN"; execSync(cmd);'],
    ["an aliased runner", 'const run = execSync; run("psql -qAt $DSN");'],
  ])("%s trips the indirection tripwire", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  test("an error message that merely opens with psql is NOT an indirection hit", () => {
    expect(scanBinaryIndirection("const m = `psql failed: ${String(err)}`;", "x.mjs")).toHaveLength(
      0,
    );
  });

  test("a leading * outside a block comment does not exempt", () => {
    const source = [
      "const n = 1",
      `  * "${EXEMPTION_MARKER} unrelated data value";`,
      `execFileSync("psql", ["-qAt", dsn]);`,
    ].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a cooked \\n in a literal does not push the site onto the next line", () => {
    // Otherwise a marker written for the NEXT site retroactively exempts this one.
    const source = [
      'execSync("echo\\npsql -qAt $DSN");',
      `// ${EXEMPTION_MARKER} intended for the next site only`,
      `execFileSync("psql", ["-qAt", dsn]);`,
    ].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites[0]!.line).toBe(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });
});

// ── R5: expansions, quote-aware braces, and command position ───────────

describe("R5 escaping mutants", () => {
  test.each([
    ["a parameter expansion in the flag", "psql -${z}X DSN\n"],
    ["an expansion as the whole long option", "psql --${z} -X DSN\n"],
    ["a command substitution in the flag", "psql -$(printf F)X DSN\n"],
  ])("%s cannot certify — the word is not its source spelling", (_name, source) => {
    // z=F makes `-${z}X` expand to `-FX`, where X is the field separator.
    const sites = sitesIn(source, "x.sh");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["command substitution", 'out=$(echo ")"; psql -qAt DSN)\n'],
    ["single-quoted paren", "out=$(echo ')'; psql -qAt DSN)\n"],
    ["process substitution", 'cat <(echo ")"; psql -qAt DSN)\n'],
  ])("a quoted paren inside a %s does not end it early", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["double", '"'],
    ["single", "'"],
  ])("a %s-quoted shell string carries across the newline", (_name, quote) => {
    // ADJACENT to the invocation — the earlier regression test left a closing
    // line in between, which made it vacuous for exactly this case.
    const source = [
      `x=${quote}opening`,
      `# ${EXEMPTION_MARKER} unrelated string data${quote}`,
      'psql -qAt "$DSN"',
    ].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a multiline substitution advances the line counter", () => {
    const source = [
      'x="$(echo',
      'foo)"',
      `# ${EXEMPTION_MARKER} intended for the assignment only`,
      "echo separator",
      'psql -qAt "$DSN"',
    ].join("\n");
    const site = sitesIn(source, "x.sh").at(-1)!;
    expect(site.line).toBe(5);
    expect(site.exemptReason).toBeNull();
  });

  test("a decoded-only second command is found even when the raw pass hit", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      '      - run: "$(psql -X DSN)\\npsql -qAt DSN"',
      "",
    ].join("\n");
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.some((site) => !site.suppressesStartupFiles)).toBe(true);
  });

  test.each([
    ["a bare dbname", 'const c = "psql mydb -qAt"; execSync(c);', true],
    ["a service= keyword", 'const c = "psql service=prod -c q"; execSync(c);', true],
    ["a leading redirection", 'const c = "psql <dump.sql"; execSync(c);', true],
    ["an error message", "const m = `psql failed: ${String(err)}`;", false],
    ["an assertion string", 'const m = "psql output must contain ---LOCKS--- marker";', false],
  ])("%s -> tripwire fires: %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });

  test.each([
    ["env -u echo psql -qAt DSN\n", 1],
    ["xargs -p psql -qAt DSN\n", 1],
    ["env -v psql -qAt DSN\n", 1],
    ["time -p psql -qAt DSN\n", 1],
    ["command -v psql\n", 0],
    ["which psql\n", 0],
    ["type psql\n", 0],
  ])("%j -> %d site(s): the denylist only fires at command position", (source, expected) => {
    expect(sitesIn(source, "x.sh")).toHaveLength(expected);
  });
});

// ── R6: shell:true, interpreters, the walk, and comment truth ──────────

describe("R6 escaping mutants", () => {
  test.each([
    ['spawnSync("psql -qAt $DSN", { shell: true });', "spawnSync"],
    ['spawn("psql -qAt $DSN", { shell: true });', "spawn"],
    ['execFileSync("psql -qAt $DSN", { shell: true });', "execFileSync"],
    ['execFile("psql -qAt $DSN", { shell: true });', "execFile"],
  ])("%s — { shell: true } makes argv[0] a command LINE", (source) => {
    const sites = sitesIn(source, "x.mjs");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["bash -c in a script", 'bash -c "psql -qAt $DSN"\n', "x.sh"],
    ["sh -lc under docker", 'docker exec c sh -lc "psql -qAt $DSN"\n', "x.sh"],
    ["eval", 'eval "psql -qAt $DSN"\n', "x.sh"],
    ["execSync of a bash -c", `execSync("bash -c 'psql -qAt $DSN'");`, "x.mjs"],
  ])("an interpreter's script argument is scanned (%s)", (_name, source, file) => {
    const sites = sitesIn(source, file);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.some((site) => !site.suppressesStartupFiles)).toBe(true);
  });

  test("a YAML alias used as run: resolves to its anchor", () => {
    const source = [
      "env:",
      "  CMD: &cmd psql -qAt $DSN",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: *cmd",
      "",
    ].join("\n");
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("the walk reaches tests/docs — an ignored BASENAME must not apply at depth", () => {
    // `docs` in the ignore list matched at EVERY depth, so tests/docs/** — a
    // real directory of executable test files — was never scanned at all.
    expect(existsSync(join(REPO_ROOT, "tests", "docs"))).toBe(true);
    expect(collectPsqlUsage(join(REPO_ROOT, "tests", "docs")).filesScanned).toBeGreaterThan(0);
  });

  test.each([
    [
      "a nested template backtick",
      ["const t = `a ${c ? `x // MARKER unrelated` : 1}`;", 'execFileSync("psql", ["-qAt", d]);'],
      "x.mjs",
    ],
    [
      "JSX text",
      ["const el = <span>// MARKER unrelated</span>;", 'execFileSync("psql", ["-qAt", d]);'],
      "x.tsx",
    ],
  ])("%s is not a comment", (_name, lines, file) => {
    const source = lines.join("\n").replace("MARKER", EXEMPTION_MARKER);
    const sites = sitesIn(source, file);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.at(-1)!.exemptReason).toBeNull();
  });

  test.each([
    ["a wrapper", `const c = "sudo -u postgres psql -qAt $DSN"; execSync(c);`, true],
    ["an env assignment", `const c = "PGHOST=localhost psql -qAt db"; execSync(c);`, true],
    ["a pipeline", `const c = "cat d.sql | psql db -qAt"; execSync(c);`, true],
    ["a conjunction", `const c = "true && psql -qAt db"; execSync(c);`, true],
    ["prose with a flag", `const m = "parses pipe-separated psql -qAt rows";`, false],
    [
      "prose quoting a command",
      'const m = `apply via \\`psql "$D" -f <m>\\`, then reload`;',
      false,
    ],
  ])("the tripwire sees %s -> %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });
});

// ── R7: option spellings, interpreter clusters, YAML lines ─────────────

describe("R7 escaping mutants", () => {
  test.each([
    ["a quoted key", 'spawnSync("psql -qAt $DSN", { "shell": true });'],
    ["a computed key", 'spawnSync("psql -qAt $DSN", { ["shell"]: true });'],
    ["an external options object", 'const o = { shell: true }; spawnSync("psql -qAt $DSN", o);'],
    ["shorthand", 'const shell = true; spawnSync("psql -qAt $DSN", { shell });'],
  ])(
    "a command-line argv[0] is scanned regardless of how the option is written (%s)",
    (_n, src) => {
      // The fix stopped READING the option object: a literal argv[0] that is a
      // command line is only meaningful with a shell, so it is shell text either
      // way. Reading the object is what missed all four of these.
      const sites = sitesIn(src, "x.mjs");
      expect(sites.length).toBeGreaterThan(0);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test("a bare psql binary in argv[0] is still an ordinary spawn site", () => {
    const sites = sitesIn('execFileSync("psql", ["-qAt", d]);', "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe("execFileSync");
  });

  test.each(["-c", "-ce", "-cu", "-cv", "-cx", "-lc"])(
    "an interpreter cluster %s executes its script",
    (flags) => {
      const sites = sitesIn(`sh ${flags} "psql -qAt $DSN"\n`, "x.sh");
      expect(sites.length).toBeGreaterThan(0);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test.each([
    [
      "an alias",
      [
        "env:",
        "  CMD: &cmd psql -qAt $DSN",
        "jobs:",
        "  x:",
        "    steps:",
        "      - run: *cmd",
        "",
      ],
      6,
    ],
    [
      "an escaped newline",
      ["jobs:", "  x:", "    steps:", '      - run: "echo r\\npsql -qAt $DSN"', ""],
      4,
    ],
    [
      "a block scalar",
      [
        "jobs:",
        "  x:",
        "    steps:",
        "      - name: S",
        "        run: |",
        '          psql "$D" -c q',
        "",
      ],
      6,
    ],
  ])("a workflow site from %s reports a real line", (_name, lines, expected) => {
    const sites = sitesIn(lines.join("\n"), ".github/workflows/x.yml");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.line).toBe(expected);
  });
});

// ── R8: `-c --`, and tripwire recall on ordinary command literals ──────

describe("R8 escaping mutants", () => {
  test.each([
    ["bash", `bash -c -- 'psql -qAt "$DSN"'\n`],
    ["sh", `sh -c -- 'psql -qAt "$DSN"'\n`],
    ["docker exec bash", `docker exec c bash -c -- 'psql -qAt "$DSN"'\n`],
  ])("%s -c -- SCRIPT still executes the script", (_name, source) => {
    // `--` terminates option parsing; the script is the NEXT word. Taking `--`
    // itself as the script scanned nothing at all.
    const sites = sitesIn(source, "x.sh");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["a positional-only command", `const c = "psql mydb"; execSync(c);`, true],
    ["a dynamic DSN only", `const c = 'psql "$DSN"'; execSync(c);`, true],
    ["a numeric flag", `const c = "psql -1 mydb"; execSync(c);`, true],
    [
      "a long flag list",
      `const c = "psql -v A=1 -v B=2 -v C=3 -v D=4 -v E=5 -v F=6 -qAt mydb"; execSync(c);`,
      true,
    ],
    ["an ordinary wrapper", `const c = "timeout 30 psql -qAt mydb"; execSync(c);`, true],
    ["a nested substitution", `const c = 'echo "$(psql -qAt mydb)"'; execSync(c);`, true],
    // Precision, held by the wrapper-prefix rule rather than a length cap.
    ["an error message", "const m = `psql failed: ${String(err)}`;", false],
    ["an assertion string", `const m = "parses pipe-separated psql -qAt rows";`, false],
    [
      "operator guidance quoting a command",
      "const m = ' to validation via `psql \"$T\" -f <migration>`';",
      false,
    ],
  ])("the tripwire sees %s -> %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });
});

// ── R9: `command -p`, and tripwire recall on wrapped commands ──────────

describe("R9 escaping mutants", () => {
  test("`command -p psql` RUNS psql; only `command -v` inspects it", () => {
    expect(sitesIn("command -p psql -qAt mydb\n", "x.sh")).toHaveLength(1);
    expect(sitesIn("command -p /usr/bin/psql -qAt mydb\n", "x.sh")).toHaveLength(1);
    expect(sitesIn("command -v psql\n", "x.sh")).toHaveLength(0);
  });

  test.each([
    [
      "a nested substitution after printf",
      `const c = "printf x $(psql -qAt mydb)"; execSync(c);`,
      true,
    ],
    [
      "a LONG outer command with a substitution",
      `const c = "echo one two three four five six seven $(psql -qAt mydb)"; execSync(c);`,
      true,
    ],
    ["a flagless call under sudo", `const c = "sudo -u postgres psql mydb"; execSync(c);`, true],
    ["kubectl exec with --", `const c = "kubectl exec db -- psql -qAt mydb"; execSync(c);`, true],
    [
      "several env assignments",
      `const c = "PGHOST=localhost PGPORT=5432 PGUSER=postgres psql mydb"; execSync(c);`,
      true,
    ],
    // Precision. Each of these is a real string shape in this repo.
    ["an exit-code message", "const m = `psql exit ${code}: ${stderr}`;", false],
    ["an invocation-failed message", "const m = `psql invocation failed: ${e}`;", false],
    [
      "an assertion about output",
      `const m = "psql output must contain ---LOCKS--- marker";`,
      false,
    ],
    ["a test title", `const m = "parses pipe-separated psql -qAt rows";`, false],
  ])("the tripwire sees %s -> %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });
});

describe("R10 escaping mutants", () => {
  // `${VAR:-$(psql …)}` EXECUTES its operand. Consuming the whole expansion as
  // one opaque word made every such invocation invisible, in all eight
  // default/assign/alternate/error forms.
  test.each([":-", "-", ":=", "=", ":+", "+", ":?", "?"])(
    "a command substitution inside a `${VAR%s…}` expansion is a site",
    (operator) => {
      const sites = sitesIn(`result=\${RESULT${operator}$(psql -qAt mydb)}\n`, "x.sh");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
      expect(sites[0]!.nested).toBe(true);
    },
  );

  test("a suppressed call inside an expansion operand still reads as protected", () => {
    const sites = sitesIn('out=${OUT:-$(psql -X -qAt "$DSN")}\n', "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("backticks and nested expansions inside an operand are reached too", () => {
    expect(sitesIn("v=${V:-`psql -qAt mydb`}\n", "x.sh")).toHaveLength(1);
    expect(sitesIn("v=${V:-${W:-$(psql -qAt mydb)}}\n", "x.sh")).toHaveLength(1);
  });

  test("an expansion with no substitution is still consumed whole", () => {
    // The reason the expansion is opaque in the first place: brace-protected
    // whitespace must not split a redirection target into a phantom argv word.
    expect(sitesIn('psql -F"${x// /}" -X -c "select 1"\n', "x.sh")).toHaveLength(1);
    expect(sitesIn('psql -F"${x// /}" -X -c "select 1"\n', "x.sh")[0]!.suppressesStartupFiles).toBe(
      false,
    );
  });

  test.each([
    ["a plain ssh wrapper", `const c = "ssh database psql -qAt mydb"; execSync(c);`, true],
    [
      "a long `docker compose … exec` prefix on a FLAGLESS call",
      `const c = "docker compose -f docker-compose.yml exec -T postgres psql mydb"; execSync(c);`,
      true,
    ],
    ["flock", `const c = "flock /tmp/l psql -qAt mydb"; execSync(c);`, true],
    // Precision is unchanged: a BARE psql at the head of a long sentence is
    // still prose, because it has no wrapper prefix to vouch for it.
    ["an assertion about output", `const m = "psql output must contain a LOCKS marker";`, false],
    [
      "a sentence about a database",
      `const m = "psql mydb rows are compared against the fixture";`,
      false,
    ],
    // A wrapper argument that follows a FLAG'S VALUE rather than the flag.
    [
      "ssh with an -o option",
      `const c = "ssh -o StrictHostKeyChecking=no database psql -qAt mydb"; execSync(c);`,
      true,
    ],
    [
      "ssh with a port and a user",
      `const c = "ssh -p 2222 -l deploy database psql -qAt mydb"; execSync(c);`,
      true,
    ],
  ])("the tripwire sees %s -> %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });

  test("a bare marker in a CLOSED block comment cannot borrow the code after it", () => {
    const source = `/* ${EXEMPTION_MARKER} */ execFileSync("psql", ["-qAt", dsn]);\n`;
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    // The reason must come from INSIDE the comment. There is none, so the site
    // is unprotected rather than exempt with the statement as its "reason".
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a real reason in a closed block comment still exempts, without the tail", () => {
    const source = `/* ${EXEMPTION_MARKER} runs in a scratch container */ execFileSync("psql", ["-qAt", dsn]);\n`;
    const sites = scanSource(source, "x.mjs");
    expect(sites[0]!.exemptReason).toBe("runs in a scratch container");
  });

  test.each([">", "> # folded", ">-", ">+", ">2", "|", "|-"])(
    "a `run: %s` block scalar reports the physical psql line",
    (header) => {
      const source = [
        "jobs:",
        "  a:",
        "    steps:",
        "      - run: " + header,
        "          psql -qAt mydb",
        "",
      ].join("\n");
      const sites = scanSource(source, ".github/workflows/x.yml");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.line).toBe(5);
    },
  );
});

describe("R11 escaping mutants", () => {
  // `$(…)` has no markdown reading, so gating it on the outer head word hid
  // every substitution under a program that is not a shell wrapper.
  test.each([
    ["jq", `const c = 'jq -n --arg rows "$(psql -qAt mydb)"'; execSync(c);`],
    ["curl", `const c = 'curl -d "$(psql -qAt mydb)" https://x'; execSync(c);`],
    ["an unknown program", `const c = 'mytool --rows "$(psql -qAt mydb)"'; execSync(c);`],
  ])("the tripwire sees a substitution under %s", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  test("a BACKTICK span in prose is still excluded", () => {
    // The markdown-code-span guard survives: only backticks are ambiguous.
    const prose = "const m = 'apply to validation via `psql \"$T\" -f <m>`';";
    expect(scanBinaryIndirection(prose, "x.mjs")).toHaveLength(0);
  });

  test("a backtick substitution under a real wrapper is still seen", () => {
    const source = "const c = 'printf x `psql -qAt mydb`'; execSync(c);";
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  // Shell control syntax precedes a command without being a wrapper.
  test.each([
    ["negation", "! psql -qAt mydb\n"],
    ["an if condition", "if psql -qAt mydb; then\n  echo ok\nfi\n"],
    ["a while condition", "while psql -qAt mydb; do\n  echo ok\ndone\n"],
    ["an until condition", "until psql -qAt mydb; do\n  echo ok\ndone\n"],
    ["a brace group", "{ psql -qAt mydb; }\n"],
    ["a coprocess", "coproc psql -qAt mydb\n"],
  ])("%s is a shell site", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["negation", `const c = "! psql -qAt mydb"; execSync(c);`, true],
    ["an if condition", `const c = "if psql -qAt mydb; then echo ok; fi"; execSync(c);`, true],
    ["a brace group", `const c = "{ psql -qAt mydb; }"; execSync(c);`, true],
    // Control syntax vouches for a FLAGGED command, never for a flagless one:
    // "if psql fails" is a sentence, and nothing in the prefix says otherwise.
    ["a sentence starting with if", `const m = "if psql fails";`, false],
    ["a sentence starting with while", `const m = "while psql runs";`, false],
  ])("the tripwire sees %s -> %s", (_name, source, expected) => {
    expect(scanBinaryIndirection(source, "x.mjs").length > 0).toBe(expected);
  });

  // The reported line must be the PHYSICAL line, in all three directions the
  // old opening-line-plus-span arithmetic got wrong. A wrong line is not
  // cosmetic: exemptionOnLines reads it, so it could match a marker written
  // for a different statement.
  test("a later concatenation fragment reports its own physical line", () => {
    const source = ["execSync(", '  "echo one " +', '    "psql -qAt mydb"', ");", ""].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(3);
  });

  test("an interpolation in a multi-line template does not shift the line", () => {
    const source = [
      "execSync(",
      "  `echo ${a}",
      "   echo ${b}",
      "   psql -qAt mydb`",
      ");",
      "",
    ].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(4);
  });

  test("a cooked newline consumes no physical line", () => {
    const source = ["execSync(", '  "echo one\\npsql -qAt mydb"', ");", ""].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
  });

  test("the corrected line is what exemption lookup uses, and it fails SAFE", () => {
    // The line matters because `exemptionOnLines` reads it. A comment buried
    // mid-expression is not statement-boundary trivia, so the TypeScript
    // scanner does not report it and no exemption is granted — the conservative
    // direction. What must never happen is the reverse: a line pointing
    // somewhere else, where an unrelated marker could exempt this site.
    const source = [
      "execSync(",
      '  "echo one " +',
      `    // ${EXEMPTION_MARKER} scratch container, no HOME`,
      '    "psql -qAt mydb"',
      ");",
      "",
    ].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(4);
    expect(sites[0]!.exemptReason).toBeNull();
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a marker on the line ABOVE a single-line command still exempts", () => {
    const source = [
      `// ${EXEMPTION_MARKER} scratch container, no HOME`,
      'execSync("psql -qAt mydb");',
      "",
    ].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
    expect(sites[0]!.exemptReason).toBe("scratch container, no HOME");
  });
});

describe("R12 escaping mutants — a wrong line is a FALSE SAFE", () => {
  // Both of these are the reviewer's mutants verbatim. The shape is the same in
  // each: an unprotected psql is reported one line early, lands on a protected
  // call's exemption comment, and inherits an exemption written for something
  // else — so the live-tree `unprotected` list comes back empty.
  const EXEMPT_FIRST = `execFileSync("psql", ["-X"]); // ${EXEMPTION_MARKER} first call is intentionally exempt`;

  test("a backslash-newline continuation does not pull psql onto the line above", () => {
    // The continuation consumes a physical line while producing no cooked
    // character, so raw and cooked newline counts disagree.
    const source = [EXEMPT_FIRST, 'execSync("echo hi && \\', 'psql -qAt mydb");', ""].join("\n");
    const sites = scanSource(source, "scripts/mutant.mjs");
    expect(sites).toHaveLength(2);
    expect(sites[1]!.line).toBe(3);
    expect(sites[1]!.exemptReason).toBeNull();
    expect(sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null)).toHaveLength(
      1,
    );
  });

  test("a multiline `bash -c` script does not pull psql onto the line above", () => {
    // The script word is quote-stripped, so an offset measured inside it is not
    // contiguous with the opening quote's index.
    const source = [EXEMPT_FIRST, "execSync(`bash -c 'echo hi", "psql -qAt mydb'`);", ""].join(
      "\n",
    );
    const sites = scanSource(source, "scripts/mutant.mjs");
    expect(sites).toHaveLength(2);
    expect(sites[1]!.line).toBe(3);
    expect(sites[1]!.exemptReason).toBeNull();
    expect(sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null)).toHaveLength(
      1,
    );
  });

  test.each(["sh", "bash", "zsh"])("the same holds for a multiline `%s -c`", (shell) => {
    const source = [EXEMPT_FIRST, `execSync(\`${shell} -c "echo hi`, 'psql -qAt mydb"`);', ""].join(
      "\n",
    );
    const sites = scanSource(source, "scripts/mutant.mjs");
    expect(sites[1]!.line).toBe(3);
    expect(sites[1]!.exemptReason).toBeNull();
  });

  test("a multiline `eval` argument maps the same way", () => {
    const source = [EXEMPT_FIRST, "execSync(`eval 'echo hi", "psql -qAt mydb'`);", ""].join("\n");
    const sites = scanSource(source, "scripts/mutant.mjs");
    expect(sites[1]!.line).toBe(3);
    expect(sites[1]!.exemptReason).toBeNull();
  });

  test.each([
    ["\\x70sql", 'execSync("\\x70sql -qAt mydb");'],
    ["\\u0070sql", 'execSync("\\u0070sql -qAt mydb");'],
    ["\\u{70}sql", 'execSync("\\u{70}sql -qAt mydb");'],
  ])("a %s escape still maps to its own line", (_name, call) => {
    const source = ["const a = 1;", call, ""].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("an alias to a MULTILINE anchor reports the `run:` key, not a line past EOF", () => {
    const source = [
      "env:",
      "  CMD: &cmd |",
      "    echo ready",
      "    psql -qAt mydb",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: *cmd",
      "",
    ].join("\n");
    const physicalLines = source.trimEnd().split("\n").length;
    const sites = scanSource(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(8);
    expect(sites[0]!.line).toBeLessThanOrEqual(physicalLines);
  });

  test("a NON-alias block scalar still reports its own physical line", () => {
    // The alias pin must not swallow the ordinary case.
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      "          echo ready",
      "          psql -qAt mydb",
      "",
    ].join("\n");
    const sites = scanSource(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(6);
  });
});

describe("R13 escaping mutants — bash dynamic-FD redirections", () => {
  // Bash REMOVES `{fd}>…` exactly as it removes `2>…`, so the real argv of
  // `psql -F {fd}>/dev/null -X mydb` is `-F -X mydb` — where `-X` is the field
  // separator and suppresses nothing (probed: `psql -F` errors "option requires
  // an argument -- F", `psql -F -X --version` connects). Keeping the phantom
  // word as `-F`'s value certified the `-X` behind it: a false safe.
  test.each([
    "{fd}>/dev/null",
    "{fd}>>/dev/null",
    "{fd}</dev/null",
    "{fd}<>/dev/null",
    "{fd}<<<data",
    "{fd}<<EOF",
    "{fd}<<-EOF",
    "{myFd_2}>/dev/null",
    // The numeric and bare forms must keep behaving the same way.
    "2>/dev/null",
    ">/dev/null",
  ])("`psql -F %s -X mydb` does NOT count as suppressed", (redirection) => {
    const sites = sitesIn(`psql -F ${redirection} -X mydb\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tokens).toEqual(["-F", "-X", "mydb"]);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a dynamic FD does not swallow a genuinely separate -X", () => {
    // Precision: with -X BEFORE the option that would eat it, suppression holds.
    const sites = sitesIn("psql -X -F {fd}>/dev/null mydb\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("a brace word that is NOT an fd prefix stays an argv token", () => {
    // `{a,b}` is brace expansion, not a file descriptor, so it must not be
    // silently dropped the way `{fd}>` is.
    const sites = sitesIn("psql -X -c {a,b} mydb\n", "x.sh");
    expect(sites[0]!.tokens).toContain("{a,b}");
  });
});

describe("R14 escaping mutants", () => {
  // `{ shell: true }` makes node join argv with spaces and hand it to the
  // shell, which removes redirections and re-splits. The literal reading saw a
  // standalone `-X`; the real argv is `-F -X mydb`, where `-X` is the field
  // separator. Certified is a FALSE SAFE.
  test.each(["execFileSync", "execFile", "spawnSync", "spawn"])(
    "%s argv that only suppresses under a LITERAL reading is not certified",
    (callee) => {
      const source = `${callee}("psql", ["-F", "2>/dev/null", "-X", "mydb"], { shell: true });`;
      const sites = scanSource(source, "x.mjs");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test.each([
    ['{ "shell": true }', `{ "shell": true }`],
    ["{ [`shell`]: true }", "{ ['shell']: true }"],
    ["{ shell }", "{ shell }"],
    ["an external identifier", "options"],
    ["no options object at all", undefined],
  ])("the same holds with %s — the options object is never read", (_name, options) => {
    const tail = options === undefined ? "" : `, ${options}`;
    const source = `execFileSync("psql", ["-F", "2>/dev/null", "-X", "mydb"]${tail});`;
    expect(scanSource(source, "x.mjs")[0]!.suppressesStartupFiles).toBe(false);
  });

  test("an ordinary options-first argv is still certified", () => {
    // Precision: the dual reading must not cost the 75 real call sites.
    const source = `execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", dsn]);`;
    expect(scanSource(source, "x.mjs")[0]!.suppressesStartupFiles).toBe(true);
  });

  test("a quoted -c value with a space is still certified", () => {
    const source = `execFileSync("psql", ["-X", "-c", "select 1", dsn]);`;
    expect(scanSource(source, "x.mjs")[0]!.suppressesStartupFiles).toBe(true);
  });

  // Ordinary command-STRING consumers beyond the shells and `eval`.
  test.each([
    ["env -S", 'env -S "psql -qAt mydb"'],
    ["env -S attached", 'env -S"psql -qAt mydb"'],
    ["ssh with a quoted remote command", 'ssh database "psql -qAt mydb"'],
    ["su -c", 'su - postgres -c "psql -qAt mydb"'],
    ["runuser -c", 'runuser -u postgres -c "psql -qAt mydb"'],
    ["watch", 'watch "psql -qAt mydb"'],
  ])("%s is a site", (_name, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["a JS shell string", `execSync('su - postgres -c "psql -qAt mydb"');`, "x.mjs"],
    [
      "a workflow run block",
      'jobs:\n  a:\n    steps:\n      - run: |\n          ssh db "psql -qAt mydb"\n',
      ".github/workflows/x.yml",
    ],
  ])("%s reaches the same consumers", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a protected command inside a consumer still counts", () => {
    expect(sitesIn('ssh database "psql -X -qAt mydb"\n', "x.sh")[0]!.suppressesStartupFiles).toBe(
      true,
    );
  });

  test("a bare ssh host word is not mistaken for a script", () => {
    // Precision: only a word carrying whitespace is a candidate command string.
    expect(sitesIn("ssh database uptime\n", "x.sh")).toHaveLength(0);
  });
});

describe("R15 escaping mutants", () => {
  // An ATTACHED redirection. `<` and `>` are metacharacters: they terminate the
  // word rather than joining it, so bash really runs `psql -F -X mydb` and the
  // `-X` is the field separator. Certifying it was a FALSE SAFE.
  test.each([">", ">>", "<", "<>", ">|", "<<<", "<<", "<<-"])(
    "`psql -F%s/dev/null -X mydb` is not certified",
    (operator) => {
      const sites = sitesIn(`psql -F${operator}/dev/null -X mydb\n`, "x.sh");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.tokens).toEqual(["-F", "-X", "mydb"]);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test("an attached redirection after a NON-arg-taking flag still suppresses", () => {
    // Precision: `-X` itself takes no argument, so nothing can swallow it.
    expect(sitesIn("psql -X>/dev/null -qAt mydb\n", "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  // Long option spellings of the command-string consumers.
  test.each([
    ["env --split-string=", 'env --split-string="psql -qAt mydb"'],
    ["env --split-string separate", 'env --split-string "psql -qAt mydb"'],
    ["su --command separate", 'su - postgres --command "psql -qAt mydb"'],
    ["su --session-command=", 'su - postgres --session-command="psql -qAt mydb"'],
    ["runuser --command=", 'runuser - postgres --command="psql -qAt mydb"'],
    ["runuser --session-command=", 'runuser - postgres --session-command="psql -qAt mydb"'],
    // ssh option VALUES are not the remote command; the real one sits behind them.
    ["ssh -o with a separate value", 'ssh -o "ProxyCommand=nc %h %p" database "psql -qAt mydb"'],
    ["ssh -o attached", 'ssh -oProxyCommand="nc %h %p" database "psql -qAt mydb"'],
  ])("%s is a site", (_name, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("an ssh option value alone is not a site", () => {
    // Precision: a ProxyCommand that mentions no psql must stay silent.
    expect(sitesIn('ssh -o "ProxyCommand=nc %h %p" database uptime\n', "x.sh")).toHaveLength(0);
  });

  // An exemption marker covers ONE invocation. Shared claims exempt NOBODY.
  test.each([
    [
      "adjacent lines in JS",
      `execFileSync("psql", ["-qAt", a]); // ${EXEMPTION_MARKER} first call only, scratch container\nexecFileSync("psql", ["-qAt", b]);\n`,
      "x.mjs",
    ],
    [
      "adjacent lines in shell",
      `psql -qAt a # ${EXEMPTION_MARKER} first call only, scratch container\npsql -qAt b\n`,
      "x.sh",
    ],
    [
      "two calls on ONE line",
      `psql -qAt a; psql -qAt b # ${EXEMPTION_MARKER} second call only, scratch container\n`,
      "x.sh",
    ],
    [
      "adjacent lines in a workflow run block",
      `jobs:\n  a:\n    steps:\n      - run: |\n          psql -qAt a # ${EXEMPTION_MARKER} first call only, scratch container\n          psql -qAt b\n`,
      ".github/workflows/x.yml",
    ],
  ])("a marker does not bleed across %s", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(2);
    expect(sites.every((s) => s.exemptReason === null)).toBe(true);
    expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
  });

  test("a marker with exactly one claimant still exempts", () => {
    const source = `psql -qAt a # ${EXEMPTION_MARKER} genuinely exempt, scratch container\n`;
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBe("genuinely exempt, scratch container");
  });

  test("two DISTINCT markers each exempt their own site", () => {
    const source = [
      `psql -qAt a # ${EXEMPTION_MARKER} first reason, scratch container`,
      `psql -qAt b # ${EXEMPTION_MARKER} second reason, other container`,
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(2);
    expect(sites[0]!.exemptReason).toBe("first reason, scratch container");
    expect(sites[1]!.exemptReason).toBe("second reason, other container");
  });
});

// ── shell scripts ───────────────────────────────────────────────────────

describe("scanSource — shell", () => {
  test("a bare psql command in a .sh file is a site", () => {
    const sites = sitesIn('psql -U supabase_admin -d postgres -c "select 1"\n', "scripts/x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.form).toBe("shell");
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("backslash line continuations are joined before the flags are read", () => {
    const sites = sitesIn(
      ['docker exec "$DB" \\', "  psql -U supabase_admin \\", '  -X -c "select 1"'].join("\n"),
      "scripts/x.sh",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
    expect(sites[0]!.line).toBe(2);
  });

  test("an UNQUOTED wrapper argument still leaves psql visible", () => {
    // The reason the matcher is a denylist: an allowlist of command-position
    // prefixes has to enumerate every wrapper, and silently misses this one.
    const sites = sitesIn('docker exec $DB_CONTAINER psql -U postgres -c "select 1"\n', "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a # inside quotes does not truncate the flag list", () => {
    const sites = sitesIn(`psql -c "select '# not a comment'" -X "$DSN"\n`, "scripts/x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // Review R2 probes. An unrelated `-X` later on the SAME LINE used to be read
  // as this call's flag, so an unprotected invocation reported safe.
  test.each([
    ["psql $A -qAt; psql -X $B", "semicolon"],
    ["psql $A -qAt && echo -X", "&&"],
    ["psql $A -qAt || echo -X", "||"],
    ["psql $A -qAt | echo -X", "pipe"],
    ["psql $A -qAt & echo -X", "background &"],
  ])("a -X after %j (%s) does not protect the first call", (source) => {
    const first = sitesIn(`${source}\n`, "x.sh")[0]!;
    expect(first.suppressesStartupFiles).toBe(false);
    expect(first.tokens).not.toContain("-X");
  });

  test("a redirection & is not a separator, and a quoted ; is not either", () => {
    // `2>&1` and `> out` are consumed by the shell, so they never reach argv.
    expect(sitesIn("psql -qAt 2>&1 -X $A\n", "x.sh")[0]!.suppressesStartupFiles).toBe(true);
    expect(sitesIn("psql -qAt > out.txt -X $A\n", "x.sh")[0]!.suppressesStartupFiles).toBe(true);
    expect(
      sitesIn(`psql -X -c "select 1; select 2" "$A"\n`, "x.sh")[0]!.suppressesStartupFiles,
    ).toBe(true);
  });

  test("an escaped quote cannot fake a comment and grant an exemption", () => {
    const sites = sitesIn(
      `psql -qAt -c "sel \\" # ${EXEMPTION_MARKER} unrelated value"\n`,
      "scripts/x.sh",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a path-prefixed binary in shell text is a site", () => {
    // R1 probe: only the JS path knew about `/usr/bin/psql`; the shell matcher
    // required a bare word, so an absolute path slipped through.
    const sites = sitesIn('/usr/local/bin/psql "$DSN" -qAt -c "select 1"\n', "scripts/x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sitesIn('/usr/bin/psql -X "$DSN"\n', "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  test("psqlrc and postgresql are not psql", () => {
    expect(sitesIn("cat /usr/share/postgresql/psqlrc\n", "x.sh")).toHaveLength(0);
    expect(sitesIn("apt-get install -y postgresql-client\n", "x.sh")).toHaveLength(0);
  });

  test("`command -v psql` is a probe, not an invocation", () => {
    expect(
      sitesIn("command -v psql >/dev/null || sudo apt-get install -y postgresql-client\n", "x.sh"),
    ).toHaveLength(0);
    expect(sitesIn("which psql\ntype psql\nhash psql\n", "x.sh")).toHaveLength(0);
    expect(sitesIn('echo psql -c "select 1"\n', "x.sh")).toHaveLength(0);
  });

  test("`command psql` IS an invocation — only `-v` is denied, so the probe stays excluded", () => {
    expect(sitesIn('command psql -c "select 1"\n', "x.sh")).toHaveLength(1);
    expect(sitesIn("command -v psql\n", "x.sh")).toHaveLength(0);
  });

  test("a commented-out psql line is not a site", () => {
    expect(sitesIn('# psql -c "select 1" would run here\n', "scripts/x.sh")).toHaveLength(0);
  });

  test("psql after a pipe or && is still command position", () => {
    expect(sitesIn('true && psql -c "select 1"\n', "scripts/x.sh")).toHaveLength(1);
    expect(sitesIn('cat f.sql | psql "$DSN"\n', "scripts/x.sh")).toHaveLength(1);
  });
});

// ── workflow YAML ───────────────────────────────────────────────────────

describe("scanSource — workflow YAML", () => {
  test("psql inside a run: block is a site, with the right line", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - name: Seed",
      "        run: |",
      '          psql "$DSN" -c "select 1"',
      "",
    ].join("\n");
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(6);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a QUOTED single-line run: scalar is a site, not just a `run: |` block", () => {
    const source = ["jobs:", "  x:", "    steps:", '      - run: "psql -qAt -c select 1"', ""].join(
      "\n",
    );
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(4);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("psql in a step `name:` or a comment is not a site", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      # bootstrap shells out to psql",
      "      - name: Install psql (db:seed shells out to psql)",
      "        run: command -v psql >/dev/null || sudo apt-get install -y postgresql-client",
      "",
    ].join("\n");
    expect(sitesIn(source, ".github/workflows/x.yml")).toHaveLength(0);
  });
});

// ── the exemption mechanism ─────────────────────────────────────────────

describe("exemptions", () => {
  test("an inline marker with a reason exempts the site", () => {
    const sites = sitesIn(
      [
        `// ${EXEMPTION_MARKER} runs in a scratch container with no HOME`,
        `execFileSync("psql", [dbUrl, "-qAt"]);`,
      ].join("\n"),
      "scripts/x.mjs",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBe("runs in a scratch container with no HOME");
  });

  test("a trailing marker on the invocation line also counts", () => {
    const sites = sitesIn(
      `execFileSync("psql", [dbUrl, "-qAt"]); // ${EXEMPTION_MARKER} deliberate .psqlrc workflow`,
      "scripts/x.mjs",
    );
    expect(sites[0]!.exemptReason).toBe("deliberate .psqlrc workflow");
  });

  // Review R1 probe: the marker used to be matched anywhere on the line, so a
  // DATA VALUE containing it granted a silent exemption. An exemption is a
  // deliberate reviewable act; only a comment can grant one.
  test("the marker in a shell STRING, not a comment, does not exempt", () => {
    const sites = sitesIn(
      `psql -qAt -c "select 1"; x="${EXEMPTION_MARKER} unrelated value"\n`,
      "scripts/x.sh",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("the marker in a JS string literal, not a comment, does not exempt", () => {
    const sites = sitesIn(
      `execFileSync("psql", [dbUrl, "-qAt"]); const note = "${EXEMPTION_MARKER} nope";`,
      "scripts/x.mjs",
    );
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test.each([
    ["a URL's // inside a string", `const u = "http://x/${EXEMPTION_MARKER} unrelated";`],
    ["a /* inside a string", `const t = "/* ${EXEMPTION_MARKER} unrelated";`],
  ])("%s cannot fake a comment", (_name, tail) => {
    const sites = sitesIn(`execFileSync("psql", ["-qAt", dbUrl]); ${tail}`, "scripts/x.mjs");
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a genuine // comment on the same line still exempts", () => {
    const sites = sitesIn(
      `execFileSync("psql", ["-qAt", dbUrl]); // ${EXEMPTION_MARKER} a genuine documented reason`,
      "scripts/x.mjs",
    );
    expect(sites[0]!.exemptReason).toBe("a genuine documented reason");
  });

  // R3 probe: a per-line comment scan cannot see that a line sits inside a
  // string opened EARLIER, so a `#` (or `//`) on a continuation line looked
  // like a comment and exempted from string data.
  test("a # inside a multi-line shell string does not exempt", () => {
    const source = [
      "#!/usr/bin/env bash",
      'x="opening',
      `# ${EXEMPTION_MARKER} unrelated string data`,
      'closing"',
      "psql -qAt $DSN",
    ].join("\n");
    const sites = sitesIn(source, "scripts/probe.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a // inside a multi-line JS template does not exempt", () => {
    const source = [
      "const t = `",
      `// ${EXEMPTION_MARKER} unrelated`,
      "`;",
      `execFileSync("psql", ["-qAt", dbUrl]);`,
    ].join("\n");
    expect(sitesIn(source, "x.mjs")[0]!.exemptReason).toBeNull();
  });

  test("a genuine shell # comment on the preceding line still exempts", () => {
    const source = [`# ${EXEMPTION_MARKER} a genuine documented reason`, "psql -qAt $DSN"].join(
      "\n",
    );
    expect(sitesIn(source, "x.sh")[0]!.exemptReason).toBe("a genuine documented reason");
  });

  test("a marker with no reason does NOT exempt", () => {
    const sites = sitesIn(
      [`// ${EXEMPTION_MARKER}`, `execFileSync("psql", [dbUrl, "-qAt"]);`].join("\n"),
      "scripts/x.mjs",
    );
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a shell marker on the preceding comment line counts", () => {
    const sites = sitesIn(
      [`# ${EXEMPTION_MARKER} container has no writable HOME`, 'psql -c "select 1"'].join("\n"),
      "scripts/x.sh",
    );
    expect(sites[0]!.exemptReason).toBe("container has no writable HOME");
  });
});

// ── the indirection tripwire ────────────────────────────────────────────

describe("scanBinaryIndirection", () => {
  test("binding the binary name to a variable is refused", () => {
    const hits = scanBinaryIndirection(
      `const PSQL = "psql";\nexecFileSync(PSQL, [dbUrl]);`,
      "x.ts",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(1);
  });

  test("the literal at a recognized call site is not an indirection hit", () => {
    expect(scanBinaryIndirection(`execFileSync("psql", [dbUrl, "-X"]);`, "x.ts")).toHaveLength(0);
  });
});

// ── LIVE: the whole tree ────────────────────────────────────────────────

describe("live tree scan", () => {
  test(
    "the walk is not vacuous — it finds the known psql surface",
    () => {
      const usage = liveTreeUsage();
      expect(usage.filesScanned).toBeGreaterThan(500);
      expect(usage.sites.length).toBeGreaterThanOrEqual(60);
      for (const prefix of ["scripts/", "supabase/", "tests/db/", "lib/"]) {
        expect(
          usage.sites.some((s) => s.file.startsWith(prefix)),
          `expected at least one psql site under ${prefix}`,
        ).toBe(true);
      }
      expect(usage.sites.some((s) => s.form === "shell")).toBe(true);
      expect(usage.sites.some((s) => s.form === "spawn")).toBe(true);
      expect(usage.sites.some((s) => s.form === "spawnSync")).toBe(true);
    },
    WALK_TIMEOUT_MS,
  );

  test(
    "every psql invocation suppresses startup files (or is explicitly exempt)",
    () => {
      const usage = liveTreeUsage();
      const unprotected = usage.sites
        .filter((s) => !s.suppressesStartupFiles && s.exemptReason === null)
        .map((s) => `${s.file}:${s.line} [${s.form}] ${s.tokens.join(" ")}`);
      expect(
        unprotected,
        `psql call sites that read startup files (add "-X", or an inline\n` +
          `\`${EXEMPTION_MARKER} <reason>\` comment):\n  ${unprotected.join("\n  ")}`,
      ).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );

  test(
    "no call site hides the binary name behind an identifier",
    () => {
      const usage = liveTreeUsage();
      const hits = usage.indirections.map((h) => `${h.file}:${h.line} ${h.text}`);
      expect(
        hits,
        `psql must be passed as a literal argv[0] so this guard can see the flags:\n  ${hits.join("\n  ")}`,
      ).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );

  test(
    "the walk read every directory — an unreadable path is an incomplete census",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.unreadable,
        `the psql census is INCOMPLETE — these paths could not be read, so any call site under ` +
          `them was silently omitted:\n  ${usage.unreadable.join("\n  ")}`,
      ).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );

  test(
    "every exemption carries a reason",
    () => {
      const usage = liveTreeUsage();
      for (const site of usage.sites.filter((s) => s.exemptReason !== null)) {
        expect(site.exemptReason!.length, `${site.file}:${site.line}`).toBeGreaterThan(10);
      }
    },
    WALK_TIMEOUT_MS,
  );
});

// ── the unreadable-directory mutant (review R1) ─────────────────────────

describe("an unreadable directory is reported, never skipped", () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

  // Review R1 escaping mutant: `chmod 000 scripts/ci` dropped the live census
  // from 73 sites to 71 and the guard still PASSED, because the walk swallowed
  // the readdir failure. A silent under-count is the exact failure this file
  // exists to prevent, so the walk now records it and the live scan asserts the
  // list is empty. Root bypasses directory permissions, so the probe cannot run
  // there — the live assertion above still holds either way.
  test.skipIf(isRoot)("chmod 000 on a directory holding a psql site fails the census", () => {
    const root = mkdtempSync(join(tmpdir(), "psql-unreadable-"));
    const blocked = join(root, "scripts");
    mkdirSync(blocked, { recursive: true });
    writeFileSync(join(blocked, "probe.sh"), 'psql "$DSN" -qAt -c "select 1"\n', "utf8");

    expect(collectPsqlUsage(root).sites).toHaveLength(1);

    chmodSync(blocked, 0o000);
    try {
      const usage = collectPsqlUsage(root);
      expect(usage.sites).toHaveLength(0); // the site really did vanish...
      expect(usage.unreadable).toEqual(["scripts"]); // ...and the guard says so
    } finally {
      chmodSync(blocked, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── ROOT SKIP SET: derived from the committed .gitignore ────────────────
//
// `IGNORED_AT_ROOT` was a hand-list, so every new build-output directory this
// repo's tooling writes (`.next-dev`, `.next-prod`, `.next-prod-flip`,
// `.next-screenshots-help`, …) was walked, and the recursive AST `visit`
// overflowed on a multi-MB generated bundle: `RangeError: Maximum call stack
// size exceeded`, 19 cases red, NO FILE NAMED (BL-PSQL-SCAN-NEXT-VARIANT-BUILD-
// DIRS / BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS, the same defect filed twice).
// The skip set is now DERIVED from the committed root `.gitignore`, so a fifth
// build target needs no edit here, and anything the walk still reaches either
// gets analyzed or fails LOUD with its own path.

describe("rootSkipNamesFromGitignore — the accept-set is keyed on structure", () => {
  // Expectations are the literal strings in this table, never the
  // implementation's own output re-fed to itself.
  test.each([
    [".next-dev/", ".next-dev"],
    ["/screenshots/", "screenshots"],
    ["out", "out"],
    [".vercel", ".vercel"],
  ])("the plain-name row %j contributes %j", (line, name) => {
    expect([...rootSkipNamesFromGitignore(line)]).toEqual([name]);
  });

  test.each([
    ["*.log", "a glob metacharacter"],
    [".env.*.local", "an interior glob"],
    ["!keep/", "a negation"],
    ["a/b/", "a nested path"],
    [".codex-companion*/", "a trailing wildcard"],
    ["# comment", "a comment"],
    ["#nospace", "a comment with no space after the hash"],
    ["", "an empty line"],
    ["  out  ", "significant surrounding whitespace"],
  ])("%j is rejected — %s contributes nothing", (line) => {
    expect([...rootSkipNamesFromGitignore(line)]).toEqual([]);
  });

  test("a multi-line file contributes exactly its plain-name rows", () => {
    const text = [
      "# Build output",
      "dist/",
      "*.log",
      "",
      "/screenshots/",
      "!keep/",
      "playwright/.cache/",
      "out",
    ].join("\n");
    expect(rootSkipNamesFromGitignore(text)).toEqual(new Set(["dist", "screenshots", "out"]));
  });

  test("CRLF line endings do not smuggle a carriage return into the name", () => {
    expect(rootSkipNamesFromGitignore("dist/\r\nout\r\n")).toEqual(new Set(["dist", "out"]));
  });
});

describe("the walk skips gitignore-declared roots and names what it cannot parse", () => {
  /** A left-nested binary expression far past the recursive visitor's frame
   * budget — the shape a generated webpack chunk has, minus the megabytes. */
  const DEEP_BUNDLE = `const x = ${"1+".repeat(60000)}1;\n`;
  const PSQL_SITE = 'execFileSync("psql", ["-qAt", dsn]);\n';

  function buildTree(gitignoreText: string | null): string {
    const root = mkdtempSync(join(tmpdir(), "psql-gitignore-"));
    if (gitignoreText !== null) writeFileSync(join(root, ".gitignore"), gitignoreText, "utf8");
    mkdirSync(join(root, "genout"), { recursive: true });
    writeFileSync(join(root, "genout", "bundle.js"), DEEP_BUNDLE, "utf8");
    writeFileSync(join(root, "run.ts"), PSQL_SITE, "utf8");
    return root;
  }

  test("a gitignored generated directory is skipped; the sibling call site is still found", () => {
    const root = buildTree("genout/\n");
    try {
      const usage = collectPsqlUsage(root);
      expect(usage.sites).toHaveLength(1);
      expect(usage.sites[0]!.file).toBe("run.ts");
      expect(usage.filesScanned).toBe(1); // the bundle was never handed to the scan
      expect(usage.unreadable).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("PREMISE — without the ignore row the same bundle is walked and fails BY NAME", () => {
    const root = buildTree(null);
    try {
      // Premise: the fixture can fail. A tree that cannot red proves nothing
      // about the tree that does not.
      let thrown: unknown = null;
      try {
        collectPsqlUsage(root);
      } catch (error) {
        thrown = error;
      }
      premiseHolds("the deep bundle overflows the recursive visitor when walked", thrown !== null);
      expect(String((thrown as Error).message)).toContain("genout/bundle.js");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an ABSENT .gitignore yields an empty derived set, not a fallback to literals", () => {
    const root = mkdtempSync(join(tmpdir(), "psql-nogitignore-"));
    try {
      mkdirSync(join(root, "out"), { recursive: true });
      writeFileSync(join(root, "out", "probe.sh"), 'psql "$DSN" -qAt -c "select 1"\n', "utf8");
      // `out` is a literal of the PRE-ARC hand-list. With no `.gitignore` at
      // this root the derived set is empty, so the site is found.
      expect(collectPsqlUsage(root).sites).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the ratified root-relative `docs` skip survives the derivation", () => {
    const root = mkdtempSync(join(tmpdir(), "psql-docs-skip-"));
    try {
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "quoted.sh"), 'psql "$DSN" -qAt -c "select 1"\n', "utf8");
      expect(collectPsqlUsage(root).sites).toHaveLength(0);
      expect(
        rootSkipNamesFromGitignore(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).has("docs"),
      ).toBe(false); // `docs` is composed in as a literal, not derived
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("analyzeNaming — a scan error names the file it was reading", () => {
  const boom = () => {
    throw new RangeError("Maximum call stack size exceeded");
  };

  test("the rethrown error carries the repo-relative path AND the original reason", () => {
    expect(() => analyzeNaming("app/deep/bundle.js", boom)).toThrow(/app\/deep\/bundle\.js/);
    expect(() => analyzeNaming("app/deep/bundle.js", boom)).toThrow(
      /Maximum call stack size exceeded/,
    );
  });

  test("a non-Error throw is named too", () => {
    expect(() =>
      analyzeNaming("lib/x.ts", () => {
        throw "a bare string";
      }),
    ).toThrow(/lib\/x\.ts/);
  });

  test("a successful analyzer's value passes through untouched", () => {
    const value = [{ marker: "identity" }];
    expect(analyzeNaming("x.ts", () => value)).toBe(value);
  });

  test("EVERY per-file analyzer call in collectPsqlUsage goes through the wrapper", () => {
    // Read from the AST, not from a text pattern. Two successive regex versions
    // of this row were escapable by an ORDINARY refactor, and both failed the
    // same way — the escaping call left BOTH the matched set and the wrapped
    // set, so the counts stayed equal and the row stayed green while the call
    // went unwrapped. `scan*(` missed a future analyzer named `inspectFoo`;
    // `(source, rel)` missed `scanSource(source, rel.trim())`, and equally
    // missed derived or aliased arguments, extra arguments, multiline calls and
    // member calls.
    //
    // The real invariant is semantic, so it is asserted semantically: every
    // READ of the file's text inside `collectPsqlUsage` must sit inside an
    // `analyzeNaming` callback. That is stronger than counting calls (an early
    // cut counted `sites.push(...analyzeNaming(...))` as an escape, because the
    // read it wraps is nested in the push's arguments) and it cannot be dodged
    // by changing how a call is spelled. Escapes are reported as statements, so
    // a failure names the line rather than a count.
    const text = readFileSync(join(REPO_ROOT, GUARD_MODULE), "utf8");
    const sourceFile = ts.createSourceFile(
      GUARD_MODULE,
      text,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );

    let collect: ts.FunctionDeclaration | undefined;
    const findCollect = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "collectPsqlUsage") collect = node;
      else ts.forEachChild(node, findCollect);
    };
    findCollect(sourceFile);
    premiseHolds("collectPsqlUsage is a function declaration in the guard module", !!collect);

    /** The local holding the file's text — what a per-file analyzer consumes. */
    const FILE_TEXT_BINDING = "source";

    /** A READ of that binding. Its declaration and the `readFileSync`
     * assignment that fills it are writes, and are not analysis. */
    const isRead = (id: ts.Identifier): boolean => {
      const parent = id.parent;
      if (ts.isVariableDeclaration(parent) && parent.name === id) return false;
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.left === id
      )
        return false;
      return true;
    };

    const enclosingStatement = (node: ts.Node): ts.Node => {
      let current: ts.Node = node;
      while (current.parent && !ts.isStatement(current)) current = current.parent;
      return current;
    };

    const escaping: string[] = [];
    let reads = 0;
    const visit = (node: ts.Node, insideWrapper: boolean): void => {
      let wrapped = insideWrapper;
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "analyzeNaming"
      ) {
        wrapped = true;
      }
      if (ts.isIdentifier(node) && node.text === FILE_TEXT_BINDING && isRead(node)) {
        reads++;
        if (!insideWrapper) {
          escaping.push(enclosingStatement(node).getText(sourceFile).replace(/\s+/g, " "));
        }
      }
      ts.forEachChild(node, (child) => visit(child, wrapped));
    };
    visit(collect!, false);

    premise("collectPsqlUsage reads the file's text at all", reads, 0);
    expect(escaping, "these reads of the file's text are not wrapped in analyzeNaming").toEqual([]);
  });
});

describe("the derived skip set for THIS repo's committed .gitignore", () => {
  const derived = () =>
    rootSkipNamesFromGitignore(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"));

  /** Every non-`docs` member of the pre-arc hand-list. The derivation must
   * subsume all of them or the change is a regression, not a widening. */
  const PRE_ARC_LITERALS = [
    ".next",
    ".turbo",
    ".vercel",
    "coverage",
    "dist",
    "build",
    "out",
    "playwright-report",
    "test-results",
  ];
  /** The build-output variants whose absence from the hand-list IS the defect. */
  const NEXT_VARIANTS = [
    ".next",
    ".next-dev",
    ".next-prod",
    ".next-prod-flip",
    ".next-build-artifact-gate-test",
    ".next-screenshots-help",
    ".next-prefetch-probe",
  ];
  /**
   * DERIVED from git, never enumerated.
   *
   * The hand-written version of this list read
   * `["app", "components", "lib", "scripts", "tests", "supabase"]` and omitted
   * `.github` — 20 tracked, scan-eligible workflow files. An ordinary
   * `.gitignore` row `.github/` would therefore have silently dropped all 20
   * from the walk with this pin still green and the `filesScanned` floor still
   * satisfied (3295 → 3275). That is the same defect the arc set out to fix,
   * reintroduced in the guard FOR the fix: a sweep verified by enumeration
   * re-opens the moment someone adds a site. A new tracked root carrying
   * scannable files is now covered by construction.
   */
  const TRACKED_SOURCE_ROOTS = (() => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const roots = new Set<string>();
    for (const path of tracked.split("\0")) {
      const slash = path.indexOf("/");
      if (slash <= 0) continue; // a root-level FILE has no directory to skip
      if (!SCANNABLE_EXTENSION.test(path)) continue;
      roots.add(path.slice(0, slash));
    }
    return [...roots].sort();
  })();

  test.each(PRE_ARC_LITERALS)("subsumes the pre-arc literal %s", (name) => {
    expect(derived().has(name)).toBe(true);
  });

  test.each(NEXT_VARIANTS)("contains the build-output variant %s", (name) => {
    expect(derived().has(name)).toBe(true);
  });

  // The §4.2 documented limit made executable: a TRACKED root directory named
  // by a plain-name row would be newly skipped. This is the stays-quiet pin.
  test("the derived roots really were derived, and cover the known source tree", () => {
    // Premise for every row below: a derivation that silently produced nothing
    // would make each `never contains` case vacuously true.
    premise("git yielded tracked roots holding scannable files", TRACKED_SOURCE_ROOTS.length, 5);
    expect(TRACKED_SOURCE_ROOTS).toEqual(
      expect.arrayContaining(["app", "lib", "tests", ".github"]),
    );
  });

  test.each(TRACKED_SOURCE_ROOTS)("never contains the tracked source root %s", (name) => {
    premiseHolds(`${name} is a real directory at the repo root`, existsSync(join(REPO_ROOT, name)));
    expect(derived().has(name)).toBe(false);
  });
});

// ── MUTANT PROBES: prove the guard bites on real files ──────────────────

describe("mutant probes", () => {
  test(`stripping -X from ${SEPARATE_X_SITE} makes the guard flag it`, () => {
    const real = readFileSync(join(REPO_ROOT, SEPARATE_X_SITE), "utf8");
    expect(scanSource(real, SEPARATE_X_SITE).every((s) => s.suppressesStartupFiles)).toBe(true);

    const mutant = real.replace('"-X", ', "");
    expect(mutant, "the mutation must actually change the file").not.toBe(real);

    const mutantSites = scanSource(mutant, SEPARATE_X_SITE);
    expect(mutantSites.length).toBeGreaterThan(0);
    expect(mutantSites.some((s) => !s.suppressesStartupFiles && s.exemptReason === null)).toBe(
      true,
    );
  });

  test(`${COMBINED_CLUSTER_SITE} stays green on its combined -qAtX spelling`, () => {
    const real = readFileSync(join(REPO_ROOT, COMBINED_CLUSTER_SITE), "utf8");
    expect(real).toContain('"-qAtX"');
    expect(
      real,
      "this probe is only meaningful while the site uses the COMBINED spelling",
    ).not.toContain('"-X"');
    const sites = scanSource(real, COMBINED_CLUSTER_SITE);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => s.suppressesStartupFiles)).toBe(true);
  });
});

describe("R16 escaping mutants", () => {
  // `env -S` is NOT shell quoting: `\_` is env's ARGUMENT SEPARATOR, so
  // `psql -F\_ -X mydb` really passes `-F -X mydb` and `-X` is `-F`'s value.
  test.each([
    ["-S separate", "env -S 'psql -F\\_ -X mydb'"],
    ["-S attached", "env -S'psql -F\\_ -X mydb'"],
    ["--split-string separate", "env --split-string 'psql -F\\_ -X mydb'"],
    ["--split-string=", "env --split-string='psql -F\\_ -X mydb'"],
  ])("env %s splits on the escape and is not certified", (_name, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tokens).toEqual(["-F", "-X", "mydb"]);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("an env -S command with a real -X still counts", () => {
    expect(sitesIn("env -S 'psql -X -qAt mydb'\n", "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  // A BARE glob or brace changes argv CARDINALITY without carrying a `$`.
  test.each([
    ["an unmatched glob under nullglob", "psql -f optional/*.sql -X mydb"],
    ["a multi-match glob", "psql -f supabase/migrations/*.sql -X mydb"],
    ["a brace expansion", "psql -f {first,second}.sql -X mydb"],
    ["a `?` pattern", "psql -f m?.sql -X mydb"],
    ["a bracket pattern", "psql -f m[0-9].sql -X mydb"],
  ])("%s refuses certification", (_name, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sites[0]!.hasDynamicTokens).toBe(true);
  });

  test.each([
    ["a quoted star", 'psql -X -c "select * from t" mydb'],
    ["a quoted brace", "psql -X -c 'select {1,2}' mydb"],
    ["an escaped star", "psql -X -c select\\ \\* mydb"],
  ])("%s is inert and still certifies", (_name, command) => {
    expect(sitesIn(`${command}\n`, "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  // The shell surface needs its OWN indirection tripwire; the JS one never ran
  // on .sh or .yml, so the header's backstop claim did not hold there.
  test.each([
    ["a variable assigned psql", 'PG=psql\n"$PG" -qAt mydb\n'],
    ["an exported path", "export PG=/usr/bin/psql\n"],
    ["an alias", 'shopt -s expand_aliases\nalias psql="psql -F"\npsql -X mydb\n'],
    ["a function, paren form", 'psql() { command psql -F "$@"; }\n'],
    ["a function, keyword form", 'function psql { command psql -F "$@"; }\n'],
  ])("%s is reported as an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test.each([
    ["an ordinary call", "psql -X -qAt mydb\n"],
    ["a mention inside a comment", "# PG=psql would be indirection\npsql -X -qAt mydb\n"],
    ["an unrelated variable", 'DSN=postgres://x\npsql -X -qAt "$DSN"\n'],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });
});

describe("R17 escaping mutants", () => {
  // A `...spread` is RUNTIME-SIZED. Empty at runtime it is no token at all, so
  // the arg-taking option before it swallows whatever follows instead.
  test.each(["execFileSync", "execFile", "spawnSync", "spawn"])(
    "%s: an arg-taking option before a spread cannot certify the -X after it",
    (callee) => {
      const source = `${callee}("psql", ["-F", ...optionalArgs, "-X", "mydb"]);`;
      const sites = scanSource(source, "x.mjs");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test.each([
    ["a long option", `execFileSync("psql", ["--field-separator", ...args, "-X", dsn]);`],
    ["an identifier argument", `execFileSync("psql", ["-F", sep, "-X", dsn]);`],
    [
      "a cluster ending in an arg-taking letter",
      `execFileSync("psql", ["-qF", ...args, "-X", dsn]);`,
    ],
  ])("%s behaves the same way", (_name, source) => {
    expect(scanSource(source, "x.mjs")[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["-X before the spread", `execFileSync("psql", ["-X", ...args, "-qAt", dsn]);`],
    ["a spread after a NON-arg-taking flag", `execFileSync("psql", ["-X", "-c", ...sql, dsn]);`],
    ["no spread at all", `execFileSync("psql", ["-F", ",", "-X", dsn]);`],
  ])("%s still certifies", (_name, source) => {
    expect(scanSource(source, "x.mjs")[0]!.suppressesStartupFiles).toBe(true);
  });

  // Ordinary executable discovery and whole-argument alias quotings.
  test.each([
    ["command -v discovery", 'PSQL=$(command -v psql)\n"$PSQL" -qAt mydb\n'],
    ["backtick discovery", 'PSQL=`command -v psql`\n"$PSQL" -qAt mydb\n'],
    ["which discovery", 'PSQL=$(which psql)\n"$PSQL" -qAt mydb\n'],
    ["a single-quoted alias", "shopt -s expand_aliases\nalias 'psql=psql -F'\npsql -X mydb\n"],
    ["a double-quoted alias", 'shopt -s expand_aliases\nalias "psql=psql -F"\npsql -X mydb\n'],
  ])("%s is reported as an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test.each([
    ["a plain call", "psql -X -qAt mydb\n"],
    ["an unrelated substitution", "ROWS=$(wc -l < f.txt)\npsql -X -qAt mydb\n"],
    ["a commented discovery", "# PSQL=$(command -v psql)\npsql -X -qAt mydb\n"],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });
});

describe("R18 escaping mutants — executable discovery, every spelling", () => {
  // The rule is STRUCTURAL: a command substitution whose body mentions psql but
  // yields no psql SITE is discovery. Working from the lexer's nested bodies
  // rather than a line regex closes the class rather than one spelling.
  test.each([
    ["a quoted $( ) assignment", 'PSQL="$(command -v psql)"\n"$PSQL" -qAt mydb\n'],
    ["a quoted backtick assignment", 'PSQL="`command -v psql`"\n"$PSQL" -qAt mydb\n'],
    ["a quoted which", 'PSQL="$(which psql)"\n"$PSQL" -qAt mydb\n'],
    ["a substitution wrapped across lines", 'PSQL="$(command -v \\\n  psql)"\n"$PSQL" -qAt mydb\n'],
    ["a substitution used DIRECTLY as the command word", "$(command -v psql) -qAt mydb\n"],
    ["the bare single-line assignment", 'PSQL=$(command -v psql)\n"$PSQL" -qAt mydb\n'],
  ])("%s is reported", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("`type -p psql` fails LOUDLY as an unprotected site, not silently", () => {
    // `-p` is deliberately not a probe flag (R9: `command -p psql` EXECUTES),
    // so this reads as a site rather than an indirection. Either way it is
    // loud; what must never happen is silence.
    const source = 'PSQL="$(type -p psql)"\n"$PSQL" -qAt mydb\n';
    const sites = scanSource(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a quoted workflow run: scalar is reached too", () => {
    const source =
      'jobs:\n  a:\n    steps:\n      - run: "PSQL=$(command -v psql); $PSQL -qAt mydb"\n';
    expect(scanShellIndirection(source, ".github/workflows/x.yml").length).toBeGreaterThan(0);
  });

  // Precision: a substitution that DOES produce a site is already handled as
  // one, and must not also be reported as an indirection.
  test.each([
    ["a real psql substitution", 'ROWS=$(psql -X -qAt mydb -c "select 1")\n'],
    ["a plain call", "psql -X -qAt mydb\n"],
    ["an unrelated substitution", "N=$(wc -l < f.txt)\npsql -X -qAt mydb\n"],
    ["a nested protected call", 'printf x "$(psql -X -qAt mydb)"\n'],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });
});

describe("R19 escaping mutants", () => {
  // The argv[0]-probe denylist may only fire on the probe's OWN first argument.
  // `command env -u echo psql` has `echo` three words in, under a DIFFERENT
  // program that `command` merely executes.
  test.each([
    ["under command", "command env -u echo psql -qAt mydb\n", "x.sh"],
    ["under command with a path", "command /usr/bin/env -u echo psql -qAt mydb\n", "x.sh"],
    ["in a JS shell string", `execSync("command env -u echo psql -qAt mydb");`, "x.mjs"],
    [
      "in a workflow run block",
      "jobs:\n  a:\n    steps:\n      - run: |\n          command env -u echo psql -qAt mydb\n",
      ".github/workflows/x.yml",
    ],
  ])("`env -u echo psql` is still a site %s", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["command -v psql", "command -v psql\n"],
    ["which psql", "which psql\n"],
    ["type psql", "type psql\n"],
    ["hash psql", "hash psql\n"],
  ])("%s is still NOT an invocation", (_name, source) => {
    expect(sitesIn(source, "x.sh")).toHaveLength(0);
  });

  // A literal command fed to a shell through STDIN. The psql text is an
  // argument to printf, so no allowlisted `-c` consumer is involved — but the
  // next pipeline stage is a bare shell, and that argument IS its script.
  test.each([
    ["printf into bash", "printf 'psql -qAt mydb\\n' | bash\n", "x.sh"],
    ["echo into sh", "echo 'psql -qAt mydb' | sh\n", "x.sh"],
    ["printf into zsh", "printf 'psql -qAt mydb\\n' | zsh\n", "x.sh"],
    ["a JS shell string", `execSync("printf 'psql -qAt mydb\\n' | bash");`, "x.mjs"],
    [
      "a workflow run block",
      "jobs:\n  a:\n    steps:\n      - run: |\n          printf 'psql -qAt mydb\\n' | bash\n",
      ".github/workflows/x.yml",
    ],
  ])("%s is a site", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a protected command piped into a shell still counts", () => {
    expect(
      sitesIn("printf 'psql -X -qAt mydb\\n' | bash\n", "x.sh")[0]!.suppressesStartupFiles,
    ).toBe(true);
  });

  test.each([
    ["a pipeline mentioning no psql", "printf 'echo hi\\n' | bash\n"],
    ["a pipe into a NON-shell", "printf 'psql -qAt mydb\\n' | tee out.txt\n"],
  ])("%s is not a site", (_name, source) => {
    expect(sitesIn(source, "x.sh")).toHaveLength(0);
  });

  test("a `bash -c` on the right of a pipe is read from -c, not from stdin", () => {
    // Precision: the stdin rule must not double-report when `-c` supplies the
    // script; `-c` wins and the printf argument is not a script.
    const sites = sitesIn("printf 'x' | bash -c 'psql -X -qAt mydb'\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });
});

describe("R20 escaping mutants", () => {
  // ssh(1): "the arguments will be appended to the command, separated by
  // spaces, before it is sent to the server to be executed." `eval` and `watch`
  // join the same way. So `ssh host psql -c "VACUUM;" -X mydb` really runs
  // `psql -c VACUUM; -X mydb` — the `;` ends psql and the `-X` never reaches it.
  test.each([
    ["ssh", 'ssh database psql -c "VACUUM;" -X mydb\n', "x.sh"],
    ["eval", 'eval "echo setup;" psql -c "VACUUM;" -X mydb\n', "x.sh"],
    ["watch", 'watch psql -c "VACUUM;" -X mydb\n', "x.sh"],
    ["ssh in a JS shell string", `execSync('ssh database psql -c "VACUUM;" -X mydb');`, "x.mjs"],
    [
      "ssh in a workflow run block",
      'jobs:\n  a:\n    steps:\n      - run: |\n          ssh database psql -c "VACUUM;" -X mydb\n',
      ".github/workflows/x.yml",
    ],
  ])("%s joins its arguments, so the trailing -X is not certified", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tokens).toEqual(["-c", "VACUUM"]);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["a plain protected remote command", "ssh database psql -X -qAt mydb\n"],
    ["a quoted protected remote command", 'ssh database "psql -X -qAt mydb"\n'],
    ["a protected eval", 'eval "psql -X -qAt mydb"\n'],
  ])("%s still certifies, and is counted ONCE", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("an ssh option value is still not mistaken for the remote command", () => {
    const sites = sitesIn('ssh -o "ProxyCommand=nc %h %p" database "psql -qAt mydb"\n', "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // A JS shell STRING can carry the same runtime binding a .sh file can.
  test.each([
    ["execSync", `execSync('PG=psql; "$PG" -qAt mydb');`],
    ["exec", `exec('PG=psql; "$PG" -qAt mydb');`],
    [
      "a shell command line as argv[0]",
      `execFileSync('PG=psql; "$PG" -qAt mydb', { shell: true });`,
    ],
    ["execFileSync via sh -c", `execFileSync("sh", ["-c", 'PG=psql; "$PG" -qAt mydb']);`],
    ["spawnSync via sh -c", `spawnSync("sh", ["-c", 'PG=psql; "$PG" -qAt mydb']);`],
    ["an alias in argv[0]", `spawn('alias psql="psql -F"; psql -X mydb', { shell: true });`],
  ])("%s is reported as an indirection", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  test.each([
    ["an ordinary literal call", `execFileSync("psql", ["-X", "-qAt", dsn]);`],
    ["an error message", 'const m = "psql exit ${c}: ${e}";'],
    // A BACKTICK span in JS prose is markdown, not a substitution.
    [
      "markdown prose in a JS string",
      'const m = "wrap with `command -v psql >/dev/null || (...)` to skip";',
    ],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs")).toHaveLength(0);
  });
});

describe("R21 escaping mutants", () => {
  // `__generated__` is TRACKED source here: lib/admin/__generated__ is imported
  // at runtime. Skipping it contradicted the fail-by-default contract.

  test.each(["lib/admin/__generated__", "lib/messages/__generated__", "supabase/__generated__"])(
    "an unprotected call under %s is a violation",
    (directory) => {
      const sites = scanSource(`execFileSync("psql", ["-qAt", dsn]);`, `${directory}/probe.ts`);
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test("the walk reaches a REAL tracked __generated__ file", () => {
    // devPanelPresent.ts exists and is runtime-imported; if the walk skipped
    // its directory the census would silently shrink.
    expect(existsSync(join(REPO_ROOT, "lib/admin/__generated__/devPanelPresent.ts"))).toBe(true);
    expect(collectPsqlUsage(join(REPO_ROOT, "lib", "admin", "__generated__")).filesScanned).toBe(1);
    expect(liveTreeUsage().filesScanned).toBeGreaterThan(2946);
  });

  // A joined consumer's command may span physical lines. The site must report
  // the line the psql WORD is on, or exemptionOnLines reads a marker written
  // for something else.
  test.each([["ssh host"], ["eval"], ["watch"]])(
    "%s: a psql in a LATER fragment reports its own physical line",
    (head) => {
      const source = [
        'import { spawnSync } from "node:child_process";',
        `// ${EXEMPTION_MARKER} unrelated marker for adjacent operation`,
        "spawnSync(`" + head + " env FOO=bar \\",
        "  psql -qAt mydb`, { shell: true });",
        "",
      ].join("\n");
      const sites = scanSource(source, "scripts/probe.mjs");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.line).toBe(4);
      expect(sites[0]!.exemptReason).toBeNull();
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test("the same holds in a shell file, and the FIRST site keeps its marker", () => {
    const source = [
      `psql -qAt a # ${EXEMPTION_MARKER} marker for the first only`,
      "ssh host env FOO=bar \\",
      "  psql -qAt mydb",
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(2);
    expect(sites[0]!.line).toBe(1);
    expect(sites[0]!.exemptReason).toBe("marker for the first only");
    expect(sites[1]!.line).toBe(3);
    expect(sites[1]!.exemptReason).toBeNull();
  });
});

describe("R22 escaping mutants", () => {
  // A QUOTED word can span physical lines. Stamping every character with the
  // word's OPENING line let a psql on a later line inherit a marker written
  // above the outer command.
  test.each([["ssh host"], ["eval"], ["watch"]])(
    "%s: a multiline quoted argument reports the psql word's own line",
    (head) => {
      const source = [
        `# ${EXEMPTION_MARKER} marker for an unrelated adjacent operation`,
        `${head} "echo setup`,
        'psql -qAt mydb"',
        "",
      ].join("\n");
      const sites = sitesIn(source, "scripts/probe.sh");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.line).toBe(3);
      expect(sites[0]!.exemptReason).toBeNull();
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    },
  );

  test("a multiline quoted argument in a workflow block reports its own line", () => {
    const source = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |",
      `          # ${EXEMPTION_MARKER} marker for an unrelated adjacent operation`,
      '          ssh host "echo setup',
      '          psql -qAt mydb"',
      "",
    ].join("\n");
    const sites = scanSource(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(7);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  // `"${PSQL_DIR}psql"` is the ordinary trailing-slash directory pattern. The
  // literal `psql` survives but is JOINED to the expansion, so an exact
  // basename test missed it on every surface the header claims to cover.
  test.each([
    ["a shell command word", '"${PSQL_DIR}psql" -qAt mydb\n', "x.sh"],
    [
      "a workflow run block",
      'jobs:\n  a:\n    steps:\n      - run: |\n          "${PSQL_DIR}psql" -qAt mydb\n',
      ".github/workflows/x.yml",
    ],
    ["a JS shell template", "execSync(`${PSQL_DIR}psql -qAt mydb`);", "x.mjs"],
    ["a spawn-family argv[0] template", 'execFileSync(`${binDir}psql`, ["-qAt", dsn]);', "x.mjs"],
  ])("%s is a site", (_name, source, file) => {
    const sites = scanSource(source, file);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("the same word WITH -X still certifies", () => {
    expect(sitesIn('"${PSQL_DIR}psql" -X -qAt mydb\n', "x.sh")[0]!.suppressesStartupFiles).toBe(
      true,
    );
  });

  test.each([
    ["a word merely ENDING in psql", '"$HOME/notpsql" -qAt mydb\n'],
    ["an unrelated expansion", '"${BIN_DIR}pg_dump" mydb\n'],
  ])("%s is not a site", (_name, source) => {
    expect(sitesIn(source, "x.sh")).toHaveLength(0);
  });
});

describe("R23 escaping mutants — line advance is PER CHARACTER", () => {
  // Every bulk append now advances `line` per character. Adding the newline
  // count afterwards stamped a whole multiline body with its opening line, so a
  // psql on a later line inherited a marker written above the command. R22
  // tested only double quotes; single quotes and `${…}` took the same path.
  const QUOTES: Array<[string, string]> = [
    ["single", String.fromCharCode(39)],
    ["double", '"'],
  ];

  test.each(
    ["ssh host", "eval", "watch"].flatMap((head) =>
      QUOTES.map(([kind, q]) => [head, kind, q] as const),
    ),
  )("%s with a %s-quoted multiline argument reports the psql line", (head, _kind, q) => {
    const source = [
      `# ${EXEMPTION_MARKER} unrelated adjacent operation`,
      `${head} ${q}echo setup`,
      `psql -qAt mydb${q}`,
      "",
    ].join("\n");
    const sites = sitesIn(source, "scripts/probe.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(3);
    expect(sites[0]!.exemptReason).toBeNull();
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each(
    ["ssh host", "eval", "watch"].flatMap((head) =>
      QUOTES.map(([kind, q]) => [head, kind, q] as const),
    ),
  )("%s with a %s-quoted multiline argument in a workflow block", (head, _kind, q) => {
    const source = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |",
      `          # ${EXEMPTION_MARKER} unrelated adjacent operation`,
      `          ${head} ${q}echo setup`,
      `          psql -qAt mydb${q}`,
      "",
    ].join("\n");
    const sites = scanSource(source, ".github/workflows/probe.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(7);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  test("a multiline `${…}` expansion does not shift the following line either", () => {
    const source = [
      `# ${EXEMPTION_MARKER} unrelated adjacent operation`,
      'echo "${VAR:-a',
      'b}"',
      "psql -qAt mydb",
      "",
    ].join("\n");
    const sites = sitesIn(source, "scripts/probe.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(4);
    expect(sites[0]!.exemptReason).toBeNull();
  });
});

describe("R24 escaping mutants — a parameter DEFAULT can supply the command", () => {
  const OPERATORS = [":-", "-", ":=", "=", ":+", "+"];

  // `PSQL="${PSQL:-psql}"` binds the command name at runtime. The lexer
  // replaces the expansion with an opaque word, so no site exists; the
  // assignment tripwire must be what fires.
  test.each(OPERATORS)("an assignment using `${PSQL%spsql}` is an indirection", (operator) => {
    const source = `PSQL="\${PSQL${operator}psql}"\n"$PSQL" -qAt mydb\n`;
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("the same assignment inside a JS shell string is reported", () => {
    const source = 'PSQL="${PSQL:-psql}"; "$PSQL" -qAt mydb';
    expect(scanShellIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  // Used DIRECTLY as the command word, it IS the command word.
  test.each(OPERATORS)("`${PSQL%spsql}` used directly is a site", (operator) => {
    const sites = sitesIn(`"\${PSQL${operator}psql}" -qAt mydb\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("the direct form WITH -X still certifies", () => {
    expect(sitesIn('"${PSQL:-psql}" -X -qAt mydb\n', "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  test.each([
    ["prose in an assignment", 'MSG="psql failed to connect"\n'],
    ["a word merely containing psql", "PG=notpsql\n"],
    ["an unrelated assignment", "DSN=postgres://x\n"],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  test("an unrelated expansion is not a command word", () => {
    expect(sitesIn('pg_dump "${DSN}" > out.sql\n', "x.sh")).toHaveLength(0);
  });
});

describe("R25 escaping mutants", () => {
  // An expansion in COMMAND POSITION can supply psql's real argv[0], making the
  // literal `psql` a POSITIONAL — `PG=psql; $PG psql -X mydb` runs
  // `psql psql -X mydb`, where `-X` is discarded under POSIXLY_CORRECT.
  test.each(["$PG", '"$PG"', "${PG}", '"${PG}"'])(
    "%s before psql makes the later -X uncertifiable",
    (prefix) => {
      const sites = sitesIn(`${prefix} psql -X mydb\n`, "x.sh");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
      expect(sites[0]!.hasDynamicTokens).toBe(true);
    },
  );

  test.each([
    ["a wrapper's argument", 'docker exec "$C" psql -X -qAt mydb\n'],
    ["an environment assignment", "PGHOST=$H psql -X -qAt mydb\n"],
    ["a plain wrapper", "sudo -u postgres psql -X -qAt mydb\n"],
  ])("%s does NOT block certification", (_name, source) => {
    // Only the COMMAND word matters. `docker exec "$DB_CONTAINER" psql -X …` is
    // a real site in this repo and must keep certifying.
    expect(sitesIn(source, "x.sh")[0]!.suppressesStartupFiles).toBe(true);
  });

  // A MULTIWORD command binding: the literal survives, but the command word
  // only exists after expansion, so no site is produced.
  test.each(["CMD=", "export CMD=", "readonly CMD=", "declare -r CMD=", "local CMD="])(
    "`%s'psql -qAt mydb'` is an indirection",
    (declaration) => {
      const source = `${declaration}'psql -qAt mydb'\neval "$CMD"\n`;
      expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
    },
  );

  test.each([
    ["prose with no flag", 'MSG="psql failed to connect"\n'],
    ["an unrelated binding", `CMD='pg_dump mydb'\n`],
  ])("%s is NOT an indirection", (_name, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  // `trap` runs its first non-option argument as a command at shell exit.
  test.each([
    ["trap with a signal", "trap 'psql -qAt mydb' EXIT\n"],
    ["trap with -- and two signals", "trap -- 'psql -qAt mydb' EXIT INT\n"],
  ])("%s is a site", (_name, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a protected trap command still certifies", () => {
    expect(sitesIn("trap 'psql -X -qAt mydb' EXIT\n", "x.sh")[0]!.suppressesStartupFiles).toBe(
      true,
    );
  });

  test("`trap - EXIT` (resetting a handler) is not a site", () => {
    expect(sitesIn("trap - EXIT\n", "x.sh")).toHaveLength(0);
  });
});

describe("R26 escaping mutants", () => {
  const BACKTICK = String.fromCharCode(96);

  // A backtick span inside a COMMAND is a substitution, not markdown. Flags
  // alone do not separate the two — prose about commands quotes flags as well —
  // so the string must START with a bare program name that then takes a flag.
  test.each([
    ["jq", `const c = "jq -n --arg rows ${BACKTICK}psql -qAt mydb${BACKTICK}"; execSync(c);`],
    ["curl", `const c = "curl -d ${BACKTICK}psql -qAt mydb${BACKTICK} https://x"; execSync(c);`],
  ])("a backtick substitution under %s is reported", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  test.each([
    [
      "operator-guidance prose",
      `const m = ' to validation via ${BACKTICK}psql "$T" -f <m>${BACKTICK}';`,
    ],
    [
      "prose that quotes another command's flags",
      `const m = ${BACKTICK}\\${BACKTICK}supabase db query --linked\\${BACKTICK} or \\${BACKTICK}psql "$T" -f <m>\\${BACKTICK}${BACKTICK};`,
    ],
  ])("%s is NOT reported", (_name, source) => {
    expect(scanBinaryIndirection(source, "x.mjs")).toHaveLength(0);
  });

  // A backslash-newline continuation makes ONE logical assignment.
  test("a multiline quoted command binding is an indirection", () => {
    const source = `CMD='psql -qAt mydb \\\n-c "select 1"'\neval "$CMD"\n`;
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("the single-line binding still reports, and prose still does not", () => {
    expect(scanShellIndirection(`CMD='psql -qAt mydb'\neval "$CMD"\n`, "x.sh").length).toBe(1);
    expect(scanShellIndirection(`MSG="psql failed to connect"\n`, "x.sh")).toHaveLength(0);
  });

  // The tripwire's documented PRECISION FLOOR, pinned so it cannot drift
  // without someone noticing. These are flagless psql commands inside long
  // prose-shaped literals; every loosening tried on them turned one of this
  // repo's real strings into a false positive.
  test.each([
    ["a control-prefixed flagless command", `const c = "if psql mydb; then echo ok; fi";`],
    [
      "a flagless command in a long sentence",
      `const c = "psql mydb; echo one two three four five six seven eight";`,
    ],
  ])("%s is a DOCUMENTED miss, not silently believed safe", (_name, source) => {
    // It yields no indirection — and, crucially, no CERTIFIED site either.
    expect(scanBinaryIndirection(source, "x.mjs")).toHaveLength(0);
    expect(scanSource(source, "x.mjs").filter((s) => s.suppressesStartupFiles)).toHaveLength(0);
  });

  test("the same commands ARE caught where they can be read structurally", () => {
    expect(sitesIn("if psql mydb; then echo ok; fi\n", "x.sh")).toHaveLength(1);
    expect(sitesIn("psql mydb; echo one two three\n", "x.sh")).toHaveLength(1);
    expect(scanSource(`execSync("if psql mydb; then echo ok; fi");`, "x.mjs")).toHaveLength(1);
  });
});

describe("R27 escaping mutants", () => {
  // JS `.` does not match a newline, so an attached `env -S` value that begins
  // on the next physical line was invisible.
  test('`env -S"` with the value starting on the next line is a site', () => {
    const sites = sitesIn('env -S"\npsql -qAt mydb"\n', "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // Every consumer branch used to stamp the site with the consumer ARGUMENT's
  // opening offset, so a multiline JS string mapped psql to the wrong physical
  // line and could inherit a marker written above the outer call.
  const CONSUMERS: Array<[string, string]> = [
    ["env -S attached", 'env -S" \\\npsql -qAt mydb"'],
    ["su --command separate", 'su - postgres --command " \\\npsql -qAt mydb"'],
    ["su --session-command=", 'su - postgres --session-command=" \\\npsql -qAt mydb"'],
    ["bash -c", 'bash -c " \\\npsql -qAt mydb"'],
  ];

  test.each(
    ["spawnSync", "execFileSync", "execFile", "spawn"].flatMap((api) =>
      CONSUMERS.map(([label, command]) => [api, label, command] as const),
    ),
  )("%s + %s reports the psql line, not the marker's", (api, _label, command) => {
    const source = [
      `const n = 1; // ${EXEMPTION_MARKER} unrelated adjacent operation`,
      "${API}(`${COMMAND}`, { shell: true });"
        .replace("${API}", api)
        .replace("${COMMAND}", command),
      "",
    ].join("\n");
    const sites = scanSource(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(3);
    expect(sites[0]!.exemptReason).toBeNull();
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a TRANSLATED value cannot inherit an exemption at all", () => {
    // env's `\\_` rewrite means lengths no longer line up, so the mapping is
    // inexact by construction — it must fail closed rather than guess a line.
    const source = [
      `# ${EXEMPTION_MARKER} unrelated adjacent operation`,
      `env -S 'psql -F\\_ -X mydb'`,
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });
});

describe("R28 escaping mutants — the workflow surface beyond `run:`", () => {
  // A workflow `env:` mapping binds a command name exactly the way `PG=psql`
  // does in a `.sh` file, but the shell tripwire reads `NAME=value` and YAML
  // spells it `NAME: value`, so every level of it was invisible. GitHub
  // documents env at the workflow, job, and step level, and each one reaches
  // `run:` as `$PSQL`. Not resolvable statically — reported, like every other
  // binding.
  test.each([
    [
      "workflow level",
      "env:\n  PSQL: psql\njobs:\n  x:\n    steps:\n      - run: $PSQL -qAt mydb\n",
    ],
    [
      "job level",
      "jobs:\n  x:\n    env:\n      PSQL: psql\n    steps:\n      - run: $PSQL -qAt mydb\n",
    ],
    [
      "step level",
      "jobs:\n  x:\n    steps:\n      - env:\n          PSQL: psql\n        run: $PSQL -qAt mydb\n",
    ],
    [
      "a path-spelled binding",
      "env:\n  PSQL: /usr/bin/psql\njobs:\n  x:\n    steps:\n      - run: $PSQL -qAt mydb\n",
    ],
    [
      "a multiword bound command",
      'env:\n  DB: "psql -qAt mydb"\njobs:\n  x:\n    steps:\n      - run: $DB\n',
    ],
  ])("an `env:` binding at %s is reported", (_label, source) => {
    const hits = scanWorkflowIndirection(source, ".github/workflows/x.yml");
    expect(hits.length).toBeGreaterThan(0);
  });

  // `matrix` is the other documented way a workflow supplies a command word,
  // and `${{ matrix.bin }}` is substituted before the shell ever sees it.
  test("a `matrix` value that is psql is reported", () => {
    const source = [
      "jobs:",
      "  x:",
      "    strategy:",
      "      matrix:",
      "        bin: [psql]",
      "    steps:",
      "      - run: ${{ matrix.bin }} -qAt mydb",
      "",
    ].join("\n");
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml").length).toBeGreaterThan(0);
  });

  // PRECISION: the ordinary env a workflow actually carries must stay quiet, or
  // the tripwire is noise and gets ignored. Each of these is a real shape from
  // this repo's own workflows.
  test.each([
    ["a connection URL", "env:\n  DATABASE_URL: postgres://postgres@127.0.0.1:54322/postgres\n"],
    ["a password", "env:\n  PGPASSWORD: postgres\n"],
    ["a non-psql binary", "env:\n  BIN: pg_dump\n"],
    ["an unrelated sentence", 'env:\n  NOTE: "the migration runner retries on failure"\n'],
  ])("%s is not reported", (_label, source) => {
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml")).toEqual([]);
  });

  // A CUSTOM `shell:` is a documented template: GitHub substitutes the path of
  // the temporary script at `{0}` and runs the result, so `shell: psql -f {0}`
  // executes psql and reads startup files. Only `run:` was ever scanned.
  test.each([
    ["step level", "jobs:\n  x:\n    steps:\n      - shell: psql -f {0}\n        run: select 1;\n"],
    [
      "job defaults",
      "jobs:\n  x:\n    defaults:\n      run:\n        shell: psql -f {0}\n    steps:\n      - run: select 1;\n",
    ],
    [
      "workflow defaults",
      "defaults:\n  run:\n    shell: psql -f {0}\njobs:\n  x:\n    steps:\n      - run: select 1;\n",
    ],
  ])("a custom `shell:` template at %s is an unprotected site", (_label, source) => {
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a custom `shell:` template that DOES suppress certifies", () => {
    const source =
      "jobs:\n  x:\n    steps:\n      - shell: psql -X -f {0}\n        run: select 1;\n";
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // PRECISION: the standard shells are keywords, not templates. A value with no
  // `{0}` is not a custom template at all, and `bash` is not psql either way.
  test.each([["bash"], ["pwsh"], ["python"], ["bash -e {0}"], ["sh"]])(
    "the standard shell `%s` produces no site",
    (shell) => {
      const source = `jobs:\n  x:\n    steps:\n      - shell: ${shell}\n        run: select 1;\n`;
      expect(sitesIn(source, ".github/workflows/x.yml")).toEqual([]);
    },
  );

  // Ordinary command-string consumers the allowlist omitted. Each executes its
  // quoted argument, so the psql inside runs and reads startup files.
  test.each([
    ["flock -c", 'flock /tmp/db.lock -c "psql -qAt mydb"'],
    ["flock on an fd", 'flock -w 5 9 -c "psql -qAt mydb"'],
    ["script -c", 'script -q -c "psql -qAt mydb" /dev/null'],
    ["tmux new-session", 'tmux new-session "psql -qAt mydb"'],
    ["tmux run-shell", 'tmux run-shell "psql -qAt mydb"'],
  ])("%s carries an unprotected site", (_label, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test.each([
    ["flock -c", 'flock /tmp/db.lock -c "psql -X -qAt mydb"'],
    ["script -c", 'script -q -c "psql -X -qAt mydb" /dev/null'],
    ["tmux new-session", 'tmux new-session "psql -X -qAt mydb"'],
  ])("%s certifies when the inner command suppresses", (_label, command) => {
    const sites = sitesIn(`${command}\n`, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // CLASS SWEEP, not the three named instances. The shape of the first two
  // findings is "a workflow key OTHER than `run:` whose value is executable
  // text"; a container action's `entrypoint`/`args` is the same shape, and
  // GitHub runs it as the container's command.
  test.each([
    [
      "args",
      "jobs:\n  x:\n    steps:\n      - uses: docker://postgres:16\n        with:\n          args: psql -qAt mydb\n",
    ],
    [
      "entrypoint",
      "jobs:\n  x:\n    steps:\n      - uses: docker://postgres:16\n        with:\n          entrypoint: psql\n          args: -qAt mydb\n",
    ],
  ])("a container action's `%s` is an unprotected site", (_label, source) => {
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a container action's `args` certifies when it suppresses", () => {
    const source =
      "jobs:\n  x:\n    steps:\n      - uses: docker://postgres:16\n        with:\n          args: psql -X -qAt mydb\n";
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // PRECISION: `with:` carries ordinary action INPUTS, which are data. Only the
  // two container-command keys are command text.
  test.each([
    ["a version input", "jobs:\n  x:\n    steps:\n      - with:\n          node-version: 20\n"],
    [
      "prose naming psql",
      'jobs:\n  x:\n    steps:\n      - with:\n          summary: "psql failed to connect; retry"\n',
    ],
  ])("%s under `with:` produces no site", (_label, source) => {
    expect(sitesIn(source, ".github/workflows/x.yml")).toEqual([]);
  });

  // Same sweep on the BINDING shape: a reusable workflow's or composite
  // action's `inputs.<name>.default` supplies a command word exactly the way a
  // `matrix` value does.
  test("an `inputs` default that is psql is reported", () => {
    const source = [
      "on:",
      "  workflow_call:",
      "    inputs:",
      "      bin:",
      "        default: psql",
      "        type: string",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: ${{ inputs.bin }} -qAt mydb",
      "",
    ].join("\n");
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml").length).toBeGreaterThan(0);
  });

  test("an ordinary `inputs` default is not reported", () => {
    const source =
      "on:\n  workflow_call:\n    inputs:\n      ref:\n        default: main\n        type: string\n";
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml")).toEqual([]);
  });

  // The live tree must stay clean under the widened reader: a fix that finds
  // the mutants by also finding the repo's own prose is not a fix.
  test(
    "the widened workflow + consumer reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R29 escaping mutants — the binding surface YAML can spell", () => {
  const WORKFLOW = ".github/workflows/x.yml";
  /** Both YAML tripwires, the way the walk runs them. A binding may surface
   * through either, so a probe that reads only one can call an escape a pass. */
  function yamlHits(source: string, file = WORKFLOW) {
    return [...scanWorkflowIndirection(source, file), ...scanShellIndirection(source, file)];
  }

  // An action's `runs.args` is documented as an ARRAY passed to the container
  // entrypoint, so `entrypoint: sh` + `args: [-c, "psql …"]` executes an
  // unprotected invocation. The reader bailed on anything that was not a
  // scalar, which is every one of them.
  test.each([
    ["a joined `sh -c` argv", 'runs:\n  entrypoint: sh\n  args: ["-c", "psql -qAt mydb"]\n'],
    ["a bare argv", 'runs:\n  entrypoint: psql\n  args: ["-qAt", "mydb"]\n'],
    ["a block sequence", "runs:\n  args:\n    - psql\n    - -qAt\n    - mydb\n"],
  ])("an action's `args` sequence — %s — is an unprotected site", (_label, source) => {
    const sites = sitesIn(source, "action.yml");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
  });

  test("an action's `args` sequence certifies when it suppresses", () => {
    const sites = sitesIn(
      'runs:\n  entrypoint: sh\n  args: ["-c", "psql -X -qAt mydb"]\n',
      "action.yml",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // A FLAGLESS multiword binding is the ordinary spelling — `psql mydb` needs
  // no flags at all — and requiring one made every binding context silent for
  // it while the header claimed a loud backstop.
  test.each([
    ["env", 'env:\n  DB: "psql mydb"\n'],
    ["matrix", 'jobs:\n  x:\n    strategy:\n      matrix:\n        db: ["psql mydb"]\n'],
    [
      "inputs default",
      'on:\n  workflow_call:\n    inputs:\n      db:\n        default: "psql mydb"\n        type: string\n',
    ],
  ])("a flagless multiword binding under %s is reported", (_label, source) => {
    expect(yamlHits(source).length).toBeGreaterThan(0);
  });

  // A binding spelled as an ALIAS is documented configuration reuse. The SITE
  // path already resolves aliases; the binding path never did, so every one of
  // these was silent.
  test.each([
    ["a scalar alias", "x: &bin psql\nenv:\n  PSQL: *bin\n"],
    ["an aliased env MAPPING", "x: &db-env\n  PSQL: psql\nenv: *db-env\n"],
    [
      "a matrix alias",
      "x: &bin psql\njobs:\n  y:\n    strategy:\n      matrix:\n        bin: [*bin]\n",
    ],
    [
      "an inputs default alias",
      "x: &bin psql\non:\n  workflow_call:\n    inputs:\n      bin:\n        default: *bin\n        type: string\n",
    ],
  ])("a binding through %s is reported", (_label, source) => {
    expect(yamlHits(source).length).toBeGreaterThan(0);
  });

  // `$GITHUB_ENV` and `$GITHUB_OUTPUT` are THE documented way a step hands a
  // value to a later step, so a binding written through one is as ordinary as
  // `PSQL=psql` in a shell script — and was just as invisible, because the
  // assignment sits inside a quoted echo argument.
  test.each([
    ["GITHUB_ENV", 'jobs:\n  x:\n    steps:\n      - run: echo "PSQL=psql" >> "$GITHUB_ENV"\n'],
    [
      "GITHUB_OUTPUT",
      'jobs:\n  x:\n    steps:\n      - id: pick\n        run: echo "bin=psql" >> "$GITHUB_OUTPUT"\n',
    ],
    [
      "a single-quoted payload",
      "jobs:\n  x:\n    steps:\n      - run: echo 'PSQL=psql' >> $GITHUB_ENV\n",
    ],
  ])("a binding written through %s is reported", (_label, source) => {
    expect(yamlHits(source).length).toBeGreaterThan(0);
  });

  // PRECISION for the widened binding rules. Each of these is a real shape.
  test.each([
    ["an unrelated alias", "x: &ref main\nenv:\n  REF: *ref\n"],
    [
      "a psql-free env write",
      'jobs:\n  x:\n    steps:\n      - run: echo "REF=main" >> "$GITHUB_ENV"\n',
    ],
    ["an args sequence with no psql", 'runs:\n  entrypoint: sh\n  args: ["-c", "pg_dump mydb"]\n'],
    ["an ordinary numeric input", 'env:\n  RETRIES: "3"\n'],
  ])("%s is not reported", (_label, source) => {
    const file = source.startsWith("runs:") ? "action.yml" : WORKFLOW;
    expect(yamlHits(source, file)).toEqual([]);
    expect(sitesIn(source, file)).toEqual([]);
  });

  // A self-referential anchor is legal YAML. The alias walker must bound it
  // rather than recurse forever — a guard that hangs is a guard that gets
  // deleted.
  test("a self-referential anchor terminates", () => {
    const source = "env: &loop\n  PSQL: psql\n  more: *loop\n";
    expect(scanWorkflowIndirection(source, WORKFLOW).length).toBeGreaterThan(0);
  });

  test(
    "the widened binding reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R30 escaping mutants — an argv array is one command line", () => {
  const WORKFLOW = ".github/workflows/x.yml";
  function yamlHits(source: string, file = WORKFLOW) {
    return [...scanWorkflowIndirection(source, file), ...scanShellIndirection(source, file)];
  }

  // Scanning `args` items INDEPENDENTLY threw away the entrypoint, and with it
  // every consumer grammar the reader already knows. `entrypoint: env` is the
  // sharpest case: env's split-string grammar makes `\_` an ARGUMENT
  // SEPARATOR, so `-F\_ -X mydb` really passes `-F -X mydb` where `-X` is
  // `-F`'s VALUE and suppresses nothing — while an item read as ordinary shell
  // text lexed one token `-F_` and certified the `-X` behind it. A FALSE SAFE,
  // the one failure mode this file exists to prevent.
  test.each([
    ["a separated -S", "runs:\n  entrypoint: env\n  args: ['-S', 'psql -F\\_ -X mydb']\n"],
    [
      "a separated --split-string",
      "runs:\n  entrypoint: env\n  args: ['--split-string', 'psql -F\\_ -X mydb']\n",
    ],
    ["an attached -S", "runs:\n  entrypoint: env\n  args: ['-Spsql -qAt mydb']\n"],
    [
      "an attached --split-string=",
      "runs:\n  entrypoint: env\n  args: ['--split-string=psql -qAt mydb']\n",
    ],
  ])("`entrypoint: env` with %s is NOT certified", (_label, source) => {
    const sites = sitesIn(source, "action.yml");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
  });

  // The entrypoint's OWN grammar must still be read, not just env's: an argv
  // array under `sh -c` is a command string, and it certifies when protected.
  test("`entrypoint: sh` with a protected `-c` argv certifies", () => {
    const sites = sitesIn(
      'runs:\n  entrypoint: sh\n  args: ["-c", "psql -X -qAt mydb"]\n',
      "action.yml",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("`entrypoint: sh` with an unprotected `-c` argv is a site", () => {
    const sites = sitesIn(
      'runs:\n  entrypoint: sh\n  args: ["-c", "psql -qAt mydb"]\n',
      "action.yml",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // A GitHub environment-file write is documented in a MULTILINE delimiter form
  // (the name and the value are on different physical lines) and in PowerShell
  // through `$env:GITHUB_ENV`. Requiring the assignment and a Bourne-style
  // destination on ONE line missed every one of them.
  const DELIM_ENV = [
    "jobs:",
    "  x:",
    "    steps:",
    "      - run: |",
    "          {",
    "            echo 'PSQL<<EOF'",
    "            echo 'psql'",
    "            echo 'EOF'",
    '          } >> "$GITHUB_ENV"',
    "",
  ].join("\n");
  const DELIM_OUTPUT = DELIM_ENV.replace("GITHUB_ENV", "GITHUB_OUTPUT");
  const PWSH_ENV = [
    "jobs:",
    "  x:",
    "    steps:",
    "      - shell: pwsh",
    '        run: "PSQL=psql" | Out-File -FilePath $env:GITHUB_ENV -Append',
    "",
  ].join("\n");
  const PWSH_OUTPUT = PWSH_ENV.replace("GITHUB_ENV", "GITHUB_OUTPUT");

  test.each([
    ["a multiline delimiter write to GITHUB_ENV", DELIM_ENV],
    ["a multiline delimiter write to GITHUB_OUTPUT", DELIM_OUTPUT],
    ["a PowerShell write through $env:GITHUB_ENV", PWSH_ENV],
    ["a PowerShell write through $env:GITHUB_OUTPUT", PWSH_OUTPUT],
  ])("%s is reported", (_label, source) => {
    expect(yamlHits(source).length).toBeGreaterThan(0);
  });

  // PRECISION: an environment-file write that binds nothing psql-shaped stays
  // quiet, and so does a step that merely NAMES psql without writing one.
  test.each([
    [
      "a psql-free delimiter write",
      DELIM_ENV.replace("echo 'psql'", "echo 'main'").replace("PSQL<<EOF", "REF<<EOF"),
    ],
    [
      "the availability probe with no env write",
      "jobs:\n  x:\n    steps:\n      - run: command -v psql >/dev/null || sudo apt-get install -y postgresql-client\n",
    ],
    ["a psql-free PowerShell write", PWSH_ENV.replace('"PSQL=psql"', '"REF=main"')],
  ])("%s is not reported", (_label, source) => {
    expect(yamlHits(source)).toEqual([]);
  });

  test(
    "the composed-argv and environment-file reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R31 escaping mutants — dedupe, aliases, and the assignment grammar", () => {
  const WORKFLOW = ".github/workflows/x.yml";
  function yamlHits(source: string, file = WORKFLOW) {
    return [...scanWorkflowIndirection(source, file), ...scanShellIndirection(source, file)];
  }

  // The raw and decoded passes deduped on ARGV ALONE, so a decoded site that
  // differs from the raw one in exactly the field that decides safety was
  // thrown away. A FOLDED scalar joins its lines with SPACES, so
  // `$PG\npsql -X mydb` really runs `psql psql -X mydb` — `-X` after a
  // positional, which POSIXLY_CORRECT discards — while the raw pass read the
  // newline as a command separator and certified a bare `psql -X mydb`.
  test("a folded scalar whose fold supplies the command word is NOT certified", () => {
    const source =
      "jobs:\n  x:\n    steps:\n      - run: >\n          $PG\n          psql -X mydb\n";
    const sites = sitesIn(source, WORKFLOW);
    expect(sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length).toBe(
      1,
    );
  });

  // Same defect, exemption side: an exempt raw site and an identical-argv
  // UNPROTECTED decoded site deduped down to the exempt one, so the second
  // invocation inherited a marker written for the first.
  test("an exempt site does not absorb an identical unprotected one", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      `      - run: "rows=$(psql -qAt mydb # ${EXEMPTION_MARKER} first call intentionally exempt\\n)\\npsql -qAt mydb"`,
      "",
    ].join("\n");
    const sites = sitesIn(source, WORKFLOW);
    expect(sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length).toBe(
      1,
    );
  });

  // The composed argv resolved no aliases, while both the site path and the
  // binding path have resolved them since R11 and R29. All three shapes are
  // ordinary configuration reuse.
  test.each([
    ["an aliased entrypoint", "bin: &bin psql\nruns:\n  entrypoint: *bin\n  args: [-qAt, mydb]\n"],
    [
      "an aliased args SEQUENCE",
      "argv: &argv [-c, psql -qAt mydb]\nruns:\n  entrypoint: sh\n  args: *argv\n",
    ],
    [
      "an aliased args ITEM",
      "cmd: &cmd psql -qAt mydb\nruns:\n  entrypoint: sh\n  args: [-c, *cmd]\n",
    ],
  ])("%s composes into an unprotected site", (_label, source) => {
    const sites = sitesIn(source, "action.yml");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
  });

  test("an aliased entrypoint still certifies when protected", () => {
    const sites = sitesIn(
      "bin: &bin psql\nruns:\n  entrypoint: *bin\n  args: [-X, -qAt, mydb]\n",
      "action.yml",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // The assignment recognizer read one spelling of a binding. These are all
  // ordinary bash, and each makes the later expanded command word psql.
  test.each([
    ["export, whole-argument single-quoted", "export 'PG=psql'\n\"$PG\" -qAt mydb\n"],
    ["export, whole-argument double-quoted", 'export "PG=psql"\n"$PG" -qAt mydb\n'],
    ["readonly, whole-argument quoted", 'readonly "PG=psql"\n"$PG" -qAt mydb\n'],
    ["declare with no flag", 'declare "PG=psql"\n"$PG" -qAt mydb\n'],
    ["local inside a function", 'f() { local "PG=psql"; "$PG" -qAt mydb; }\n'],
    ["typeset", 'typeset "PG=psql"\n"$PG" -qAt mydb\n'],
    ["an indexed element", 'PG[0]=psql\n"${PG[0]}" -qAt mydb\n'],
    ["an append assignment", 'PG+=psql\n"$PG" -qAt mydb\n'],
    ["read from a here-string", 'read -r PG <<< psql\n"$PG" -qAt mydb\n'],
  ])("a binding through %s is reported", (_label, source) => {
    expect(scanShellIndirection(source, "probe.sh").length).toBeGreaterThan(0);
  });

  // PRECISION for the widened assignment grammar. Each is a real shape from
  // this tree's own scripts and strings.
  test.each([
    ["an unrelated export", 'export "REF=main"\n'],
    ["a prose sentence", 'MSG="psql failed to connect; retry"\n'],
    ["an unrelated read", "read -r REF <<< main\n"],
    ["an unrelated indexed element", "ARGS[0]=--verbose\n"],
    ["a psql-free append", 'FLAGS+=" --quiet"\n'],
  ])("%s is not reported", (_label, source) => {
    expect(scanShellIndirection(source, "probe.sh")).toEqual([]);
  });

  test(
    "the widened dedupe, alias, and assignment reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R32 escaping mutants — an interpreter's positionals are not its command", () => {
  // `bash -c 'script' psql -X` assigns `psql` to `$0` and `-X` to `$1`. The
  // script runs `$0 -qAt mydb`, so psql runs UNSUPPRESSED — the `-X` is a
  // positional parameter of the shell, never an argument of psql. After
  // scanning the `-c` script the reader fell through to the generic argv
  // search, read that `$0` VALUE as the command, and credited the following
  // `-X`. A false safe on every recognized shell.
  test.each([["sh"], ["bash"], ["zsh"], ["dash"], ["ash"], ["ksh"]])(
    "`%s -c '$0 …' psql -X` is never certified",
    (shell) => {
      const sites = sitesIn(`${shell} -c '$0 -qAt mydb' psql -X\n`, "x.sh");
      expect(sites.filter((s) => s.suppressesStartupFiles)).toEqual([]);
    },
  );

  // Silence is not good enough either: the command word exists only after
  // expansion, which is exactly what the indirection tripwire is for.
  test.each([
    ["a $0 script", "bash -c '$0 -qAt mydb' psql -X\n"],
    ["a $1 script", "bash -c 'psql \"$1\"' sh -qAt\n"],
    ["a path-spelled positional", "bash -c '$0 -qAt mydb' /usr/bin/psql\n"],
  ])("%s is CAUGHT — as an unprotected site or as a tripwire hit", (_label, source) => {
    const unprotected = sitesIn(source, "x.sh").filter(
      (site) => !site.suppressesStartupFiles && site.exemptReason === null,
    ).length;
    expect(unprotected + scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // PRECISION: an ordinary `-c` invocation with no trailing positional, and one
  // whose positionals name something else, stay quiet.
  test.each([
    ["a plain -c script", "bash -c 'psql -X -qAt mydb'\n"],
    ["positionals that are not psql", "bash -c '$0 --version' pg_dump\n"],
  ])("%s is not reported by the tripwire", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toEqual([]);
  });

  test("a genuinely protected -c script still certifies", () => {
    const sites = sitesIn("bash -c 'psql -X -qAt mydb'\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // `reanchor` mapped through the consumer word's own per-character maps but
  // dropped the enclosing text's `lineOffset`, so a psql physically on line 9
  // of a workflow was reported on line 4 — a wrong line is a false safe, since
  // it can inherit an exemption written for a neighbour.
  test.each([
    ["bash -c", 'bash -c "\n\n\n\npsql -qAt mydb"'],
    ["env -S", 'env -S "\n\n\n\npsql -qAt mydb"'],
  ])("%s inside a workflow reports the PHYSICAL line", (_label, command) => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      ...command.split("\n").map((l) => `          ${l}`),
      "",
    ].join("\n");
    const physical = source.split("\n").findIndex((l) => l.includes("psql -qAt mydb")) + 1;
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(physical);
  });

  test(
    "the positional-command and line-offset fixes leave the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R33 escaping mutants — a logical command is not a physical line", () => {
  /** Caught either way: an unprotected site or a tripwire hit. */
  function caught(source: string, file: string) {
    const unprotected = sitesIn(source, file).filter(
      (site) => !site.suppressesStartupFiles && site.exemptReason === null,
    ).length;
    return unprotected + scanShellIndirection(source, file).length;
  }

  // The R32 positional tripwire read PHYSICAL lines while the site scanner
  // reads LOGICAL commands, so a backslash-newline continuation — ordinary
  // formatting, not an adversarial spelling — put the interpreter and its
  // positional on different lines and the rule could not see across the break.
  test.each([["sh"], ["bash"], ["zsh"], ["dash"], ["ash"], ["ksh"]])(
    "a continued `%s -c '$0 …' psql -X` is caught",
    (shell) => {
      expect(caught(`${shell} -c '$0 -qAt mydb' \\\n  psql -X\n`, "x.sh")).toBeGreaterThan(0);
    },
  );

  test.each([
    ["a break before -c", "bash \\\n  -c '$0 -qAt mydb' psql -X\n"],
    ["a break inside the quoted script", "bash -c '$0 -qAt \\\n  mydb' psql -X\n"],
    ["a break before the positional", "bash -c '$0 -qAt mydb' \\\n  psql -X\n"],
    ["two breaks", "bash \\\n  -c '$0 -qAt mydb' \\\n  psql -X\n"],
  ])("%s is caught", (_label, source) => {
    expect(caught(source, "x.sh")).toBeGreaterThan(0);
  });

  test("the same continuation inside a workflow run block is caught", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      "          bash -c '$0 -qAt mydb' \\",
      "            psql -X",
      "",
    ].join("\n");
    expect(caught(source, ".github/workflows/x.yml")).toBeGreaterThan(0);
  });

  test("the same continuation inside a JS shell string is caught", () => {
    const source = "execSync(`bash -c '$0 -qAt mydb' \\\\\n  psql -X`);\n";
    const unprotected = sitesIn(source, "x.mjs").filter(
      (site) => !site.suppressesStartupFiles && site.exemptReason === null,
    ).length;
    expect(unprotected + scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  // PRECISION: a continuation that binds nothing stays quiet.
  test.each([
    ["a continued psql-free command", "bash \\\n  -c 'echo hi' \\\n  pg_dump\n"],
    ["a continued protected invocation", "psql -X \\\n  -qAt mydb\n"],
  ])("%s is not reported by the tripwire", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toEqual([]);
  });

  test(
    "the logical-line reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R34 escaping mutants — a spliced word is one word", () => {
  const WRAPPED_PATH = 'PSQL="/opt/postgresql/17/bin/\\\npsql"\n"$PSQL" -qAt mydb\n';

  // The shell REMOVES a backslash-newline outright — no space — so
  // `"/opt/postgresql/17/bin/\` + newline + `psql"` is the single word
  // `/opt/postgresql/17/bin/psql`. The binding rules read PHYSICAL lines, so
  // neither half contained a psql-shaped value and the wrapped path bound the
  // command name invisibly. Joining with a SPACE, which the continuation rule
  // already did for other purposes, does not help: it splits the very word the
  // shell is gluing together.
  test.each([["x.sh"], ["x.bash"]])("a wrapped assignment path is reported in %s", (file) => {
    expect(scanShellIndirection(WRAPPED_PATH, file).length).toBeGreaterThan(0);
  });

  test("a wrapped assignment path inside a workflow run block is reported", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      '          PSQL="/opt/postgresql/17/bin/\\',
      '          psql"',
      '          "$PSQL" -qAt mydb',
      "",
    ].join("\n");
    const hits = [
      ...scanShellIndirection(source, ".github/workflows/x.yml"),
      ...scanWorkflowIndirection(source, ".github/workflows/x.yml"),
    ];
    expect(hits.length).toBeGreaterThan(0);
  });

  test("a wrapped assignment path inside a JS shell string is reported", () => {
    const source = `execSync(\`${WRAPPED_PATH}\`);\n`;
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  // The same splice through every other binding spelling the reader knows.
  test.each([
    ["whole-argument export", 'export "PSQL=/opt/pg/bin/\\\npsql"\n"$PSQL" -qAt mydb\n'],
    ["whole-argument readonly", 'readonly "PSQL=/opt/pg/bin/\\\npsql"\n"$PSQL" -qAt mydb\n'],
    ["a here-string read", 'read -r PSQL <<< /opt/pg/bin/\\\npsql\n"$PSQL" -qAt mydb\n'],
    ["an indexed element", 'PG[0]="/opt/pg/bin/\\\npsql"\n"${PG[0]}" -qAt mydb\n'],
  ])("a wrapped %s is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("a wrapped GITHUB_ENV write is reported", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      '          echo "PSQL=/opt/pg/bin/\\',
      '          psql" >> "$GITHUB_ENV"',
      "",
    ].join("\n");
    const hits = [
      ...scanShellIndirection(source, ".github/workflows/x.yml"),
      ...scanWorkflowIndirection(source, ".github/workflows/x.yml"),
    ];
    expect(hits.length).toBeGreaterThan(0);
  });

  // PRECISION: a wrapped value that binds nothing stays quiet, and so does a
  // wrapped line whose two halves only LOOK like they splice into psql.
  test.each([
    ["a wrapped unrelated path", 'REF="/opt/pg/bin/\\\npg_dump"\n'],
    ["a wrapped prose value", 'MSG="the migration runner \\\nretries on failure"\n'],
    ["two unrelated adjacent lines", 'REF="/opt/pg/bin/"\nPSQLDOC="see the docs"\n'],
  ])("%s is not reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toEqual([]);
  });

  test(
    "the spliced-line reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R35 escaping mutants — env PREPENDS its split-string, it does not replace argv", () => {
  // R32 made every script-consuming branch mark the argv handled, which is
  // right for a SHELL — `bash -c 'script' psql -X` passes psql as `$0`, not as
  // a command. It is WRONG for env: `env -S` splits its operand and PREPENDS
  // it to the remaining argv, so `env -S '-u PSQLRC' psql -qAt mydb` runs
  // env's own `-u` option and then executes the trailing psql, unsuppressed.
  // Marking the argv handled made that trailing command invisible.
  test.each([
    ["a separate -S", "env -S '-u PSQLRC' psql -qAt mydb\n"],
    ["a clustered -iS", "env -iS '-u PSQLRC' psql -qAt mydb\n"],
    ["a separate --split-string", "env --split-string '-u PSQLRC' psql -qAt mydb\n"],
    ["an attached --split-string=", "env --split-string='-u PSQLRC' psql -qAt mydb\n"],
    ["an attached -S", "env -S'-u PSQLRC' psql -qAt mydb\n"],
  ])("%s leaves the trailing psql visible and unprotected", (_label, source) => {
    const sites = sitesIn(source, "x.sh");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
  });

  test("a trailing psql that DOES suppress still certifies", () => {
    const sites = sitesIn("env -S '-u PSQLRC' psql -X -qAt mydb\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // The command may also live INSIDE the operand, which is the R27 reading and
  // must keep working — including its env-grammar translation, where `\_` is an
  // argument separator so `-F\_ -X` makes `-X` the field separator's value.
  test("the command inside the operand still reads under env's own grammar", () => {
    const sites = sitesIn("env -S 'psql -F\\_ -X mydb'\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test("a protected command inside the operand still certifies", () => {
    const sites = sitesIn("env -S 'psql -X -qAt mydb'\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // A SHELL must keep the R32 behaviour: its trailing words are positionals.
  test("a shell's trailing positional is still not read as a command", () => {
    const sites = sitesIn("bash -c '$0 -qAt mydb' psql -X\n", "x.sh");
    expect(sites.filter((s) => s.suppressesStartupFiles)).toEqual([]);
  });

  test.each([
    [
      "a workflow run block",
      "jobs:\n  x:\n    steps:\n      - run: env -S '-u PSQLRC' psql -qAt mydb\n",
      ".github/workflows/x.yml",
    ],
    [
      "a custom shell template",
      "jobs:\n  x:\n    steps:\n      - shell: env -S '-u PSQLRC' psql -f {0}\n        run: select 1;\n",
      ".github/workflows/x.yml",
    ],
    [
      "a container args SEQUENCE",
      "runs:\n  entrypoint: env\n  args: ['-S', '-u PSQLRC', 'psql', '-qAt', 'mydb']\n",
      "action.yml",
    ],
    [
      "a container args SCALAR",
      "runs:\n  entrypoint: env\n  args: -S '-u PSQLRC' psql -qAt mydb\n",
      "action.yml",
    ],
  ])("the same escape through %s is caught", (_label, source, file) => {
    const sites = sitesIn(source, file);
    expect(
      sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length,
    ).toBeGreaterThan(0);
  });

  test("the same escape inside a JS shell string is caught", () => {
    const sites = sitesIn("execSync(\"env -S '-u PSQLRC' psql -qAt mydb\");\n", "x.mjs");
    expect(
      sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length,
    ).toBeGreaterThan(0);
  });

  test(
    "the env-prepend reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R36 escaping mutants — repeated env options, and a non-POSIX shell", () => {
  // GNU env keeps parsing after the first split-string, so a second `-S` is
  // ordinary. Every env branch stopped at the first one.
  const FIRST = [
    "-S '-u R36_DUMMY'",
    "-S'-u R36_DUMMY'",
    "--split-string '-u R36_DUMMY'",
    "--split-string='-u R36_DUMMY'",
  ];
  const SECOND = [
    "-S 'psql -qAt mydb'",
    "-S'psql -qAt mydb'",
    "--split-string 'psql -qAt mydb'",
    "--split-string='psql -qAt mydb'",
  ];
  test.each(FIRST.flatMap((a) => SECOND.map((b) => [a, b] as const)))(
    "`env %s %s` is an unprotected site",
    (a, b) => {
      const sites = sitesIn(`env ${a} ${b}\n`, "x.sh");
      expect(sites.length).toBeGreaterThan(0);
      expect(sites.every((s) => !s.suppressesStartupFiles)).toBe(true);
    },
  );

  test("a repeated env split-string that DOES suppress certifies", () => {
    const sites = sitesIn("env -S '-u R36_DUMMY' -S 'psql -X -qAt mydb'\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test.each([
    [
      "a workflow run block",
      "jobs:\n  x:\n    steps:\n      - run: env -S '-u D' -S 'psql -qAt mydb'\n",
      ".github/workflows/x.yml",
    ],
    [
      "a container args SCALAR",
      "runs:\n  entrypoint: env\n  args: -S '-u D' -S 'psql -qAt mydb'\n",
      "action.yml",
    ],
    ["a JS shell string", "execSync(\"env -S '-u D' -S 'psql -qAt mydb'\");\n", "x.mjs"],
  ])("the repeated split-string through %s is caught", (_label, source, file) => {
    const sites = sitesIn(source, file);
    expect(
      sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length,
    ).toBeGreaterThan(0);
  });

  // `shell: python` runs the `run:` body as PYTHON. Lexing it as POSIX shell
  // made every ordinary subprocess call invisible. The body is read by
  // extracting its string and argv-list literals and lexing each as a command
  // line — the same shape `scanBinaryIndirection` uses on JS.
  const pythonStep = (body: string): string =>
    [
      "jobs:",
      "  x:",
      "    steps:",
      "      - shell: python",
      "        run: |",
      ...body.split("\n").map((l) => `          ${l}`),
      "",
    ].join("\n");

  test.each([
    ["subprocess.run", 'import subprocess\nsubprocess.run(["psql", "-qAt", "mydb"])'],
    ["subprocess.check_call", 'import subprocess\nsubprocess.check_call(["psql", "-qAt", "mydb"])'],
    ["subprocess.Popen", 'import subprocess\nsubprocess.Popen(["psql", "-qAt", "mydb"])'],
    ["os.system", 'import os\nos.system("psql -qAt mydb")'],
  ])("a python step using %s is caught", (_label, body) => {
    const source = pythonStep(body);
    const sites = sitesIn(source, ".github/workflows/x.yml");
    const hits = [
      ...scanShellIndirection(source, ".github/workflows/x.yml"),
      ...scanWorkflowIndirection(source, ".github/workflows/x.yml"),
    ];
    const unprotected = sites.filter(
      (s) => !s.suppressesStartupFiles && s.exemptReason === null,
    ).length;
    expect(unprotected + hits.length).toBeGreaterThan(0);
  });

  // R36 asserted a python body could CERTIFY. R37 disproved the design behind
  // that: `subprocess.run([...], shell=True)` uses only the first element as
  // the command, so a `-X` in the list never reaches psql and the reader called
  // it safe. A body in a language this reader does not parse is now reported
  // and NEVER certified — which is strictly stronger than what this test used
  // to assert.
  test("a python step whose psql LOOKS protected is still never certified", () => {
    const source = pythonStep('import subprocess\nsubprocess.run(["psql", "-X", "-qAt", "mydb"])');
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites.filter((s) => s.suppressesStartupFiles)).toEqual([]);
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml").length).toBeGreaterThan(0);
  });

  test("the same body under `defaults.run.shell: python` is caught", () => {
    const source = [
      "defaults:",
      "  run:",
      "    shell: python",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      "          import subprocess",
      '          subprocess.run(["psql", "-qAt", "mydb"])',
      "",
    ].join("\n");
    expect(scanWorkflowIndirection(source, ".github/workflows/x.yml").length).toBeGreaterThan(0);
  });

  // PRECISION: a python step with no psql, and an ordinary bash step, unchanged.
  test.each([
    [
      "a psql-free python step",
      pythonStep('import subprocess\nsubprocess.run(["pg_dump", "mydb"])'),
    ],
    ["an ordinary bash step", "jobs:\n  x:\n    steps:\n      - run: psql -X -qAt mydb\n"],
  ])("%s reports nothing unprotected", (_label, source) => {
    const sites = sitesIn(source, ".github/workflows/x.yml");
    expect(sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null)).toEqual([]);
  });

  test(
    "the repeated-option and non-POSIX-shell reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R37 escaping mutants — a non-POSIX body is REPORTED, never certified", () => {
  const WF = ".github/workflows/x.yml";
  function caught(source: string) {
    const sites = sitesIn(source, WF);
    const unprotected = sites.filter(
      (s) => !s.suppressesStartupFiles && s.exemptReason === null,
    ).length;
    const hits = [...scanWorkflowIndirection(source, WF), ...scanShellIndirection(source, WF)]
      .length;
    return { unprotected, hits, certified: sites.filter((s) => s.suppressesStartupFiles).length };
  }
  const step = (shell: string, body: string): string =>
    [
      "jobs:",
      "  x:",
      "    steps:",
      `      - shell: ${shell}`,
      "        run: |",
      ...body.split("\n").map((l) => `          ${l}`),
      "",
    ].join("\n");

  // R36's reader pulled literals out of a python body and lexed each as a
  // command line, which meant it could CERTIFY one. Python's `shell=True` uses
  // only the FIRST sequence element as the command, so `-X` becomes the
  // shell's `$0` and never reaches psql — and the reader called it safe. A
  // reader that can certify a language it does not parse is the wrong shape:
  // a non-POSIX body is now reported and never certified.
  test("`subprocess.run([...], shell=True)` is never certified", () => {
    const result = caught(
      step("python", 'import subprocess\nsubprocess.run(["psql", "-X", "mydb"], shell=True)'),
    );
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  test.each([
    ["subprocess.run", 'import subprocess\nsubprocess.run(["psql", "-qAt", "mydb"])'],
    ["os.system", 'import os\nos.system("psql -qAt mydb")'],
    ["a protected-looking call", 'import subprocess\nsubprocess.run(["psql", "-X", "mydb"])'],
  ])("a python body using %s is reported and never certified", (_label, body) => {
    const result = caught(step("python", body));
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // A CUSTOM template whose command is a non-POSIX interpreter runs the body in
  // that language too. Exact-keyword matching missed every one.
  test.each([["python {0}"], ["python3 -u {0}"], ["pwsh -File {0}"], ["/usr/bin/python {0}"]])(
    "a custom `shell: %s` body is reported",
    (shell) => {
      const result = caught(
        step(shell, 'import subprocess\nsubprocess.run(["psql", "-qAt", "mydb"])'),
      );
      expect(result.certified).toBe(0);
      expect(result.unprotected + result.hits).toBeGreaterThan(0);
    },
  );

  // `defaults.run.shell` was ONE document-wide variable, so a job-level bash
  // default overwrote the workflow-level python default for unrelated jobs.
  test("a job-level default does not leak into another job", () => {
    const source = [
      "defaults:",
      "  run:",
      "    shell: python",
      "jobs:",
      "  inherits:",
      "    steps:",
      "      - run: |",
      "          import subprocess",
      '          subprocess.run(["psql", "-qAt", "mydb"])',
      "  overrides:",
      "    defaults:",
      "      run:",
      "        shell: bash",
      "    steps:",
      "      - run: psql -X -qAt mydb",
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  test("a step-level shell does not leak to the next step", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - shell: python",
      "        run: |",
      "          import subprocess",
      '          subprocess.run(["psql", "-qAt", "mydb"])',
      "      - run: psql -X -qAt mydb",
      "",
    ].join("\n");
    const sites = sitesIn(source, WF);
    // The second step is ordinary bash and must still certify on its own.
    expect(sites.filter((s) => s.suppressesStartupFiles).length).toBe(1);
    expect(caught(source).hits).toBeGreaterThan(0);
  });

  // A shell name spelled as an ALIAS is documented configuration reuse.
  test.each([
    [
      "a step-level alias",
      'py: &py python\njobs:\n  x:\n    steps:\n      - shell: *py\n        run: |\n          import subprocess\n          subprocess.run(["psql", "-qAt", "mydb"])\n',
    ],
    [
      "a defaults alias",
      'py: &py python\ndefaults:\n  run:\n    shell: *py\njobs:\n  x:\n    steps:\n      - run: |\n          import subprocess\n          subprocess.run(["psql", "-qAt", "mydb"])\n',
    ],
  ])("%s is resolved", (_label, source) => {
    const result = caught(source);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // PRECISION: a non-POSIX body with no psql stays quiet, and ordinary bash
  // steps are untouched.
  test.each([
    [
      "a psql-free python body",
      step("python", 'import subprocess\nsubprocess.run(["pg_dump", "mydb"])'),
    ],
    ["an ordinary bash step", "jobs:\n  x:\n    steps:\n      - run: psql -X -qAt mydb\n"],
    [
      "a bash step under a bash default",
      "defaults:\n  run:\n    shell: bash\njobs:\n  x:\n    steps:\n      - run: psql -X -qAt mydb\n",
    ],
  ])("%s reports nothing", (_label, source) => {
    const result = caught(source);
    expect(result.unprotected).toBe(0);
    expect(result.hits).toBe(0);
  });

  test(
    "the non-POSIX tripwire leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R38 escaping mutants — POSIX is proved, not assumed", () => {
  const WF = ".github/workflows/x.yml";
  function caught(source: string) {
    const sites = sitesIn(source, WF);
    return {
      certified: sites.filter((s) => s.suppressesStartupFiles).length,
      unprotected: sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length,
      hits: [...scanWorkflowIndirection(source, WF), ...scanShellIndirection(source, WF)].length,
    };
  }
  const PY_BODY = ["import subprocess", 'subprocess.run(["psql", "-qAt", "mydb"])'];
  const step = (shell: string): string =>
    [
      "jobs:",
      "  x:",
      "    steps:",
      `      - shell: ${shell}`,
      "        run: |",
      ...PY_BODY.map((l) => `          ${l}`),
      "",
    ].join("\n");

  // Enumerating the non-POSIX shells is enumerating an OPEN SET: a version
  // suffix, a `.exe`, an `env` wrapper, or a `${{ }}` expression each names an
  // interpreter the list does not hold, and every one of them was then read as
  // POSIX shell. The test is inverted — a body is lexed as shell only when its
  // shell is PROVABLY `bash`/`sh` (or absent, which is GitHub's bash default);
  // anything else is reported. That is closed by construction rather than by
  // list maintenance.
  test.each([
    ["a versioned interpreter", "python3.12 -u {0}"],
    ["a windows executable", "pwsh.exe -File {0}"],
    ["an env wrapper", "env python {0}"],
    ["an expression", "${{ matrix.shell }}"],
    ["an unknown interpreter", "deno run {0}"],
    ["an absolute versioned path", "/usr/local/bin/python3.11 {0}"],
  ])("%s is treated as non-POSIX and reported", (_label, shell) => {
    const result = caught(step(shell));
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  test("a matrix-derived default is reported", () => {
    const source = [
      "jobs:",
      "  x:",
      "    strategy:",
      "      matrix:",
      "        shell: [python]",
      "    defaults:",
      "      run:",
      "        shell: ${{ matrix.shell }}",
      "    steps:",
      "      - run: |",
      ...PY_BODY.map((l) => `          ${l}`),
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // An aliased `run:` body was read straight off the alias node, which has no
  // `.value`, so the tripwire saw an empty body.
  test("an aliased `run:` body under a non-POSIX shell is reported", () => {
    const source = [
      "py: &py |",
      "  import subprocess",
      '  subprocess.run(["psql", "-qAt", "mydb"])',
      "jobs:",
      "  x:",
      "    steps:",
      "      - shell: python",
      "        run: *py",
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // An ANCHORED step list reused under two different job defaults resolves to
  // two different effective shells for ONE pair node. Storing one shell, and a
  // visited-set that skipped the second context, hid the non-POSIX reading.
  test("an anchored step list reused under two defaults is reported", () => {
    const source = [
      "steps: &steps",
      "  - run: |",
      "      import subprocess",
      '      subprocess.run(["psql", "-qAt", "mydb"])',
      "jobs:",
      "  bashjob:",
      "    defaults:",
      "      run:",
      "        shell: bash",
      "    steps: *steps",
      "  pyjob:",
      "    defaults:",
      "      run:",
      "        shell: python",
      "    steps: *steps",
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // PRECISION: the POSIX shells and the default must still be read as shell,
  // or every ordinary workflow in this repo becomes a tripwire hit.
  test.each([
    ["no shell key", "jobs:\n  x:\n    steps:\n      - run: psql -X -qAt mydb\n"],
    [
      "shell: bash",
      "jobs:\n  x:\n    steps:\n      - shell: bash\n        run: psql -X -qAt mydb\n",
    ],
    ["shell: sh", "jobs:\n  x:\n    steps:\n      - shell: sh\n        run: psql -X -qAt mydb\n"],
    [
      "a bash template",
      "jobs:\n  x:\n    steps:\n      - shell: bash -e {0}\n        run: psql -X -qAt mydb\n",
    ],
    [
      "an absolute bash path",
      "jobs:\n  x:\n    steps:\n      - shell: /bin/bash -e {0}\n        run: psql -X -qAt mydb\n",
    ],
    [
      "a bash default",
      "defaults:\n  run:\n    shell: bash\njobs:\n  x:\n    steps:\n      - run: psql -X -qAt mydb\n",
    ],
  ])("%s still reads as shell and certifies", (_label, source) => {
    const result = caught(source);
    expect(result.certified).toBe(1);
    expect(result.unprotected + result.hits).toBe(0);
  });

  test(
    "the proved-POSIX reading leaves the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R39 escaping mutants — a wrapper is not its own interpreter", () => {
  const WF = ".github/workflows/x.yml";
  function caught(source: string, file = WF) {
    const sites = sitesIn(source, file);
    return {
      certified: sites.filter((s) => s.suppressesStartupFiles).length,
      unprotected: sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null).length,
      hits: [...scanWorkflowIndirection(source, file), ...scanShellIndirection(source, file)]
        .length,
    };
  }
  const PY = ["import subprocess", 'subprocess.run(["psql", "-qAt", "mydb"])'];

  // `bash` as the command word does NOT prove the BODY is shell: a custom
  // template may hand `{0}` to another interpreter. The proof has to be that
  // `{0}` is a DIRECT argument of bash/sh — the template's words before it
  // being the shell name and dash-flags only — not that the line begins with
  // one.
  test.each([
    ['bash -c "python3 {0}"', 'bash -c "python3 {0}"'],
    ["sh -c 'python3 {0}'", "sh -c 'python3 {0}'"],
    ['bash -lc "uv run {0}"', 'bash -lc "uv run {0}"'],
  ])("`shell: %s` is not proof of POSIX", (_label, shell) => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      `      - shell: ${shell}`,
      "        run: |",
      ...PY.map((l) => `          ${l}`),
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  // An unset `shell:` is bash only on non-Windows. On a Windows runner it is
  // PowerShell Core, where splatting an EMPTY array removes the word entirely:
  // `psql -F @opts -X mydb` really runs `psql -F -X mydb`, so `-X` is `-F`'s
  // VALUE and suppresses nothing — and the body was read as POSIX shell and
  // CERTIFIED.
  test.each([["windows-latest"], ["windows-2022"], ["${{ matrix.os }}"]])(
    "an unset shell on `runs-on: %s` is not certified",
    (runner) => {
      const source = [
        "jobs:",
        "  x:",
        `    runs-on: ${runner}`,
        "    steps:",
        "      - run: |",
        "          $opts = @()",
        "          psql -F @opts -X mydb",
        "",
      ].join("\n");
      expect(caught(source).certified).toBe(0);
    },
  );

  test("an unset shell on an explicit ubuntu runner still certifies", () => {
    const source = [
      "jobs:",
      "  x:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: psql -X -qAt mydb",
      "",
    ].join("\n");
    const result = caught(source);
    expect(result.certified).toBe(1);
    expect(result.unprotected + result.hits).toBe(0);
  });

  // Windows executable spellings are ordinary names, not adversarial ones.
  test.each([
    [
      "a workflow command",
      "jobs:\n  x:\n    steps:\n      - shell: pwsh\n        run: PSQL.EXE -qAt mydb\n",
      WF,
    ],
    ["a shell command", "PSQL.EXE -qAt mydb\n", "x.sh"],
    ["a mixed-case name", "Psql -qAt mydb\n", "x.sh"],
    ["a path-prefixed exe", "C:/pg/bin/psql.exe -qAt mydb\n", "x.sh"],
  ])("%s is caught", (_label, source, file) => {
    const result = caught(source, file);
    expect(result.certified).toBe(0);
    expect(result.unprotected + result.hits).toBeGreaterThan(0);
  });

  test("a JS spawn of psql.exe is caught", () => {
    const source = 'execFileSync("psql.exe", ["-qAt", "mydb"]);\n';
    const sites = sitesIn(source, "x.mjs");
    expect(sites.length + scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
    expect(sites.filter((s) => s.suppressesStartupFiles)).toEqual([]);
  });

  test("a psql.exe spawn that suppresses still certifies", () => {
    const sites = sitesIn('execFileSync("psql.exe", ["-X", "-qAt", "mydb"]);\n', "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  // PRECISION: names that merely CONTAIN psql are still not psql.
  test.each([["notpsql -qAt mydb\n"], ["psqlodbc --version\n"], ["mypsql.exe -qAt mydb\n"]])(
    "`%s` is not a psql site",
    (source) => {
      expect(sitesIn(source, "x.sh")).toEqual([]);
    },
  );

  test(
    "the wrapper, platform, and case fixes leave the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

describe("R40 — hypothetical gaps closed cheaply; the rest are documented limits", () => {
  const WF = ".github/workflows/x.yml";

  // A Windows path separator is a backslash. `basename` split on `/` only, so
  // an ordinary Windows spawn was invisible to both the site path and the
  // tripwire. Additive recall, no design change.
  test.each([
    ['execFileSync("C:\\\\pg\\\\bin\\\\psql.exe", ["-qAt", "mydb"]);\n', false],
    ['execFileSync("C:\\\\pg\\\\bin\\\\psql.exe", ["-X", "-qAt", "mydb"]);\n', true],
  ])("a backslash-path psql spawn is seen (suppresses=%s)", (source, suppresses) => {
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(suppresses);
  });

  // In POSIX shell an UNQUOTED backslash is an escape, so
  // `C:\pg\bin\psql.exe` lexes to `C:pgbinpsql.exe` — genuinely not psql, and
  // correctly not a site.
  test("an UNQUOTED backslash path is not psql, because the shell eats the escapes", () => {
    expect(sitesIn("C:\\pg\\bin\\psql.exe -qAt mydb\n", "x.sh")).toEqual([]);
  });

  // The QUOTED form used to be a documented limit: inside double quotes bash
  // keeps a backslash that precedes an ordinary character, so the word really
  // is the Windows path — and this lexer stripped it. The 2026-08-17
  // escape-fidelity fix (spec §3.2 fix 3) keeps the backslash, so the word IS
  // the Windows path and `basename` — which has split on backslash since
  // R40 — finds `psql.exe`. The R40-era miss is CLOSED; scan.ts
  // residual-limits item 3 records the closure. (The old comment pointed at
  // DEFERRED.md, where the entry no longer lives: it was demoted into the
  // scan.ts documented-limits block on 2026-08-04, and its archive record is
  // `PSQL-GUARD-RECALL-RESIDUAL` in DEFERRED-archive.md.)
  test("a QUOTED backslash path in shell text is read, as of the 2026-08-17 escape-fidelity fix", () => {
    expect(sitesIn('"C:\\pg\\bin\\psql.exe" -qAt mydb\n', "x.sh")).toHaveLength(1);
  });

  // The workflow BINDING tripwire stayed case-sensitive after the R39 pass made
  // the command recognizers case-insensitive.
  test.each([
    ["env", "env:\n  PG: PSQL.EXE\n"],
    ["a path-valued binding", "env:\n  PG: C:/pg/bin/PSQL.EXE\n"],
    ["matrix", "jobs:\n  x:\n    strategy:\n      matrix:\n        bin: [Psql]\n"],
    [
      "inputs",
      "on:\n  workflow_call:\n    inputs:\n      bin:\n        default: PSQL.EXE\n        type: string\n",
    ],
  ])("a %s binding spelled for Windows is reported", (_label, source) => {
    expect(scanWorkflowIndirection(source, WF).length).toBeGreaterThan(0);
  });

  // `runs-on` has legal MAP forms, and a self-hosted label proves nothing about
  // the platform even when it contains the word "linux". Present-but-unreadable
  // must fail closed, which is different from absent.
  test.each([
    [
      "a labels map",
      "jobs:\n  x:\n    runs-on:\n      labels: windows-latest\n    steps:\n      - run: psql -F @opts -X mydb\n",
    ],
    [
      "a group map",
      "jobs:\n  x:\n    runs-on:\n      group: my-group\n    steps:\n      - run: psql -F @opts -X mydb\n",
    ],
    [
      "a self-hosted label",
      "jobs:\n  x:\n    runs-on: custom-linux-runner\n    steps:\n      - run: psql -F @opts -X mydb\n",
    ],
  ])("an unset shell on %s is not certified", (_label, source) => {
    const sites = sitesIn(source, WF);
    expect(sites.filter((s) => s.suppressesStartupFiles)).toEqual([]);
  });

  test.each([["ubuntu-latest"], ["ubuntu-22.04"], ["macos-14"]])(
    "a known-good runner `%s` still certifies",
    (runner) => {
      const source = `jobs:\n  x:\n    runs-on: ${runner}\n    steps:\n      - run: psql -X -qAt mydb\n`;
      const sites = sitesIn(source, WF);
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(true);
    },
  );

  test(
    "the R40 recall additions leave the tree certified",
    () => {
      const usage = liveTreeUsage();
      expect(
        usage.sites.filter((s) => !s.suppressesStartupFiles && s.exemptReason === null),
      ).toEqual([]);
      expect(usage.indirections).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );
});

/**
 * Mutation-enrolment survivors, batch A — the tokenizer and the comment-range
 * infrastructure (`docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md`
 * Task 2). Each case names the `relational-boundary` site id it kills; the three
 * sites this batch blesses as equivalent carry a boundary pin instead, asserting
 * the ORIGINAL behaviour the equivalence argument rests on.
 */
describe("enrolment survivors - batch A", () => {
  // Kills relational-boundary:598:47 (`token.length > 1` mutated to `>= 1`).
  // A bare `-` is not a flag cluster. getopt(3) and psql alike read it as a
  // NON-OPTION argument, so it is the DBNAME positional and option parsing
  // stops there — the `-X` after it is never reached. Under the mutant `-`
  // enters the cluster branch, `"-".slice(1)` is empty, nothing matches, and
  // the loop walks on to credit the later `-X`.
  test("a bare `-` is the DBNAME positional, so a later -X is not credited", () => {
    expect(argvSuppressesStartupFiles(["-", "-X"])).toBe(false);
    // The control: the same `-X` IS credited when nothing positional precedes it.
    expect(argvSuppressesStartupFiles(["-X", "-"])).toBe(true);
  });

  // Kills relational-boundary:656:35 (`l < to.line` mutated to `l <= to.line`).
  // The closing line of a block comment is comment-qualified only up to the
  // `*/`; everything after it is ordinary code. A marker sitting in STRING DATA
  // after the terminator is not in a comment and grants nothing. The mutant
  // records the closing line as comment-qualified to end-of-line, which adopts
  // the string's contents as an exemption reason.
  // The title says "block-comment close" rather than spelling the two-character
  // marker, because a quoted marker in this file reads as hand-rolled comment
  // handling to tests/cross-cutting/_metaStripCommentsSingleSource.test.ts. The
  // fixture below still carries the real characters, where they are input.
  test("a marker in string data after a block-comment close is not in a comment", () => {
    const source = [
      "/* a",
      `b */ const s = "${EXEMPTION_MARKER} fake reason";`,
      'execFileSync("psql", ["-qAt", dsn]);',
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  // Kills relational-boundary:765:69 (`at >= from` mutated to `at > from`).
  // A middle line of a multi-line comment is comment-qualified from column 0,
  // so a marker written flush-left on that line IS inside the comment. The
  // mutant excludes exactly the column-0 case and loses the exemption.
  test("a marker flush-left on a middle line of a block comment still exempts", () => {
    const source = [
      "/* a",
      `${EXEMPTION_MARKER} runs in a throwaway container`,
      '*/ execFileSync("psql", ["-qAt", dsn]);',
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBe("runs in a throwaway container");
  });

  /**
   * CR is a LineTerminator in ECMAScript (spec table "White Space and Line
   * Terminators": U+000A, U+000D, U+2028, U+2029), so the TypeScript scanner
   * counts a lone `\r` as a line break while `text.split("\n")` does not. A
   * block comment written with CR line endings therefore spans more SCANNER
   * lines than the per-line array has entries — the exact condition the two
   * `out.length` bounds in `jsCommentRangesPerLine` exist to hold. Neither
   * fixture may end in a newline: a trailing `\n` adds an array entry and puts
   * the bound back in range.
   */
  const CR = String.fromCharCode(13);

  // Kills relational-boundary:656:50 (`l < out.length` mutated to `<=`).
  // to.line is 2 and the per-line array holds 1 entry, so the mutant's extra
  // iteration writes past the end and the scan throws instead of reporting.
  test("a CR-delimited block comment spanning past the line array still reports its site", () => {
    const source = `/* a${CR}b${CR}c */ execFileSync("psql", ["-qAt", dsn]);`;
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  // Kills relational-boundary:657:17 (`to.line < out.length` mutated to `<=`).
  // Same shape one line shorter: to.line is 1 and the array holds 1 entry, so
  // the closing-line write is the one that goes out of bounds.
  test("a CR-delimited block comment closing past the line array still reports its site", () => {
    const source = `/* a${CR}b */ execFileSync("psql", ["-qAt", dsn]);`;
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  // Boundary pin for the relational-boundary:765:83 equivalence row
  // (`at < to` mutated to `at <= to`). The marker starts at exactly the column
  // the comment ends at, which is the only column the widened bound admits.
  // The original reports no exemption because the marker is not contained; the
  // mutant contains it but then slices the reason over an EMPTY range and falls
  // through to the same verdict. This pins the original half of that argument.
  test("a marker beginning exactly where the comment ends grants no exemption", () => {
    const source = [
      "/* a",
      `*/${EXEMPTION_MARKER} still not a reason`,
      'execFileSync("psql", ["-qAt", dsn]);',
      "",
    ].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBeNull();
  });

  // Boundary pin for the relational-boundary:705:23 equivalence row
  // (`i < line.length` mutated to `<=`). The argument is that the extra
  // iteration reads `undefined` and changes nothing; its premise is that the
  // loop already covers index `line.length - 1`. Here the closing quote IS the
  // last character of its line, so the quote state must clear before the next
  // line — otherwise the `#` below reads as string data and the exemption is
  // lost.
  test("a quote closing at end-of-line clears, so the next line's `#` is a comment", () => {
    const source = [
      'A="x"',
      `# ${EXEMPTION_MARKER} throwaway container, no HOME`,
      'psql -qAt "$A"',
      "",
    ].join("\n");
    const sites = sitesIn(source, "s.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.exemptReason).toBe("throwaway container, no HOME");
  });

  // Boundary pin for the relational-boundary:831:25 equivalence row
  // (`i < text.length` mutated to `<=`). Same shape: the extra iteration reads
  // `undefined` and matches no branch. Its premise is that an UNCLOSED
  // substitution consumes the text to its final character — the fallback
  // `text.length - 1` — rather than stopping short and hiding the invocation.
  test("an unclosed command substitution still exposes the psql call inside it", () => {
    const source = ["X=$(psql -qAt mydb", ""].join("\n");
    const sites = sitesIn(source, "s.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.nested).toBe(true);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });
});

/**
 * Mutation-enrolment survivors, batch B — the shell text scanner (plan Task 3).
 * One kill; the other six sites are blessed as equivalent and carry the
 * boundary pins their arguments rest on.
 */
describe("enrolment survivors - batch B", () => {
  // Kills relational-boundary:1402:26 (`command.length > 0` mutated to `>= 0`
  // in the pipeline splitter). A newline after `|` continues the pipeline —
  // POSIX shell grammar allows linebreaks after `|`, so this is one pipeline
  // whose second stage is a bare `bash`, and the printf argument IS the script
  // that bash will run. The mutant pushes an EMPTY command for that newline,
  // which becomes `commands[position + 1]` for the `|` stage, so the bare-shell
  // stdin detection looks at the empty stage instead of `bash` and reports
  // nothing.
  test("a pipeline broken across lines after `|` still exposes the stdin script", () => {
    const source = ["printf 'psql -qAt mydb' |", "bash", ""].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // Boundary pin for the relational-boundary:1411:22 equivalence row
  // (`command.length > 0` mutated to `>= 0` in the trailing flush). The mutant
  // can only APPEND an empty command, never insert one, so the pin is that a
  // text ending in an operator still reports the command before it.
  test("a command terminated by a trailing `;` is still reported", () => {
    const sites = sitesIn("psql -qAt mydb ;\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // Boundary pin for the relational-boundary:1492:30 equivalence row
  // (`remaining.length > 0` mutated to `>= 0`). `ssh host` with no remote
  // command leaves the joined-argument list empty — the reachable input the
  // guard exists for. Nothing is scanned and no site is reported.
  test("an ssh host with no remote command is not a site", () => {
    expect(sitesIn("ssh database\n", "x.sh")).toHaveLength(0);
    // The premise: the same host word WITH a remote command does reach the
    // joining branch and does report, so the zero above is a verdict rather
    // than a fixture that never arrives.
    expect(sitesIn("ssh database psql -qAt mydb\n", "x.sh")).toHaveLength(1);
  });

  // Boundary pin for the relational-boundary:1502:19 equivalence row
  // (`k > 0` mutated to `k >= 0` in the joined-string builder). The mutant
  // prepends one separator to the joined string AND one entry to each parallel
  // offset/line array, so every index shifts by exactly one and the mapping is
  // unchanged. The pin is the mapping itself: a remote command continued onto a
  // second physical line reports THAT line, not the `ssh` line.
  test("an ssh remote command on a continuation line reports its own physical line", () => {
    const source = ["ssh database \\", "  psql -qAt mydb", ""].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // Boundary pin for the relational-boundary:1582:46 equivalence row
  // (`candidate.text.length > 2` mutated to `>= 2`). The conjunct that follows
  // it, /^-[a-zA-Z]*S[\s\S]/, already requires a character AFTER the `S`, so a
  // two-character `-S` is rejected either way. Both spellings are pinned: `-S`
  // alone takes the NEXT word as its split-string, and the attached form
  // carries the script itself.
  test("`env -S` takes the next word, and the attached form carries its own script", () => {
    const separate = sitesIn("env -S 'psql -qAt mydb'\n", "x.sh");
    expect(separate).toHaveLength(1);
    expect(separate[0]!.suppressesStartupFiles).toBe(false);
    const attached = sitesIn("env -S'psql -qAt mydb'\n", "x.sh");
    expect(attached).toHaveLength(1);
    expect(attached[0]!.suppressesStartupFiles).toBe(false);
  });

  // Boundary pin for the relational-boundary:1756:22 and 1757:26 equivalence
  // rows (the opening/closing delimiter bounds in `mapRawToLines`). Both
  // mutants only widen a bound into a raw slice too short to hold a body, where
  // the walk emits nothing either way. The pin is the mapping the bounds serve:
  // a template literal whose psql text sits on a LATER physical line reports
  // that line, which only holds if the delimiters are skipped correctly.
  test("a template literal reports the physical line its psql text came from", () => {
    const source = ["execSync(`echo one", "psql -qAt mydb`);", ""].join("\n");
    const sites = sitesIn(source, "x.mjs");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(2);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });
});

/**
 * Mutation-enrolment survivors, batch C — the prose-vs-command heuristic
 * (plan Task 4). Its only observable surface is `scanBinaryIndirection`, which
 * asks `looksLikePsqlCommandLine` whether a JS string literal is a command.
 */
describe("enrolment survivors - batch C", () => {
  // Kills regex-quantifier-bound:1991:45 (`-{1,2}` widened to `-{1,3}` in the
  // backtick head check). A backtick span is a markdown code span in prose and
  // a command substitution in code; what separates them is the outer string
  // starting with a bare program name that then takes a FLAG. POSIX and GNU
  // spell flags with one or two dashes and no more, so a three-dash word is not
  // a flag and cannot vouch for the string.
  test("a three-dash word is not a flag, so a backtick span stays prose", () => {
    const source = "const c = 'runner ---x `psql -qAt mydb`';\n";
    expect(scanBinaryIndirection(source, "x.mjs")).toHaveLength(0);
    // The control: the same string with a real one-dash flag IS a command.
    const real = "const c = 'runner -x `psql -qAt mydb`';\n";
    expect(scanBinaryIndirection(real, "x.mjs").length).toBeGreaterThan(0);
  });

  // Kills relational-boundary:2019:26 (`site.tokens.length <= 3` mutated to
  // `< 3`). `psql -- mydb postgres` is a real, flagless invocation: `--` ends
  // option parsing, so `mydb` is DBNAME and `postgres` is USERNAME, and no
  // startup file is suppressed. It carries exactly three argv tokens, the
  // heuristic's stated argv-length bound, so it must still read as a command.
  test("a flagless psql at exactly the three-token bound is still a command", () => {
    const source = 'const c = "psql -- mydb postgres";\n';
    expect(scanBinaryIndirection(source, "x.mjs").length).toBeGreaterThan(0);
  });

  // Kills relational-boundary:2021:49 (`words <= 8` mutated to `< 8`). With no
  // preceding words the heuristic admits a terse command inside a string of at
  // most eight words. This one is exactly eight, so it must read as a command;
  // the nine-word control must not.
  test("a terse psql in a string of exactly eight words is still a command", () => {
    const eight = 'const c = "cd /srv && psql mydb && echo ok";\n';
    expect(scanBinaryIndirection(eight, "x.mjs").length).toBeGreaterThan(0);
    const nine = 'const c = "cd /srv && psql mydb && echo all ok";\n';
    expect(scanBinaryIndirection(nine, "x.mjs")).toHaveLength(0);
  });

  // Boundary pin for the four index-guard equivalence rows
  // (relational-boundary:1948:12 and 1949:12 in `isStrongPrefixWord`, and their
  // twins 1965:16 and 1966:16 in `prefixIsCommandish`). Each widened guard
  // reaches a lookback that is out of range, where `?? ""` yields the empty
  // string, the local `basename("")` yields `""`, and the anchored WRAPPERS
  // alternation matches nothing — the same `false` the short-circuit produced.
  // The pin is the behaviour that rests on it: at index 0 a word vouches for
  // the command only through its OWN spelling, never through a lookback, so an
  // English word vouches for nothing and a wrapper still vouches for itself.
  test("the first preceding word vouches only through its own spelling", () => {
    const prose = 'const c = "parses psql mydb rows";\n';
    expect(scanBinaryIndirection(prose, "x.mjs")).toHaveLength(0);
    const wrapper = 'const c = "sudo psql mydb";\n';
    expect(scanBinaryIndirection(wrapper, "x.mjs").length).toBeGreaterThan(0);
  });
});

/**
 * Mutation-enrolment survivors, batch D — the shell and workflow indirection
 * scanners (plan Task 5). Two kills, six equivalence rows and one accepted gap;
 * the pins below carry the arguments the blessed rows rest on.
 */
describe("enrolment survivors - batch D", () => {
  // Kills regex-quantifier-bound:2372:38 (`-{1,2}` widened to `-{1,3}` in the
  // bound-command flag test). A quoted binding is reported only when its value
  // lexes to a psql invocation carrying a FLAG, which is what keeps
  // `MSG="psql failed to connect"` out. POSIX and GNU flags take one or two
  // dashes, so `---x` is not one and the value is prose-shaped; the mutant
  // accepts it and reports the binding.
  test("a three-dash word does not make a quoted binding a command", () => {
    expect(scanShellIndirection("CMD='psql ---x mydb'\n", "x.sh")).toHaveLength(0);
    // The control: one dash makes the same value a real invocation.
    expect(scanShellIndirection("CMD='psql -x mydb'\n", "x.sh").length).toBeGreaterThan(0);
  });

  // Kills relational-boundary:3109:48 (`scanShellText(...).length > 0` mutated
  // to `>= 0`, making the test unconditional). A binding key whose value merely
  // CONTAINS the word psql is not a binding: `psql-tuning` is a hyphenated
  // English compound, and the shell reader finds no psql command word in it.
  // The mutant reports every psql-mentioning value under `env:`.
  test("an env value that only mentions psql in prose is not a binding", () => {
    const source = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - env:",
      "          NOTE: a b psql-tuning guide",
      "        run: echo hi",
      "",
    ].join("\n");
    expect(scanWorkflowIndirection(source, "w.yml")).toHaveLength(0);
    // The control: a value that IS a psql command line binds the command name.
    const bound = source.replace("a b psql-tuning guide", "psql -qAt mydb");
    expect(scanWorkflowIndirection(bound, "w.yml").length).toBeGreaterThan(0);
  });

  // Boundary pin for the regex-quantifier-bound:2423:21 equivalence row. The
  // dash run is followed by `[A-Za-z-]*`, a class that already contains a dash,
  // so `-{1,2}` and `-{1,3}` accept the same language — any leading dash plus
  // any run of letters and dashes. The pin is that consequence: an extra dash
  // in the `-c` spelling changes nothing, and the positional binding is
  // reported either way.
  test("an extra dash in the -c spelling still reports the positional binding", () => {
    const two = "bash -c 'exec $0 -qAt mydb' psql\n";
    expect(scanShellIndirection(two, "x.sh").length).toBeGreaterThan(0);
    const three = "bash ---c 'exec $0 -qAt mydb' psql\n";
    expect(scanShellIndirection(three, "x.sh").length).toBeGreaterThan(0);
  });

  // Boundary pin for the relational-boundary:2499:54 equivalence row (the
  // `logical` continuation join). The widened bound can only add a final
  // iteration that replaces a dangling trailing backslash with a space and
  // appends nothing, and the one consumer of `logical` cannot tell those apart.
  // The pin is the join the loop exists for: a quoted binding split across two
  // physical lines by a backslash continuation is ONE assignment.
  test("a quoted binding split by a backslash continuation is one assignment", () => {
    const source = ["CMD='psql -qAt mydb \\", '-c "select 1"' + "'", ""].join("\n");
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // The shell contract behind the trailing-backslash zeros — ratified in BOTH
  // directions, so neither side is relitigable.
  //
  // This test used to KILL the `spliced` continuation join's widened bound
  // (relational-boundary:2167:54 then, 2511:54 now), because the assignment
  // family read `spliced`. It reads LEXED WORDS as of this arc, and the lexer
  // performs its own splice, so the mutant is no longer observable from here:
  // the site is dispositioned `equivalent` against the two consumers `spliced`
  // still has, with the argument on the registry row. The zeros below did not
  // move — the lexer keeps a dangling final backslash literal for the same shell
  // reason the join did (spec §3.2 fix 1), which is why the contract survives
  // the consumer swap intact.
  //
  // A backslash escapes the character that follows it, and at end of input there
  // IS no following character — so it stays literal. `PG='psql'\` with no
  // trailing newline assigns the value `psql\`, which is not the psql command:
  // nothing is bound and no site is correct. Any future reader of these lines
  // has to keep these zeros for the same reason, which is what makes them a
  // contract and not a snapshot.
  test("a trailing backslash at end of input is literal, so it binds nothing", () => {
    expect(scanShellIndirection("PG='psql'\\", "x.sh")).toHaveLength(0);
    expect(scanShellIndirection("export 'PG=psql'\\", "x.sh")).toHaveLength(0);
    // The premise, and the old row's boundary pin: the same assignment WITHOUT
    // the trailing backslash IS read, so the zeros above are attributable to the
    // backslash rather than to a fixture family that never reaches the patterns.
    expect(scanShellIndirection("PG='psql'\n", "x.sh").length).toBeGreaterThan(0);
  });

  // Spec §3.2: the lexer's escape infidelities, repaired as one class. Bash is
  // the oracle for every row (probe record, round-1 supplement).
  describe("lexer escape fidelity (spec 3.2)", () => {
    test("a psql command word glued to a dangling final backslash is not psql", () => {
      // The zero below is attributable to the backslash, not to a fixture that
      // never reaches the scanner (tests/_shared/premise.ts contract).
      premise("the same command WITH a newline is a site", sitesIn("psql\n", "x.sh").length, 0);
      expect(sitesIn("psql\\", "x.sh")).toHaveLength(0);
    });

    test("a certified flag glued to a dangling final backslash loses certification", () => {
      // Bash passes the argument `--no-psqlrc\` (supplement g7), which psql's
      // exact long-option recognition does not accept. Certifying it was a
      // false SAFE; the site stays, unsuppressed.
      const sites = sitesIn("psql --no-psqlrc\\", "x.sh");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    });

    test('a double-quoted "p\\sql" command word is not psql', () => {
      // Inside double quotes a backslash is LITERAL except before $ ` " \
      // (supplement g5: `PG="p\sql"` binds p-backslash-sql).
      premise(
        "the plainly double-quoted command word is a site",
        sitesIn('"psql" -X -qAt mydb\n', "x.sh").length,
        0,
      );
      expect(sitesIn('"p\\sql" -X -qAt mydb\n', "x.sh")).toHaveLength(0);
    });

    test("a double-quoted backslash-newline pair is removed, keeping the word whole", () => {
      // The R34 wrapped-path fixture reads through the word route once the
      // spliced consumer is gone (Task 2); this pins the LEXER half: the glued
      // path word is one site, on the opening line.
      const source = '"/opt/pg/\\\npsql" -X -qAt mydb\n';
      const sites = sitesIn(source, "x.sh");
      expect(sites).toHaveLength(1);
    });

    test("a QUOTED Windows path is now read - the R40-era known miss closes", () => {
      // The existing suite test "a QUOTED backslash path in shell text is a
      // KNOWN miss" pins today's zero; fix 3 makes the lexer keep the literal
      // backslashes, the word becomes the real Windows path, and basename()
      // already splits on backslash - so the site appears. Step 3b updates the
      // old pin, the scan.ts residual-limits item 3, and their DEFERRED pointer.
      const sites = sitesIn('"C:\\pg\\bin\\psql.exe" -qAt mydb\n', "x.sh");
      expect(sites).toHaveLength(1);
    });

    test("ANSI-C escapes decode, so an escaped spelling of psql is still psql", () => {
      // $'p\163ql' and $'\x70sql' both expand to psql (supplement g1/g2). As
      // COMMAND words they must be sites; before the decode they lexed as their
      // raw escape text and were silently nothing.
      expect(sitesIn("$'p\\163ql' -X -qAt mydb\n", "x.sh").length).toBeGreaterThan(0);
      expect(sitesIn("$'\\x70sql' -X -qAt mydb\n", "x.sh").length).toBeGreaterThan(0);
      // An unknown escape keeps BOTH characters, as bash does: $'p\zsql' is
      // p\zsql, never psql.
      expect(sitesIn("$'p\\zsql' -X -qAt mydb\n", "x.sh")).toHaveLength(0);
    });

    // The two rows below pin the octal escape's digit range at BOTH ends. The
    // range is what makes the decode a decode: outside it the escape keeps its
    // backslash, and a backslash is a separator to basename(), so the value the
    // guard reads becomes a different command name entirely.
    test("the octal range starts at 0, so $'\\057' decodes to the path separator", () => {
      // \057 is '/'. Read as octal the value is /psql, whose basename is psql.
      // Left undecoded it is the literal \057psql, where basename splits on the
      // backslash and yields 057psql - not psql, and no site.
      premise(
        "the same value with the separator spelled literally binds psql",
        scanShellIndirection("PG=/psql\n", "x.sh").length,
        0,
      );
      expect(scanShellIndirection("PG=$'\\057psql'\n", "x.sh").length).toBeGreaterThan(0);
    });

    // Diff review r1 finding 2, swept as a CLASS: an input that makes the guard
    // THROW is worse than any miss, because one such line aborts the walk before
    // it can inspect anything after it. Both sites that can throw take a code
    // point out of file text and hand it to String.fromCodePoint, which rejects
    // anything above the Unicode maximum - where bash and the JS spec differ
    // from each other, and neither of them crashes. Out of range keeps the
    // undecoded reading, which cannot be psql: a documented limit, never a
    // crash. The two rows below are the two sites.
    test("a \\U escape above the Unicode maximum keeps its undecoded reading", () => {
      const source = "NOTE=$'\\U00110000'\npsql -X -qAt mydb\n";
      expect(() => sitesIn(source, "x.sh")).not.toThrow();
      // The point of not throwing: the psql call AFTER the offending line is
      // still inspected. `psql -X` is a real site, so a zero here would mean the
      // walk died rather than that the escape was read conservatively.
      expect(sitesIn(source, "x.sh").length).toBeGreaterThan(0);
    });

    test("a template literal's \\u{...} above the Unicode maximum keeps its raw reading", () => {
      const source = ["const note = `\\u{110000}`;", "execSync(`psql -X -qAt mydb`);", ""].join(
        "\n",
      );
      expect(() => scanSource(source, "x.ts")).not.toThrow();
      expect(scanSource(source, "x.ts").length).toBeGreaterThan(0);
      // An uncookable literal is reported CONSERVATIVELY - the site stands and
      // is NOT certified, because the guard cannot read the argv it would have
      // to certify. That direction is the whole reason this is a limit rather
      // than a defect, so it is pinned rather than left to the count.
      const uncookable = "execSync(`psql -X -qAt \\u{110000}mydb`);\n";
      const sites = scanSource(uncookable, "x.ts");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.suppressesStartupFiles).toBe(false);
    });

    // The two rows below pin the SAME bound from the other side. A limit that
    // declines everything is not a limit, it is a hole, so each of the two
    // guards is pinned at the last code point it must still accept.
    test("a \\U escape AT the Unicode maximum still decodes", () => {
      // U+10FFFF decoded is a non-word character, so `psql` keeps its leading
      // word boundary and the value binds. Left undecoded the value is
      // `\\U0010FFFFpsql`, where basename splits on the backslash and the `F`
      // before `psql` destroys the boundary - the guard would see no psql at
      // all, which is the paired zero asserted here.
      expect(scanShellIndirection("PG=$'\\U0010FFFFpsql'\n", "x.sh").length).toBeGreaterThan(0);
      expect(scanShellIndirection("PG=$'\\U00110000psql'\n", "x.sh")).toHaveLength(0);
    });

    test("a template literal's \\u{...} AT the Unicode maximum still maps its lines", () => {
      // The guard sits in the per-character LINE MAP, whose null return costs
      // the exact physical line rather than the site: the fallback attributes
      // the hit to the literal's OPENING line. So the assertion is the line, not
      // the count or the verdict - both of which are identical either way, and
      // neither of which would notice the bound moving one code point.
      const mapped = [
        "const q = `\\u{10FFFF}",
        "header`;",
        "execSync(`\\u{10FFFF}",
        "psql -X -qAt mydb`);",
        "",
      ].join("\n");
      const sites = scanSource(mapped, "x.ts");
      expect(sites).toHaveLength(1);
      expect(sites[0]!.line).toBe(4);
    });

    test("the octal range ends at 7, so $'\\73' decodes to the semicolon it spells", () => {
      // Read as octal the value is `psql;`, which is not the psql command - bash
      // looks for a file of that name - so the zero is correct. Left undecoded
      // the value is `psql\73`, which carries a bare psql word and no
      // metacharacter, and the guard would report a binding bash does not make.
      premise(
        "the same assignment without the escape binds psql",
        scanShellIndirection("PG=$'psql'\n", "x.sh").length,
        0,
      );
      expect(scanShellIndirection("PG=$'psql\\73'\n", "x.sh")).toHaveLength(0);
    });
  });

  // Boundary pin for the relational-boundary:2776:31, 2908:35 and 3018:32
  // equivalence rows (the alias-resolution depth guards and the alias anchor
  // comparison). The yaml parser refuses to register an anchor on an alias
  // node, so an alias always resolves to a non-alias in one step and the depth
  // guards are unreachable. The pin is the resolution itself, plus the
  // anchoring contract 2697 decides: a site from an alias is pinned to the
  // `run:` key's own line, not to the line the anchor was defined on.
  test("an aliased run body resolves, and its site is pinned to the run key", () => {
    const source = [
      "x: &cmd psql -qAt mydb",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: *cmd",
      "",
    ].join("\n");
    const sites = sitesIn(source, "w.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(5);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  // Kills regex-quantifier-bound:3005:32 (`[0-9+-]{0,2}` widened to `{0,3}`).
  // Found by cross-model review r1, which refuted the equivalence row this arc
  // first wrote for the site. YAML permits at most TWO block-scalar indicators —
  // one indentation digit and one chomping character — so `|2-+` is not a
  // header, and the parser says so ("Block scalar header includes extra
  // characters"). Characters the parser did not accept as a header are CONTENT,
  // and the widened bound blanks four of them: the scanner then reports offsets
  // four characters to the left of where the text actually is, pointing into the
  // header instead of at the command. The expected value is derived from the
  // fixture's own layout rather than written down, so it states the contract —
  // the reported offset locates the psql word inside the run scalar.
  test("a malformed block scalar header is content, so offsets still locate the command", () => {
    const source = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |2-+",
      "          psql -qAt mydb",
      "",
    ].join("\n");
    const sites = sitesIn(source, "w.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(5);
    expect(sites[0]!.offset).toBe(source.indexOf("psql -qAt mydb") - source.indexOf("|2-+"));
  });

  // Boundary pin for the same guard's LEGAL side, which the kill above does not
  // cover: the widest header YAML actually permits — both indicators plus a
  // trailing comment — is still recognised and blanked, so the psql line keeps
  // its physical position.
  test("a block scalar header with both indicators is blanked, keeping line numbers", () => {
    const source = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: >2-  # indented 2, folded, chomped",
      "          psql -qAt mydb",
      "",
    ].join("\n");
    const sites = sitesIn(source, "w.yml");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.line).toBe(5);
  });
});

describe("assignment bindings inside a nested body (diff review r2)", () => {
  // The SAME class as the compound-array regression, one level down, and this
  // one reaches a FALSE CERTIFICATION rather than a missed report. The outer
  // lexer replaces a `$(…)` body with the opaque `${}` word, so the assignment
  // family cannot see inside it; `visitBody` already lexes those bodies for the
  // indirection rules but never asked them for bindings. When such a body ALSO
  // contains a literal psql call, `visitBody` returns early (that call is
  // already a site), the site is certified on its own `-X`, and the expanded
  // invocation bash runs FIRST — without `-X` — is nowhere in the output.
  //
  // Probed base-versus-HEAD: every recognized nesting shape went 1 -> 0.
  test.each([
    ["command substitution", 'X=$(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)\n'],
    ["quoted command substitution", 'X="$(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)"\n'],
    ["process substitution", 'cat <(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)\n'],
    ["output process substitution", 'tee >(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)\n'],
    ["backticks", 'X=`PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb`\n'],
    ["nested twice", 'X=$(Y=$(PG=psql; "$PG" -qAt mydb); psql -X -qAt mydb)\n'],
  ])("%s: the binding inside the body is still read", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("a body whose binding is invisible cannot leave the file silently certified", () => {
    // The direction that makes this class BLOCKING rather than a recall gap: the
    // literal call carries -X and is certified, so without the indirection the
    // whole file reads as safe while bash runs an unsuppressed psql first.
    const source = 'X=$(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)\n';
    premiseHolds(
      "the literal call in the same body IS certified, so a zero here would read as safe",
      sitesIn(source, "x.sh").some((site) => site.suppressesStartupFiles),
    );
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("a nested body binding another program reports nothing", () => {
    premise(
      "the same body with a psql binding IS reported",
      scanShellIndirection('X=$(PG=psql; "$PG" -qAt mydb)\n', "x.sh").length,
      0,
    );
    expect(scanShellIndirection('X=$(PG=pgcli; "$PG" -qAt mydb)\n', "x.sh")).toHaveLength(0);
  });

  test("a backtick span in JS/TS text stays markdown, bindings included", () => {
    // The existing carve-out: in a .ts file a backtick span is a documentation
    // code span, not a substitution. The binding rule inherits that judgement
    // rather than re-deciding it, so prose cannot mint a binding.
    premiseHolds(
      "the same text in a .sh file IS a substitution and reports",
      scanShellIndirection('X=`PG=psql; "$PG" -qAt mydb`\n', "x.sh").length > 0,
    );
    expect(scanShellIndirection('// wrap with `PG=psql; "$PG" -qAt mydb`\n', "x.ts")).toHaveLength(
      0,
    );
  });
});

describe("compound-array assignment values (diff review r1 finding 1)", () => {
  // A REGRESSION this arc introduced and review caught: the retired line-text
  // patterns read `PG=([0]=psql)` because they never saw the shell's words, and
  // the lexed-word route lost it because `(` and `)` are OPERATORS that split
  // the value into its own words. Probed base-versus-new on the whole vector,
  // every row 1 -> 0.
  //
  // The repair is the shell's own grammar rather than a second one: `(` is the
  // ONLY member of OPERATOR_STARTS that can appear INSIDE an assignment value -
  // `;`, `&` and `|` each terminate the assignment word, which is why the lexer
  // is right to split on them - so the compound case is read by handing each
  // element word to the SAME value predicate the single-word case uses.
  test.each([
    ["bare element", "PG=(psql)\n"],
    ["keyed element", "PG=([0]=psql)\n"],
    ["append form", "PG+=(psql)\n"],
    ["declare -a", "declare -a PG=([0]=psql)\n"],
    ["associative", "declare -A PG=([x]=psql)\n"],
    ["mixed-quoted element", "PG=([0]=p'sql')\n"],
    ["quoted path element", "PG=('/usr/bin/'psql)\n"],
    ["later element", "PG=(pgcli psql)\n"],
    ["multi-line compound", "PG=(\n  psql\n)\n"],
  ])("%s binds the psql command and is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  test("a compound array of other programs binds nothing", () => {
    premise(
      "the same shape with a psql element IS reported",
      scanShellIndirection("PG=([0]=psql)\n", "x.sh").length,
      0,
    );
    expect(scanShellIndirection("PG=([0]=pgcli)\n", "x.sh")).toHaveLength(0);
  });

  test("an element after the closing paren is not part of the value", () => {
    // `)` ends the compound value, so the word after it is a separate command
    // word rather than an element. `pgcli` there leaves the assignment binding
    // nothing, and the zero is attributable to the paren rather than to a
    // fixture the rule never sees.
    premise(
      "the same word INSIDE the parens is an element and is reported",
      scanShellIndirection("PG=(psql)\n", "x.sh").length,
      0,
    );
    expect(scanShellIndirection("PG=(x) pgcli\n", "x.sh")).toHaveLength(0);
  });

  test("every operator the lexer knows is either inside a value or ends it", () => {
    // The SWEEP, derived rather than enumerated: the class this finding belongs
    // to is "an assignment value the lexer splits across an operator", so the
    // cover has to range over the lexer's own operator set. Adding a member to
    // OPERATOR_STARTS later forces this test to account for it instead of
    // silently inheriting a list written today.
    //
    // `(` opens a compound value and `)` closes it; a newline inside one is
    // ordinary whitespace. Every OTHER operator TERMINATES the assignment word,
    // so what follows is a separate command rather than part of the value -
    // which is exactly why the lexer splitting on it is right and no second
    // grammar is owed.
    const insideAValue = new Set(["(", ")", "\n"]);
    premiseHolds(
      "the operator set still carries members outside the compound delimiters",
      [...OPERATOR_STARTS].some((operator) => !insideAValue.has(operator)),
    );
    premiseHolds(
      "the compound delimiters are still members of the operator set",
      [...insideAValue].every((operator) => OPERATOR_STARTS.has(operator)),
    );
    for (const operator of OPERATOR_STARTS) {
      if (insideAValue.has(operator)) continue;
      expect(scanShellIndirection(`PG=${operator}psql\n`, "x.sh")).toHaveLength(0);
    }
    // And the delimiters do their two jobs, so the zeros above are attributable
    // to the operator rather than to a rule that reports nothing at all.
    expect(scanShellIndirection("PG=(psql)\n", "x.sh").length).toBeGreaterThan(0);
    expect(scanShellIndirection("PG=\npsql\n", "x.sh")).toHaveLength(0);
  });

  test("an UNTERMINATED compound assignment binds nothing", () => {
    // `PG=(` with no closing paren is a bash syntax error: the file runs
    // nothing, so no binding is correct. Pinned because the alternative -
    // scanning to end of input - would let one stray paren report every psql
    // word in the rest of the file against this one line.
    premiseHolds(
      "the same source WITH the closing paren is reported",
      scanShellIndirection("PG=(\n  psql\n)\n", "x.sh").length > 0,
    );
    expect(scanShellIndirection("PG=(\n  psql\n", "x.sh")).toHaveLength(0);
  });
});

describe("mixed-quoted assignment values (BL-SHELL-BINDING-MIXED-QUOTED-VALUE)", () => {
  // The shell reads an assignment value as a CONCATENATION of quoted, escaped
  // and bare segments; the retired regex pair read one delimiter form. Oracle
  // per row: the probe record (instrument 2) - every value below reassembles
  // to psql or a psql path.
  test.each([
    ["quoted then bare", "PG=p'sql'\n"],
    ["bare then quoted", "PG='p'sql\n"],
    ["double-quoted split", 'PG="ps"ql\n'],
    ["quoted path prefix", "PG='/usr/bin/'psql\n"],
    ["escaped spelling", "PG=p\\sql\n"],
    ["ANSI-C quoted", "PG=$'psql'\n"],
    ["ANSI-C octal escape", "PG=$'p\\163ql'\n"],
    ["ANSI-C hex escape", "PG=$'\\x70sql'\n"],
    ["locale quoted", 'PG=$"psql"\n'],
    ["mixed inside declare", "declare -x PG=p'sql'\n"],
    ["mixed whole-argument quoting", "export 'PG=p'sql\n"],
    // Word-splitting trims an unquoted expansion (spec §3.1 trim; supplement
    // g3/g6): both of these run psql at their use sites.
    ["quoted leading space", "PG=' psql'\n"],
    ["ANSI-C trailing newline", "PG=$'psql\\n'\n"],
    // Separator characters in DIRECTORY components (round-4 finding 1): the
    // basename is psql, so the value binds the command; probed against bash.
    ["apostrophe directory", 'PG="/tmp/O\'Reilly/psql"\n'],
    ["double-quote directory", "PG='/tmp/x\"y/psql'\n"],
    ["semicolon directory", "PG='/tmp/x;y/psql'\n"],
    ["pipe directory", "PG='/tmp/x|y/psql'\n"],
    ["ampersand directory", "PG='/tmp/x&y/psql'\n"],
  ])("%s binds the psql command and is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // The same shell fact as the ratified trailing-backslash contract, applied
  // uniformly: a value whose expansion ends in a literal backslash has an
  // empty basename and is never the psql command. All three REPORTED before
  // this repair (probe record, instrument 1) - shell-false hits.
  test.each([
    ["bare value, dangling final backslash", "PG=psql\\"],
    ["bare value, escaped backslash at end of input", "PG=psql\\\\"],
    ["single-quoted literal trailing backslash", "PG='psql\\'\n"],
  ])("%s binds a trailing-backslash value and is NOT reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  // Precision survivors: values whose dequoted text is NOT the psql command.
  // `PG='psql'x` and the EOF-backslash pair are already pinned by the ledger
  // entry's corrected non-instances and the ratified contract test; these two
  // are the NEW spellings this block must hold at zero.
  test.each([
    ["quoted semicolon value", "PG='psql;x'\n"], // binds `psql;x`
    ["whole-argument quoting with a literal quote", "export 'PG=p'\\''sql'\n"], // binds `p'sql`
    ["double-quoted literal backslash", 'PG="p\\sql"\n'], // binds `p\sql` (supplement g5)
    ["ANSI-C unknown escape", "PG=$'p\\zsql'\n"], // binds `p\zsql` (bash keeps both chars)
    // Digit-boundary pins, doubling as PREEMPTIVE mutant kills for the
    // decodeAnsiCEscape quantifier sites (Task 6 / Global Constraints): a
    // widened octal {1,4} would decode \0160 as 0x70 (`psql`) where bash's
    // three-digit read yields control-14 + `0sql`; a widened hex {1,3} would
    // decode \x070 as 0x70 where bash's two-digit read yields bell + `0sql`.
    ["ANSI-C octal digit bound", "PG=$'\\0160sql'\n"], // binds SO + `0sql`, never psql
    ["ANSI-C hex digit bound", "PG=$'\\x070sql'\n"], // binds BEL + `0sql`, never psql
    // Unterminated ANSI-C is a shell syntax error that runs nothing; the
    // lexer keeps the old undecoded reading (spec 6.4, round-3 finding 2).
    ["unterminated ANSI-C string", "PG=$'p\\163ql"],
  ])("%s does not bind psql and stays unreported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  // The R34 wrapped-path binding must survive the spliced consumer's deletion:
  // the double-quote continuation fix (Task 1) glues the word, the word route
  // reads it. Premise-style duplicate of the committed R34 fixture, kept here
  // because THIS block is the one that owns the regex deletion.
  test("a double-quoted backslash-newline wrapped path still binds", () => {
    expect(
      scanShellIndirection('PSQL="/opt/postgresql/17/bin/\\\npsql"\n"$PSQL" -qAt mydb\n', "x.sh")
        .length,
    ).toBeGreaterThan(0);
  });

  // The word route lexes the RAW file, and a YAML block scalar is DEDENTED
  // before the shell sees it - so a continuation inside a `run:` body glues
  // without the block's indentation. The retired `spliced` view stripped that
  // whitespace for every file type; the replacement strips it only where it is
  // the document's own semantics, which is why the two spellings below differ.
  // The `.sh` zero is the whitespace-in-a-directory-component limit (spec §6
  // item 5) reached through a continuation: bash really does bind
  // `/opt/pg/   psql` there.
  test("a wrapped path is dedented in YAML and kept literal in shell", () => {
    const yaml = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      '          PSQL="/opt/pg/\\',
      '          psql"',
      '          "$PSQL" -qAt mydb',
      "",
    ].join("\n");
    expect(scanShellIndirection(yaml, ".github/workflows/x.yml").length).toBeGreaterThan(0);
    // Premise: the same shell text WITHOUT the indentation binds, so the zero
    // below is attributable to the whitespace the shell keeps.
    premise(
      "an unindented continuation binds in a .sh file",
      scanShellIndirection('PSQL="/opt/pg/\\\npsql"\n"$PSQL" -qAt mydb\n', "x.sh").length,
      0,
    );
    expect(
      scanShellIndirection('PSQL="/opt/pg/\\\n          psql"\n"$PSQL" -qAt mydb\n', "x.sh"),
    ).toHaveLength(0);
  });

  // Conservative widening, spec §4: the expansion-prefixed psql suffix is the
  // same trailing-path shape isPsqlCommandWord treats as psql-capable.
  test("an expansion-prefixed psql suffix is reported", () => {
    expect(scanShellIndirection("PG=$(x)psql\n", "x.sh").length).toBeGreaterThan(0);
  });

  // Structural handoff, spec §3.1: a substitution VALUE is the discovery
  // walk's jurisdiction, not the binding rule's - the opaque `${}` word
  // carries no psql text, and visitBody still reports the body.
  test("a binding inside a substitution body is still reported by discovery", () => {
    expect(scanShellIndirection('X=$(PG=psql; "$PG" -qAt mydb)\n', "x.sh").length).toBeGreaterThan(
      0,
    );
  });

  // Spec 3.1 reporting parity (round-2 finding 2): every assignment-shaped
  // word is examined independently - a non-qualifying one neither reports nor
  // shadows a later binding on the same line.
  test("a non-qualifying assignment does not shadow a later binding on the line", () => {
    expect(scanShellIndirection("A=no PG=psql\n", "x.sh").length).toBeGreaterThan(0);
  });

  // A MULTIWORD command binding read as the lexer's dequoted concatenation:
  // the retired quotedValue regex required the whole value inside ONE quote
  // pair, so a segment split anywhere lost it.
  test.each([
    ["a segment-split command binding", 'CMD=\'psq\'"l -qAt mydb"\neval "$CMD"\n'],
    ["an inner-quoted spelling in the value", 'CMD=\'p"s"ql -X mydb\'\neval "$CMD"\n'],
    // An internal newline is IFS whitespace to an unquoted expansion: bash
    // word-splits $'psql\n-X mydb' into one flagged argv (round-3 finding 3).
    // The literal-newline single-quoted spelling reaches the same branch,
    // because the branch decides the lexed value CONTENT, not the spelling.
    ["a newline-separated command binding", "PG=$'psql\\n-X mydb'\n"],
    // Literal quote characters in a directory component are DATA to the
    // word-split consumer (round-5 finding 1): bash argv is the full path
    // plus -X mydb for both rows.
    ["an apostrophe-directory command binding", 'CMD="/tmp/O\'Reilly/psql -X mydb"\n'],
    ["a double-quote-directory command binding", "CMD='/tmp/x\"y/psql -X mydb'\n"],
  ])("multiword binding value: %s is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // RETIRED LIMIT, 2026-08-22 (BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE). These
  // two rows pinned a ZERO and now pin a HIT. Re-pinned rather than deleted: a
  // retired limit stays visible as a pin, so the improvement is asserted rather
  // than merely no longer contradicted.
  //
  // The old comment here named the FLAG CRITERION as the cause, and that was
  // wrong in a way worth recording, because a true-looking explanation of a
  // behaviour that no longer exists is worse than none. The flag criterion is
  // untouched and still stands. What actually caused the miss is this arc's
  // defect: `scanShellIndirection` lexed the whole YAML file, so the scalar's
  // YAML quotes were read as SHELL quotes and the entire body collapsed into
  // one literal word with no assignment in it. Nothing about flags ever came
  // into it. The reader now blanks the quoted scalar and rescans its DECODED
  // value, where the binding is an ordinary assignment and reads normally.
  //
  // Predicted by the predecessor arc, which said recall here needed YAML-aware
  // value extraction on a different surface
  // (docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md
  // lines 322-328). This is that extraction.
  test.each([
    ["the plain spelling", '- run: "PG=psql; $PG -qAt mydb"\n', "PG=psql; $PG -qAt mydb"],
    ["the mixed spelling", "- run: \"PG=p'sql'; $PG -qAt mydb\"\n", "PG=p'sql'; $PG -qAt mydb"],
  ])(
    "multiword binding value: a quoted run: scalar (%s) is READ, not a limit",
    (_label, source, text) => {
      expect(
        scanShellIndirection(source, ".github/workflows/x.yml").map((hit) => ({
          line: hit.line,
          text: hit.text,
        })),
      ).toEqual([{ line: 1, text }]);
    },
  );
});

describe("arm 1 - a DETACHED here-string target is read from the lexer's retained word", () => {
  // Ledger: BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE. Design:
  // docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md
  // sections 3.1-3.2. `lexShellWords` gains an optional third out-parameter and
  // pushes the DETACHED redirection target there instead of discarding it, so
  // the target carries the lexer's OWN quote removal, ANSI-C decoding and
  // escape handling - there is no second dequoting path that can drift from the
  // first, which is the defect shape the 2026-08-17 arc retired when it deleted
  // the per-delimiter pattern family. The here-string rule then becomes a
  // UNION: the existing READ_HERE_STRING pattern (kept - it is the only reading
  // that sees inside a `$(...)` body, and it is stricter-in-reverse on prose)
  // plus a `read`-grammar PREFIX match with a `<<<` target belonging to the same
  // LOGICAL line.
  //
  // EVERY fixture below sits ALONE on its own line. `scanShellIndirection` has
  // TWO emission routes, and the coalesced LINE route emits at most ONE hit per
  // line (`hit = assigned ?? aliased ?? functionDef ?? githubEnvWrite ??
  // positionalBinding`), so a here-string sharing its line with an assignment
  // binding could not fail whatever this rule does.
  test.each([
    ["A1 a mixed-quoted target", "read -r PG <<< p'sql'\n", "read -r PG <<< psql\n"],
    ["A6 an ANSI-C target", "read -r PG <<< $'p\\163ql'\n", "read -r PG <<< psql\n"],
    [
      "H4 a quoted DIRECTORY component",
      "read -r PG <<< /usr/'bin'/psql\n",
      "read -r PG <<< /usr/bin/psql\n",
    ],
    [
      "N1 a continuation BEFORE the operator",
      "read -r PG \\\n <<< p'sql'\n",
      "read -r PG \\\n <<< psql\n",
    ],
    [
      "N2 a continuation BETWEEN the operator and its target",
      "read -r PG <<< \\\n p'sql'\n",
      "read -r PG <<< \\\n psql\n",
    ],
  ])("%s binds psql from the here-string", (label, mixed, plain) => {
    // The premise is computed on THIS row's own plain sibling, which differs
    // from the fixture by exactly one variable - the quoting of the target -
    // so the flip is attributable to the target's dequoting and not to the
    // rule never having been reached.
    premise(
      `${label}: the PLAIN spelling of this same fixture already reaches the here-string rule`,
      scanShellIndirection(plain, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(mixed, "x.sh"), label).toHaveLength(1);
  });

  // A7 sits inside a `$(...)` body, where `visitBody` emits INDEPENDENTLY of and
  // BEFORE the coalesced line route: `X=$(read -r PG <<< psql)` reports TWICE
  // today, once per route. So a count assertion here would be satisfied by
  // nested DISCOVERY rather than by the here-string route under test. Both the
  // premise and the assertion are therefore on hit TEXT: route B can only ever
  // emit the BODY's text, so a hit carrying the OUTER line is the here-string
  // route and nothing else.
  test("A7 a mixed-quoted target inside a command substitution binds psql", () => {
    const mixed = "X=$(read -r PG <<< p'sql')\n";
    const plain = "X=$(read -r PG <<< psql)\n";
    premiseHolds(
      "A7: the plain spelling's here-string route already emits a hit carrying the OUTER line, distinguishable from visitBody's body-text hit",
      scanShellIndirection(plain, "x.sh").some((hit) => hit.text === "X=$(read -r PG <<< psql)"),
    );
    expect(scanShellIndirection(mixed, "x.sh").map((hit) => hit.text)).toContain(
      "X=$(read -r PG <<< p'sql')",
    );
  });

  // ── Killers: each rule against the strictly weaker implementation that would
  // pass a naive fixture set. Every expect-CLEAN case below is PAIRED with a
  // reporting twin differing by exactly ONE variable on the SAME machinery,
  // because a fixture expecting clean is satisfied by any implementation that
  // fails to look at all - a broken parse, a wrong operator, an empty target
  // list. The pair is what makes the zero attributable.

  // Killer 3 - association is by LOGICAL line, not "any `<<<` target anywhere
  // in the file". The single variable between the two fixtures is WHICH LINE
  // carries the psql-bearing target; everything else is byte-identical.
  test("killer 3: a `<<<` target on ANOTHER logical line does not bind the read", () => {
    const elsewhere = "read -r PG <<< notpsql\ncat x <<< psql\n";
    const ownLine = "read -r PG <<< psql\ncat x <<< notpsql\n";
    premise(
      "the one-variable twin, with the psql target on the READ's own logical line, reports",
      scanShellIndirection(ownLine, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(elsewhere, "x.sh")).toHaveLength(0);
  });

  // Killer 4 - the whole-value rule applies to a `<<<` target SPECIFICALLY. An
  // operator-blind implementation that keeps the read-prefix and logical-line
  // checks but ignores WHICH redirection the target belongs to reports here,
  // because with `<` the shell hands `read` the FILE'S CONTENT (bash binds
  // `psql-file-content`, probed) rather than the word. The single variable is
  // the operator. `cat x > ${U:-psql}` would NOT be a valid killer: it carries
  // no `read`, so the prefix check alone rejects it and it cannot discriminate.
  // Killer 4-prime, and it is the one that actually exercises the per-target
  // operator check. The fixture below is decided by a DIFFERENT rule: the
  // read-grammar PREFIX requires `<<<`, so a line carrying only a `<` never
  // reaches the target loop at all and stays 0 under an operator-blind
  // implementation too. This one puts a `<<<` read AND a second, non-`<<<`
  // target on the same logical line, so the prefix matches and the operator
  // check is the only thing between the `>` target and the predicate. Probed:
  // 0 shipped, 1 with the operator check removed.
  test("killer 4: a NON-here-string target on a read's own line is not read", () => {
    const otherOperator = "read -r PG <<< notpsql > ${U:-psql}\n";
    const onTheHereString = "read -r PG <<< ${U:-psql} > notpsql\n";
    premise(
      "the one-variable twin, the same psql value moved onto the `<<<` target, reports",
      scanShellIndirection(onTheHereString, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(otherOperator, "x.sh")).toHaveLength(0);
  });

  // Killer 4 - a `<` target is not a here-string. NOTE what decides this one:
  // the read-grammar PREFIX requires `<<<`, so this line never reaches the
  // target loop. It pins the PREFIX rule, not the per-target operator check;
  // the fixture above is the one for that.
  test("killer 4: a `<` target that is not a here-string does not bind the read", () => {
    const notHereString = "read -r PG < ${U:-psql}\n";
    const hereString = "read -r PG <<< ${U:-psql}\n";
    premise(
      "the one-variable twin, with `<<<` in place of `<` and the same target text, reports",
      scanShellIndirection(hereString, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(notHereString, "x.sh")).toHaveLength(0);
  });

  // Killer 5 - retained targets must never reach argv, and the ASSIGNMENT route
  // is a SECOND consumer of the word array. An implementation that adds targets
  // to the words and filters them at the `scanShellText` consumer only leaves
  // the retained `PG=psql` visible to `assignmentBindingLines`, which reports.
  // The single variable is the `cat x > ` redirection prefix.
  test("killer 5: a retained target is invisible to the ASSIGNMENT route", () => {
    const asTarget = "cat x > PG=psql\n";
    const asAssignment = "PG=psql\n";
    premise(
      "the one-variable twin, the same `PG=psql` word with no redirection in front of it, reports through the assignment route",
      scanShellIndirection(asAssignment, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(asTarget, "x.sh")).toHaveLength(0);
  });

  // The other half of killer 5, and the executable half of AC-3: the SITE path
  // must be byte-identical in behavior. `scanShellText` passes no targets array,
  // so it receives the same `ShellWord[]` it does today - a property of the
  // signature rather than of careful editing at each consumer.
  test("killer 5: a retained target is invisible to the SITE path", () => {
    expect(sitesIn("cat x > psql\n", "x.sh")).toHaveLength(0);
    const sites = sitesIn("psql -X -qAt mydb > out.sql\n", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.tokens).toEqual(["-X", "-qAt", "mydb"]);
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });
});

describe("arm 2 - a WHOLE-VALUE accepted expansion has its operand decided", () => {
  // Ledger: BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE. Design:
  // docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md
  // section 3.3. The lexer consumes a `${...}` expansion whole and appends the
  // raw slice as ONE opaque word - the property that stops brace-protected
  // whitespace from splitting a redirection target into a phantom argv word,
  // and it is PRESERVED. Arm 2 adds a DECISION alongside that word: when the
  // whole value is one expansion drawn from a six-member ACCEPT-SET, its
  // dequoted operand becomes an ADDITIONAL string tested by the SAME
  // `valueBinds` predicate. The verbatim text is still tested, unchanged.
  //
  // Every fixture sits ALONE on its own line, and every premise below is that
  // row's OWN plain sibling - the identical spelling with the operand's quoting
  // removed - so each flip is attributable to the operand's dequoting and to
  // nothing else. Each was measured at 1 on this branch before the arm landed.
  test.each([
    ["C1 a single-quoted operand", "PG=${U:-'psql'}\n", "PG=${U:-psql}\n"],
    ["C2 a mixed double-quoted operand", 'PG=${U:-p"sql"}\n', "PG=${U:-psql}\n"],
    ["C3 an ANSI-C operand", "PG=${U:-$'p\\163ql'}\n", "PG=${U:-psql}\n"],
    ["C5 the assign-default operator", "PG=${U:='psql'}\n", "PG=${U:=psql}\n"],
    ["C6 the alternate operator", "PG=${U:+'psql'}\n", "PG=${U:+psql}\n"],
    ["C7 the unset-only default operator", "PG=${U-'psql'}\n", "PG=${U-psql}\n"],
    ["C9 a NESTED accepted operand", "PG=${U:-${V:-'psql'}}\n", "PG=${U:-${V:-psql}}\n"],
    ["K1 the bare assign operator", "PG=${U='psql'}\n", "PG=${U=psql}\n"],
    ["K2 the bare alternate operator", "PG=${U+'psql'}\n", "PG=${U+psql}\n"],
    ["L1 a MULTIWORD bare operand", "PG=${U:-psql -X}\n", "PG=${U:-psql}\n"],
    ["L2 a multiword operand, quoted command", "PG=${U:-'psql' -X}\n", "PG=${U:-psql}\n"],
    ["L3 a multiword operand, wholly quoted", "PG=${U:-'psql -X'}\n", "PG=${U:-psql}\n"],
  ])("%s binds psql", (label, value, plain) => {
    premise(
      `${label}: this row's own plain sibling already reports through the expansion route`,
      scanShellIndirection(plain, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(value, "x.sh"), label).toHaveLength(1);
  });

  // The SECOND site: a here-string TARGET whose entire text is one accepted
  // expansion gets the identical rule, which is what makes the two arms
  // compose. Arm 1's retention is what makes this site exist at all - before
  // it there was no target to decide. Same predicate, second call site, not a
  // second mechanism.
  test.each([
    ["R1 a single-quoted operand", "read -r PG <<< ${U:-'psql'}\n", "read -r PG <<< ${U:-psql}\n"],
    [
      "R2 a mixed double-quoted operand",
      'read -r PG <<< ${U:-p"sql"}\n',
      "read -r PG <<< ${U:-psql}\n",
    ],
    [
      "R3 the assign-default operator",
      "read -r PG <<< ${U:='psql'}\n",
      "read -r PG <<< ${U:=psql}\n",
    ],
    ["R4 the alternate operator", "read -r PG <<< ${U:+'psql'}\n", "read -r PG <<< ${U:+psql}\n"],
    [
      "R5 the unset-only default operator",
      "read -r PG <<< ${U-'psql'}\n",
      "read -r PG <<< ${U-psql}\n",
    ],
    ["R6 the bare assign operator", "read -r PG <<< ${U='psql'}\n", "read -r PG <<< ${U=psql}\n"],
    [
      "R7 the bare alternate operator",
      "read -r PG <<< ${U+'psql'}\n",
      "read -r PG <<< ${U+psql}\n",
    ],
    [
      "R8 a NESTED accepted operand",
      "read -r PG <<< ${U:-${V:-'psql'}}\n",
      "read -r PG <<< ${U:-${V:-psql}}\n",
    ],
  ])("%s binds psql through a here-string target", (label, value, plain) => {
    premise(
      `${label}: this row's own plain sibling already reports through the here-string target`,
      scanShellIndirection(plain, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(value, "x.sh"), label).toHaveLength(1);
  });

  // The candidate is TRIMMED on its default-IFS edges, like every other value
  // `valueBinds` sees. Pinned because that trim is load-bearing for a mutation
  // equivalence claim, not merely tidy: the SPLIT reading decides this value
  // (the eval reading takes the pathname apostrophe as syntax and declines),
  // and an untrimmed operand puts an empty string at argv[0], which silently
  // declines it. bash binds ` /tmp/O'Reilly/psql -X` here and word-splits it at
  // the use site, so the report is correct.
  test("a candidate is trimmed on its IFS edges, so the split reading still sees argv[0]", () => {
    const leading = 'PG=${U:-" /tmp/O\'Reilly/psql -X"}\n';
    const flush = 'PG=${U:-"/tmp/O\'Reilly/psql -X"}\n';
    premise(
      "the one-variable twin, the same operand with no leading space, reports",
      scanShellIndirection(flush, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(leading, "x.sh")).toHaveLength(1);
  });

  // Killer 1 - the candidate exists ONLY when the WHOLE value is one accepted
  // expansion. The strictly weaker implementation is the SUBSTITUTION model the
  // round-3 spec draft carried, which read the operand of any accepted `${...}`
  // appearing ANYWHERE in the value. It was withdrawn because it produced a
  // FALSE REPORT across a complement boundary, and wrongly-loud is the one
  // direction the consequence bound does not permit.
  test("killer 1: an accepted expansion COMPOSED with literal text is not read", () => {
    // bash binds `ppsql` here, so the zero is CORRECT, not merely conservative.
    const composed = 'PG=p${U:-"psql"}\n';
    const alone = 'PG=${U:-"psql"}\n';
    premise(
      "the one-variable twin, the same operand with no literal text before the span, reports",
      scanShellIndirection(alone, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(composed, "x.sh")).toHaveLength(0);
  });

  test("killer 1: an accepted expansion INSIDE a complement member is not read", () => {
    // The substitution model yielded the candidate `${U#psql}` here and
    // reported, while bash binds `xpsql`. This is the exact false report the
    // whole-value fence removes by construction rather than by care.
    const wrapped = "U=xpsql\nPG=${U#${V:-'psql'}}\n";
    const unwrapped = "U=xpsql\nPG=${V:-'psql'}\n";
    premise(
      "the one-variable twin, the same accepted span with no complement member around it, reports",
      scanShellIndirection(unwrapped, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(wrapped, "x.sh")).toHaveLength(0);
  });

  // Killer 2 - the accept-set is exactly six operators and the whole complement
  // is DEFAULT-DENIED. The strictly weaker implementation is a DENYLIST ("any
  // operator except `#`, `%`, `/`"), which silently accepts the error-word,
  // substring, case-modification and transformation forms. `${U:?word}` is
  // outside such a denylist, so a denylist reads its operand `psql` and REPORTS
  // - while bash binds NOTHING there, because the expansion errors and the
  // shell exits. `${U:1}` is NOT a killer: a denylist reading it extracts the
  // operand `1`, which the predicate rejects anyway, so both implementations
  // agree and the fixture cannot discriminate.
  test("killer 2: the error-word operator is outside the accept-set and is not read", () => {
    const errorWord = "PG=${U:?'psql'}\n";
    const accepted = "PG=${U:-'psql'}\n";
    premise(
      "the one-variable twin, the same operand under an ACCEPTED operator, reports",
      scanShellIndirection(accepted, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(errorWord, "x.sh")).toHaveLength(0);
  });

  // The DEFAULT-DENY complement, made EXECUTABLE rather than merely asserted.
  // Every row carries the value it holds TODAY, measured on this branch, and
  // the case asserts the WHOLE table at once - so a change that starts reading
  // ANY complement operand moves at least one row and fails here.
  //
  // The mixed directions are the point, and they are what make this table a
  // real check rather than an absence-asserting one: the rows at 1 report
  // through the VERBATIM text for a pre-existing reason (a bare `psql` survives
  // in the word), and a candidate that started reading them would not change
  // those. So the zeros carry the discriminating weight while the ones are the
  // must-be-PRESENT control that proves the machinery ran at all.
  //
  // Recorded because it contradicts the plan's transcribed table: the
  // case-modification and transformation rows are 0 STANDALONE. Section 4's `1`
  // for them belongs to the `U=psql;` prefix in the probe spelling, where the
  // ASSIGNMENT route decides the observation - a different rule from the one
  // under test - so the standalone spelling is what is pinned here.
  test("every DEFAULT-DENIED complement operator keeps exactly today's reading", () => {
    const rows: Array<[label: string, source: string]> = [
      ["pattern # quoted", "PG=${U#'psql'}\n"],
      ["pattern % quoted", "PG=${U%'psql'}\n"],
      ["pattern / quoted", "PG=${U/'psql'/x}\n"],
      ["length", "PG=${#psql}\n"],
      ["pattern # bare", "PG=${U#psql}\n"],
      ["error word quoted", "PG=${U:?'psql'}\n"],
      ["indirection", "PG=${!psql}\n"],
      ["subscript", "PG=${A[psql]}\n"],
      ["substring offset", "PG=${U:1}\n"],
      ["substring offset and length", "PG=${U:1:4}\n"],
      ["substring negative offset", "PG=${U: -4}\n"],
      ["case modification ^", "PG=${U^}\n"],
      ["case modification ,,", "PG=${U,,}\n"],
      ["transformation @Q", "PG=${U@Q}\n"],
      ["transformation @U", "PG=${U@U}\n"],
      ["target, pattern #", "read -r PG <<< ${U#'psql'}\n"],
      ["target, substring", "read -r PG <<< ${U:1}\n"],
    ];
    const measured = rows.map(([label, source]) => [
      label,
      scanShellIndirection(source, "x.sh").length,
    ]);
    expect(measured).toEqual([
      ["pattern # quoted", 0],
      ["pattern % quoted", 0],
      ["pattern / quoted", 0],
      ["length", 1],
      ["pattern # bare", 1],
      ["error word quoted", 0],
      ["indirection", 1],
      ["subscript", 1],
      ["substring offset", 0],
      ["substring offset and length", 0],
      ["substring negative offset", 0],
      ["case modification ^", 0],
      ["case modification ,,", 0],
      ["transformation @Q", 0],
      ["transformation @U", 0],
      ["target, pattern #", 0],
      ["target, substring", 0],
    ]);
  });

  // The remaining section 4 "unchanged" rows, pinned at the value measured on
  // this branch. Pinning ALL of them is what makes AC-2 true as written;
  // leaving a subset would require arguing which rows are "plausibly" movable,
  // which is exactly the judgment a reviewer would relitigate. Sites and hits
  // are asserted in ONE table so a change that moves any of them fails here.
  test("every remaining section 4 unchanged row holds its probed value", () => {
    const hitRows: Array<[label: string, source: string]> = [
      ["A3 the ATTACHED here-string, RETIRED 2026-08-21", "read -r PG <<<p'sql'\n"],
      ["A5 a fully quoted target", "read -r PG <<< 'psql'\n"],
      ["A10 a notpsql target", "read -r PG <<< notpsql\n"],
      ["F1 a DETACHED substitution target", "cat x > $(command -v psql)\n"],
      ["F2 the ATTACHED substitution target", "cat x >$(command -v psql)\n"],
      ["E2 a notpsql operand", "PG=${U:-'notpsql'}\n"],
      ["E5 a double-quoted WHOLE expansion", "PG=\"${U:-'psql'}\"\n"],
      ["Q2 a composed value inside double quotes", 'PG="p${U:-sql}"\n'],
    ];
    expect(
      hitRows.map(([label, source]) => [label, scanShellIndirection(source, "x.sh").length]),
    ).toEqual([
      // RETIRED 2026-08-21. The attached target is delimited by construct and
      // retained now, so the here-string reader sees `p'sql'` exactly as it
      // sees the detached spelling. Ledger:
      // BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION.
      ["A3 the ATTACHED here-string, RETIRED 2026-08-21", 1],
      ["A5 a fully quoted target", 1],
      ["A10 a notpsql target", 0],
      ["F1 a DETACHED substitution target", 1],
      // RETIRED 2026-08-21, same ledger row: the substitution inside the
      // attached target is a nested body now, so the discovery hit its
      // DETACHED sibling has always produced is produced here too.
      ["F2 the ATTACHED substitution target", 1],
      ["E2 a notpsql operand", 0],
      ["E5 a double-quoted WHOLE expansion", 0],
      ["Q2 a composed value inside double quotes", 0],
    ]);

    const siteRows: Array<[label: string, source: string]> = [
      ["A9 a here-DOC body", "read -r PG <<EOF\npsql\nEOF\n"],
      ["B2 a redirection target NAMED psql, quoted", "cat x > 'psql'\n"],
      ["B4 a psql call carrying a redirection", "psql -qAt mydb > out.sql\n"],
      ["F10 a psql call carrying an INPUT redirection", "psql -X -qAt mydb < in.sql\n"],
      ["F11 a psql call, ATTACHED output redirection", "psql -qAt mydb>out.sql\n"],
      ["G1 an unquoted here-DOC body", "cat <<EOF\npsql -qAt mydb\nEOF\n"],
      ["G2 a quoted here-DOC body", "cat <<'EOF'\npsql -qAt mydb\nEOF\n"],
    ];
    expect(
      siteRows.map(([label, source]) => {
        const sites = sitesIn(source, "x.sh");
        return [label, sites.length, sites.map((s) => s.suppressesStartupFiles)];
      }),
    ).toEqual([
      ["A9 a here-DOC body", 1, [false]],
      ["B2 a redirection target NAMED psql, quoted", 0, []],
      ["B4 a psql call carrying a redirection", 1, [false]],
      ["F10 a psql call carrying an INPUT redirection", 1, [true]],
      ["F11 a psql call, ATTACHED output redirection", 1, [false]],
      ["G1 an unquoted here-DOC body", 1, [false]],
      ["G2 a quoted here-DOC body", 1, [false]],
    ]);
  });
});

describe("diff review round 1 - the four findings, each pinned", () => {
  // F1. `read NAME` binds the FIRST LINE of its input with default-IFS edges
  // stripped, not the whole here-string. Reading the entire target both MISSED
  // bindings bash makes and REPORTED one it does not, so the two directions are
  // pinned together - a fixture set carrying only the misses would go green on
  // an implementation that reads the whole target and merely got luckier.
  test("F1: a here-string target is read as `read` reads it - first line, IFS-trimmed", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      ["a trailing line is not part of the binding", "read -r PG <<< $'psql\\nignored'\n", 1],
      ["IFS edges are stripped", "read -r PG <<< $'\\tpsql '\n", 1],
      ["the psql is on a line `read` never binds", "read -r PG <<< $'other\\npsql -X'\n", 0],
    ];
    premise(
      "the single-line sibling of all three reaches the rule and reports",
      scanShellIndirection("read -r PG <<< $'psql'\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });

  // F2. Membership of a LOGICAL LINE is not membership of a COMMAND. Both
  // orders are pinned because the defect is symmetric, and the one-variable
  // twin keeps the same two targets on the same line with the separator
  // removed, so the zero is attributable to the separator and not to the
  // machinery having stopped looking.
  test("F2: a target belonging to ANOTHER command on the same line does not bind the read", () => {
    const after = 'read -r PG <<< notpsql; cat <<< p"sql"\n';
    const before = 'cat <<< p"sql"; read -r PG <<< notpsql\n';
    const oneCommand = "read -r PG <<< p'sql'\n";
    premise(
      "the one-variable twin, a single command on the line, reports",
      scanShellIndirection(oneCommand, "x.sh").length,
      0,
    );
    expect([
      ["separator after the read", scanShellIndirection(after, "x.sh").length],
      ["separator before the read", scanShellIndirection(before, "x.sh").length],
    ]).toEqual([
      ["separator after the read", 0],
      ["separator before the read", 0],
    ]);
  });

  // F3. The accept-set is about the OPERATOR, and a positional or special
  // parameter takes the same value-supplying operators an identifier does. An
  // identifier-only name reading default-denied spellings the accept-set had
  // already promised, which is a defect INSIDE promised scope rather than a
  // request to widen it.
  test.each([
    ["a positional parameter, default", "PG=${1:-'psql'}\n", "PG=${U:-'psql'}\n"],
    ["a positional parameter, alternate", "PG=${1:+'psql'}\n", "PG=${U:+'psql'}\n"],
  ])("F3: %s binds psql", (label, positional, identifier) => {
    premise(
      `${label}: the identifier-named twin, differing only in the PARAMETER, reports`,
      scanShellIndirection(identifier, "x.sh").length,
      0,
    );
    expect(scanShellIndirection(positional, "x.sh"), label).toHaveLength(1);
  });

  // F3, the other direction: widening the NAME must not widen the ACCEPT-SET.
  // `${#psql}` and `${!psql}` now parse a name where they did not before, and
  // must still find no accepted operator after it.
  test("F3: a widened parameter name does not admit a complement operator", () => {
    expect([
      ["length", scanShellIndirection("PG=${#psql}\n", "x.sh").length],
      ["indirection", scanShellIndirection("PG=${!psql}\n", "x.sh").length],
      ["quoted length operand", scanShellIndirection("PG=${#'psql'}\n", "x.sh").length],
      ["quoted indirection operand", scanShellIndirection("PG=${!'psql'}\n", "x.sh").length],
    ]).toEqual([
      // The first two report through the VERBATIM text for a pre-existing
      // reason and are ratified out of scope in both directions. The quoted
      // spellings are the ones a candidate would have to read, and they stay 0.
      ["length", 1],
      ["indirection", 1],
      ["quoted length operand", 0],
      ["quoted indirection operand", 0],
    ]);
  });

  // F4. Quote removal turns `'${V:-psql}'` into text that LOOKS like an
  // expansion and is not one - bash binds that literal string. Recursing on the
  // DEQUOTED operand reinterpreted data as syntax, which is the withdrawn
  // substitution model's defect one level down. Nesting is now decided on the
  // RAW operand.
  test("F4: a QUOTED literal that looks like an expansion is not resolved as one", () => {
    const quotedLiteral = "PG=${U:-'${V:-p\"sql\"}'}\n";
    const liveNesting = "PG=${U:-${V:-'psql'}}\n";
    premise(
      "the one-variable twin, the same shape with the inner expansion UNQUOTED and therefore live, reports",
      scanShellIndirection(liveNesting, "x.sh").length,
      0,
    );
    // Probed: 1 before the repair, 0 after, while the live-nesting twin holds at
    // 1 - which is what separates the mechanism repair from a blanket decline.
    expect(scanShellIndirection(quotedLiteral, "x.sh")).toHaveLength(0);
  });

  // F4's RESIDUAL, pinned as the documented limit it is rather than left
  // unstated. With a BARE inner operand the dequoted literal still carries a
  // word-boundaried `psql` and no rejected character, so it reports through
  // `valueBinds`'s pre-existing fallback - the same conservative over-report
  // `PG=${U#psql}` has always made. bash binds the literal `${V:-psql}`, so the
  // report is LOUD rather than wrong-silent, which the consequence bound
  // permits and section 1.1 row 6 ratifies out of scope in both directions.
  test("F4 residual: a bare inner operand still over-reports through the verbatim fallback", () => {
    expect([
      ["single-quoted literal", scanShellIndirection("PG=${U:-'${V:-psql}'}\n", "x.sh").length],
      ["ANSI-C literal", scanShellIndirection("PG=${U:-$'${V:-p\\163ql}'}\n", "x.sh").length],
    ]).toEqual([
      ["single-quoted literal", 1],
      ["ANSI-C literal", 1],
    ]);
  });
});

describe("diff review round 2 - the two behavioural findings, each pinned", () => {
  // F2. The parameter-name grammar CLAIMS special-parameter support and then
  // omitted bash's `-`, so all six accept-set operators default-denied on it -
  // twelve missed forms across the two consumers. This is a defect INSIDE the
  // six-member accept-set, not a request to widen it, so the accept-set's own
  // decision rule makes it a repair.
  //
  // All six are pinned, not only the two bash truly binds. `${-:+word}` and
  // `${-+word}` yield `psql` because `$-` is always set and non-null (probed:
  // `[X]`), while the four unset-branch spellings yield `$-` itself (probed:
  // `[hBc]`). Reporting those four is the ratified MAY-BIND posture of §7.4 -
  // the identical treatment `${U:-psql}` gets when `U` is set - and a
  // conservative over-report is a documented limit, not a defect. Pinning only
  // the two true binds would go green on an implementation that read the
  // operator rather than the accept-set.
  test.each([
    ["alternate, colon form", "PG=${-:+'psql'}\n"],
    ["alternate, bare form", "PG=${-+'psql'}\n"],
    ["default, colon form", "PG=${-:-'psql'}\n"],
    ["default, bare form", "PG=${--'psql'}\n"],
    ["assign, bare form", "PG=${-='psql'}\n"],
    ["assign, colon form", "PG=${-:='psql'}\n"],
  ])("F2: the `-` special parameter takes the accept-set - %s", (label, source) => {
    premise(
      `${label}: the special-parameter twin already in the class reports, so the class is reached`,
      scanShellIndirection("PG=${@:+'psql'}\n", "x.sh").length,
      0,
    );
    expect(scanShellIndirection(source, "x.sh"), label).toHaveLength(1);
  });

  // The SECOND consumer, because the finding counted both sites: the operand
  // rule is applied at the here-string target exactly as at an assignment
  // value, so a repair reaching only `assignmentBindingLines` is not a repair.
  test("F2: the `-` special parameter reaches the here-string target too", () => {
    premise(
      "the identifier-named twin at the SAME site reports, so the site is reached",
      scanShellIndirection("read -r PG <<< ${U:+'psql'}\n", "x.sh").length,
      0,
    );
    expect(scanShellIndirection("read -r PG <<< ${-:+'psql'}\n", "x.sh")).toHaveLength(1);
  });

  // F2, the other direction: widening the NAME must not widen the ACCEPT-SET.
  // `-` now parses as a parameter where it did not before, so the complement
  // spellings that begin with it must still find no accepted operator.
  test("F2: `-` as a name does not admit a complement operator", () => {
    expect([
      ["substring", scanShellIndirection("PG=${-:1}\n", "x.sh").length],
      ["quoted pattern operand", scanShellIndirection("PG=${-#'psql'}\n", "x.sh").length],
      ["quoted suffix operand", scanShellIndirection("PG=${-%'psql'}\n", "x.sh").length],
      ["quoted replacement operand", scanShellIndirection("PG=${-/x/'psql'}\n", "x.sh").length],
    ]).toEqual([
      ["substring", 0],
      ["quoted pattern operand", 0],
      ["quoted suffix operand", 0],
      ["quoted replacement operand", 0],
    ]);
  });

  // F3. `hereStringBindingLines` accepted ANY psql-bearing `<<<` target on the
  // logical line rather than the EFFECTIVE final stdin redirection, so a
  // here-string bash had already overridden was still read - a MIS-READ of
  // statically-decided redirection precedence, which §7.4 separates from the
  // ratified may-bind posture: may-bind covers what a static reader CANNOT
  // know (is `U` set at expansion time), never what the shell decides on the
  // page. That is the same class as round 1's F2, whose repair took the
  // command boundary but left the redirection sequence unread.
  //
  // Both directions are pinned in one table. The override rows must go to 0 and
  // the last-wins row must STAY 1: a repair that merely declined every line
  // carrying two redirections would satisfy the zeros alone, and it is exactly
  // the strictly-weaker implementation this fixture set has to kill.
  // F3, THE NARROWING'S OWN FAILURE MODE. A narrowing that removes a false
  // positive can MANUFACTURE a silent miss in the same edit, and the first
  // shape of this repair did exactly that: pinning the text regex to the last
  // `<<<` ON THE LINE let another command's target win, so
  // `read -r PG <<< psql; cat <<< notpsql` went from a CORRECT report to zero
  // while bash binds `psql`. The whole suite stayed green through it - these
  // rows are the ones that would not have.
  //
  // Every row states what bash binds, so a zero is readable as "there is no
  // binding" rather than as "the scanner declined". The psql-FIRST orderings
  // are the load-bearing ones: they are real bindings, and any reach rule that
  // can see past a separator silences them.
  test("F3: declining a wrong attribution never silences a real binding", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      // Real bindings across a command boundary - bash binds psql in both.
      ["psql-bearing read, another command AFTER", "read -r PG <<< psql; cat <<< notpsql\n", 1],
      ["psql-bearing read, another command BEFORE", "cat <<< notpsql; read -r PG <<< psql\n", 1],
      // Not a binding - the psql target belongs to the OTHER command.
      ["the psql target belongs to another command", "read -r PG <<< notpsql; cat <<< psql\n", 0],
      // Not a binding - overridden inside the read's own command.
      ["overridden within one command", "read -r PG <<< psql < /dev/null\n", 0],
      // A real binding whose separator is DATA. The text route's reach is
      // textual and cuts here; the WORD route reads the lexer's operator words,
      // where a quoted `;` is data, and covers it. The union is the point.
      ["a separator inside a quoted target is data", 'read -r PG <<< "a;b" <<< psql\n', 1],
      // A DECLARED over-report, not silence: on a multi-command line the text
      // route does not read redirection precedence, so this reports though bash
      // binds empty. Over-report is the permitted arm.
      [
        "precedence is unread on a multi-command line",
        "read -r PG <<< psql < /dev/null; cat x\n",
        1,
      ],
    ];
    premise(
      "the single-command sibling of the psql-first rows reports, so the rule is reached",
      scanShellIndirection("read -r PG <<< psql\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });

  // ROUND 3 F1. `read` binds the FIRST LINE of its input with default-IFS edges
  // stripped, and round 1 established that for the target's own text. The
  // EXPANSION candidate skipped it: the raw target `${U:-$'psql\nignored'}` is
  // a single line, so the "nothing was truncated" guard passed on the RAW span
  // while the DECODED operand it hands to `valueBinds` still carried its
  // newline. Both directions were wrong, which is why both are pinned.
  test("R3 F1: an expansion candidate is read as `read` reads it, not whole", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      ["a trailing line is not part of the binding", "read -r PG <<< ${U:-$'psql\\nignored'}\n", 1],
      ["the psql is on a line `read` never binds", "read -r PG <<< ${U:-$'other\\npsql -X'}\n", 0],
      // OVER-report, declared. `read` binds the empty first line, but the raw
      // span still carries a word-boundaried psql and the VERBATIM reading -
      // which the candidate supplements rather than replaces (arm 2's ratified
      // contract) - reports it. Wrongly-loud on an input bash binds empty is the
      // permitted arm of the bound; the two rows above are the ones that had to
      // move. Pinned at 1 so a later change to the verbatim posture is visible.
      ["a leading newline is a declared over-report", "read -r PG <<< ${U:-$'\\npsql'}\n", 1],
      ["IFS edges are stripped from the operand too", "read -r PG <<< ${U:-$'\\tpsql '}\n", 1],
      // The same three through an assignment, where no `read` truncates and the
      // whole operand binds -- so these must NOT move with the rows above.
      // PRE-EXISTING zero, verified against the committed parent rather than
      // assumed: a multiline expansion value in an ASSIGNMENT reported 0 before
      // this change too, so it pins that the here-string repair did not reach
      // the assignment route.
      ["an assignment value is unchanged by this repair", "PG=${U:-$'psql\\nignored'}\n", 0],
    ];
    premise(
      "the single-line expansion sibling reaches the candidate route and reports",
      scanShellIndirection("read -r PG <<< ${U:-'psql'}\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });

  // ROUND 3 F2. Position after the effective operator is NECESSARY and not
  // SUFFICIENT. A here-string on an explicit NON-ZERO fd sits after the
  // effective stdin operator and was admitted by an ordering test alone, so
  // `read -r PG <<< notpsql 2<<< psql` reported while bash binds `notpsql`.
  // The target now carries the OFFSET of the operator that produced it, so the
  // match is identity rather than inference.
  test("R3 F2: a target belongs to the redirection that produced it", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      ["an explicit fd 2 here-string is not stdin", "read -r PG <<< notpsql 2<<< p'sql'\n", 0],
      ["a dynamic fd here-string is not stdin", "read -r PG <<< notpsql {v}<<< p'sql'\n", 0],
      ["an explicit fd 9 here-string is not stdin", "read -r PG <<< notpsql 9<<< p'sql'\n", 0],
      // The control the class is one edit from: remove the fd and it binds.
      ["the same ordering WITHOUT an fd still binds", "read -r PG <<< notpsql <<< p'sql'\n", 1],
      // And an explicit `0<<<` IS stdin, spelled the long way.
      ["an explicit `0<<<` is stdin and binds", "read -r PG <<< notpsql 0<<< p'sql'\n", 1],
      // The psql-bearing here-string on fd 0 with a NON-stdin one after it is
      // still the effective one, so it must keep binding.
      [
        "a later non-stdin here-string does not override",
        "read -r PG <<< p'sql' 2<<< notpsql\n",
        1,
      ],
    ];
    premise(
      "the fd-less twin of the first row reports, so the difference is the fd",
      scanShellIndirection("read -r PG <<< notpsql <<< p'sql'\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });

  // F3, DERIVED COVER. `INPUT_REDIRECTIONS` is a six-member list, and a list
  // restated beside the grammar it claims to cover is the EXACT shape of this
  // round's F2 - a class asserting full coverage while enumerating a subset.
  // Shipping that shape inside F3's repair would have been the repair becoming
  // the next round's defect, so the partition is asserted TOTAL over the one
  // list the matching regex is itself built from: an operator added to
  // `REDIRECTION_OPERATORS` and classified into neither half fails HERE rather
  // than being silently read as output. This cannot be satisfied by a scanner
  // that hardcodes today's twelve, because the expected side is computed from
  // the shipped array rather than typed in.
  test("F3: every redirection operator the lexer matches is explicitly classified", () => {
    const { all, input, output } = REDIRECTION_PARTITION;
    const unclassified = all.filter((op) => !input.has(op) && !output.has(op));
    const doubleClassified = all.filter((op) => input.has(op) && output.has(op));
    const strays = [...input, ...output].filter((op) => !(all as readonly string[]).includes(op));
    expect({
      unclassified,
      doubleClassified,
      strays,
      total: input.size + output.size,
      operators: all.length,
    }).toEqual({
      unclassified: [],
      doubleClassified: [],
      strays: [],
      total: all.length,
      operators: 12,
    });
  });

  // RETIRED IN PART, 2026-08-21. The F3 repair records an attached
  // redirection's OPERATOR, which is what lets an attached `</dev/null`
  // OVERRIDE a here-string. Reading the attached TARGET was a separate,
  // withdrawn question and was closed by
  // BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION: the first row REPORTS
  // now. The SECOND row is the control the pair exists for and its zero is
  // unmoved - a later `< /dev/null` on fd 0 overrides the here-string, so bash
  // makes no binding, and a repair loud enough to report BOTH would be loud in
  // a direction the shell does not license.
  test("F3: an attached operator overrides, and an attached TARGET is now read", () => {
    premise(
      "the DETACHED spelling of the same binding still reports, so the zero below is the OVERRIDE and not a broken read",
      scanShellIndirection("read -r PG <<< p'sql'\n", "x.sh").length,
      0,
    );
    expect([
      [
        "attached target, no override",
        scanShellIndirection("read -r PG <<<p'sql'\n", "x.sh").length,
      ],
      [
        "attached target, overridden",
        scanShellIndirection("read -r PG <<<p'sql' < /dev/null\n", "x.sh").length,
      ],
    ]).toEqual([
      ["attached target, no override", 1],
      ["attached target, overridden", 0],
    ]);
  });

  // F3, CLASS SWEEP. The here-string family is a UNION of a line-text reading
  // (`READ_HERE_STRING`) and a lexed-word reading (`hereStringBindingLines`),
  // and BOTH of round 1's F2 and round 2's F3 were repaired in the word route
  // only - so the identical mis-attributions survived in the text route, which
  // is a route and not a file and is therefore the "same defect, different
  // site" the class-sweep rule refuses as a deferral. The word route's own
  // fixtures could not see it: every one of them spells psql with an embedded
  // quote (`p'sql'`), which the text route's value pattern rejects for an
  // unrelated reason, so the two routes were never both live on one case.
  // These rows spell it PLAINLY, which is what puts the text route in play.
  test("F3 sweep: the text route obeys the same command and redirection gate", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      [
        "another command's target does not bind the read",
        "read -r PG <<< notpsql; cat <<< psql\n",
        0,
      ],
      ["a later detached `<` overrides it", "read -r PG <<< psql < /dev/null\n", 0],
      ["a later here-string overrides it", "read -r PG <<< psql <<< notpsql\n", 0],
      ["a later ATTACHED `<` overrides it", "read -r PG <<< psql </dev/null\n", 0],
      // The prose reading is the text route's OWN contribution to the union -
      // `valueBinds` declines it for carrying no flag-shaped token - so it is
      // the row that proves the gate reached the text route rather than the
      // word route having quietly covered these.
      [
        "a prose target is overridden too",
        "read -r MSG <<< 'psql failed to connect' < /dev/null\n",
        0,
      ],
      // The zeros above must not be bought by declining every line that carries
      // two redirections: an EARLIER override that the here-string then replaces
      // still binds, and so does a non-stdin descriptor.
      [
        "an earlier `<` is itself overridden by the here-string",
        "read -r PG < /dev/null <<< psql\n",
        1,
      ],
      ["an explicit non-zero fd does not touch stdin", "read -r PG <<< psql 2< /dev/null\n", 1],
      ["the prose baseline still reports", "read -r MSG <<< 'psql failed to connect'\n", 1],
      ["the plain baseline still reports", "read -r PG <<< psql\n", 1],
      // The text route is the only reading that sees INSIDE a substitution body,
      // so a gate that declined on the body's own punctuation would silently
      // retire that contribution.
      // The outer lex replaces a substitution body with an opaque word, so the
      // ledger records no redirection within it and the gate does not apply
      // there. TWO is the pre-existing union double-count for a plainly-spelled
      // psql in a body, probed IDENTICAL at the committed parent, so this row
      // pins that the sweep left the text route's unique contribution intact
      // rather than pinning a number the repair chose.
      ["a body the word route cannot see still reports", "X=$(read -r PG <<< psql)\n", 2],
      // The same body WITH an override is the documented limit that boundary
      // buys: the word route reads the body's own ledger and declines, the text
      // route cannot see it, and the residue is a conservative over-report.
      [
        "an override INSIDE a body is a documented limit",
        "X=$(read -r PG <<< psql < /dev/null)\n",
        2,
      ],
    ];
    premise(
      "the plain single-redirection sibling reaches the text route and reports",
      scanShellIndirection("read -r PG <<< psql\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });

  test("F3: the EFFECTIVE final fd-0 redirection decides, not any target on the line", () => {
    const rows: Array<[label: string, source: string, hits: number]> = [
      ["a later here-string overrides the psql one", "read -r PG <<< p'sql' <<< notpsql\n", 0],
      ["a later detached `<` overrides it", "read -r PG <<< p'sql' < /dev/null\n", 0],
      ["a later ATTACHED `<` overrides it", "read -r PG <<< p'sql' </dev/null\n", 0],
      ["a later heredoc overrides it", "read -r PG <<< p'sql' << EOF\n", 0],
      ["a later fd dup overrides it", "read -r PG <<< p'sql' <&3\n", 0],
      ["a later read-write open overrides it", "read -r PG <<< p'sql' <> /tmp/f\n", 0],
      // The psql here-string is itself the effective one, so it still binds.
      ["the LAST here-string is the psql one", "read -r PG <<< notpsql <<< p'sql'\n", 1],
      // `2<` opens fd 2, never stdin (probed: bash binds `psql`), so an
      // fd-blind reading would take this to 0 and lose a real binding.
      ["an explicit non-zero fd does not touch stdin", "read -r PG <<< p'sql' 2< /dev/null\n", 1],
      // `{fd}<` assigns a FRESH descriptor, so it is not stdin either.
      ["a dynamic fd does not touch stdin", "read -r PG <<< p'sql' {v}< /dev/null\n", 1],
      // An explicit `0<` IS stdin, spelled the long way.
      ["an explicit `0<` does override", "read -r PG <<< p'sql' 0< /dev/null\n", 0],
      // An OUTPUT redirection after the here-string leaves stdin alone.
      ["a later output redirection is not stdin", "read -r PG <<< p'sql' > notpsql\n", 1],
    ];
    premise(
      "the single-redirection sibling of every row reaches the rule and reports",
      scanShellIndirection("read -r PG <<< p'sql'\n", "x.sh").length,
      0,
    );
    expect(rows.map(([l, s]) => [l, scanShellIndirection(s, "x.sh").length])).toEqual(
      rows.map(([l, , h]) => [l, h]),
    );
  });
});

describe("arm 2 precision - the zeros that must STAY zero", () => {
  // Every case here is a non-regression pin, and a pin against correct code
  // cannot red on its own. Its red is authored against NAMED MUTANTS in
  // `valueBinds` -- the separator rejection, the trailing-backslash rejection
  // and the flag requirement -- applied and reverted inside the task that
  // introduced this block, never committed. That makes the red SCANNER
  // behaviour rather than a test-local edit.
  //
  // Each premise is computed from THAT ROW'S OWN fixture text. An adjacent
  // case is explicitly NOT a premise: a sibling can hold while this row's own
  // input never reaches the machinery at all, and a suite of zeros guarded by
  // a neighbour's success is green about the neighbour.

  /** A reading of the FIXTURE'S OWN BYTES, never of the scanner. It answers one
   * structural question about the row: is this assignment's value, in its
   * entirety, a single `${...}` span? Brace-matched rather than
   * `startsWith`/`endsWith`, because `${U#x}${V:-"psql"}` satisfies both ends
   * while being two spans. */
  const wholeValueSpan = (source: string): string | null => {
    const value = source
      .trim()
      .split("\n")
      .at(-1)!
      .replace(/^[A-Za-z_]\w*=/, "");
    if (!value.startsWith("${") || !value.endsWith("}")) return null;
    let depth = 0;
    for (let i = 1; i < value.length; i++) {
      if (value[i] === "{") depth++;
      else if (value[i] === "}") {
        depth--;
        if (depth === 0) return i === value.length - 1 ? value.slice(2, i) : null;
      }
    }
    return null;
  };
  /** The six-member accept-set, read off the fixture's own interior. */
  const ACCEPTED = /^[A-Za-z_]\w*(?:\[[^\]]*\])?(?::-|:=|:\+|-|=|\+)/;

  // CLASS A -- the candidate EXISTS and the PREDICATE declines it. The premise
  // is the exact condition under which a candidate is built, computed on this
  // row's own text, so the zero is attributable to the predicate rejecting the
  // candidate rather than to no candidate having been built.
  test.each([
    ["a separator in the operand", "PG=${U:-'psql;x'}\n"],
    ["a trailing backslash in the operand", "PG=${U:-'psql\\'}\n"],
    ["a multiword operand carrying no flag", "PG=${M:-'psql failed to connect'}\n"],
  ])("%s reaches the predicate and is declined", (label, source) => {
    const interior = wholeValueSpan(source);
    premiseHolds(
      `${label}: this fixture's own value IS one accept-set span whose operand carries psql, which is exactly when a candidate is built`,
      interior !== null && ACCEPTED.test(interior) && /psql/.test(interior),
    );
    expect(scanShellIndirection(source, "x.sh"), label).toHaveLength(0);
  });

  // CLASS B -- NO candidate exists, by construction. The premise is the
  // complement of class A's: the value is not a single accept-set span, or the
  // span sits inside a double-quoted value where the recording branch is
  // unreachable. A REPORTING sibling would prove the opposite boundary and is
  // deliberately not used.
  //
  // bash binds `psql` in the composition spellings, so these are DOCUMENTED
  // LIMITS rather than correct silence -- except the double-quoted ones, where
  // bash binds `p'sql'` and the zero is right. Both directions of the same
  // structural boundary, which is why they sit together.
  test.each([
    ["P1 literal before, :-", 'PG=p${U:-"sql"}\n'],
    ["P2 literal before, -", 'PG=p${U-"sql"}\n'],
    ["P3 literal before, :=", 'PG=p${U:="sql"}\n'],
    ["P4 literal before, =", 'PG=p${U="sql"}\n'],
    ["P5 literal before, :+", 'PG=p${U:+"sql"}\n'],
    ["P6 literal before, +", 'PG=p${U+"sql"}\n'],
    ["P7 literal AFTER the span", 'PG=${U:-"p"}sql\n'],
    ["P10 a BARE operand composed", "PG=p${U:-sql}\n"],
    ["S4 accepted ADJACENT to a complement member", 'U=xy\nPG=${U#x}${V:-"psql"}\n'],
    ["S5 accepted INSIDE a complement member", "U=xpsql\nPG=${U#${V:-'psql'}}\n"],
    ["Q3 composed inside DOUBLE QUOTES, quoted operand", "PG=\"p${U:-'sql'}\"\n"],
    ["Q5 a composed value that is not psql", 'PG=p${U:-"gcli"}\n'],
    ["Q6 a composed value that is prose", 'MSG=p${M:-"sql failed to connect"}\n'],
    ["Q7 a composed value carrying a separator", 'PG=p${U:-"sql;x"}\n'],
  ])("%s builds no candidate at all", (label, source) => {
    const interior = wholeValueSpan(source);
    premiseHolds(
      `${label}: this fixture's own value is NOT a single accept-set span, which is exactly when no candidate is built`,
      interior === null || !ACCEPTED.test(interior),
    );
    expect(scanShellIndirection(source, "x.sh"), label).toHaveLength(0);
  });

  // CLASS C -- a candidate IS built and carries no psql-shaped word. These two
  // are the composition cases the class B premise cannot claim, because their
  // value really is a single accept-set span; what composes is the OPERAND.
  // Stating that separately is the point: a premise that quietly covered them
  // with class B's would be false on this row's own inputs.
  test.each([
    ["P8 a nested expansion supplying a SUFFIX", "PG=${U:-${V:-p}sql}\n"],
    ["P9 a nested expansion supplying the MIDDLE", "PG=${U:-p${V:-s}ql}\n"],
  ])("%s builds a candidate that carries no psql", (label, source) => {
    const interior = wholeValueSpan(source);
    premiseHolds(
      `${label}: this fixture's own value IS one accept-set span, so a candidate is built, and its interior carries no psql`,
      interior !== null && ACCEPTED.test(interior) && !/psql/.test(interior),
    );
    expect(scanShellIndirection(source, "x.sh"), label).toHaveLength(0);
  });
});

describe("documented limits - quote-concatenated spellings outside the assignment family", () => {
  // Spec §6: these families still read their KEYWORD or operand through a
  // per-line pattern, so a quote-concatenated spelling of it is missed. The
  // failure direction is a missed report, never a false certification. Each
  // zero is DECLARED here so it cannot drift silently. Premises use
  // tests/_shared/premise.ts and run in ONE test over a literal array - never
  // inside a .each callback, per the executable-premise rule (plan round-1
  // finding 5).
  test("each quote-concatenated keyword/operand spelling is a declared miss", () => {
    const rows: Array<[label: string, missed: string, plain: string]> = [
      // The mixed-quoted here-string row RETIRED 2026-08-20. Arm 1 of
      // BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE retains the DETACHED redirection
      // target in the lexer and reads it through `valueBinds`, so the spelling
      // is a HIT now and is re-pinned as one - together with its ANSI-C,
      // quoted-directory, continuation and nested-body siblings - by the "arm 1
      // - a DETACHED here-string target is read from the lexer's retained word"
      // block above. The ATTACHED spelling (`<<<p'sql'`) LEFT this bullet on
      // 2026-08-21 for the same reason one round later: the lexer delimits an
      // attached target by construct and retains it too, so both spellings
      // reach `valueBinds` through one reading. Ledger:
      // BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION.
      // The alias row's BODY deliberately binds something OTHER than psql. An
      // alias definition is an assignment-SHAPED word, so `alias p'sql'='psql
      // -F'` dequotes to the candidate `psql=psql -F` and the assignment route
      // reports it incidentally - a real recall closure, since that line does
      // rewrite psql's argv. What the `aliased` rule still cannot see is the
      // quote-concatenated NAME itself, and that is only observable when the
      // body binds another program: `alias p'sql'='pgcli -F'` redirects psql
      // and stays a declared miss.
      ["a mixed-quoted alias name", "alias p'sql'='pgcli -F'\n", "alias psql='pgcli -F'\n"],
      [
        "a mixed-quoted interpreter positional",
        "bash -c '$0 -qAt mydb' p'sql'\n",
        "bash -c '$0 -qAt mydb' psql\n",
      ],
      // A wrapper-prefixed quoted-directory value is declined by BOTH
      // readings (spec 6 item 6; round-6 disposition, bl-orch option b): the
      // split reading requires psql at argv[0], the eval reading reads the
      // pathname quote as syntax. The premise shows wrapper-invoked psql with
      // an unquoted path reporting via the eval reading.
      [
        "a wrapper-prefixed quoted-directory value",
        'CMD="sudo /tmp/O\'Reilly/psql -X mydb"\n',
        "CMD='sudo psql -X mydb'\n",
      ],
      // IFS whitespace in a quoted DIRECTORY component sends the value to the
      // multiword branch, where a flagless path is declined - spec 6 item 5
      // (round-4 fallout, pinned so the zero is declared).
      ["a whitespace directory component", "PG='/tmp/x y/psql'\n", "PG='/tmp/xy/psql'\n"],
      // The quoted-expansion-operand row RETIRED 2026-08-20. Arm 2 of
      // BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE decides the operand of a
      // WHOLE-VALUE accepted expansion and tests it with the same `valueBinds`,
      // so the spelling is a HIT now and is re-pinned as one - with its
      // operator, nesting, multiword and here-string-target siblings - by the
      // "arm 2 - a WHOLE-VALUE accepted expansion has its operand decided"
      // block above. The DEFAULT-DENIED complement and the composition family
      // stay at 0 and are pinned there in the same block.
    ];
    for (const [label, missed, plain] of rows) {
      premiseHolds(
        `${label}: the plain spelling reaches the rule`,
        scanShellIndirection(plain, "x.sh").length > 0,
      );
      expect(scanShellIndirection(missed, "x.sh"), label).toHaveLength(0);
    }
  });

  // The other half of the alias row above, pinned so the incidental closure is
  // a declared behavior rather than an accident: an alias definition is an
  // assignment-SHAPED word, so a quote-concatenated alias name whose BODY
  // binds psql reaches the assignment route and reports. Both spellings of the
  // name, since the point is that the name's quoting is irrelevant here.
  test.each([
    ["a mixed-quoted alias name", "alias p'sql'='psql -F'\n"],
    ["a plain alias name", "alias psql='psql -F'\n"],
  ])("%s whose body binds psql is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION - an executing psql hidden
// inside an ATTACHED redirection target.
//
// Design: docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md
//
// The lexer consumed an attached target with a character-class run and threw
// the match away, so a target carrying a command SUBSTITUTION hid an executing
// command from BOTH scanners. The repair delimits the target BY CONSTRUCT,
// retains it for the here-string reader, collects its nested bodies, and
// REPORTS anything the accept-set cannot delimit.
//
// Every case below is drawn from the spec's acceptance set or from an axis a
// review round found the set blind along - not constructed for the occasion.
// ---------------------------------------------------------------------------

/** Both scanners at once. The acceptance set's expectation is a PREDICATE over
 *  this pair rather than a report/silent binary: case I already REPORTS today
 *  with the attribution wrong, and a binary asking only "did anything report"
 *  is structurally blind to it. */
function scannedBoth(source: string) {
  return {
    sites: sitesIn(source, "x.sh"),
    hits: scanShellIndirection(source, "x.sh"),
  };
}
const attachedReports = (source: string): boolean => {
  const { sites, hits } = scannedBoth(source);
  return sites.length > 0 || hits.length > 0;
};
/** UNIVERSAL, and the quantifier is the assertion. An existential reading
 *  accepts a repair that adds a correctly attributed record and leaves the
 *  wrong one standing; the non-empty guard stops an empty read passing
 *  vacuously. */
const attachedInBacktick = (source: string): boolean => {
  const { sites } = scannedBoth(source);
  return sites.length > 0 && sites.every((site) => site.nestedInBacktick);
};

/** The four positive controls: the same bodies in positions the lexer already
 *  reads. They are what makes a subject zero attributable rather than the
 *  artefact of a broken read. */
const ATTACHED_CONTROLS: Array<[label: string, source: string]> = [
  ["detached backtick target", "cat > `psql -c 'select 1'`\n"],
  ["detached dollar-paren target", "cat > $(psql -c 'select 1')\n"],
  ["plain call", "psql -c 'select 1'\n"],
  ["detached here-string binding", "read -r PG <<< p'sql'\n\"$PG\" -c 'select 1'\n"],
];

/**
 * The acceptance set. `holds` is the POST-CHANGE expectation, stated per case.
 *
 * A-F are the ledger row's own family. G, H and I arrived at spec round 1 as
 * the three cases said to separate the specified implementation from the
 * accidental one; the killer audit refuted two of the three, since `"[^"]*"`
 * matches G's target whole and H's escaped backtick never reaches that path.
 * Case I's ATTRIBUTION predicate is what actually separates them - a
 * naive re-lex of the old regex's match passes A-F by coincidence, because the
 * fragment it stops on re-lexes to an unterminated backtick whose body happens
 * to contain the command word. J and K arrived at round 4: every case A-I keeps
 * its target on ONE physical line and writes a BARE `>` after the command word,
 * so a same-line-only implementation and a no-fd-prefix implementation each
 * passed the whole gate while staying silent on a form bash executes.
 */
const ATTACHED_SUBJECTS: Array<[label: string, source: string, holds: (s: string) => boolean]> = [
  ["A bare backtick ATTACHED target", "cat >`psql -c 'select 1'`\n", attachedReports],
  [
    "B dollar-paren inside ATTACHED double quotes",
    "cat >\"$(psql -c 'select 1')\"\n",
    attachedReports,
  ],
  ["C backtick inside ATTACHED double quotes", "cat >\"`psql -c 'select 1'`\"\n", attachedReports],
  ["D locale-quoted ATTACHED target", "cat >$\"$(psql -c 'select 1')\"\n", attachedReports],
  [
    "E substitution inside an ATTACHED brace target",
    "cat >${OUT:-$(psql -c 'select 1')}\n",
    attachedReports,
  ],
  [
    "F plain ATTACHED here-string binding",
    "read -r PG <<<p'sql'\n\"$PG\" -c 'select 1'\n",
    attachedReports,
  ],
  [
    "G brace inside an ATTACHED double-quoted target",
    "cat >\"${OUT:-$(psql -c 'select 1')}\"\n",
    attachedReports,
  ],
  [
    "H escaped backtick in an ATTACHED double-quoted target",
    'cat >"`echo \\\\\\` ; psql -c "select 1"`"\n',
    attachedReports,
  ],
  [
    "J backslash continuation inside an ATTACHED double-quoted target",
    "cat >\"/dev/null\\\n$(psql -c 'select 1')\"\n",
    attachedReports,
  ],
  [
    "K fd-prefixed operator before an ATTACHED substitution",
    "cat 2>\"$(psql -c 'select 1')\"\n",
    attachedReports,
  ],
  [
    "I mid-construct stop mis-attributes a backtick body",
    'cat >`printf "\\140"; psql -c "select 1"`\n',
    attachedInBacktick,
  ],
];

describe("an executing psql inside an ATTACHED redirection target", () => {
  test("every positive control still reports, so a subject zero is attributable", () => {
    expect(ATTACHED_CONTROLS.map(([label, source]) => [label, attachedReports(source)])).toEqual(
      ATTACHED_CONTROLS.map(([label]) => [label, true]),
    );
  });

  test("each acceptance-set subject meets its declared expectation", () => {
    for (const [label, source] of ATTACHED_SUBJECTS) {
      premiseHolds(
        `${label}: the target really is ATTACHED - no whitespace between operator and target`,
        /(?:^|[^<>&|])(?:&>>|&>|<<<|<<-|<<|>>|>&|<&|<>|>\||<|>)[^\s]/.test(source),
      );
    }
    expect(ATTACHED_SUBJECTS.map(([label, source, holds]) => [label, holds(source)])).toEqual(
      ATTACHED_SUBJECTS.map(([label]) => [label, true]),
    );
  });

  // The string-presence discipline. Each family below covers a SUBSET of the
  // firing cases, not all eleven: (a) omits D, F, H, I and J; (b) omits H and I;
  // (c) omits H; (d) omits C, D, G, H, I and J. Diff round 3 found this header
  // claiming four mutants for EVERY case, which the tables do not carry.
  // For the cases each family does cover, mutants that a
  // presence assertion cannot tell apart from the real thing. (a) an EMPTY body
  // proves the case tracks the nested body rather than the presence of a
  // target; (b) `notpsql` proves it reads the command word; (c) `-X` proves it
  // reads the VERDICT rather than mere presence; (d) the same body DETACHED
  // proves the case is not passing through the arm that already worked.
  test("mutant (a): an attached target whose body runs NOTHING stays quiet", () => {
    const rows: Array<[label: string, source: string]> = [
      ["A bare backtick", "cat >``\n"],
      ["B dollar-paren in double quotes", 'cat >"$()"\n'],
      ["C backtick in double quotes", 'cat >""\n'],
      ["E brace operand", "cat >${OUT:-}\n"],
      ["G brace in double quotes", 'cat >"${OUT:-}"\n'],
      ["K fd-prefixed", 'cat 2>"$()"\n'],
    ];
    expect(rows.map(([label, source]) => [label, attachedReports(source)])).toEqual(
      rows.map(([label]) => [label, false]),
    );
  });

  test("mutant (b): the same targets carrying notpsql stay quiet", () => {
    const rows: Array<[label: string, source: string]> = [
      ["A bare backtick", "cat >`notpsql -c 'select 1'`\n"],
      ["B dollar-paren in double quotes", "cat >\"$(notpsql -c 'select 1')\"\n"],
      ["C backtick in double quotes", "cat >\"`notpsql -c 'select 1'`\"\n"],
      ["D locale-quoted", "cat >$\"$(notpsql -c 'select 1')\"\n"],
      ["E brace operand", "cat >${OUT:-$(notpsql -c 'select 1')}\n"],
      ["F here-string binding", "read -r PG <<<n'otpsql'\n\"$PG\" -c 'select 1'\n"],
      ["G brace in double quotes", "cat >\"${OUT:-$(notpsql -c 'select 1')}\"\n"],
      ["J continuation", "cat >\"/dev/null\\\n$(notpsql -c 'select 1')\"\n"],
      ["K fd-prefixed", "cat 2>\"$(notpsql -c 'select 1')\"\n"],
    ];
    expect(rows.map(([label, source]) => [label, attachedReports(source)])).toEqual(
      rows.map(([label]) => [label, false]),
    );
  });

  test("mutant (c): adding -X moves the VERDICT rather than removing the site", () => {
    const rows: Array<[label: string, source: string]> = [
      ["A bare backtick", "cat >`psql -X -c 'select 1'`\n"],
      ["B dollar-paren in double quotes", "cat >\"$(psql -X -c 'select 1')\"\n"],
      ["C backtick in double quotes", "cat >\"`psql -X -c 'select 1'`\"\n"],
      ["D locale-quoted", "cat >$\"$(psql -X -c 'select 1')\"\n"],
      ["E brace operand", "cat >${OUT:-$(psql -X -c 'select 1')}\n"],
      ["G brace in double quotes", "cat >\"${OUT:-$(psql -X -c 'select 1')}\"\n"],
      ["J continuation", "cat >\"/dev/null\\\n$(psql -X -c 'select 1')\"\n"],
      ["K fd-prefixed", "cat 2>\"$(psql -X -c 'select 1')\"\n"],
      ["I bare backtick, mid-construct", 'cat >`printf "\\140"; psql -X -c "select 1"`\n'],
    ];
    expect(
      rows.map(([label, source]) => {
        const sites = sitesIn(source, "x.sh");
        return [label, sites.length, sites.map((s) => s.suppressesStartupFiles)];
      }),
    ).toEqual(rows.map(([label]) => [label, 1, [true]]));
  });

  // F reports through `scanShellIndirection` as an IndirectionHit and produces
  // no PsqlSite, so there is no `suppressesStartupFiles` field for (c) to move.
  // Its analogue asserts the hit stays PRESENT: a hit records an indirection,
  // not a verdict. Stated rather than silently skipped - a procedure written
  // for "each of the eleven" that cannot execute for one of them is a checklist
  // item nobody can discharge.
  test("mutant (c), F's analogue: -X on the here-string binding leaves the hit present", () => {
    expect(
      scanShellIndirection("read -r PG <<<p'sql'\n\"$PG\" -X -c 'select 1'\n", "x.sh"),
    ).toHaveLength(1);
  });

  // W6: honour the escape pair at TOP LEVEL only. The plan named case H as its
  // killer and H does not reach that path at all -- H's escaped backtick is
  // consumed inside `closingBacktick`, never inside the quoted-span walk -- so
  // the variant held all 27 shipped checks. Found by BUILDING it, not by
  // reading. The separator is an escaped DOUBLE QUOTE inside the attached
  // target: with the escape honoured the target runs to its real close and the
  // substitution is a nested body; without it the span ends at the escaped
  // quote, the remainder never closes, and the SITE is lost to an advisory.
  // Both halves are asserted, because "something reported" holds either way and
  // is exactly the presence reading this class defeats.
  test("an escaped double quote inside an attached target does not end it", () => {
    const source = 'cat >"a\\"b$(psql -c \'select 1\')"\n';
    premiseHolds(
      "the same target WITHOUT the escaped quote reports one site, so the pair differs by that escape alone",
      sitesIn("cat >\"ab$(psql -c 'select 1')\"\n", "x.sh").length === 1,
    );
    const sites = sitesIn(source, "x.sh");
    expect({
      sites: sites.length,
      nested: sites.map((s) => s.nested),
      unlexableAdvisories: scanShellIndirection(source, "x.sh").length,
    }).toEqual({ sites: 1, nested: [true], unlexableAdvisories: 0 });
  });

  test("mutant (d): each covered body still reports from a DETACHED position", () => {
    const rows: Array<[label: string, source: string]> = [
      ["A bare backtick", "cat > `psql -c 'select 1'`\n"],
      ["B dollar-paren", "cat > \"$(psql -c 'select 1')\"\n"],
      ["E brace operand", "cat > ${OUT:-$(psql -c 'select 1')}\n"],
      ["F here-string binding", "read -r PG <<< p'sql'\n\"$PG\" -c 'select 1'\n"],
      ["K fd-prefixed", "cat 2> \"$(psql -c 'select 1')\"\n"],
    ];
    expect(rows.map(([label, source]) => [label, attachedReports(source)])).toEqual(
      rows.map(([label]) => [label, true]),
    );
  });

  // I's mutants are DIFFERENT, and that is the point of giving it its own
  // predicate. Moving the psql OUT of the backtick body must flip
  // `nestedInBacktick` to false while the site STILL REPORTS - the mutant only
  // an attribution assertion kills. And the round-4 mutant: a snippet producing
  // BOTH a wrongly top-level site and a correct one must FAIL, which an
  // existential reading accepts.
  test("I's attribution predicate discriminates in both directions", () => {
    const inBacktick = 'cat >`printf "\\140"; psql -c "select 1"`\n';
    const outOfBacktick = 'cat >`printf "\\140"` ; psql -c "select 1"\n';
    const both = 'cat >`printf "\\140"; psql -c "select 1"`\npsql -c \'select 2\'\n';
    expect({
      inBacktick: attachedInBacktick(inBacktick),
      outOfBacktickStillReports: sitesIn(outOfBacktick, "x.sh").length > 0,
      outOfBacktickAttribution: attachedInBacktick(outOfBacktick),
      leftoverWrongSiteFails: attachedInBacktick(both),
    }).toEqual({
      inBacktick: true,
      outOfBacktickStillReports: true,
      outOfBacktickAttribution: false,
      leftoverWrongSiteFails: false,
    });
  });

  // H asserts ATTRIBUTION too, and for the same reason: a walker that marks a
  // backtick inside an attached double-quoted target as `backtick:false` makes
  // H report while attributing it wrongly, and the separate bare-backtick path
  // still carries I.
  test("H's body is attributed to the backtick it really sits in", () => {
    expect(attachedInBacktick('cat >"`echo \\\\\\` ; psql -c "select 1"`"\n')).toBe(true);
  });

  // W11: an implementation that delimits construct-aware after `>` and `<<<`
  // and falls back to the character run for the other ten operators passes the
  // entire acceptance set, which exercises exactly those two. The array is
  // IMPORTED rather than retyped, so an operator added to the lexer is covered
  // by construction instead of silently exempt.
  test("the attached-target walk runs for EVERY shipped redirection operator", () => {
    // The FOIL is hand-written and the POPULATION is derived, which is the only
    // pairing that can disagree - deriving both from `REDIRECTION_PARTITION`
    // moves them together and the row could never fail. These two are the
    // operators bash takes LITERALLY, MEASURED rather than reasoned: one bash
    // script per operator with a fake psql on PATH, `<<` and `<<-` warn about
    // an unterminated here-document and execute NOTHING while the other ten
    // execute the substitution exactly once - `<&` included, which expands the
    // word first and only then fails the descriptor check. Reporting on a
    // here-doc delimiter is a FALSE advisory, the direction the consequence
    // bound refuses even though it is the quiet-looking one.
    const literalDelimiter = ["<<", "<<-"];
    expect([...REDIRECTION_PARTITION.literalTarget].sort()).toEqual([...literalDelimiter].sort());
    premiseHolds(
      "the operator axis is derived from the shipped array, so an operator added later is covered by construction",
      REDIRECTION_PARTITION.all.length === 12 &&
        literalDelimiter.every((operator) =>
          (REDIRECTION_PARTITION.all as readonly string[]).includes(operator),
        ),
    );
    expect(
      REDIRECTION_PARTITION.all.map((operator) => [
        operator,
        attachedReports(`cat ${operator}"$(psql -c 'select 1')"\n`),
      ]),
    ).toEqual(
      REDIRECTION_PARTITION.all.map((operator) => [operator, !literalDelimiter.includes(operator)]),
    );
  });

  // W12: every acceptance-set case carries AT MOST ONE substitution body, so
  // "collect the first body and stop" passes the whole set. The assertion is on
  // the COUNT rather than on a witness, over zero, one and two SIBLING bodies -
  // siblings, not nesting, because a first-body-only walk survives nesting and
  // dies on siblings.
  test("every nested body of one attached target is collected, not just the first", () => {
    const rows: Array<[label: string, source: string, bodies: number]> = [
      ["zero bodies", 'cat >"/dev/null"\n', 0],
      ["one body", "cat >\"$(psql -c 'one')\"\n", 1],
      ["two SIBLING bodies", "cat >\"$(psql -c 'one')$(psql -c 'two')\"\n", 2],
      ["three SIBLING bodies", "cat >\"$(psql -c 'one')$(psql -c 'two')$(psql -c 'three')\"\n", 3],
    ];
    expect(rows.map(([label, source]) => [label, sitesIn(source, "x.sh").length])).toEqual(
      rows.map(([label, , bodies]) => [label, bodies]),
    );
  });

  // W16: the sibling-body case varies bodies inside ONE target. A collector
  // that walks every body of the FIRST substitution-bearing target and ignores
  // later ones still passes it. Stated in BOTH orders, because with the payload
  // last an implementation that OVERWRITES its accumulation at each target also
  // passes.
  test("every attached target in a chunk is walked, whichever one carries the payload", () => {
    const rows: Array<[label: string, source: string]> = [
      ["payload in the FIRST target", 'cat >"$(psql -c \'one\')"\ncat >"$(true)"\n'],
      ["payload in the LAST target", 'cat >"$(true)"\ncat >"$(psql -c \'one\')"\n'],
      ["payload in BOTH targets", "cat >\"$(psql -c 'one')\"\ncat >\"$(psql -c 'two')\"\n"],
    ];
    expect(rows.map(([label, source]) => [label, sitesIn(source, "x.sh").length])).toEqual([
      ["payload in the FIRST target", 1],
      ["payload in the LAST target", 1],
      ["payload in BOTH targets", 2],
    ]);
  });

  // The three tests below close the axes the handover's §5a inventory listed as
  // crossed by NO fixture. None of them found a defect - the shipped delimiter
  // already handles all three - so what they buy is the pin, not a repair. That
  // is the point of the inventory: a quiet round certifies varied axes only,
  // and an axis no fixture varies is certified by nothing.

  // §5a item 3. Every acceptance fixture writes ONE redirection per command, so
  // nothing pinned that the walk RESUMES after a delimited target WITHIN a
  // command. W16 above closes the across-LINE version; this is the same-command
  // one, and it is the harder half, because resuming from a span the delimiter
  // just consumed is exactly where an off-by-one lands. Stated over both
  // which-target-carries-it orders for W16's reason: with the payload first, an
  // implementation that stops after the first target still passes.
  test("the walk resumes after a delimited target WITHIN one command", () => {
    const rows: Array<[label: string, source: string, want: number]> = [
      ["both targets carry it", "cat >\"$(psql -c 'one')\" 2>\"$(psql -c 'two')\"\n", 2],
      ["payload in the FIRST", 'cat >"$(psql -c \'one\')" 2>"$(echo two.txt)"\n', 1],
      ["payload in the LAST", 'cat >"$(echo one.txt)" 2>"$(psql -c \'one\')"\n', 1],
      [
        "payload in the MIDDLE of three",
        'cat >"$(echo one.txt)" 2>"$(psql -c \'x\')" <"$(echo /dev/null)"\n',
        1,
      ],
      ["a BARE target then a quoted one", "cat >$(psql -c 'one') 2>\"$(psql -c 'two')\"\n", 2],
    ];
    expect(rows.map(([label, source]) => [label, sitesIn(source, "x.sh").length])).toEqual(
      rows.map(([label, , want]) => [label, want]),
    );
  });

  // A COUNT can be right while the second site sits at the first one's
  // coordinates, which is the shape an off-by-one resume actually produces.
  // Both offsets are derived from the fixture rather than typed in.
  test("the second target's site lands at its OWN offset, not the first's", () => {
    const source = "cat >\"$(psql -c 'one')\" 2>\"$(psql -c 'two')\"\n";
    expect(sitesIn(source, "x.sh").map((site) => site.offset)).toEqual([
      source.indexOf("psql"),
      source.lastIndexOf("psql"),
    ]);
  });

  // §5a item 1. All fifteen acceptance fixtures end with a trailing newline, so
  // the end-of-file family was unreachable by the whole set - the same shape
  // that hid an input family on another arc in this repo where 114 cases all
  // ended in "\n". The split below is the consequence bound stated at EOF: a
  // target that CLOSES is resolved, one that does not is REPORTED, and neither
  // is silently wrong. A delimiter that assumed a terminator exists would take
  // the resolving rows to zero.
  test("a target running into EOF is resolved when it closes and REPORTED when it does not", () => {
    const rows: Array<[label: string, source: string, sites: number, advisories: number]> = [
      ["closed, no trailing newline", "cat >\"$(psql -c 'select 1')\"", 1, 0],
      ["closed, then a backslash as the LAST byte", "cat >\"$(psql -c 'select 1')\"\\", 1, 0],
      ["closed, space then a backslash at EOF", "cat >\"$(psql -c 'select 1')\" \\", 1, 0],
      ["a BARE target ending at EOF", "cat >$(psql -c 'x')", 1, 0],
      [
        "a continuation INSIDE the target, closed at EOF",
        "cat >\"a\\\n$(psql -c 'select 1')\"",
        1,
        0,
      ],
      ["the double quote never closes", "cat >\"$(psql -c 'select 1')", 0, 1],
      ["the substitution never closes", "cat >$(psql -c 'select 1'", 0, 1],
      ["unterminated, last byte a backslash", "cat >\"$(psql -c 'select 1')\\", 0, 1],
      [
        "a continuation inside the target, EOF mid-target",
        "cat >\"a\\\n$(psql -c 'select 1')",
        0,
        1,
      ],
    ];
    expect(
      rows.map(([label, source]) => [
        label,
        sitesIn(source, "x.sh").length,
        scanShellIndirection(source, "x.sh").length,
      ]),
    ).toEqual(rows.map(([label, , sites, advisories]) => [label, sites, advisories]));
  });

  // Diff round 1, finding 1. `matchBraceEnd` asked whether the character it
  // LANDED on equals the closing delimiter. `matchBrace` returns the final index
  // when it runs out of input, so a span whose last character merely IS that
  // delimiter - escaped, inside an unclosed quote, or closing a NESTED opener -
  // read as closed. The target was then resolved and its bodies collected, and
  // the unlexable channel it exists to feed was bypassed entirely.
  //
  // Bash exits 2 on every one of these and runs NOTHING, so a resolved site is
  // wrong auto-correction, not a conservative over-report. Both delimiter pairs
  // crossed with all three ways a final delimiter can fail to close.
  test("a construct whose LAST character is its delimiter without closing is REPORTED, not resolved", () => {
    const rows: Array<[label: string, source: string]> = [
      ["$() final ) is escaped", "cat >$(psql -c 'x'\\)"],
      ["$() final ) is inside an unclosed single quote", "cat >$(psql -c 'x)"],
      ["$() final ) closes only a NESTED opener", "cat >$(psql -c 'x' $(echo)"],
      ["${} final } is escaped", "cat >${OUT:-$(psql -c 'x')\\}"],
      ["${} final } is inside an unclosed single quote", "cat >${OUT:-$(psql -c 'x')'}"],
      ["${} final } closes only a NESTED opener", "cat >${OUT:-$(psql -c 'x') ${A}"],
    ];
    expect(
      rows.map(([label, source]) => [
        label,
        sitesIn(source, "x.sh").length,
        scanShellIndirection(source, "x.sh").length,
      ]),
    ).toEqual(rows.map(([label]) => [label, 0, 1]));
  });

  // Diff round 2, finding 1. `closeDoubleQuoted` delegated EVERY character to
  // `openerEnd`, which knows the quote forms too - so a `'` or `$'` or `$"`
  // sitting inside a double-quoted target was read as opening a nested span.
  // In bash those three are LITERAL text inside double quotes. The walk
  // therefore ran to end of chunk, called the target undelimitable, and then
  // emitted no advisory either, because the swallowed span carries no
  // substitution opener. Silent miss on both declared production surfaces, on
  // one-edit target spellings, which is the forbidden direction.
  test("a quote character that is LITERAL inside a double-quoted target does not open a span", () => {
    const rows: Array<[label: string, source: string]> = [
      ["control, no inner quote", 'cat >"x"\npsql -c "select 1"\n'],
      ["a literal single quote", 'cat >"x\'"\npsql -c "select 1"\n'],
      ["a literal ANSI-C opener", 'cat >"x$\'"\npsql -c "select 1"\n'],
      ["a literal locale opener", 'cat >"x$"\npsql -c "select 1"\n'],
    ];
    expect(
      rows.map(([label, source]) => [
        label,
        sitesIn(source, "x.sh").length,
        scanShellIndirection(source, "x.sh").length,
      ]),
    ).toEqual(rows.map(([label]) => [label, 1, 0]));
  });

  // Diff round 3. `$((` is ARITHMETIC, not a command substitution, and the
  // lexer's `$(` branches matched its prefix - so `>"$((psql -c 'x'))"` yielded
  // a resolved site for a command bash never runs (it exits on an arithmetic
  // syntax error). A REGRESSION this arc introduced: base reports nothing here.
  //
  // The obvious repair is a trap and the last row is what guards it. Bash DOES
  // execute a command substitution NESTED INSIDE arithmetic, so suppressing the
  // whole span would trade this false site for a silent miss - the forbidden
  // direction swapped in while fixing the permitted one. The arithmetic span
  // contributes no body of its OWN; its interior stays a live lexing context.
  // PROMOTED from a scratchpad probe, because a scratchpad artifact dies with
  // the session that wrote it and this is the branch's terminal verifier. The
  // source-mutation registry cannot reach the `$((` branch at all: BOTH declared
  // operators produce ZERO sites over it. Four UNdeclared operators do reach it,
  // the cheapest file-wide being `logical-connector` at +195 sites; the row
  // carries the per-operator census, stated as reaches/does-not-reach plus a
  // file-wide cost, because an exact in-branch count depends on where the
  // branch is cut and two honest enumerations disagreed on it.
  // Filed as BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH rather than
  // enrolled, so this test IS the coverage for that branch.
  //
  // Expectations are DERIVED FROM BASH, not typed in: each row runs under a
  // fake `psql` on PATH and the scanner must agree with whether the shell
  // actually executed it. A row that stops executing changes its own
  // expectation, so the test cannot rot into asserting a stale belief.
  test("the scanner agrees with BASH on every arithmetic-versus-substitution spelling", () => {
    const dir = mkdtempSync(join(tmpdir(), "arith-oracle-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const fake = join(bin, "psql");
    writeFileSync(fake, "#!/bin/bash\nprintf 'RAN\\n' >> \"$LOGFILE\"\necho out.txt\n");
    chmodSync(fake, 0o755);
    const bashRuns = (source: string, id: string): boolean => {
      const script = join(dir, `${id}.sh`);
      const log = join(dir, `${id}.log`);
      writeFileSync(script, source);
      writeFileSync(log, "");
      try {
        execFileSync("bash", [script], {
          cwd: dir,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOGFILE: log },
          stdio: "ignore",
          timeout: 10_000,
        });
      } catch {
        // A failed redirection or an arithmetic syntax error is fine - the LOG
        // is the observation, not the exit status.
      }
      return readFileSync(log, "utf8").includes("RAN");
    };
    const rows: Array<[label: string, source: string]> = [
      ["bare arithmetic", "cat >$((psql -c 'select 1'))\n"],
      ["double-quoted arithmetic", "cat >\"$((psql -c 'select 1'))\"\n"],
      ["locale-quoted arithmetic", "cat >$\"$((psql -c 'select 1'))\"\n"],
      ["brace-wrapped arithmetic", "cat >${OUT:-$((psql -c 'select 1'))}\n"],
      ["fd-prefixed arithmetic", "cat 2>\"$((psql -c 'select 1'))\"\n"],
      ["a real substitution NESTED in arithmetic", "cat >\"$((1 + $(psql -c 'x')))\"\n"],
      ["control, ordinary substitution", "cat >\"$(psql -c 'select 1')\"\n"],
    ];
    // ONE spawn per row, memoised. The first draft called `bashRuns` FOUR times
    // per row - a floor pass plus three inside the assertion - which is 28 bash
    // processes for 7 rows, and it was quietly TAUTOLOGICAL: the EXPECTED array
    // called `bashRuns` a second time, so it compared bash against itself and
    // the scanner's answer rode along without ever being the thing under test.
    const ran = new Map(rows.map(([, source], n) => [n, bashRuns(source, `r${n}`)]));

    // Floor 1, non-vacuity, stated as an executable PREMISE because this test
    // TOUCHES THE ENVIRONMENT - it needs a usable `bash` and a fake `psql` it can
    // put on PATH. If neither runs, every "agrees" below is two zeros agreeing
    // about nothing, and the premise contract is what makes that a red rather
    // than a quiet green.
    premiseHolds(
      "bash runs the fixtures and the fake psql on PATH is reachable",
      [...ran.values()].some(Boolean),
    );

    // Floor 2, PLANTED DEFECT. A gate whose expected and actual share a producer
    // is vacuous however principled that producer is, and the double-call above
    // is what that looks like in practice. So a deliberately wrong classifier -
    // one that calls every spelling a site - is run through the SAME comparison
    // and must DISAGREE with bash. If this ever stops disagreeing, the matrix has
    // stopped discriminating and its green means nothing.
    const alwaysSite = rows.map(([label]) => [label, true]);
    const fromBash = rows.map(([label], n) => [label, ran.get(n)]);
    expect(
      alwaysSite,
      "a classifier that reports EVERYTHING still matched bash - the matrix cannot discriminate",
    ).not.toEqual(fromBash);

    expect(rows.map(([label, source]) => [label, sitesIn(source, "x.sh").length > 0])).toEqual(
      fromBash,
    );
  }, 30_000);

  test("$(( )) is arithmetic and yields no site, while a substitution nested INSIDE it still does", () => {
    const rows: Array<[label: string, source: string, sites: number]> = [
      ["bare arithmetic target", "cat >$((psql -c 'select 1'))\n", 0],
      ["double-quoted", "cat >\"$((psql -c 'select 1'))\"\n", 0],
      ["locale-quoted", "cat >$\"$((psql -c 'select 1'))\"\n", 0],
      ["brace-wrapped", "cat >${OUT:-$((psql -c 'select 1'))}\n", 0],
      ["fd-prefixed operator", "cat 2>\"$((psql -c 'select 1'))\"\n", 0],
      ["a real $() NESTED in arithmetic still reports", "cat >\"$((1 + $(psql -c 'x')))\"\n", 1],
      ["control, ordinary substitution", "cat >\"$(psql -c 'select 1')\"\n", 1],
    ];
    expect(rows.map(([label, source]) => [label, sitesIn(source, "x.sh").length])).toEqual(
      rows.map(([label, , sites]) => [label, sites]),
    );
  });

  // Diff round 3 at the settled base. `visitBody` lexes a nested body into its
  // OWN `innerTargets`, and nothing ever read their `unlexable` entries - so an
  // undelimitable target INSIDE a substitution was reported at the enclosing
  // body's line, with the whole body as its text, instead of at the target's own
  // opening line. The channel fired, which is why no silence test caught it; it
  // fired pointing somewhere else. Wrong attribution is a forbidden direction,
  // and line is a field AC-5's digest covers.
  test("an undelimitable target NESTED in a substitution body reports at its own line", () => {
    const source = "X=$(\ncat >\"$(psql -c 'select 1')\n)\n";
    const hits = scanShellIndirection(source, "x.sh");
    expect(hits.map((hit) => hit.line)).toContain(2);
  });

  // §5a items 4 and 7. Every acceptance fixture is a whole small file whose
  // construct starts at line 1 under LF. Line is a field AC-5's digest covers,
  // so this asserts the COORDINATE and not the presence - the killer audit's
  // one general finding is that a presence assertion does not discriminate a
  // delimiting weakening while a coordinate assertion does.
  test("an attached target is found mid-file and under CRLF, at its own coordinates", () => {
    const rows: Array<[label: string, source: string, line: number]> = [
      ["inside a function body", "f() {\n  cat >\"$(psql -c 'x')\"\n}\nf\n", 2],
      ["after a here-document", "cat <<EOF\nplain\nEOF\ncat >\"$(psql -c 'x')\"\n", 4],
      ["inside a case arm", "case a in\n  a) cat >\"$(psql -c 'x')\" ;;\nesac\n", 2],
      ["CRLF line endings", "cat >\"$(psql -c 'select 1')\"\r\n", 1],
    ];
    expect(
      rows.map(([label, source]) => {
        const found = sitesIn(source, "x.sh");
        return [label, found.length, found[0]?.line, found[0]?.offset];
      }),
    ).toEqual(rows.map(([label, source, line]) => [label, 1, line, source.indexOf("psql")]));
  });

  // W5: G nests two deep, so an implementation capped at two passes A-K, the
  // operator-derived test and the sibling-body test. This asserts THREE concrete
  // depths rather than depth generally, so it kills a cap at TWO or THREE and a
  // cap at FOUR would survive it. Stated as the limit it is: diff round 2 found
  // both the plan and this name claiming "unbounded", which the fixture list
  // cannot support, and no W5 variant was ever observed failing (§2b-bis records
  // it as could-not-be-built).
  test("recursion into an attached target is not capped at case G's depth, over depths 2 to 4", () => {
    const rows: Array<[depth: number, source: string]> = [
      [2, "cat >\"${OUT:-$(psql -c 'select 1')}\"\n"],
      [3, "cat >\"${OUT:-${OTHER:-$(psql -c 'select 1')}}\"\n"],
      [4, "cat >\"${A:-${B:-${C:-$(psql -c 'select 1')}}}\"\n"],
    ];
    expect(rows.map(([depth, source]) => [depth, attachedReports(source)])).toEqual(
      rows.map(([depth]) => [depth, true]),
    );
  });

  // W18/W17/W15: rounds 1 through 4 each killed one positional heuristic and
  // left the next alive - the operator's line, `operatorLine + 1`, the target's
  // FINAL line, the scanner's line at EOF. The rule that closes the family at
  // once: choose the fixture so the asserted line differs from EVERY other
  // candidate line in it. For an ATTACHED target the operator's line and the
  // target's first line necessarily coincide, so the candidates are three, and
  // the asserted value differs from all three.
  test("a nested body is stamped with its OWN line and byte offset, not a displacement", () => {
    const source = ['cat >"a\\', "$(psql -c 'select 1')\\", 'b"', "echo one", "echo two", ""].join(
      "\n",
    );
    const candidates = {
      operatorLine: 1,
      targetFirstLine: 1,
      targetLastLine: 3,
      eofLine: source.split("\n").length,
    };
    premiseHolds(
      "the asserted line differs from every candidate a positional heuristic could pick",
      ![
        candidates.operatorLine,
        candidates.targetFirstLine,
        candidates.targetLastLine,
        candidates.eofLine,
      ].includes(2),
    );
    const sites = sitesIn(source, "x.sh");
    expect({
      count: sites.length,
      line: sites[0]?.line,
      offset: sites[0]?.offset,
      candidates,
    }).toEqual({
      count: 1,
      line: 2,
      offset: source.indexOf("psql"),
      candidates: { operatorLine: 1, targetFirstLine: 1, targetLastLine: 3, eofLine: 6 },
    });
  });

  // J with TWO continuations. One continuation is not enough: a walker that
  // stamps `operatorLine + 1` agrees with the right rule on the only fixture
  // that could tell them apart, so the psql sits on the physical THIRD line and
  // the assertion carries its byte offset as well. A displacement that is right
  // by construction is not an assertion.
  test("a continuation-crossing target stamps the body's real line, not operatorLine + 1", () => {
    const source = ['cat >"/dev/null\\', "/tmp/x\\", "$(psql -c 'select 1')\"", ""].join("\n");
    const sites = sitesIn(source, "x.sh");
    expect({ count: sites.length, line: sites[0]?.line, offset: sites[0]?.offset }).toEqual({
      count: 1,
      line: 3,
      offset: source.indexOf("psql"),
    });
  });
});

// ---------------------------------------------------------------------------
// Task 2 of BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION. Task 1 delimits
// what the accept-set can close; an UNTERMINATED construct closes nothing, and
// the consequence bound forbids silent discard. So the machinery REPORTS what
// it cannot delimit, on the channel that already means "something here I
// cannot read": an IndirectionHit naming the target.
//
// The case list is DERIVED from spec section 3.1's opener table rather than
// picked - one unterminated case per opener the table admits - because an
// implementation keyed to whichever three spellings an author happened to
// choose silently discards their siblings, and `$(` is a different opener from
// `${` exactly as a plain double quote is from the locale form.
// ---------------------------------------------------------------------------

describe("an ATTACHED target the accept-set cannot delimit is REPORTED on the spec's REPORT CONDITION", () => {
  /** One row per opener in the accept-set table, each with the TERMINATED twin
   *  that is one edit away. Without the twin a channel that reports EVERY
   *  attached target satisfies all seven positives while being maximally
   *  broken; without the positives a channel that reports nothing does. */
  const UNLEXABLE: Array<[opener: string, unterminated: string, twin: string]> = [
    ["$(", "cat >$(psql -c 'select 1'\n", "cat >$(psql -c 'select 1')\n"],
    ["${", "cat >${OUT:-$(psql -c 'select 1')\n", "cat >${OUT:-$(psql -c 'select 1')}\n"],
    ["backtick", "cat >`psql -c 'select 1'\n", "cat >`psql -c 'select 1'`\n"],
    ['"', "cat >\"$(psql -c 'select 1')\n", "cat >\"$(psql -c 'select 1')\"\n"],
    ['$"', "cat >$\"$(psql -c 'select 1')\n", "cat >$\"$(psql -c 'select 1')\"\n"],
    ["'", "cat >'$(psql -c x)\n", "cat >'$(psql -c x)'\n"],
    ["$'", "cat >$'$(psql -c x)\n", "cat >$'$(psql -c x)'\n"],
  ];

  test("every opener in the accept-set table reports when its construct never closes", () => {
    premiseHolds(
      "the case list covers the whole opener table, derived from spec section 3.1 rather than picked",
      UNLEXABLE.length === 7,
    );
    expect(
      UNLEXABLE.map(([opener, unterminated]) => {
        const hits = scanShellIndirection(unterminated, "x.sh");
        return [opener, hits.length, hits[0]?.text ?? null];
      }),
    ).toEqual(
      UNLEXABLE.map(([opener, unterminated]) => [
        opener,
        1,
        unterminated.slice(unterminated.indexOf(">") + 1).trim(),
      ]),
    );
  });

  test("the TERMINATED twin of each opener reports no unlexable target", () => {
    expect(
      UNLEXABLE.map(([opener, , twin]) => [
        opener,
        scanShellIndirection(twin, "x.sh").filter(
          (hit) =>
            hit.text.startsWith("$") ||
            hit.text.startsWith("`") ||
            hit.text.startsWith("'") ||
            hit.text.startsWith('"'),
        ).length,
      ]),
    ).toEqual(UNLEXABLE.map(([opener]) => [opener, 0]));
  });

  // An implementation that emits the required hit AND fabricates a PsqlSite
  // beside it passes both the positive and the twin, and AC-5's digest cannot
  // kill it because the live corpus holds zero members of this family - there
  // is no baseline row for a fabricated site to move. The site count is the
  // only assertion that discriminates, so it is stated per case. It is also
  // what bash does: an unterminated construct is a syntax error and the file
  // runs NOTHING.
  test("an unlexable target produces no PsqlSite", () => {
    expect(
      UNLEXABLE.map(([opener, unterminated]) => [opener, sitesIn(unterminated, "x.sh").length]),
    ).toEqual(UNLEXABLE.map(([opener]) => [opener, 0]));
  });

  // The firing condition is NARROW and is part of the contract: the live corpus
  // holds ordinary attached targets - 58 at this HEAD, 53 at base `e5d1d723d`,
  // derived by `corpus-family3.mts` rather than trusted from here - and not one of them may become an
  // advisory. An undelimitable span carrying nothing executable stays quiet
  // too - being unreadable is not by itself worth a report.
  test("an ordinary attached target is never advised on, delimitable or not", () => {
    const rows: Array<[label: string, source: string]> = [
      ["a terminated ordinary target", 'cat >"${OUT}"\n'],
      ["a plain path", "cat >/dev/null\n"],
      ["an UNTERMINATED double quote carrying no opener", 'cat >"/dev/null\n'],
      ["an UNTERMINATED single quote carrying no opener", "cat >'/dev/null\n"],
    ];
    // These four are quiet TODAY and after, so on their own they are satisfied
    // by an implementation that never looks. Each is one edit from a case in
    // the opener table above that is RED until the channel exists, and it is
    // the pair that discriminates: the same target with an opener reports, and
    // without one it does not.
    expect(
      rows.map(([label, source]) => [label, scanShellIndirection(source, "x.sh").length]),
    ).toEqual(rows.map(([label]) => [label, 0]));
  });

  // `${` is one of the three openers the spec names, so an unterminated brace
  // fires even with nothing executable inside it. That is deliberate and it is
  // the conservative direction: bash refuses the file outright on the
  // unexpected EOF, the target is genuinely unreadable, and the report says so
  // rather than claiming what it would have expanded to. Pinned here so a later
  // reader meets the decision instead of re-deriving it as an over-report.
  test("an unterminated brace fires on its own opener, deliberately", () => {
    expect(scanShellIndirection("cat >${OUT\n", "x.sh").map((hit) => hit.text)).toEqual(["${OUT"]);
  });

  // The report is scoped to the execution surfaces production READS. In a JS
  // file the text is a COMPOSED STRING where `<` is a comparison, a JSX tag or
  // a regex, and the ungated channel fired on NINE live template literals -
  // measured, not feared. The pair varies ONE thing, the file's extension, so
  // the quiet side is attributable: identical bytes report as shell and stay
  // silent as JS. Shell text embedded in JS is documented limit 1 of the
  // design, not an oversight here.
  test("the unlexable report is scoped to shell and workflow surfaces, not JS", () => {
    // ONE variable: the file's extension. Identical bytes, so the silence is
    // attributable to the scoping rather than to the reader never getting
    // there. A YAML row rides along because the workflow `run:` surface IS in
    // the domain and a shell-only reading would have silently dropped it.
    const shellShaped = "cat >\"$(psql -c 'select 1')\n";
    // Shell embedded in a JS string is documented limit 1 of the design -
    // reaching it needs extractors this module does not export - so the zero
    // here is a DECLARED limit and not an accident of the fixture.
    const embeddedInJs = 'const cmd = "cat >\\"$(psql -c \'select 1\')";\n';
    expect({
      asShell: scanShellIndirection(shellShaped, "x.sh").length,
      asWorkflow: scanShellIndirection(shellShaped, "x.yml").length,
      asTypeScript: scanShellIndirection(shellShaped, "x.ts").length,
      embeddedInJs: scanShellIndirection(embeddedInJs, "x.ts").length,
    }).toEqual({ asShell: 1, asWorkflow: 1, asTypeScript: 0, embeddedInJs: 0 });
  });

  // The operator derivation in Task 1 sits only on the DELIMIT path, so an
  // implementation can delimit every shipped operator correctly and emit
  // unlexable reports for `>` alone. And Task 2 varies opener KIND and nothing
  // else, so an implementation that suppresses the report whenever a file
  // descriptor preceded the operator passes every stipulated case - the killer
  // is case K with its closing quote removed, one edit inside the domain.
  test("the report path crosses the operator axis too, prefix included", () => {
    // Counted by the hit's own TEXT rather than by the array length. The
    // here-string row draws a SECOND, unrelated hit from the line-text route,
    // which is correct and says nothing about this channel: a length assertion
    // there would pin an unrelated reading and drift the first time it moved.
    const rows: Array<[label: string, source: string, expected: string]> = [
      ["a non-`>` operator", "cat >>\"$(psql -c 'select 1')\n", "\"$(psql -c 'select 1')"],
      ["an fd-prefixed operator", "cat 2>\"$(psql -c 'select 1')\n", "\"$(psql -c 'select 1')"],
      ["an input operator", "read -r PG <<<\"$(psql -c 'select 1')\n", "\"$(psql -c 'select 1')"],
    ];
    expect(
      rows.map(([label, source, expected]) => [
        label,
        scanShellIndirection(source, "x.sh").filter((hit) => hit.text === expected).length,
      ]),
    ).toEqual(rows.map(([label]) => [label, 1]));
  });

  // Every unlexable fixture above starts on line 1, so an implementation that
  // always emits `line = 1` passes all of them. Moving one to a later line
  // kills that and leaves the NEXT heuristic alive: for a span that never
  // closes, "where it started" and "where the scan ran out" coincide unless the
  // span crosses lines. This one does both - it opens on line 3 and EOF is line
  // 6 - under the same derived rule Task 1's coordinate cases use.
  test("the hit names the line the target OPENS on, not line 1 and not EOF", () => {
    const source = [
      "echo one",
      "echo two",
      "cat >\"$(psql -c 'select 1')",
      "echo three",
      "echo four",
      "",
    ].join("\n");
    const candidates = { firstLine: 1, eofLine: source.split("\n").length };
    premiseHolds(
      "the asserted line differs from every candidate a positional heuristic could pick",
      ![candidates.firstLine, candidates.eofLine].includes(3),
    );
    const hits = scanShellIndirection(source, "x.sh");
    expect({ count: hits.length, line: hits[0]?.line, candidates }).toEqual({
      count: 1,
      line: 3,
      candidates: { firstLine: 1, eofLine: 6 },
    });
  });
});

describe("YAML scalar style — a QUOTED `run:` scalar's delimiters are YAML, not shell", () => {
  // BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE. The workflow reader hands the RAW
  // source slice of a `run:` scalar to the shell lexer. For a PLAIN or BLOCK
  // scalar that slice IS the shell text and the pass is correct. For a QUOTED
  // one the delimiters belong to YAML, and reading them as shell is wrong in
  // both forbidden directions at once: the leading `"` opens a double-quoted
  // shell span, the `$(` inside it consumes the YAML CLOSING quote, and a psql
  // command word is recovered from a substitution body that exists only because
  // two YAML delimiters were read as shell. bash never runs that command.
  //
  // The decoded pass below the raw one already scans the scalar's VALUE, which
  // is the shell text a quoted scalar actually carries, so the repair is to
  // stop running the raw pass on the styles where the raw slice is not shell
  // text — not to add a second decoder.
  const WORKFLOW_FILE = ".github/workflows/x.yml";

  /** The spec's canonical body: an unclosed `$(` inside a redirection target. */
  const CANONICAL_BODY = "echo >$(psql -qAt mydb";

  const workflowWith = (runScalar: string): string =>
    [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      `      - run: ${runScalar}`,
      "",
    ].join("\n");

  /**
   * DERIVED from the fixture, never written down. A hardcoded 7 passes for a
   * reader that anchors on any line as long as the fixture happens to put the
   * key there; deriving it means moving a fixture line moves the expectation
   * with it.
   */
  const runKeyLineOf = (source: string): number =>
    source.split("\n").findIndex((line) => line.includes("- run:")) + 1;

  // AC-1 — the defect itself. A double-quoted scalar carrying the canonical
  // body yields NO site, because bash, handed the value that scalar decodes to
  // (`echo >$(psql -qAt mydb`), runs no psql: the substitution never closes.
  test("AC-1: a DOUBLE-QUOTED `run:` scalar fabricates no site", () => {
    const source = workflowWith(`"${CANONICAL_BODY}"`);
    expect(scanWorkflowSource(source, WORKFLOW_FILE)).toEqual([]);
  });

  // AC-3 — the styles whose raw slice IS shell text keep the behaviour they
  // have. This is the regression half of AC-1: an implementation that
  // suppressed the raw pass for EVERY style would satisfy AC-1 and break both
  // of these.
  test("AC-3: a PLAIN scalar with the same body still yields no site and one advisory at the key's line", () => {
    const source = workflowWith(CANONICAL_BODY);
    const keyLine = runKeyLineOf(source);
    premiseHolds(
      "the fixture's `run:` key is not on line 1, so an advisory pinned there is not a positional default",
      keyLine !== 1,
    );
    expect(scanWorkflowSource(source, WORKFLOW_FILE)).toEqual([]);
    expect(
      scanShellIndirection(source, WORKFLOW_FILE).map((hit) => ({
        line: hit.line,
        text: hit.text,
      })),
    ).toEqual([{ line: keyLine, text: "$(psql -qAt mydb" }]);
  });

  test("AC-3: a BLOCK_LITERAL scalar still reports its site at the PHYSICAL line, not the key's", () => {
    const source = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      "          psql -qAt mydb",
      "",
    ].join("\n");
    const keyLine = runKeyLineOf(source);
    const bodyLine = source.split("\n").findIndex((line) => line.includes("psql -qAt")) + 1;
    premiseHolds(
      "the block body is on a DIFFERENT line from its key, which is the only shape that can tell the two anchors apart",
      bodyLine !== keyLine,
    );
    expect(
      scanWorkflowSource(source, WORKFLOW_FILE).map((site) => ({
        line: site.line,
        suppresses: site.suppressesStartupFiles,
      })),
    ).toEqual([{ line: bodyLine, suppresses: false }]);
  });

  // AC-4 — the anti-tautology arm, and the reason AC-1 is not a licence to go
  // quiet. AC-1 asserts an EMPTY result, which a scanner broken in the other
  // direction satisfies for free. These six rows are what a gate that
  // suppressed quoted scalars ENTIRELY would fail, and they assert the VERDICT
  // field (`suppressesStartupFiles`), not mere presence, so a site recovered
  // with the wrong verdict is a failure too.
  test.each([
    ["a benign SINGLE-quoted PROTECTED command", "'psql -X mydb'", true],
    ["a benign SINGLE-quoted UNPROTECTED command", "'psql -qAt mydb'", false],
    ["a benign DOUBLE-quoted UNPROTECTED command", '"psql -qAt mydb"', false],
    ["a DOUBLE-quoted escape spelling of the command word", '"\\x70sql -qAt mydb"', false],
    ["a PLAIN UNPROTECTED command", "psql -qAt mydb", false],
  ])("AC-4: %s is still a site, with its verdict intact", (_label, runScalar, suppresses) => {
    const source = workflowWith(runScalar);
    expect(
      scanWorkflowSource(source, WORKFLOW_FILE).map((site) => site.suppressesStartupFiles),
    ).toEqual([suppresses]);
  });

  // The `\x70sql` row above is the single most load-bearing case in this task:
  // its RAW slice holds no literal `psql`, so it is reachable ONLY through the
  // decoded pass. If the repair had suppressed both passes for quoted scalars,
  // this row is the one that catches it — and `bash -n` accepts the command, so
  // losing it would be silent corruption rather than a visible break.
  test("AC-4: the escape-spelled command word is decoded-only, so its raw slice cannot supply it", () => {
    const source = workflowWith('"\\x70sql -qAt mydb"');
    premiseHolds(
      "the fixture's raw source really holds no literal `psql`, so the passing row above cannot come from the raw pass",
      !source.includes("psql"),
    );
    expect(scanWorkflowSource(source, WORKFLOW_FILE)).toHaveLength(1);
  });

  test("AC-4: a benign non-psql DOUBLE-quoted scalar draws nothing", () => {
    expect(scanWorkflowSource(workflowWith('"echo hello"'), WORKFLOW_FILE)).toEqual([]);
  });

  // AC-9 — the accept-set is a PARTITION of the installed library's style
  // vocabulary, not a list someone hopes is complete.
  //
  // EQUALITY in both directions, and the weaker form is worth naming because
  // the first draft shipped it: asserting only that the union COVERS what the
  // library emits still admits an arbitrary extra member. A constant holding
  // `NOT_A_YAML_STYLE` is disjoint from the quoted pair AND covers everything
  // emitted, so both assertions pass while default-deny has quietly been
  // weakened. Under equality an added member breaks the union one way and a
  // dropped one breaks it the other.
  //
  // This pin is GREEN from birth and carries no red-then-green marker, which is
  // deliberate: the installed library already emits exactly these five, so the
  // assertion is true before any of this arc's code exists. Dressing a
  // structural pin in a cycle it can never be observed completing is the marker
  // shape the task contract rejects. It ships in the commit that introduces the
  // constant it pins.
  test("AC-9: the raw-is-shell-text accept-set partitions the styles `yaml` emits", () => {
    const QUOTED_STYLES = new Set(["QUOTE_SINGLE", "QUOTE_DOUBLE"]);

    // DERIVED from the library's own vocabulary — the complete set of `type`
    // values a `Scalar` can carry — rather than written down here. A new style
    // in a `yaml` upgrade fails this pin instead of silently defaulting into
    // whichever branch the reader happens to take.
    const declaredByLibrary = new Set(
      Object.getOwnPropertyNames(Scalar)
        .filter(
          (key) =>
            key !== "name" &&
            typeof (Scalar as unknown as Record<string, unknown>)[key] === "string",
        )
        .map((key) => (Scalar as unknown as Record<string, string>)[key]!),
    );

    // Cross-derivation, so the pin above cannot pass by reading a vocabulary the
    // parser never actually produces: parse one real spelling of each style and
    // collect the `type` the parser hands back.
    const emittedByParser = new Set(
      [
        "psql -qAt mydb",
        "'psql -qAt mydb'",
        '"psql -qAt mydb"',
        "|\n          psql -qAt mydb",
        ">\n          psql -qAt mydb",
      ].map((spelling) => {
        const document = parseDocument(workflowWith(spelling), { keepSourceTokens: true });
        let observed: string | undefined;
        visit(document, {
          Pair(_key: unknown, pair: unknown) {
            const node = pair as { key?: { value?: unknown }; value?: unknown };
            if (node.key?.value !== "run") return;
            observed = (node.value as { type?: string } | undefined)?.type;
          },
        });
        return observed!;
      }),
    );
    premiseHolds(
      "the two derivations agree, so the library's declared vocabulary is the one its parser actually emits",
      [...declaredByLibrary].sort().join(",") === [...emittedByParser].sort().join(","),
    );

    expect({
      overlapWithQuoted: [...RAW_IS_SHELL_TEXT_STYLES].filter((style) => QUOTED_STYLES.has(style)),
      union: [...new Set([...RAW_IS_SHELL_TEXT_STYLES, ...QUOTED_STYLES])].sort(),
    }).toEqual({
      overlapWithQuoted: [],
      union: [...declaredByLibrary].sort(),
    });
  });
});

describe("YAML quoted scalar advisory — the channel that lexes the whole file", () => {
  // The other half of BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE. This channel
  // hands the WHOLE YAML file to the shell lexer and never parses YAML at all,
  // so a quoted executable scalar's YAML delimiters are read as SHELL quotes:
  // the body collapses into one literal word, the `$(` inside it is quoted
  // rather than opening a substitution, and the unlexable-target report never
  // fires. The plain spelling of the same body reports; the quoted spellings go
  // silent. Silence is the other forbidden direction.
  //
  // The repair blanks each quoted executable scalar out of the file and rescans
  // its DECODED value, pinning what it finds to the key's line — the same
  // anchoring contract the site channel's decoded pass already states.
  const WORKFLOW_FILE = ".github/workflows/x.yml";
  const CANONICAL_BODY = "echo >$(psql -qAt mydb";
  const CANONICAL_TARGET = "$(psql -qAt mydb";

  const stepScalar = (key: string, scalar: string): string =>
    [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      `      - ${key}: ${scalar}`,
      "",
    ].join("\n");

  const withScalar = (key: string, scalar: string): string =>
    [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      "      - uses: docker://alpine",
      "        with:",
      `          ${key}: ${scalar}`,
      "",
    ].join("\n");

  /** DERIVED from the fixture. A hardcoded line number passes for a reader that
   * anchors anywhere the fixture happens to put the key. */
  const keyLineOf = (source: string, key: string): number =>
    source
      .split("\n")
      .findIndex((line) => line.trimStart().replace(/^- /, "").startsWith(`${key}:`)) + 1;

  // AC-2, the full key x style matrix. Round-3 plan review found the first
  // draft covered only `run`, which a `run`-only implementation passes while
  // still violating AC-2 on the other three. Probed at base, all four keys
  // behave identically — plain=1, single=0, double=0 — so all eight quoted
  // cells are red and none is redundant.
  //
  // `entrypoint` and `args` are in scope for THIS channel precisely because it
  // lexes the whole file: their YAML delimiters reach the shell lexer exactly
  // as a `run:` scalar's do. Their SITE channel is already correct and is not
  // touched. The repair is a set union, so the class-sweep default applies —
  // the marginal cost of the other three keys is one identifier each while
  // holding the context.
  const EXECUTABLE_KEYS: Array<[string, (key: string, scalar: string) => string]> = [
    ["run", stepScalar],
    ["shell", stepScalar],
    ["entrypoint", withScalar],
    ["args", withScalar],
  ];
  const QUOTED_SPELLINGS: Array<[string, (body: string) => string]> = [
    ["SINGLE-quoted", (body) => `'${body}'`],
    ["DOUBLE-quoted", (body) => `"${body}"`],
  ];

  const matrix = EXECUTABLE_KEYS.flatMap(([key, build]) =>
    QUOTED_SPELLINGS.map(
      ([styleLabel, quote]) => [key, styleLabel, build(key, quote(CANONICAL_BODY))] as const,
    ),
  );

  test.each(matrix)("AC-2: a %s: scalar, %s, reports at the key's line", (key, _style, source) => {
    const keyLine = keyLineOf(source, key);
    premiseHolds(
      "the fixture's key is not on line 1, so an advisory pinned there is not a positional default",
      keyLine !== 1,
    );
    expect(
      scanShellIndirection(source, WORKFLOW_FILE).map((hit) => ({
        line: hit.line,
        text: hit.text,
      })),
    ).toEqual([{ line: keyLine, text: CANONICAL_TARGET }]);
  });

  // The PLAIN spelling of every one of those keys already reports. These are
  // the regression half: an implementation that blanked the plain styles too
  // would satisfy every quoted assertion above and silence all four of these.
  test.each(EXECUTABLE_KEYS)(
    "AC-2 regression: a PLAIN %s: scalar still reports at the key's line",
    (key, build) => {
      const source = build(key, CANONICAL_BODY);
      expect(
        scanShellIndirection(source, WORKFLOW_FILE).map((hit) => ({
          line: hit.line,
          text: hit.text,
        })),
      ).toEqual([{ line: keyLineOf(source, key), text: CANONICAL_TARGET }]);
    },
  );

  // YAML lets the key and its scalar sit on DIFFERENT lines, and this is the
  // only fixture shape that can tell the two anchors apart. Every fixture in
  // the first draft put them on one line, so an implementation anchoring on the
  // VALUE's range passed every line assertion in the plan. The spec's contract
  // says the KEY's line.
  test("AC-2: the advisory names the KEY's line even when the scalar starts on the next one", () => {
    const source = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run:",
      `          "${CANONICAL_BODY}"`,
      "",
    ].join("\n");
    const keyLine = keyLineOf(source, "run");
    const valueLine = source.split("\n").findIndex((line) => line.includes(CANONICAL_BODY)) + 1;
    premiseHolds(
      "the key and its scalar really are on different lines, which is what makes the two anchors distinguishable",
      keyLine !== valueLine,
    );
    expect(scanShellIndirection(source, WORKFLOW_FILE).map((hit) => hit.line)).toEqual([keyLine]);
  });

  // COORDINATE SPACE. This channel already rewrites its input once — the YAML
  // continuation transform, which REMOVES BYTES — and parser ranges are offsets
  // into the ORIGINAL source. Blank after the transform and the blanking
  // overruns by exactly the bytes the transform removed, straight into the
  // following line:
  //
  //   RIGHT (blank, then transform):  "      - run: PG=psql; $PG -qAt mydb"
  //   WRONG (transform, then blank):  "         un: PG=psql; $PG -qAt mydb"
  //
  // The `run:` key itself is destroyed, so the NEXT step stops being a run
  // scalar and its finding is silently erased — in the channel this task exists
  // to un-silence. The fixture below is that exact shape.
  test("AC-2: blanking a multiline flow scalar does not erase the step that follows it", () => {
    // The continuation's indent is DERIVED, not decorative. The overrun's width
    // is exactly the whitespace the transform strips, so the fixture is only
    // discriminating when that width carries past the following line's `>$(`.
    // Measured at ten spaces, the overrun eats `- r` and leaves `un: echo
    // >$(psql …` — still a redirection with an unreadable target, so the
    // advisory survives and the fixture passes under BOTH orderings. That is
    // the vacuity this suite exists to refuse, and it was caught by running the
    // wrong ordering as a mutant rather than by reading the code.
    const SURVIVOR_BODY = "echo >$(psql -qAt other";
    const survivorStep = `      - run: ${SURVIVOR_BODY}`;
    const continuationIndent = " ".repeat(survivorStep.indexOf(">$(") + 4);
    const source = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      '      - run: "PG=psql; \\',
      `${continuationIndent}$PG -qAt mydb"`,
      survivorStep,
      "",
    ].join("\n");
    const survivorLine = source.split("\n").indexOf(survivorStep) + 1;
    premiseHolds(
      "the flow scalar carries a physical continuation, which is the only shape whose transform removes bytes",
      /\\\n[ \t]+/.test(source),
    );
    premiseHolds(
      "the stripped width reaches PAST the following step's substitution opener, so a mis-ordered blank destroys the finding rather than merely nicking the line",
      continuationIndent.length > survivorStep.indexOf(">$("),
    );
    // The WHOLE hit set, not just the survivor. The flow scalar itself now
    // reports too — its binding is read through the decoded value, which is the
    // declared limit this arc retires — and asserting only the survivor would
    // let that finding appear, vanish, or move without the test noticing.
    // Under the mis-ordered blank the survivor is the hit that disappears,
    // which is what makes the full-set assertion discriminating rather than
    // merely stricter.
    expect(
      scanShellIndirection(source, WORKFLOW_FILE).map((hit) => ({
        line: hit.line,
        text: hit.text,
      })),
    ).toEqual([
      { line: survivorLine, text: "$(psql -qAt other" },
      {
        line: source.split("\n").findIndex((line) => line.includes('- run: "PG=')) + 1,
        text: "PG=psql; $PG -qAt mydb",
      },
    ]);
  });

  // The channel fires on CONTENT, never on quoting. This is what keeps correct
  // authoring quiet, and it is the assertion that stops the repair from turning
  // every quoted scalar in the corpus into an advisory.
  test("AC-2: a benign quoted scalar draws no advisory", () => {
    expect(scanShellIndirection(stepScalar("run", '"echo hello"'), WORKFLOW_FILE)).toEqual([]);
  });

  // ONE SCALAR, ONE READING. This channel has arms that read the raw source
  // LINES (the `githubEnvWrite` route, the here-string text route, interpreter
  // positionals) alongside arms that read the LEXED words. Blanking only the
  // lexer's input leaves the raw-line arms still looking at the quoted scalar,
  // so a scalar the re-entry already reported gets reported a second time by a
  // line arm — same line, same scalar, two hits, where the plain spelling of
  // the identical body yields one.
  //
  // Loud rather than silent, so not the dangerous direction, but wrong twice
  // over: a duplicate is a finding a reader has to reconcile, and `line` and
  // `text` are both fields the AC-5 digest covers, so it would move the
  // corpus finding set if any such scalar existed in it.
  //
  // The expectation is DERIVED from the plain spelling rather than written
  // down: whatever the channel reports for the unquoted body is what it must
  // report for the quoted ones, since quoting is not supposed to change what
  // the scanner sees.
  test.each([
    ["SINGLE-quoted", (body: string) => `'${body}'`],
    ["DOUBLE-quoted", (body: string) => `"${body}"`],
  ])("AC-2: a %s scalar is reported ONCE, not once per reading route", (_label, quote) => {
    const body = "echo PSQL=psql >> $GITHUB_ENV";
    const plainCount = scanShellIndirection(stepScalar("run", body), WORKFLOW_FILE).length;
    premiseHolds(
      "the plain spelling of this body really is reported, so the parity assertion is not comparing two zeros",
      plainCount === 1,
    );
    expect(scanShellIndirection(stepScalar("run", quote(body)), WORKFLOW_FILE)).toHaveLength(
      plainCount,
    );
  });

  // ANCHOR PARITY. A quoted scalar and the plain spelling of the same body must
  // report on the SAME line, because quoting is not supposed to change where the
  // scanner thinks the command is.
  //
  // Two anchor rules meet here and could disagree. A MAPPING VALUE anchors to
  // its key's line; a SEQUENCE ITEM has no key of its own, so it anchors to its
  // own starting line — and anchoring a sequence item to the containing `args:`
  // key would put the quoted spelling one line above the plain spelling of the
  // identical item. The `args:` block-sequence shape is the fixture that can
  // tell them apart, because its key and its item are on different lines.
  //
  // The expectation is DERIVED from the plain spelling in every row, so this
  // asserts agreement rather than a remembered line number.
  test.each([
    [
      "a block-SEQUENCE item, where the key and the item are on different lines",
      (scalar: string) =>
        [
          "name: x",
          "on:",
          "  push:",
          "jobs:",
          "  x:",
          "    steps:",
          "      - uses: docker://alpine",
          "        with:",
          "          args:",
          `            - ${scalar}`,
          "",
        ].join("\n"),
    ],
    [
      "a MAPPING value, where the key and the scalar share a line",
      (scalar: string) => withScalar("args", scalar),
    ],
  ])("AC-2: quoting does not move the reported line — %s", (_label, build) => {
    const body = CANONICAL_BODY;
    const lineFor = (scalar: string) =>
      scanShellIndirection(build(scalar), WORKFLOW_FILE).map((hit) => hit.line);
    const plain = lineFor(body);
    premiseHolds(
      "the plain spelling reports exactly one advisory, so the parity rows below are not all comparing empties",
      plain.length === 1,
    );
    expect({ single: lineFor(`'${body}'`), double: lineFor(`"${body}"`) }).toEqual({
      single: plain,
      double: plain,
    });
  });

  // SCOPE BOUNDARY: only EXECUTABLE keys are blanked, and a non-executable key
  // is left exactly as it was.
  //
  // Found by mutating the key set rather than by reading the code: widening it
  // to every key passed all 1040 tests. That mutant is not equivalent, and its
  // difference is the reason this test exists — under it a quoted value beneath
  // a NON-executable key starts reporting its DECODED text instead of the raw
  // line it appears on, and one shape that reports nothing today starts
  // reporting. `text` is a field the AC-5 finding-set digest covers, so a silent
  // change there moves the corpus digest.
  //
  // Whether decoding those values would be BETTER recall is a separate question
  // and a much larger change: this channel runs over every tracked `.yml`, not
  // only workflows, so widening the key set reaches ordinary configuration
  // files. That is out of this arc's fence, and pinning the boundary is what
  // keeps it from drifting there one commit at a time.
  test("a quoted value under a NON-executable key is not blanked and not decoded", () => {
    const body = "echo PSQL=psql >> $GITHUB_ENV";
    const quotedLine = `note: "${body}"`;
    const plainLine = `note: ${body}`;
    const textsFor = (line: string) =>
      scanShellIndirection(`${line}\n`, WORKFLOW_FILE).map((hit) => hit.text);

    premiseHolds(
      "the plain spelling reports, so the quoted row below is not asserting against a channel that is silent here",
      textsFor(plainLine).length === 1,
    );
    // The RAW line, quotes and key included — the same shape the plain spelling
    // reports, which is what "untouched" means for this channel. Under the
    // widened key set this is the decoded `echo PSQL=psql >> $GITHUB_ENV`
    // instead, with the key and the quotes gone.
    expect(textsFor(quotedLine)).toEqual([quotedLine]);
  });

  test("a quoted value under a non-executable key gains no NEW reading", () => {
    // The other direction of the same boundary. This shape reports nothing
    // today; the widened key set makes it report, which is a behaviour change
    // to keys this arc does not own.
    const source = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      "      - uses: a/b",
      "        with:",
      '          cmd: "read -r PG <<< psql"',
      "",
    ].join("\n");
    expect(scanShellIndirection(source, WORKFLOW_FILE)).toEqual([]);
  });

  // A CYCLIC document must not take the collector down with it.
  //
  // The scalar collector walks sequence items recursively and resolves aliases,
  // so `args: &c [ …, *c ]` is a cycle: resolving the alias yields the sequence
  // that contains it. Without a guard the walk re-enters forever and the whole
  // call dies with `Maximum call stack size exceeded`.
  //
  // That is worse than it first looks, and it is why this is a fix rather than a
  // documented limit. `scanShellIndirection` is called per file by the census
  // walk, so a throw here does not merely lose THIS file's findings — it aborts
  // the walk and loses every other file's too. "Correct or signalled, never
  // silently wrong" is not satisfied by a stack overflow that discards unrelated
  // results on its way out.
  //
  // Introduced by this arc, and the isolation says so: `scanWorkflowSource`
  // parsed YAML before this arc and returns cleanly on the same input; the
  // channel that throws is the one whose YAML parse this arc added.
  test("AC-2: a self-referential sequence does not overflow the collector", () => {
    const source = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  x:",
      "    steps:",
      "      - uses: docker://alpine",
      "        with:",
      "          args: &cycle",
      '            - "echo hi"',
      "            - *cycle",
      "",
    ].join("\n");
    premiseHolds(
      "the fixture really does alias its own sequence, which is the only shape that can re-enter the walk",
      /&cycle/.test(source) && /\*cycle/.test(source),
    );
    // The SITE channel already survives this and is the control: if it started
    // throwing too, the fixture would be wrong rather than the collector.
    expect(() => scanWorkflowSource(source, WORKFLOW_FILE)).not.toThrow();
    expect(() => scanShellIndirection(source, WORKFLOW_FILE)).not.toThrow();
  });

  // The cycle guard is scoped to SEQUENCES, and this is the property that scoping
  // buys. One quoted scalar aliased from two `run:` keys is two real call sites,
  // so it must report at BOTH anchor lines. A node-wide dedupe would terminate
  // just as well and silently drop the second — a tempting "simplification" that
  // nothing else here would catch.
  test("AC-2: one scalar aliased from two keys reports at BOTH anchors", () => {
    const source = [
      "anchors:",
      '  cmd: &c "echo >$(psql -qAt mydb"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: *c",
      "      - run: *c",
      "",
    ].join("\n");
    const runLines = source
      .split("\n")
      .map((line, at) => (line.includes("- run: *c") ? at + 1 : 0))
      .filter(Boolean);
    premiseHolds(
      "the fixture really aliases ONE scalar from TWO distinct run: keys on different lines",
      runLines.length === 2 && runLines[0] !== runLines[1],
    );
    expect(scanShellIndirection(source, WORKFLOW_FILE).map((hit) => hit.line)).toEqual(runLines);
  });

  // The new code is gated on the YAML extension — the same predicate that
  // already selects the continuation transform — so a `.sh` file never reaches
  // it. Verified against the tree BEFORE the change and re-verified after,
  // rather than argued from the gate's source. This is what pins the declared
  // limit at the quote-concatenated block as out of reach of this change.
  test("AC-2: a `.sh` file is untouched by the YAML path", () => {
    const source = `${CANONICAL_BODY}\n`;
    expect(
      scanShellIndirection(source, "x.sh").map((hit) => ({ line: hit.line, text: hit.text })),
    ).toEqual([{ line: 1, text: CANONICAL_TARGET }]);
  });

  // The blanker writes over [start, end), and `end` is EXCLUSIVE. Every other
  // fixture here ends its quoted scalar at a line break, and the blanker refuses
  // to overwrite a newline, so a one-past-the-end bound is invisible to all of
  // them — they would pass unchanged if the bound were wrong. This is the shape
  // that separates: a flow mapping, where the byte at `end` is the comma, and a
  // shell assignment flush against it. Blank that comma and `PSQL=/opt/psql`
  // becomes a word of its own, which the lexer then reads as an indirection —
  // a FABRICATED hit, the forbidden direction this arc exists to close.
  test("AC-2: the blank stops before `end`, so a flush separator is not consumed", () => {
    const source = [
      "jobs:",
      "  x:",
      "    steps:",
      '      - {run: "echo hi",PSQL=/opt/psql}',
      "",
    ].join("\n");
    const marker = '"echo hi"';
    const afterClosingQuote = source[source.indexOf(marker) + marker.length];
    premiseHolds(
      "the quoted scalar is followed by a NON-newline byte — the only shape a one-past-the-end blank can be seen through",
      afterClosingQuote !== "\n" && afterClosingQuote !== undefined,
    );
    expect(scanShellIndirection(source, WORKFLOW_FILE)).toEqual([]);
  });
});

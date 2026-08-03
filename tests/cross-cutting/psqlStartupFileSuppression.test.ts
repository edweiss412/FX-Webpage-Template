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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

import {
  EXEMPTION_MARKER,
  argvSuppressesStartupFiles,
  collectPsqlUsage,
  scanBinaryIndirection,
  scanSource,
  tokenSuppressesStartupFiles,
} from "./psqlStartupFiles/scan";

const REPO_ROOT = join(__dirname, "..", "..");

/** Real files used as live probes. Both are load-bearing: the first is a
 * separate-`"-X"` site, the second is the combined-cluster spelling that a naive
 * `args.includes("-X")` guard reports as unprotected. */
const SEPARATE_X_SITE = "tests/db/show_share_tokens.test.ts";
const COMBINED_CLUSTER_SITE = "tests/db/crew-rpc-lifecycle-guard-meta.test.ts";
const GUARD_MODULE = "tests/cross-cutting/psqlStartupFiles/scan.ts";

function sitesIn(source: string, file: string) {
  return scanSource(source, file);
}

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
  const usage = collectPsqlUsage(REPO_ROOT);

  test("the walk is not vacuous — it finds the known psql surface", () => {
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
  });

  test("every psql invocation suppresses startup files (or is explicitly exempt)", () => {
    const unprotected = usage.sites
      .filter((s) => !s.suppressesStartupFiles && s.exemptReason === null)
      .map((s) => `${s.file}:${s.line} [${s.form}] ${s.tokens.join(" ")}`);
    expect(
      unprotected,
      `psql call sites that read startup files (add "-X", or an inline\n` +
        `\`${EXEMPTION_MARKER} <reason>\` comment):\n  ${unprotected.join("\n  ")}`,
    ).toEqual([]);
  });

  test("no call site hides the binary name behind an identifier", () => {
    const hits = usage.indirections.map((h) => `${h.file}:${h.line} ${h.text}`);
    expect(
      hits,
      `psql must be passed as a literal argv[0] so this guard can see the flags:\n  ${hits.join("\n  ")}`,
    ).toEqual([]);
  });

  test("the walk read every directory — an unreadable path is an incomplete census", () => {
    expect(
      usage.unreadable,
      `the psql census is INCOMPLETE — these paths could not be read, so any call site under ` +
        `them was silently omitted:\n  ${usage.unreadable.join("\n  ")}`,
    ).toEqual([]);
  });

  test("every exemption carries a reason", () => {
    for (const site of usage.sites.filter((s) => s.exemptReason !== null)) {
      expect(site.exemptReason!.length, `${site.file}:${site.line}`).toBeGreaterThan(10);
    }
  });
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

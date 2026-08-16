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

import { premise, premiseHolds } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";

import {
  EXEMPTION_MARKER,
  analyzeNaming,
  scanShellIndirection,
  argvSuppressesStartupFiles,
  collectPsqlUsage,
  rootSkipNamesFromGitignore,
  scanBinaryIndirection,
  scanSource,
  scanWorkflowIndirection,
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
    // Derived cover, not an enumeration: any future `scan*()` analyzer added to
    // the loop is covered by construction, and a bare call reds this row.
    const source = stripCommentsForFile(
      readFileSync(join(REPO_ROOT, GUARD_MODULE), "utf8"),
      GUARD_MODULE,
    );
    const start = source.indexOf("export function collectPsqlUsage(");
    premiseHolds("collectPsqlUsage is found in the guard module", start >= 0);
    const end = source.indexOf("\n}", start);
    premiseHolds("collectPsqlUsage's body terminates", end > start);
    const body = source.slice(start, end);

    // Keyed on the ARGUMENTS, not the callee's name. A per-file analyzer is
    // definitionally something handed this file's `source` and its `rel` path,
    // so `(source, rel)` identifies the whole class — including a future
    // analyzer called `inspectFoo` or `lintBar` that a `scan*(` pattern would
    // wave straight through.
    const analyzerCalls = body.match(/[A-Za-z_$][\w$]*\(source, rel\)/g) ?? [];
    const wrapped =
      body.match(/analyzeNaming\(\s*rel,\s*\(\)\s*=>\s*[A-Za-z_$][\w$]*\(source, rel\)\)/g) ?? [];
    premise("collectPsqlUsage's body contains analyzer calls to cover", analyzerCalls.length, 0);
    expect(wrapped.length).toBe(analyzerCalls.length);
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
  const TRACKED_SOURCE_ROOTS = ["app", "components", "lib", "scripts", "tests", "supabase"];

  test.each(PRE_ARC_LITERALS)("subsumes the pre-arc literal %s", (name) => {
    expect(derived().has(name)).toBe(true);
  });

  test.each(NEXT_VARIANTS)("contains the build-output variant %s", (name) => {
    expect(derived().has(name)).toBe(true);
  });

  // The §4.2 documented limit made executable: a TRACKED root directory named
  // by a plain-name row would be newly skipped. This is the stays-quiet pin.
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

  // The QUOTED form is a documented limit, pinned here so the limit is a fact
  // rather than a claim: inside double quotes bash keeps a backslash that
  // precedes an ordinary character, so the word really is the Windows path —
  // but this lexer strips it. Recorded in the scan.ts residual-limits list and
  // in DEFERRED.md; no such path exists in this tree, which is Linux-only.
  test("a QUOTED backslash path in shell text is a KNOWN miss", () => {
    expect(sitesIn('"C:\\pg\\bin\\psql.exe" -qAt mydb\n', "x.sh")).toEqual([]);
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

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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

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
      `execFileSync("psql", [dsn, "-X", "-v", "ON_ERROR_STOP=1", "-At"]);`,
      "tests/x.test.ts",
    );
    expect(sites[0]!.suppressesStartupFiles).toBe(true);
  });

  test("the combined -qAtX cluster satisfies the contract (naive includes() trap)", () => {
    const source = `execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAtX"]);`;
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
      `execFileSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", ...args]);`,
      "tests/x.ts",
    );
    expect(withX[0]!.suppressesStartupFiles).toBe(true);
    expect(withX[0]!.hasDynamicTokens).toBe(true);

    const withoutX = sitesIn(
      `execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", ...args]);`,
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

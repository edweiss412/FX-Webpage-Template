import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { classifySpawnResult, runCli, type CliDeps } from "../../scripts/spec-lint";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs"); // .bin/tsx is a shell wrapper — not node-executable
const FIX = "tests/specLint/fixtures/docs/superpowers/specs";
const T = 30000;
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

function cli(args: string[], cwd: string = ROOT) {
  const r = spawnSync(process.execPath, [TSX, "scripts/spec-lint.ts", ...args], {
    cwd,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const EVIL = ROOT + "-evil";
const ESC_LINK = join(ROOT, ".tmp-spec-lint-esc");
const NESTED = join(ROOT, ".tmp-spec-lint-nested");
const UNREADABLE = join(ROOT, ".tmp-spec-lint-unreadable.md");

beforeAll(() => {
  mkdirSync(join(EVIL, "docs/superpowers/specs"), { recursive: true });
  writeFileSync(join(EVIL, "docs/superpowers/specs/x.md"), "## Resolved scope\n\nevil\n");
  if (!existsSync(ESC_LINK)) symlinkSync(EVIL, ESC_LINK);
  mkdirSync(join(NESTED, "docs/superpowers/specs"), { recursive: true });
  writeFileSync(
    join(NESTED, "docs/superpowers/specs/inner.md"),
    "## Resolved scope\n\nCites `lib/specLint/types.ts:1` from a nested repo.\n",
  );
  spawnSync("git", ["init", "-q", NESTED], { encoding: "utf8" });
  writeFileSync(UNREADABLE, "## Resolved scope\n\nx\n");
});

afterAll(() => {
  rmSync(EVIL, { recursive: true, force: true });
  rmSync(ESC_LINK, { force: true });
  rmSync(NESTED, { recursive: true, force: true });
  chmodSync(join(ROOT, "tests/specLint/fixtures/cited/chmod.txt"), 0o644);
  rmSync(UNREADABLE, { force: true });
});

describe("spec-lint CLI — exit-code matrix (spec §2/§8)", () => {
  it(
    "failing.md → exit 1 with both hard findings",
    () => {
      const r = cli([`${FIX}/failing.md`]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("CITATION_FILE_MISSING");
      expect(r.stdout).toContain("COPY_EM_DASH");
      expect(r.stdout).toContain("2 hard, 0 advisory");
    },
    T,
  );

  it(
    "clean.md → exit 0",
    () => {
      const r = cli([`${FIX}/clean.md`]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("0 hard, 0 advisory");
    },
    T,
  );

  it(
    "advisory-only.md → exit 0, summary counts advisories but never inventory",
    () => {
      const r = cli([`${FIX}/advisory-only.md`]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("0 hard, 1 advisory");
    },
    T,
  );

  it(
    "repo-escape via lexical-prefix sibling → exit 2 (segment-boundary containment)",
    () => {
      const r = cli([join(EVIL, "docs/superpowers/specs/x.md")]);
      expect(r.code).toBe(2);
    },
    T,
  );

  it(
    "repo-escape via symlinked parent dir → exit 2",
    () => {
      const r = cli([join(ESC_LINK, "docs/superpowers/specs/x.md")]);
      expect(r.code).toBe(2);
    },
    T,
  );

  it(
    "non-.md → 2; directory → 2; symlink doc → 2",
    () => {
      expect(cli(["package.json"]).code).toBe(2);
      expect(cli(["docs", "--kind", "spec"]).code).toBe(2);
      expect(cli(["tests/specLint/fixtures/cited/symlink.md", "--kind", "spec"]).code).toBe(2);
    },
    T,
  );

  it(
    "zero positionals → 2; two positionals → 2; unknown flag → 2",
    () => {
      expect(cli([]).code).toBe(2);
      expect(cli([`${FIX}/clean.md`, `${FIX}/failing.md`]).code).toBe(2);
      expect(cli([`${FIX}/clean.md`, "--wat"]).code).toBe(2);
    },
    T,
  );

  it(
    "duplicate --kind → 2; duplicate --json → 2; bad --kind value → 2; terminal --kind → 2",
    () => {
      expect(cli([`${FIX}/clean.md`, "--kind", "spec", "--kind", "spec"]).code).toBe(2);
      expect(cli([`${FIX}/clean.md`, "--json", "--json"]).code).toBe(2);
      expect(cli([`${FIX}/clean.md`, "--kind", "nope"]).code).toBe(2);
      expect(cli([`${FIX}/clean.md`, "--kind"]).code).toBe(2);
    },
    T,
  );

  it(
    '--kind --json → 2 and --json is still a FLAG: stderr is {"error": …} JSON',
    () => {
      const r = cli([`${FIX}/clean.md`, "--kind", "--json"]);
      expect(r.code).toBe(2);
      const parsed = JSON.parse(r.stderr) as { error: string };
      expect(typeof parsed.error).toBe("string");
    },
    T,
  );

  it(
    'usage error under --json → stderr {"error": …}',
    () => {
      const r = cli(["--json"]);
      expect(r.code).toBe(2);
      expect(() => JSON.parse(r.stderr)).not.toThrow();
    },
    T,
  );

  it(
    "kind inference: /plans/ → plan; both segments → 2 naming --kind; neither → 2 naming --kind",
    () => {
      const plan = cli([
        "tests/specLint/fixtures/docs/superpowers/plans/plan-under-plans.md",
        "--json",
      ]);
      expect(plan.code).toBe(0);
      const parsed = JSON.parse(plan.stdout) as { kind: string; kindSource: string };
      expect(parsed.kind).toBe("plan");
      expect(parsed.kindSource).toBe("inferred");

      const both = cli(["tests/specLint/fixtures/both-segments/specs/plans/x.md"]);
      expect(both.code).toBe(2);
      expect(both.stderr).toContain("--kind");

      const neither = cli(["AGENTS.md"]);
      expect(neither.code).toBe(2);
      expect(neither.stderr).toContain("--kind");
    },
    T,
  );

  it(
    "explicit --kind plan on a specs path wins → 0, kindSource explicit",
    () => {
      const r = cli([`${FIX}/clean.md`, "--kind", "plan", "--json"]);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout) as { kind: string; kindSource: string };
      expect(parsed.kind).toBe("plan");
      expect(parsed.kindSource).toBe("explicit");
    },
    T,
  );

  it.skipIf(isRoot)(
    "unreadable linted doc → 2",
    () => {
      chmodSync(UNREADABLE, 0o000);
      try {
        expect(cli([UNREADABLE, "--kind", "spec"]).code).toBe(2);
      } finally {
        chmodSync(UNREADABLE, 0o644);
      }
    },
    T,
  );

  it(
    "nested-repo doc resolves against the OUTER root (root discovered from CLI cwd)",
    () => {
      const r = cli([join(NESTED, "docs/superpowers/specs/inner.md")]);
      expect(r.code).toBe(0);
    },
    T,
  );
});

describe("spec-lint CLI — report + encoding (spec §2/§8)", () => {
  it(
    "text report: header, kind line, INVENTORY after findings, summary last",
    () => {
      const r = cli([`${FIX}/advisory-only.md`]);
      expect(r.stdout).toContain(`spec:lint ${FIX}/advisory-only.md`);
      expect(r.stdout).toContain("kind: spec (inferred)");
      const iInv = r.stdout.indexOf("INVENTORY");
      const iCopy = r.stdout.indexOf("COPY_STRAIGHT_APOSTROPHE");
      const iSum = r.stdout.indexOf("summary:");
      expect(iCopy).toBeGreaterThanOrEqual(0);
      expect(iInv).toBeGreaterThan(iCopy);
      expect(iSum).toBeGreaterThan(iInv);
    },
    T,
  );

  it(
    "--json emits the LintResult VERBATIM (deep-equal against fully-constructed expected)",
    () => {
      const line = `say "it's fine" with 3 checks`;
      const r = cli([`${FIX}/advisory-only.md`, "--json"]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({
        doc: `${FIX}/advisory-only.md`,
        kind: "spec",
        kindSource: "inferred",
        findings: [
          {
            check: "copy",
            code: "COPY_STRAIGHT_APOSTROPHE",
            severity: "advisory",
            docLine: 3,
            column: 8,
            message: "straight apostrophe in quoted copy",
          },
        ],
        inventory: [
          {
            raw: "3",
            occurrences: [
              {
                docLine: 3,
                column: 22,
                snippet: line.slice(Math.max(0, 22 - 41), 22 + 40),
              },
            ],
          },
        ],
      });
    },
    T,
  );

  it(
    "astral doc: finding column in UTF-16 units via --json",
    () => {
      const r = cli([`${FIX}/astral.md`, "--json"]);
      expect(r.code).toBe(1);
      const parsed = JSON.parse(r.stdout) as {
        findings: { code: string; docLine: number; column: number }[];
      };
      expect(parsed.findings).toEqual([
        expect.objectContaining({ code: "COPY_EM_DASH", docLine: 3, column: 18 }),
      ]);
    },
    T,
  );

  it(
    "invalid-UTF-8 doc lints (replacement decode); cited invalid-UTF-8 file reads",
    () => {
      expect(cli([`${FIX}/invalid-utf8.md`]).code).toBe(0);
    },
    T,
  );

  it(
    "CRLF doc and CRLF cited file normalize through the real resolver",
    () => {
      expect(cli([`${FIX}/crlf.md`]).code).toBe(0);
    },
    T,
  );

  it(
    "EOF fixtures: last-line citations pass with and without trailing newline",
    () => {
      expect(cli([`${FIX}/eof.md`]).code).toBe(0);
    },
    T,
  );

  it(
    "cited tracked symlink → CITATION_UNREADABLE, exit 1",
    () => {
      const r = cli([`${FIX}/symlink-cite.md`]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("CITATION_UNREADABLE");
    },
    T,
  );

  it.skipIf(isRoot)(
    "chmod-000 cited file → CITATION_UNREADABLE",
    () => {
      const p = join(ROOT, "tests/specLint/fixtures/cited/chmod.txt");
      chmodSync(p, 0o000);
      try {
        const r = cli([`${FIX}/chmod-cite.md`]);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain("CITATION_UNREADABLE");
      } finally {
        chmodSync(p, 0o644);
      }
    },
    T,
  );
});

describe("spec-lint CLI — citation intent through the real adapter (spec §6 wiring)", () => {
  const INTENT_DOC =
    "tests/specLint/fixtures/citationIntent/docs/superpowers/plans/intent-absent.md";

  it(
    "ABSENT advisory reaches the text report with its relocation detail, at the derived coordinates",
    () => {
      // Coordinates derived from the committed fixture's own bytes, never pasted
      // from a run: the citation's line, and the column just past its opening
      // backtick.
      const text = readFileSync(join(ROOT, INTENT_DOC), "utf8");
      const lines = text.split("\n");
      const CITE = "`lib/specLint/emDash.ts:1`";
      const docLine = lines.findIndex((l) => l.includes(CITE)) + 1;
      const column = lines[docLine - 1]!.indexOf(CITE) + 2;
      expect(docLine).toBeGreaterThan(0);

      const r = cli([INTENT_DOC]);
      expect(r.code).toBe(0); // advisory only
      expect(r.stdout).toContain(
        `ADVISORY CITATION_SYMBOL_ABSENT ${docLine}:${column} same-line identifiers absent from lib/specLint/emDash.ts`,
      );
      expect(r.stdout).toContain(
        "detail: enclosing: (none) · identifiers: relocationHints · found in: lib/specLint/citationIntent.ts",
      );
    },
    T,
  );
});

describe("spec-lint CLI — red-contract statics through the real adapter (spec §6 wiring)", () => {
  const RC_DOC =
    "tests/specLint/fixtures/redContract/docs/superpowers/plans/red-contract-static.md";

  it(
    "a hard §4.3 code and a gate code both reach the text report, with the excluded span silent",
    () => {
      const text = readFileSync(join(ROOT, RC_DOC), "utf8");
      const lines = text.split("\n");
      const TARGET = "`zzz/gone.ts:1`";
      const markerLine = lines.findIndex((l) => l.includes("red-target=")) + 1;
      const column = lines[markerLine - 1]!.indexOf(TARGET) + 2;
      const gateLine = lines.findIndex((l) => l.startsWith("<!-- gate:")) + 1;

      const r = cli([RC_DOC]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain(`FAIL RED_TARGET_INVALID ${markerLine}:${column}`);
      expect(r.stdout).toContain(`ADVISORY GATE_UNPROBED ${gateLine}:1`);
      // The exclusion at adapter level: the same span would otherwise be a
      // missing-file citation, and its validation replaces that finding exactly.
      expect(r.stdout).not.toContain("CITATION_FILE_MISSING");
      expect(r.stdout).toContain("1 hard, 1 advisory");
    },
    T,
  );
});

describe("spec-lint CLI — --exec-red execution mode (spec §4.4)", () => {
  const EXEC = "tests/specLint/fixtures/redExec/docs/superpowers/plans";
  const SCRATCH = join(ROOT, ".tmp-spec-lint-exec-scratch");

  const execCli = (args: string[], env: Record<string, string> = {}, cwd: string = ROOT) => {
    // Absolute script path: this helper deliberately launches from a
    // SUBDIRECTORY in one case, where a relative script path would not resolve.
    const r = spawnSync(process.execPath, [TSX, join(ROOT, "scripts/spec-lint.ts"), ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, SPEC_LINT_TEST_SCRATCH: SCRATCH, ...env },
    });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  beforeAll(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    mkdirSync(SCRATCH, { recursive: true });
  });
  afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

  it(
    "--exec-red on a spec is a usage error; so is a duplicate flag",
    () => {
      expect(execCli([`${FIX}/clean.md`, "--exec-red"]).code).toBe(2);
      expect(execCli([`${EXEC}/exit1.md`, "--exec-red", "--exec-red"]).code).toBe(2);
    },
    T,
  );

  it(
    "a live `exit 0` marker is hard RED_ALREADY_GREEN; `exit 1` is red observed",
    () => {
      const green = execCli([`${EXEC}/exit0.md`, "--exec-red"]);
      expect(green.code).toBe(1);
      expect(green.stdout).toContain("RED_ALREADY_GREEN");

      const red = execCli([`${EXEC}/exit1.md`, "--exec-red"]);
      expect(red.code).toBe(0);
      expect(red.stdout).toContain("0 hard, 0 advisory");
    },
    T,
  );

  it.each([126, 127])(
    "exit %i is an advisory RED_EXEC_ERROR (unrunnable proves nothing about redness)",
    (code) => {
      const r = execCli([`${EXEC}/exit${code}.md`, "--exec-red"]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain(`RED_EXEC_ERROR`);
      expect(r.stdout).toContain(`exit ${code}`);
    },
    T,
  );

  it(
    "the command runs under `sh -c`: a shell arithmetic expansion resolves to 127",
    () => {
      // Without a shell, `exit $((125+2))` is not a runnable program at all.
      const r = execCli([`${EXEC}/shell-arith.md`, "--exec-red"]);
      expect(r.stdout).toContain("exit 127");
    },
    T,
  );

  it(
    "a self-killed command is an advisory RED_EXEC_ERROR naming the signal",
    () => {
      const r = execCli([`${EXEC}/kill-term.md`, "--exec-red"]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("RED_EXEC_ERROR");
      expect(r.stdout).toContain("SIGTERM");
    },
    T,
  );

  it(
    "stderr is carried as a tail trimmed to 200 characters",
    () => {
      const r = execCli([`${EXEC}/long-stderr.md`, "--exec-red"]);
      const detail = r.stdout.split("\n").find((l) => l.includes("stderr: "))!;
      const tail = detail.slice(detail.indexOf("stderr: ") + "stderr: ".length);
      expect(tail).toHaveLength(200);
    },
    T,
  );

  it(
    "the ceiling is enforced through the env seam: a sleeping command times out",
    () => {
      const r = execCli([`${EXEC}/sleep.md`, "--exec-red"], { SPEC_LINT_EXEC_TIMEOUT_SECS: "1" });
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("RED_EXEC_TIMEOUT");
    },
    T,
  );

  it(
    "commands run with cwd = repo ROOT, even when the CLI is launched from a subdirectory",
    () => {
      const out = join(SCRATCH, "cwd.txt");
      rmSync(out, { force: true });
      const r = execCli([join(ROOT, `${EXEC}/cwd.md`), "--exec-red"], {}, join(ROOT, "tests"));
      expect(r.code).toBe(0); // exit 1 → red observed
      expect(readFileSync(out, "utf8").trim()).toBe(ROOT);
    },
    T,
  );

  it.each(["0", "-1", "abc", ""])(
    "SPEC_LINT_EXEC_TIMEOUT_SECS=%j is a usage error: nothing linted, nothing executed",
    (value) => {
      const sentinel = join(SCRATCH, "sentinel");
      rmSync(sentinel, { force: true });
      const r = execCli([`${EXEC}/sentinel.md`, "--exec-red"], {
        SPEC_LINT_EXEC_TIMEOUT_SECS: value,
      });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("SPEC_LINT_EXEC_TIMEOUT_SECS");
      expect(r.stdout).toBe(""); // nothing linted
      expect(existsSync(sentinel)).toBe(false); // nothing executed
    },
    T,
  );

  it(
    "a plan whose only live markers sit outside a red-contract region executes nothing",
    () => {
      const never = join(SCRATCH, "never");
      rmSync(never, { force: true });
      const r = execCli([`${EXEC}/outside-region.md`, "--exec-red"]);
      expect(r.code).toBe(0);
      expect(existsSync(never)).toBe(false);
    },
    T,
  );
});

describe("classifySpawnResult — error-first precedence (spec §4.4)", () => {
  it("an ETIMEDOUT error wins over a zero status (the round-4 hybrid)", () => {
    expect(classifySpawnResult({ status: 0, signal: null, error: { code: "ETIMEDOUT" } })).toEqual({
      kind: "timeout",
    });
  });

  it("any other error is a spawn failure, whatever the status says", () => {
    expect(
      classifySpawnResult({
        status: null,
        signal: null,
        error: { code: "ENOENT", message: "spawn sh ENOENT" },
      }),
    ).toEqual({ kind: "spawn-error", message: "spawn sh ENOENT" });
  });

  it("a signal beats a status; a plain status is the exit code", () => {
    expect(classifySpawnResult({ status: null, signal: "SIGTERM" })).toEqual({
      kind: "signal",
      signal: "SIGTERM",
    });
    expect(classifySpawnResult({ status: 0, signal: null })).toEqual({ kind: "exit", code: 0 });
    expect(classifySpawnResult({ status: 3, signal: null })).toEqual({ kind: "exit", code: 3 });
  });

  it("no status, no signal and no error is a spawn failure — never a red observation", () => {
    expect(classifySpawnResult({ status: null, signal: null })).toEqual({
      kind: "spawn-error",
      message: "no exit status",
    });
  });
});

// ---- seam-level (no subprocess): infra faults + containment via injected deps ----

interface MemOpts {
  files?: Record<string, string>;
  spawnResult?: {
    status: number | null;
    signal: string | null;
    stderr?: string;
    stdout?: string;
    error?: { code?: string; message?: string };
  };
  /** Per-(command, mode) override; falls back to `spawnResult`. */
  spawnFor?: (
    command: string,
    mode: "parse" | "exec",
  ) =>
    | {
        status: number | null;
        signal: string | null;
        stderr?: string;
        stdout?: string;
        error?: { code?: string; message?: string };
      }
    | undefined;
  tracked?: string[];
  realpathOverride?: Record<string, string>;
  repoRootThrows?: boolean;
  listTrackedThrows?: boolean;
  readThrows?: Record<string, { code?: string }>;
}

function memDeps(opts: MemOpts = {}) {
  const files = opts.files ?? {
    "/repo/docs/superpowers/specs/x.md": "## Resolved scope\n\nCites `lib/a.ts:1` ok.\n",
    "/repo/lib/a.ts": "one\ntwo\n",
  };
  const calls = {
    repoRoot: 0,
    reads: [] as string[],
    spawns: [] as { command: string; cwd: string; timeoutMs: number; mode: "parse" | "exec" }[],
  };
  const deps: CliDeps = {
    cwd: () => "/repo",
    repoRoot: () => {
      calls.repoRoot++;
      if (opts.repoRootThrows) throw new Error("not a git repo");
      return "/repo";
    },
    listTrackedFiles: () => {
      if (opts.listTrackedThrows) throw new Error("git ls-files failed");
      return opts.tracked ?? ["lib/a.ts"];
    },
    lstatKind: (p) => (files[p] !== undefined || opts.readThrows?.[p] ? "file" : "missing"),
    readFileBytes: (p) => {
      calls.reads.push(p);
      const t = opts.readThrows?.[p];
      if (t) {
        const e = new Error(`read failed: ${p}`) as Error & { code?: string };
        if (t.code !== undefined) e.code = t.code;
        throw e;
      }
      const c = files[p];
      if (c === undefined) {
        const e = new Error("ENOENT") as Error & { code?: string };
        e.code = "ENOENT";
        throw e;
      }
      return Buffer.from(c, "utf8");
    },
    realpath: (p) => opts.realpathOverride?.[p] ?? p,
    spawn: (command, cwd, timeoutMs, mode) => {
      calls.spawns.push({ command, cwd, timeoutMs, mode });
      // Default: parse checks pass, red commands report red. A test that cares
      // about either overrides through `spawnFor`.
      const fallback =
        mode === "parse"
          ? { status: 0, signal: null }
          : (opts.spawnResult ?? { status: 1, signal: null });
      const r = opts.spawnFor?.(command, mode) ?? fallback;
      return {
        status: r.status,
        signal: r.signal,
        stderr: r.stderr ?? "",
        stdout: r.stdout ?? "",
        ...(r.error ? { error: r.error } : {}),
      };
    },
  };
  return { deps, calls };
}

const DOC = "docs/superpowers/specs/x.md";

describe("runCli — seam-level infra + containment (spec §2/§7, §1.1 item 11)", () => {
  it('repoRoot() throws → exit 2; with --json stderr is {"error": …}', () => {
    const a = runCli([DOC], memDeps({ repoRootThrows: true }).deps);
    expect(a.exitCode).toBe(2);
    const b = runCli([DOC, "--json"], memDeps({ repoRootThrows: true }).deps);
    expect(b.exitCode).toBe(2);
    expect(() => JSON.parse(b.stderr)).not.toThrow();
  });

  it("listTrackedFiles() throws → exit 2 (+ --json shape)", () => {
    const a = runCli([DOC], memDeps({ listTrackedThrows: true }).deps);
    expect(a.exitCode).toBe(2);
    const b = runCli([DOC, "--json"], memDeps({ listTrackedThrows: true }).deps);
    expect(JSON.parse(b.stderr)).toHaveProperty("error");
  });

  it("readFileBytes throws WITHOUT an fs code mid-lint → infra exit 2 (+ --json shape)", () => {
    const opts: MemOpts = { readThrows: { "/repo/lib/a.ts": {} } };
    const a = runCli([DOC], memDeps(opts).deps);
    expect(a.exitCode).toBe(2);
    const b = runCli([DOC, "--json"], memDeps(opts).deps);
    expect(JSON.parse(b.stderr)).toHaveProperty("error");
  });

  it("readFileBytes throws EACCES on a cited file → CITATION_UNREADABLE, lint completes, exit 1", () => {
    const r = runCli(
      [DOC, "--json"],
      memDeps({ readThrows: { "/repo/lib/a.ts": { code: "EACCES" } } }).deps,
    );
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.stdout) as { findings: { code: string }[] };
    expect(parsed.findings.map((f) => f.code)).toEqual(["CITATION_UNREADABLE"]);
  });

  it("cited file whose realpath escapes the repo → CITATION_UNREADABLE and NEVER read", () => {
    const { deps, calls } = memDeps({
      realpathOverride: { "/repo/lib/a.ts": "/outside/lib/a.ts" },
    });
    const r = runCli([DOC, "--json"], deps);
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.stdout) as { findings: { code: string }[] };
    expect(parsed.findings.map((f) => f.code)).toEqual(["CITATION_UNREADABLE"]);
    expect(calls.reads).not.toContain("/repo/lib/a.ts");
  });

  it("--exec-red spawns each planned command once, at the repo root", () => {
    const PLAN_DOC = "/repo/docs/superpowers/plans/p.md";
    const text = [
      "# Plan",
      "<!-- tasks: depth=2 red-contract -->",
      "## A",
      "<!-- task: red=`pnpm probe` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      "<!-- tasks: end -->",
      "",
    ].join("\n");
    const { deps, calls } = memDeps({ files: { [PLAN_DOC]: text }, tracked: ["lib/a.ts"] });
    const r = runCli(["docs/superpowers/plans/p.md", "--exec-red"], deps);
    expect(r.exitCode).toBe(0); // spy default status 1 → red observed
    expect(calls.spawns).toEqual([
      { command: "pnpm probe", cwd: "/repo", timeoutMs: 600_000, mode: "parse" },
      { command: "pnpm probe", cwd: "/repo", timeoutMs: 600_000, mode: "exec" },
    ]);
  });

  it("--exec-red executes NOTHING when the only live marker sits outside a contract region", () => {
    const PLAN_DOC = "/repo/docs/superpowers/plans/p.md";
    const text = [
      "# Plan",
      "<!-- tasks: depth=2 -->",
      "## A",
      "<!-- task: red=`pnpm never` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      "<!-- tasks: end -->",
      "",
    ].join("\n");
    const { deps, calls } = memDeps({ files: { [PLAN_DOC]: text }, tracked: ["lib/a.ts"] });
    const r = runCli(["docs/superpowers/plans/p.md", "--exec-red"], deps);
    expect(r.exitCode).toBe(0);
    // The PARSE pass is global over well-formed markers, so it still sees this
    // command; the EXECUTION population is the narrower owned-and-live one.
    expect(calls.spawns.filter((sp) => sp.mode === "exec")).toEqual([]);
  });

  it("root discovery happens EXACTLY once per invocation", () => {
    const { deps, calls } = memDeps();
    const r = runCli([DOC], deps);
    expect(r.exitCode).toBe(0);
    expect(calls.repoRoot).toBe(1);
  });
});

// ---- verdict-capability arms: real CLI (group 1) --------------------------

describe("spec-lint CLI — parse capability on the DEFAULT invocation (spec §3)", () => {
  const V = "tests/specLint/fixtures/redVerdict/docs/superpowers/plans";
  const SENTINEL = join(ROOT, ".tmp-parse-sentinel-redverdict");

  afterAll(() => rmSync(SENTINEL, { force: true }));

  const codesOf = (r: { stdout: string }): string[] =>
    (JSON.parse(r.stdout) as { findings: { code: string }[] }).findings.map((f) => f.code);

  it(
    "the mutation-site shape draws RED_UNPARSEABLE with NO --exec-red",
    () => {
      // The payoff moment is review-time linting, which never passes the flag.
      const r = cli([`${V}/unparseable-red.md`, "--json"]);
      expect(r.code).toBe(1);
      expect(codesOf(r)).toContain("RED_UNPARSEABLE");
    },
    T,
  );

  it(
    "the legacy prose red is a true positive of the same code",
    () => {
      const r = cli([`${V}/prose-red.md`, "--json"]);
      expect(r.code).toBe(1);
      expect(codesOf(r)).toContain("RED_UNPARSEABLE");
    },
    T,
  );

  it(
    "the same document read as a SPEC draws none of the new codes",
    () => {
      const r = cli([`${V}/unparseable-red.md`, "--kind", "spec", "--json"]);
      expect(codesOf(r)).not.toContain("RED_UNPARSEABLE");
    },
    T,
  );

  it(
    "a parseable plan stays clean",
    () => {
      const r = cli([`${V}/parseable.md`, "--json"]);
      expect(r.code).toBe(0);
      expect(codesOf(r)).toEqual([]);
    },
    T,
  );

  it(
    "a gate cmd= carrying the same shape draws GATE_CMD_UNPARSEABLE, not the red code",
    () => {
      const r = cli([`${V}/unparseable-gate.md`, "--json"]);
      expect(r.code).toBe(1);
      expect(codesOf(r)).toContain("GATE_CMD_UNPARSEABLE");
      expect(codesOf(r)).not.toContain("RED_UNPARSEABLE");
    },
    T,
  );

  it(
    "the parse pass is `sh -nc`, proven by a side effect that never happens",
    () => {
      // Mode is otherwise spawn-indistinguishable: `sh -nc 'printf EXECUTED'`
      // writes 0 bytes and `sh -c` writes 8, so only an effect can tell them
      // apart through the real production seam.
      rmSync(SENTINEL, { force: true });
      const r = cli([`${V}/parse-sentinel.md`, "--json"]);
      expect(r.code).toBe(0);
      expect(existsSync(SENTINEL)).toBe(false);
    },
    T,
  );
});

describe("spec-lint CLI — collection probes under --exec-red (spec §5)", () => {
  const V = "tests/specLint/fixtures/redVerdict/docs/superpowers/plans";
  const PROBE_T = 180000;

  const execCli = (args: string[], env: Record<string, string> = {}, cwd: string = ROOT) => {
    const r = spawnSync(process.execPath, [TSX, join(ROOT, "scripts/spec-lint.ts"), ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };

  const codesOf = (r: { stdout: string }): string[] =>
    (JSON.parse(r.stdout) as { findings: { code: string }[] }).findings.map((f) => f.code);

  it(
    "a live red that exits non-zero for a COLLECTION reason draws RED_COLLECTS_NOTHING",
    () => {
      const r = execCli([`${V}/exec-collects-nothing.md`, "--exec-red", "--json"]);
      expect(codesOf(r)).toContain("RED_COLLECTS_NOTHING");
    },
    PROBE_T,
  );

  it(
    "a live red that fails for its own reason, with a non-empty collection, is clean",
    () => {
      const r = execCli([`${V}/exec-genuine-red.md`, "--exec-red", "--json"]);
      expect(codesOf(r)).toEqual([]);
      expect(r.code).toBe(0);
    },
    PROBE_T,
  );

  it(
    "an authored red naming a tracked-but-uncollectible suite draws RED_SUITE_UNCOLLECTED",
    () => {
      const r = execCli([`${V}/exec-authored-uncollected.md`, "--exec-red", "--json"]);
      expect(codesOf(r)).toContain("RED_SUITE_UNCOLLECTED");
    },
    PROBE_T,
  );

  it(
    "probes inherit the repo root, proven from a SUBDIRECTORY cwd",
    () => {
      // Every path in the fixture red is repo-root-relative. A probe spawned
      // with the caller's cwd could not find the config and would report
      // RED_PROBE_UNVERIFIED instead of the collection verdict.
      const r = execCli(
        [join(ROOT, V, "exec-authored-uncollected.md"), "--exec-red", "--json"],
        {},
        join(ROOT, "lib"),
      );
      expect(codesOf(r)).toContain("RED_SUITE_UNCOLLECTED");
      expect(codesOf(r)).not.toContain("RED_PROBE_UNVERIFIED");
    },
    PROBE_T,
  );

  it(
    "the per-command ceiling and its env seam bind PROBES too",
    () => {
      const r = execCli([`${V}/exec-probe-timeout.md`, "--exec-red", "--json"], {
        SPEC_LINT_EXEC_TIMEOUT_SECS: "1",
      });
      expect(codesOf(r)).toEqual(["RED_PROBE_UNVERIFIED"]);
    },
    PROBE_T,
  );

  it(
    "red-command stdout stays discarded",
    () => {
      // The fixture CONCATENATES its sentinel at run time, so the string it
      // writes appears nowhere in the document. Asserting a sentinel that is
      // also a literal in the marker would just be reading the report's own
      // inventory back — which is what a first draft of this test did.
      const r = execCli([`${V}/exec-red-stdout.md`, "--exec-red", "--json"]);
      expect(r.stdout).toContain("SENTINELRED STDOUT"); // premise: the marker IS in the report
      expect(r.stdout).not.toContain("SENTINELREDSTDOUT");
      expect(r.stderr).not.toContain("SENTINELREDSTDOUT");
    },
    PROBE_T,
  );
});

// ---- spawn-authorization matrix at the injected seam (group 2) -------------

describe("runCli — spawn authorization per population cell (spec §3/§5.2)", () => {
  const PLAN_PATH = "docs/superpowers/plans/p.md";
  const PLAN_DOC = "/repo/docs/superpowers/plans/p.md";
  const TRACKED = ["lib/a.ts", "tests/a.test.ts"];

  const planDoc = (...markers: string[]) =>
    [
      "# Plan",
      "<!-- tasks: depth=2 red-contract -->",
      "## A",
      ...markers,
      "AC-1 here.",
      "<!-- tasks: end -->",
      "",
    ].join("\n");

  const runPlan = (text: string, opts: Partial<MemOpts> = {}, argv = [PLAN_PATH, "--exec-red"]) => {
    const { deps, calls } = memDeps({ files: { [PLAN_DOC]: text }, tracked: TRACKED, ...opts });
    const out = runCli([...argv, "--json"], deps);
    const findings = (JSON.parse(out.stdout) as { findings: { code: string }[] }).findings;
    return {
      codes: findings.map((f) => f.code),
      parse: calls.spawns.filter((s) => s.mode === "parse").map((s) => s.command),
      exec: calls.spawns.filter((s) => s.mode === "exec").map((s) => s.command),
      spawns: calls.spawns,
    };
  };

  const LIVE =
    "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=live why=`w` ac=AC-1 -->";
  const AUTHORED =
    "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->";

  it("the DEFAULT invocation spawns parse checks ONLY", () => {
    const r = runPlan(planDoc(LIVE), {}, [PLAN_PATH]);
    expect(r.parse).toEqual(["pnpm vitest run tests/a.test.ts"]);
    expect(r.exec).toEqual([]);
  });

  it.each([
    ["exit 0", { status: 0, signal: null }],
    ["exit 126", { status: 126, signal: null }],
    ["exit 127", { status: 127, signal: null }],
    [
      "a timeout",
      { status: null, signal: null, error: { code: "ETIMEDOUT", message: "timed out" } },
    ],
    ["a signal", { status: null, signal: "SIGTERM" }],
    ["a spawn error", { status: null, signal: null, error: { message: "spawn sh ENOENT" } }],
  ])("never probes a live marker whose red gave %s", (_label, red) => {
    const r = runPlan(planDoc(LIVE), {
      spawnFor: (command, mode) => (mode === "exec" ? red : undefined),
    });
    expect(r.exec).toEqual(["pnpm vitest run tests/a.test.ts"]);
  });

  it("probes a live marker exactly once when its red is genuinely non-zero", () => {
    const r = runPlan(planDoc(LIVE));
    expect(r.exec).toEqual(["pnpm vitest run tests/a.test.ts", "pnpm vitest list tests/a.test.ts"]);
  });

  it.each([
    ["a timeout", { status: null, signal: null, error: { code: "ETIMEDOUT", message: "t" } }],
    ["a signal", { status: null, signal: "SIGKILL" }],
    ["a spawn error", { status: null, signal: null, error: { message: "spawn sh ENOENT" } }],
  ])("a parse NON-OBSERVATION (%s) excludes the marker from execution and probing", (_l, parse) => {
    const r = runPlan(planDoc(LIVE), {
      spawnFor: (command, mode) => (mode === "parse" ? parse : undefined),
    });
    expect(r.codes).toEqual(["RED_PROBE_UNVERIFIED"]);
    expect(r.exec).toEqual([]);
  });

  it("a parse FAILURE excludes the marker from execution and probing", () => {
    const r = runPlan(planDoc(LIVE), {
      spawnFor: (command, mode) => (mode === "parse" ? { status: 2, signal: null } : undefined),
    });
    expect(r.codes).toEqual(["RED_UNPARSEABLE"]);
    expect(r.exec).toEqual([]);
  });

  it("an AUTHORED marker's red command is never spawned; only its list probe is", () => {
    const r = runPlan(planDoc(AUTHORED));
    expect(r.exec).toEqual(["pnpm vitest list tests/a.test.ts"]);
  });

  it("a compound vitest-shaped red is declined, never probed", () => {
    const compound =
      "<!-- task: red=`pnpm vitest run tests/a.test.ts && echo done` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->";
    const r = runPlan(planDoc(compound));
    expect(r.exec).toEqual([]);
    expect(r.codes).toContain("RED_PROBE_UNVERIFIED");
  });

  it.each([
    [
      "a bare region",
      [
        "# Plan",
        "<!-- tasks: depth=2 -->",
        "## A",
        AUTHORED,
        "AC-1 here.",
        "<!-- tasks: end -->",
        "",
      ].join("\n"),
    ],
    [
      "an orphaned position",
      [
        "# Plan",
        "<!-- tasks: depth=2 red-contract -->",
        "## A",
        "AC-1 here.",
        "<!-- tasks: end -->",
        AUTHORED,
        "",
      ].join("\n"),
    ],
    ["no region at all", ["# Plan", "## A", AUTHORED, "AC-1 here.", ""].join("\n")],
  ])("an authored marker in %s draws no probe AND no advisory", (_label, text) => {
    const r = runPlan(text);
    expect(r.exec).toEqual([]);
    expect(r.codes).not.toContain("RED_PROBE_UNVERIFIED");
  });

  it("a v1 marker is parsed but never executed or probed", () => {
    const v1 = "<!-- task: red=`pnpm vitest run tests/a.test.ts` ac=AC-1 -->";
    const r = runPlan(planDoc(v1));
    expect(r.parse).toEqual(["pnpm vitest run tests/a.test.ts"]);
    expect(r.exec).toEqual([]);
  });

  it("phases run in order: every parse check, then both reds, then both probes", () => {
    // Load-bearing: collection executes module scope, so an interleaved probe
    // would run a suite's imports between two red observations.
    const a = "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=live why=`w` ac=AC-1 -->";
    const b =
      "<!-- task: red=`pnpm exec vitest run tests/a.test.ts` red-state=live why=`w` ac=AC-1 -->";
    const r = runPlan(planDoc(a, b));
    expect(r.spawns.map((s) => `${s.mode}:${s.command}`)).toEqual([
      "parse:pnpm vitest run tests/a.test.ts",
      "parse:pnpm exec vitest run tests/a.test.ts",
      "exec:pnpm vitest run tests/a.test.ts",
      "exec:pnpm exec vitest run tests/a.test.ts",
      "exec:pnpm vitest list tests/a.test.ts",
      "exec:pnpm exec vitest list tests/a.test.ts",
    ]);
  });

  it("a live marker whose red exits 0 yields EXACTLY ONE RED_ALREADY_GREEN", () => {
    // Additive threading that re-emitted the code from the collection pass
    // fails this count, not the presence assertion above it.
    const r = runPlan(planDoc(LIVE), {
      spawnFor: (command, mode) => (mode === "exec" ? { status: 0, signal: null } : undefined),
    });
    expect(r.codes).toEqual(["RED_ALREADY_GREEN"]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { runCli, type CliDeps } from "../../scripts/spec-lint";

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
  it("failing.md → exit 1 with both hard findings", () => {
    const r = cli([`${FIX}/failing.md`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("CITATION_FILE_MISSING");
    expect(r.stdout).toContain("COPY_EM_DASH");
    expect(r.stdout).toContain("2 hard, 0 advisory");
  }, T);

  it("clean.md → exit 0", () => {
    const r = cli([`${FIX}/clean.md`]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 hard, 0 advisory");
  }, T);

  it("advisory-only.md → exit 0, summary counts advisories but never inventory", () => {
    const r = cli([`${FIX}/advisory-only.md`]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 hard, 1 advisory");
  }, T);

  it("repo-escape via lexical-prefix sibling → exit 2 (segment-boundary containment)", () => {
    const r = cli([join(EVIL, "docs/superpowers/specs/x.md")]);
    expect(r.code).toBe(2);
  }, T);

  it("repo-escape via symlinked parent dir → exit 2", () => {
    const r = cli([join(ESC_LINK, "docs/superpowers/specs/x.md")]);
    expect(r.code).toBe(2);
  }, T);

  it("non-.md → 2; directory → 2; symlink doc → 2", () => {
    expect(cli(["package.json"]).code).toBe(2);
    expect(cli(["docs", "--kind", "spec"]).code).toBe(2);
    expect(cli(["tests/specLint/fixtures/cited/symlink.md", "--kind", "spec"]).code).toBe(2);
  }, T);

  it("zero positionals → 2; two positionals → 2; unknown flag → 2", () => {
    expect(cli([]).code).toBe(2);
    expect(cli([`${FIX}/clean.md`, `${FIX}/failing.md`]).code).toBe(2);
    expect(cli([`${FIX}/clean.md`, "--wat"]).code).toBe(2);
  }, T);

  it("duplicate --kind → 2; duplicate --json → 2; bad --kind value → 2; terminal --kind → 2", () => {
    expect(cli([`${FIX}/clean.md`, "--kind", "spec", "--kind", "spec"]).code).toBe(2);
    expect(cli([`${FIX}/clean.md`, "--json", "--json"]).code).toBe(2);
    expect(cli([`${FIX}/clean.md`, "--kind", "nope"]).code).toBe(2);
    expect(cli([`${FIX}/clean.md`, "--kind"]).code).toBe(2);
  }, T);

  it("--kind --json → 2 and --json is still a FLAG: stderr is {\"error\": …} JSON", () => {
    const r = cli([`${FIX}/clean.md`, "--kind", "--json"]);
    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stderr) as { error: string };
    expect(typeof parsed.error).toBe("string");
  }, T);

  it("usage error under --json → stderr {\"error\": …}", () => {
    const r = cli(["--json"]);
    expect(r.code).toBe(2);
    expect(() => JSON.parse(r.stderr)).not.toThrow();
  }, T);

  it("kind inference: /plans/ → plan; both segments → 2 naming --kind; neither → 2 naming --kind", () => {
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
  }, T);

  it("explicit --kind plan on a specs path wins → 0, kindSource explicit", () => {
    const r = cli([`${FIX}/clean.md`, "--kind", "plan", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { kind: string; kindSource: string };
    expect(parsed.kind).toBe("plan");
    expect(parsed.kindSource).toBe("explicit");
  }, T);

  it.skipIf(isRoot)("unreadable linted doc → 2", () => {
    chmodSync(UNREADABLE, 0o000);
    try {
      expect(cli([UNREADABLE, "--kind", "spec"]).code).toBe(2);
    } finally {
      chmodSync(UNREADABLE, 0o644);
    }
  }, T);

  it("nested-repo doc resolves against the OUTER root (root discovered from CLI cwd)", () => {
    const r = cli([join(NESTED, "docs/superpowers/specs/inner.md")]);
    expect(r.code).toBe(0);
  }, T);
});

describe("spec-lint CLI — report + encoding (spec §2/§8)", () => {
  it("text report: header, kind line, INVENTORY after findings, summary last", () => {
    const r = cli([`${FIX}/advisory-only.md`]);
    expect(r.stdout).toContain(`spec:lint ${FIX}/advisory-only.md`);
    expect(r.stdout).toContain("kind: spec (inferred)");
    const iInv = r.stdout.indexOf("INVENTORY");
    const iCopy = r.stdout.indexOf("COPY_STRAIGHT_APOSTROPHE");
    const iSum = r.stdout.indexOf("summary:");
    expect(iCopy).toBeGreaterThanOrEqual(0);
    expect(iInv).toBeGreaterThan(iCopy);
    expect(iSum).toBeGreaterThan(iInv);
  }, T);

  it("--json emits the LintResult VERBATIM (deep-equal against fully-constructed expected)", () => {
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
  }, T);

  it("astral doc: finding column in UTF-16 units via --json", () => {
    const r = cli([`${FIX}/astral.md`, "--json"]);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout) as {
      findings: { code: string; docLine: number; column: number }[];
    };
    expect(parsed.findings).toEqual([
      expect.objectContaining({ code: "COPY_EM_DASH", docLine: 3, column: 18 }),
    ]);
  }, T);

  it("invalid-UTF-8 doc lints (replacement decode); cited invalid-UTF-8 file reads", () => {
    expect(cli([`${FIX}/invalid-utf8.md`]).code).toBe(0);
  }, T);

  it("CRLF doc and CRLF cited file normalize through the real resolver", () => {
    expect(cli([`${FIX}/crlf.md`]).code).toBe(0);
  }, T);

  it("EOF fixtures: last-line citations pass with and without trailing newline", () => {
    expect(cli([`${FIX}/eof.md`]).code).toBe(0);
  }, T);

  it("cited tracked symlink → CITATION_UNREADABLE, exit 1", () => {
    const r = cli([`${FIX}/symlink-cite.md`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("CITATION_UNREADABLE");
  }, T);

  it.skipIf(isRoot)("chmod-000 cited file → CITATION_UNREADABLE", () => {
    const p = join(ROOT, "tests/specLint/fixtures/cited/chmod.txt");
    chmodSync(p, 0o000);
    try {
      const r = cli([`${FIX}/chmod-cite.md`]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("CITATION_UNREADABLE");
    } finally {
      chmodSync(p, 0o644);
    }
  }, T);
});

// ---- seam-level (no subprocess): infra faults + containment via injected deps ----

interface MemOpts {
  files?: Record<string, string>;
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
  const calls = { repoRoot: 0, reads: [] as string[] };
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
  };
  return { deps, calls };
}

const DOC = "docs/superpowers/specs/x.md";

describe("runCli — seam-level infra + containment (spec §2/§7, §1.1 item 11)", () => {
  it("repoRoot() throws → exit 2; with --json stderr is {\"error\": …}", () => {
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

  it("root discovery happens EXACTLY once per invocation", () => {
    const { deps, calls } = memDeps();
    const r = runCli([DOC], deps);
    expect(r.exitCode).toBe(0);
    expect(calls.repoRoot).toBe(1);
  });
});

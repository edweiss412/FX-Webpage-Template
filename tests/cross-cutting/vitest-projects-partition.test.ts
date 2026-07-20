import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import vitestConfig from "@/vitest.config";
import {
  ENV_BOUND_EXCLUDES,
  MUTATION_TEST_GLOBS,
  NIGHTLY_ONLY_EXCLUDES,
  PARALLEL_TEST_GLOBS,
} from "@/vitest.projects";
import { globToRegExp as globRe } from "@/lib/test/serialAudit";

// Structural guard for the two-project vitest split (PR B). The #1 risk of a
// projects split is a glob typo that drops a whole directory from BOTH projects
// (silent coverage loss) or matches it in BOTH (double-run + re-introduced DB
// race). This walks the real tests/ tree and asserts every non-nightly test
// file is claimed by EXACTLY ONE default project (nightly harness files by
// none), and that the config is wired the way the speedup
// depends on (serial = fileParallelism:false for DB/FS; parallel = true).
//
// PARALLEL_TEST_GLOBS is the single source of truth: the parallel project's
// `include` and the serial project's `exclude` are both built from it. A file
// is parallel iff it matches a parallel glob and is not nightly-excluded;
// nightly mutation-harness files live in no default project; serial otherwise.

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listTestFiles(full));
    } else if (/\.test\.tsx?$/.test(ent.name)) {
      // posix-relative path like "tests/components/AlertBanner.test.tsx"
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

// A parallel glob is either a dir glob ("tests/x/**/*.test.{ts,tsx}") or an
// exact file ("tests/sample.test.ts"). Reduce to a matcher without a glob lib.
// Resolved-config membership: a file is in project P iff some P.include glob
// matches it AND no P.exclude glob does. This reads the REAL arrays off the
// imported config, so an exclusion added anywhere (including
// configDefaults.exclude, or one added later by anyone) is honoured — unlike a
// classifier function, which can only restate the partition it was written from.
function inProject(file: string, p: ProjectEntry["test"]): boolean {
  const included = (p.include ?? []).some((g) => globRe(g).test(file));
  if (!included) return false;
  return !(p.exclude ?? []).some((g) => globRe(g).test(file));
}

function matchesParallel(file: string): boolean {
  return PARALLEL_TEST_GLOBS.some((g) => {
    const starIdx = g.indexOf("/**");
    if (starIdx >= 0) return file.startsWith(g.slice(0, starIdx + 1));
    return file === g;
  });
}

// Three-way membership — mirrors vitest.config.ts's DEFAULT-discovery
// construction (VITEST_EXCLUDE_ENV_BOUND unset — what local `pnpm test`
// sees; the env-bound CI mode is pinned separately by the serialExcludeFor
// block below). Nightly mutation-harness files live in NO default project.
// NIGHTLY_ONLY_EXCLUDES is `**/`-prefixed with an embedded `*`, which the
// prefix matcher above cannot express — convert to anchored regexes (same
// helper as vitest-shard-balance.test.ts).
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}
const nightlyRes = NIGHTLY_ONLY_EXCLUDES.map(globToRegExp);
function projectOf(file: string): "parallel" | "serial" | "none" {
  if (nightlyRes.some((r) => r.test(file))) return "none";
  return matchesParallel(file) ? "parallel" : "serial";
}

const allTestFiles = listTestFiles(TESTS_DIR);

type ProjectEntry = {
  test: { name: string; include?: string[]; exclude?: string[]; fileParallelism?: boolean };
};

describe("vitest projects split — partition is complete and correctly wired", () => {
  const projects = (vitestConfig as { test?: { projects?: ProjectEntry[] } }).test?.projects ?? [];

  it("defines serial + parallel by default, + mutation ONLY when opted in", async () => {
    expect(Array.isArray(projects), "vitest.config.ts must define test.projects").toBe(true);
    const names = projects.map((p) => p.test.name).sort();
    expect(names).toEqual(["parallel", "serial"]); // default import = no env flag

    vi.resetModules();
    vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", "1");
    try {
      const cfg = (await import("@/vitest.config")).default as {
        test?: { projects?: ProjectEntry[] };
      };
      const gatedNames = (cfg.test?.projects ?? []).map((p) => p.test.name).sort();
      expect(gatedNames).toEqual(["mutation", "parallel", "serial"]);
      const mutation = cfg.test!.projects!.find((p) => p.test.name === "mutation")!.test;
      expect(mutation.include).toEqual(MUTATION_TEST_GLOBS);
      expect(mutation.fileParallelism, "sharding speedup requires parallel files").toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("serial project runs files sequentially; parallel project in parallel", () => {
    const serial = projects.find((p) => p.test.name === "serial")!.test;
    const parallel = projects.find((p) => p.test.name === "parallel")!.test;
    expect(
      serial.fileParallelism,
      "serial project MUST keep fileParallelism:false (DB/FS races)",
    ).toBe(false);
    expect(
      parallel.fileParallelism,
      "parallel project MUST set fileParallelism:true (the speedup)",
    ).toBe(true);
  });

  it("parallel.include IS PARALLEL_TEST_GLOBS and serial.exclude CONTAINS every parallel glob (single source of truth)", () => {
    const serial = projects.find((p) => p.test.name === "serial")!.test;
    const parallel = projects.find((p) => p.test.name === "parallel")!.test;
    expect(parallel.include).toEqual(PARALLEL_TEST_GLOBS);
    // serial must exclude every parallel glob (alongside defaults + nightly)
    // so the partition can't double-run
    for (const g of PARALLEL_TEST_GLOBS) {
      expect(serial.exclude ?? [], `serial.exclude must contain ${g}`).toContain(g);
    }
  });

  it("found a non-trivial number of test files (anti-vacuity for the walk)", () => {
    expect(allTestFiles.length).toBeGreaterThan(500);
  });

  it("resolved config partitions correctly under VITEST_EXCLUDE_ENV_BOUND=1 (CI mode)", async () => {
    // CI runs with the env gate ON, where the three env-bound files leave the
    // serial project. Assert the real arrays in that mode: those files belong to
    // NO default project, every other non-nightly file to exactly one.
    vi.resetModules();
    vi.stubEnv("VITEST_EXCLUDE_ENV_BOUND", "1");
    try {
      const cfg = (await import("@/vitest.config")).default as {
        test?: { projects?: ProjectEntry[] };
      };
      const gated = (cfg.test?.projects ?? []).map((p) => p.test);
      expect(gated.length, "gated config must still define both default projects").toBe(2);
      const nightlyRe = NIGHTLY_ONLY_EXCLUDES.map(globRe);
      const envBoundPaths = ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, ""));
      for (const f of allTestFiles) {
        const admitting = gated.filter((p) => inProject(f, p)).map((p) => p.name);
        if (nightlyRe.some((r) => r.test(f)) || envBoundPaths.includes(f)) {
          expect(admitting, `${f} must be in NO default project under the env gate`).toEqual([]);
        } else {
          expect(admitting, `${f} must be admitted exactly once under the env gate`).toHaveLength(
            1,
          );
        }
      }
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("resolved config admits every discovered file exactly once (nightly files zero)", async () => {
    // Import with the env-bound flag explicitly CLEARED: CI sets
    // VITEST_EXCLUDE_ENV_BOUND=1, which would otherwise gate the top-level
    // import and make this default-mode proof expect the three env-bound files
    // in a project they deliberately leave.
    vi.resetModules();
    vi.stubEnv("VITEST_EXCLUDE_ENV_BOUND", "");
    const defaultCfg = (await import("@/vitest.config")).default as {
      test?: { projects?: ProjectEntry[] };
    };
    const defaults = (defaultCfg.test?.projects ?? []).map((p) => p.test);
    try {
      const nightlyRe = NIGHTLY_ONLY_EXCLUDES.map(globRe);
      let nightlyCount = 0;
      for (const f of allTestFiles) {
        const admitting = defaults.filter((p) => inProject(f, p)).map((p) => p.name);
        if (nightlyRe.some((r) => r.test(f))) {
          nightlyCount++;
          expect(admitting, `${f} is nightly-only and must be in NO default project`).toEqual([]);
        } else {
          expect(admitting, `${f} must be admitted by exactly one default project`).toHaveLength(1);
        }
      }
      expect(nightlyCount, "exactly the 9 nightly harness files live in no default project").toBe(
        9,
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("keeps the DB/FS-heavy dirs in the SERIAL project", () => {
    // Spot-check the directories whose tests mutate the shared local Supabase DB
    // or the fixtures/shows/raw corpus — mis-classifying any into parallel would
    // re-introduce the race fileParallelism:false exists to prevent.
    const mustBeSerial = [
      "tests/db/advisory-lock.test.ts",
      "tests/sync/dev-routing.test.ts", // the fixture-corpus WRITER
      "tests/admin/test-auth-gate.test.ts", // env-bound (x-audits-targeted)
      "tests/cross-cutting/email-canonicalization.test.ts", // env-bound (x5-targeted)
      "tests/cross-cutting/pg-cron-coverage.test.ts", // env-bound
      "tests/onboarding", // whole dir
      "tests/api",
      "tests/notify",
    ];
    for (const path of mustBeSerial) {
      const files = path.endsWith(".ts")
        ? [path]
        : allTestFiles.filter((f) => f.startsWith(path + "/"));
      expect(files.length, `expected to find test files under ${path}`).toBeGreaterThan(0);
      for (const f of files) {
        expect(projectOf(f), `${f} must be in the SERIAL project (DB/FS shared state)`).toBe(
          "serial",
        );
      }
    }
  });

  it("keeps the validated DB-free dirs in the PARALLEL project", () => {
    const mustBeParallel = ["tests/components", "tests/help", "tests/messages", "tests/crew"];
    for (const dir of mustBeParallel) {
      const files = allTestFiles.filter((f) => f.startsWith(dir + "/"));
      expect(files.length, `expected test files under ${dir}`).toBeGreaterThan(0);
      for (const f of files) {
        expect(matchesParallel(f), `${f} must be in the PARALLEL project`).toBe(true);
      }
    }
  });

  // The env-bound files live in SERIAL dirs (so x-audits can target them via a
  // direct `vitest run <file>`) but must be dropped from the unit-suite full run.
  // They are gated by VITEST_EXCLUDE_ENV_BOUND because vitest IGNORES the CLI
  // `--exclude` flag once a project has its own `exclude` (the bug that broke the
  // first run of this split). These tests pin that contract.
  it("env-bound files are NOT in the parallel set (must be excludable from serial)", () => {
    for (const glob of ENV_BOUND_EXCLUDES) {
      // strip the leading **/ to compare against repo-relative paths
      const path = glob.replace(/^\*\*\//, "");
      expect(allTestFiles, `${path} should exist`).toContain(path);
      expect(matchesParallel(path), `${path} must be SERIAL so the env gate can exclude it`).toBe(
        false,
      );
    }
  });

  it("VITEST_EXCLUDE_ENV_BOUND gates the env-bound files in the serial exclude", async () => {
    const serialExcludeFor = async (value: string): Promise<string[]> => {
      vi.resetModules();
      vi.stubEnv("VITEST_EXCLUDE_ENV_BOUND", value);
      try {
        const cfg = (await import("@/vitest.config")).default as {
          test?: { projects?: ProjectEntry[] };
        };
        const serial = cfg.test?.projects?.find((p) => p.test.name === "serial")?.test;
        return serial?.exclude ?? [];
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    };
    const gated = await serialExcludeFor("1");
    const ungated = await serialExcludeFor(""); // anything other than "1"
    for (const f of ENV_BOUND_EXCLUDES) {
      expect(gated, `${f} excluded when VITEST_EXCLUDE_ENV_BOUND=1`).toContain(f);
      expect(
        ungated,
        `${f} runs when the env var is unset (x-audits + local pnpm test)`,
      ).not.toContain(f);
    }
  });

  it("the mutation harness files (8 shards + gates) are NOT in the parallel set", () => {
    const harnessFiles = allTestFiles.filter((f) =>
      /^tests\/parser\/mutationHarness\..+\.test\.ts$/.test(f),
    );
    expect(harnessFiles.length, "shard+gates files must exist").toBe(9); // 8 shards + gates
    for (const f of harnessFiles) {
      expect(projectOf(f), `${f} must live in NO default project`).toBe("none");
    }
  });

  it("harness files are excluded from serial UNCONDITIONALLY (they live in the mutation project)", async () => {
    const serialExcludeFor = async (value: string | undefined): Promise<string[]> => {
      vi.resetModules();
      vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", value ?? "");
      try {
        const cfg = (await import("@/vitest.config")).default as {
          test?: { projects?: ProjectEntry[] };
        };
        return cfg.test?.projects?.find((p) => p.test.name === "serial")?.test.exclude ?? [];
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    };
    for (const f of NIGHTLY_ONLY_EXCLUDES) {
      expect(await serialExcludeFor("1"), `${f} excluded from serial even when opted in`).toContain(
        f,
      );
      expect(await serialExcludeFor(undefined), `${f} excluded from serial by default`).toContain(
        f,
      );
    }
  });

  it("the nightly workflow sets the opt-in var and runs the mutation project", () => {
    const wf = readFileSync(join(ROOT, ".github", "workflows", "mutation-harness.yml"), "utf8");
    expect(
      wf.includes("VITEST_INCLUDE_MUTATION_HARNESS"),
      "workflow must opt IN to the harness",
    ).toBe(true);
    expect(
      /schedule:/.test(wf) && /workflow_dispatch:/.test(wf),
      "workflow must be scheduled + dispatchable",
    ).toBe(true);
    // pull_request path-filtered trigger gives pre-merge real-Actions validation (Codex R2):
    // workflow_dispatch alone can't run against a branch before the file is on the default branch.
    expect(
      /pull_request:/.test(wf),
      "workflow must also run on harness-touching PRs (pre-merge proof)",
    ).toBe(true);
  });

  it("workflow pins — runs `--project mutation` + widened pull_request path glob", () => {
    const wf = readFileSync(join(ROOT, ".github", "workflows", "mutation-harness.yml"), "utf8");
    expect(
      wf.includes("--project mutation"),
      "workflow must run the mutation project explicitly",
    ).toBe(true);
    expect(
      wf.includes("tests/parser/mutationHarness.*.test.ts"),
      "pull_request path filter must cover shard+gates files (Codex spec-R1 #2)",
    ).toBe(true);
    expect(
      /tests\/parser\/mutationHarness\.test\.ts/.test(wf),
      "retired single-file path literal must be gone",
    ).toBe(false);
  });

  it("unit-suite.yml uses the env var, NOT the (ignored) vitest --exclude flag", () => {
    const wf = readFileSync(join(ROOT, ".github", "workflows", "unit-suite.yml"), "utf8");
    // Strip YAML comment lines so the assertion checks real commands, not the
    // explanatory comment (which legitimately mentions `vitest run --exclude`).
    const commands = wf
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(
      commands.includes("VITEST_EXCLUDE_ENV_BOUND"),
      "unit-suite.yml must set VITEST_EXCLUDE_ENV_BOUND to drop the env-bound files",
    ).toBe(true);
    expect(
      /--exclude/.test(commands),
      "unit-suite.yml must NOT use `vitest run --exclude` — vitest ignores it with projects defined",
    ).toBe(false);
  });

  it("Phase-2 verified dirs are in PARALLEL_TEST_GLOBS (exact glob literals)", () => {
    // Protocol-verified 2026-07-19 (spec §2.2: closed-port DB + fileParallelism,
    // 178 passed / 2,745 tests). Bare dir strings can't satisfy the prefix
    // matcher — pin the literal globs.
    const PHASE2_VERIFIED_PARALLEL_DIRS = [
      "parser",
      "drive",
      "cron",
      "dataQuality",
      "appSettings",
      "geocoding",
      "design",
      "dates",
      "showLifecycle",
      "invariants",
      "github",
      "venue",
    ];
    for (const d of PHASE2_VERIFIED_PARALLEL_DIRS) {
      expect(
        PARALLEL_TEST_GLOBS,
        `tests/${d} was protocol-verified DB-free (spec 2026-07-19 §2.2)`,
      ).toContain(`tests/${d}/**/*.test.{ts,tsx}`);
    }
  });

  it("parallel project excludes the nightly harness globs (else ~102k mutants join every PR leg)", () => {
    const parallel = projects.find((p) => p.test.name === "parallel")!.test;
    for (const g of NIGHTLY_ONLY_EXCLUDES) {
      expect(parallel.exclude ?? [], `parallel.exclude must contain ${g}`).toContain(g);
    }
  });
});

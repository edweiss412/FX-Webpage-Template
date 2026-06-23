import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";
import { PARALLEL_TEST_GLOBS } from "@/vitest.projects";

// Structural guard for the two-project vitest split (PR B). The #1 risk of a
// projects split is a glob typo that drops a whole directory from BOTH projects
// (silent coverage loss) or matches it in BOTH (double-run + re-introduced DB
// race). This walks the real tests/ tree and asserts every test file is claimed
// by EXACTLY ONE project, and that the config is wired the way the speedup
// depends on (serial = fileParallelism:false for DB/FS; parallel = true).
//
// PARALLEL_TEST_GLOBS is the single source of truth: the parallel project's
// `include` and the serial project's `exclude` are both built from it, so a
// file is parallel iff it matches a parallel glob and serial otherwise.

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
function matchesParallel(file: string): boolean {
  return PARALLEL_TEST_GLOBS.some((g) => {
    const starIdx = g.indexOf("/**");
    if (starIdx >= 0) return file.startsWith(g.slice(0, starIdx + 1));
    return file === g;
  });
}

const allTestFiles = listTestFiles(TESTS_DIR);

type ProjectEntry = {
  test: { name: string; include?: string[]; exclude?: string[]; fileParallelism?: boolean };
};

describe("vitest projects split — partition is complete and correctly wired", () => {
  const projects = (vitestConfig as { test?: { projects?: ProjectEntry[] } }).test?.projects ?? [];

  it("defines exactly a 'serial' and a 'parallel' project", () => {
    expect(Array.isArray(projects), "vitest.config.ts must define test.projects").toBe(true);
    const names = projects.map((p) => p.test.name).sort();
    expect(names).toEqual(["parallel", "serial"]);
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

  it("parallel.include and serial.exclude are both PARALLEL_TEST_GLOBS (single source of truth)", () => {
    const serial = projects.find((p) => p.test.name === "serial")!.test;
    const parallel = projects.find((p) => p.test.name === "parallel")!.test;
    expect(parallel.include).toEqual(PARALLEL_TEST_GLOBS);
    // serial must exclude exactly the parallel set so the partition can't double-run
    for (const g of PARALLEL_TEST_GLOBS) {
      expect(serial.exclude ?? [], `serial.exclude must contain ${g}`).toContain(g);
    }
  });

  it("found a non-trivial number of test files (anti-vacuity for the walk)", () => {
    expect(allTestFiles.length).toBeGreaterThan(500);
  });

  it("every test file is claimed by EXACTLY ONE project (no drops, no double-run)", () => {
    // By construction: parallel iff matchesParallel; serial otherwise (serial
    // includes base and excludes the parallel globs). So the only way a file is
    // mis-partitioned is a glob that fails to match its intended files.
    const parallelFiles = allTestFiles.filter(matchesParallel);
    const serialFiles = allTestFiles.filter((f) => !matchesParallel(f));
    expect(parallelFiles.length + serialFiles.length).toBe(allTestFiles.length);
    expect(parallelFiles.length, "parallel project must be non-empty").toBeGreaterThan(200);
    expect(serialFiles.length, "serial project must be non-empty").toBeGreaterThan(100);
  });

  it("keeps the DB/FS-heavy dirs in the SERIAL project", () => {
    // Spot-check the directories whose tests mutate the shared local Supabase DB
    // or the fixtures/shows/raw corpus — mis-classifying any into parallel would
    // re-introduce the race fileParallelism:false exists to prevent.
    const mustBeSerial = [
      "tests/db/advisory-lock.test.ts",
      "tests/sync/dev-routing.test.ts", // the fixture-corpus WRITER
      "tests/parser/parseSheet.test.ts", // a fixture-corpus reader
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
        expect(matchesParallel(f), `${f} must be in the SERIAL project (DB/FS shared state)`).toBe(
          false,
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
});

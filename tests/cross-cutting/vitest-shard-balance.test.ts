import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";
import type { TestSpecification } from "vitest/node";

import { DEFAULT_WEIGHT, FILE_WEIGHTS } from "@/lib/test/vitest.weights";
import { lptShard, WeightBalancedSequencer } from "@/vitest.sequencer";
import { ENV_BOUND_EXCLUDES, NIGHTLY_ONLY_EXCLUDES } from "@/vitest.projects";

// Structural guard for the weight-balanced shard partition (PR E). Exercises the
// REAL lptShard AND the REAL WeightBalancedSequencer.shard() over the REAL
// test-file set (derived, not hardcoded) so a broken partition (drop/dup) or a
// re-clustered hot file fails CI. Mirrors vitest-projects-partition.test.ts's
// readdirSync discovery.
const ROOT = process.cwd();

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTestFiles(full));
    else if (/\.test\.tsx?$/.test(ent.name)) out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

// What the sequencer sees in the unit-suite CI run: all test files minus the
// env-bound excludes (VITEST_EXCLUDE_ENV_BOUND=1) AND the unconditional
// nightly-only excludes (vitest.config.ts serial-project `exclude`; the
// mutation project is env-gated out of unit-suite discovery). Globs are
// "**/"-prefixed and may contain `*`, so convert to anchored regexes.
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}
const excludeRes = [...ENV_BOUND_EXCLUDES, ...NIGHTLY_ONLY_EXCLUDES].map(globToRegExp);
const allFiles = listTestFiles(join(ROOT, "tests")).filter(
  (f) => !excludeRes.some((r) => r.test(f)),
);
const weightOf = (k: string) => FILE_WEIGHTS[k] ?? DEFAULT_WEIGHT;

const HOT = [
  "tests/scripts/validation-report-fixtures.test.ts",
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts",
] as const;

// Minimal fake spec so we can drive the REAL sequencer without a Vitest ctx.
function fakeSpec(key: string, project = "serial"): TestSpecification {
  return { moduleId: join(ROOT, key), project: { name: project } } as unknown as TestSpecification;
}
async function legFiles(
  specs: TestSpecification[],
  index: number,
  count: number,
): Promise<TestSpecification[]> {
  const seq = new WeightBalancedSequencer({
    config: { shard: { index, count }, root: ROOT },
  } as never);
  return seq.shard(specs);
}

describe("PR E weight-balanced shard partition", () => {
  it("discovers a non-trivial file set (anti-vacuity)", () => {
    expect(allFiles.length).toBeGreaterThan(400);
    for (const h of HOT) expect(allFiles, `${h} must be in the resolved set`).toContain(h);
    // The serial project unconditionally excludes the nightly mutation-harness
    // files (vitest.projects.ts NIGHTLY_ONLY_EXCLUDES) — the sequencer never
    // sees them in a unit-suite run, so neither may this model.
    expect(
      allFiles.some((f) => f.includes("tests/parser/mutationHarness.")),
      "nightly mutationHarness files must be excluded from the modeled set",
    ).toBe(false);
  });

  // --- lptShard (pure) over the real key set ---
  for (const N of [2, 3, 6]) {
    it(`lptShard N=${N}: clean cover of every file (no drop, no dup)`, () => {
      const bins = lptShard(allFiles, N, weightOf, (k) => k);
      expect(bins).toHaveLength(N);
      const flat = bins.flat();
      expect(flat).toHaveLength(allFiles.length);
      expect(new Set(flat)).toEqual(new Set(allFiles));
    });

    it(`lptShard N=${N}: no bin exceeds 1.25x the mean committed weight`, () => {
      const bins = lptShard(allFiles, N, weightOf, (k) => k);
      const loads = bins.map((b) => b.reduce((s, k) => s + weightOf(k), 0));
      const mean = loads.reduce((a, b) => a + b, 0) / N;
      for (const l of loads) expect(l).toBeLessThanOrEqual(mean * 1.25);
    });
  }

  it("lptShard N=2: the two hot files land in DIFFERENT legs", () => {
    const bins = lptShard(allFiles, 2, weightOf, (k) => k);
    const legOf = (f: string) => bins.findIndex((b) => b.includes(f));
    expect(legOf(HOT[0])).not.toBe(legOf(HOT[1]));
  });

  // --- WeightBalancedSequencer.shard() (real method, over project-qualified specs) ---
  for (const N of [2, 3, 6]) {
    it(`sequencer N=${N}: union of legs is a clean cover of all specs (no drop/dup)`, async () => {
      const specs = allFiles.map((f) => fakeSpec(f));
      const legs = await Promise.all(
        Array.from({ length: N }, (_, i) => legFiles(specs, i + 1, N)),
      );
      const flat = legs.flat();
      expect(flat).toHaveLength(specs.length); // no spec dropped or duplicated
      expect(new Set(flat)).toEqual(new Set(specs)); // exact same spec objects
    });
  }

  it("sequencer never key-collapses: two specs sharing a moduleId (both projects) both survive", async () => {
    // Pathological: the SAME file qualified by two projects. The partition test
    // forbids this, but the sequencer must NOT silently drop one (a Map keyed by
    // normalized path would). Both distinct spec objects must appear across legs.
    const dup = [fakeSpec(HOT[0], "serial"), fakeSpec(HOT[0], "parallel")];
    const others = allFiles.filter((f) => f !== HOT[0]).map((f) => fakeSpec(f));
    const specs = [...dup, ...others];
    const legs = await Promise.all([legFiles(specs, 1, 2), legFiles(specs, 2, 2)]);
    const flat = legs.flat();
    expect(flat).toHaveLength(specs.length);
    expect(new Set(flat)).toEqual(new Set(specs));
  });

  it("every FILE_WEIGHTS key maps to an existing test file (no stale keys)", () => {
    for (const k of Object.keys(FILE_WEIGHTS))
      expect(allFiles, `stale weight key ${k}`).toContain(k);
  });

  // TDD anchor for the Phase-1 weight refresh (spec §5.3): every file measured
  // ≥8s on green run 29710814674 must carry its measured (rounded) weight.
  // Future re-measurements update this literal and FILE_WEIGHTS together.
  const MEASURED_HEAVY: Record<string, number> = {
    "tests/cross-cutting/no-global-cursor.test.ts": 54000,
    "tests/scripts/validation-report-fixtures.test.ts": 40000,
    "tests/codexGuard/timeouts.test.ts": 28000,
    "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 23000,
    "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 15000,
    "tests/scripts/validation-check-seed.test.ts": 15000,
    "tests/app/admin/showReviewModalLoader.test.tsx": 11000,
    "tests/parser/blocks/event.test.ts": 8000,
  };
  it("FILE_WEIGHTS carries the measured 2026-07-20 refresh (exact values)", () => {
    for (const [k, w] of Object.entries(MEASURED_HEAVY)) {
      expect(FILE_WEIGHTS[k], `${k} must be weighted ${w}`).toBe(w);
    }
  });

  it("vitest.config.ts wires the WeightBalancedSequencer at root", () => {
    const cfg = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    expect(/sequence:\s*\{[^}]*sequencer:\s*WeightBalancedSequencer/.test(cfg)).toBe(true);
  });
});

#!/usr/bin/env node
/**
 * Prove that `tests/mutationWeight/instrument.test.ts` discriminates.
 *
 * A suite written against code that already works passes on its first run, which
 * proves nothing at all. Each defect below is planted into a COPY of
 * `lib/mutationWeight`, the suite is pointed at the copy, and the suite is REQUIRED
 * to go red. A defect the suite does not notice is reported as ESCAPED.
 *
 * Two failure modes are called out rather than scored as passes, because both would
 * otherwise look like success:
 *
 *   ANCHOR-FAIL  the anchor was absent or not unique, so nothing was planted. A green
 *                suite under a mutation that never applied is the most convincing
 *                wrong answer available.
 *   BROKEN-PLANT the mutant did not compile. A compile error is not the suite
 *                discriminating; it is the plant being wrong.
 *
 * Usage: node scripts/mutation-weight-plant.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "lib/mutationWeight");
const SUITE = join(ROOT, "tests/mutationWeight/instrument.test.ts");

/** file, a unique anchor, and what it becomes. */
const DEFECTS = [
  [
    "seedRates averages over time instead of taking the newest sha",
    "weights.ts",
    "      } else if (held.sha === snap.sha) {",
    "      } else {",
  ],
  [
    "seedRates keeps the OLDEST sha rather than the newest",
    "weights.ts",
    "      if (held === undefined) {",
    "      if (held === undefined || true) {",
  ],
  [
    "seedRates floors a zero-second surface to 0 instead of omitting it",
    "weights.ts",
    "      if (rate === undefined || rate <= 0) continue;",
    "      if (rate === undefined) continue;",
  ],
  [
    "ratePerModelledBoot divides by OBSERVED children instead of modelled boots",
    "weights.ts",
    "  const boots = modelled.get(m.surfaceId)?.boots;",
    "  const boots = m.observedBoots;",
  ],
  [
    "driftReport speaks only above the threshold",
    "weights.ts",
    "    const ratio = Math.max(dec, obs) / Math.min(dec, obs);",
    "    const ratio = Math.max(dec, obs) / Math.min(dec, obs); if (ratio <= actionableAt) continue;",
  ],
  [
    "driftReport drops a measured surface that has no declared rate",
    "weights.ts",
    "      undeclared.push(m.surfaceId);",
    "      void m;",
  ],
  [
    "driftReport folds unmeasured into agreeing",
    "weights.ts",
    "  const unmeasured = [...declared.keys()].filter((id) => !seen.has(id)).sort();",
    "  const unmeasured = [];",
  ],
  [
    "reconcile stops reporting surfaces the registry has and the run does not",
    "weights.ts",
    "  const modelOnly = [...modelled.keys()].filter((id) => !observed.has(id)).sort();",
    "  const modelOnly = [];",
  ],
  [
    "reconcile stops comparing the mutant count",
    "weights.ts",
    "    if (dump.mutants !== m.mutants)",
    "    if (false)",
  ],
  [
    "reconcile collapses duplicate records by surface id",
    "weights.ts",
    "  const duplicated = [...seen]",
    "  const duplicated = [].concat([...seen].slice(0, 0))",
  ],
  [
    "reconcile treats the suite count as an equality rather than a bound",
    "weights.ts",
    "    if (suites > dump.suites)",
    "    if (suites !== dump.suites)",
  ],
  [
    "lpt breaks ties by insertion order instead of by key",
    "weights.ts",
    "  for (const it of [...items].sort((a, b) => b.w - a.w || a.key.localeCompare(b.key))) {",
    "  for (const it of [...items].sort((a, b) => b.w - a.w)) {",
  ],
  [
    "verdictDelta counts a siteId present on only one side",
    "weights.ts",
    "      if (was === undefined) continue;",
    "      if (was === undefined) { sharedSiteIds += 1; continue; }",
  ],
  [
    "bindingLeg reports the SHORTEST leg",
    "weights.ts",
    "export const bindingLeg = (legs: readonly number[]): number => Math.max(...legs);",
    "export const bindingLeg = (legs: readonly number[]): number => Math.min(...legs);",
  ],
  [
    "reconcile returns recordOnly unsorted",
    "weights.ts",
    "  const recordOnly = [...observed.keys()].filter((id) => !modelled.has(id)).sort();",
    "  const recordOnly = [...observed.keys()].filter((id) => !modelled.has(id));",
  ],
  [
    "reconcile returns modelOnly unsorted",
    "weights.ts",
    "  const modelOnly = [...modelled.keys()].filter((id) => !observed.has(id)).sort();",
    "  const modelOnly = [...modelled.keys()].filter((id) => !observed.has(id));",
  ],
  [
    "reconcile returns the duplicate list unsorted",
    "weights.ts",
    "    .map(([id]) => id)\n    .sort();",
    "    .map(([id]) => id);",
  ],
  [
    "driftReport returns the unmeasured list unsorted",
    "weights.ts",
    "  const unmeasured = [...declared.keys()].filter((id) => !seen.has(id)).sort();",
    "  const unmeasured = [...declared.keys()].filter((id) => !seen.has(id));",
  ],
  [
    "seamMagnitude returns its surfaces unsorted",
    "weights.ts",
    "  return [...pa.keys()].filter((k) => pb.has(k) && pa.get(k) !== pb.get(k)).sort();",
    "  return [...pa.keys()].filter((k) => pb.has(k) && pa.get(k) !== pb.get(k));",
  ],
  [
    "bootRatioStability returns movers in registry order rather than worst-factor first",
    "weights.ts",
    "  moved.sort((a, b) => b.factor - a.factor);",
    "  void 0;",
  ],
  [
    "bootCountHistory walks ids unsorted",
    "weights.ts",
    "  for (const id of [...ids].sort()) {",
    "  for (const id of [...ids]) {",
  ],
  [
    "reconcile stops computing which surfaces moved leg",
    "weights.ts",
    "  const moved = [...observed]",
    "  const moved = [].concat([...observed].slice(0, 0))",
  ],
  [
    "reconcile compares the observed leg against the wrong recomputed one",
    "weights.ts",
    "    .filter(([id, leg]) => recomputed.has(id) && recomputed.get(id) !== leg)",
    "    .filter(([id]) => recomputed.has(id) && false)",
  ],
  [
    "median picks the upper-middle value for an even population",
    "weights.ts",
    "  return v.length % 2 === 1 ? (v[mid] ?? 0) : ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2;",
    "  return v[mid] ?? 0;",
  ],
  [
    "median stops sorting, so it reports whatever arrived in the middle",
    "weights.ts",
    "  const v = [...xs].sort((a, b) => a - b);\n  if (v.length === 0) return 0;",
    "  const v = [...xs];\n  if (v.length === 0) return 0;",
  ],
  [
    "bootRatioStability reports the corpus MAX instead of its median",
    "weights.ts",
    "      median: median(vals),",
    "      median: Math.max(...vals),",
  ],
  [
    "reconcile stops checking the dump composes into its own total",
    "weights.ts",
    "    if (composed !== dump.boots)",
    "    if (false)",
  ],
  [
    "reconcile stops reporting surfaces the run has and the registry does not",
    "weights.ts",
    "  const recordOnly = [...observed.keys()].filter((id) => !modelled.has(id)).sort();",
    "  const recordOnly = [];",
  ],
  [
    "legSeconds attributes every surface's seconds to leg 0",
    "weights.ts",
    "  for (const [id, leg] of assign) bins[leg] = (bins[leg] ?? 0) + (secs.get(id) ?? 0);",
    "  for (const [id] of assign) bins[0] = (bins[0] ?? 0) + (secs.get(id) ?? 0);",
  ],
  [
    "seamMagnitude reports surfaces that did NOT change leg",
    "weights.ts",
    "  return [...pa.keys()].filter((k) => pb.has(k) && pa.get(k) !== pb.get(k)).sort();",
    "  return [...pa.keys()].filter((k) => pb.has(k) && pa.get(k) === pb.get(k)).sort();",
  ],
  [
    "seedRates stops falling through to an older snapshot",
    "weights.ts",
    "      if (held === undefined) {",
    "      if (held === undefined && snap === newestFirst[0]) {",
  ],
  [
    "bootRatioStability reports the ratio newest-first, contradicting bootCountHistory",
    "weights.ts",
    "    const ratios = [...per]\n      .reverse()",
    "    const ratios = [...per]",
  ],
  [
    "bootCountHistory stops separating an arrival from a change",
    "weights.ts",
    "    if (boots[0] === undefined) arrived.push(id);",
    "    void id;",
  ],
  // `suiteMedians` had its own median plant until the three private copies were
  // collapsed into one exported `median`. Its anchor no longer exists, and the
  // central "median picks the upper-middle value" plant above covers every caller
  // instead. Removed rather than re-anchored: the class repair is what made the
  // per-site plant redundant, and keeping it would assert a code path that is gone.
  [
    "readRun stops summing child durations into seconds",
    "records.ts",
    "          seconds: children.reduce((a, c) => a + c.durationMs, 0) / 1000,",
    "          seconds: children.length,",
  ],
  [
    "readRun reads an ABSENT elapsed stamp as zero",
    "records.ts",
    '      if (existsSync(file)) elapsed.set(Number(el[1]), Number(readFileSync(file, "utf8").trim()));',
    '      elapsed.set(Number(el[1]), existsSync(file) ? Number(readFileSync(file, "utf8").trim()) : 0);',
  ],
  [
    "readRun loses each mutant's verdict",
    "records.ts",
    "          verdicts: new Map(j.outcomes.map((o) => [o.siteId, o.verdict])),",
    "          verdicts: new Map(),",
  ],
  [
    "readRun discards each child's suite name",
    "records.ts",
    "        const children = j.outcomes.flatMap((o) => [...(o.children ?? [])]);",
    "        const children = j.outcomes.flatMap((o) => [...(o.children ?? [])]).map((c) => ({ ...c, suite: 'x' }));",
  ],
];

let caught = 0;
const bad = [];
/** Files written under tests/ for one case, removed in that case's finally. */
const planted = [];
for (const [name, file, from, to] of DEFECTS) {
  const dir = mkdtempSync(join(tmpdir(), "fx-weight-plant-"));
  try {
    cpSync(SRC, join(dir, "mutationWeight"), { recursive: true });
    const target = join(dir, "mutationWeight", file);
    const text = readFileSync(target, "utf8");
    const hits = text.split(from).length - 1;
    if (hits !== 1) {
      console.log(`  ANCHOR-FAIL  ${name} (anchor occurs ${hits} times)`);
      bad.push(name);
      continue;
    }
    writeFileSync(target, text.replace(from, to));
    // Point the suite at the copy. The `@/lib/mutationWeight/...` specifier is what
    // the suite imports, so rewriting it is the whole redirection.
    const suite = readFileSync(SUITE, "utf8").replaceAll(
      "@/lib/mutationWeight/",
      `${join(dir, "mutationWeight")}/`,
    );
    // INSIDE tests/, because vitest's project includes are `tests/**` globs: a
    // suite written to a tmpdir matches no project, runs zero tests, and every
    // planted defect then reports as an escape. That is how the first version of
    // this harness scored 0 caught out of 15 while the suite was perfectly healthy.
    const copy = join(ROOT, "tests/mutationWeight", `__plant__.test.ts`);
    writeFileSync(copy, suite);
    planted.push(copy);
    let out = "";
    try {
      out = execFileSync("pnpm", ["exec", "vitest", "run", copy], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    if (/Error: Transform failed|SyntaxError|TS\d+:|Failed to load/.test(out)) {
      console.log(`  BROKEN-PLANT ${name}`);
      bad.push(name);
    } else if (/Tests\s+\d+ failed/.test(out) || /FAIL/.test(out)) {
      console.log(`  CAUGHT       ${name}`);
      caught += 1;
    } else {
      console.log(`  ESCAPED      ${name}`);
      bad.push(name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const f of planted.splice(0)) rmSync(f, { force: true });
  }
}
console.log(`\ncaught ${caught}, not caught ${bad.length}`);
if (bad.length > 0) process.exit(1);

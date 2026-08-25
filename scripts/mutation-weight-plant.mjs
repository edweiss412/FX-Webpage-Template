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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const ROOT = process.cwd();
// Defaults for an entry that names neither: a bare filename resolves under this
// root, and an entry with no suite is decided by this one. Both are what the
// original entries rely on, so generalising the harness left them untouched.
const DEFAULT_ROOT = "lib/mutationWeight";
const DEFAULT_SUITE = "tests/mutationWeight/instrument.test.ts";

/** file, a unique anchor, and what it becomes. */
const DEFECTS = [
  [
    "buildSeedTable judges completeness BEFORE merging the bootstrap overrides",
    "weights.ts",
    "const missing = surfaceIds.filter((id) => !table.has(id)).sort();",
    "const missing = surfaceIds.filter((id) => !fromRecords.has(id)).sort();",
  ],
  [
    "buildSeedTable drops the override instead of applying it",
    "weights.ts",
    "for (const [id, rate] of overrides) if (ids.has(id)) table.set(id, rate);",
    "for (const [id, rate] of overrides) if (!ids.has(id)) table.set(id, rate);",
  ],
  [
    "buildSeedTable silently ignores an override naming no such surface",
    "weights.ts",
    "const unmatched = [...overrides.keys()].filter((id) => !ids.has(id)).sort();",
    "const unmatched = [];",
  ],
  [
    "reconcile ignores the declared rate and weights by boots alone",
    "weights.ts",
    "w: v.boots * (v.millisPerBoot ?? 1)",
    "w: v.boots",
  ],
  [
    "reconcile prices a rate-less OLD dump at zero instead of one",
    "weights.ts",
    "(v.millisPerBoot ?? 1)",
    "(v.millisPerBoot ?? 0)",
  ],
  [
    "recoverModelled derives the mutant count from a PRICED weight",
    "weights.ts",
    "boots - acceptedCount * (suites - 1) - suites",
    "boots * millisPerBoot - acceptedCount * (suites - 1) - suites",
  ],
  [
    "recoverModelled drops the rate, so every reconciliation falls back to 1",
    "weights.ts",
    "    millisPerBoot,\n  };\n}",
    "    millisPerBoot: undefined,\n  };\n}",
  ],
  [
    "reconcile applies the rate to the mutant count rather than to boots",
    "weights.ts",
    "v.boots * (v.millisPerBoot ?? 1)",
    "v.mutants * (v.millisPerBoot ?? 1)",
  ],
  [
    "bootsOf miscomposes the boot count",
    "tests/mutation/source/shardPartition.ts",
    "return mutants.length + surface.accepted.length * (suites - 1) + suites;",
    "return mutants.length + surface.accepted.length * suites + suites;",
    "tests/mutation/source/shardPartition.test.ts",
  ],
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
    "    totals.set(leg, (totals.get(leg) ?? 0) + (secs.get(id) ?? 0));",
    "    totals.set(0, (totals.get(0) ?? 0) + (secs.get(id) ?? 0));",
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

/**
 * Two entries that MUST be refused, used by `--self-test`.
 *
 * The orphaned-anchor class is why this exists. A repair moved `legSeconds` out
 * from under an entry whose anchor then matched zero times, and because nobody
 * ran the harness the arc went on asserting a "37 plants, 0 escaped" baseline
 * that was false at the commit it cited. The harness DID have the refusal, so
 * the missing piece was never the check -- it was any executable statement that
 * the check still fires. These two entries are that statement, and they cost
 * nothing to run because both refusals short-circuit before vitest is spawned.
 */
const SELF_TEST_DEFECTS = [
  [
    "SELF-TEST: a target that does not exist is refused",
    "lib/mutationWeight/there-is-no-such-file.ts",
    "anything",
    "anything else",
  ],
  [
    "SELF-TEST: an anchor that matches nothing is refused",
    "weights.ts",
    "this string does not occur in weights.ts",
    "nor does this",
  ],
];

const SELF_TEST = process.argv.includes("--self-test");
const ENTRIES = SELF_TEST ? SELF_TEST_DEFECTS : DEFECTS;

let caught = 0;
const bad = [];
/** Why each `bad` entry was bad. A refusal and an escape are NOT the same outcome. */
const reason = new Map();
/** Files written under tests/ for one case, removed in that case's finally. */
const planted = [];
for (const entry of ENTRIES) {
  const [name, file, from, to, suitePath] = entry;
  // A bare filename means the default root, which is what the original 37 entries
  // use and why they neither move nor get rewritten. Anything containing a slash
  // is repo-relative, which is how an entry reaches outside lib/mutationWeight.
  const repoRel = file.includes("/") ? file : `${DEFAULT_ROOT}/${file}`;
  const srcDir = dirname(repoRel);
  const suiteRel = suitePath ?? DEFAULT_SUITE;
  const dir = mkdtempSync(join(tmpdir(), "fx-weight-plant-"));
  try {
    // The whole containing directory, not the single file: a target imports its
    // siblings by relative specifier, and a lone copy cannot resolve them.
    cpSync(join(ROOT, srcDir), join(dir, "src"), { recursive: true });
    const target = join(dir, "src", basename(repoRel));
    // An unresolvable target is a RED RUN, never a silent drop from the count.
    // Before this, a target outside the copied root threw ENOENT out of the loop
    // and killed the process mid-sweep; the entries after it were never attempted
    // and the printed total simply did not mention them. Reporting it in the
    // harness's own vocabulary and pushing it to `bad` is what makes the premise
    // executable rather than assumed.
    if (!existsSync(target)) {
      console.log(`  ANCHOR-FAIL  ${name} (target ${repoRel} not found)`);
      bad.push(name);
      reason.set(name, "ANCHOR-FAIL");
      continue;
    }
    const text = readFileSync(target, "utf8");
    const hits = text.split(from).length - 1;
    if (hits !== 1) {
      console.log(`  ANCHOR-FAIL  ${name} (anchor occurs ${hits} times)`);
      bad.push(name);
      reason.set(name, "ANCHOR-FAIL");
      continue;
    }
    // REPLACER FUNCTIONS, not replacement strings, at all three sites below.
    //
    // Every replacement here is computed at runtime -- a mutant body from the
    // table, and two scratch paths -- and a replacement STRING gives `$` special
    // meaning: `$&` inserts the match, `` $` `` everything before it, and `$'`
    // everything AFTER it, which silently duplicates the remainder of the file
    // into itself. A function's return value is inserted literally, so the class
    // cannot arise. No entry carries a `$` today, and that is not the argument:
    // this harness exists to plant arbitrary code, and a mutant that touches a
    // template literal carries `${` by construction.
    writeFileSync(
      target,
      text.replace(from, () => to),
    );
    // Point the suite at the copy. Two specifier shapes reach a target: the
    // `@/`-aliased form the instrument suite uses, and the relative form a suite
    // sitting beside its subject uses.
    const stem = basename(repoRel).replace(/\.ts$/, "");
    const scratch = join(dir, "src");
    const suite = readFileSync(join(ROOT, suiteRel), "utf8")
      .replaceAll(`@/${srcDir}/`, () => `${scratch}/`)
      .replaceAll(`from "./${stem}"`, () => `from "${join(scratch, stem)}"`);
    // INSIDE tests/, because vitest's project includes are `tests/**` globs: a
    // suite written to a tmpdir matches no project, runs zero tests, and every
    // planted defect then reports as an escape. That is how the first version of
    // this harness scored 0 caught out of 15 while the suite was perfectly healthy.
    // Written BESIDE its original, so the suite's OTHER relative imports still
    // resolve -- moving it to one fixed directory would break every sibling import
    // a suite outside tests/mutationWeight happens to have.
    const copy = join(ROOT, dirname(suiteRel), `__plant__.test.ts`);
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
      reason.set(name, "BROKEN-PLANT");
    } else if (/Tests\s+\d+ failed/.test(out) || /FAIL/.test(out)) {
      console.log(`  CAUGHT       ${name}`);
      caught += 1;
    } else {
      console.log(`  ESCAPED      ${name}`);
      bad.push(name);
      reason.set(name, "ESCAPED");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const f of planted.splice(0)) rmSync(f, { force: true });
  }
}
if (SELF_TEST) {
  // Inverted on purpose: here a refusal is the PASS. The harness is healthy when
  // both synthetic entries were refused and neither was scored as a success.
  // The REASON is the assertion, not the count. Both a refusal and an ESCAPE land
  // in `bad`, so a self-test that counted `bad.length` passed while the anchor
  // guard was deleted outright: the mismatched entry simply fell through to a
  // no-op replace, ran green, and was recorded as an escape instead. Found by
  // planting that deletion, which is the only reason this line says ANCHOR-FAIL.
  const refused = SELF_TEST_DEFECTS.filter(([n]) => reason.get(n) === "ANCHOR-FAIL");
  // The length check is not enough on its own: with SELF_TEST_DEFECTS emptied,
  // `0 === 0` reports OK and the self-test certifies a harness it never exercised.
  // A guard that passes when its own premise is absent is the shape this whole
  // Task exists to remove, so the premise is asserted rather than assumed.
  const ok =
    SELF_TEST_DEFECTS.length > 0 && refused.length === SELF_TEST_DEFECTS.length && caught === 0;
  const seen = SELF_TEST_DEFECTS.map(([n]) => reason.get(n) ?? "SCORED").join(", ");
  console.log(
    `\nself-test: ${refused.length}/${SELF_TEST_DEFECTS.length} refused as ANCHOR-FAIL ` +
      `[${seen}], ${caught} scored — ${ok ? "OK" : "HARNESS BROKEN"}`,
  );
  process.exit(ok ? 0 : 1);
}
console.log(`\ncaught ${caught}, not caught ${bad.length}`);
if (bad.length > 0) process.exit(1);

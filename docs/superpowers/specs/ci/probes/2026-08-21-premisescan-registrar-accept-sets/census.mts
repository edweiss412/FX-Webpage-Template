/**
 * The corpus census, as a re-runnable producer rather than a number in a table.
 *
 * §4's claim is not the absolute triple — it is that the triple does not MOVE
 * between the shipped scanner and the two derived variants. A total that holds
 * while individual records swap is the failure totals alone cannot detect, so
 * this prints one RECORD PER TEST as well, and the A/B/C comparison is a diff of
 * those records rather than of three integers.
 *
 * POPULATION IS DERIVED, never listed: `GUARD_SURFACES.flatMap(s => s.suitePaths)`,
 * deduped and sorted, which is the derivation
 * `tests/mutation/_metaPremiseContract.test.ts:373` uses to build its own
 * `suites`. A suite enrolled after this script was written is therefore censused
 * by default rather than silently omitted — the property a hand-list cannot have,
 * and the reason the earlier ad-hoc measurement went stale the moment `origin/main`
 * enrolled seven claim-sweep suites.
 *
 * Run from the repository root:
 *   pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/census.mts [--records]
 *
 * Exit 0 = census printed. Exit 2 = the census is VACUOUS and its numbers mean
 * nothing (see the two aborts below). Never exit 0 on a census it could not take.
 */
import { classifyTests } from "../../../../../../tests/mutation/source/premiseScan";
import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

// A derivation's failure mode is deriving NOTHING, which renders identically to
// correctly finding nothing. Both aborts below exist because a census over an
// empty population prints a clean, wrong, plausible zero.
if (suites.length < 50) {
  console.error(`census: derived only ${suites.length} suites from the registry; the derivation is broken`);
  process.exit(2);
}

type Row = { suite: string; name: string; line: number; verdict: string };
const rows: Row[] = [];
for (const suite of suites) {
  for (const t of classifyTests(ROOT, suite)) {
    rows.push({ suite, name: t.testName, line: t.line, verdict: t.verdict });
  }
}

if (rows.length === 0) {
  console.error(`census: ${suites.length} suites classified ZERO tests; the scanner reached nothing`);
  process.exit(2);
}

// The record channel is what makes this stronger than three integers, and it
// can die WITHOUT the totals moving: the first version of this script read
// `t.name`, a field `TestClassification` does not have, so all 2761 records
// printed an empty name and the A/B/C diff silently degraded to suite-level
// multiplicity while still exiting 0. A named test always has a name and an
// unnamed one gets a `<test at line N>` placeholder, so ZERO named records means
// the channel is dead, not that the corpus is anonymous. This abort has fired.
if (rows.every((r) => r.name === "")) {
  console.error(`census: ${rows.length} records and not one carries a name; the record channel is dead`);
  process.exit(2);
}

const count = (v: string) => rows.filter((r) => r.verdict === v).length;
console.log(`suites          ${suites.length}`);
console.log(`classified      ${rows.length}`);
console.log(`env-touching    ${count("environment-touching")}`);
console.log(`env-free        ${count("environment-free")}`);
console.log(`unclassifiable  ${count("unclassifiable")}`);

if (process.argv.includes("--records")) {
  console.log("");
  // A record is keyed by NAME, never by line. Line is provenance, not identity:
  // inserting a case anywhere in a suite re-keys every record below it, and a
  // diff then reports a wall of spurious moves that hides the real one. This is
  // the same churn `tests/mutation/source/registry.ts` carries in its
  // line-keyed accepted survivors, and `BL-MUTATION-SITEID-LINE-KEYED-CHURN`
  // is filed against it -- there is no reason to reproduce it here.
  const sorted = rows.slice().sort((a, b) => `${a.suite}\u0000${a.name}`.localeCompare(`${b.suite}\u0000${b.name}`));
  for (const r of sorted) {
    console.log([r.verdict, r.suite, r.name].join(" | "));
  }
}

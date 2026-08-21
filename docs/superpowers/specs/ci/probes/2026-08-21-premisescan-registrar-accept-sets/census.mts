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
  // Keyed by NAME plus an OCCURRENCE ORDINAL, never by line, and both halves
  // are load-bearing in opposite directions.
  //
  // Not by line, because inserting a case re-keys every record below it and the
  // diff becomes a wall of spurious moves hiding the real one -- the churn
  // `BL-MUTATION-SITEID-LINE-KEYED-CHURN` is filed against in the survivor
  // ledger, and no reason to reproduce it in a fresh instrument.
  //
  // But NAME ALONE IS NOT UNIQUE: 18 keys are duplicated on the live corpus
  // today, two of them in `tests/docs/interactionTimingScan.test.ts` under
  // "the boundary predicate ACCEPTS %s". With a name-only key, a scanner that
  // attributes an environment read to the WRONG one of two same-named
  // registrations emits a byte-identical record set -- wrong attribution, which
  // is one of the two directions the consequence bound forbids, rendering as no
  // change at all.
  //
  // The ordinal is the Nth registration of that name within that suite, in line
  // order. Unrelated insertions do not move it; a swap between two same-named
  // registrations does.
  const byKey = new Map<string, number>();
  const keyed = rows
    .slice()
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.line - b.line)
    .map((r) => {
      const base = `${r.suite}\u0000${r.name}`;
      const n = (byKey.get(base) ?? 0) + 1;
      byKey.set(base, n);
      return { ...r, ordinal: n };
    });
  keyed.sort((a, b) => `${a.suite}\u0000${a.name}\u0000${a.ordinal}`.localeCompare(`${b.suite}\u0000${b.name}\u0000${b.ordinal}`));
  for (const r of keyed) {
    console.log([r.verdict, r.suite, `${r.name} #${r.ordinal}`].join(" | "));
  }
}

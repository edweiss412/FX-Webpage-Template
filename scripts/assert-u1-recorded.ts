/**
 * scripts/assert-u1-recorded.ts
 *
 * The gate on U-1's RECORDING, and the second half of the plan's Task 8 command.
 *
 * U-1 asks whether removing a mid-fetch `<img>` from the document makes the
 * browser abandon its request. The design spec left it unratified, the e2e case
 * measures it, and this script's only job is to fail while the answer has not
 * been written down.
 *
 * IT PINS THE PARSED ANSWER, NOT THE PHRASING. An earlier draft defined the gate
 * as failing while §1.2 still contained the sentence saying the claim was
 * unsettled, which review round 4 correctly showed is satisfied by DELETING that
 * sentence and recording nothing. Prose guards close by pinning, so this parses
 * §1.2 for three things an author cannot phrase their way past:
 *
 *   1. a verdict token from a CLOSED set, so "it depends" cannot satisfy it
 *   2. the name of the e2e case that measured it, which must resolve to a real
 *      test in the spec file named beside it
 *   3. the date of the measurement
 *
 * Any of the three missing is a non-zero exit. Rewording the surrounding
 * paragraph changes nothing, because none of the three is a phrase the author
 * chooses.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SPEC = join(ROOT, "docs/superpowers/specs/2026-08-31-retry-check-in-design.md");
const E2E = join(ROOT, "tests/e2e/diagram-retry.spec.ts");

/** The closed set. A hedge is not a member, which is the whole point. */
const VERDICTS = ["ABANDONED", "CONTINUED"] as const;

const problems: string[] = [];

function section(md: string, heading: string): string | null {
  const at = md.indexOf(heading);
  if (at < 0) return null;
  const rest = md.slice(at + heading.length);
  const nextAt = rest.search(/\n#{2,3} /);
  return nextAt < 0 ? rest : rest.slice(0, nextAt);
}

const spec = readFileSync(SPEC, "utf8");
const body = section(spec, "### 1.2");
if (body === null) {
  // PREMISE. Every check below runs over `body`, so a missing section would
  // otherwise report a clean pass having read nothing at all.
  console.error("assert-u1-recorded: section 1.2 was not found in the design spec");
  process.exit(1);
}

// 1. The verdict, on its own labelled line so it is a record rather than a word
//    that happens to appear in the prose.
const verdictLine = /^\*\*U-1 VERDICT:\*\*\s*([A-Z]+)\s*$/m.exec(body);
const verdict = verdictLine?.[1];
if (verdict === undefined) {
  problems.push(
    'no "**U-1 VERDICT:** <token>" line in §1.2; the measurement has not been recorded',
  );
} else if (!(VERDICTS as readonly string[]).includes(verdict)) {
  problems.push(`U-1 verdict "${verdict}" is not one of ${VERDICTS.join(" / ")}`);
}

// 2. The case that measured it, resolving to a real test rather than a name.
const caseLine = /^\*\*U-1 MEASURED BY:\*\*\s*(.+?)\s*$/m.exec(body);
const caseName = caseLine?.[1]?.replace(/^`|`$/g, "");
if (caseName === undefined) {
  problems.push('no "**U-1 MEASURED BY:** <test name>" line in §1.2');
} else {
  const e2e = readFileSync(E2E, "utf8");
  if (!e2e.includes(caseName)) {
    problems.push(
      `§1.2 cites the case ${JSON.stringify(caseName)}, which does not appear in ` +
        "tests/e2e/diagram-retry.spec.ts",
    );
  }
}

// 3. The date, in the repo's ISO form.
const dateLine = /^\*\*U-1 MEASURED ON:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(body);
if (dateLine === null) {
  problems.push('no "**U-1 MEASURED ON:** YYYY-MM-DD" line in §1.2');
}

if (problems.length > 0) {
  console.error("assert-u1-recorded: §1.2 does not carry the measurement.");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `assert-u1-recorded: OK — U-1 is ${verdict}, measured ${dateLine?.[1]} by ${caseName}.`,
);

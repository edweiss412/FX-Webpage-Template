// The OTHER consumers of the changed delimiter walk, measured rather than argued.
//
// `matchBraceSpan` feeds six call sites besides the two the acceptance set
// exercises. Spec review round 3 finding 4 is right that opacity of the returned
// word does not by itself prove those consumers are unaffected: the attached
// path collects nested bodies, and the same matcher decides
// `acceptedExpansionOperand`'s whole-value test.
//
// So this asserts it. Eight inputs across the assignment/binding route, the
// here-string route, the whole-value expansion decision, compound arrays, an
// alias binding and a `$GITHUB_ENV` write, run against the MERGE-BASE scanner
// and against a candidate. Every one must agree, over the full record.
//
// `SCAN_MODULE=<path>` names the candidate; without it the probe compares the
// working tree against the merge-base, which before the repair lands is a
// VACUOUS comparison and says so.
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const TRACKED = "tests/cross-cutting/psqlStartupFiles/scan.ts";

/** One per consumer of the walk that the acceptance set does not exercise. */
const CASES: Array<[string, string]> = [
  ["assignment, whole-value expansion", `PG=\${U:-psql}\n"$PG" -X mydb`],
  ["assignment, crossing in operand", `PG=\${U:-$(echo )}; psql)}\n"$PG" -X mydb`],
  ["here-string binding", `read -r PG <<< p'sql'\n"$PG" -X mydb`],
  ["here-string, crossing in target", `read -r PG <<< \${U:-$(echo }; psql)}\n"$PG" -X mydb`],
  ["compound array value", `PG=(psql)\n"\${PG[0]}" -X mydb`],
  ["alias binding", `alias psql='pgcli -F'`],
  ["expansion operand, quoted", `PG=\${U:-'psql'}\n"$PG" -X mydb`],
  ["github env write", `echo "PG=psql" >> $GITHUB_ENV`],
];

type Scanner = {
  scanSource: (source: string, file: string) => Array<Record<string, unknown>>;
  scanShellIndirection: (source: string, file: string) => Array<Record<string, unknown>>;
};

const baseSha = execFileSync("git", ["-C", ROOT, "merge-base", "origin/main", "HEAD"], {
  encoding: "utf8",
}).trim();
const baselineDir = join(ROOT, "node_modules/.cache/bracecross-baseline");
mkdirSync(baselineDir, { recursive: true });
const baselinePath = join(baselineDir, `scan.${baseSha.slice(0, 12)}.consumers.ts`);
let baselineSource: string;
try {
  baselineSource = execFileSync("git", ["-C", ROOT, "show", `${baseSha}:${TRACKED}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  console.error(`ABORT: cannot read ${TRACKED} at merge-base ${baseSha}: ${(error as Error).message}`);
  process.exit(2);
}
writeFileSync(baselinePath, baselineSource);

const candidatePath = process.env.SCAN_MODULE ? resolve(process.env.SCAN_MODULE) : join(ROOT, TRACKED);
const base = (await import(pathToFileURL(baselinePath).href)) as Scanner;
const candidate = (await import(pathToFileURL(candidatePath).href)) as Scanner;
console.log(`merge-base: ${TRACKED} at ${baseSha.slice(0, 12)}`);
console.log(`candidate:  ${candidatePath}`);
const expectRepaired = process.argv.slice(2).includes("--expect-repaired");
const vacuous = readFileSync(candidatePath, "utf8") === baselineSource;
if (vacuous)
  console.log("NOTE: candidate is byte-identical to the merge-base — this comparison is VACUOUS.");

/** Every field of every record, derived rather than listed. */
const fingerprint = (scan: Scanner, source: string): string => {
  const render = (records: Array<Record<string, unknown>>): string =>
    JSON.stringify(
      records.map((r) =>
        Object.keys(r)
          .sort()
          .map((f) => (r[f] === undefined ? `${f}=<undefined>` : `${f}=${JSON.stringify(r[f])}`))
          .join("\t"),
      ),
    );
  return `${render(scan.scanSource(source, "x.sh"))}||${render(scan.scanShellIndirection(source, "x.sh"))}`;
};

/** The one route that is EXPECTED to move, and why. Found by this probe's own
 *  full-record comparison after a COUNT-based reading of the same eight routes
 *  reported all of them identical — the third time in this arc that presence
 *  hid an attribution change, and the first time it happened inside the
 *  verification rather than the thing verified. */
const EXPECTED_MOVEMENT: Record<string, { because: string; candidateDigest: string }> = {
  "here-string, crossing in target": {
    because:
      "bash PARSES this and RUNS psql once inside the substitution (probed: `read -r PG <<< ${U:-$(echo }; psql -c x)}` binds `}` and invokes psql), so the site IS nested. The merge-base reports nested:false — the wrong attribution this arc repairs — and the candidate reports nested:true. The movement is the repair working on exactly the crossing the ledger row names, reached through the here-string consumer rather than through a redirection target.",
    // The DESTINATION, not merely "differs from base". Diff review round 3
    // finding 1: this row recorded the transition in PROSE while the assertion
    // only required `base !== candidate`, so a candidate PRESERVING the wrong
    // attribution (`nested:false`) while perturbing an unrelated field
    // (`offset` 30 -> 31) scored "MOVED (recorded)" and PASSED. Presence versus
    // attribution, met a FOURTH time in this arc and again inside the
    // VERIFICATION rather than the thing verified.
    //
    // Digest of the candidate's FULL-RECORD fingerprint, derived from this
    // file's own CASES entry rather than retyped. Pinning the whole record and
    // not just `nested` is deliberate: a candidate with the right `nested` and
    // a wrong `offset` is still wrong, and a field-scoped assertion passes it.
    candidateDigest: "b304b2b53546",
  },
};

let differing = 0;
let unexpectedlyIdentical = 0;
let wrongDestination = 0;
console.log(`\n${"consumer".padEnd(36)} sites/hits (base -> candidate)`);
for (const [id, source] of CASES) {
  const b = fingerprint(base, source);
  const c = fingerprint(candidate, source);
  const counts = (scan: Scanner): string =>
    `${scan.scanSource(source, "x.sh").length}s/${scan.scanShellIndirection(source, "x.sh").length}a`;
  const same = b === c;
  const expected = EXPECTED_MOVEMENT[id];
  if (expected) {
    // A route declared to move must ACTUALLY move: an expectation that silently
    // stops applying is the fixture-goes-inert shape, and it reads as a pass.
    if (same && !vacuous) unexpectedlyIdentical++;
    // ...and it must move TO THE RECORDED DESTINATION. Difference alone is
    // satisfied by any perturbation, including one that keeps the very wrong
    // attribution the movement exists to repair.
    const actualDigest = createHash("sha1").update(c).digest("hex").slice(0, 12);
    if (!vacuous && actualDigest !== expected.candidateDigest) {
      wrongDestination++;
      console.log(`    DESTINATION MISMATCH: expected ${expected.candidateDigest}, got ${actualDigest}`);
      console.log(`    candidate record: ${c}`);
    }
    console.log(
      `${id.padEnd(36)} ${counts(base)} -> ${counts(candidate)}  ${same ? "NO LONGER MOVES" : "MOVED (recorded)"}`,
    );
    if (!same) console.log(`    why: ${expected.because}`);
  } else {
    if (!same) differing++;
    console.log(`${id.padEnd(36)} ${counts(base)} -> ${counts(candidate)}  ${same ? "IDENTICAL" : "DIFFERS"}`);
  }
  if (!same) {
    console.log(`    base:      ${b}`);
    console.log(`    candidate: ${c}`);
  }
}

const expectedCount = Object.keys(EXPECTED_MOVEMENT).length;
console.log(
  `\n${CASES.length - differing - expectedCount}/${CASES.length - expectedCount} unmoved consumer routes IDENTICAL, ${expectedCount} recorded movement(s)`,
);
if (vacuous) {
  console.log("(vacuous: nothing was actually compared)");
  // Exit 0 is correct BEFORE the repair lands and a false pass after it, which
  // is the same three-state reading `shapes.mts` gives its limit tally. Plan
  // review round 1 finding 7: no task pointed this probe at the implemented
  // walk, and without the flag a task that ran it too early would still be
  // green. `--expect-repaired` asserts the comparison actually happened.
  if (expectRepaired) {
    console.error(
      "FAIL under --expect-repaired: the candidate is byte-identical to the merge-base, so no consumer route was compared. Run this AFTER the repair lands.",
    );
    process.exit(1);
  }
  process.exit(0);
}
// ASSERTED. Round 3 finding 4's point is that these consumers are not covered by
// the acceptance set, so a printed table would leave them uncovered still.
if (differing > 0) {
  console.error(
    `FAIL: ${differing} UNDECLARED consumer route(s) MOVED. Each must be recorded with its bash oracle in EXPECTED_MOVEMENT, or repaired.`,
  );
  process.exit(1);
}
if (wrongDestination > 0) {
  console.error(
    `FAIL: ${wrongDestination} declared movement(s) did not reach the RECORDED destination. Difference from base is not the claim — the claim is WHICH record the candidate produces, and a candidate that keeps the wrong attribution while perturbing another field satisfies difference.`,
  );
  process.exit(1);
}
if (unexpectedlyIdentical > 0) {
  console.error(
    `FAIL: ${unexpectedlyIdentical} route(s) declared to move no longer do. A recorded movement that stops applying reads as a pass while proving nothing — re-read the declaration rather than deleting it.`,
  );
  process.exit(1);
}
console.log("PASS: every undeclared consumer route agrees with the merge-base scanner, and every declared movement still moves.");

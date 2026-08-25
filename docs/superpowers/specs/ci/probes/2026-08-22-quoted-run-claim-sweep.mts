// AC-10: every place in the corpus that asserts a quoted executable YAML scalar
// is NOT read — the claim this arc's repair falsifies.
//
// The first version of this sweep was two greps, and it was NON-DISCRIMINATING
// in the way this whole arc keeps finding: it required the fixture text and
// `toHaveLength(0)` on the SAME LINE, and in the known instance they are four
// lines apart, so it reported "no other executable assertion" for the wrong
// reason. It also matched a case-sensitive phrase and so missed a capitalized
// hit in a document its own disposition table claimed to have read.
//
// Two arms now, and both are windowed rather than line-bound:
//   PROSE      - a claim about a quoted run:/shell:/args:/entrypoint: scalar
//                sitting near a not-read word.
//   EXECUTABLE - a zero-assertion within a window of a quoted executable
//                scalar fixture.
//
// The sweep prints CANDIDATES first, then the SELF-TEST, then the gate verdict.
// The self-test ranges over the five REACHABLE declared sites -- not over the
// case that motivated this sweep, `psqlStartupFileSuppression.test.ts`, which is
// now one of the two EXEMPT sites: repairing it replaced the zero-assertion the
// discovery arm looks for, so the arm cannot see it any more and no widening
// would change that. A sweep that cannot find the sites it CAN reach reports
// clean for the wrong reason, so a
// missing self-test hit exits 2 rather than 0.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Dated execution records. Never corrected, so never swept. */
const HISTORICAL = [/^docs\/review-rounds\//, /^docs\/agents\/.*-\d{4}-\d{2}-\d{2}\.md$/];

const SCALAR = /quoted[^.\n]{0,60}\b(run|shell|args|entrypoint)\b|\b(run|shell|args|entrypoint):[^.\n]{0,60}quoted/i;
const NOT_READ =
  /\b(stays? (a )?(zero|limit)|declared miss|documented limit|not (read|recognized|seen)|declined|one word|unsignaled|no(t| ) report|unchanged|no flag|flag-shaped|left alone|never reached|scores? 0|zero persists)/i;
const ZERO_ASSERT = /toHaveLength\(0\)|toEqual\(\[\]\)|\.length\)\.toBe\(0\)/;
const QUOTED_FIXTURE = /run:\s*["']|args:\s*["']|entrypoint:\s*["']|shell:\s*["']/;
const WINDOW = 8;

const files = execFileSync("git", ["ls-files", "*.ts", "*.mts", "*.md"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !HISTORICAL.some((re) => re.test(f)));

type Hit = { file: string; line: number; arm: "PROSE" | "EXECUTABLE"; text: string };
const hits: Hit[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // PROSE: the claim may wrap, so look at this line joined with the next.
    const joined = `${line} ${lines[i + 1] ?? ""}`;
    if (SCALAR.test(joined) && NOT_READ.test(joined))
      hits.push({ file, line: i + 1, arm: "PROSE", text: line.trim().slice(0, 110) });
    // EXECUTABLE: a zero-assertion within WINDOW lines of a quoted fixture.
    if (ZERO_ASSERT.test(line)) {
      const from = Math.max(0, i - WINDOW);
      if (lines.slice(from, i + 1).some((l) => QUOTED_FIXTURE.test(l)))
        hits.push({ file, line: i + 1, arm: "EXECUTABLE", text: line.trim().slice(0, 110) });
    }
  }
}

// ---------------------------------------------------------------------------
// TWO JOBS, AND ONLY ONE OF THEM IS A GATE.
//
// The previous version gated on EVERY hit carrying a supersession marker, and
// plan review showed that gate is unsatisfiable: 13 of 26 hits are false
// positives in unrelated files — BACKLOG.md, four other specs — where "quoted",
// "limit" and "zero" merely co-occur near each other. No edit to this arc's seven
// claim sites can ever mark them, so the gate could never go green.
//
// Tightening the matcher until those 13 disappear is the ratchet: two rounds
// have already gone into this regex, and a prose recognizer over an open corpus
// does not converge. So the recognizer stops being an oracle. It DISCOVERS, and
// the gate ranges over a finite DECLARED list instead:
//
//   GATE      - the seven known claim sites each carry a supersession marker.
//               Finite, exact, closable.
//   SELF-TEST - the matcher must still find the five REACHABLE ones; the other
//               two are exempt, each with a recorded reason. A discovery arm
//               that has
//               gone blind reports clean for the wrong reason.
//   REPORT    - everything else is printed as a CANDIDATE for a human to
//               disposition. Surfaced, never enforced.
//
// Documented limit, stated rather than engineered away: the PROSE arm
// over-matches on word co-occurrence. It is a discovery aid whose false
// positives cost a reading, which is the conservative direction.

/** The claim sites this arc must supersede. Line numbers are drafting-time
 *  locators; the marker search is windowed, so a small drift is tolerated. */
const DECLARED: [file: string, nearLine: number, what: string][] = [
  ["tests/cross-cutting/psqlStartupFileSuppression.test.ts", 5156, "the declared-limit pin itself"],
  ["tests/cross-cutting/psqlStartupFiles/scan.ts", 241, "the scanner's own module header"],
  ["docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md", 293, "the recall-table note"],
  ["docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md", 325, "the documented-limit bullet"],
  ["docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md", 353, "§6 item 2, the canonical record"],
  ["docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md", 566, "disposition rows 6-8"],
  ["docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md", 623, "the limits list"],
];
const MARKER = /BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE|Superseded in part, 2026-08-22/;
const MARKER_WINDOW = 12;
const FIND_WINDOW = 3;

const fileLines = new Map<string, string[]>();
const linesOf = (f: string) => {
  if (!fileLines.has(f)) fileLines.set(f, readFileSync(f, "utf8").split("\n"));
  return fileLines.get(f)!;
};

// SELF-TEST: the discovery arm must reach every declared site it CAN reach.
//
// Two declared sites are exempt from this arm, each with its reason recorded
// rather than left silent. BOTH are still GATED — the gate reads the file
// directly and never consults the matcher — so the exemption costs coverage of
// the discovery arm alone.
//
// The two reasons are different in kind, and the second one generalises. A
// window limit is an accident of this matcher; a site whose repair DELETES the
// shape the matcher discovers is structural, and every executable claim site
// will hit it. The prose sites keep their claim and gain a note beneath it, so
// they stay discoverable. The executable site's claim WAS its zero-assertion,
// and replacing that zero with a hit is precisely what repairing it means — so
// the arm cannot see it afterwards, and no widening would change that.
//
// Widening the window to reach the first is the ratchet this sweep already
// stopped climbing once.
const MATCHER_CANNOT_REACH = new Map([
  [
    "docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md:325",
    "the documented-limit bullet wraps \"quoted `run:`\" and \"documented limit\" across three lines; the matcher's window is two",
  ],
  [
    "tests/cross-cutting/psqlStartupFileSuppression.test.ts:5156",
    "the EXECUTABLE arm discovers a zero-assertion beside a quoted fixture, and this site's repair replaced that zero with a hit assertion — the claim shape is gone because removing it is the repair",
  ],
]);
const unfound = DECLARED.filter(
  ([file, near]) =>
    !MATCHER_CANNOT_REACH.has(`${file}:${near}`) &&
    !hits.some((h) => h.file === file && Math.abs(h.line - near) <= FIND_WINDOW),
);
// An exemption that no longer names a DECLARED site is a stale exemption, and a
// stale exemption is how a real blindness gets waved through. Fail on it.
const orphanExemptions = [...MATCHER_CANNOT_REACH.keys()].filter(
  (key) => !DECLARED.some(([file, near]) => `${file}:${near}` === key),
);
if (orphanExemptions.length > 0) {
  console.error(`\nABORT: ${orphanExemptions.length} matcher exemption(s) name no DECLARED site:`);
  for (const key of orphanExemptions) console.error(`  ${key}`);
  process.exit(2);
}
if (unfound.length > 0) {
  console.error(
    `\nABORT: the matcher missed ${unfound.length} of ${DECLARED.length} DECLARED claim sites, so it ` +
      `cannot be trusted as a discovery arm anywhere it reports nothing:`,
  );
  for (const [file, near, what] of unfound) console.error(`  ${file}:~${near}  (${what})`);
  process.exit(2);
}

// REPORT: candidates the gate does not range over.
// Only the declared sites themselves are removed. Suppressing every hit in a
// DECLARED FILE was the previous cut, and it hid a live claim in the very file
// the arc was editing — the class of defect where naming part of a file exempts
// the rest of it.
const candidates = hits.filter(
  (h) => !DECLARED.some(([file, near]) => h.file === file && Math.abs(h.line - near) <= MARKER_WINDOW),
);
console.log(`\ncandidates the gate does not range over (${candidates.length}) — read, do not trust:`);
for (const c of candidates) console.log(`  ${c.file}:${c.line} [${c.arm}] ${c.text}`);

// GATE: every declared site carries a marker.
const unmarked = DECLARED.filter(([file, near]) => {
  const lines = linesOf(file);
  const from = Math.max(0, near - 1 - MARKER_WINDOW);
  const to = Math.min(lines.length, near - 1 + MARKER_WINDOW);
  return !lines.slice(from, to).some((l) => MARKER.test(l));
});

console.log(
  `\nself-test: all ${DECLARED.length - MATCHER_CANNOT_REACH.size} reachable declared sites found by the matcher ` +
    `(${MATCHER_CANNOT_REACH.size} exempt, each with a recorded reason).`,
);
if (unmarked.length > 0) {
  console.error(`\nFAIL: ${unmarked.length} of ${DECLARED.length} declared claim sites carry no supersession marker:`);
  for (const [file, near, what] of unmarked) console.error(`  ${file}:~${near}  (${what})`);
  process.exit(1);
}
console.log(`PASS: all ${DECLARED.length} declared claim sites are superseded.`);

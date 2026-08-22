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
// The sweep prints a SELF-TEST first: it must find the known instance at
// tests/cross-cutting/psqlStartupFileSuppression.test.ts. A sweep that cannot
// find the case that motivated it reports clean for the wrong reason, so a
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

// The self-test ranges over EVERY known instance, not one. A sweep is only
// trustworthy where it has been shown to fire, and each of these was a place an
// earlier version of this sweep missed.
const SELF_TEST: [file: string, nearLine: number][] = [
  ["tests/cross-cutting/psqlStartupFileSuppression.test.ts", 5156],
  ["tests/cross-cutting/psqlStartupFiles/scan.ts", 232],
  ["docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md", 346],
  ["docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md", 566],
  ["docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md", 615],
  ["docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md", 178],
];
const SELF_TEST_WINDOW = 3;
const missed = SELF_TEST.filter(
  ([file, near]) => !hits.some((h) => h.file === file && Math.abs(h.line - near) <= SELF_TEST_WINDOW),
);
if (missed.length > 0) {
  console.error(
    `\nABORT: the sweep missed ${missed.length} of ${SELF_TEST.length} KNOWN instances, so it cannot be ` +
      `trusted where it reports nothing:`,
  );
  for (const [file, near] of missed) console.error(`  ${file}:~${near}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The gate. Finding the claim is half the job; the earlier version stopped
// there and so the ENTIRELY UNREPAIRED tree passed it — it proved the sweep
// worked, never that the work was done. Every LIVE hit must now carry a
// supersession marker near it, and every file that carries none must be an
// EXPLICITLY exempt one with its reason recorded here. Default-deny: a file
// nobody has thought about fails.
const MARKER = /BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE|Superseded in part, 2026-08-22/;
const MARKER_WINDOW = 12;

/** Files where the claim stands uncorrected, each with the reason it may. */
const EXEMPT: [pattern: RegExp, reason: string][] = [
  [/^docs\/review-rounds\//, "dated round record; those are never corrected"],
  [
    /^docs\/superpowers\/plans\/2026-08-17-shell-binding-mixed-quoted-value\.md$/,
    "execution record of a completed arc",
  ],
  [
    /^docs\/superpowers\/specs\/ci\/probes\/2026-08-17-/,
    "dated probe record; its 'scores 0 today' is scoped to its own date, which is what makes a dated record safe to leave",
  ],
  [/^tests\/specLint\/__fixtures__\//, "copied fixture pinning a document's shape, not the scanner's behaviour"],
  [/^tests\/docs\/_retiredIdentifiers\.ts$/, "ledger reconciliation record"],
  [
    /^docs\/superpowers\/(specs\/ci\/2026-08-22-workflow-run-scalar-yaml-decode-design|plans\/2026-08-22-workflow-run-scalar-yaml-decode)\.md$/,
    "this arc's own spec and plan; they describe the retirement rather than assert the zero",
  ],
  [/^tests\/cross-cutting\/workflowActivation\.test\.ts$/, "different subject; matched on shape, not on this claim"],
  [/^docs\/superpowers\/specs\/ci\/probes\/2026-08-22-/, "this arc's own probes"],
];

const fileText = new Map<string, string[]>();
const linesOf = (f: string) => {
  if (!fileText.has(f)) fileText.set(f, readFileSync(f, "utf8").split("\n"));
  return fileText.get(f)!;
};

const unrepaired: string[] = [];
for (const h of hits) {
  const exemption = EXEMPT.find(([re]) => re.test(h.file));
  if (exemption) continue;
  const lines = linesOf(h.file);
  const from = Math.max(0, h.line - 1 - MARKER_WINDOW);
  const to = Math.min(lines.length, h.line - 1 + MARKER_WINDOW);
  if (!lines.slice(from, to).some((l) => MARKER.test(l)))
    unrepaired.push(`${h.file}:${h.line} [${h.arm}] ${h.text}`);
}

console.log(`\nexemptions in force:`);
for (const [re, reason] of EXEMPT) console.log(`  ${re.source}  -- ${reason}`);

if (unrepaired.length > 0) {
  console.error(
    `\nFAIL: ${unrepaired.length} live claim(s) carry no supersession marker within ${MARKER_WINDOW} lines. ` +
      `Each must be superseded, or added to EXEMPT with the reason it may stand:`,
  );
  for (const u of unrepaired) console.error("  " + u);
  process.exit(1);
}
console.log(`self-test: all ${SELF_TEST.length} known instances found — the sweep discriminates.`);
console.log("PASS: every live claim carries a supersession marker.");

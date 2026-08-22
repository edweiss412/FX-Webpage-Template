/**
 * Citation oracle for the red-reason arc (plan §0 and §3).
 *
 * The plan's §0 table maps a `file:line` citation to the exact content that line
 * holds. The closeout obligation is to RE-READ each one rather than confirm it
 * resolves, because `RED_TARGET_INVALID` checks range and tracking, never
 * content. This makes that obligation a command instead of a promise.
 *
 * It exists because the same defect recurred through four plan review rounds.
 * Round 4 measured the reason: the change begins at the type declarations at
 * lines 605 and 610, above every other cited line, so applying it shifts them
 * all. Reasoning about which citations move is exactly where this went wrong,
 * three drafts running, so the reasoning is replaced by a read.
 *
 * The table is parsed from the plan rather than duplicated here. A second copy
 * would drift from the first, which is the defect one level up.
 */
import { readFileSync } from "node:fs";

const PLAN = "docs/superpowers/plans/2026-08-21-speclint-red-reason-verification.md";
const ROW = /^\| `([^`]+):(\d+)` \| `([^`]+)` \|$/;

const rows: { file: string; line: number; want: string }[] = [];
for (const raw of readFileSync(PLAN, "utf8").split("\n")) {
  const m = ROW.exec(raw.trim());
  if (m === null) continue;
  // Markdown table cells escape a literal pipe, so the quoted content is
  // unescaped before comparison. Elisions are NOT handled and must not be used:
  // a cell quotes a literal substring of the line, or the check means nothing.
  rows.push({ file: m[1]!, line: Number(m[2]), want: m[3]!.replace(/\\\|/g, "|") });
}

// Premise: the table must have been FOUND. A parse that silently matches nothing
// would report a clean run over an empty set, which is the shape this arc spent
// a spec round removing from its own reach oracle.
if (rows.length < 4)
  throw new Error(
    `citation floor: parsed ${rows.length} table rows from ${PLAN}, expected at least 4`,
  );

const failures: string[] = [];
for (const r of rows) {
  const lines = readFileSync(r.file, "utf8").split("\n");
  const actual = lines[r.line - 1];
  if (actual === undefined) {
    failures.push(`${r.file}:${r.line} is out of range (file has ${lines.length} lines)`);
    continue;
  }
  // Containment, not equality: the table quotes the meaningful part of a line,
  // not its indentation.
  if (!actual.includes(r.want))
    failures.push(`${r.file}:${r.line}\n      claims: ${r.want}\n      holds : ${actual.trim()}`);
}

// COMPLETENESS. The check above proves every LISTED citation still holds. It
// cannot prove the list is complete, which is a different claim and the one that
// went wrong: §3's earlier site list covered the plan and this directory and
// omitted the SPEC entirely, including the only citation of line 906.
//
// So the list is DERIVED rather than enumerated. Every `redContract.ts:<line>`
// occurrence across the arc's documents must appear as a row above, and every row
// must be cited somewhere. A new citation to an unlisted line fails here instead
// of being noticed three rounds later.
const SCANNED = [
  PLAN,
  "docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md",
  "probe/reach.mts",
  "probe/citations.mts",
  "probe/population.mts",
];
const TARGET = "lib/specLint/redContract.ts";
const declared = new Set(rows.filter((r) => r.file === TARGET).map((r) => r.line));
const cited = new Map<number, string[]>();
for (const f of SCANNED) {
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    // A table row is itself an occurrence of the citation it declares, so
    // counting it would make every declared row look cited and the DEAD-row
    // check could never fire. Skipping the rows is what keeps that half honest.
    if (ROW.test(raw.trim())) continue;
    for (const m of raw.matchAll(/redContract\.ts:(\d+)/g)) {
      const line = Number(m[1]);
      cited.set(line, [...(cited.get(line) ?? []), f]);
    }
  }
}
for (const [line, where] of [...cited].sort((a, b) => a[0] - b[0]))
  if (!declared.has(line))
    failures.push(
      `UNACCOUNTED citation ${TARGET}:${line}, cited in ${[...new Set(where)].join(", ")}, is not a row in the plan's table`,
    );
// The converse is deliberately NOT checked. A row that no prose cites is not
// stale: the table is the closeout's list of lines to re-read, and a line can
// earn a row by being EDITED (605, 610) rather than by being quoted. A DEAD-row
// check was written here first, fired on exactly those rows, and was removed
// rather than worked around, because it asserted a claim the table never made.

if (failures.length > 0) {
  console.error(`citation oracle FAILED (${failures.length} problem(s) over ${rows.length} rows):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `citation oracle OK: ${rows.length} rows hold, and every ${TARGET} citation across ${SCANNED.length} files is accounted for`,
);

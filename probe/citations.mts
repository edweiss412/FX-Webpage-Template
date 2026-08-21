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

if (failures.length > 0) {
  console.error(`citation oracle FAILED (${failures.length} of ${rows.length} rows):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`citation oracle OK: ${rows.length} cited lines still hold what the plan says`);

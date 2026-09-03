/**
 * Opt-in self-reference guard for plan documents.
 *
 * WHY THIS EXISTS. Plan review round 4 of `feat/forced-colors-pass` returned five
 * findings and two were pure bookkeeping left by round 3's own restructure: an
 * acceptance criterion mapped to a task that had been renumbered, a repair count
 * surviving in two task bodies after the set shrank, a family heading declaring
 * four rows above a list of five. None was a design defect and every one cost a
 * reviewer's attention. That is the documented "the repair's own tidy-up is a
 * defect site" class, and it recurs on exactly the plans that get restructured
 * most, which are the ones under active review.
 *
 * Both shapes are derivable from the document, so neither needs a reader:
 *
 *   1. Every `Task N` the prose mentions resolves to a `## Task N` heading in the
 *      same file.
 *   2. A heading declaring `(N rows)` is followed by exactly N table data rows
 *      before the next heading.
 *
 * OPT-IN, and deliberately. A corpus-wide version of rule 1 reports 67 of the
 * plans in this tree, almost all of them legitimately: a multi-file plan unit
 * refers to tasks in its sibling files, and a handoff refers to the plan it hands
 * off. Enrolment is DECLARED rather than inferred, matching the task-enrollment
 * convention, so a plan that has not opted in is untouched and the guard costs
 * nothing until someone uses it.
 *
 * A plan opts in with this line, anywhere in the file:
 *
 *     <!-- self-reference: checked -->
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

import { walkPlansTree } from "./_invariant8Closeout";

const ROOT = process.cwd();
const PLANS_ROOT = join(ROOT, "docs/superpowers/plans");
const OPT_IN = "<!-- self-reference: checked -->";

const HEADING = /^#{2,4} /;
const TASK_HEADING = /^#{2,4} Task (\d+)\b/;
const TASK_REFERENCE = /\bTask (\d+)\b/g;
const ROW_COUNT = /\((\d+) rows?\)/;
/** A markdown table separator, which is formatting rather than a row. */
const TABLE_SEPARATOR = /^\|[\s:|-]+\|$/;

type Enrolled = { readonly path: string; readonly lines: readonly string[] };

function enrolledPlans(): Enrolled[] {
  return walkPlansTree(PLANS_ROOT)
    .map((rel) => ({ rel, text: readFileSync(join(PLANS_ROOT, rel), "utf8") }))
    .filter(({ text }) => text.includes(OPT_IN))
    .map(({ rel, text }) => ({ path: rel, lines: text.split("\n") }));
}

const PLANS = enrolledPlans();

// The guard's own premise: a walk that reached nothing makes every case below
// vacuously true, which is the failure a conditional guard is most exposed to.
premise("the walk finds at least one enrolled plan", PLANS.length, 0);

describe("plan self-reference (opt-in)", () => {
  it("finds the enrolled plans", () => {
    expect(PLANS.map((p) => p.path)).toContain("2026-09-01-forced-colors-pass.md");
  });

  it("resolves every Task reference to a heading in the same file", () => {
    const dangling: string[] = [];
    for (const { path, lines } of PLANS) {
      const headings = new Set<number>();
      for (const line of lines) {
        const m = TASK_HEADING.exec(line);
        if (m) headings.add(Number(m[1]));
      }
      // A file with no task headings is not making self-references to check.
      if (headings.size === 0) continue;
      for (const [index, line] of lines.entries()) {
        if (TASK_HEADING.test(line)) continue;
        for (const m of line.matchAll(TASK_REFERENCE)) {
          const n = Number(m[1]);
          if (!headings.has(n)) dangling.push(`${path}:${index + 1} Task ${n}`);
        }
      }
    }
    expect(
      dangling,
      "a Task reference with no matching heading — the shape a renumber leaves behind",
    ).toEqual([]);
  });

  it("matches every declared row count to the table beneath it", () => {
    const mismatched: string[] = [];
    for (const { path, lines } of PLANS) {
      const headingLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => HEADING.test(line))
        .map(({ index }) => index);

      for (const [k, start] of headingLines.entries()) {
        const declared = ROW_COUNT.exec(lines[start] ?? "");
        if (!declared) continue;
        const end = headingLines[k + 1] ?? lines.length;
        const tableLines = lines
          .slice(start + 1, end)
          .filter((line) => line.startsWith("|") && !TABLE_SEPARATOR.test(line));
        // The header row is formatting, not data.
        const dataRows = Math.max(tableLines.length - 1, 0);
        const want = Number(declared[1]);
        if (dataRows !== want) {
          mismatched.push(`${path}:${start + 1} declares ${want}, table holds ${dataRows}`);
        }
      }
    }
    expect(
      mismatched,
      "a heading whose declared row count disagrees with its own table",
    ).toEqual([]);
  });
});

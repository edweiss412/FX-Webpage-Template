/**
 * AC declaration grammar — corpus measurement.
 *
 * Question: can "a DECLARED acceptance criterion" be recognized from a plan's
 * body, and what would each candidate grammar flag across the live corpus?
 *
 * v2, after spec review R1 finding 2 refuted v1's numbers. Three defects, all
 * corpus-demonstrated, all repaired here:
 *   (a) the ID regex accepted only dot-separated segments, so the live
 *       hyphenated id `AC-2b-pattern`
 *       (docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md:24)
 *       split into `AC-2b`. The grammar is now taskContract.ts:38's, verbatim.
 *   (b) secondary ids were collected from the first 200 CHARACTERS of a
 *       declaring line, so a cross-reference to another document's id counted
 *       as a declaration here — `AC-11.11` at
 *       docs/superpowers/plans/2026-08-09-help-report-surface.md:61, on a line
 *       that declares AC-6. Collection now stops at the first sentence end.
 *   (c) the same 200-char window truncated CITED ids on long marker lines.
 *       Marker parsing now reads the whole line.
 *
 * v3, after spec review R2 findings 1 and 3, plus the migration classification.
 * Two more defects, both live-corpus:
 *   (d) SECONDARY-ID COLLECTION IS GONE. A bullet declares its LEADING id and
 *       nothing else. v2 cut at the first sentence end, which does not help when
 *       the whole line is one sentence: `- **AC-6** - master spec ... note;
 *       AC-11.11 carries r12.` still collected AC-11.11, an id owned by another
 *       document entirely. Four of the flagged ids were foreign ids picked up
 *       this way (AC-12b, AC-11.11, AC-6.18, AC-10b), each of them secondary.
 *       Dropping the rule removes the whole class and is a NARROWING, not a
 *       widening: 25 plans / 40 ids becomes 19 / 33.
 *   (e) the declaration regex had no token-end boundary, so `AC-1` matched
 *       inside `AC-1..AC-7` at
 *       docs/superpowers/plans/2026-08-17-speclint-prose-consistency-arms.md:175.
 *       Copying taskContract.ts:38's id text did not copy the delimiter its
 *       marker grammar supplies around it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("grep", ["-rl", "<!-- tasks: depth=", "docs/superpowers/plans/"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");

/** lib/specLint/taskContract.ts:38, verbatim — dots AND hyphens separate segments. */
const ID_SRC = "AC-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*";

/** A list item or ATX heading whose content BEGINS with the id. */
/** The id must END at a token boundary: `AC-1..AC-7` declares nothing. */
const END = "(?![A-Za-z0-9-]|\\.[A-Za-z0-9])";
const LIST_DECL = new RegExp(`^\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s*)?(?:[*_\`]{0,3})(${ID_SRC})${END}`);
const HEAD_DECL = new RegExp(`^#{1,6}\\s+(?:[*_\`]{0,3})(${ID_SRC})${END}`);
const MARKER = /^\s*<!--\s*task:/;
const AC_FIELD = /\bac=([A-Za-z0-9.,-]+)/;

type Row = { file: string; declared: string[]; cited: string[]; unclaimed: string[]; undeclared: string[] };
const rows: Row[] = [];

for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  const declared = new Set<string>();
  const cited = new Set<string>();
  for (const l of lines) {
    if (MARKER.test(l)) {
      const m = AC_FIELD.exec(l);
      if (m) for (const id of m[1]!.split(",")) if (/^AC-/.test(id)) cited.add(id);
      continue;
    }
    const d = LIST_DECL.exec(l) ?? HEAD_DECL.exec(l);
    if (d) declared.add(d[1]!); // LEADING id only — see (d)
  }
  const unclaimed = [...declared].filter((i) => !cited.has(i)).sort();
  const undeclared = [...cited].filter((i) => !declared.has(i)).sort();
  rows.push({ file: f, declared: [...declared].sort(), cited: [...cited].sort(), unclaimed, undeclared });
}

const withDecl = rows.filter((r) => r.declared.length > 0);
console.log(`plans: ${rows.length}`);
console.log(`plans declaring >=1 AC under the body grammar: ${withDecl.length}`);
console.log(`plans whose markers cite >=1 AC: ${rows.filter((r) => r.cited.length > 0).length}`);
console.log(`plans flagged UNCLAIMED (declared, no marker cites it): ${rows.filter((r) => r.unclaimed.length > 0).length}`);
console.log(`plans flagged UNDECLARED (marker cites an id the grammar does not declare): ${rows.filter((r) => r.undeclared.length > 0).length}`);
console.log(`  ... restricted to plans that declare at least one id: ${rows.filter((r) => r.undeclared.length > 0 && r.declared.length > 0).length}`);
console.log("");
console.log("=== UNCLAIMED detail ===");
for (const r of rows.filter((x) => x.unclaimed.length > 0)) console.log(`${r.file}\n    unclaimed: ${r.unclaimed.join(", ")}`);
console.log("");
console.log("=== UNDECLARED detail (plans that DO declare) ===");
for (const r of rows.filter((x) => x.undeclared.length > 0 && x.declared.length > 0))
  console.log(`${r.file}\n    undeclared: ${r.undeclared.join(", ")}`);

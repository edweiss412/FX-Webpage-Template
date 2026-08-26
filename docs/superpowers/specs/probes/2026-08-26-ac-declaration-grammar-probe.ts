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
const ID_G = new RegExp(ID_SRC, "g");

/** A list item or ATX heading whose content BEGINS with the id. */
const LIST_DECL = new RegExp(`^\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s*)?(?:[*_\`]{0,3})(${ID_SRC})`);
const HEAD_DECL = new RegExp(`^#{1,6}\\s+(?:[*_\`]{0,3})(${ID_SRC})`);
const MARKER = /^\s*<!--\s*task:/;
const AC_FIELD = /\bac=([A-Za-z0-9.,-]+)/;

/**
 * Secondary ids on a declaring line, up to the FIRST SENTENCE END.
 * `- AC-10 no in-flow growth + AC-10b real-browser containment.` declares two.
 * `- **AC-6** — master spec §13.2.1; AC-11.11 carries r12.` declares one: the
 * cross-reference sits after the sentence that introduces AC-6... which is the
 * same sentence. So the cut is the first `. ` or end-of-line, and a
 * cross-reference INSIDE the first sentence is a known over-count, reported
 * separately below rather than hidden.
 */
function declaredOn(line: string): string[] {
  const stop = line.search(/\.(?:\s|$)/);
  const head = stop === -1 ? line : line.slice(0, stop);
  ID_G.lastIndex = 0;
  return [...head.matchAll(ID_G)].map((m) => m[0]);
}

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
    if (d) for (const id of declaredOn(l)) declared.add(id);
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

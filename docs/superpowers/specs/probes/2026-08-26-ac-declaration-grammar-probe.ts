import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = execFileSync("grep", ["-rl", "<!-- tasks: depth=", "docs/superpowers/plans/"], {
  encoding: "utf8",
}).trim().split("\n");

const ID_G = /\bAC-[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*\b/g;
// Candidate DECLARATION grammar, drawn from the corpus survey:
//  - a list item whose content begins with the id (bold/italic/backtick wrappers allowed)
//  - an ATX heading whose text begins with the id
// A bullet may declare more than one id when they are joined before the first
// separator (`- AC-10 … + AC-10b …` is the live sub-id edge).
const LIST_DECL = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(?:[*_`]{0,3})(AC-[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/;
const HEAD_DECL = /^#{1,6}\s+(?:[*_`]{0,3})(AC-[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/;
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
    if (d) {
      declared.add(d[1]!);
      // sub-id edge: ids joined on the same bullet before any sentence end
      const head = l.slice(0, 200);
      ID_G.lastIndex = 0;
      for (const m of head.matchAll(ID_G)) declared.add(m[0]);
    }
  }
  const unclaimed = [...declared].filter((i) => !cited.has(i)).sort();
  const undeclared = [...cited].filter((i) => !declared.has(i)).sort();
  rows.push({ file: f, declared: [...declared].sort(), cited: [...cited].sort(), unclaimed, undeclared });
}

const withDecl = rows.filter((r) => r.declared.length > 0);
const withCites = rows.filter((r) => r.cited.length > 0);
console.log(`plans: ${rows.length}`);
console.log(`plans declaring >=1 AC in the candidate grammar: ${withDecl.length}`);
console.log(`plans whose markers cite >=1 AC: ${withCites.length}`);
console.log(`plans flagged UNCLAIMED (declared, no marker cites it): ${rows.filter(r=>r.unclaimed.length>0).length}`);
console.log(`plans flagged UNDECLARED (marker cites an id no declaration shape declares): ${rows.filter(r=>r.undeclared.length>0).length}`);
console.log(`  ... of those, restricted to plans that DECLARE at least one AC: ${rows.filter(r=>r.undeclared.length>0 && r.declared.length>0).length}`);
console.log("");
console.log("=== UNCLAIMED detail ===");
for (const r of rows.filter((x) => x.unclaimed.length > 0))
  console.log(`${r.file}\n    unclaimed: ${r.unclaimed.join(", ")}`);

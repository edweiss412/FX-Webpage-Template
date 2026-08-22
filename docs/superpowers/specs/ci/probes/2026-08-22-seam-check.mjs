// AC-8: no line the diff touches falls inside the delimiter-walk seam reserved
// for arc-bracecross.
//
// Three defects were found by attacking earlier versions of this gate, and each
// one is why a piece of this is shaped the way it is.
//
// 1. Git's `@@` hunk header names the ENCLOSING function, and most of this seam
//    is nested arrows, so a header-pattern check can never match one. A mutant
//    planted in `closeDoubleQuoted` passed such a check. Ranges therefore come
//    from the TypeScript parser.
// 2. A hand-written six-name list missed `closeAnsiC`, `closingBacktick` and —
//    worse — `attachedTargetEnd`, the OUTER walk that lexically contains four of
//    the six it did name. The cover is derived BIDIRECTIONALLY: callees reach
//    the helpers, callers reach the walk that owns them. A callee-only closure
//    is blind to its own parent.
// 3. A pure deletion has a new-side hunk count of 0, so a new-side-only parse
//    sees no changed line at all and every deletion inside the seam passed. Both
//    sides are read, each against the seam as it exists in ITS OWN revision.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const FILE = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const BASE = process.env.SEAM_BASE ?? "origin/main";
const SEED = "openerEnd";
const FAMILY = /^(matchBrace|closingBacktick)/;

/** Function-valued declarations, by name, with line ranges. */
function declsOf(text, label) {
  const sf = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const decls = new Map();
  const collect = (node) => {
    let name = null;
    if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
    else if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) name = node.name.text;
    if (name && !decls.has(name))
      decls.set(name, { node, range: [lineOf(node.getStart(sf)), lineOf(node.getEnd())] });
    ts.forEachChild(node, collect);
  };
  collect(sf);
  return decls;
}

const callsIn = (node) => {
  const out = new Set();
  const walk = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) out.add(n.expression.text);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(node, walk);
  return out;
};

/**
 * The seam, DERIVED and BOUNDED.
 *
 * `core` is the transitive CALLEE closure of `openerEnd` plus the top-level
 * `matchBrace*` / `closingBacktick` family it bottoms out in. Then each core
 * member's LEXICAL ANCESTORS are added, which is how `attachedTargetEnd` — the
 * outer walk that contains four of the helpers — is reached without naming it.
 *
 * Containment, not calling, is the owner relation, and the difference is the
 * whole file. `lexShellWords` CALLS `matchBrace` but does not contain it, so a
 * caller step pulls `lexShellWords` in and its callee closure then swallows
 * everything: measured at 90 members against a real seam of nine. Ancestors are
 * bounded by nesting depth by construction.
 */
const SEAM_CEILING = 20;
function seamOf(decls, label) {
  if (!decls.has(SEED)) {
    console.error(`ABORT: seed \`${SEED}\` not found in ${label} — the seam cannot be derived, so this check must not report clean.`);
    process.exit(2);
  }
  const calls = new Map([...decls].map(([n, d]) => [n, callsIn(d.node)]));
  const seam = new Set([SEED, ...[...decls.keys()].filter((n) => FAMILY.test(n))]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const name of [...seam])
      for (const c of calls.get(name) ?? [])
        if (decls.has(c) && !seam.has(c)) { seam.add(c); grew = true; }
  }
  const byNode = new Map([...decls].map(([n, d]) => [d.node, n]));
  for (const name of [...seam])
    for (let p = decls.get(name).node.parent; p; p = p.parent)
      if (byNode.has(p)) seam.add(byNode.get(p));
  if (seam.size > SEAM_CEILING) {
    console.error(`ABORT: derived seam is ${seam.size} members in ${label}, over the ceiling of ${SEAM_CEILING} — the derivation has stopped discriminating and must not report clean.`);
    process.exit(2);
  }
  return new Map([...seam].map((n) => [n, decls.get(n).range]));
}

const headText = readFileSync(FILE, "utf8");
const baseText = execFileSync("git", ["show", `${BASE}:${FILE}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const headSeam = seamOf(declsOf(headText, FILE), `${FILE}@HEAD`);
const baseSeam = seamOf(declsOf(baseText, FILE), `${FILE}@${BASE}`);

// BOTH hunk sides. A deletion lives only on the old side; an addition only on
// the new. Each is judged against the seam of the revision it belongs to.
const diff = execFileSync("git", ["diff", "-U0", BASE, "--", FILE], { encoding: "utf8" });
const oldLines = [], newLines = [];
for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
  const oStart = Number(m[1]), oCount = m[2] === undefined ? 1 : Number(m[2]);
  const nStart = Number(m[3]), nCount = m[4] === undefined ? 1 : Number(m[4]);
  for (let i = 0; i < oCount; i++) oldLines.push(oStart + i);
  for (let i = 0; i < nCount; i++) newLines.push(nStart + i);
}

const violations = [];
const check = (lines, seam, side) => {
  for (const line of lines)
    for (const [name, [lo, hi]] of seam)
      if (line >= lo && line <= hi) violations.push(`${side} ${FILE}:${line} inside ${name} (${lo}-${hi})`);
};
check(newLines, headSeam, "added/changed");
check(oldLines, baseSeam, "deleted/changed");

console.log(`derived seam, HEAD (${headSeam.size} members):`);
for (const [n, [lo, hi]] of [...headSeam].sort((a, b) => a[1][0] - b[1][0]))
  console.log(`  ${n.padEnd(24)} ${lo}-${hi} (${hi - lo + 1})`);
console.log(`hunk lines: new-side ${newLines.length}, old-side ${oldLines.length}`);
if (violations.length) {
  console.error(`FAIL: ${violations.length} line(s) touch the arc-bracecross seam:`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("PASS: the diff touches no line inside the seam.");

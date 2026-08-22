// AC-8: no changed line falls inside the delimiter-walk seam reserved for
// arc-bracecross.
//
// Keyed on LINE RANGES from the TypeScript parser, for two reasons measured
// rather than assumed. Git's `@@` hunk header names the ENCLOSING function, and
// every seam member is a nested arrow, so a header-pattern check never fires —
// the first version of this gate passed with a mutant planted inside
// `closeDoubleQuoted`. A hand-rolled brace-balance walk is the other trap: it
// put `substitutionOpenerEnd` at 952 lines, because braces inside strings,
// regex literals and comments are not structure. The suite already imports
// `typescript`; use it instead of growing a second parser.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const FILE = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const SEAM = [
  "matchBraceSpan",
  "matchBrace",
  "matchBraceEnd",
  "closeDoubleQuoted",
  "openerEnd",
  "substitutionOpenerEnd",
];

const text = readFileSync(FILE, "utf8");
const sf = ts.createSourceFile(FILE, text, ts.ScriptTarget.Latest, true);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

const found = new Map();
const visit = (node) => {
  let name = null;
  if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
  else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
           (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
    name = node.name.text;
  if (name && SEAM.includes(name) && !found.has(name))
    found.set(name, [lineOf(node.getStart(sf)), lineOf(node.getEnd())]);
  ts.forEachChild(node, visit);
};
visit(sf);

if (found.size !== SEAM.length) {
  console.error(`ABORT: located ${found.size} of ${SEAM.length} seam functions (${[...found.keys()].join(", ")}) — the check cannot range over what it cannot find.`);
  process.exit(2);
}

const diff = execFileSync("git", ["diff", "-U0", "origin/main", "--", FILE], { encoding: "utf8" });
const changed = [];
for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
  const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
  for (let i = 0; i < count; i++) changed.push(start + i);
}

const violations = [];
for (const line of changed)
  for (const [name, [lo, hi]] of found)
    if (line >= lo && line <= hi) violations.push(`${FILE}:${line} inside ${name} (${lo}-${hi})`);

for (const [name, [lo, hi]] of found) console.log(`seam ${name}: lines ${lo}-${hi} (${hi - lo + 1})`);
console.log(`changed lines: ${changed.length}`);
if (violations.length) {
  console.error(`FAIL: ${violations.length} changed line(s) inside the arc-bracecross seam:`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("PASS: no changed line falls inside the seam.");

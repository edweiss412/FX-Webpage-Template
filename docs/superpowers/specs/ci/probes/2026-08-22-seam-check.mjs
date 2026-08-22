// AC-8: this arc's diff to the psql scanner touches only the declarations it is
// allowed to touch.
//
// THIS CHECK IS AN ALLOWLIST, AND IT IS THE THIRD DESIGN. The first two were
// denylists — "the diff must not touch the delimiter walk" — and a denylist
// accepts whatever it did not model. Review found a hole in each, three times,
// each in a new direction:
//
//   1. Keyed on git's `@@` hunk header, which names the ENCLOSING function.
//      Most of the walk is nested arrows, so a mutant planted inside
//      `closeDoubleQuoted` passed. (The header is wrong in both directions: on
//      real history it also blames `closingBacktick` for a constant declared
//      after it.)
//   2. AST ranges over a hand-written name list. It missed `closeAnsiC`,
//      `closingBacktick`, and `attachedTargetEnd` — the 95-line outer walk that
//      lexically CONTAINS four of the members it did name. Pure deletions were
//      invisible too, because a deletion's new-side hunk count is zero.
//   3. A DERIVED seam: callee closure plus lexical ancestors. It collected only
//      function-valued declarations, so `ATTACHED_TARGET_TERMINATOR` — a
//      module-level regex that decides where the walk ends — escaped, with a
//      live mutant to prove it.
//
// Every one of those is the same failure: enumerating what is forbidden over a
// surface nobody can fully enumerate. So the question is inverted. What this arc
// may touch is small, known, and mine to declare; everything else in the file is
// denied by default. A construct nobody thought of is now covered rather than
// exempt, and no seam derivation is needed at all.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const FILE = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const BASE = process.env.SEAM_BASE ?? "origin/main";

/** The only declarations this arc's diff may touch. */
const PERMITTED = new Set([
  "scanWorkflowSource", // Task 1: the accept-set gate on the site channel
  "scanShellIndirection", // Task 2: blank-and-rescan on the advisory channel
  "RAW_IS_SHELL_TEXT_STYLES", // Task 1: the named accept-set
  "quotedExecutableScalars", // Task 2: new helper
  "blankRanges", // Task 2: new helper
]);

/** Every TOP-LEVEL statement, with its name and line range. */
function topLevel(text, label) {
  const sf = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const out = [];
  for (const st of sf.statements) {
    // getStart() excludes leading trivia, so a declaration's doc comment sits
    // OUTSIDE it and is allowed to change. A comment cannot move behaviour, and
    // this arc edits the module header deliberately.
    const range = [lineOf(st.getStart(sf)), lineOf(st.getEnd())];
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st))
      out.push({ name: st.name?.text ?? "<anonymous>", range });
    else if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        out.push({ name: ts.isIdentifier(d.name) ? d.name.text : "<destructured>", range });
    else if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st))
      out.push({ name: `<${ts.SyntaxKind[st.kind]}>`, range });
  }
  return out;
}

function read(rev) {
  try {
    return execFileSync("git", ["show", `${rev}:${FILE}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    console.error(`ABORT: ${FILE} does not exist at ${rev}, so this diff cannot be compared against it.`);
    process.exit(2);
  }
}

const headDecls = topLevel(readFileSync(FILE, "utf8"), `${FILE}@HEAD`);
const baseDecls = topLevel(read(BASE), `${FILE}@${BASE}`);
if (headDecls.length === 0 || baseDecls.length === 0) {
  console.error("ABORT: no top-level declaration parsed — the check cannot range over what it cannot see.");
  process.exit(2);
}

// BOTH hunk sides, each against its own revision. A pure deletion lives only on
// the old side, where its new-side count is zero.
const diff = execFileSync("git", ["diff", "-U0", BASE, "--", FILE], { encoding: "utf8" });
const sides = { old: [], new: [] };
for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
  const oStart = Number(m[1]), oCount = m[2] === undefined ? 1 : Number(m[2]);
  const nStart = Number(m[3]), nCount = m[4] === undefined ? 1 : Number(m[4]);
  for (let i = 0; i < oCount; i++) sides.old.push(oStart + i);
  for (let i = 0; i < nCount; i++) sides.new.push(nStart + i);
}

const violations = [];
const judge = (lines, decls, side) => {
  for (const line of lines) {
    // The INNERMOST enclosing top-level statement. A line outside every one is
    // a comment, an import or blank space, and cannot move behaviour.
    const owner = decls
      .filter(({ range: [lo, hi] }) => line >= lo && line <= hi)
      .sort((a, b) => a.range[1] - a.range[0] - (b.range[1] - b.range[0]))[0];
    if (!owner) continue;
    if (!PERMITTED.has(owner.name))
      violations.push(`${side} ${FILE}:${line} in \`${owner.name}\` (${owner.range[0]}-${owner.range[1]}), which this arc may not touch`);
  }
};
judge(sides.new, headDecls, "added/changed");
judge(sides.old, baseDecls, "deleted/changed");

console.log(`permitted declarations: ${[...PERMITTED].join(", ")}`);
console.log(`hunk lines: new-side ${sides.new.length}, old-side ${sides.old.length}`);
if (violations.length) {
  console.error(`FAIL: ${violations.length} line(s) outside the permitted set:`);
  for (const v of [...new Set(violations)]) console.error("  " + v);
  process.exit(1);
}
console.log("PASS: the diff touches only permitted declarations.");

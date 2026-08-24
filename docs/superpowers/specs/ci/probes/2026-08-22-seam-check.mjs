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
  "scanShellIndirection", // Task 2: the exported wrapper
  "scanShellIndirectionIn", // Task 2: the implementation it delegates to
  "RAW_IS_SHELL_TEXT_STYLES", // Task 1: the named accept-set
  "quotedExecutableScalars", // Task 2: new helper
  "blankRanges", // Task 2: new helper
  "QuotedExecutableScalar", // Task 2: the helper's return type
]);

// The `yaml` import declaration, which this arc must extend by ONE binding
// (`isSeq`, for the `args:` sequence spelling) and may not otherwise disturb.
//
// A blanket exemption for `<ImportDeclaration>` is exactly the hole review
// demonstrated on the first allowlist: swapping the imported `isPair` and
// `isScalar` bindings flips both predicates from true to false, and the gate
// said PASS. So the allowance is CONDITIONAL and the condition is checked
// rather than trusted — every binding present at base must still be present at
// HEAD under the same local name. Additions pass; a rename, a re-alias, a swap,
// or a removal does not, and the line then falls back to being denied like any
// other unowned change.
const yamlBindings = (text, label) => {
  const sf = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true);
  const pairs = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements)
      pairs.set(el.propertyName?.text ?? el.name.text, el.name.text);
  }
  return pairs;
};

// DOCUMENTED LIMIT, probed rather than reasoned about: a BRAND-NEW import
// declaration whose bound name is not already imported passes this check, and
// deliberately so. Probed both ways on 2026-08-24 —
// `import { readdirSync as plantedImport } from "node:fs"` is DENIED, but only
// because `readdirSync` is already imported and the re-alias breaks the
// name-for-name rule; `import { EOL as plantedEol } from "node:os"` PASSES.
//
// That is not a hole in the gate, because an import is inert on its own. Any
// USE of the new binding is a changed line inside some declaration, and the
// allowlist judges that line on its own merits: inside a permitted declaration
// it is this arc's own code, and anywhere else it is denied. Importing `isSeq`
// for the `args:` sequence spelling is exactly that permitted case.
//
// The one shape this does not cover is a SIDE-EFFECTING import (`import
// "./x"`), which changes behaviour with no other line changed. It is left
// uncovered on purpose. The threat fence here is accidental authoring mistakes,
// not adversarial edits, and widening the recognizer to chase it is the ratchet
// the three denylists above already died of. A side-effect import also cannot
// rewrite the delimiter walk, which is the seam this gate exists to protect.

/** True when HEAD's imports are a pure SUPERSET of base's, name-for-name. */
const importsOnlyGrew = (baseText, headText) => {
  const base = yamlBindings(baseText, "base");
  const head = yamlBindings(headText, "head");
  for (const [imported, local] of base) if (head.get(imported) !== local) return false;
  return true;
};

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
    // Type aliases and interfaces are NAMED here rather than left to the
    // catch-all below. Both classes carry a real identifier, so lumping them
    // into `<TypeAliasDeclaration>` would make every one of them share a single
    // opaque owner: permitting this arc's `QuotedExecutableScalar` would have
    // permitted every other type alias in the file at the same time. Naming
    // them keeps the allowance one declaration wide, which is the whole point
    // of an allowlist.
    if (
      ts.isFunctionDeclaration(st) ||
      ts.isClassDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st)
    )
      out.push({ name: st.name?.text ?? "<anonymous>", range });
    else if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        out.push({ name: ts.isIdentifier(d.name) ? d.name.text : "<destructured>", range });
    // EVERY other statement class is owned too, imports and exports included.
    // They were skipped in the first allowlist and review demonstrated the hole
    // with a live wrong report: swapping the imported `isPair` and `isScalar`
    // bindings flips both predicates from true to false, and the gate said PASS
    // because the changed line belonged to no owner. A default-deny that leaves
    // a statement class unowned is not default-deny.
    else out.push({ name: `<${ts.SyntaxKind[st.kind]}>`, range });
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

const headText = readFileSync(FILE, "utf8");
const baseText = read(BASE);
const headDecls = topLevel(headText, `${FILE}@HEAD`);
const baseDecls = topLevel(baseText, `${FILE}@${BASE}`);
const importsGrewOnly = importsOnlyGrew(baseText, headText);
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
    // EVERY owner of the line, and the line fails if ANY of them is forbidden.
    //
    // Selecting one owner was the previous cut and review found two escapes in
    // it, both valid TypeScript: `const PERMITTED_NAME = ..., PLANTED = false;`
    // puts two declarators in one statement with one range, and
    // `const PERMITTED_NAME = ...; export const PLANTED = false;` puts two
    // statements on one physical line. Either way a forbidden declaration
    // shares a line with a permitted one, and picking either owner is picking
    // wrong half the time. A line outside every owner is trivia — a comment or
    // blank space — which cannot move behaviour, and this arc edits the module
    // header deliberately.
    const owners = decls.filter(({ range: [lo, hi] }) => line >= lo && line <= hi);
    for (const owner of owners)
      if (!PERMITTED.has(owner.name) && !(owner.name === "<ImportDeclaration>" && importsGrewOnly))
        violations.push(`${side} ${FILE}:${line} in \`${owner.name}\` (${owner.range[0]}-${owner.range[1]}), which this arc may not touch`);
  }
};
judge(sides.new, headDecls, "added/changed");
judge(sides.old, baseDecls, "deleted/changed");

console.log(`permitted declarations: ${[...PERMITTED].join(", ")}`);
console.log(
  `import declarations: ${importsGrewOnly ? "additive only — permitted" : "changed a binding — DENIED"}`,
);
console.log(`hunk lines: new-side ${sides.new.length}, old-side ${sides.old.length}`);
if (violations.length) {
  console.error(`FAIL: ${violations.length} line(s) outside the permitted set:`);
  for (const v of [...new Set(violations)]) console.error("  " + v);
  process.exit(1);
}
console.log("PASS: the diff touches only permitted declarations.");

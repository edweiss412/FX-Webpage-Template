// Report-only probe: judge every `.replace`/`.replaceAll` call's SECOND argument repo-wide.
// Population derived from disk (git ls-files), never enumerated.
//
// This is the derivation the spec's AC-1b compares the shipped judge's total against, so its
// matcher must be the judge's matcher — spec round 5 found it retaining a raw callee check and a
// tight prefilter while the cover had been repaired, which made "two independent derivations"
// vacuous on exactly the axis under review. Both now come from `_shared.mts`.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PREFILTER, classify, replaceCallee, trackedFiles, type Verdict } from "./_shared.mjs";

const tracked = trackedFiles();

type Call = { file: string; line: number; verdict: Verdict; recv: string; text: string };
const calls: Call[] = [];
let oneArg = 0;

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!PREFILTER.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    const callee = replaceCallee(node);
    if (callee !== null && ts.isCallExpression(node)) {
      const { verdict } = classify(node);
      if (verdict === "not-in-population") oneArg++;
      else {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
        calls.push({
          file,
          line: line + 1,
          verdict,
          recv: callee.expression.getText(src).slice(0, 40).replace(/\s+/g, " "),
          text: node.getText(src).slice(0, 110).replace(/\s+/g, " "),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

const by = (v: Verdict) => calls.filter((c) => c.verdict === v);
const offenders = by("reported");
console.log(`files scanned (tracked, JS/TS ext):   ${tracked.length}`);
console.log(`files containing a replace call:      ${new Set(calls.map((c) => c.file)).size}`);
console.log(`replace/replaceAll call sites:        ${calls.length + oneArg}`);
console.log(`  accepted (literal or replacer fn):  ${by("accepted").length}`);
console.log(`  single-argument (no replacement):   ${oneArg}`);
console.log(`  OFFENDERS (runtime value):          ${offenders.length}`);
console.log(`  offender files:                     ${new Set(offenders.map((c) => c.file)).size}`);

if (process.argv.includes("--list")) {
  for (const c of offenders) console.log(`${c.file}:${c.line}  ${c.text}`);
}

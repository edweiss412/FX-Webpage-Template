/**
 * The eleven §5.2 cells, run against the working tree's `premiseScan`.
 *
 * Nine cells must REPORT (a reason is emitted) and six must stay SILENT. The
 * silent cells are each one ordinary edit from a reporting cell, so a rule that
 * fires on them is over-firing on live authoring rather than catching anything.
 *
 * **On `origin/main` this exits non-zero**, and that is its purpose: the nine
 * reporting cells fail because neither producer exists yet. It is therefore a
 * genuine already-failing red for the tasks that add them, failing for the
 * asserted reason — a cell that emits no reason — rather than for a collection
 * or import error.
 *
 *     pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/cell-check.mts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyTests } from "../../../../../../tests/mutation/source/premiseScan";

const ROOT = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "premise-cells-"));
let n = 0;

const cell = (label: string, expect: "report" | "silent", src: string): boolean => {
  const p = join(scratch, `cell${n++}.ts`);
  writeFileSync(p, src, "utf8");
  const rows = classifyTests(ROOT, p);
  if (rows.length === 0) {
    console.log(`FAIL  ${expect.padEnd(6)}  ${label}   <no test classified — the fixture is broken, not the rule>`);
    return false;
  }
  const reported = rows.some((r) => r.detail.length > 0);
  const ok = expect === "report" ? reported : !reported;
  console.log(`${ok ? "PASS" : "FAIL"}  ${expect.padEnd(6)}  ${label}`);
  if (!ok) for (const r of rows) console.log(`          ${r.verdict}  ${r.testName}  | ${r.detail.slice(0, 80)}`);
  return ok;
};

const results: boolean[] = [];

console.log("--- nine cells that must REPORT");
results.push(cell("bare identifier factory", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", suiteA);`));
results.push(cell("function declaration factory", "report", `function suiteA() { it("a", () => {}); }\ndescribe("A", suiteA);`));
results.push(cell("property-access factory", "report", `const suites = { a: () => { it("a", () => {}); } };\ndescribe("A", suites.a);`));
results.push(cell("wrapped identifier (parenthesized)", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", (suiteA));`));
results.push(cell("wrapped identifier (as-expression)", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", suiteA as never);`));
results.push(cell("call-expression factory", "report", `const makeSuite = () => () => { it("a", () => {}); };\ndescribe("A", makeSuite());`));
results.push(cell("function-valued NAME hiding a factory", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe(function titled() {}, suiteA);`));
// The two slot-position cells. Without them a first-slot-only and a last-slot-only
// implementation both pass the whole set while preserving false certification on
// valid declared overloads — spec review r3 finding 2. Each kills exactly one.
results.push(cell("factory in slot 1 with a trailing timeout (kills last-slot-only)", "report", `const f = () => { it("a", () => {}); };\ndescribe("A", f, 5000);`));
results.push(cell("literal options in slot 1 with the factory in slot 2 (kills first-slot-only)", "report", `const f = () => { it("a", () => {}); };\ndescribe("A", { concurrent: true }, f);`));

console.log("--- six cells that must stay SILENT");
results.push(cell("bodyless options registration", "silent", `describe("A", { skip: true });\nit("s", () => {});`));
results.push(cell("inline body + named timeout constant", "silent", `const T = 30000;\ntest("a", () => {}, T);`));
results.push(cell("named options + inline body", "silent", `const opts = { timeout: 1 };\ndescribe("A", opts, () => { it("a", () => {}); });`));
results.push(cell("named constant as the NAME", "silent", `const NAME = "A";\ndescribe(NAME, () => { it("a", () => {}); });`));
// The it/test ROOT. A test registration cannot carry a suite factory, and its
// handler is already reached by the traversal, so reporting here is both a wrong
// attribution and a false advisory on the ordinary extraction of an inline test
// callback. This is spec review r2 finding 2 turned into a case: without it, the
// claim that the rule is suite-only is asserted in prose and checked by nothing.
results.push(cell("named handler on an it/test root", "silent", `function testFn() {}\ntest("named", testFn);\ntest("sibling", () => {});`));
// A hook inside a function-valued eager datum is a VALUE, never invoked during
// registration, so reporting it attributes a hook that does not run — spec review
// r3 finding 1.
results.push(cell("deferred hook inside a function-valued .each datum", "silent", `describe.each([() => { beforeEach(() => {}); }])("A%s", () => { it("a", () => {}); });`));

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} cells behave as the spec's §5.2 table claims`);
if (results.length !== 15) {
  console.error("cell-check: the cell count moved; §5.2's table and this script must agree");
  process.exit(2);
}
if (passed !== results.length) process.exit(1);

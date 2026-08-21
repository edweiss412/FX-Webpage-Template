/**
 * The §5.2 cells, run against the working tree's `premiseScan`. The count is
 * DERIVED from the case list below and printed; writing it down here is what let
 * this header say "eleven" while the table held seventeen.
 *
 * Some cells must REPORT (a reason is emitted) and some must stay SILENT; both
 * counts are DERIVED and printed, never written down here. The
 * silent cells are each one ordinary edit from a reporting cell, so a rule that
 * fires on them is over-firing on live authoring rather than catching anything.
 *
 * **On `origin/main` this exits non-zero**, and that is its purpose: the
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

/**
 * Why a cell exists, and the ONLY two admissible reasons.
 *
 * A corpus that grows one shape per round is the flat finding rate with the
 * fixtures playing the part of the grammar. So every cell names either a DECISION
 * INPUT the rule in §3.1/§3.2 actually reads, or a NAMED WEAKER IMPLEMENTATION
 * from §5.2's kill-target column. Both are properties of the RULE, so the cell set
 * can only grow when the rule does — and a cell added for neither reason REDS here
 * instead of quietly enlarging the corpus.
 */
type Covers = { input: string } | { kills: string };
const covered: Covers[] = [];

const cell = (label: string, expect: "report" | "silent", src: string, covers: Covers): boolean => {
  covered.push(covers);
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

console.log("--- cells that must REPORT");
results.push(cell("bare identifier factory", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", suiteA);`, { kills: "baseline shape" }));
results.push(cell("function declaration factory", "report", `function suiteA() { it("a", () => {}); }\ndescribe("A", suiteA);`, { kills: "arrow-only reading" }));
results.push(cell("property-access factory", "report", `const suites = { a: () => { it("a", () => {}); } };\ndescribe("A", suites.a);`, { kills: "identifier denylist" }));
results.push(cell("wrapped identifier (parenthesized)", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", (suiteA));`, { kills: "raw-node-kind reading" }));
results.push(cell("wrapped identifier (as-expression)", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe("A", suiteA as never);`, { kills: "raw-node-kind reading" }));
results.push(cell("call-expression factory", "report", `const makeSuite = () => () => { it("a", () => {}); };\ndescribe("A", makeSuite());`, { kills: "binding-required reading" }));
results.push(cell("function-valued NAME hiding a factory", "report", `const suiteA = () => { it("a", () => {}); };\ndescribe(function titled() {}, suiteA);`, { input: "slot index (slot 0 excluded)" }));
// The two slot-position cells. Without them a first-slot-only and a last-slot-only
// implementation both pass the whole set while preserving false certification on
// valid declared overloads — spec review r3 finding 2. Each kills exactly one.
results.push(cell("factory in slot 1 with a trailing timeout (kills last-slot-only)", "report", `const f = () => { it("a", () => {}); };\ndescribe("A", f, 5000);`, { kills: "last-slot-only" }));
results.push(cell("literal options in slot 1 with the factory in slot 2 (kills first-slot-only)", "report", `const f = () => { it("a", () => {}); };\ndescribe("A", { concurrent: true }, f);`, { kills: "first-slot-only" }));

results.push(cell("registration inside a function value, invoked or not", "report", `const suiteA = () => { it("d", () => {}); };\nfunction register() { describe("A", suiteA); }\nregister();\nit("s", () => {});`, { kills: "execution-shape suppression" }));
// The two `.each` datum cells were SILENT cells until diff review r4. They are
// reporting cells now, and their kill target is the suppression that used to
// make them silent: a stop at `ts.isFunctionLike` inside producer A's collector.
// That stop read LEXICAL SHAPE and called it execution, so it silenced an IIFE
// and an invoked function expression too -- hooks that RUN. Deleting it is the
// same subtractive repair r3 forced in producer B, and these two cells now fail
// if anything reinstates it in either producer.
results.push(cell("deferred hook inside a function-valued .each datum", "report", `describe.each([() => { beforeEach(() => {}); }])("A%s", () => { it("a", () => {}); });`, { kills: "function-like suppression in producer A" }));
results.push(cell("deferred hook inside a method-shorthand .each datum", "report", `describe.each([{ setup() { beforeEach(() => {}); } }])("A%s", () => { it("a", () => {}); });`, { kills: "function-like suppression in producer A" }));
const reportingCells = results.length;
console.log("--- cells that must stay SILENT");
results.push(cell("bodyless options registration", "silent", `describe("A", { skip: true });\nit("s", () => {});`, { input: "per-slot class: inert literal" }));
results.push(cell("inline body + named timeout constant", "silent", `const T = 30000;\ntest("a", () => {}, T);`, { input: "per-slot class: inline body present" }));
results.push(cell("named options + inline body", "silent", `const opts = { timeout: 1 };\ndescribe("A", opts, () => { it("a", () => {}); });`, { input: "per-slot class: inline body present" }));
results.push(cell("named constant as the NAME", "silent", `const NAME = "A";\ndescribe(NAME, () => { it("a", () => {}); });`, { input: "slot index (slot 0 excluded)" }));
// The it/test ROOT. A test registration cannot carry a suite factory, and its
// handler is already reached by the traversal, so reporting here is both a wrong
// attribution and a false advisory on the ordinary extraction of an inline test
// callback. This is spec review r2 finding 2 turned into a case: without it, the
// claim that the rule is suite-only is asserted in prose and checked by nothing.
// A legal inline `SuiteOptions` literal under a transparent wrapper. ONE cell
// for the class -- parentheses, `as`, `satisfies`, a non-null assertion and an
// angle-bracket assertion all reach the same object literal, and TypeScript
// emits them identically. `isInertLiteral` read the RAW node until diff review
// r4, so each of these reported as a possible factory against a declaration
// (`describe(name, options, fn?)`) that makes them legal bodyless options.
// A NESTED registration's inline suite body, sitting in an OUTER eager
// argument. `hookBodies` attaches that hook to the inner suite's own tests, so
// a file-level reason here names the outer position for a hook that belongs to
// the inner one. Deleting the old function-like stop at r4 exposed this;
// diff review r5 finding 1. The stop that replaces it is NARROW -- a body, of a
// recognized registration, at an index Vitest invokes -- and the reporting
// cells above are what pin that it did not grow back into the broad one.
results.push(cell("nested inline suite body in an outer eager argument", "silent", `describe(String(describe("I", () => { beforeEach(() => {}); it("i", () => {}); })), () => {});\nit("s", () => {});`, { kills: "no nested-body stop" }));
results.push(cell("inert options under a transparent wrapper", "silent", `describe("A", ({ skip: true }));\ndescribe("B", { skip: true } as const);\ndescribe("C", { skip: true } satisfies { skip: boolean });\nit("s", () => {});`, { kills: "raw-node inert reading" }));
results.push(cell("named handler on an it/test root", "silent", `function testFn() {}\ntest("named", testFn);\ntest("sibling", () => {});`, { input: "root kind" }));
// A hook inside a function-valued eager datum is a VALUE, never invoked during
// registration, so reporting it attributes a hook that does not run — spec review
// r3 finding 1.
// ONE cell for the whole function-like class, not one per node kind. Both of
// these were SILENT cells until diff review r4 deleted the stop that made them
// so; they are REPORTING cells now and their kill target is that stop. The
// "one cell, not one per node kind" argument survives the flip unchanged: the
// deleted predicate covered methods, getters, accessors and constructors
// together, so a cell per kind would rebuild the enumeration either way. Spec
// review r4 finding 2 arrived as a MethodDeclaration, which is why the second
// of these uses one.

const passed = results.filter(Boolean).length;
console.log(
  `\n${reportingCells} reporting + ${results.length - reportingCells} silent = ${results.length} cells`,
);
console.log(`${passed} of ${results.length} cells behave as the spec's §5.2 table claims`);
if (results.length !== 19) {
  console.error("cell-check: the cell count moved; §5.2's table and this script must agree");
  process.exit(2);
}
// The BOUND on the cell set is the TYPE, not this report. `Covers` is a closed
// union, so a cell that names neither a decision input nor a weaker implementation
// does not compile — the unmapped case is UNREPRESENTABLE rather than merely
// checked. An earlier version of this block filtered for unmapped entries at
// runtime and could never fire, which is a tautological guard inside the guard
// written to stop the corpus growing unchecked.
//
// What IS checkable at runtime, and can fail: a declared reason that is EMPTY, and
// a set that has collapsed to a single reason (which would mean the cells stopped
// discriminating anything).
const inputs = new Set(covered.flatMap((c) => ("input" in c ? [c.input] : [])));
const kills = new Set(covered.flatMap((c) => ("kills" in c ? [c.kills] : [])));
const blank = covered.filter((c) => ("input" in c ? c.input.trim() : c.kills.trim()).length === 0);
const inputCells = covered.filter((c) => "input" in c).length;
const killCells = covered.filter((c) => "kills" in c).length;
console.log(
  `\ncell budget, derived: ${inputCells} decision-input cells (over ${inputs.size} distinct inputs) + ` +
    `${killCells} weaker-implementation cells (over ${kills.size} distinct implementations) = ${inputCells + killCells}`,
);
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const perInput = new Map<string, number>();
const perKill = new Map<string, number>();
for (const c of covered) ("input" in c ? tally(perInput, c.input) : tally(perKill, c.kills));
for (const [k, n] of [...perInput].sort()) console.log(`      input  ${n}x  ${k}`);
for (const [k, n] of [...perKill].sort()) console.log(`      kills  ${n}x  ${k}`);
// NOT asserted here: that inputCells + killCells equals the cell count. Every cell
// pushes exactly one `Covers` and `Covers` is a closed union, so that sum is an
// IDENTITY and an assertion on it could never fire — the same tautology this block
// already replaced once. The real risk is a DOCUMENT one, publishing a
// distinct-count where a cell-count is meant, and claims-check part C checks it
// across documents rather than pretending to check it here.
console.log(`(bound: the Covers type, checked by tsc — an unmapped cell does not compile)`);
if (blank.length > 0) {
  console.error(`cell-check: ${blank.length} cell(s) declare an EMPTY reason, which satisfies the type and names nothing`);
  process.exit(2);
}
if (inputs.size + kills.size < 2) {
  console.error("cell-check: every cell claims the same single reason — the set discriminates nothing");
  process.exit(2);
}
if (passed !== results.length) process.exit(1);

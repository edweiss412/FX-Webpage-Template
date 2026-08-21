/**
 * Comprehensive attribution re-analysis: every documented-limit claim L1-L5 and
 * every behavioural assertion in sections 2-3, probed rather than read.
 *
 * Requires a baseline sibling module. Generate it first, from the repository
 * root of a worktree carrying the change under test:
 *
 *   git show origin/main:tests/mutation/source/premiseScan.ts \
 *     > tests/mutation/source/premiseScanRecordDiffBaseline.ts
 *   pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/limits-check.mts
 *   rm tests/mutation/source/premiseScanRecordDiffBaseline.ts
 *
 * Every row prints HOLDS or FALSE against a probe, so a claim that stops being
 * true is visible rather than inferred. It found L1 false on its first run.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileSync as wf, unlinkSync } from "node:fs";

import { classifyTests as live } from "../../../../../../tests/mutation/source/premiseScan";

type Rows = { testName: string; verdict: string; detail: string }[];
type Classify = (root: string, suite: string) => Rows;

// The baseline module is generated here rather than required from the caller, so
// the check cannot be run against a missing or stale sibling — and it is read
// through `git show`, never from the working tree, because in a worktree carrying
// the change the working copy IS the change and a file read would compare it
// against itself.
const BASE_REF = process.env.PREMISE_BASE_REF ?? "origin/main";
const SIBLING = join(process.cwd(), "tests/mutation/source/premiseScanLimitsBaseline.ts");
wf(
  SIBLING,
  execFileSync("git", ["show", `${BASE_REF}:tests/mutation/source/premiseScan.ts`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }),
);
const { classifyTests: base } = (await import(
  `../../../../../../tests/mutation/source/${"premiseScanLimitsBaseline"}.ts`
)) as { classifyTests: Classify };
process.on("exit", () => {
  try {
    unlinkSync(SIBLING);
  } catch {
    /* already gone */
  }
});
const scratch = mkdtempSync(join(tmpdir(), "lim-"));
let n = 0;
const P = (src: string) => {
  const p = join(scratch, `l${n++}.ts`);
  writeFileSync(p, src, "utf8");
  return { b: base(process.cwd(), p), l: live(process.cwd(), p) };
};
// A row that prints FALSE must FAIL the command. An earlier version only printed,
// so a claim that had stopped being true exited 0 and read as a passing run --
// an instrument that reports without gating. Found by asking of every instrument
// on this arc: which of my runtime assertions could still fail if the code
// compiles? This one had none at all.
const failures: string[] = [];
// DERIVED, not hand-maintained: the total printed below was a literal, and a
// literal beside a growing list is the next stale claim.
let claims = 0;
const say = (id: string, claim: string, ok: boolean, detail = "") => {
  claims += 1;
  if (!ok) failures.push(`${id}: ${claim}`);
  console.log(`${ok ? "HOLDS " : "FALSE "} ${id}  ${claim}${detail ? "\n         " + detail : ""}`);
};
process.on("exit", (code) => {
  if (code === 0 && failures.length > 0) process.exitCode = 1;
});

const IMP = `import { spawnSync } from "node:child_process";`;

// L1 — the limit applies to tests OUTSIDE the registration only. A test NESTED
// inside it is already proven touching by hookBodies and must be UNDISTURBED;
// the sibling is the silent free being closed.
{
  const src = `${IMP}\ndescribe(String(beforeEach(() => { spawnSync("e",[]); })), () => { it("nested", () => {}); });\nit("sibling", () => {});`;
  const { b, l } = P(src);
  const pick = (rows: readonly { testName: string; verdict: string }[], name: string) =>
    rows.find((r) => r.testName === name);
  const ok =
    pick(b, "nested")?.verdict === "environment-touching" &&
    pick(b, "sibling")?.verdict === "environment-free" &&
    pick(l, "nested")?.verdict === "environment-touching" &&
    pick(l, "sibling")?.verdict === "unclassifiable";
  say("L1", "nested keeps its proven verdict; only the sibling moves, free -> unclassifiable", ok,
    `base=${b.map((r: Rows[number]) => `${r.testName}:${r.verdict}`).join(" ")} | live=${l.map((r: Rows[number]) => `${r.testName}:${r.verdict}`).join(" ")}`);
}
// L2 — the report is FILE-scoped: a sibling the construct cannot have affected is demoted too.
{
  const { l } = P(`const suiteA = () => { it("inA", () => {}); };\ndescribe("A", suiteA);\nit("sibling", () => {});`);
  say("L2", "report is FILE-scoped (sibling demoted too)",
    l.length === 2 && l.every((r: Rows[number]) => r.verdict === "unclassifiable"),
    l.map((r: Rows[number]) => `${r.testName}=${r.verdict}`).join(" "));
}
// L3 — neither producer fires on a registration registrarRoot does not recognize.
{
  const { l } = P(`const suiteA = () => { it("a", () => {}); };\ndescribe.skipIf(false)("A", suiteA);`);
  say("L3", "silent on a registration registrarRoot does not recognize (skipIf)",
    l.every((r: Rows[number]) => r.detail.length === 0), l.map((r: Rows[number]) => `${r.testName}=${r.verdict}`).join(" "));
}
// L4 — helper-registered hook invisible at EVERY position, identically to baseline.
{
  const H = `const reg = () => { beforeEach(() => { spawnSync("e",[]); }); return "A"; };`;
  const cases = [
    [`${IMP}\n${H}\ndescribe(reg(), () => { it("a", () => {}); });`, "eager argument"],
    [`${IMP}\n${H}\ndescribe("A", () => { reg(); it("a", () => {}); });`, "inside an inline body"],
    [`${IMP}\n${H}\nreg();\nit("a", () => {});`, "plain file-scope statement"],
  ] as const;
  let uniform = true, detail = "";
  for (const [src, label] of cases) {
    const { b, l } = P(src);
    const same = JSON.stringify(b.map((r: Rows[number]) => r.verdict)) === JSON.stringify(l.map((r: Rows[number]) => r.verdict));
    const free = l.every((r: Rows[number]) => r.verdict === "environment-free");
    if (!same || !free) uniform = false;
    detail += `${label}: base=${b.map((r: Rows[number]) => r.verdict).join(",")} live=${l.map((r: Rows[number]) => r.verdict).join(",")}  `;
  }
  say("L4", "helper-registered hook invisible at all 3 positions, identical to baseline", uniform, detail);
}
// L5 — a named OPTIONS object with no body reports; with a body it does not.
{
  const a = P(`const opts = { timeout: 1 };\ndescribe("A", opts);\nit("s", () => {});`);
  const b = P(`const opts = { timeout: 1 };\ndescribe("A", opts, () => { it("a", () => {}); });`);
  say("L5", "named options WITHOUT a body reports; WITH a body it does not",
    a.l.some((r: Rows[number]) => r.detail.length > 0) && b.l.every((r: Rows[number]) => r.detail.length === 0),
    `no-body=${a.l.map((r: Rows[number]) => r.verdict).join(",")} with-body=${b.l.map((r: Rows[number]) => r.verdict).join(",")}`);
}
// L6 — a `suite(...)` registration is never recognized, identically on both trees.
{
  const src = `const f = () => { it("a", () => {}); };\nsuite("A", f);`;
  const { b, l } = P(src);
  say("L6", "suite alias not recognized, identical to baseline",
    JSON.stringify(b.map((r: Rows[number]) => r.verdict)) === JSON.stringify(l.map((r: Rows[number]) => r.verdict)) &&
      l.every((r: Rows[number]) => r.detail.length === 0),
    `base=${b.map((r: Rows[number]) => r.verdict).join(",")} live=${l.map((r: Rows[number]) => r.verdict).join(",")}`);
}
// L7 — no constant folding: a hook in a statically DEAD operand is reported
// conservatively, and the reason is worded so that report is not a false claim.
// Diff review r1 F1. The scanner cannot tell `false &&` from `someFlag &&`, and
// going silent on the second would be a silent free -- so it reports on both,
// and the wording says the hook OCCUPIES the position rather than asserting it
// registers. The NEGATIVE half is the load-bearing one.
{
  const dead = [`false && beforeEach(() => {})`, `true || afterEach(() => {})`, `true ? "x" : beforeAll(() => {})`];
  const results = dead.map((expr) => P(`describe(String(${expr}), () => { it("a", () => {}); });\nit("s", () => {});`).l);
  const reports = results.every((rows: Rows) => rows.some((r: Rows[number]) => r.detail.length > 0));
  const noFalseClaim = results.every((rows: Rows) =>
    rows.every((r: Rows[number]) => !r.detail.includes("is registered from")),
  );
  say("L7", "statically dead operand reports, and the reason does NOT assert registration",
    reports && noFalseClaim,
    `reports=${reports} noFalseClaim=${noFalseClaim} over ${dead.length} dead operands`);
}
// L8 — a registration inside a FUNCTION VALUE reports whether or not that
// function is invoked. Diff review r3: suppressing on execution SHAPE silenced
// the INVOKED case too, which is false certification. The INVOKED half is the
// load-bearing one; the uninvoked half records the accepted over-report.
{
  const F = `const suiteA = () => { it("d", () => {}); };`;
  const shapes: Record<string, string> = {
    invokedHelper: `${F}\nfunction register() { describe("A", suiteA); }\nregister();`,
    iife: `${F}\n(() => { describe("A", suiteA); })();`,
    uncalledHelper: `${F}\nfunction unused() { describe("A", suiteA); }`,
  };
  const got = Object.entries(shapes).map(([k, src]) => [k, P(src).l.some((r: Rows[number]) => r.detail.length > 0)] as const);
  say("L8", "a registration inside a function value reports, invoked or not",
    got.every(([, reported]) => reported),
    got.map(([k, r]) => `${k}=${r ? "REPORTED" : "SILENT"}`).join(" "));
}
// §3 precedence — a touching test keeps its verdict under BOTH producers.
{
  const a = P(`${IMP}\ndescribe(String(beforeEach(() => {})), () => { it("a", () => { spawnSync("e",[]); }); });`);
  const b = P(`${IMP}\nconst s = () => { it("a", () => {}); };\ndescribe("A", s);\nit("t", () => { spawnSync("e",[]); });`);
  say("§3", "environment-touching survives BOTH producers",
    a.l.some((r: Rows[number]) => r.verdict === "environment-touching") && b.l.some((r: Rows[number]) => r.verdict === "environment-touching"),
    `A=${a.l.map((r: Rows[number]) => r.verdict).join(",")} B=${b.l.map((r: Rows[number]) => r.verdict).join(",")}`);
}
// §2.1 — a hook in a nested describe's eager position still attaches (hookBodies), unchanged.
{
  const src = `${IMP}\ndescribe("outer", () => { describe(String(beforeEach(() => { spawnSync("e",[]); })), () => { it("a", () => {}); }); it("sib", () => {}); });`;
  const { b, l } = P(src);
  say("§2.1", "nested eager hook handled by hookBodies, unchanged from baseline",
    JSON.stringify(b.map((r: Rows[number]) => r.verdict)) === JSON.stringify(l.map((r: Rows[number]) => r.verdict)),
    `base=${b.map((r: Rows[number]) => r.verdict).join(",")} live=${l.map((r: Rows[number]) => r.verdict).join(",")}`);
}

if (failures.length > 0) {
  console.error(`\nlimits-check: ${failures.length} claim(s) no longer hold:`);
  for (const f of failures) console.error(`      ${f}`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${claims} claims HOLD`);
}

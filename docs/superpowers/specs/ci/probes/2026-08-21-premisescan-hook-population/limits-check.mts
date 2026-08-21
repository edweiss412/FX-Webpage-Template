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
import { classifyTests as base } from "../../../../../../tests/mutation/source/premiseScanRecordDiffBaseline";
import { classifyTests as live } from "../../../../../../tests/mutation/source/premiseScan";
const scratch = mkdtempSync(join(tmpdir(), "lim-"));
let n = 0;
const P = (src: string) => {
  const p = join(scratch, `l${n++}.ts`);
  writeFileSync(p, src, "utf8");
  return { b: base(process.cwd(), p), l: live(process.cwd(), p) };
};
const say = (id: string, claim: string, ok: boolean, detail = "") =>
  console.log(`${ok ? "HOLDS " : "FALSE "} ${id}  ${claim}${detail ? "\n         " + detail : ""}`);

const IMP = `import { spawnSync } from "node:child_process";`;

// L1 — an eager hook is REPORTED, never attached; reason names no suite.
{
  const { l } = P(`${IMP}\ndescribe(String(beforeEach(() => { spawnSync("e",[]); })), () => { it("a", () => {}); });`);
  const r = l[0]!;
  say("L1", "eager hook reported, not attached, reason names no suite",
    r.verdict === "unclassifiable" && r.detail.length > 0 && !/\bsuite [A-Z"']/.test(r.detail),
    `verdict=${r.verdict} detail=${r.detail.slice(0, 70)}`);
}
// L2 — the report is FILE-scoped: a sibling the construct cannot have affected is demoted too.
{
  const { l } = P(`const suiteA = () => { it("inA", () => {}); };\ndescribe("A", suiteA);\nit("sibling", () => {});`);
  say("L2", "report is FILE-scoped (sibling demoted too)",
    l.length === 2 && l.every((r) => r.verdict === "unclassifiable"),
    l.map((r) => `${r.testName}=${r.verdict}`).join(" "));
}
// L3 — neither producer fires on a registration registrarRoot does not recognize.
{
  const { l } = P(`const suiteA = () => { it("a", () => {}); };\ndescribe.skipIf(false)("A", suiteA);`);
  say("L3", "silent on a registration registrarRoot does not recognize (skipIf)",
    l.every((r) => r.detail.length === 0), l.map((r) => `${r.testName}=${r.verdict}`).join(" "));
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
    const same = JSON.stringify(b.map((r) => r.verdict)) === JSON.stringify(l.map((r) => r.verdict));
    const free = l.every((r) => r.verdict === "environment-free");
    if (!same || !free) uniform = false;
    detail += `${label}: base=${b.map((r) => r.verdict).join(",")} live=${l.map((r) => r.verdict).join(",")}  `;
  }
  say("L4", "helper-registered hook invisible at all 3 positions, identical to baseline", uniform, detail);
}
// L5 — a named OPTIONS object with no body reports; with a body it does not.
{
  const a = P(`const opts = { timeout: 1 };\ndescribe("A", opts);\nit("s", () => {});`);
  const b = P(`const opts = { timeout: 1 };\ndescribe("A", opts, () => { it("a", () => {}); });`);
  say("L5", "named options WITHOUT a body reports; WITH a body it does not",
    a.l.some((r) => r.detail.length > 0) && b.l.every((r) => r.detail.length === 0),
    `no-body=${a.l.map((r) => r.verdict).join(",")} with-body=${b.l.map((r) => r.verdict).join(",")}`);
}
// §3 precedence — a touching test keeps its verdict under BOTH producers.
{
  const a = P(`${IMP}\ndescribe(String(beforeEach(() => {})), () => { it("a", () => { spawnSync("e",[]); }); });`);
  const b = P(`${IMP}\nconst s = () => { it("a", () => {}); };\ndescribe("A", s);\nit("t", () => { spawnSync("e",[]); });`);
  say("§3", "environment-touching survives BOTH producers",
    a.l.some((r) => r.verdict === "environment-touching") && b.l.some((r) => r.verdict === "environment-touching"),
    `A=${a.l.map((r) => r.verdict).join(",")} B=${b.l.map((r) => r.verdict).join(",")}`);
}
// §2.1 — a hook in a nested describe's eager position still attaches (hookBodies), unchanged.
{
  const src = `${IMP}\ndescribe("outer", () => { describe(String(beforeEach(() => { spawnSync("e",[]); })), () => { it("a", () => {}); }); it("sib", () => {}); });`;
  const { b, l } = P(src);
  say("§2.1", "nested eager hook handled by hookBodies, unchanged from baseline",
    JSON.stringify(b.map((r) => r.verdict)) === JSON.stringify(l.map((r) => r.verdict)),
    `base=${b.map((r) => r.verdict).join(",")} live=${l.map((r) => r.verdict).join(",")}`);
}

/**
 * Probe 3b — does adopting a DERIVED accept-set move _metaPremiseContract's
 * declared counts? (AC-1 movement is the batch's escalation trigger.)
 *
 * The tracked premiseScan.ts is never mutated. Two SIBLING copies are written,
 * patched, imported and deleted, so the shipped module keeps its bytes and the
 * relative imports still resolve.
 *
 *   A  shipped                      — baseline
 *   B  derived accept-sets only     — the completion the filing arc reverted
 *   C  derived accept-sets + an interleaved callee peel — both halves together
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";
import { classifyTests as classifyA } from "../../../../../../tests/mutation/source/premiseScan";

const ROOT = process.cwd();
const SRC = join(ROOT, "tests/mutation/source/premiseScan.ts");
const base = readFileSync(SRC, "utf8");
const beforeHash = base.length;

const DERIVED_MODIFIERS =
  'new Set(["concurrent","each","extend","fails","fn","for","only","override","runIf","scoped","sequential","shuffle","skip","skipIf","todo"])';
const OLD_MODIFIERS = 'new Set(["each", "for", "skip", "only", "concurrent", "sequential", "todo"])';
const OLD_HOOKS = '/^(beforeEach|beforeAll|afterEach|afterAll)$/';
const DERIVED_HOOKS = '/^(beforeEach|beforeAll|afterEach|afterAll|aroundEach|aroundAll)$/';
const OLD_PEEL = `  while (ts.isCallExpression(node)) node = node.expression;
  while (ts.isPropertyAccessExpression(node)) {
    if (!MODIFIERS.has(node.name.text)) return null;
    node = node.expression;
  }`;
const NEW_PEEL = `  for (;;) {
    if (ts.isCallExpression(node)) node = node.expression;
    else if (ts.isPropertyAccessExpression(node)) {
      if (!MODIFIERS.has(node.name.text)) return null;
      node = node.expression;
    } else break;
  }`;

const once = (s: string, needle: string, repl: string, label: string): string => {
  const n = s.split(needle).length - 1;
  if (n !== 1) throw new Error(`probe void: anchor "${label}" matched ${n} times, expected exactly 1`);
  return s.replace(needle, repl);
};

let B = once(base, OLD_MODIFIERS, DERIVED_MODIFIERS, "MODIFIERS");
B = once(B, OLD_HOOKS, DERIVED_HOOKS, "HOOK_REGISTRARS");
const C = once(B, OLD_PEEL, NEW_PEEL, "registrarRoot peel");
if (B === base || C === B) throw new Error("probe void: a patch produced identical bytes");

const pathB = join(ROOT, "tests/mutation/source/premiseScanProbeB.ts");
const pathC = join(ROOT, "tests/mutation/source/premiseScanProbeC.ts");
writeFileSync(pathB, B);
writeFileSync(pathC, C);

const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

try {
  // The specifiers are built rather than written as literals: these modules are
  // created above and deleted below, so they do not exist at typecheck time and
  // a literal import would be a permanent `tsc --noEmit` error in the tree.
  const specB = `../../../../../../tests/mutation/source/${"premiseScanProbeB"}.ts`;
  const specC = `../../../../../../tests/mutation/source/${"premiseScanProbeC"}.ts`;
  const { classifyTests: classifyB } = (await import(specB)) as { classifyTests: unknown };
  const { classifyTests: classifyC } = (await import(specC)) as { classifyTests: unknown };

  const tally = (fn: (r: string, s: string) => { verdict: string }[]) => {
    const m = new Map<string, { touching: number; unclassifiable: number; free: number; total: number }>();
    for (const s of suites) {
      const rows = fn(ROOT, s);
      m.set(s, {
        touching: rows.filter((r) => r.verdict === "environment-touching").length,
        unclassifiable: rows.filter((r) => r.verdict === "unclassifiable").length,
        free: rows.filter((r) => r.verdict === "environment-free").length,
        total: rows.length,
      });
    }
    return m;
  };

  const A = tally(classifyA as never);
  const Bt = tally(classifyB as never);
  const Ct = tally(classifyC as never);

  const sum = (m: ReturnType<typeof tally>, k: "touching" | "unclassifiable" | "total") =>
    [...m.values()].reduce((a, v) => a + v[k], 0);

  console.log(`CORPUS: ${suites.length} enrolled suites`);
  console.log(`A shipped   classified ${sum(A, "total")}  env-touching ${sum(A, "touching")}  unclassifiable ${sum(A, "unclassifiable")}`);
  console.log(`B derived   classified ${sum(Bt, "total")}  env-touching ${sum(Bt, "touching")}  unclassifiable ${sum(Bt, "unclassifiable")}`);
  console.log(`C derived+peel classified ${sum(Ct, "total")}  env-touching ${sum(Ct, "touching")}  unclassifiable ${sum(Ct, "unclassifiable")}`);
  if (sum(A, "total") === 0) throw new Error("probe void: baseline classified nothing");

  for (const [label, m] of [["B", Bt], ["C", Ct]] as const) {
    const moved = suites.filter((s) => {
      const a = A.get(s)!;
      const b = m.get(s)!;
      return a.touching !== b.touching || a.total !== b.total || a.unclassifiable !== b.unclassifiable;
    });
    console.log(`\n${label} vs A — suites whose numbers move: ${moved.length}`);
    for (const s of moved) {
      const a = A.get(s)!;
      const b = m.get(s)!;
      console.log(`      ${s}\n          total ${a.total}->${b.total}  touching ${a.touching}->${b.touching}  unclassifiable ${a.unclassifiable}->${b.unclassifiable}`);
    }
  }
} finally {
  unlinkSync(pathB);
  unlinkSync(pathC);
  const after = readFileSync(SRC, "utf8");
  console.log(`\nTRACKED SOURCE UNMUTATED: ${after === base ? "yes" : "NO — RESTORE REQUIRED"} (${beforeHash} bytes before, ${after.length} after)`);
  if (after !== base) throw new Error("probe void: the tracked source moved");
}

/**
 * Which `describe` modifier CHAINS actually exist on the installed Vitest, and
 * which of them the shipped `registrarRoot` accepts.
 *
 * This is the derivation behind PR 1's fixture corpus: the (registration form x
 * eager position x hook registrar) cross-product is computed from these two
 * facts rather than from any prose count, so a corpus complete by construction
 * replaces one completed by exhaustion over review rounds.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import * as vitest from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "tests/mutation/source/premiseScan.ts");
const sf = ts.createSourceFile(SRC, readFileSync(SRC, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
let MODS: string[] = [];
for (const st of sf.statements)
  if (ts.isVariableStatement(st))
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.name.text === "MODIFIERS")
        MODS = [...d.initializer!.getText(sf).matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
if (MODS.length === 0) throw new Error("probe void: MODIFIERS not extracted");

const CURRIED = new Set(["each", "for"]);
const d = vitest.describe as unknown as Record<string, unknown>;
const live = (path: string[]): boolean => {
  let cur: unknown = d;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object" && typeof cur !== "function") return false;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "function";
};

// Chains up to the given depth, restricted to members the shipped MODIFIERS accepts.
const spellingsAt = (maxDepth: number): { text: string; curried: boolean }[] => {
  const out = [{ text: "describe", curried: false }];
  for (const a of MODS) {
    if (live([a])) out.push({ text: `describe.${a}`, curried: CURRIED.has(a) });
    if (maxDepth < 2) continue;
    for (const b of MODS) if (live([a, b])) out.push({ text: `describe.${a}.${b}`, curried: CURRIED.has(b) });
  }
  return out;
};
const spellings = spellingsAt(2);

console.log(`shipped MODIFIERS (${MODS.length}): ${MODS.join(", ")}`);

// Depth 1 alone, so the arc's own axis can be compared at the depth it sampled.
const d1 = spellingsAt(1);
const d1c = d1.filter((s) => s.curried).length;
const d1pairs = d1.length + d1.length + d1c;
console.log(`\nDEPTH 1 ONLY: spellings ${d1.length}, curried ${d1c}, pairs ${d1pairs}, cross-product ${d1pairs * 4}`);
console.log(`\nLIVE chains on vitest ${JSON.parse(readFileSync(join(ROOT, "node_modules/vitest/package.json"), "utf8")).version} that the shipped registrarRoot accepts: ${spellings.length}`);
for (const s of spellings) console.log(`      ${s.text}${s.curried ? "  (curried)" : ""}`);

const curried = spellings.filter((s) => s.curried).length;
const pairs = spellings.length /* name arg */ + spellings.length /* options arg */ + curried /* producer arg */;
const HOOKS = ["beforeEach", "beforeAll", "afterEach", "afterAll"];
console.log(`\nspellings ${spellings.length}, of which curried ${curried}`);
console.log(`(form x eager position) pairs = ${spellings.length} + ${spellings.length} + ${curried} = ${pairs}`);
console.log(`PRODUCER A cross-product = ${pairs} x ${HOOKS.length} hook registrars = ${pairs * HOOKS.length}`);
if (spellings.length < 2 || curried === 0) throw new Error("probe void: derived a degenerate spelling set");

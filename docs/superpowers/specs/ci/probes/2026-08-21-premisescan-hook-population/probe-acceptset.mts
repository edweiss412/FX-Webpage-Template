/**
 * Probe 3 — what would an accept-set DERIVED from the installed Vitest surface
 * add beyond the hand-maintained MODIFIERS and HOOK_REGISTRARS?
 *
 * Instrument: the installed package's own exports, read at runtime. Independent
 * of premiseScan by construction — it never calls the scanner.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import * as vitest from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "tests/mutation/source/premiseScan.ts");
const srcSf = ts.createSourceFile(SRC, readFileSync(SRC, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

const litSet = (name: string): string[] => {
  for (const st of srcSf.statements)
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text === name)
          return [...d.initializer!.getText(srcSf).matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  throw new Error(`probe void: ${name} not found in the shipped source`);
};
const rxSource = (name: string): string => {
  for (const st of srcSf.statements)
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer!.getText(srcSf);
  throw new Error(`probe void: ${name} not found`);
};

const shippedRegistrars = litSet("REGISTRARS").sort();
const shippedModifiers = litSet("MODIFIERS").sort();
const shippedHookSrc = rxSource("HOOK_REGISTRARS");
const shippedHooks = [...shippedHookSrc.matchAll(/[a-zA-Z]+/g)].map((m) => m[0]!).filter((w) => /^(before|after|around)/.test(w)).sort();

const props = (o: unknown): string[] =>
  o === undefined || o === null
    ? []
    : [...new Set([...Object.getOwnPropertyNames(o), ...Object.keys(o as object)])]
        .filter((k) => !["length", "name", "prototype", "constructor"].includes(k))
        .sort();

const derivedModifiers = [...new Set([...props(vitest.describe), ...props(vitest.it), ...props(vitest.test)])].sort();
const derivedHooks = ["beforeEach", "beforeAll", "afterEach", "afterAll", "aroundEach", "aroundAll"].filter(
  (n) => typeof (vitest as unknown as Record<string, unknown>)[n] === "function",
);
const vitestExports = Object.keys(vitest).sort();

const diff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

console.log(`vitest version: ${JSON.parse(readFileSync(join(ROOT, "node_modules/vitest/package.json"), "utf8")).version}`);
console.log("");
console.log(`SHIPPED MODIFIERS (${shippedModifiers.length}): ${shippedModifiers.join(", ")}`);
console.log(`DERIVED  from describe|it|test own properties (${derivedModifiers.length}): ${derivedModifiers.join(", ")}`);
console.log(`  ADDS    (${diff(derivedModifiers, shippedModifiers).length}): ${diff(derivedModifiers, shippedModifiers).join(", ") || "(none)"}`);
console.log(`  DROPS   (${diff(shippedModifiers, derivedModifiers).length}): ${diff(shippedModifiers, derivedModifiers).join(", ") || "(none)"}`);
console.log("");
console.log(`SHIPPED HOOK_REGISTRARS (${shippedHooks.length}): ${shippedHooks.join(", ")}`);
console.log(`DERIVED hook globals present as functions (${derivedHooks.length}): ${derivedHooks.sort().join(", ")}`);
console.log(`  ADDS    (${diff(derivedHooks, shippedHooks).length}): ${diff(derivedHooks.sort(), shippedHooks).join(", ") || "(none)"}`);
console.log("");
console.log(`SHIPPED REGISTRARS (${shippedRegistrars.length}): ${shippedRegistrars.join(", ")}`);
console.log(`vitest exports that are suite/test registrars: ${vitestExports.filter((k) => ["describe", "it", "test", "suite", "bench"].includes(k)).join(", ")}`);
console.log("");
console.log(`FLOOR: vitest exports read ${vitestExports.length}`);
if (derivedModifiers.length === 0 || derivedHooks.length === 0 || vitestExports.length === 0)
  throw new Error("probe void: derived an empty set, which renders identically to a surface with no members");

// ---- refinement: a naive "own properties of describe|it|test" derivation
// over-accepts, because Vitest attaches the whole API to the test object.
// Measure per object, and with a discriminator: a MODIFIER is an own property
// whose value is callable and which is NOT itself a top-level vitest export
// (that removes describe/suite/it/test and the four hook registrars, which are
// re-exposed as properties rather than being chainable modifiers).
console.log("\n--- per-object own properties");
for (const [name, obj] of [["describe", vitest.describe], ["it", vitest.it], ["test", vitest.test], ["suite", (vitest as never as Record<string, unknown>).suite], ["bench", (vitest as never as Record<string, unknown>).bench]] as const) {
  const p = props(obj);
  console.log(`  ${name} (${p.length}): ${p.join(", ")}`);
}
const topLevel = new Set(vitestExports);
const chainable = (o: unknown): string[] =>
  props(o).filter((k) => typeof (o as Record<string, unknown>)[k] === "function" && !topLevel.has(k));
console.log("\n--- discriminated: callable own property that is NOT a top-level vitest export");
const dDescribe = chainable(vitest.describe);
const dIt = chainable(vitest.it);
const dTest = chainable(vitest.test);
console.log(`  describe (${dDescribe.length}): ${dDescribe.join(", ")}`);
console.log(`  it       (${dIt.length}): ${dIt.join(", ")}`);
console.log(`  test     (${dTest.length}): ${dTest.join(", ")}`);
const union = [...new Set([...dDescribe, ...dIt, ...dTest])].sort();
console.log(`  UNION    (${union.length}): ${union.join(", ")}`);
console.log(`  ADDS over shipped MODIFIERS (${diff(union, shippedModifiers).length}): ${diff(union, shippedModifiers).join(", ") || "(none)"}`);
console.log(`  DROPS    (${diff(shippedModifiers, union).length}): ${diff(shippedModifiers, union).join(", ") || "(none)"}`);

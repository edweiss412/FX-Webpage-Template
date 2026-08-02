/**
 * Probe 3 (spec §2, "3b" variant): the candidate type-aware matcher over the
 * REAL tree (app/ + lib/ + middleware glob), timed. At origin/main 0fb6f9efb:
 * 633 files, 16070 calls, 1 finding = the allowlisted OAuth site, ~11s.
 *
 * Run: pnpm exec tsx docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe3-tree-scan.mjs
 *
 * HISTORICAL PIN — the call-prong-only candidate matcher as probed at spec R1,
 * kept as evidence for §2 probe 3. The SHIPPED construction grew far beyond it
 * (two prongs, carriers, provenance pins); the live harness that can never
 * drift is tests/cross-cutting/redirect-guard-probes/mutant-corpus.mjs, which
 * imports the real auditor.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const t0 = Date.now();
const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths([
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "middleware.{ts,tsx}",
]);
const t1 = Date.now();

function containerName(decl) {
  let parent = decl.getParent();
  while (parent !== undefined) {
    if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) {
      return parent.getName() ?? null;
    }
    if (Node.isTypeLiteral(parent)) {
      const holder = parent.getParent();
      return Node.isVariableDeclaration(holder) ? holder.getName() : null;
    }
    parent = parent.getParent();
  }
  return null;
}

function declaredName(decl) {
  if (Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl)) return decl.getName();
  if (Node.isFunctionTypeNode(decl)) {
    const holder = decl.getParent();
    return Node.isPropertySignature(holder) ? holder.getName() : null;
  }
  return null;
}

function isBannedRedirectCall(call) {
  const sig = call.getProject().getTypeChecker().getResolvedSignature(call);
  const decl = sig?.getDeclaration();
  if (decl === undefined) return false;
  if (declaredName(decl) !== "redirect") return false;
  const container = containerName(decl);
  return container === "NextResponse" || container === "Response";
}

const findings = [];
let calls = 0;
for (const sf of project.getSourceFiles()) {
  const p = sf.getFilePath();
  if (p.includes("node_modules")) continue;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    calls++;
    if (isBannedRedirectCall(call)) {
      findings.push(`${p}:${call.getStartLineNumber()} ${call.getText().split("\n")[0] ?? ""}`);
    }
  }
}
const t2 = Date.now();
console.log(`files: ${project.getSourceFiles().length}, calls checked: ${calls}`);
console.log(`load: ${t1 - t0}ms, check: ${t2 - t1}ms, total: ${t2 - t0}ms`);
console.log(`findings (${findings.length}):`);
for (const f of findings) console.log("  " + f);

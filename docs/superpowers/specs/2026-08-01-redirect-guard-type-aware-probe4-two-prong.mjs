/**
 * Probe 4 (spec §2; rewritten in the R2 repair): the FINAL two-prong matcher —
 * prong 1 resolved-signature calls; prong 2 TYPE-DECIDED non-callee references
 * (every PropertyAccess / ElementAccess / BindingElement, no syntactic key
 * prefilter; callee-position skipped only when prong 1 flagged that call).
 *
 * Sections:
 *   A. mutant closure — R1/F1 twelve typed value-flow families, R37 const-literal
 *      key, R2/F1 ten literal-typed-key shapes, union-key call/extraction,
 *      negatives, E1/E2 documented-escape pins
 *   B. real-tree scan over app/ + lib/ + middleware glob (spec §5.3), timed
 *
 * Run: pnpm exec tsx docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe4-two-prong.mjs
 *
 * At origin/main 0fb6f9efb: ALL CLOSED; tree = 1 call finding (the allowlisted
 * OAuth site), 0 reference findings, ~13s idle / ~23s loaded machine.
 */
import { Node, Project, SyntaxKind, ts } from "ts-morph";

const project = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: true });

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
    if (Node.isPropertySignature(holder) || Node.isPropertyDeclaration(holder)) return holder.getName();
    return null;
  }
  return null;
}

function isBannedDecl(decl) {
  if (decl === undefined) return false;
  if (declaredName(decl) !== "redirect") return false;
  const container = containerName(decl);
  return container === "NextResponse" || container === "Response";
}

function typeCarries(t) {
  return t.getCallSignatures().some((s) => isBannedDecl(s.getDeclaration()));
}

// Raw-side twins (vendored compiler via ts-morph's exported `ts` — same nominal
// world, no standalone-typescript mixing) for the assignment-pattern prong.
function rawContainerName(decl) {
  let parent = decl.parent;
  while (parent !== undefined) {
    if (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) return parent.name?.getText() ?? null;
    if (ts.isTypeLiteralNode(parent)) {
      const holder = parent.parent;
      return ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : null;
    }
    parent = parent.parent;
  }
  return null;
}
function rawDeclaredName(decl) {
  if (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl)) return decl.name.getText();
  if (ts.isFunctionTypeNode(decl)) {
    const holder = decl.parent;
    if (ts.isPropertySignature(holder) || ts.isPropertyDeclaration(holder)) return holder.name.getText();
    return null;
  }
  return null;
}
function rawIsBannedDecl(decl) {
  if (decl === undefined) return false;
  if (rawDeclaredName(decl) !== "redirect") return false;
  const c = rawContainerName(decl);
  return c === "NextResponse" || c === "Response";
}
function rawTypeCarries(checker, t) {
  return checker.getSignaturesOfType(t, ts.SignatureKind.Call).some((s) => rawIsBannedDecl(s.getDeclaration()));
}
function memberPropName(checker, name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const t = checker.getTypeAtLocation(name.expression);
    if (t.isStringLiteral()) return t.value;
  }
  return null;
}

function audit(sf) {
  const checker = sf.getProject().getTypeChecker();
  const hits = [];
  const bannedCalls = new Set();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isBannedDecl(checker.getResolvedSignature(call)?.getDeclaration())) {
      bannedCalls.add(call);
      hits.push({ line: call.getStartLineNumber(), kind: "call", text: call.getText().split("\n")[0] ?? "" });
    }
  }
  const candidates = [
    ...sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.BindingElement),
  ];
  for (const node of candidates) {
    const parent = node.getParent();
    const inCalleePosition =
      parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === node;
    if (inCalleePosition && bannedCalls.has(parent)) continue; // prong 1 owns it
    if (typeCarries(node.getType())) {
      hits.push({ line: node.getStartLineNumber(), kind: "reference", text: node.getText().split("\n")[0] ?? "" });
    }
  }
  // Assignment-pattern object members (R3/F1): source type via getTypeOfAssignmentPattern.
  const raw = checker.compilerObject;
  for (const kind of [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment]) {
    for (const member of sf.getDescendantsOfKind(kind)) {
      const holder = member.getParent();
      if (holder === undefined || !Node.isObjectLiteralExpression(holder)) continue;
      let srcType;
      try {
        srcType = raw.getTypeOfAssignmentPattern(holder.compilerNode);
      } catch {
        continue; // value-position object literal, not a pattern
      }
      if (srcType === undefined) continue;
      const propName = memberPropName(raw, member.compilerNode.name);
      if (propName === null) continue;
      const prop = srcType.getProperty(propName);
      if (prop === undefined) continue;
      if (rawTypeCarries(raw, raw.getTypeOfSymbolAtLocation(prop, member.compilerNode))) {
        hits.push({ line: member.getStartLineNumber(), kind: "reference", text: member.getText().split("\n")[0] ?? "" });
      }
    }
  }
  return hits;
}

const PRE = `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\n`;

const MUTANTS = [
  // --- R1/F1 typed value-flow families ---
  ["F1a callback param", PRE + `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nexport function GET() { return invoke(NextResponse.redirect, new URL("/x", request.url)); }`, "flag"],
  ["F1b structural type-literal property", PRE + `const impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1c structural interface property", PRE + `interface Redirish { redirect: RedirectFn }\nconst impl: Redirish = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1d class-field structural property", PRE + `class Impl { redirect: RedirectFn = NextResponse.redirect; }\nexport function GET() { return new Impl().redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1e conditional composite", PRE + `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nexport function GET() { return (cond ? NextResponse.redirect : safe)(new URL("/x", request.url)); }`, "flag"],
  ["F1f tuple composite", PRE + `declare const i: number;\nconst safe = (u: string | URL) => new Response(String(u));\nconst tuple = [safe, NextResponse.redirect] as const;\nexport function GET() { return tuple[i]!(new URL("/x", request.url)); }`, "flag"],
  ["F1g object-union composite", PRE + `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nconst obj = cond ? { go: safe } : { go: NextResponse.redirect };\nexport function GET() { return obj.go(new URL("/x", request.url)); }`, "flag"],
  ["F1h .call adapter", PRE + `export function GET() { return NextResponse.redirect.call(NextResponse, new URL("/x", request.url)); }`, "flag"],
  ["F1i .apply adapter", PRE + `export function GET() { return NextResponse.redirect.apply(NextResponse, [new URL("/x", request.url)]); }`, "flag"],
  ["F1j Response.redirect.call", `declare const request: Request;\nexport function GET() { return Response.redirect.call(Response, new URL("/x", request.url)); }`, "flag"],
  ["F1k renamed destructure extraction", PRE + `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nconst { redirect: r } = NextResponse;\nexport function GET() { return invoke(r, new URL("/x", request.url)); }`, "flag"],
  ["F1l as-any VALUE laundering", PRE + `const f = NextResponse.redirect as any;\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  // --- computed keys ---
  ["R37 const-literal computed key call", PRE + `const k = "redirect";\nexport function GET() { return NextResponse[k](new URL("/x", request.url)); }`, "flag"],
  ["R38 identifier literal-key extraction", PRE + `const k = "redirect" as const;\nconst f: RedirectFn = NextResponse[k];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R39 template-key extraction", PRE + "const f = NextResponse[`redirect`];\nexport function GET() { return f(new URL(\"/x\", request.url)); }", "flag"],
  ["R40 const-object-key extraction", PRE + `const K = { r: "redirect" } as const;\nconst f = NextResponse[K.r];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R41 enum-key extraction", PRE + `enum E { R = "redirect" }\nconst f = NextResponse[E.R];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R42 computed destructuring", PRE + `const k = "redirect" as const;\nconst { [k]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R43 string-literal binding", PRE + `const { ["redirect"]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R44 computed-string binding", PRE + `const kk = "redirect";\nconst { [kk]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R45 parenthesized literal access", PRE + `const f = NextResponse[("redirect")];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R46 as-const access", PRE + `const f = NextResponse["redirect" as const];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R47 satisfies access", PRE + `const f = NextResponse["redirect" satisfies string];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R48 union-typed-key call", PRE + `declare const u: "redirect" | "json";\nexport function GET() { return (NextResponse as typeof NextResponse)[u as "redirect"](new URL("/x", request.url)); }`, "flag"],
  ["R49 union-typed-key extraction", PRE + `declare const u2: "redirect" | "json";\nconst g = NextResponse[u2 as "redirect"];\nexport function GET() { return g(new URL("/x", request.url)); }`, "flag"],
  // --- destructuring-assignment extraction (R3/F1, probe 6c) ---
  ["R50 assignment rename", PRE + `let f: RedirectFn;\n({ redirect: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R51 assignment shorthand", PRE + `let redirect: RedirectFn;\n({ redirect } = NextResponse);\nexport function GET() { return redirect(new URL("/x", request.url)); }`, "flag"],
  ["R52 assignment string-literal key", PRE + `let f: RedirectFn;\n({ ["redirect"]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R53 assignment computed literal-typed key", PRE + `let f: RedirectFn;\nconst kc = "redirect" as const;\n({ [kc]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R54 assignment with default", PRE + `const safe = (u: string | URL) => new Response(String(u));\nlet f: RedirectFn;\n({ redirect: f = safe } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R55 assignment Response twin", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet f: RedirectFn;\n({ redirect: f } = Response);\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R56 array-nested assignment pattern", PRE + `let f: RedirectFn;\n[{ redirect: f }] = [NextResponse];\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R57 for-of assignment-pattern head", PRE + `let f: RedirectFn;\nfor ({ redirect: f } of [NextResponse]) { break; }\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  // --- negatives ---
  ["NEG next/navigation call+extraction", `import { redirect } from "next/navigation";\nconst r = redirect;\nexport function GET() { return r("/x"); }`, "clean"],
  ["NEG benign assignment destructure (N7)", `const src = { redirect: (u: string) => u };\nlet g: (u: string) => string;\n({ redirect: g } = src);\nexport function GET() { return g("/x"); }`, "clean"],
  ["NEG value-position object literal (N7)", PRE + `const safe = (u: string | URL) => new Response(String(u));\nconst o = { redirect: safe };\nexport function GET() { return o.redirect(new URL("/x", request.url)); }`, "clean"],
  ["NEG unrelated container method + .call + element access", `class Router { redirect(u: string) { return u; } }\nconst rt = new Router();\nconst m = rt["redirect"];\nexport function GET() { return m.call(rt, "/x"); }`, "clean"],
  ["NEG ordinary array/element access + destructuring", `declare const xs: string[];\ndeclare const i: number;\nconst { length } = xs;\nexport function GET() { return xs[i] ?? String(length); }`, "clean"],
  ["NEG direct call = exactly one finding", PRE + `export function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  // --- documented-escape pins ---
  ["E1 receiver-as-any (documented limit)", PRE + `export function GET() { return (NextResponse as any).redirect(new URL("/x", request.url)); }`, "clean"],
  ["E2 widened computed key (documented limit)", PRE + `const kw: string = "redirect";\nexport function GET() { return (NextResponse as unknown as Record<string, Function>)[kw]!(new URL("/x", request.url)); }`, "clean"],
];

let failures = 0;
let i = 0;
for (const [label, text, expect] of MUTANTS) {
  const sf = project.createSourceFile(`app/__audit_fixture__/m${i++}.ts`, text, { overwrite: true });
  const hits = audit(sf);
  const ok = expect === "flag" ? hits.length > 0 : hits.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "OK " : "FAIL"} ${label}: ${hits.length} hit(s) [expect ${expect}]`);
  if (!ok) for (const h of hits) console.log(`      L${h.line} ${h.kind}: ${h.text}`);
}
console.log(failures === 0 ? "ALL CLOSED" : `${failures} FAILURES`);

// --- B. real-tree scan (spec §5.3 roots) ---
const t0 = Date.now();
const tree = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: true });
tree.addSourceFilesAtPaths([
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "middleware.{ts,tsx}",
]);
let files = 0;
const treeHits = [];
for (const sf of tree.getSourceFiles()) {
  if (sf.getFilePath().includes("node_modules")) continue;
  files++;
  for (const h of audit(sf)) treeHits.push(`${h.kind} ${sf.getFilePath()}:${h.line} ${h.text}`);
}
console.log(`tree: ${files} files, ${treeHits.length} finding(s), ${Date.now() - t0}ms`);
for (const h of treeHits) console.log("  " + h);

/**
 * Probe 4 (spec §2; rewritten in the R2 repair, extended in the whole-diff r2
 * closure): the FINAL two-prong matcher — prong 1 resolved-signature calls;
 * prong 2 TYPE-DECIDED references over every PropertyAccess / ElementAccess /
 * BindingElement PLUS assignment-pattern members PLUS naked class-object
 * identifiers (whole-receiver laundering needs no cast). Direct method-carry
 * flags in every position except a prong-1-owned callee; whole-object carry
 * skips only non-extracting positions (member receiver, new callee,
 * instanceof RHS, typeof operand).
 *
 * Sections:
 *   A. mutant closure — R1/F1 twelve typed value-flow families, R37 const-literal
 *      key, R2/F1 ten literal-typed-key shapes, union-key call/extraction,
 *      whole-receiver shapes + former-limit flips (R58-R71), negatives incl.
 *      N8 non-extracting positions, and the E1 eval-shape escape pin
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
  const raw2 = checker.compilerObject;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isBannedDecl(checker.getResolvedSignature(call)?.getDeclaration())) {
      bannedCalls.add(call);
      hits.push({ line: call.getStartLineNumber(), kind: "call", text: call.getText().split("\n")[0] ?? "" });
      continue;
    }
    // CommonJS require carrier (whole-diff r7): callee's Require type + resolved specifier
    {
      const callee = call.getExpression();
      const arg0 = call.getArguments()[0];
      if (
        arg0 !== undefined && Node.isStringLiteral(arg0) && Node.isIdentifier(callee) &&
        callee.getType().getSymbol()?.getName() === "Require"
      ) {
        const res = ts.resolveModuleName(arg0.getLiteralText(), sf.getFilePath(), sf.getProject().getCompilerOptions(), sf.getProject().getModuleResolutionHost());
        const rfn = res.resolvedModule?.resolvedFileName;
        if (rfn !== undefined) {
          const msf = sf.getProject().getSourceFile(rfn) ?? sf.getProject().addSourceFileAtPathIfExists(rfn);
          if (msf !== undefined) {
            const msym = raw2.getSymbolAtLocation(msf.compilerNode);
            if (msym !== undefined) {
              const mt = raw2.getTypeOfSymbolAtLocation(msym, msf.compilerNode);
              for (const cp of mt.getProperties()) {
                const cpt = raw2.getTypeOfSymbolAtLocation(cp, msf.compilerNode);
                const rp = cpt.getProperty("redirect");
                if ((rp !== undefined && rawTypeCarries(raw2, raw2.getTypeOfSymbolAtLocation(rp, msf.compilerNode))) || rawTypeCarries(raw2, cpt)) {
                  hits.push({ line: call.getStartLineNumber(), kind: "reference", text: call.getText().split("\n")[0] ?? "" });
                  break;
                }
              }
            }
          }
        }
      }
    }
    // import-call carrier (whole-diff r4): decide on the awaited module type
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      const awaited = raw2.getAwaitedType(raw2.getTypeAtLocation(call.compilerNode));
      if (awaited !== undefined) {
        for (const cp of awaited.getProperties()) {
          const cpt = raw2.getTypeOfSymbolAtLocation(cp, call.compilerNode);
          const rp = cpt.getProperty("redirect");
          if ((rp !== undefined && rawTypeCarries(raw2, raw2.getTypeOfSymbolAtLocation(rp, call.compilerNode))) || rawTypeCarries(raw2, cpt)) {
            hits.push({ line: call.getStartLineNumber(), kind: "reference", text: call.getText().split("\n")[0] ?? "" });
            break;
          }
        }
      }
    }
  }
  const checkerW = sf.getProject().getTypeChecker();
  const candidates = [
    ...sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.BindingElement),
  ];
  // Type-decided import-binding tracking (whole-diff r5); dynamic-import
  // variable tracking removed — the import CALL is flagged in prong 1 (r4).
  const objectNames = new Set(["NextResponse", "Response"]);
  function bindingCarries(b) {
    const t = b.getType();
    if (typeCarries(t)) return true;
    const prop = t.getProperty("redirect");
    if (prop !== undefined && typeCarries(checkerW.getTypeOfSymbolAtLocation(prop, b))) return true;
    const sym = t.getSymbol();
    const isModule = sym !== undefined && (sym.getFlags() & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0;
    const props = isModule ? t.getProperties() : ["NextResponse", "Response"].map((n) => t.getProperty(n)).filter((x) => x !== undefined);
    for (const cp of props) {
      const cpt = checkerW.getTypeOfSymbolAtLocation(cp, b);
      if (typeCarries(cpt)) return true;
      const rp = cpt.getProperty("redirect");
      if (rp !== undefined && typeCarries(checkerW.getTypeOfSymbolAtLocation(rp, b))) return true;
    }
    return false;
  }
  for (const imp of sf.getImportDeclarations()) {
    const clause = imp.getImportClause();
    if (clause === undefined) continue;
    const bindings = [];
    const def = clause.getDefaultImport();
    if (def !== undefined) bindings.push(def);
    const nb = clause.getNamedBindings();
    if (nb !== undefined && Node.isNamespaceImport(nb)) bindings.push(nb.getNameNode());
    for (const spec of imp.getNamedImports()) bindings.push(spec.getAliasNode() ?? spec.getNameNode());
    for (const b of bindings) if (bindingCarries(b)) objectNames.add(b.getText());
  }
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!objectNames.has(id.getText())) continue;
    const parent = id.getParent();
    if (parent === undefined) continue;
    if (Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent)) continue;
    if (Node.isImportClause(parent) || Node.isNamespaceImport(parent)) continue;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) continue;
    if (Node.isBindingElement(parent)) continue;
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    if ((Node.isPropertyAssignment(parent) || Node.isPropertySignature(parent) || Node.isMethodDeclaration(parent)) && parent.getNameNode() === id) continue;
    if (Node.isTypeQuery(parent) || Node.isTypeReference(parent)) continue;
    if (Node.isFunctionDeclaration(parent) || Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) continue;
    if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) continue;
    candidates.push(id);
  }
  function nonExtracting(node) {
    const parent = node.getParent();
    if (parent === undefined) return false;
    if ((Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === node) return true;
    if (Node.isNewExpression(parent) && parent.getExpression() === node) return true;
    if (Node.isCallExpression(parent) && parent.getExpression() === node && bannedCalls.has(parent)) return true;
    if (Node.isBinaryExpression(parent) && parent.getOperatorToken().getKind() === SyntaxKind.InstanceOfKeyword && parent.getRight() === node) return true;
    if (Node.isTypeOfExpression(parent)) return true;
    return false;
  }
  for (const node of candidates) {
    const t = node.getType();
    if (typeCarries(t)) {
      const parent = node.getParent();
      const calleeOfBanned = parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === node && bannedCalls.has(parent);
      if (!calleeOfBanned) hits.push({ line: node.getStartLineNumber(), kind: "reference", text: node.getText().split("\n")[0] ?? "" });
      continue;
    }
    if (nonExtracting(node)) continue;
    let carries = false;
    const prop = t.getProperty("redirect");
    if (prop !== undefined && typeCarries(checkerW.getTypeOfSymbolAtLocation(prop, node))) carries = true;
    if (!carries) {
      // namespace hop (r3; r6: ALL properties for module-symbol types)
      const symN = t.getSymbol();
      const isModuleN = symN !== undefined && (symN.getFlags() & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0;
      const propsN = isModuleN ? t.getProperties() : ["NextResponse", "Response"].map((n) => t.getProperty(n)).filter((x) => x !== undefined);
      for (const cp of propsN) {
        const cpt = checkerW.getTypeOfSymbolAtLocation(cp, node);
        if (typeCarries(cpt)) { carries = true; break; }
        const rp = cpt.getProperty("redirect");
        if (rp !== undefined && typeCarries(checkerW.getTypeOfSymbolAtLocation(rp, node))) { carries = true; break; }
      }
    }
    if (carries) {
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

// Re-export helper modules for the R83-R86 rows (whole-diff r5)
project.createSourceFile("app/__audit_fixture__/reexp-named.ts", `export { NextResponse as Redirector } from "next/server";`, { overwrite: true });
project.createSourceFile("app/__audit_fixture__/reexp-default.ts", `import { NextResponse } from "next/server";\nexport default NextResponse;`, { overwrite: true });
project.createSourceFile("app/__audit_fixture__/reexp-ns.ts", `export * as SrvNS from "next/server";`, { overwrite: true });
project.createSourceFile("app/__audit_fixture__/reexp-hop2.ts", `export { Redirector as Hop } from "./reexp-named";`, { overwrite: true });

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
  // --- whole-receiver structural laundering (whole-diff r2, probe 7) ---
  ["R58 whole-receiver annotated variable", PRE + `const R: { redirect: RedirectFn } = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R59 whole-receiver interface-typed", PRE + `interface Ish { redirect: RedirectFn }\nconst R: Ish = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R60 whole-receiver parameter", PRE + `function go(r: { redirect: RedirectFn }, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`, "flag"],
  ["R61 whole-receiver helper return", PRE + `function pick(): { redirect: RedirectFn } { return NextResponse; }\nexport function GET() { return pick().redirect(new URL("/x", request.url)); }`, "flag"],
  ["R62 whole-receiver class field", PRE + `class Holder { r: { redirect: RedirectFn } = NextResponse; }\nexport function GET() { return new Holder().r.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R63 whole-receiver generic constraint", PRE + `function go<T extends { redirect: RedirectFn }>(r: T, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`, "flag"],
  ["R64 whole-receiver typed array", PRE + `const arr: Array<{ redirect: RedirectFn }> = [NextResponse];\nexport function GET() { return arr[0]!.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R65 whole-receiver Response twin", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Response;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R66 whole-receiver aliased import", `import { NextResponse as NR } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NR;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R67 whole-receiver namespace import", `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NS.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R68 receiver-as-any (FORMER limit E1)", PRE + `export function GET() { return (NextResponse as any).redirect(new URL("/x", request.url)); }`, "flag"],
  ["R69 widened computed key (FORMER limit E2)", PRE + `const kw: string = "redirect";\nexport function GET() { return (NextResponse as unknown as Record<string, Function>)[kw]!(new URL("/x", request.url)); }`, "flag"],
  ["R70 Reflect.get", PRE + `declare const k2: string;\nexport function GET() { const f = Reflect.get(NextResponse, k2); return f(new URL("/x", request.url)); }`, "flag"],
  ["R71 bare .call with no naked thisArg", PRE + `export function GET() { return NextResponse.redirect.call(undefined, new URL("/x", request.url)); }`, "flag"],
  ["R72 namespace member assignment-destructure", `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R: { redirect: RedirectFn };\n({ NextResponse: R } = NS);\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R73 namespace object-rest assignment", `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet rest: { NextResponse: { redirect: RedirectFn } };\n(({ ...rest } = NS));\nexport function GET() { return rest.NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R74 namespace declaration destructure", `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst { NextResponse: R } = NS;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R75 namespace stuffed into object", `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: NS };\nexport function GET() { return box.ns.NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R76 dynamic-import binding naked flow", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const R: { redirect: RedirectFn } = m.NextResponse;\n  return R.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R77 dynamic-import namespace stuffed", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: m };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R78 direct awaited-import stuffing", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: await import("next/server") };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R79 dynamic-import declaration destructuring", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const { NextResponse: R } = await import("next/server");\n  return (R as { redirect: RedirectFn }).redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R80 dynamic-import assignment destructuring", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R80: { redirect: RedirectFn };\nexport async function GET() {\n  ({ NextResponse: R80 } = await import("next/server"));\n  return R80.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R81 promise-carried namespace", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const pr = import("next/server");\n  const m: { NextResponse: { redirect: RedirectFn } } = await pr;\n  return m.NextResponse.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R82 .then callback stuffing", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport function GET() {\n  return import("next/server").then((m) => (m.NextResponse as { redirect: RedirectFn }).redirect(new URL("/x", request.url)));\n}`, "flag"],
  ["R83 renamed re-export + laundering", `import { Redirector } from "./reexp-named";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Redirector;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R84 default re-export + laundering", `import Def from "./reexp-default";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Def;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R85 namespace re-export + laundering", `import { SrvNS } from "./reexp-ns";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: SrvNS };\nexport function GET() { return R.ns.NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R86 two-hop re-export + laundering", `import { Hop } from "./reexp-hop2";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Hop;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R87 renamed-export namespace stuffing", `import * as NSr from "./reexp-named";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { Redirector: { redirect: RedirectFn } } = NSr;\nexport function GET() { return R.Redirector.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R88 default-export namespace stuffing", `import * as NSd from "./reexp-default";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { default: { redirect: RedirectFn } } = NSd;\nexport function GET() { return R.default.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R89 dynamic import of renamed-export helper", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m: { Redirector: { redirect: RedirectFn } } = await import("./reexp-named");\n  return m.Redirector.redirect(new URL("/x", request.url));\n}`, "flag"],
  ["R90 untyped require carrier", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSr2 = require("next/server");\nconst R: { NextResponse: { redirect: RedirectFn } } = NSr2;\nexport function GET() { return R.NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R91 as-cast require carrier", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSc = require("next/server") as typeof import("next/server");\nconst R: { redirect: RedirectFn } = NSc.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`, "flag"],
  ["R92 renamed require carrier", `declare const request: Request;\nconst r2 = require;\nconst NS2 = r2("next/server");\nexport function GET() { return NS2; }`, "flag"],
  ["N11 require of unrelated module", `const p = require("react");\nexport function GET() { return typeof p; }`, "clean"],
  ["N10 unrelated import bindings untracked", `import { join } from "node:path";\nconst j = join;\nexport function GET() { return j("a", "b"); }`, "clean"],
  ["NEG dynamic import of unrelated module", `export async function GET() {\n  const m = await import("node:path");\n  return m.join("a", "b");\n}`, "clean"],
  ["N9 ordinary namespace uses", `import * as NS from "next/server";\ndeclare const req2: NS.NextRequest;\nexport function GET() { return NS.NextResponse.json({ url: String(req2.url) }); }`, "clean"],
  ["N8 non-extracting whole-object positions", `import { NextResponse } from "next/server";\ndeclare const x: unknown;\nexport function GET() {\n  const inst = new NextResponse(null, { status: 302, headers: { Location: "/x" } });\n  const j = NextResponse.json({ ok: true });\n  return x instanceof Response && typeof Response !== "undefined" ? inst : j;\n}`, "clean"],
  // --- documented-escape pin (the one remaining type-erasure limit) ---
  ["E1 string-mediated dynamic access (eval shape)", PRE + `declare function evil(code: string): unknown;\nexport function GET() { const f = evil("NextResponse.redirect") as RedirectFn; return f(new URL("/x", request.url)); }`, "clean"],
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

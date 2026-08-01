/**
 * Probe 4 (spec §2, round-1 repair): the TWO-PRONG matcher — prong 1 resolved-
 * signature calls, prong 2 non-callee references to the banned method — closes
 * every R1/F1 typed value-flow mutant, keeps the negatives clean, pins the
 * documented-escape boundary (4c), and scans the real tree (4b).
 *
 * Run: pnpm exec tsx docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe4-two-prong.mjs
 *
 * At origin/main 0fb6f9efb: ALL MUTANTS CLOSED; E1/E2 escape (documented limits);
 * tree = 0 reference candidates, 1 allowlisted call finding, ~12s.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

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

function audit(sf) {
  const hits = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const sig = call.getProject().getTypeChecker().getResolvedSignature(call);
    if (isBannedDecl(sig?.getDeclaration())) {
      hits.push({ line: call.getStartLineNumber(), kind: "call", text: call.getText().split("\n")[0] ?? "" });
    }
  }
  const candidates = [];
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (pa.getName() === "redirect") candidates.push(pa);
  }
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = ea.getArgumentExpression();
    if (arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText() === "redirect") candidates.push(ea);
  }
  for (const be of sf.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    if ((be.getPropertyNameNode() ?? be.getNameNode()).getText() === "redirect") candidates.push(be);
  }
  for (const node of candidates) {
    const parent = node.getParent();
    if (parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === node) continue;
    if (node.getType().getCallSignatures().some((s) => isBannedDecl(s.getDeclaration()))) {
      hits.push({ line: node.getStartLineNumber(), kind: "reference", text: node.getText().split("\n")[0] ?? "" });
    }
  }
  return hits;
}

const MUTANTS = [
  ["F1a callback param", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction invoke(fn: RedirectFn, url: URL) { return fn(url); }\nexport function GET() { return invoke(NextResponse.redirect, new URL("/x", request.url)); }`, "flag"],
  ["F1b structural type-literal property", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1c structural interface property", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ninterface Redirish { redirect: (url: string | URL, status?: number) => Response }\nconst impl: Redirish = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1d class-field structural property", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nclass Impl { redirect: (url: string | URL, status?: number) => Response = NextResponse.redirect; }\nexport function GET() { return new Impl().redirect(new URL("/x", request.url)); }`, "flag"],
  ["F1e conditional composite", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ndeclare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nexport function GET() { return (cond ? NextResponse.redirect : safe)(new URL("/x", request.url)); }`, "flag"],
  ["F1f tuple composite", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ndeclare const i: number;\nconst safe = (u: string | URL) => new Response(String(u));\nconst tuple = [safe, NextResponse.redirect] as const;\nexport function GET() { return tuple[i]!(new URL("/x", request.url)); }`, "flag"],
  ["F1g object-union composite", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ndeclare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nconst obj = cond ? { go: safe } : { go: NextResponse.redirect };\nexport function GET() { return obj.go(new URL("/x", request.url)); }`, "flag"],
  ["F1h .call adapter", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nexport function GET() { return NextResponse.redirect.call(NextResponse, new URL("/x", request.url)); }`, "flag"],
  ["F1i .apply adapter", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nexport function GET() { return NextResponse.redirect.apply(NextResponse, [new URL("/x", request.url)]); }`, "flag"],
  ["F1j Response.redirect.call", `declare const request: Request;\nexport function GET() { return Response.redirect.call(Response, new URL("/x", request.url)); }`, "flag"],
  ["F1k renamed destructure extraction", `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction invoke(fn: RedirectFn, url: URL) { return fn(url); }\nconst { redirect: r } = NextResponse;\nexport function GET() { return invoke(r, new URL("/x", request.url)); }`, "flag"],
  ["F1l as-any VALUE laundering", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nconst f = NextResponse.redirect as any;\nexport function GET() { return f(new URL("/x", request.url)); }`, "flag"],
  ["R37 const-literal computed key", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nconst k = "redirect";\nexport function GET() { return NextResponse[k](new URL("/x", request.url)); }`, "flag"],
  ["NEG next/navigation call+extraction", `import { redirect } from "next/navigation";\nconst r = redirect;\nexport function GET() { return r("/x"); }`, "clean"],
  ["NEG unrelated container method + .call", `class Router { redirect(u: string) { return u; } }\nconst rt = new Router();\nconst method = rt.redirect;\nexport function GET() { return method.call(rt, "/x"); }`, "clean"],
  ["NEG direct call = exactly one finding", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nexport function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`, "flag"],
  ["E1 receiver-as-any (documented limit)", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nexport function GET() { return (NextResponse as any).redirect(new URL("/x", request.url)); }`, "clean"],
  ["E2 widened computed key (documented limit)", `import { NextResponse } from "next/server";\ndeclare const request: Request;\nconst k: string = "redirect";\nexport function GET() { return (NextResponse as unknown as Record<string, Function>)[k]!(new URL("/x", request.url)); }`, "clean"],
];

let failures = 0;
let i = 0;
for (const [label, text, expect] of MUTANTS) {
  const sf = project.createSourceFile(`app/__audit_fixture__/m${i++}.ts`, text, { overwrite: true });
  const hits = audit(sf);
  const ok = expect === "flag" ? hits.length > 0 : hits.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "OK " : "FAIL"} ${label}: ${hits.length} hit(s) [expect ${expect}]`);
  for (const h of hits) console.log(`      L${h.line} ${h.kind}: ${h.text}`);
}
console.log(failures === 0 ? "ALL MUTANTS CLOSED" : `${failures} FAILURES`);

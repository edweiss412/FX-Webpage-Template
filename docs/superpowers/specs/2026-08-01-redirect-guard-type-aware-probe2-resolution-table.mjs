/**
 * Probe 2 (spec §2): what does the type checker's resolved signature point at,
 * per spelling? Prints `decl=<name> container=<name> file=<path>` for every call
 * expression in each fixture — the evidence behind the spec §5.1 match criterion
 * (declaration named `redirect`, container named `NextResponse` or `Response`).
 *
 * Run: pnpm exec tsx docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe2-resolution-table.mjs
 *
 * Pure ts-morph API throughout: ts-morph vendors its own compiler, so mixing the
 * standalone `typescript` package's types with `compilerObject` nodes does not
 * survive strict tsc (probe 3's lesson, recorded in the plan).
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: true,
});

const PREAMBLE = `import { NextResponse, NextRequest } from "next/server";
declare const request: NextRequest;
declare const req: NextRequest;
declare const nextRequest: NextRequest;
declare const cond: boolean;
declare const p: string;
export function handler() {
`;
const POSTAMBLE = `\n}`;

const BODY_FIXTURES = [
  ["inline new URL", `return NextResponse.redirect(new URL(p, request.url));`],
  ["req.url spelling", `return NextResponse.redirect(new URL(p, req.url));`],
  ["variable-assigned", `const url = new URL(p, request.url);\nreturn NextResponse.redirect(url);`],
  ["alias chain", `const a = new URL(p, request.url);\nconst b = a;\nreturn NextResponse.redirect(b);`],
  ["captured base", `const base = request.url;\nreturn NextResponse.redirect(new URL(p, base));`],
  ["type-asserted", `return NextResponse.redirect(new URL(p, request.url) as URL);`],
  ["oddly named request param", `return NextResponse.redirect(new URL(p, nextRequest.url));`],
  ["destructured url", `const { url } = request;\nreturn NextResponse.redirect(new URL(p, url));`],
  ["bare nextUrl", `return NextResponse.redirect(request.nextUrl);`],
  ["cloned nextUrl", `const u = request.nextUrl.clone();\nu.pathname = p;\nreturn NextResponse.redirect(u);`],
  ["element access", `return NextResponse["redirect"](new URL(p, request.url));`],
  ["parenthesized receiver", `return (NextResponse).redirect(new URL(p, request.url));`],
  ["destructured method", `const { redirect } = NextResponse;\nreturn redirect(new URL(p, request.url));`],
  ["const-aliased receiver", `const NR = NextResponse;\nreturn NR.redirect(new URL(p, request.url));`],
  ["extracted method", `const go = NextResponse.redirect;\nreturn go(new URL(p, request.url));`],
  ["Web API Response.redirect", `return Response.redirect(new URL(p, request.url));`],
  ["nested block", `if (cond) {\n  const url = new URL(p, request.url);\n  return NextResponse.redirect(url);\n}`],
];

const WHOLE_FILES = [
  [
    "aliased import",
    `import { NextResponse as NR } from "next/server";\ndeclare const request: Request;\nexport function GET() {\n  return NR.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "namespace import",
    `import * as NS from "next/server";\ndeclare const request: Request;\nexport function GET() {\n  return NS.NextResponse.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "RESIDUAL helper-return",
    `import { NextResponse } from "next/server";\nfunction pick() { return NextResponse.redirect; }\nexport function GET(request: Request) {\n  return pick()(new URL("/x", request.url));\n}`,
  ],
  [
    "RESIDUAL class-field",
    `import { NextResponse } from "next/server";\nclass R { go = NextResponse.redirect; }\nexport function GET(request: Request) {\n  return new R().go(new URL("/x", request.url));\n}`,
  ],
  [
    "RESIDUAL dynamic dispatch",
    `import { NextResponse } from "next/server";\nconst table = { go: NextResponse.redirect };\nexport function GET(request: Request) {\n  const k = "go" as const;\n  return table[k](new URL("/x", request.url));\n}`,
  ],
  [
    "NEGATIVE hostRelativeRedirect",
    `import { hostRelativeRedirect } from "@/lib/http/hostRelativeRedirect";\nexport function GET() {\n  return hostRelativeRedirect("/x", 302);\n}`,
  ],
  [
    "NEGATIVE next/navigation redirect",
    `import { redirect } from "next/navigation";\nexport function GET() {\n  return redirect("/x");\n}`,
  ],
  [
    "NEGATIVE unrelated method named redirect",
    `class Router { redirect(u: string) { return u; } }\nexport function GET() {\n  return new Router().redirect("/x");\n}`,
  ],
];

project.createSourceFile(
  "app/__audit_fixture__/helper.ts",
  `export { NextResponse as Redirector } from "next/server";`,
  { overwrite: true },
);
WHOLE_FILES.push([
  "RESIDUAL re-export",
  `import { Redirector } from "./helper";\nexport function GET(request: Request) {\n  return Redirector.redirect(new URL("/x", request.url));\n}`,
]);

function containerName(decl) {
  let parent = decl.getParent();
  while (parent !== undefined) {
    if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) {
      return parent.getName() ?? null;
    }
    if (Node.isTypeLiteral(parent)) {
      const holder = parent.getParent();
      return Node.isVariableDeclaration(holder) ? `var ${holder.getName()}` : null;
    }
    parent = parent.getParent();
  }
  return null;
}

function describeCalls(label, fileName, text) {
  const sf = project.createSourceFile(fileName, text, { overwrite: true });
  const checker = project.getTypeChecker();
  console.log(`${label}:`);
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const sig = checker.getResolvedSignature(call);
    const decl = sig?.getDeclaration();
    if (decl === undefined) {
      console.log(`  call \`${call.getText().split("\n")[0]}\` -> NO signature declaration`);
      continue;
    }
    const name =
      Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl) || Node.isFunctionDeclaration(decl)
        ? decl.getName()
        : `(kind ${decl.getKindName()})`;
    const file = decl.getSourceFile().getFilePath().replace(/^.*node_modules\//, "nm:");
    console.log(
      `  call \`${call.getText().split("\n")[0]}\` -> decl=${String(name)} container=${String(containerName(decl))} file=${file}`,
    );
  }
}

let i = 0;
for (const [label, body] of BODY_FIXTURES) {
  describeCalls(label, `app/__audit_fixture__/f${i++}.ts`, PREAMBLE + body + POSTAMBLE);
}
for (const [label, text] of WHOLE_FILES) {
  describeCalls(label, `app/__audit_fixture__/w${i++}.ts`, text);
}

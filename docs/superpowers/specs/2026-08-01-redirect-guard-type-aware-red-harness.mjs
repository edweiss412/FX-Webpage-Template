/**
 * Task 1 Step A RED harness — HISTORICAL PIN. Run at commit ae063a687^ (the
 * pre-rewrite syntactic audit), every NEW positive-fixture body reported
 * 0 findings (escape), except R24/R36 which the old guard already caught —
 * the recorded output is the sibling ...-red-transcript.txt. The import is
 * live, so at HEAD this runs the NEW two-prong module and every ESCAPES row
 * reports caught instead: the flip is the arc's point.
 *
 * Run: pnpm exec tsx docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-red-harness.mjs
 */
import { auditSource } from "../../../tests/cross-cutting/no-absolute-self-redirect-audit";

const PRE = `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\n`;

const ROWS = [
  ["R20 helper-return", `import { NextResponse } from "next/server";\nfunction pick() { return NextResponse.redirect; }\nexport function GET(request: Request) {\n  return pick()(new URL("/x", request.url));\n}`],
  ["R21 class-field", `import { NextResponse } from "next/server";\nclass R { go = NextResponse.redirect; }\nexport function GET(request: Request) {\n  return new R().go(new URL("/x", request.url));\n}`],
  ["R22 re-export (importing side; sibling inlined as unresolvable import)", `import { Redirector } from "./helper";\nexport function GET(request: Request) {\n  return Redirector.redirect(new URL("/x", request.url));\n}`],
  ["R23 dynamic dispatch", `import { NextResponse } from "next/server";\nconst table = { go: NextResponse.redirect };\nexport function GET(request: Request) {\n  const k = "go" as const;\n  return table[k](new URL("/x", request.url));\n}`],
  ["R24 direct call in lib path (EXPECT CAUGHT)", PRE + `export function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`],
  ["R25 callback param", PRE + `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nexport function GET() { return invoke(NextResponse.redirect, new URL("/x", request.url)); }`],
  ["R26 structural type-literal property", PRE + `const impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`],
  ["R27 structural interface property", PRE + `interface Redirish { redirect: RedirectFn }\nconst impl: Redirish = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`],
  ["R28 class-field structural property", PRE + `class Impl { redirect: RedirectFn = NextResponse.redirect; }\nexport function GET() { return new Impl().redirect(new URL("/x", request.url)); }`],
  ["R29 conditional composite", PRE + `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nexport function GET() { return (cond ? NextResponse.redirect : safe)(new URL("/x", request.url)); }`],
  ["R30 tuple composite", PRE + `declare const i: number;\nconst safe = (u: string | URL) => new Response(String(u));\nconst tuple = [safe, NextResponse.redirect] as const;\nexport function GET() { return tuple[i]!(new URL("/x", request.url)); }`],
  ["R31 object-union composite", PRE + `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nconst obj = cond ? { go: safe } : { go: NextResponse.redirect };\nexport function GET() { return obj.go(new URL("/x", request.url)); }`],
  ["R32 .call adapter", PRE + `export function GET() { return NextResponse.redirect.call(NextResponse, new URL("/x", request.url)); }`],
  ["R33 .apply adapter", PRE + `export function GET() { return NextResponse.redirect.apply(NextResponse, [new URL("/x", request.url)]); }`],
  ["R34 Response.redirect.call", `declare const request: Request;\nexport function GET() { return Response.redirect.call(Response, new URL("/x", request.url)); }`],
  ["R35 renamed destructure extraction", PRE + `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nconst { redirect: r } = NextResponse;\nexport function GET() { return invoke(r, new URL("/x", request.url)); }`],
  ["R36 as-any VALUE laundering (EXPECT CAUGHT)", PRE + `const f = NextResponse.redirect as any;\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R37 const-literal computed key call", PRE + `const k = "redirect";\nexport function GET() { return NextResponse[k](new URL("/x", request.url)); }`],
  ["R38 identifier literal-key extraction", PRE + `const k = "redirect" as const;\nconst f: RedirectFn = NextResponse[k];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R39 template-key extraction", PRE + "const f = NextResponse[`redirect`];\nexport function GET() { return f(new URL(\"/x\", request.url)); }"],
  ["R40 const-object-key extraction", PRE + `const K = { r: "redirect" } as const;\nconst f = NextResponse[K.r];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R41 enum-key extraction", PRE + `enum E { R = "redirect" }\nconst f = NextResponse[E.R];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R42 computed destructuring", PRE + `const k = "redirect" as const;\nconst { [k]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R43 string-literal binding", PRE + `const { ["redirect"]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R44 computed-string binding", PRE + `const kk = "redirect";\nconst { [kk]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R45 parenthesized literal access", PRE + `const f = NextResponse[("redirect")];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R46 as-const access", PRE + `const f = NextResponse["redirect" as const];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R47 satisfies access", PRE + `const f = NextResponse["redirect" satisfies string];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R48 union-typed-key call", PRE + `declare const u: "redirect" | "json";\nexport function GET() { return (NextResponse as typeof NextResponse)[u as "redirect"](new URL("/x", request.url)); }`],
  ["R49 union-typed-key extraction", PRE + `declare const u2: "redirect" | "json";\nconst g = NextResponse[u2 as "redirect"];\nexport function GET() { return g(new URL("/x", request.url)); }`],
  ["R50 assignment rename", PRE + `let f: RedirectFn;\n({ redirect: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R51 assignment shorthand", PRE + `let redirect: RedirectFn;\n({ redirect } = NextResponse);\nexport function GET() { return redirect(new URL("/x", request.url)); }`],
  ["R52 assignment string-literal key", PRE + `let f: RedirectFn;\n({ ["redirect"]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R53 assignment computed literal-typed key", PRE + `let f: RedirectFn;\nconst kc = "redirect" as const;\n({ [kc]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R54 assignment with default", PRE + `const safe = (u: string | URL) => new Response(String(u));\nlet f: RedirectFn;\n({ redirect: f = safe } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R55 assignment Response twin", `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet f: RedirectFn;\n({ redirect: f } = Response);\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R56 array-nested assignment pattern", PRE + `let f: RedirectFn;\n[{ redirect: f }] = [NextResponse];\nexport function GET() { return f(new URL("/x", request.url)); }`],
  ["R57 for-of assignment-pattern head", PRE + `let f: RedirectFn;\nfor ({ redirect: f } of [NextResponse]) { break; }\nexport function GET() { return f(new URL("/x", request.url)); }`],
];

for (const [label, body] of ROWS) {
  const n = auditSource("app/__audit_fixture__/red.ts", body).length;
  const expectCaught = label.includes("EXPECT CAUGHT");
  const status = expectCaught
    ? n > 0 ? "already-green (regression floor)" : "UNEXPECTED: escaped"
    : n === 0 ? "ESCAPES old guard (RED)" : "UNEXPECTED: caught";
  console.log(`${label}: ${n} findings — ${status}`);
}

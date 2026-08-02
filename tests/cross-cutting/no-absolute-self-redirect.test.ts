/**
 * tests/cross-cutting/no-absolute-self-redirect.test.ts
 *
 * `NextResponse.redirect(...)` (and Web API `Response.redirect`) is banned under
 * the walked roots except for allow-listed external targets. It emits an
 * absolute `Location`, and when that URL is built from `request.url` the host is
 * whatever Next reports rather than what the client typed — which drops
 * host-scoped cookies and silently unauthenticates the next request.
 * `hostRelativeRedirect` (lib/http) is the replacement.
 *
 * The guard is TWO-PRONG and type-decided (see the audit module header): calls
 * are matched by resolved-signature identity, and every other reference to the
 * banned method — extraction, storage, passing, adaptation — is itself a
 * finding at the site where the member name is spelled. The fixture tables
 * below are the mutation-family closure set from the spec
 * (docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md §6):
 * R1–R19 legacy spellings (regression floor), the R20+ families that defeated
 * earlier constructions, the N-series negatives, and the E1 documented-escape
 * pin — spec §6 is the single source of truth for the closure table (grown
 * across the whole-diff review rounds; exact ranges live only there).
 */
import { existsSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  addFixtureModule,
  auditSource,
  auditTree,
  EXTERNAL_REDIRECT_ALLOWLIST,
  unallowedRedirects,
  type TreeAudit,
} from "./no-absolute-self-redirect-audit";

/**
 * Type resolution requires resolvable identifiers, so every fixture is a whole
 * compilable module: the body-only legacy rows get this preamble; the rest
 * carry their own imports/declares.
 */
const PREAMBLE = `import { NextResponse, NextRequest } from "next/server";
declare const request: NextRequest;
declare const req: NextRequest;
declare const nextRequest: NextRequest;
declare const cond: boolean;
declare const p: string;
export function handler() {
`;
const POSTAMBLE = `\n}`;
const wrap = (body: string): string => PREAMBLE + body + POSTAMBLE;

/** Shared preamble for the R25+ mutant families (spec §6.1). */
const PRE = `import { NextResponse } from "next/server";
declare const request: Request;
type RedirectFn = (url: string | URL, status?: number) => Response;
`;

/**
 * R1–R19: the 19 legacy spellings, call-shape text preserved verbatim. Each
 * silently reintroduces the host flip if it stops being flagged.
 */
const FLAGGED_SPELLINGS: Array<[string, string]> = [
  ["inline new URL", wrap(`return NextResponse.redirect(new URL(p, request.url));`)],
  ["req.url spelling", wrap(`return NextResponse.redirect(new URL(p, req.url));`)],
  [
    "variable-assigned",
    wrap(`const url = new URL(p, request.url);\nreturn NextResponse.redirect(url);`),
  ],
  [
    "alias chain",
    wrap(`const a = new URL(p, request.url);\nconst b = a;\nreturn NextResponse.redirect(b);`),
  ],
  [
    "captured base",
    wrap(`const base = request.url;\nreturn NextResponse.redirect(new URL(p, base));`),
  ],
  ["type-asserted", wrap(`return NextResponse.redirect(new URL(p, request.url) as URL);`)],
  ["oddly named request param", wrap(`return NextResponse.redirect(new URL(p, nextRequest.url));`)],
  [
    "destructured url",
    wrap(`const { url } = request;\nreturn NextResponse.redirect(new URL(p, url));`),
  ],
  ["bare nextUrl", wrap(`return NextResponse.redirect(request.nextUrl);`)],
  [
    "cloned nextUrl with a mutated pathname",
    wrap(`const u = request.nextUrl.clone();\nu.pathname = p;\nreturn NextResponse.redirect(u);`),
  ],
  [
    "aliased import",
    `import { NextResponse as NR } from "next/server";\ndeclare const request: Request;\ndeclare const p: string;\nexport function handler() {\n  return NR.redirect(new URL(p, request.url));\n}`,
  ],
  ["element access", wrap(`return NextResponse["redirect"](new URL(p, request.url));`)],
  ["parenthesized receiver", wrap(`return (NextResponse).redirect(new URL(p, request.url));`)],
  [
    "destructured method",
    wrap(`const { redirect } = NextResponse;\nreturn redirect(new URL(p, request.url));`),
  ],
  [
    "namespace import",
    `import * as NS from "next/server";\ndeclare const request: Request;\ndeclare const p: string;\nexport function handler() {\n  return NS.NextResponse.redirect(new URL(p, request.url));\n}`,
  ],
  [
    "const-aliased receiver",
    wrap(`const NR = NextResponse;\nreturn NR.redirect(new URL(p, request.url));`),
  ],
  [
    "extracted method",
    wrap(`const go = NextResponse.redirect;\nreturn go(new URL(p, request.url));`),
  ],
  ["the Web API Response.redirect", wrap(`return Response.redirect(new URL(p, request.url));`)],
  [
    "declared inside a nested block",
    wrap(
      `if (cond) {\n  const url = new URL(p, request.url);\n  return NextResponse.redirect(url);\n}`,
    ),
  ],
];

/**
 * The R20+ families that defeated syntactic resolution or an earlier
 * construction round (spec §6.1 is the canonical table; multi-module rows are
 * asserted separately below). Old-guard verdicts per the Task-1 RED harness:
 * 0 findings for every row except R24/R36, which the old guard already caught
 * (regression floor).
 */
const NEW_FAMILY_ROWS: Array<[string, string]> = [
  [
    "R20 helper return",
    `import { NextResponse } from "next/server";\nfunction pick() { return NextResponse.redirect; }\nexport function GET(request: Request) {\n  return pick()(new URL("/x", request.url));\n}`,
  ],
  [
    "R21 class field holding the method",
    `import { NextResponse } from "next/server";\nclass R { go = NextResponse.redirect; }\nexport function GET(request: Request) {\n  return new R().go(new URL("/x", request.url));\n}`,
  ],
  [
    "R23 dynamic dispatch (typed)",
    `import { NextResponse } from "next/server";\nconst table = { go: NextResponse.redirect };\nexport function GET(request: Request) {\n  const k = "go" as const;\n  return table[k](new URL("/x", request.url));\n}`,
  ],
  [
    "R25 callback parameter",
    PRE +
      `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nexport function GET() { return invoke(NextResponse.redirect, new URL("/x", request.url)); }`,
  ],
  [
    "R26 structural type-literal property",
    PRE +
      `const impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R27 structural interface property",
    PRE +
      `interface Redirish { redirect: RedirectFn }\nconst impl: Redirish = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R28 structural class-field property",
    PRE +
      `class Impl { redirect: RedirectFn = NextResponse.redirect; }\nexport function GET() { return new Impl().redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R29 conditional composite",
    PRE +
      `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nexport function GET() { return (cond ? NextResponse.redirect : safe)(new URL("/x", request.url)); }`,
  ],
  [
    "R30 tuple composite",
    PRE +
      `declare const i: number;\nconst safe = (u: string | URL) => new Response(String(u));\nconst tuple = [safe, NextResponse.redirect] as const;\nexport function GET() { return tuple[i]!(new URL("/x", request.url)); }`,
  ],
  [
    "R31 object-union composite",
    PRE +
      `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nconst obj = cond ? { go: safe } : { go: NextResponse.redirect };\nexport function GET() { return obj.go(new URL("/x", request.url)); }`,
  ],
  [
    "R32 .call adapter",
    PRE +
      `export function GET() { return NextResponse.redirect.call(NextResponse, new URL("/x", request.url)); }`,
  ],
  [
    "R33 .apply adapter",
    PRE +
      `export function GET() { return NextResponse.redirect.apply(NextResponse, [new URL("/x", request.url)]); }`,
  ],
  [
    "R34 Web API adapter",
    `declare const request: Request;\nexport function GET() { return Response.redirect.call(Response, new URL("/x", request.url)); }`,
  ],
  [
    "R35 renamed destructure extraction",
    PRE +
      `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nconst { redirect: r } = NextResponse;\nexport function GET() { return invoke(r, new URL("/x", request.url)); }`,
  ],
  [
    "R36 as-any VALUE laundering",
    PRE +
      `const f = NextResponse.redirect as any;\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R37 const-literal computed key call",
    PRE +
      `const k = "redirect";\nexport function GET() { return NextResponse[k](new URL("/x", request.url)); }`,
  ],
  [
    "R38 identifier literal-key extraction",
    PRE +
      `const k = "redirect" as const;\nconst f: RedirectFn = NextResponse[k];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R39 template-key extraction",
    PRE +
      'const f = NextResponse[`redirect`];\nexport function GET() { return f(new URL("/x", request.url)); }',
  ],
  [
    "R40 const-object-key extraction",
    PRE +
      `const K = { r: "redirect" } as const;\nconst f = NextResponse[K.r];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R41 enum-key extraction",
    PRE +
      `enum E { R = "redirect" }\nconst f = NextResponse[E.R];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R42 computed destructuring",
    PRE +
      `const k = "redirect" as const;\nconst { [k]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R43 string-literal binding",
    PRE +
      `const { ["redirect"]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R44 computed-string binding",
    PRE +
      `const kk = "redirect";\nconst { [kk]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R45 parenthesized literal access",
    PRE +
      `const f = NextResponse[("redirect")];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R46 as-const access",
    PRE +
      `const f = NextResponse["redirect" as const];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R47 satisfies access",
    PRE +
      `const f = NextResponse["redirect" satisfies string];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R48 union-typed-key call",
    PRE +
      `declare const u: "redirect" | "json";\nexport function GET() { return (NextResponse as typeof NextResponse)[u as "redirect"](new URL("/x", request.url)); }`,
  ],
  [
    "R49 union-typed-key extraction",
    PRE +
      `declare const u2: "redirect" | "json";\nconst g = NextResponse[u2 as "redirect"];\nexport function GET() { return g(new URL("/x", request.url)); }`,
  ],
  [
    "R50 assignment rename",
    PRE +
      `let f: RedirectFn;\n({ redirect: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R51 assignment shorthand",
    PRE +
      `let redirect: RedirectFn;\n({ redirect } = NextResponse);\nexport function GET() { return redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R52 assignment string-literal key",
    PRE +
      `let f: RedirectFn;\n({ ["redirect"]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R53 assignment computed literal-typed key",
    PRE +
      `let f: RedirectFn;\nconst kc = "redirect" as const;\n({ [kc]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R54 assignment with default",
    PRE +
      `const safe = (u: string | URL) => new Response(String(u));\nlet f: RedirectFn;\n({ redirect: f = safe } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R55 assignment Response twin",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet f: RedirectFn;\n({ redirect: f } = Response);\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R56 array-nested assignment pattern",
    PRE +
      `let f: RedirectFn;\n[{ redirect: f }] = [NextResponse];\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  [
    "R57 for-of assignment-pattern head",
    PRE +
      `let f: RedirectFn;\nfor ({ redirect: f } of [NextResponse]) { break; }\nexport function GET() { return f(new URL("/x", request.url)); }`,
  ],
  // Whole-receiver structural laundering (whole-diff r2): the class OBJECT
  // flows into a differently-typed slot with no cast at all; the naked
  // reference is the finding.
  [
    "R58 whole-receiver annotated variable",
    PRE +
      `const R: { redirect: RedirectFn } = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R59 whole-receiver interface-typed variable",
    PRE +
      `interface Ish { redirect: RedirectFn }\nconst R: Ish = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R60 whole-receiver parameter",
    PRE +
      `function go(r: { redirect: RedirectFn }, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`,
  ],
  [
    "R61 whole-receiver helper return",
    PRE +
      `function pick(): { redirect: RedirectFn } { return NextResponse; }\nexport function GET() { return pick().redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R62 whole-receiver class field",
    PRE +
      `class Holder { r: { redirect: RedirectFn } = NextResponse; }\nexport function GET() { return new Holder().r.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R63 whole-receiver generic constraint",
    PRE +
      `function go<T extends { redirect: RedirectFn }>(r: T, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`,
  ],
  [
    "R64 whole-receiver typed array",
    PRE +
      `const arr: Array<{ redirect: RedirectFn }> = [NextResponse];\nexport function GET() { return arr[0]!.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R65 whole-receiver Response twin",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Response;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R66 whole-receiver aliased-import naked flow",
    `import { NextResponse as NR } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NR;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R67 whole-receiver namespace-import naked flow",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NS.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  // Former documented limits, closed by the naked-reference prong: each spells
  // the class object in a value position before erasing its type.
  [
    "R68 receiver-as-any laundering (former E1)",
    PRE +
      `export function GET() { return (NextResponse as any).redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R69 widened computed key (former E2)",
    PRE +
      `const kw: string = "redirect";\nexport function GET() { return (NextResponse as unknown as Record<string, Function>)[kw]!(new URL("/x", request.url)); }`,
  ],
  [
    "R70 Reflect.get",
    PRE +
      `declare const k2: string;\nexport function GET() { const f = Reflect.get(NextResponse, k2); return f(new URL("/x", request.url)); }`,
  ],
  [
    "R71 bare .call adapter with no naked thisArg",
    PRE +
      `export function GET() { return NextResponse.redirect.call(undefined, new URL("/x", request.url)); }`,
  ],
  // Namespace carriers (whole-diff r3): the class object rides one property
  // deep inside a module-namespace object; the naked namespace reference is
  // the finding.
  [
    "R72 namespace member assignment-destructure",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R: { redirect: RedirectFn };\n({ NextResponse: R } = NS);\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R73 namespace object-rest assignment",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet rest: { NextResponse: { redirect: RedirectFn } };\n(({ ...rest } = NS));\nexport function GET() { return rest.NextResponse.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R74 namespace declaration destructure",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst { NextResponse: R } = NS;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R75 namespace stuffed into an object",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: NS };\nexport function GET() { return box.ns.NextResponse.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "R76 dynamic-import binding naked flow",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const R: { redirect: RedirectFn } = m.NextResponse;\n  return R.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "R77 dynamic-import namespace stuffed",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: m };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`,
  ],
  // Import-call carriers (whole-diff r4): every downstream shape flags at the
  // `import("next/server")` spelling itself, decided on the awaited type.
  [
    "R78 direct awaited-import stuffing",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: await import("next/server") };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "R79 dynamic-import declaration destructuring",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const { NextResponse: R } = await import("next/server");\n  return (R as { redirect: RedirectFn }).redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "R80 dynamic-import assignment destructuring",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R80: { redirect: RedirectFn };\nexport async function GET() {\n  ({ NextResponse: R80 } = await import("next/server"));\n  return R80.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "R81 promise-carried namespace",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const pr = import("next/server");\n  const m: { NextResponse: { redirect: RedirectFn } } = await pr;\n  return m.NextResponse.redirect(new URL("/x", request.url));\n}`,
  ],
  [
    "R82 .then callback stuffing",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport function GET() {\n  return import("next/server").then((m) => (m.NextResponse as { redirect: RedirectFn }).redirect(new URL("/x", request.url)));\n}`,
  ],
];

/** N-rows (spec §6.2): constructions that must stay quiet. */
const NEGATIVE_ROWS: Array<[string, string]> = [
  [
    "N1 hostRelativeRedirect, the sanctioned replacement",
    `import { hostRelativeRedirect } from "@/lib/http/hostRelativeRedirect";\nexport function GET() { return hostRelativeRedirect("/x", 302); }`,
  ],
  [
    "N2 next/navigation redirect — call and extraction",
    `import { redirect } from "next/navigation";\nconst r = redirect;\nexport function GET() { return r("/x"); }`,
  ],
  [
    "N3 unrelated container method — extraction, .call adapter, element access",
    `class Router { redirect(u: string) { return u; } }\nconst rt = new Router();\nconst m = rt["redirect"];\nexport function GET() { return m.call(rt, "/x"); }`,
  ],
  [
    "N4 NextResponse constructor with a relative Location (hostRelativeRedirect's own mechanism)",
    `import { NextResponse } from "next/server";\nexport function GET() { return new NextResponse(null, { status: 302, headers: { Location: "/x" } }); }`,
  ],
  [
    "N6 ordinary element access and destructuring",
    `declare const xs: string[];\ndeclare const i: number;\nconst { length } = xs;\nexport function GET() { return xs[i] ?? String(length); }`,
  ],
  [
    "N7 benign assignment destructure",
    `const src = { redirect: (u: string) => u };\nlet g: (u: string) => string;\n({ redirect: g } = src);\nexport function GET() { return g("/x"); }`,
  ],
  [
    "N7 value-position object literal",
    PRE +
      `const safe = (u: string | URL) => new Response(String(u));\nconst o = { redirect: safe };\nexport function GET() { return o.redirect(new URL("/x", request.url)); }`,
  ],
  [
    "N8 non-extracting whole-object positions (new, member receiver, instanceof, typeof)",
    `import { NextResponse } from "next/server";\ndeclare const x: unknown;\nexport function GET() {\n  const inst = new NextResponse(null, { status: 302, headers: { Location: "/x" } });\n  const j = NextResponse.json({ ok: true });\n  return x instanceof Response && typeof Response !== "undefined" ? inst : j;\n}`,
  ],
  [
    "N9 ordinary namespace member and type-position uses",
    `import * as NS from "next/server";\ndeclare const req2: NS.NextRequest;\nexport function GET() { return NS.NextResponse.json({ url: String(req2.url) }); }`,
  ],
];

/**
 * E-pin (spec §6.3 / §7 limit 1): the one remaining type-erasure escape,
 * asserted AS BEHAVIOR so a change to the boundary trips a test and updates
 * the header deliberately. Receiver laundering, widened keys, and Reflect.get
 * are no longer here — they are positives (R68–R70).
 */
const ESCAPE_PINS: Array<[string, string]> = [
  [
    "E1 string-mediated dynamic access (eval)",
    PRE +
      `declare function evil(code: string): unknown;\nexport function GET() { const f = evil("NextResponse.redirect") as RedirectFn; return f(new URL("/x", request.url)); }`,
  ],
];

describe("no absolute self-redirect under the walked roots", () => {
  let fixtureIndex = 0;
  const fixturePath = (): string => `app/__audit_fixture__/f${fixtureIndex++}.ts`;

  it.each(FLAGGED_SPELLINGS)("flags legacy spelling: %s", (_label, source) => {
    expect(auditSource(fixturePath(), source).length).toBeGreaterThan(0);
  });

  it.each(NEW_FAMILY_ROWS)("flags %s", (_label, source) => {
    expect(auditSource(fixturePath(), source).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "R83 renamed re-export + structural laundering",
      "app/__audit_fixture__/r83-helper.ts",
      `export { NextResponse as Redirector } from "next/server";`,
      `import { Redirector } from "./r83-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Redirector;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R84 default re-export + laundering",
      "app/__audit_fixture__/r84-helper.ts",
      `import { NextResponse } from "next/server";\nexport default NextResponse;`,
      `import Def from "./r84-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Def;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R85 namespace re-export + laundering",
      "app/__audit_fixture__/r85-helper.ts",
      `export * as SrvNS from "next/server";`,
      `import { SrvNS } from "./r85-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: SrvNS };\nexport function GET() { return R.ns.NextResponse.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R86 two-hop renamed re-export + laundering",
      "app/__audit_fixture__/r86-helper.ts",
      `export { Redirector as Hop } from "./r83-helper";`,
      `import { Hop } from "./r86-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Hop;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    ],
  ])("flags %s", (_label, helperPath, helperSource, consumerSource) => {
    // Every row lays down the full helper chain it needs — order-independent
    // (whole-diff r6 finding 2: R86 previously relied on R83's helper).
    addFixtureModule(
      "app/__audit_fixture__/r83-helper.ts",
      `export { NextResponse as Redirector } from "next/server";`,
    );
    addFixtureModule(helperPath, helperSource);
    expect(auditSource(fixturePath(), consumerSource).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "R87 renamed-export namespace stuffing",
      `import * as NSr from "./r83-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { Redirector: { redirect: RedirectFn } } = NSr;\nexport function GET() { return R.Redirector.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R88 default-export namespace stuffing",
      `import * as NSd from "./r84-helper";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { default: { redirect: RedirectFn } } = NSd;\nexport function GET() { return R.default.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R89 dynamic import of a renamed-export helper",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m: { Redirector: { redirect: RedirectFn } } = await import("./r83-helper");\n  return m.Redirector.redirect(new URL("/x", request.url));\n}`,
    ],
  ])("flags %s", (_label, consumerSource) => {
    addFixtureModule(
      "app/__audit_fixture__/r83-helper.ts",
      `export { NextResponse as Redirector } from "next/server";`,
    );
    addFixtureModule(
      "app/__audit_fixture__/r84-helper.ts",
      `import { NextResponse } from "next/server";\nexport default NextResponse;`,
    );
    expect(auditSource(fixturePath(), consumerSource).length).toBeGreaterThan(0);
  });

  it("does not track unrelated import bindings (N10)", () => {
    expect(
      auditSource(
        fixturePath(),
        `import { join } from "node:path";\nconst j = join;\nexport function GET() { return j("a", "b"); }`,
      ),
    ).toEqual([]);
  });

  it("flags R22 re-export through a sibling module", () => {
    addFixtureModule(
      "app/__audit_fixture__/r22-helper.ts",
      `export { NextResponse as Redirector } from "next/server";`,
    );
    const findings = auditSource(
      "app/__audit_fixture__/r22.ts",
      `import { Redirector } from "./r22-helper";\nexport function GET(request: Request) {\n  return Redirector.redirect(new URL("/x", request.url));\n}`,
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("flags R24 direct call in a lib/ path (walked-roots extension)", () => {
    const findings = auditSource(
      "lib/__audit_fixture__/r24.ts",
      PRE + `export function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`,
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it.each([
    [
      "R90 untyped require carrier",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSr = require("next/server");\nconst R: { NextResponse: { redirect: RedirectFn } } = NSr;\nexport function GET() { return R.NextResponse.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R91 as-cast require carrier",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSc = require("next/server") as typeof import("next/server");\nconst R: { redirect: RedirectFn } = NSc.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    ],
    [
      "R92 renamed require carrier",
      `declare const request: Request;\nconst r2 = require;\nconst NS2 = r2("next/server");\nexport function GET() { return NS2; }`,
    ],
  ])("flags %s", (_label, source) => {
    expect(auditSource(fixturePath(), source).length).toBeGreaterThan(0);
  });

  it("flags R93 import-equals alias + structural receiver", () => {
    // `import NR = NS.NextResponse` is value space (whole-diff r10): the
    // binding is tracked type-decidedly and its naked use flags.
    const findings = auditSource(
      fixturePath(),
      `import * as NSie from "next/server";\nimport NRie = NSie.NextResponse;\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NRie;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("flags R94 global-object carrier into a structural parameter", () => {
    // whole-diff r14: globalThis IS a carrier (its type holds Response); the
    // naked argument flow is the extraction site.
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nexport function GET() { return viaEnvironment(globalThis, new URL("/x", request.url)); }`,
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("flags R95 aliased global carrier through a reverse-ordered chain", () => {
    // whole-diff r15/r16/r17: the use precedes every declaration, and the
    // chain (env2 <- pick() <- environment <- globalThis) is laid out so a
    // single declaration-order pass cannot resolve it - only the fixpoint can.
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nexport function GET() { return viaEnvironment(env2, new URL("/x", request.url)); }\nconst env2 = pick();\nfunction pick() { return environment; }\nconst environment = globalThis;`,
    );
    expect(findings.some((f) => f.text === "env2")).toBe(true);
  });

  it("flags R96 helper-return global carriers (function and arrow)", () => {
    // whole-diff r16: single-file helper returns join the carrier fixpoint.
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction currentEnvironment() { return globalThis; }\nconst pickEnvironment = () => globalThis;\nexport function GET() {\n  const a = viaEnvironment(currentEnvironment(), new URL("/x", request.url));\n  const b = viaEnvironment(pickEnvironment(), new URL("/y", request.url));\n  return [a, b];\n}`,
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    [
      "R97 function-expression helper",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nconst pickFE = function () { return globalThis; };\nexport function GET() { return viaEnvironment(pickFE(), new URL("/x", request.url)); }`,
    ],
    [
      "R98 async helper awaited",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nasync function pickAsync() { return globalThis; }\nexport async function GET() { return viaEnvironment(await pickAsync(), new URL("/x", request.url)); }`,
    ],
    [
      "R99 staged-initialization alias",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nlet environment: typeof globalThis | undefined;\nenvironment = globalThis;\nexport function GET() { return viaEnvironment(environment!, new URL("/x", request.url)); }`,
    ],
  ])("flags %s", (_label, source) => {
    expect(auditSource(fixturePath(), source).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "R100 conditional-return helper with parenthesized invocation",
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction pick() { return typeof window === "undefined" ? globalThis : window; }\nexport function GET() { return viaEnvironment((pick)(), new URL("/x", request.url)); }`,
    ],
  ])("flags %s", (_label, source) => {
    expect(auditSource(fixturePath(), source).length).toBeGreaterThan(0);
  });

  it("flags R101 initializer helper alias (each path pinned separately)", () => {
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction pick() { return globalThis; }\nconst choose = (pick)!;\nexport function GET() { return viaEnvironment(choose(), new URL("/x", request.url)); }`,
    );
    expect(findings).toHaveLength(1);
  });

  it("flags R102 wrapped inline helper initializer", () => {
    // whole-diff r21: `const pick = (() => globalThis)!` — the function-like
    // initializer classifies through the same RHS unwrap as aliases.
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nconst pick = (() => globalThis)!;\nexport function GET() { return viaEnvironment(pick(), new URL("/x", request.url)); }`,
    );
    expect(findings).toHaveLength(1);
  });

  it("flags R101b staged helper alias through a type-asserted RHS", () => {
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction pick() { return globalThis; }\nlet later: typeof pick;\nlater = pick as typeof pick;\nexport function GET() { return viaEnvironment(later(), new URL("/y", request.url)); }`,
    );
    expect(findings).toHaveLength(1);
  });

  it("D1: flow-insensitive taint is deliberate — safe-after-carrier reassignment still flags", () => {
    // Ratified whole-diff r22: a symbol EVER assigned a carrier is a carrier at
    // every use. Flow-sensitivity is dataflow analysis this guard deliberately
    // does not do; the worst case is a VISIBLE false positive on mixed-use of
    // one binding (distinct names resolve it), never a silent miss. If this
    // pin trips, flow-sensitivity was added — update spec §5.1 deliberately.
    const findings = auditSource(
      fixturePath(),
      `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction carrierPick() { return globalThis; }\nfunction safePick() { return { Response: { redirect: ((u: string | URL) => new Response(String(u))) as RedirectFn } }; }\nlet pick = carrierPick;\npick = safePick;\nexport function GET() { return viaEnvironment(pick(), new URL("/x", request.url)); }`,
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does not flag a safe outer helper containing nested carrier scopes (N18)", () => {
    // r17/r18 FP: return scanning is owned-returns-only, incl. accessors and
    // class expressions. The sink IS redirect-shaped, so a misclassification
    // of outerSafe as a carrier WOULD flag — that is the pin.
    expect(
      auditSource(
        fixturePath(),
        `type RedirectFn = (url: string | URL, status?: number) => Response;\nconst safeRedirect: RedirectFn = (u) => new Response(String(u));\nfunction take(g: { Response: { redirect: RedirectFn } }) { return g; }\nfunction outerSafe() {\n  function nested() { return globalThis; }\n  const withGetter = { get env() { return globalThis; } };\n  const K = class { pick() { return globalThis; } };\n  void nested; void withGetter; void K;\n  return { Response: { redirect: safeRedirect } };\n}\nexport function GET() { return take(outerSafe()); }`,
      ),
    ).toEqual([]);
  });

  it("does not flag shadowing or same-named locals (N17)", () => {
    // whole-diff r16: provenance is symbol-based — a shadowing parameter and a
    // local named `global` resolve to their own declarations, never the
    // ambient globals.
    expect(
      auditSource(
        fixturePath(),
        `type RedirectFn = (url: string | URL, status?: number) => Response;\nconst safeLocalRedirect: RedirectFn = (u) => new Response(String(u));\nconst environment = globalThis;\nfunction useShadow(environment: { Response: { redirect: RedirectFn } }) {\n  return environment;\n}\nconst global = { Response: { redirect: safeLocalRedirect } };\nfunction take(g: { Response: { redirect: RedirectFn } }) { return g; }\nexport function GET() { return [useShadow(global), take(global), environment.location]; }`,
      ),
    ).toEqual([]);
  });

  it("does not flag ordinary global-object receiver/typeof uses (N16)", () => {
    expect(
      auditSource(
        fixturePath(),
        `export function GET() {\n  const a = globalThis.structuredClone({ ok: 1 });\n  const b = typeof globalThis;\n  const c = globalThis.Response.json({ ok: 2 });\n  return [a, b, c];\n}`,
      ),
    ).toEqual([]);
  });

  it("does not flag wrapped non-extracting positions (N15)", () => {
    // Transparent wrappers climb to the real position (whole-diff r13):
    // wrapped receivers, new-callees, instanceof RHS, typeof operands.
    expect(
      auditSource(
        fixturePath(),
        `import { NextResponse } from "next/server";\ndeclare const x: unknown;\nexport function GET() {\n  const a = (NextResponse).json({ ok: 1 });\n  const b = NextResponse!.json({ ok: 2 });\n  const c = new (NextResponse)(null, { status: 302, headers: { Location: "/x" } });\n  const d = x instanceof (Response);\n  const e = typeof (Response);\n  return [a, b, c, d, e];\n}`,
      ),
    ).toEqual([]);
  });

  it("does not flag an app-local class merely named Response (N14)", () => {
    // Provenance pin (whole-diff r11): only node_modules-declared containers
    // are banned; a local domain model sharing the name is not.
    expect(
      auditSource(
        fixturePath(),
        `class Response2 {}\nclass Response { redirect(u: string) { return u; } }\nconst r = new Response();\nconst m = r.redirect;\nexport function GET() { return [m.call(r, "/x"), new Response2()]; }`,
      ),
    ).toEqual([]);
  });

  it("does not flag type-only typeof member references (N13)", () => {
    // `typeof NextResponse.json` etc. parse as QualifiedName chains — pure type
    // space (whole-diff r9 false-positive fix).
    expect(
      auditSource(
        fixturePath(),
        `import { NextResponse } from "next/server";\nimport * as NSq from "next/server";\ntype A = typeof NextResponse.json;\ntype B = typeof Response.redirect;\ntype C = typeof NSq.NextResponse.json;\ntype D = typeof globalThis.Response.json;\nexport type All = [A, B, C, D];`,
      ),
    ).toEqual([]);
  });

  it("require-specifier verdicts do not survive a fixture-module overwrite", () => {
    // whole-diff r9 finding 2: the cache must invalidate when addFixtureModule
    // changes what a specifier resolves to — in BOTH directions.
    addFixtureModule("app/__audit_fixture__/cacheflip.ts", `export const nothing = 1;`);
    const consumer = `const m = require("./cacheflip");\nexport function GET() { return m; }`;
    expect(auditSource(fixturePath(), consumer)).toEqual([]);
    addFixtureModule(
      "app/__audit_fixture__/cacheflip.ts",
      `export { NextResponse } from "next/server";`,
    );
    expect(auditSource(fixturePath(), consumer).length).toBeGreaterThan(0);
    addFixtureModule("app/__audit_fixture__/cacheflip.ts", `export const nothing = 1;`);
    expect(auditSource(fixturePath(), consumer)).toEqual([]);
  });

  it("does not flag a local callable interface named Require (N12)", () => {
    // The require branch pins Node's declaration; a same-named local callable
    // was a probed false positive (whole-diff r8 finding 4).
    expect(
      auditSource(
        fixturePath(),
        `interface Require { (id: string): unknown }\ndeclare const lookup: Require;\nexport function GET() { return lookup("next/server"); }`,
      ),
    ).toEqual([]);
  });

  it("does not flag require of an unrelated module (N11)", () => {
    expect(
      auditSource(
        fixturePath(),
        `const p = require("react");\nexport function GET() { return typeof p; }`,
      ),
    ).toEqual([]);
  });

  it.each(NEGATIVE_ROWS)("does not flag %s", (_label, source) => {
    expect(auditSource(fixturePath(), source)).toEqual([]);
  });

  it("N5: a direct banned call produces exactly ONE finding (no call+reference double count)", () => {
    const findings = auditSource(
      fixturePath(),
      PRE + `export function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("call");
  });

  it.each(ESCAPE_PINS)(
    "documented limit stays a deliberate boundary: %s produces 0 findings",
    (_label, source) => {
      // Spec §7 limit 1: a name that reaches the method only inside a string
      // literal is invisible to every static prong. If this assertion starts
      // failing, the guard got stronger — update the module header and spec.
      expect(auditSource(fixturePath(), source)).toEqual([]);
    },
  );

  it("fixture namespaces never shadow real files", () => {
    expect(existsSync("app/__audit_fixture__")).toBe(false);
    expect(existsSync("lib/__audit_fixture__")).toBe(false);
  });

  it.each([
    ["outside both roots", "tests/__audit_fixture__/outside.ts"],
    ["non-segment lookalike", "app/not__audit_fixture__suffix/outside.ts"],
    ["traversal escape", "app/__audit_fixture__/../api/outside.ts"],
  ])("rejects a fixture path %s", (_label, path) => {
    // The namespace is an exact segment prefix under app/ or lib/, no `..` —
    // anything else could shadow or masquerade as a real file.
    expect(() => auditSource(path, "export {};")).toThrow(/__audit_fixture__/);
  });

  it("every allow-list row states a reason and pins the argument it was granted for", () => {
    for (const [site, row] of Object.entries(EXTERNAL_REDIRECT_ALLOWLIST)) {
      expect(row.reason.length, `${site} has no reason`).toBeGreaterThan(20);
      // The argument pin is what stops an in-place edit — `data.url` becoming
      // `new URL(path, request.url)` on the same line — from inheriting the row.
      expect(row.argument.length, `${site} pins no argument`).toBeGreaterThan(3);
    }
  });

  it("an allow-listed line stops being exempt if its argument changes", () => {
    // Compilable module whose call sits exactly on the allowlisted line (72),
    // with an argument the row was NOT granted for.
    const padding = Array.from({ length: 67 }, (_, n) => `// pad ${n}`).join("\n");
    const source = `${PRE}declare const p2: string;\n${padding}\nexport function GET() { return NextResponse.redirect(new URL(p2, request.url), { status: 302 }); }`;
    const findings = auditSource("app/api/auth/google/start/route.ts", source);
    const flagged = findings.filter((f) => f.kind === "call");
    expect(flagged).toHaveLength(1);
    // Padding honesty: the call must actually sit on the allowlisted line.
    expect(flagged[0]!.line).toBe(72);
    expect(unallowedRedirects("app/api/auth/google/start/route.ts", findings)).toHaveLength(1);
  });

  describe("the real tree", () => {
    let tree: TreeAudit;

    beforeAll(() => {
      tree = auditTree();
    }, 120_000);

    it("every banned call or reference under the walked roots is allow-listed", () => {
      const offenders: string[] = [];
      for (const [path, findings] of tree.findingsByFile) {
        for (const f of unallowedRedirects(path, findings)) {
          offenders.push(`${path}:${f.line} [${f.kind}] ${f.text}`);
        }
      }
      expect(
        offenders,
        "NextResponse.redirect emits an ABSOLUTE Location; built from the request it can flip " +
          "the host and drop host-scoped cookies. Use hostRelativeRedirect from " +
          "lib/http/hostRelativeRedirect.ts, or — only for a genuinely external target — add a " +
          "reasoned row to EXTERNAL_REDIRECT_ALLOWLIST. Extraction references are never " +
          "allow-listable.",
      ).toEqual([]);
    });

    it("the allow-list carries no stale rows", () => {
      // A moved or deleted call must re-surface for review rather than leaving a
      // row that silently exempts whatever now occupies that line.
      const live = new Set<string>();
      for (const [path, findings] of tree.findingsByFile) {
        for (const f of findings) {
          if (f.kind === "call") live.add(`${path}:${f.line}`);
        }
      }
      const stale = Object.keys(EXTERNAL_REDIRECT_ALLOWLIST).filter((k) => !live.has(k));
      expect(stale, "allow-list rows pointing at no NextResponse.redirect call").toEqual([]);
    });

    it("visited enough files that a broken walk cannot pass vacuously", () => {
      expect(tree.visitedAppFiles).toBeGreaterThan(50);
      expect(tree.visitedLibFiles).toBeGreaterThanOrEqual(1);
    });

    it("the walked roots contain no plain-JS modules", () => {
      expect(
        tree.plainJsFiles,
        "tsconfig's `include` covers only TS extensions and checkJs is off, so `tsc --noEmit` " +
          "proves nothing about a standalone JS module — an unresolved NextResponse there would " +
          "be invisible to this guard AND to the typecheck gate. A JS module under app/ or lib/ " +
          "needs a deliberate extension of the guard's JS story (checkJs or include coverage) " +
          "before this sentinel is relaxed.",
      ).toEqual([]);
    });
  });
});

/**
 * tests/cross-cutting/redirect-guard-probes/mutant-corpus.mjs
 *
 * The whole-diff mutant-closure harness. It IMPORTS the shipped auditor —
 * `auditSource`/`addFixtureModule`/`auditTree` from the real module — so it can
 * never drift from the guard it validates (whole-diff r10 finding 2 retired
 * the mirrored-detector version that lived beside the spec).
 *
 * Run (the auditor is TypeScript, so a TS-capable loader is REQUIRED):
 *   pnpm exec tsx tests/cross-cutting/redirect-guard-probes/mutant-corpus.mjs
 *   node --import tsx tests/cross-cutting/redirect-guard-probes/mutant-corpus.mjs
 * Bare `node` fails with ERR_MODULE_NOT_FOUND — not a harness defect.
 *
 * Sections: A) the R/N/E mutant corpus through auditSource; B) the real-tree
 * scan through auditTree. Expected: ALL CLOSED; tree = exactly the allowlisted
 * OAuth call finding.
 */
import { addFixtureModule, auditSource, auditTree } from "../no-absolute-self-redirect-audit";

const PRE = `import { NextResponse } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\n`;

// Re-export helper modules for the R83-R86 rows
addFixtureModule(
  "app/__audit_fixture__/reexp-named.ts",
  `export { NextResponse as Redirector } from "next/server";`,
);
addFixtureModule(
  "app/__audit_fixture__/reexp-default.ts",
  `import { NextResponse } from "next/server";\nexport default NextResponse;`,
);
addFixtureModule("app/__audit_fixture__/reexp-ns.ts", `export * as SrvNS from "next/server";`);
addFixtureModule(
  "app/__audit_fixture__/reexp-hop2.ts",
  `export { Redirector as Hop } from "./reexp-named";`,
);

const MUTANTS = [
  // --- R1/F1 typed value-flow families ---
  [
    "F1a callback param",
    PRE +
      `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nexport function GET() { return invoke(NextResponse.redirect, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1b structural type-literal property",
    PRE +
      `const impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1c structural interface property",
    PRE +
      `interface Redirish { redirect: RedirectFn }\nconst impl: Redirish = { redirect: NextResponse.redirect };\nexport function GET() { return impl.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1d class-field structural property",
    PRE +
      `class Impl { redirect: RedirectFn = NextResponse.redirect; }\nexport function GET() { return new Impl().redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1e conditional composite",
    PRE +
      `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nexport function GET() { return (cond ? NextResponse.redirect : safe)(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1f tuple composite",
    PRE +
      `declare const i: number;\nconst safe = (u: string | URL) => new Response(String(u));\nconst tuple = [safe, NextResponse.redirect] as const;\nexport function GET() { return tuple[i]!(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1g object-union composite",
    PRE +
      `declare const cond: boolean;\nconst safe = (u: string | URL) => new Response(String(u));\nconst obj = cond ? { go: safe } : { go: NextResponse.redirect };\nexport function GET() { return obj.go(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1h .call adapter",
    PRE +
      `export function GET() { return NextResponse.redirect.call(NextResponse, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1i .apply adapter",
    PRE +
      `export function GET() { return NextResponse.redirect.apply(NextResponse, [new URL("/x", request.url)]); }`,
    "flag",
  ],
  [
    "F1j Response.redirect.call",
    `declare const request: Request;\nexport function GET() { return Response.redirect.call(Response, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1k renamed destructure extraction",
    PRE +
      `function invoke(fn: RedirectFn, url: URL) { return fn(url); }\nconst { redirect: r } = NextResponse;\nexport function GET() { return invoke(r, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "F1l as-any VALUE laundering",
    PRE +
      `const f = NextResponse.redirect as any;\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  // --- computed keys ---
  [
    "R37 const-literal computed key call",
    PRE +
      `const k = "redirect";\nexport function GET() { return NextResponse[k](new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R38 identifier literal-key extraction",
    PRE +
      `const k = "redirect" as const;\nconst f: RedirectFn = NextResponse[k];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R39 template-key extraction",
    PRE +
      'const f = NextResponse[`redirect`];\nexport function GET() { return f(new URL("/x", request.url)); }',
    "flag",
  ],
  [
    "R40 const-object-key extraction",
    PRE +
      `const K = { r: "redirect" } as const;\nconst f = NextResponse[K.r];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R41 enum-key extraction",
    PRE +
      `enum E { R = "redirect" }\nconst f = NextResponse[E.R];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R42 computed destructuring",
    PRE +
      `const k = "redirect" as const;\nconst { [k]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R43 string-literal binding",
    PRE +
      `const { ["redirect"]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R44 computed-string binding",
    PRE +
      `const kk = "redirect";\nconst { [kk]: f } = NextResponse;\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R45 parenthesized literal access",
    PRE +
      `const f = NextResponse[("redirect")];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R46 as-const access",
    PRE +
      `const f = NextResponse["redirect" as const];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R47 satisfies access",
    PRE +
      `const f = NextResponse["redirect" satisfies string];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R48 union-typed-key call",
    PRE +
      `declare const u: "redirect" | "json";\nexport function GET() { return (NextResponse as typeof NextResponse)[u as "redirect"](new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R49 union-typed-key extraction",
    PRE +
      `declare const u2: "redirect" | "json";\nconst g = NextResponse[u2 as "redirect"];\nexport function GET() { return g(new URL("/x", request.url)); }`,
    "flag",
  ],
  // --- destructuring-assignment extraction (R3/F1, probe 6c) ---
  [
    "R50 assignment rename",
    PRE +
      `let f: RedirectFn;\n({ redirect: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R51 assignment shorthand",
    PRE +
      `let redirect: RedirectFn;\n({ redirect } = NextResponse);\nexport function GET() { return redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R52 assignment string-literal key",
    PRE +
      `let f: RedirectFn;\n({ ["redirect"]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R53 assignment computed literal-typed key",
    PRE +
      `let f: RedirectFn;\nconst kc = "redirect" as const;\n({ [kc]: f } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R54 assignment with default",
    PRE +
      `const safe = (u: string | URL) => new Response(String(u));\nlet f: RedirectFn;\n({ redirect: f = safe } = NextResponse);\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R55 assignment Response twin",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet f: RedirectFn;\n({ redirect: f } = Response);\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R56 array-nested assignment pattern",
    PRE +
      `let f: RedirectFn;\n[{ redirect: f }] = [NextResponse];\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R57 for-of assignment-pattern head",
    PRE +
      `let f: RedirectFn;\nfor ({ redirect: f } of [NextResponse]) { break; }\nexport function GET() { return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  // --- negatives ---
  [
    "NEG next/navigation call+extraction",
    `import { redirect } from "next/navigation";\nconst r = redirect;\nexport function GET() { return r("/x"); }`,
    "clean",
  ],
  [
    "NEG benign assignment destructure (N7)",
    `const src = { redirect: (u: string) => u };\nlet g: (u: string) => string;\n({ redirect: g } = src);\nexport function GET() { return g("/x"); }`,
    "clean",
  ],
  [
    "NEG value-position object literal (N7)",
    PRE +
      `const safe = (u: string | URL) => new Response(String(u));\nconst o = { redirect: safe };\nexport function GET() { return o.redirect(new URL("/x", request.url)); }`,
    "clean",
  ],
  [
    "NEG unrelated container method + .call + element access",
    `class Router { redirect(u: string) { return u; } }\nconst rt = new Router();\nconst m = rt["redirect"];\nexport function GET() { return m.call(rt, "/x"); }`,
    "clean",
  ],
  [
    "NEG ordinary array/element access + destructuring",
    `declare const xs: string[];\ndeclare const i: number;\nconst { length } = xs;\nexport function GET() { return xs[i] ?? String(length); }`,
    "clean",
  ],
  [
    "NEG direct call = exactly one finding",
    PRE + `export function GET() { return NextResponse.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  // --- whole-receiver structural laundering (whole-diff r2, probe 7) ---
  [
    "R58 whole-receiver annotated variable",
    PRE +
      `const R: { redirect: RedirectFn } = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R59 whole-receiver interface-typed",
    PRE +
      `interface Ish { redirect: RedirectFn }\nconst R: Ish = NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R60 whole-receiver parameter",
    PRE +
      `function go(r: { redirect: RedirectFn }, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R61 whole-receiver helper return",
    PRE +
      `function pick(): { redirect: RedirectFn } { return NextResponse; }\nexport function GET() { return pick().redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R62 whole-receiver class field",
    PRE +
      `class Holder { r: { redirect: RedirectFn } = NextResponse; }\nexport function GET() { return new Holder().r.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R63 whole-receiver generic constraint",
    PRE +
      `function go<T extends { redirect: RedirectFn }>(r: T, u: URL) { return r.redirect(u); }\nexport function GET() { return go(NextResponse, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R64 whole-receiver typed array",
    PRE +
      `const arr: Array<{ redirect: RedirectFn }> = [NextResponse];\nexport function GET() { return arr[0]!.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R65 whole-receiver Response twin",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Response;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R66 whole-receiver aliased import",
    `import { NextResponse as NR } from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NR;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R67 whole-receiver namespace import",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = NS.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R68 receiver-as-any (FORMER limit E1)",
    PRE +
      `export function GET() { return (NextResponse as any).redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R69 widened computed key (FORMER limit E2)",
    PRE +
      `const kw: string = "redirect";\nexport function GET() { return (NextResponse as unknown as Record<string, Function>)[kw]!(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R70 Reflect.get",
    PRE +
      `declare const k2: string;\nexport function GET() { const f = Reflect.get(NextResponse, k2); return f(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R71 bare .call with no naked thisArg",
    PRE +
      `export function GET() { return NextResponse.redirect.call(undefined, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R72 namespace member assignment-destructure",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R: { redirect: RedirectFn };\n({ NextResponse: R } = NS);\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R73 namespace object-rest assignment",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet rest: { NextResponse: { redirect: RedirectFn } };\n(({ ...rest } = NS));\nexport function GET() { return rest.NextResponse.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R74 namespace declaration destructure",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst { NextResponse: R } = NS;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R75 namespace stuffed into object",
    `import * as NS from "next/server";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: NS };\nexport function GET() { return box.ns.NextResponse.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R76 dynamic-import binding naked flow",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const R: { redirect: RedirectFn } = m.NextResponse;\n  return R.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R77 dynamic-import namespace stuffed",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m = await import("next/server");\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: m };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R78 direct awaited-import stuffing",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const box: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: await import("next/server") };\n  return box.ns.NextResponse.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R79 dynamic-import declaration destructuring",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const { NextResponse: R } = await import("next/server");\n  return (R as { redirect: RedirectFn }).redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R80 dynamic-import assignment destructuring",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nlet R80: { redirect: RedirectFn };\nexport async function GET() {\n  ({ NextResponse: R80 } = await import("next/server"));\n  return R80.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R81 promise-carried namespace",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const pr = import("next/server");\n  const m: { NextResponse: { redirect: RedirectFn } } = await pr;\n  return m.NextResponse.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R82 .then callback stuffing",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport function GET() {\n  return import("next/server").then((m) => (m.NextResponse as { redirect: RedirectFn }).redirect(new URL("/x", request.url)));\n}`,
    "flag",
  ],
  [
    "R83 renamed re-export + laundering",
    `import { Redirector } from "./reexp-named";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Redirector;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R84 default re-export + laundering",
    `import Def from "./reexp-default";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Def;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R85 namespace re-export + laundering",
    `import { SrvNS } from "./reexp-ns";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { ns: { NextResponse: { redirect: RedirectFn } } } = { ns: SrvNS };\nexport function GET() { return R.ns.NextResponse.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R86 two-hop re-export + laundering",
    `import { Hop } from "./reexp-hop2";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { redirect: RedirectFn } = Hop;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R87 renamed-export namespace stuffing",
    `import * as NSr from "./reexp-named";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { Redirector: { redirect: RedirectFn } } = NSr;\nexport function GET() { return R.Redirector.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R88 default-export namespace stuffing",
    `import * as NSd from "./reexp-default";\ndeclare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst R: { default: { redirect: RedirectFn } } = NSd;\nexport function GET() { return R.default.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R89 dynamic import of renamed-export helper",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nexport async function GET() {\n  const m: { Redirector: { redirect: RedirectFn } } = await import("./reexp-named");\n  return m.Redirector.redirect(new URL("/x", request.url));\n}`,
    "flag",
  ],
  [
    "R90 untyped require carrier",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSr2 = require("next/server");\nconst R: { NextResponse: { redirect: RedirectFn } } = NSr2;\nexport function GET() { return R.NextResponse.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R91 as-cast require carrier",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nconst NSc = require("next/server") as typeof import("next/server");\nconst R: { redirect: RedirectFn } = NSc.NextResponse;\nexport function GET() { return R.redirect(new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R92 renamed require carrier",
    `declare const request: Request;\nconst r2 = require;\nconst NS2 = r2("next/server");\nexport function GET() { return NS2; }`,
    "flag",
  ],
  [
    "R94 global-object carrier into structural param",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nexport function GET() { return viaEnvironment(globalThis, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R95 reverse-ordered alias chain",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nexport function GET() { return viaEnvironment(env2, new URL("/x", request.url)); }\nconst env2 = pick();\nfunction pick() { return environment; }\nconst environment = globalThis;`,
    "flag",
  ],
  [
    "R96 helper-return carriers",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction currentEnvironment() { return globalThis; }\nconst pickEnvironment = () => globalThis;\nexport function GET() {\n  const a = viaEnvironment(currentEnvironment(), new URL("/x", request.url));\n  const b = viaEnvironment(pickEnvironment(), new URL("/y", request.url));\n  return [a, b];\n}`,
    "flag",
  ],
  [
    "R97 function-expression helper",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nconst pickFE = function () { return globalThis; };\nexport function GET() { return viaEnvironment(pickFE(), new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R98 async helper awaited",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nasync function pickAsync() { return globalThis; }\nexport async function GET() { return viaEnvironment(await pickAsync(), new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R99 staged-initialization alias",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nlet environment: typeof globalThis | undefined;\nenvironment = globalThis;\nexport function GET() { return viaEnvironment(environment!, new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R100 conditional-return helper + (pick)()",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction pick() { return typeof window === "undefined" ? globalThis : window; }\nexport function GET() { return viaEnvironment((pick)(), new URL("/x", request.url)); }`,
    "flag",
  ],
  [
    "R101 helper aliases (initializer + staged, wrapped RHS)",
    `declare const request: Request;\ntype RedirectFn = (url: string | URL, status?: number) => Response;\nfunction viaEnvironment(\n  { Response: R }: { Response: { redirect: RedirectFn } },\n  url: URL,\n) {\n  return R.redirect(url);\n}\nfunction pick() { return globalThis; }\nconst choose = (pick)!;\nlet later: typeof pick;\nlater = pick as typeof pick;\nexport function GET() {\n  const a = viaEnvironment(choose(), new URL("/x", request.url));\n  const b = viaEnvironment(later(), new URL("/y", request.url));\n  return [a, b];\n}`,
    "flag",
  ],
  [
    "N14 app-local class named Response",
    `class Response2 {}\nclass Response { redirect(u: string) { return u; } }\nconst r = new Response();\nconst m = r.redirect;\nexport function GET() { return [m.call(r, "/x"), new Response2()]; }`,
    "clean",
  ],
  [
    "N15 wrapped non-extracting positions",
    `import { NextResponse } from "next/server";\ndeclare const x: unknown;\nexport function GET() {\n  const a = (NextResponse).json({ ok: 1 });\n  const b = NextResponse!.json({ ok: 2 });\n  const c = new (NextResponse)(null, { status: 302, headers: { Location: "/x" } });\n  const d = x instanceof (Response);\n  const e = typeof (Response);\n  return [a, b, c, d, e];\n}`,
    "clean",
  ],
  [
    "N16 ordinary global uses + erasing casts",
    `export function GET() {\n  const g = globalThis as Record<string, unknown>;\n  const a = globalThis.structuredClone({ ok: 1 });\n  const b = typeof globalThis;\n  const c = globalThis.Response.json({ ok: 2 });\n  return [g, a, b, c];\n}`,
    "clean",
  ],
  [
    "N17 shadowing/same-named locals",
    `type RedirectFn = (url: string | URL, status?: number) => Response;\nconst safeLocalRedirect: RedirectFn = (u) => new Response(String(u));\nconst environment = globalThis;\nfunction useShadow(environment: { Response: { redirect: RedirectFn } }) {\n  return environment;\n}\nconst global = { Response: { redirect: safeLocalRedirect } };\nfunction take(g: { Response: { redirect: RedirectFn } }) { return g; }\nexport function GET() { return [useShadow(global), take(global), environment.location]; }`,
    "clean",
  ],
  [
    "N18 safe outer helper, nested carrier scopes",
    `type RedirectFn = (url: string | URL, status?: number) => Response;\nconst safeRedirect: RedirectFn = (u) => new Response(String(u));\nfunction take(g: { Response: { redirect: RedirectFn } }) { return g; }\nfunction outerSafe() {\n  function nested() { return globalThis; }\n  const withGetter = { get env() { return globalThis; } };\n  const K = class { pick() { return globalThis; } };\n  void nested; void withGetter; void K;\n  return { Response: { redirect: safeRedirect } };\n}\nexport function GET() { return take(outerSafe()); }`,
    "clean",
  ],
  [
    "N12 local callable interface named Require",
    `interface Require { (id: string): unknown }\ndeclare const lookup: Require;\nexport function GET() { return lookup("next/server"); }`,
    "clean",
  ],
  [
    "N11 require of unrelated module",
    `const p = require("react");\nexport function GET() { return typeof p; }`,
    "clean",
  ],
  [
    "N10 unrelated import bindings untracked",
    `import { join } from "node:path";\nconst j = join;\nexport function GET() { return j("a", "b"); }`,
    "clean",
  ],
  [
    "NEG dynamic import of unrelated module",
    `export async function GET() {\n  const m = await import("node:path");\n  return m.join("a", "b");\n}`,
    "clean",
  ],
  [
    "N9 ordinary namespace uses",
    `import * as NS from "next/server";\ndeclare const req2: NS.NextRequest;\nexport function GET() { return NS.NextResponse.json({ url: String(req2.url) }); }`,
    "clean",
  ],
  [
    "N8 non-extracting whole-object positions",
    `import { NextResponse } from "next/server";\ndeclare const x: unknown;\nexport function GET() {\n  const inst = new NextResponse(null, { status: 302, headers: { Location: "/x" } });\n  const j = NextResponse.json({ ok: true });\n  return x instanceof Response && typeof Response !== "undefined" ? inst : j;\n}`,
    "clean",
  ],
  // --- documented-escape pin (the one remaining type-erasure limit) ---
  [
    "E1 string-mediated dynamic access (eval shape)",
    PRE +
      `declare function evil(code: string): unknown;\nexport function GET() { const f = evil("NextResponse.redirect") as RedirectFn; return f(new URL("/x", request.url)); }`,
    "clean",
  ],
];

let failures = 0;
let i = 0;
for (const [label, text, expect] of MUTANTS) {
  const hits = auditSource(`app/__audit_fixture__/m${i++}.ts`, text);
  const ok = expect === "flag" ? hits.length > 0 : hits.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "OK " : "FAIL"} ${label}: ${hits.length} hit(s) [expect ${expect}]`);
  if (!ok) for (const h of hits) console.log(`      L${h.line} ${h.kind}: ${h.text}`);
}
console.log(failures === 0 ? "ALL CLOSED" : `${failures} FAILURES`);

const t0 = Date.now();
const tree = auditTree();
let treeFindings = 0;
for (const [path, findings] of tree.findingsByFile) {
  for (const f of findings) {
    treeFindings++;
    console.log(`  ${f.kind} ${path}:${f.line} ${f.text}`);
  }
}
console.log(
  `tree: ${tree.findingsByFile.size} files, ${treeFindings} finding(s), ${Date.now() - t0}ms`,
);
if (failures > 0) process.exitCode = 1;

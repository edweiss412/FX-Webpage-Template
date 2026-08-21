/**
 * tests/db/connectionCensus.test.ts
 *
 * The DECIDING suite for `tests/db/_connectionCensus.ts` (spec
 * `docs/superpowers/specs/ci/2026-08-21-destructive-guard-discovery-by-connection-design.md`).
 * Everything here runs IN-PROCESS against CONSTRUCTED sources: no subprocess (a
 * subprocess assertion cannot decide a branch, so a CLI-shaped surface scores as if
 * untested) and no live tree (the live tree is the meta-test's job, and keeping it out
 * of this suite is what keeps the enrolment's input set closable).
 *
 * WHY EVERY DESTRUCTIVE FIXTURE STRING IS ASSEMBLED AT RUNTIME. The destructive guard's
 * discovery walk (`_metaDestructiveDbTargetGuard.test.ts`) is a REGEX over the stripped
 * source of every file under `tests/`, and its exemption list `GUARD_OWN_FILES` is an
 * enrolled surface this arc must not edit (spec AC-C10). A fixture spelling
 * `public.prune_sync_log(` literally in this file would therefore make THIS suite a
 * discovered destructive file — failing the destructive guard, and adding a `channel`
 * report the census's own BASE row set does not have. Concatenating the fragments at
 * runtime exercises the recognizer on exactly the same string while leaving the source
 * text unmatched. The same applies to the wipe and gate spellings.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";

import {
  OPTIONS_ACCEPT_SET,
  OUTER_EXPRESSION_KINDS,
  acquisitionsIn,
  classifyFile,
  classifySite,
  moduleSpecifiersIn,
  sitesIn,
} from "./_connectionCensus";

const P = "tests/db/fixture.test.ts";
const IMPORT = `import postgres from "postgres";`;
const GUARD_IMPORT = `import { assertLocalDbUrl } from "./_localDbUrl";`;
const ENV = "process.env.TEST_DATABASE_URL";
const LOOPBACK = `"postgresql://postgres:postgres@127.0.0.1:54322/postgres"`;
const REMOTE = `"postgresql://postgres:postgres@aws-1-us-east-2.pooler.supabase.com:5432/postgres"`;

const MODULE_PATH = "tests/db/_connectionCensus.ts";

function parse(src: string, file = P): ts.SourceFile {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Exactly one site, asserted by VALUE so a scanner that finds nothing fails here. */
function onlySite(src: string, file = P): { cls: string; envNames: string[]; line: number } {
  const rec = classifyFile(file, src);
  expect(
    rec.sites.map((s) => s.cls),
    src,
  ).toHaveLength(1);
  const site = rec.sites[0]!;
  return { cls: site.cls, envNames: site.envNames, line: site.line };
}

/** The class of `postgres(<arg>)` in a file that does nothing else. */
function classOf(arg: string, extra = ""): string {
  return onlySite([IMPORT, extra, `const sql = postgres(${arg});`].join("\n")).cls;
}

describe("connection census — acquisitions and connect sites (AC-C1, AC-C2)", () => {
  test("a value default import binds the driver and its call is a classified site", () => {
    const rec = classifyFile(P, [IMPORT, `const sql = postgres(${ENV});`].join("\n"));
    expect(rec.sites).toHaveLength(1);
    expect(rec.sites[0]).toMatchObject({ ordinal: 1, cls: "validation-env" });
    expect(rec.sites[0]!.envNames).toEqual(["TEST_DATABASE_URL"]);
    expect(rec.reports).toEqual([]);
  });

  test("the binding is resolved by IMPORT, not by the callee spelling `postgres`", () => {
    // Kills a scanner keyed on the name: this file never spells `postgres(` as a call.
    const rec = classifyFile(
      P,
      [`import pg from "postgres";`, `const sql = pg(${ENV});`].join("\n"),
    );
    expect(rec.sites).toHaveLength(1);
    expect(rec.sites[0]!.cls).toBe("validation-env");
  });

  test("two calls in one file carry source-order ordinals", () => {
    const rec = classifyFile(
      P,
      [IMPORT, `const a = postgres(${ENV});`, `const b = postgres(${LOOPBACK});`].join("\n"),
    );
    expect(rec.sites.map((s) => [s.ordinal, s.cls])).toEqual([
      [1, "validation-env"],
      [2, "loopback-literal"],
    ]);
  });

  test("a TYPE-ONLY default import is not an acquisition", () => {
    const rec = classifyFile(P, `import type postgres from "postgres";`);
    expect(rec.bindings).toEqual([]);
    expect(rec.sites).toEqual([]);
    expect(rec.reports).toEqual([]);
  });

  test("a type-only NAMED import is not an acquisition", () => {
    const rec = classifyFile(P, `import { type Sql } from "postgres";`);
    expect(rec.bindings).toEqual([]);
    expect(rec.reports).toEqual([]);
  });

  // AC-C1: every declaration form, each with its twin. The file-wide poison that
  // silently DROPS a shadowed name erases the REAL top-level call (spec round 1 F1,
  // probed on tests/admin/extractAgenda.test.ts); the census must REPORT it instead.
  const SHADOW_FORMS: ReadonlyArray<[string, string]> = [
    ["parameter", `function helper(postgres: string) { return postgres; }`],
    ["const variable", `function helper() { const postgres = 1; return postgres; }`],
    ["let variable", `function helper() { let postgres = 1; return postgres; }`],
    [
      "destructured binding",
      `function helper(o: { postgres: number }) { const { postgres } = o; return postgres; }`,
    ],
    ["named function", `function postgres() { return 1; }`],
    ["named class", `class postgres {}`],
    ["another import binding", `import { postgres } from "./_unrelated";`],
    ["import-equals binding", `import postgres = require("./_unrelated");`],
    [
      "catch binding",
      `function helper() { try { return 1; } catch (postgres) { return postgres; } }`,
    ],
  ];

  for (const [label, declaration] of SHADOW_FORMS) {
    test(`a driver name also declared as a ${label} REPORTS at every call, never silently drops it`, () => {
      const src = [IMPORT, `const sql = postgres(${ENV});`, declaration].join("\n");
      const rec = classifyFile(P, src);
      expect(rec.sites, label).toEqual([]);
      expect(
        rec.reports.map((r) => [r.kind, r.line]),
        label,
      ).toEqual([["shadowed-driver", 2]]);
    });

    test(`twin — without the ${label} declaration the same call is a classified site`, () => {
      const src = [IMPORT, `const sql = postgres(${ENV});`].join("\n");
      const rec = classifyFile(P, src);
      expect(
        rec.sites.map((s) => s.cls),
        label,
      ).toEqual(["validation-env"]);
      expect(rec.reports, label).toEqual([]);
    });
  }

  test("a const bound to a dynamic import IS a driver binding, and its SITES are classified", () => {
    // Spec round 2 F1: reporting the acquisition and dropping the sites it produces left
    // validation-schema-parity.test.ts:407 in no census at all.
    const src = [
      `const postgres = (await import("postgres")).default;`,
      `const raw = ${ENV};`,
      `const sql = postgres(raw);`,
    ].join("\n");
    const rec = classifyFile(P, src);
    expect(rec.reports).toEqual([]);
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("twin — the same const-bound dynamic acquisition with a REMOTE literal reports at the CALL line", () => {
    const src = [
      `const postgres = (await import("postgres")).default;`,
      `const raw = ${REMOTE};`,
      `const sql = postgres(raw);`,
    ].join("\n");
    const rec = classifyFile(P, src);
    expect(rec.sites.map((s) => s.cls)).toEqual(["remote-literal"]);
    expect(rec.reports.map((r) => [r.kind, r.line])).toEqual([["remote-literal", 3]]);
  });

  const CONST_ACQUISITIONS: ReadonlyArray<[string, string]> = [
    ["dynamic import with .default", `const postgres = (await import("postgres")).default;`],
    ["dynamic import without .default", `const postgres = await import("postgres");`],
    ["require", `const postgres = require("postgres");`],
    ["require with .default", `const postgres = require("postgres").default;`],
    ["vi.importActual", `const postgres = await vi.importActual("postgres");`],
    ["vi.importMock", `const postgres = await vi.importMock("postgres");`],
    [
      "parenthesised and asserted",
      `const postgres = ((await import("postgres")) as { default: unknown }).default;`,
    ],
  ];

  for (const [label, acquisition] of CONST_ACQUISITIONS) {
    test(`a const bound through ${label} yields a driver binding whose call is a site`, () => {
      const rec = classifyFile(P, [acquisition, `const sql = postgres(${ENV});`].join("\n"));
      expect(rec.reports, label).toEqual([]);
      expect(
        rec.sites.map((s) => s.cls),
        label,
      ).toEqual(["validation-env"]);
    });
  }

  test("import-equals of the driver is a binding", () => {
    const rec = classifyFile(
      P,
      [`import postgres = require("postgres");`, `const sql = postgres(${ENV});`].join("\n"),
    );
    expect(rec.reports).toEqual([]);
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("a namespace import's `.default` call is a site", () => {
    const rec = classifyFile(
      P,
      [`import * as ns from "postgres";`, `const sql = ns.default(${ENV});`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  const REPORTED_ACQUISITIONS: ReadonlyArray<[string, string, string]> = [
    [
      "a named value import of `default`",
      `import { default as pg } from "postgres";`,
      "acquisition",
    ],
    ["a named value import", `import { Sql } from "postgres";`, "acquisition"],
    ["a side-effect import", `import "postgres";`, "acquisition"],
    ["a re-export", `export { default } from "postgres";`, "acquisition"],
    ["a LET bound to an acquisition", `let postgres = require("postgres");`, "acquisition"],
    [
      "a destructured acquisition",
      `const { default: pg } = await import("postgres");`,
      "acquisition",
    ],
    ["a bare acquisition statement", `await import("postgres");`, "acquisition"],
  ];

  for (const [label, source, kind] of REPORTED_ACQUISITIONS) {
    test(`${label} REPORTS rather than passing silently`, () => {
      const rec = classifyFile(P, source);
      expect(
        rec.reports.map((r) => r.kind),
        label,
      ).toEqual([kind]);
      expect(rec.sites, label).toEqual([]);
    });
  }

  test("a driver binding used as a VALUE is a value-reference report", () => {
    const rec = classifyFile(P, [IMPORT, `const pg = postgres;`].join("\n"));
    expect(rec.reports.map((r) => r.kind)).toEqual(["value-reference"]);
  });

  test("twin — the same binding CALLED is a site and reports nothing", () => {
    const rec = classifyFile(P, [IMPORT, `const pg = postgres(${ENV});`].join("\n"));
    expect(rec.reports).toEqual([]);
    expect(rec.sites).toHaveLength(1);
  });

  test("acquisitionsIn ignores specifiers that are not the driver", () => {
    const sf = parse([`import fs from "node:fs";`, `const x = require("./_helper");`].join("\n"));
    const acquired = acquisitionsIn(sf);
    expect(acquired.bindings).toEqual([]);
    expect(acquired.reports).toEqual([]);
  });
});

describe("connection census — site classification accept-set (AC-C3)", () => {
  test("the exact env chain classifies validation-env", () => {
    expect(classOf(ENV)).toBe("validation-env");
    expect(classOf(`${ENV} ?? process.env.DATABASE_URL`)).toBe("validation-env");
    expect(classOf(`${ENV} ?? process.env.DATABASE_URL ?? ${LOOPBACK}`)).toBe("validation-env");
    expect(classOf(`${ENV} || process.env.DATABASE_URL`)).toBe("validation-env");
  });

  test("env names are matched EXACTLY, not by substring", () => {
    // Kills a classifier keyed on the substring TEST_DATABASE_URL.
    expect(classOf("process.env.PROD_TEST_DATABASE_URL")).toBe("unclassifiable");
    expect(classOf("process.env.TEST_DATABASE_URL_2")).toBe("unclassifiable");
  });

  test("env name ORDER is part of the accept-set", () => {
    expect(classOf(`process.env.DATABASE_URL ?? ${ENV}`)).toBe("unclassifiable");
  });

  test("an arbitrary env read is not accepted", () => {
    // Kills a classifier accepting any process.env.* read.
    expect(classOf("process.env.SOMETHING_ELSE")).toBe("unclassifiable");
    expect(classOf("process.env.DATABASE_URL")).toBe("unclassifiable");
  });

  test("element-access env reads classify the same as property access", () => {
    expect(classOf(`process.env["TEST_DATABASE_URL"]`)).toBe("validation-env");
    expect(classOf("process.env[key]")).toBe("unclassifiable");
  });

  test("a loopback literal classifies loopback-literal; any other host is remote-literal", () => {
    expect(classOf(LOOPBACK)).toBe("loopback-literal");
    expect(classOf(`"postgresql://postgres:postgres@localhost:54322/postgres"`)).toBe(
      "loopback-literal",
    );
    expect(classOf(REMOTE)).toBe("remote-literal");
    expect(classOf(`"postgresql://postgres@127.0.0.1.evil.example:5432/postgres"`)).toBe(
      "remote-literal",
    );
  });

  test("an unparseable literal is unclassifiable, never accepted", () => {
    expect(classOf(`"not a url at all"`)).toBe("unclassifiable");
  });

  test("a const bound to a literal classifies as its initializer", () => {
    expect(classOf("url", `const url = ${LOOPBACK};`)).toBe("loopback-literal");
    expect(classOf("url", `const url = ${REMOTE};`)).toBe("remote-literal");
    expect(classOf("url", `const url = ${ENV};`)).toBe("validation-env");
  });

  test("a guard call classifies guard-bound, inline and through a const", () => {
    expect(classOf(`assertLocalDbUrl(${LOOPBACK})`, GUARD_IMPORT)).toBe("guard-bound");
    expect(
      classOf("url", [GUARD_IMPORT, `const url = assertLocalDbUrl(${LOOPBACK});`].join("\n")),
    ).toBe("guard-bound");
  });

  test("a guard NAME declared twice makes the site unclassifiable", () => {
    // Kills a classifier that checks only the trusted import and the callee spelling.
    expect(
      classOf(
        `assertLocalDbUrl(${LOOPBACK})`,
        [
          GUARD_IMPORT,
          `function helper(assertLocalDbUrl: string) { return assertLocalDbUrl; }`,
        ].join("\n"),
      ),
    ).toBe("unclassifiable");
  });

  test("a guard-looking name imported from another module is NOT the guard", () => {
    expect(
      classOf(
        `assertLocalDbUrl(${LOOPBACK})`,
        `import { assertLocalDbUrl } from "./_notTheGuard";`,
      ),
    ).toBe("unclassifiable");
  });

  test("shapes the walk declines all REPORT rather than pass", () => {
    expect(classOf("url", `let url = ${LOOPBACK};`)).toBe("unclassifiable");
    expect(classOf("url", `import { url } from "./_urls";`)).toBe("unclassifiable");
    expect(classOf("url")).toBe("unclassifiable"); // no declaration at all
    expect(classOf("resolve()")).toBe("unclassifiable");
    expect(classOf("cfg.url")).toBe("unclassifiable");
    expect(classOf("flag ? a : b")).toBe("unclassifiable");
    expect(classOf("`${base}/postgres`")).toBe("unclassifiable");
    expect(classOf(`${ENV} ?? ${REMOTE}`)).toBe("unclassifiable");
  });

  test("a parameter-bound argument is unclassifiable", () => {
    const src = [IMPORT, `export function connect(url: string) { return postgres(url); }`].join(
      "\n",
    );
    expect(onlySite(src).cls).toBe("unclassifiable");
  });

  // ── the options axis: the first argument is held FIXED at an accepted chain, so
  // only the later arguments can decide the observation (spec round 3 F4).
  const OPTIONS_CASES: ReadonlyArray<[string, string]> = [
    ["postgres()", "unclassifiable"],
    [`postgres(${ENV}, { max: 1 })`, "validation-env"],
    [`postgres(${ENV}, { max: 1, prepare: false, idle_timeout: 5 })`, "validation-env"],
    [`postgres(${ENV}, { host: "db.example.invalid", max: 1 })`, "unclassifiable"],
    [`postgres(${ENV}, { port: 6543 })`, "unclassifiable"],
    [`postgres(${ENV}, { unknown_key: 1 })`, "unclassifiable"],
    [`postgres(${ENV}, opts)`, "unclassifiable"],
    [`postgres(${ENV}, { ...base })`, "unclassifiable"],
    [`postgres(${ENV}, { [key]: 1 })`, "unclassifiable"],
    [`postgres(${ENV}, { max })`, "unclassifiable"],
    [`postgres(${ENV}, { max: 1 }, extra)`, "unclassifiable"],
    [`postgres(${ENV}, { connection: { statement_timeout: 5000 } })`, "validation-env"],
    [`postgres(${ENV}, { connection: { anything_at_all: "x" } })`, "validation-env"],
    [`postgres(${ENV}, { connection: opts })`, "unclassifiable"],
    [`postgres(${ENV}, { connection: { ...c } })`, "unclassifiable"],
    [`postgres(${ENV}, { connection: { key: resolve() } })`, "unclassifiable"],
  ];

  for (const [call, expected] of OPTIONS_CASES) {
    test(`options axis — ${call} classifies ${expected}`, () => {
      const rec = classifyFile(P, [IMPORT, `const sql = ${call};`].join("\n"));
      expect(
        rec.sites.map((s) => s.cls),
        call,
      ).toEqual([expected]);
    });
  }

  test("the report NAMES the offending option key", () => {
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV}, { host: "db.example.invalid" });`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
    expect(rec.sites[0]!.detail).toContain("host");
  });

  test("the options accept-set contains no target-steering name", () => {
    // A hand-written witness against a hand-written set: the two lists answer
    // different questions, so neither is derived from the other.
    for (const steering of [
      "host",
      "hostname",
      "port",
      "path",
      "database",
      "db",
      "user",
      "username",
      "password",
      "pass",
      "ssl",
      "socket",
    ]) {
      expect(OPTIONS_ACCEPT_SET.has(steering), steering).toBe(false);
    }
    expect(OPTIONS_ACCEPT_SET.has("connection")).toBe(true);
  });
});

describe("connection census — outer-expression wrappers (AC-C4)", () => {
  const WRAPPED: ReadonlyArray<[string, string]> = [
    ["non-null", `${ENV}!`],
    ["as", `${ENV} as string`],
    ["angle assertion", `<string>${ENV}`],
    ["satisfies", `${ENV} satisfies string`],
    ["parenthesised", `(${ENV})`],
    ["all at once", `((${ENV} as string)! satisfies string)`],
  ];

  for (const [label, arg] of WRAPPED) {
    test(`${label} on the ARGUMENT classifies as its unwrapped form`, () => {
      expect(classOf(arg), label).toBe("validation-env");
    });

    test(`${label} on a const INITIALIZER classifies as its unwrapped form`, () => {
      expect(classOf("url", `const url = ${arg};`), label).toBe("validation-env");
    });
  }

  test("the unwrap covers every OuterExpressionKinds bit the compiler defines", () => {
    // Asserted against the enum, never against a list typed into the test: a wrapper
    // form added by a TypeScript upgrade is covered or this reds.
    const bits = Object.entries(ts.OuterExpressionKinds)
      .filter(([, v]) => typeof v === "number" && v > 0 && (v & (v - 1)) === 0)
      .map(([name, v]) => [name, v as number] as const);
    expect(bits.length).toBeGreaterThan(0);
    for (const [name, bit] of bits) {
      expect(OUTER_EXPRESSION_KINDS & bit, name).toBe(bit);
    }
  });
});

describe("connection census — totality: REPORT is the only fall-through (AC-C13)", () => {
  /**
   * Every expression-capable `SyntaxKind` NAME, read from the enum at test time, must
   * either be synthesized below or carry a stated reason it cannot stand as a call
   * argument in parsed source. A kind a TypeScript upgrade adds fails BY NAME here
   * rather than being silently uncovered.
   */
  const SYNTHESIZED: Readonly<Record<string, string>> = {
    ArrayLiteralExpression: "[1, 2]",
    AsExpression: "x as string",
    AwaitExpression: "await p",
    BigIntLiteral: "1n",
    BinaryExpression: "a + b",
    CallExpression: "resolve()",
    ClassExpression: "class {}",
    ConditionalExpression: "a ? b : c",
    DeleteExpression: "delete o.k",
    ElementAccessExpression: "o[k]",
    FunctionExpression: "function () { return 1; }",
    NewExpression: "new URL(s)",
    NoSubstitutionTemplateLiteral: "`plain`",
    NonNullExpression: "x!",
    NumericLiteral: "42",
    ObjectLiteralExpression: "{ a: 1 }",
    ParenthesizedExpression: "(x)",
    PostfixUnaryExpression: "i++",
    PrefixUnaryExpression: "-i",
    PropertyAccessExpression: "o.k",
    RegularExpressionLiteral: "/re/",
    SatisfiesExpression: "x satisfies string",
    StringLiteral: `"s"`,
    TaggedTemplateExpression: "tag`t`",
    TemplateExpression: "`a${b}`",
    TypeAssertionExpression: "<string>x",
    TypeOfExpression: "typeof x",
    VoidExpression: "void 0",
    YieldExpression: "yield x",
    Identifier: "x",
    ThisKeyword: "this",
    TrueKeyword: "true",
    FalseKeyword: "false",
    NullKeyword: "null",
    ArrowFunction: "() => 1",
    SpreadElement: "...rest",
    ExpressionWithTypeArguments: "f<string>",
  };

  const NOT_A_PARSED_ARGUMENT: Readonly<Record<string, string>> = {
    JSDocTypeExpression: "a JSDoc type position, never an expression argument",
    JSDocTypeLiteral: "a JSDoc type position, never an expression argument",
    TypeLiteral: "a type position, never an expression argument",
    JsxExpression: "only inside JSX, which the census never parses as a call argument",
    OmittedExpression: "only an array-literal hole; it cannot be written as an argument",
    PartiallyEmittedExpression: "synthesized by the emitter; the parser never produces it",
    SyntheticExpression: "synthesized by the transformer; the parser never produces it",
    SyntheticReferenceExpression: "synthesized by the transformer; the parser never produces it",
    CommaListExpression: "synthesized by the transformer; source uses BinaryExpression",
    SuperKeyword: "only legal inside a class member body, not at a call site here",
    ImportKeyword: "only legal as `import(...)`, which parses as a CallExpression",
  };

  test("every expression-capable SyntaxKind is synthesized or has a stated reason", () => {
    const enumNames = Object.entries(ts.SyntaxKind)
      .filter(([, v]) => typeof v === "number")
      .map(([name]) => name);
    const expressionish = enumNames.filter(
      (name) =>
        /Expression$|Literal$/.test(name) ||
        [
          "Identifier",
          "ThisKeyword",
          "SuperKeyword",
          "TrueKeyword",
          "FalseKeyword",
          "NullKeyword",
          "ImportKeyword",
          "ArrowFunction",
          "SpreadElement",
        ].includes(name),
    );
    expect(expressionish.length).toBeGreaterThan(30);
    const uncovered = expressionish.filter(
      (name) => !(name in SYNTHESIZED) && !(name in NOT_A_PARSED_ARGUMENT),
    );
    expect(uncovered).toEqual([]);
  });

  test("classifySite returns a union member for every synthesized argument and never throws", () => {
    const UNION = new Set([
      "guard-bound",
      "validation-env",
      "loopback-literal",
      "remote-literal",
      "unclassifiable",
    ]);
    const observed = new Set<string>();
    for (const [name, expr] of Object.entries(SYNTHESIZED)) {
      const src = [
        IMPORT,
        `async function* run(...rest: unknown[]) { return postgres(${expr}); }`,
      ].join("\n");
      const sf = parse(src);
      const sites = sitesIn(sf);
      expect(
        sites.map((s) => s.ordinal),
        name,
      ).toEqual([1]);
      const result = classifySite(sf, sites[0]!);
      expect(UNION.has(result.cls), `${name} → ${result.cls}`).toBe(true);
      observed.add(name);
    }
    expect(observed.size).toBe(Object.keys(SYNTHESIZED).length);
  });

  test("no function on the classification path can return nothing", () => {
    expect(functionsWithBareReturn(moduleSource())).toEqual([]);
  });

  test("positive control — the bare-return assertion reds on a constructed source", () => {
    const constructed = [
      "function classifyThing(x: number) {",
      "  if (x > 1) return;",
      `  return "unclassifiable";`,
      "}",
    ].join("\n");
    expect(functionsWithBareReturn(constructed)).toEqual(["classifyThing"]);
  });
});

describe("connection census — one specifier extractor (AC-C13 discovery arm)", () => {
  test("moduleSpecifiersIn is the only function that reads a specifier position", () => {
    // Seven of the twelve spec findings were two walks knowing different positions.
    expect(specifierReadingFunctions(moduleSource())).toEqual(["moduleSpecifiersIn"]);
  });

  test("positive control — a second specifier reader is named by the assertion", () => {
    const constructed = [
      "function moduleSpecifiersIn(sf: ts.SourceFile) {",
      "  return sf.statements.map((s) => s.moduleSpecifier);",
      "}",
      "function edgesIn(sf: ts.SourceFile) {",
      "  return sf.statements.map((s) => s.moduleSpecifier);",
      "}",
    ].join("\n");
    expect(specifierReadingFunctions(constructed)).toEqual(["edgesIn", "moduleSpecifiersIn"]);
  });

  test("the extractor yields every specifier position the parser has", () => {
    const src = [
      `import a from "./_a";`,
      `import "./_b";`,
      `export { c } from "./_c";`,
      `import d = require("./_d");`,
      `const e = await import("./_e");`,
      `const f = require("./_f");`,
      `const g = await vi.importActual("./_g");`,
    ].join("\n");
    const refs = moduleSpecifiersIn(parse(src));
    expect(refs.map((r) => r.literal)).toEqual([
      "./_a",
      "./_b",
      "./_c",
      "./_d",
      "./_e",
      "./_f",
      "./_g",
    ]);
    expect(new Set(refs.map((r) => r.position))).toEqual(
      new Set([
        "import-declaration",
        "export-declaration",
        "import-equals",
        "dynamic-import",
        "require-call",
        "loader-call",
      ]),
    );
  });

  test("a NON-literal specifier is carried with literal null, never dropped", () => {
    const refs = moduleSpecifiersIn(parse([`const x = await import(path);`].join("\n")));
    expect(refs).toHaveLength(1);
    expect(refs[0]!.literal).toBeNull();
  });
});

describe("connection census — no binder dependence (AC-C11)", () => {
  test("the module never reaches for a Program or a type checker", () => {
    // `.parent` is populated by the PARSER only when setParentNodes is true; an upward
    // walk on a program-built tree without it no-ops in the direction that looks green.
    const src = moduleSource();
    expect(src).not.toContain("createProgram(");
    expect(src).not.toContain("getTypeChecker(");
  });

  test("every createSourceFile call sets parent nodes", () => {
    expect(createSourceFileCallsWithoutParents(moduleSource())).toEqual([]);
  });

  test("positive control — the binder assertion reds on a constructed source", () => {
    const constructed = `const checker = program.getTypeChecker();`;
    expect(constructed).toContain("getTypeChecker(");
    expect(
      createSourceFileCallsWithoutParents(
        `const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, false);`,
      ),
    ).toEqual(["createSourceFile"]);
  });
});

/** The module's own source, comments stripped through the ONE shared stripper. */
function moduleSource(): string {
  const raw = readFileSync(join(process.cwd(), MODULE_PATH), "utf8");
  return stripCommentsForFile(raw, MODULE_PATH);
}

/**
 * Function names that return a VALUE somewhere and NOTHING somewhere else — the
 * implicit "not mine" path. A function whose returns are all bare is a void procedure
 * and is not a classification fall-through; a function that falls off its end without
 * returning is caught by TypeScript, because every exported function here declares a
 * non-optional return type. Attribution is per INNERMOST function, so a void helper
 * nested inside a value-returning walk is judged on its own.
 */
function functionsWithBareReturn(source: string): string[] {
  const sf = ts.createSourceFile(
    "probe.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bare = new Set<string>();
  const valued = new Set<string>();
  const walk = (node: ts.Node, enclosing: string | null): void => {
    let name = enclosing;
    if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        name = node.name.text;
      }
    }
    if (ts.isReturnStatement(node) && name !== null) {
      const expr = node.expression;
      const isBare =
        expr === undefined ||
        (ts.isIdentifier(expr) && expr.text === "undefined") ||
        expr.kind === ts.SyntaxKind.VoidExpression;
      (isBare ? bare : valued).add(name);
    }
    ts.forEachChild(node, (child) => walk(child, name));
  };
  ts.forEachChild(sf, (n) => walk(n, null));
  return [...bare].filter((name) => valued.has(name)).sort();
}

/**
 * Top-level function names whose body — including any function nested inside it — reads
 * a module-specifier position. Attribution is per OUTERMOST function, because the claim
 * is about which exported WALK knows the positions: an inner arrow doing the reading is
 * still that walk reading it.
 */
function specifierReadingFunctions(source: string): string[] {
  const sf = ts.createSourceFile(
    "probe.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const READS = [
    /\.moduleSpecifier\b/,
    /ExternalModuleReference/,
    /ImportKeyword/,
    /"require"/,
    /"vi"/,
  ];
  const out = new Set<string>();
  const walk = (node: ts.Node, enclosing: string | null): void => {
    let name = enclosing;
    if (name === null && ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
    else if (
      name === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        name = node.name.text;
      }
    }
    if (
      name !== null &&
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "moduleSpecifier"
    ) {
      out.add(name);
    }
    if (name !== null && (ts.isStringLiteral(node) || ts.isIdentifier(node))) {
      const text = node.getText(sf);
      if (READS.some((re) => re.test(text))) out.add(name);
    }
    ts.forEachChild(node, (child) => walk(child, name));
  };
  ts.forEachChild(sf, (n) => walk(n, null));
  return [...out].sort();
}

/** `createSourceFile` calls whose fourth argument is not `true`. */
function createSourceFileCallsWithoutParents(source: string): string[] {
  const sf = ts.createSourceFile(
    "probe.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const out: string[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isCreate =
        (ts.isIdentifier(callee) && callee.text === "createSourceFile") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "createSourceFile");
      if (isCreate && node.arguments[3]?.kind !== ts.SyntaxKind.TrueKeyword) {
        out.push("createSourceFile");
      }
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(sf, walk);
  return out;
}

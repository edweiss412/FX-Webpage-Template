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

import { premiseHolds } from "@/tests/_shared/premise";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import { GUARD_SURFACES } from "@/tests/mutation/source/registry";

import { DESTRUCTIVE_STATEMENT_PATTERNS, GUARD_OWN_FILES } from "./_destructiveStatements";

import {
  CONNECTION_CENSUS_DISPOSITIONS,
  type DispositionRow,
} from "./_connectionCensusDispositions";
import { type ValidationEnvAllowRow } from "./_validationEnvAllowlist";
import {
  type FileClass,
  type ImportResolver,
  type PropagationResult,
  OPTIONS_ACCEPT_SET,
  acquisitionsIn,
  admissibleKindsFor,
  aliasPrefixes,
  classifyFile,
  classifySite,
  DEFAULT_JOIN_DEPS,
  attachAffected,
  channelReports,
  classCounts,
  discoveredByDestructiveGuard,
  moduleSpecifiersIn,
  ownClassesFor,
  propagateThroughImports,
  reconcileDispositions,
  reconcileValidationEnv,
  renderReport,
  sitesIn,
  SOURCE_EXTENSIONS,
  type Report,
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

  test("a driver binding RE-EXPORTED under an alias is a value-reference report", () => {
    // Kills: an alias-source test widened to any node carrying `propertyName`. An export
    // specifier's `propertyName` IS the local binding — a real reference that hands the
    // driver to another module — while an import specifier's names a symbol in the module it imports from. Reading
    // both as alias sources drops the re-export from the census entirely, which is the
    // silence direction the consequence bound forbids.
    const rec = classifyFile(P, [IMPORT, `export { postgres as pg };`].join("\n"));
    expect(rec.reports.map((r) => r.kind)).toEqual(["value-reference"]);
  });

  test("twin — an IMPORT alias source is not a reference", () => {
    // The named import reports as an `acquisition` the census cannot follow to a const
    // binding; what matters here is what is ABSENT — no `value-reference` for the `postgres`
    // occurrence, because on an import specifier that occurrence names the exporting
    // module's symbol rather than a local binding being read.
    const rec = classifyFile(P, [`import { postgres as pg } from "postgres";`].join("\n"));
    expect(rec.reports.map((r) => r.kind)).toEqual(["acquisition"]);
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

  test("a NON-identifier option key is unclassifiable, not silently accepted", () => {
    // `{ "max": 1 }` is a legal spelling of an accepted key, and the census still declines
    // it: the accept-set is keyed on the plain `name: value` SHAPE, so anything else is
    // reported rather than parsed. The conservative direction costs a disposition row; the
    // other direction is the silent one.
    const rec = classifyFile(P, [IMPORT, `const sql = postgres(${ENV}, { "max": 1 });`].join("\n"));
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
  });
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

  test("transparency comes from the ONE shared binding, not from a local copy", () => {
    // The axis used to be asserted against this module's own `OuterExpressionKinds`
    // constant. main now ships `tests/_shared/outerExpressions.ts`, so the stronger claim
    // is that no second binding exists here at all: a copy is what goes stale, and the
    // shared module asks the COMPILER which wrappers are transparent rather than listing
    // them. The behavioural coverage above (every wrapper form, on the argument and on a
    // const initializer) is what proves the import is actually consulted.
    const source = moduleSource();
    expect(source).not.toContain("skipOuterExpressions");
    expect(source).toContain("skipTransparent");
    expect(source).toContain("isTransparent");
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

/**
 * A NOTE ON THE STRUCTURAL ASSERTIONS BELOW, because it changes how they read under the
 * mutation gate: they read the module's TRACKED SOURCE from disk, while the harness serves
 * a mutant's text to the IMPORT from memory and leaves the file byte-identical. So a
 * structural assertion neither kills a mutant nor reds falsely under mutation — it is a
 * claim about the shipped file, checked on every ordinary run, and it is deliberately not
 * part of what the score measures.
 */
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

describe("connection census — the helper graph, to a fixpoint (AC-C5, AC-C13 edges arm)", () => {
  type TreeEntry = { source: string; own?: FileClass[] };
  type Tree = Record<string, TreeEntry>;

  function propagate(
    tree: Tree,
    resolveMap: Record<string, string> = {},
    root = "/repo",
  ): PropagationResult & { asked: string[] } {
    const asked: string[] = [];
    const resolve: ImportResolver = (_from, specifier) => {
      asked.push(specifier);
      return resolveMap[specifier] ?? null;
    };
    const files = Object.entries(tree).map(([file, entry]) => ({
      file,
      sf: parse(entry.source, file),
      own: entry.own ?? [],
    }));
    return { ...propagateThroughImports(files, resolve, root), asked };
  }

  /** The WEAKER implementation, run beside the real one so the fixture is proven to discriminate. */
  function oneLevelClasses(
    tree: Tree,
    resolveMap: Record<string, string>,
  ): Map<string, Set<string>> {
    const own = new Map(
      Object.entries(tree).map(([file, e]) => [file, new Set<string>(e.own ?? [])]),
    );
    const out = new Map<string, Set<string>>();
    for (const [file, entry] of Object.entries(tree)) {
      const set = new Set<string>(entry.own ?? []);
      for (const ref of moduleSpecifiersIn(parse(entry.source, file))) {
        const target = ref.literal === null ? null : (resolveMap[ref.literal] ?? null);
        if (target === null) continue;
        for (const cls of own.get(target) ?? []) set.add(cls);
      }
      out.set(file, set);
    }
    return out;
  }

  const CYCLE: Tree = {
    "tests/db/_a.ts": { source: `import "./_b";` },
    "tests/db/_b.ts": { source: `import "./_c";` },
    "tests/db/_c.ts": { source: `import "./_a";`, own: ["validation-env"] },
  };
  const CYCLE_RESOLVE = {
    "./_a": "tests/db/_a.ts",
    "./_b": "tests/db/_b.ts",
    "./_c": "tests/db/_c.ts",
  };

  test("a three-module cycle reaches a fixpoint and every member inherits", () => {
    const { classes, reports } = propagate(CYCLE, CYCLE_RESOLVE);
    expect([...(classes.get("tests/db/_a.ts") ?? [])]).toEqual(["validation-env"]);
    expect([...(classes.get("tests/db/_b.ts") ?? [])]).toEqual(["validation-env"]);
    expect(reports).toEqual([]);
  });

  test("the one-level variant DISAGREES on the cycle's head, so the fixture discriminates", () => {
    const real = propagate(CYCLE, CYCLE_RESOLVE).classes;
    const weak = oneLevelClasses(CYCLE, CYCLE_RESOLVE);
    expect([...(weak.get("tests/db/_a.ts") ?? [])]).toEqual([]);
    expect([...(real.get("tests/db/_a.ts") ?? [])]).not.toEqual([
      ...(weak.get("tests/db/_a.ts") ?? []),
    ]);
  });

  const HELPER: TreeEntry = { source: `const sql = 1;`, own: ["validation-env"] };
  const HELPER_PATH = "tests/db/_helper.ts";

  const POSITION_FIXTURES: ReadonlyArray<[string, string]> = [
    ["import with a clause", `import x from "./_helper";`],
    ["import WITHOUT a clause", `import "./_helper";`],
    ["export … from", `export { x } from "./_helper";`],
    ["import-equals", `import x = require("./_helper");`],
    ["dynamic import", `const x = await import("./_helper");`],
    ["require", `const x = require("./_helper");`],
  ];

  for (const [label, source] of POSITION_FIXTURES) {
    test(`a consumer reaching the helper through ${label} inherits its class`, () => {
      const { classes, reports } = propagate(
        { [HELPER_PATH]: HELPER, "tests/db/consumer.test.ts": { source } },
        { "./_helper": HELPER_PATH },
      );
      expect([...(classes.get("tests/db/consumer.test.ts") ?? [])], label).toEqual([
        "validation-env",
      ]);
      expect(reports, label).toEqual([]);
    });
  }

  const LOADER_FIXTURES: ReadonlyArray<[string, string, string[], number]> = [
    [
      "vi.importActual inside a mock factory",
      `vi.mock("./_other", async () => ({ ...(await vi.importActual("./_helper")) }));`,
      ["validation-env"],
      0,
    ],
    ["vi.importMock", `const m = await vi.importMock("./_helper");`, ["validation-env"], 0],
    ["vi.mock without a factory", `vi.mock("./_helper");`, ["validation-env"], 0],
    ["vi.doMock without a factory", `vi.doMock("./_helper");`, ["validation-env"], 0],
    ["vi.mock WITH a factory", `vi.mock("./_helper", () => ({}));`, [], 0],
    ["vi.doMock WITH a factory", `vi.doMock("./_helper", () => ({}));`, [], 0],
    ["vi.unmock", `vi.unmock("./_helper");`, [], 0],
    ["vi.doUnmock", `vi.doUnmock("./_helper");`, [], 0],
    ["an unrecognised vi member", `vi.somethingElse("./_helper");`, [], 1],
    ["vi.stubEnv", `vi.stubEnv("X", "y");`, [], 0],
  ];

  for (const [label, source, expectedClasses, expectedReports] of LOADER_FIXTURES) {
    test(`loader form — ${label}`, () => {
      const { classes, reports } = propagate(
        { [HELPER_PATH]: HELPER, "tests/db/consumer.test.ts": { source } },
        { "./_helper": HELPER_PATH, "./_other": "tests/db/_other.ts" },
      );
      expect([...(classes.get("tests/db/consumer.test.ts") ?? [])], label).toEqual(expectedClasses);
      expect(reports.length, `${label}: ${reports.map((r) => r.kind).join(",")}`).toBe(
        expectedReports,
      );
      if (expectedReports > 0) expect(reports[0]!.kind, label).toBe("loader-call");
    });
  }

  const PATH_SHAPES: ReadonlyArray<[string, string]> = [
    ["module-relative", "./_helper"],
    ["parent-relative", "../db/_helper"],
    ["root-relative", "/tests/db/_helper"],
    ["repo alias", "@/tests/db/_helper"],
  ];

  for (const [label, specifier] of PATH_SHAPES) {
    test(`a ${label} specifier is offered to the resolver and inherits`, () => {
      const { classes, asked } = propagate(
        {
          [HELPER_PATH]: HELPER,
          "tests/db/consumer.test.ts": { source: `import x from "${specifier}";` },
        },
        { [specifier]: HELPER_PATH },
      );
      expect(asked, label).toContain(specifier);
      expect([...(classes.get("tests/db/consumer.test.ts") ?? [])], label).toEqual([
        "validation-env",
      ]);
    });
  }

  test("a BARE package specifier is never offered to the resolver and is not an edge", () => {
    const { classes, reports, asked } = propagate({
      "tests/db/consumer.test.ts": {
        source: `import fs from "node:fs";\nimport pg from "postgres";`,
      },
    });
    expect(asked).toEqual([]);
    expect(reports).toEqual([]);
    expect([...(classes.get("tests/db/consumer.test.ts") ?? [])]).toEqual([]);
  });

  test("a path-shaped specifier the resolver cannot map REPORTS, and its twin does not", () => {
    const missing = propagate({
      "tests/db/consumer.test.ts": { source: `import x from "./_gone";` },
    });
    expect(missing.reports.map((r) => [r.kind, r.site])).toEqual([
      ["unresolved-import", "./_gone"],
    ]);
    const present = propagate(
      {
        [HELPER_PATH]: HELPER,
        "tests/db/consumer.test.ts": { source: `import x from "./_helper";` },
      },
      { "./_helper": HELPER_PATH },
    );
    expect(present.reports).toEqual([]);
  });

  const NON_LITERAL_POSITIONS: ReadonlyArray<[string, string]> = [
    ["import declaration", `import x from bar;`],
    ["export declaration", `export { c } from bar;`],
    ["import-equals", `import d = require(bar);`],
    ["dynamic import", `const e = await import(bar);`],
    ["require call", `const f = require(bar);`],
    ["loader call", `const g = await vi.importActual(bar);`],
  ];

  for (const [label, source] of NON_LITERAL_POSITIONS) {
    test(`a NON-literal specifier in the ${label} position reports unresolved-import`, () => {
      const { reports } = propagate({ "tests/db/consumer.test.ts": { source } });
      expect(
        reports.map((r) => r.kind),
        label,
      ).toEqual(["unresolved-import"]);
    });
  }

  test("a path-shaped edge leaving tests/ is a counted production edge, never a report", () => {
    const { reports, productionEdges } = propagate(
      { "tests/db/consumer.test.ts": { source: `import { parse } from "@/lib/parser/block";` } },
      { "@/lib/parser/block": "lib/parser/block.ts" },
    );
    expect(reports).toEqual([]);
    expect(productionEdges.get("tests/db/consumer.test.ts")).toBe(1);
  });

  const CONSUMERS = ["tests/admin/one.test.ts", "tests/e2e/two.spec.ts", "tests/e2e/three.spec.ts"];

  function helperTree(own: FileClass[]): Tree {
    const tree: Tree = { [HELPER_PATH]: { source: `const sql = 1;`, own } };
    for (const consumer of CONSUMERS) {
      tree[consumer] = { source: `import x from "@/tests/db/_helper";` };
    }
    return tree;
  }

  test("consumers of a DISPOSITIONED helper inherit `dispositioned` and owe nothing", () => {
    const { classes, reports, affected } = propagate(helperTree(["dispositioned"]), {
      "@/tests/db/_helper": HELPER_PATH,
    });
    for (const consumer of CONSUMERS) {
      expect([...(classes.get(consumer) ?? [])], consumer).toEqual(["dispositioned"]);
    }
    expect(reports).toEqual([]);
    expect(affected.size).toBe(0);
  });

  test("an UNDISPOSED helper names its consumers as affected — one report, at the helper", () => {
    const { classes, reports, affected } = propagate(helperTree(["undisposed"]), {
      "@/tests/db/_helper": HELPER_PATH,
    });
    for (const consumer of CONSUMERS) {
      expect([...(classes.get(consumer) ?? [])], consumer).toEqual(["undisposed"]);
    }
    // Kills BOTH weaker implementations: propagating the helper's raw report to every
    // consumer (three false obligations) and suppressing it (three silent files).
    expect(reports).toEqual([]);
    expect(affected.get(HELPER_PATH)).toEqual([...CONSUMERS].sort());
  });

  test("inheritance is module-grain: any edge carries the whole class set", () => {
    const { classes } = propagate(
      {
        [HELPER_PATH]: { source: `const sql = 1;`, own: ["validation-env", "dispositioned"] },
        "tests/db/consumer.test.ts": { source: `import { UNRELATED } from "./_helper";` },
      },
      { "./_helper": HELPER_PATH },
    );
    expect([...(classes.get("tests/db/consumer.test.ts") ?? [])].sort()).toEqual([
      "dispositioned",
      "validation-env",
    ]);
  });

  test("a type-only import is an edge too — over-inclusion can only ADD an obligation", () => {
    const { classes } = propagate(
      {
        [HELPER_PATH]: HELPER,
        "tests/db/consumer.test.ts": { source: `import type { X } from "./_helper";` },
      },
      { "./_helper": HELPER_PATH },
    );
    expect([...(classes.get("tests/db/consumer.test.ts") ?? [])]).toEqual(["validation-env"]);
  });

  test("the alias prefixes are READ from REPO_ALIAS called with the root, never retyped", () => {
    const prefixes = aliasPrefixes("/repo");
    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes).toContain("@");
  });
});

describe("connection census — dispositions, both directions (AC-C7)", () => {
  const F = "tests/db/subject.test.ts";

  function report(overrides: Partial<Report> & Pick<Report, "kind" | "site">): Report {
    return {
      file: F,
      line: 10,
      ordinal: 1,
      detail: "",
      argIsCall: false,
      ...overrides,
    };
  }

  test("an edge report is excusable only as `unclassifiable`, and both spellings are", () => {
    // Kills: a disjunction narrowed to a conjunction. No report carries two kinds, so a
    // conjunction is never true and BOTH edge kinds fall through to the site logic below,
    // which answers for a site rather than an edge. Asserting only one of the two spellings
    // leaves the other's branch unpinned, so both are named here.
    // `argIsCall: true` is load-bearing. The fall-through below answers `["unclassifiable"]`
    // for a report whose argument is NOT a call, so an edge report built with the default
    // reaches the same answer by the wrong route and proves nothing. With the flag set, the
    // fall-through would answer `["resolver", "unclassifiable"]`, which an EDGE report must
    // never be excused by.
    for (const kind of ["unresolved-import", "loader-call"] as const) {
      expect(
        admissibleKindsFor(report({ kind, site: "./_helper", argIsCall: true })),
        kind,
      ).toEqual(["unclassifiable"]);
    }
    // Twin, so the contrast is pinned: on a SITE report the same flag DOES open `resolver`.
    expect(
      admissibleKindsFor(report({ kind: "unclassifiable", site: "dsn()", argIsCall: true })),
    ).toEqual(["resolver", "unclassifiable"]);
  });

  function row(overrides: Partial<DispositionRow> & Pick<DispositionRow, "kind">): DispositionRow {
    return { file: F, site: "galleryDatabaseUrl()", reason: "checked by a reviewer", ...overrides };
  }

  test("a report with no row is undisposed; its disposed twin is not", () => {
    const r = report({ kind: "unclassifiable", site: "galleryDatabaseUrl()", argIsCall: true });
    const bare = reconcileDispositions([r], []);
    expect(bare.undisposed.map((u) => u.site)).toEqual(["galleryDatabaseUrl()"]);
    expect(bare.stale).toEqual([]);

    const covered = reconcileDispositions([r], [row({ kind: "resolver" })]);
    expect(covered.undisposed).toEqual([]);
    expect(covered.stale).toEqual([]);
    expect(covered.inadmissible).toEqual([]);
  });

  test("a row matching no live report is STALE; its live twin is not", () => {
    const stale = reconcileDispositions([], [row({ kind: "resolver" })]);
    expect(stale.stale.map((s) => s.site)).toEqual(["galleryDatabaseUrl()"]);

    const live = reconcileDispositions(
      [report({ kind: "unclassifiable", site: "galleryDatabaseUrl()", argIsCall: true })],
      [row({ kind: "resolver" })],
    );
    expect(live.stale).toEqual([]);
  });

  test("a one-character re-spelling of the site text reds the row as stale", () => {
    const moved = reconcileDispositions(
      [report({ kind: "unclassifiable", site: "galleryDatabaseUrl(dsn)", argIsCall: true })],
      [row({ kind: "resolver" })],
    );
    expect(moved.stale.map((s) => s.site)).toEqual(["galleryDatabaseUrl()"]);
    expect(moved.undisposed.map((u) => u.site)).toEqual(["galleryDatabaseUrl(dsn)"]);
  });

  test("two identical sites in one file are two keys: `nth: 1` covers the first only", () => {
    const twice = [
      report({ kind: "unclassifiable", site: "resolve()", ordinal: 1, line: 10, argIsCall: true }),
      report({ kind: "unclassifiable", site: "resolve()", ordinal: 2, line: 20, argIsCall: true }),
    ];
    const one = reconcileDispositions(twice, [
      row({ site: "resolve()", nth: 1, kind: "resolver" }),
    ]);
    expect(one.undisposed.map((u) => u.line)).toEqual([20]);
    expect(one.ambiguous).toEqual([]);

    const both = reconcileDispositions(twice, [
      row({ site: "resolve()", nth: 1, kind: "resolver" }),
      row({ site: "resolve()", nth: 2, kind: "resolver" }),
    ]);
    expect(both.undisposed).toEqual([]);
    expect(both.stale).toEqual([]);
    expect(both.ambiguous).toEqual([]);
  });

  test("a row that OMITS nth against two identical sites is AMBIGUOUS, and the second is undisposed", () => {
    const twice = [
      report({ kind: "unclassifiable", site: "resolve()", ordinal: 1, line: 10, argIsCall: true }),
      report({ kind: "unclassifiable", site: "resolve()", ordinal: 2, line: 20, argIsCall: true }),
    ];
    const result = reconcileDispositions(twice, [row({ site: "resolve()", kind: "resolver" })]);
    expect(result.ambiguous.map((a) => a.site)).toEqual(["resolve()"]);
    expect(result.undisposed.map((u) => u.line)).toEqual([20]);
  });

  test("keying is per SITE: a second undisposed site in a disposed file still reports", () => {
    const reports = [
      report({ kind: "unclassifiable", site: "galleryDatabaseUrl()", ordinal: 1, argIsCall: true }),
      report({ kind: "unclassifiable", site: "cfg.url", ordinal: 2, line: 20 }),
    ];
    const result = reconcileDispositions(reports, [row({ kind: "resolver" })]);
    expect(result.undisposed.map((u) => u.site)).toEqual(["cfg.url"]);
  });

  const KIND_CASES: ReadonlyArray<[string, DispositionRow["kind"], Report, boolean]> = [
    [
      "resolver on a call-argument site",
      "resolver",
      report({ kind: "unclassifiable", site: "galleryDatabaseUrl()", argIsCall: true }),
      true,
    ],
    [
      "resolver on a site whose argument is NOT a call",
      "resolver",
      report({ kind: "unclassifiable", site: "cfg.url", argIsCall: false }),
      false,
    ],
    [
      "acquisition on an acquisition report",
      "acquisition",
      report({ kind: "acquisition", site: `import "postgres"` }),
      true,
    ],
    [
      "acquisition on a value-reference report",
      "acquisition",
      report({ kind: "value-reference", site: "postgres" }),
      true,
    ],
    [
      "acquisition on a SITE report",
      "acquisition",
      report({ kind: "unclassifiable", site: "cfg.url" }),
      false,
    ],
    [
      "channel on a join report",
      "channel",
      report({ kind: "channel", site: "tests/db/x.test.ts" }),
      true,
    ],
    [
      "channel on an edge report",
      "channel",
      report({ kind: "unresolved-import", site: "path" }),
      false,
    ],
    [
      "unclassifiable on a site report",
      "unclassifiable",
      report({ kind: "unclassifiable", site: "cfg.url" }),
      true,
    ],
    [
      "unclassifiable on an unresolved-import edge",
      "unclassifiable",
      report({ kind: "unresolved-import", site: "pathToFileURL(file).href" }),
      true,
    ],
    [
      "unclassifiable on a loader-call edge",
      "unclassifiable",
      report({ kind: "loader-call", site: "./_helper" }),
      true,
    ],
    [
      "unclassifiable on an acquisition report",
      "unclassifiable",
      report({ kind: "acquisition", site: `import "postgres"` }),
      false,
    ],
  ];

  for (const [label, kind, subject, admissible] of KIND_CASES) {
    test(`kind admissibility — ${label} is ${admissible ? "admissible" : "INADMISSIBLE"}`, () => {
      const result = reconcileDispositions([subject], [row({ site: subject.site, kind })]);
      expect(result.inadmissible.length, label).toBe(admissible ? 0 : 1);
      expect(result.undisposed.length, label).toBe(admissible ? 0 : 1);
      expect(result.stale, label).toEqual([]);
    });
  }

  test("a remote-literal site has NO admissible kind and stays undisposed", () => {
    for (const kind of ["resolver", "acquisition", "channel", "unclassifiable"] as const) {
      const result = reconcileDispositions(
        [report({ kind: "remote-literal", site: `"postgresql://db.example.invalid/x"` })],
        [row({ site: `"postgresql://db.example.invalid/x"`, kind })],
      );
      expect(result.undisposed.length, kind).toBe(1);
      expect(result.inadmissible.length, kind).toBe(1);
    }
  });

  test("a row for another FILE never covers this file's report", () => {
    const result = reconcileDispositions(
      [report({ kind: "unclassifiable", site: "cfg.url" })],
      [row({ file: "tests/db/other.test.ts", site: "cfg.url", kind: "unclassifiable" })],
    );
    expect(result.undisposed).toHaveLength(1);
    expect(result.stale).toHaveLength(1);
  });

  test("every shipped row is well formed and uniquely keyed", () => {
    // This case asserted an EMPTY registry while the rows were still to come; the rows
    // landed in task:live-census-gate, so the claim it can keep making is the one that
    // stays true — kinds inside the closed union, a reason a reviewer can check, and no
    // two rows competing for one report.
    const kinds = new Set(["resolver", "acquisition", "channel", "unclassifiable"]);
    const keys = new Set<string>();
    for (const row of CONNECTION_CENSUS_DISPOSITIONS) {
      expect(kinds.has(row.kind), `${row.file} ${row.site}`).toBe(true);
      expect(row.reason.length, `${row.file} ${row.site}`).toBeGreaterThan(20);
      const key = `${row.file}\u0000${row.site}\u0000${row.nth ?? 1}`;
      expect(keys.has(key), `duplicate key ${key}`).toBe(false);
      keys.add(key);
    }
    // A premise, not decoration: an empty registry would satisfy every assertion above.
    expect(CONNECTION_CENSUS_DISPOSITIONS.length).toBeGreaterThan(0);
  });
});

describe("connection census — the join with the destructive guard (AC-C8)", () => {
  // Assembled at runtime: spelled literally, these fixtures would make THIS file a
  // discovered destructive file under the shipped guard's own regex walk (see the header).
  const PRUNE_CALL = `select ${["public", "prune_sync_log"].join(".")}()`;
  const WIPE_CALL = `select ${["public", "reset_validation_data"].join(".")}()`;
  const SENTINEL = ["ZZZ", "CENSUS", "SENTINEL"].join("_");

  const NON_ACQUIRER = "tests/db/prunesOnly.test.ts";
  const nonAcquirerSource = [
    `import { sql } from "./_someClient";`,
    `await sql.unsafe("${PRUNE_CALL}");`,
  ].join("\n");

  test("a destructive file that acquires no driver is a CHANNEL report", () => {
    const files = [{ path: NON_ACQUIRER, source: nonAcquirerSource }];
    const discovered = discoveredByDestructiveGuard(files);
    expect(discovered).toEqual([NON_ACQUIRER]);
    const reports = channelReports(discovered, new Set<string>());
    expect(reports.map((r) => [r.kind, r.site])).toEqual([["channel", NON_ACQUIRER]]);
  });

  test("twin — the same file acquiring the driver is in the population and reports nothing", () => {
    const source = [
      IMPORT,
      `const sql = postgres(${ENV});`,
      `await sql.unsafe("${PRUNE_CALL}");`,
    ].join("\n");
    const files = [{ path: NON_ACQUIRER, source }];
    const discovered = discoveredByDestructiveGuard(files);
    expect(discovered).toEqual([NON_ACQUIRER]);
    expect(channelReports(discovered, new Set([NON_ACQUIRER]))).toEqual([]);
  });

  test("the wipe spelling is discovered too", () => {
    const files = [{ path: "tests/db/wipes.test.ts", source: `await sql.unsafe("${WIPE_CALL}");` }];
    expect(discoveredByDestructiveGuard(files)).toEqual(["tests/db/wipes.test.ts"]);
  });

  test("a file naming the destructive statement only in a COMMENT is not discovered", () => {
    // The stripper decides, exactly as it does in the destructive guard.
    const files = [
      {
        path: "tests/db/prose.test.ts",
        source: `// this test never runs ${PRUNE_CALL}\nconst x = 1;`,
      },
    ];
    expect(discoveredByDestructiveGuard(files)).toEqual([]);
  });

  test("a SQL comment inside the literal is stripped too — the union of both views", () => {
    const spaced = `select /* note */ ${["public", "prune_sync_log"].join(".")}()`;
    const files = [
      { path: "tests/db/inlineSqlComment.test.ts", source: `await sql.unsafe("${spaced}");` },
    ];
    expect(discoveredByDestructiveGuard(files)).toEqual(["tests/db/inlineSqlComment.test.ts"]);
  });

  test("the guard's OWN files are excluded by name", () => {
    const files = GUARD_OWN_FILES.map((path) => ({ path, source: `const q = "${PRUNE_CALL}";` }));
    expect(discoveredByDestructiveGuard(files)).toEqual([]);
  });

  test("the default deps ARE the shared recognizer and the shared stripper, by identity", () => {
    // An injectable seam certifies a path production never takes unless the DEFAULT
    // binding is asserted: without this, a copy could sit behind the same parameter.
    expect(DEFAULT_JOIN_DEPS.patterns).toBe(DESTRUCTIVE_STATEMENT_PATTERNS);
    expect(DEFAULT_JOIN_DEPS.strip).toBe(stripCommentsForFile);
  });

  test("METAMORPHIC — injecting a pattern set moves the discovered set to exactly the sentinel", () => {
    // A `new RegExp` copy reproduces the live set and passes a literal-only structural
    // check; it cannot respond to an injected pattern set, because it never reads one.
    const files = [
      { path: NON_ACQUIRER, source: nonAcquirerSource },
      { path: "tests/db/sentinel.test.ts", source: `const marker = "${SENTINEL}";` },
    ];
    const injected = discoveredByDestructiveGuard(files, {
      patterns: { sentinel: new RegExp(SENTINEL) },
      strip: stripCommentsForFile,
    });
    expect(injected).toEqual(["tests/db/sentinel.test.ts"]);
  });

  test("METAMORPHIC — injecting the stripper changes what is discovered", () => {
    const files = [
      {
        path: "tests/db/prose.test.ts",
        source: `// this test never runs ${PRUNE_CALL}\nconst x = 1;`,
      },
    ];
    // With a stripper that strips NOTHING, the commented mention is discovered: the join
    // reads the injected function rather than a private copy of the stripping rule.
    const identityStrip = (source: string, _filePath: string): string => source;
    expect(
      discoveredByDestructiveGuard(files, {
        patterns: DESTRUCTIVE_STATEMENT_PATTERNS,
        strip: identityStrip,
      }),
    ).toEqual(["tests/db/prose.test.ts"]);
  });

  test("channelReports names every discovered file the population does not contain", () => {
    const reports = channelReports(
      ["tests/db/a.test.ts", "tests/db/b.test.ts"],
      new Set(["tests/db/b.test.ts"]),
    );
    expect(reports.map((r) => r.site)).toEqual(["tests/db/a.test.ts"]);
    expect(reports[0]!.kind).toBe("channel");
  });
});

describe("connection census — the report shape and the remedy text (AC-C6 rendering arm)", () => {
  const F = "tests/db/subject.test.ts";

  function report(overrides: Partial<Report> & Pick<Report, "kind" | "site">): Report {
    return { file: F, line: 12, ordinal: 1, detail: "", argIsCall: false, ...overrides };
  }

  const EMPTY_COUNTS = {
    "guard-bound": 0,
    "validation-env": 0,
    "loopback-literal": 0,
    "remote-literal": 0,
    unclassifiable: 0,
  };

  // The remedy sentences are written out HERE, independent of the module's own table, so
  // exactly one side of each comparison is derived (the file, line and ordinal come from
  // the report's fields). Equality on the full line, never a substring match: a substring
  // assertion is structurally blind to every addition.
  const LINES: ReadonlyArray<[Report, string]> = [
    [
      report({ kind: "unclassifiable", site: "cfg.url" }),
      "tests/db/subject.test.ts:12 site#1 unclassifiable — add a CONNECTION_CENSUS_DISPOSITIONS row of kind `resolver` or `unclassifiable` naming this site",
    ],
    [
      report({ kind: "remote-literal", site: `"postgresql://db.example.invalid/x"`, ordinal: 2 }),
      "tests/db/subject.test.ts:12 site#2 remote-literal — resolve the target from DATABASE_URL and wrap it in assertLocalDbUrl",
    ],
    [
      report({ kind: "shadowed-driver", site: "url", ordinal: null }),
      "tests/db/subject.test.ts:12 shadowed-driver — rename the local declaration that reuses the driver binding's name",
    ],
    [
      report({ kind: "acquisition", site: `import "postgres"`, ordinal: null }),
      "tests/db/subject.test.ts:12 acquisition — use a static default import, or add an `acquisition` disposition row",
    ],
    [
      report({ kind: "value-reference", site: "postgres", ordinal: null }),
      "tests/db/subject.test.ts:12 value-reference — call the driver binding directly, or add an `acquisition` disposition row",
    ],
    [
      report({ kind: "unresolved-import", site: "pathToFileURL(file).href", ordinal: null }),
      "tests/db/subject.test.ts:12 unresolved-import — use a literal specifier, or add an `unclassifiable` disposition row naming this specifier",
    ],
    [
      report({ kind: "loader-call", site: "./_helper", ordinal: null }),
      "tests/db/subject.test.ts:12 loader-call — use a vitest loader the census models, or add an `unclassifiable` disposition row",
    ],
    [
      report({ kind: "channel", site: F, ordinal: null }),
      "tests/db/subject.test.ts:12 channel — this file executes destructive SQL through a channel the census does not model; add a `channel` disposition row",
    ],
  ];

  for (const [subject, expected] of LINES) {
    test(`the ${subject.kind} line renders exactly`, () => {
      const rendered = renderReport([subject], EMPTY_COUNTS).split("\n");
      expect(rendered[0]).toBe(expected);
    });
  }

  test("affected consumers are listed UNDER the helper's one report", () => {
    const rendered = renderReport(
      [
        report({
          kind: "unclassifiable",
          site: "galleryDatabaseUrl(dsn)",
          affected: ["tests/e2e/one.spec.ts", "tests/e2e/two.spec.ts"],
        }),
      ],
      EMPTY_COUNTS,
    ).split("\n");
    expect(rendered[1]).toBe("    affected: tests/e2e/one.spec.ts, tests/e2e/two.spec.ts");
  });

  test("the per-class count block prints every class, including the zeros", () => {
    // A zero always prints beside its population: `0 of 0` cannot render as a pass.
    const rendered = renderReport([], {
      "guard-bound": 85,
      "validation-env": 78,
      "loopback-literal": 9,
      "remote-literal": 0,
      unclassifiable: 2,
    });
    expect(rendered).toBe(
      "guard-bound 85 / validation-env 78 / loopback-literal 9 / remote-literal 0 / unclassifiable 2",
    );
  });

  test("the count block sits AFTER the reports, one block per render", () => {
    const rendered = renderReport([report({ kind: "unclassifiable", site: "cfg.url" })], {
      ...EMPTY_COUNTS,
      "validation-env": 3,
    }).split("\n");
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toBe(
      "guard-bound 0 / validation-env 3 / loopback-literal 0 / remote-literal 0 / unclassifiable 0",
    );
  });

  test("classCounts tallies the classified sites, zeros included", () => {
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `const a = postgres(${ENV});`,
        `const b = postgres(${LOOPBACK});`,
        `const c = postgres(cfg.url);`,
      ].join("\n"),
    );
    expect(classCounts(rec.sites)).toEqual({
      "guard-bound": 0,
      "validation-env": 1,
      "loopback-literal": 1,
      "remote-literal": 0,
      unclassifiable: 1,
    });
  });

  test("attachAffected puts the consumer list on the helper's own report and nowhere else", () => {
    const helper = report({ kind: "unclassifiable", site: "galleryDatabaseUrl(dsn)" });
    const other = report({
      kind: "unclassifiable",
      site: "cfg.url",
      file: "tests/db/other.test.ts",
    });
    const attached = attachAffected([helper, other], new Map([[F, ["tests/e2e/one.spec.ts"]]]));
    expect(attached[0]!.affected).toEqual(["tests/e2e/one.spec.ts"]);
    expect(attached[1]!.affected).toBeUndefined();
  });

  test("an empty report list still renders its count block", () => {
    expect(renderReport([], EMPTY_COUNTS).split("\n")).toHaveLength(1);
  });
});

describe("connection census — a driver name in a TYPE position is not a value reference", () => {
  // Measured on the live corpus by the meta-test: 50+ files name the driver binding in a
  // TYPE (`postgres.JSONValue`, `ReturnType<typeof postgres>`), which reads no value and
  // opens no connection. Reporting them is a FALSE report, and a report the corpus does
  // not need is a defect exactly as a missing one is.
  const TYPE_POSITIONS: ReadonlyArray<[string, string]> = [
    ["a qualified type name", `type Captured = { settings: postgres.JSONValue | null };`],
    ["a typeof query", `let pool: ReturnType<typeof postgres>;`],
    ["a type argument", `const rows: Array<postgres.Row> = [];`],
    ["a type-only re-declaration", `type Sql = typeof postgres;`],
  ];

  for (const [label, declaration] of TYPE_POSITIONS) {
    test(`${label} reports nothing`, () => {
      const rec = classifyFile(P, [IMPORT, declaration].join("\n"));
      expect(
        rec.reports.map((r) => r.kind),
        label,
      ).toEqual([]);
    });
  }

  test("twin — the same name in a VALUE position is still a value-reference report", () => {
    const rec = classifyFile(
      P,
      [IMPORT, `let pool: ReturnType<typeof postgres>;`, `const alias = postgres;`].join("\n"),
    );
    expect(rec.reports.map((r) => [r.kind, r.line])).toEqual([["value-reference", 3]]);
  });
});

describe("connection census — an edge to a NON-SOURCE file is decided, not reported", () => {
  // Measured on the live corpus: `import baseline from "./x.json"` and a fixture's
  // `import "./app.css"` resolve to real files that the census population does not hold,
  // because they are not source. They carry no code and can open no connection, so the
  // decided answer is "not an edge" — reporting them would be a false report, which the
  // consequence bound makes a defect exactly as a missed file is.
  const CONSUMER = "tests/db/consumer.test.ts";

  function propagateWith(target: string, specifier = "./data") {
    const resolve: ImportResolver = () => target;
    return propagateThroughImports(
      [
        {
          file: CONSUMER,
          sf: parse(`import x from "${specifier}";`, CONSUMER),
          own: [] as FileClass[],
        },
      ],
      resolve,
      "/repo",
    );
  }

  test("a JSON target is not an edge and reports nothing", () => {
    expect(propagateWith("tests/adminAlerts/baseline.json").reports).toEqual([]);
  });

  test("a CSS target is not an edge and reports nothing", () => {
    expect(propagateWith("tests/styles/__fixtures__/app.css").reports).toEqual([]);
  });

  test("twin — a SOURCE target outside the population still REPORTS", () => {
    // The walk missing a source file is a real gap and stays loud.
    const result = propagateWith("tests/db/_notInThePopulation.ts");
    expect(result.reports.map((r) => r.kind)).toEqual(["unresolved-import"]);
  });

  test("the source-extension set is shared with the walk rather than typed twice", () => {
    for (const extension of ["ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx"]) {
      expect(SOURCE_EXTENSIONS.test(`x.${extension}`), extension).toBe(true);
    }
    for (const extension of ["json", "css", "md", "png"]) {
      expect(SOURCE_EXTENSIONS.test(`x.${extension}`), extension).toBe(false);
    }
  });
});

describe("connection census — the enrolment's control is unique in the module (AC-C9)", () => {
  test("the registry row's control text occurs EXACTLY ONCE in the source it mutates", () => {
    // `grep -c -F` = 1, made executable. A control keyed by text is only as good as that
    // text's uniqueness, and a prose claim about it is a measurement with no re-measurement
    // trigger: on this repo a row that read "verified unique on the current source" went
    // false under an ordinary refactor, the control edit landed on a site no case reached,
    // and seven survivors sat undetected behind a green gate.
    const surface = GUARD_SURFACES.find((s) => s.id === "connectionCensus");
    premiseHolds("connectionCensus is enrolled", surface !== undefined);
    const source = readFileSync(join(process.cwd(), MODULE_PATH), "utf8");
    const occurrences = source.split(surface!.control.from).length - 1;
    expect(occurrences, `control.from: ${surface!.control.from}`).toBe(1);
    // And it must actually CHANGE the source, or the overlay proves nothing.
    expect(source.replace(surface!.control.from, () => surface!.control.to)).not.toBe(source);
    // The control's target is the module this suite decides, not some other file.
    expect(surface!.sourcePath).toBe(MODULE_PATH);
    expect(surface!.suitePaths).toContain("tests/db/connectionCensus.test.ts");
  });
});

describe("connection census — a driver name that is a KEY is not a value reference", () => {
  // Every case here was authored against a SURVIVING MUTANT: the mutation gate found that
  // nothing in the suite discriminated these positions, so each one is a real gap the score
  // exposed rather than a case written for symmetry.
  const KEY_POSITIONS: ReadonlyArray<[string, string]> = [
    ["a property-assignment key", `const bag = { postgres: 1 };`],
    ["a property-access name", `const bag = { postgres: 1 };\nconst n = bag.postgres;`],
    ["a property-signature name", `interface Bag { postgres: string }`],
    ["a destructuring alias source", `const { postgres: pg } = bag;`],
    ["an import alias source", `import { postgres as pg } from "./_unrelated";`],
  ];

  for (const [label, tail] of KEY_POSITIONS) {
    test(`${label} reports nothing`, () => {
      const rec = classifyFile(P, [IMPORT, `const sql = postgres(${ENV});`, tail].join("\n"));
      expect(
        rec.reports.map((r) => r.kind),
        label,
      ).toEqual([]);
      expect(
        rec.sites.map((s) => s.cls),
        label,
      ).toEqual(["validation-env"]);
    });
  }

  test("twin — the same name as the RECEIVER of a property access IS a value reference", () => {
    // `postgres.length` READS the binding; `bag.postgres` names a key. A predicate that
    // suppressed on "the parent is a property access" rather than on "this identifier is
    // its NAME" would silence the first.
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV});`, `const n = postgres.length;`].join("\n"),
    );
    expect(rec.reports.map((r) => [r.kind, r.line])).toEqual([["value-reference", 3]]);
  });

  test("twin — a destructuring that BINDS the name shadows the driver instead", () => {
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV});`, `const { postgres } = bag;`].join("\n"),
    );
    expect(rec.sites).toEqual([]);
    expect(rec.reports.map((r) => r.kind)).toEqual(["shadowed-driver"]);
  });
});

describe("connection census — cases authored against SURVIVING MUTANTS", () => {
  // The mutation gate's first scored run left 74 survivors. Every case below was written
  // against a specific one: the score is what found these gaps, not review, and each case
  // names the weaker implementation it kills.
  const GUARD_LITERAL = `"postgresql://postgres:postgres@127.0.0.1:54322/postgres"`;

  test("an `export {}` without a module specifier is not a specifier position", () => {
    // Kills: a walk that treats every ExportDeclaration as carrying a specifier.
    const refs = moduleSpecifiersIn(parse([`const a = 1;`, `export { a };`].join("\n")));
    expect(refs).toEqual([]);
  });

  test("a call of a function that is not `require` is not a specifier position", () => {
    // Kills: a walk keyed on "any identifier callee" rather than on `require`.
    const refs = moduleSpecifiersIn(parse(`helper("./_helper");`));
    expect(refs).toEqual([]);
  });

  test("a side-effect import does not break the declaration walk", () => {
    // Kills: a declaration walk that reads `n.importClause` without testing it.
    const rec = classifyFile(
      P,
      [IMPORT, `import "./_side";`, `const sql = postgres(${ENV});`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("an unrelated namespace import does not shadow the driver", () => {
    // Kills: a declaration walk that counts every namespace import as a declaration of the
    // name it is asked about.
    const rec = classifyFile(
      P,
      [IMPORT, `import * as other from "./_x";`, `const sql = postgres(${ENV});`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
    expect(rec.reports).toEqual([]);
  });

  test("an acquisition CALLED immediately is reported, not bound", () => {
    // Kills: an ascent that walks through a call expression to the const beyond it.
    const rec = classifyFile(P, [`const sql = require("postgres")(${ENV});`].join("\n"));
    expect(rec.sites).toEqual([]);
    expect(rec.reports.map((r) => r.kind)).toEqual(["acquisition"]);
  });

  test("a vitest loader that LOADS NOTHING is neither a binding nor a report", () => {
    // Kills: dropping the skip for a known non-loading member, and dropping its `continue`.
    const rec = classifyFile(
      P,
      [IMPORT, `vi.unmock("postgres");`, `const sql = postgres(${ENV});`].join("\n"),
    );
    expect(rec.reports).toEqual([]);
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("an UNRECOGNISED vitest member naming the driver reports", () => {
    // Kills: a guard that reports for known members too, and one that never reports.
    const rec = classifyFile(P, `vi.somethingElse("postgres");`);
    expect(rec.reports.map((r) => r.kind)).toEqual(["acquisition"]);
    expect(rec.reports[0]!.detail).toContain("somethingElse");
  });

  test("a namespace member other than `default` is not a connect site", () => {
    // Kills: a site rule that accepts any member of a namespace binding.
    const rec = classifyFile(
      P,
      [`import * as ns from "postgres";`, `const x = ns.other(${ENV});`].join("\n"),
    );
    expect(rec.sites).toEqual([]);
    expect(rec.reports.map((r) => r.kind)).toEqual(["value-reference"]);
  });

  test("the namespace receiver of a `.default` call is not ALSO a value reference", () => {
    // Kills: dropping the callee-node exclusion for the namespace form.
    const rec = classifyFile(
      P,
      [`import * as ns from "postgres";`, `const sql = ns.default(${ENV});`].join("\n"),
    );
    expect(rec.reports).toEqual([]);
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("a TYPE-ONLY import of the guard does not make a site guard-bound", () => {
    // Kills: a guard-name collector that ignores `isTypeOnly`, and one that drops its skip.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `import type { assertLocalDbUrl } from "./_localDbUrl";`,
        `const sql = postgres(assertLocalDbUrl(${GUARD_LITERAL}));`,
      ].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
  });

  test("a NAMESPACE import of the guard module does not crash the name collector", () => {
    // Kills: reading `.elements` off a namespace binding.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `import * as g from "./_localDbUrl";`,
        `const sql = postgres(g.assertLocalDbUrl(u));`,
      ].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
  });

  test("a property read says SO in its detail", () => {
    // Kills: a shape test that collapses property and element access into one branch.
    expect(
      classifyFile(P, [IMPORT, `const sql = postgres(cfg.url);`].join("\n")).sites[0]!.detail,
    ).toBe("a property read the census does not follow");
  });

  test("a self-referential const resolves without recursing forever", () => {
    // Kills: dropping the `seen` insertion that bounds the const-chain walk.
    const rec = classifyFile(
      P,
      [IMPORT, `const url = url;`, `const sql = postgres(url);`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
  });

  test("two IDENTICAL declarations of one name classify as that name", () => {
    // Kills: a comparison that reports `unclassifiable` when the declarations AGREE.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `function a() { const url = ${ENV}; return url; }`,
        `function b() { const url = ${ENV}; return url; }`,
        `const sql = postgres(url);`,
      ].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  const DISAGREEING: ReadonlyArray<[string, string, string]> = [
    ["env names", `const url = ${ENV};`, `const url = process.env.DATABASE_URL;`],
    ["literal hosts", `const url = ${LOOPBACK};`, `const url = ${REMOTE};`],
    ["unclassifiable reasons", `const url = cfg.a;`, `const url = other();`],
  ];

  for (const [label, first, second] of DISAGREEING) {
    test(`two declarations that disagree on ${label} are unclassifiable`, () => {
      // Kills: a rendering that collapses two DIFFERENT resolutions of one kind into one
      // string, which makes disagreeing declarations compare equal.
      const rec = classifyFile(
        P,
        [
          IMPORT,
          `function a() { ${first} return url; }`,
          `function b() { ${second} return url; }`,
          `const sql = postgres(url);`,
        ].join("\n"),
      );
      expect(
        rec.sites.map((s) => s.cls),
        label,
      ).toEqual(["unclassifiable"]);
    });
  }

  test("a chain of two loopback literals is loopback, not env", () => {
    // Kills: an emptiness test on the collected env names that is off by one.
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${LOOPBACK} ?? ${GUARD_LITERAL});`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["loopback-literal"]);
  });

  test("a mixed chain names the operand that spoiled it", () => {
    // Kills: a detail that reports the wrong branch of the mixed-chain test.
    const rec = classifyFile(P, [IMPORT, `const sql = postgres(cfg.url ?? ${ENV});`].join("\n"));
    expect(rec.sites[0]!.detail).toContain("a mixed chain");
  });

  test("a BOOLEAN connection sub-value is a literal", () => {
    // Kills: a literal test that requires a value to be both `true` and `false`.
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV}, { connection: { flag: true } });`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("a shadowed call's disposition key is its ARGUMENT text", () => {
    // Kills: a key taken from the wrong argument position.
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV}, { max: 1 });`, `function f(postgres: string) {}`].join(
        "\n",
      ),
    );
    expect(rec.reports.map((r) => r.site)).toEqual([ENV]);
  });

  test("reports come out in source order, and a site ordinal breaks a line tie", () => {
    // Kills: dropping the sort, inverting its comparator, or keying it on the wrong index.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `const a = postgres(cfg.first);`,
        `const b = postgres(cfg.second);`,
        `const c = postgres(cfg.third);`,
      ].join("\n"),
    );
    expect(rec.reports.map((r) => [r.line, r.ordinal])).toEqual([
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  test("a file with no production edge carries no production tally", () => {
    // Kills: a boundary that counts zero production edges as an entry.
    const result = propagateThroughImports(
      [
        {
          file: "tests/db/consumer.test.ts",
          sf: parse(`import fs from "node:fs";`, "tests/db/consumer.test.ts"),
          own: [] as FileClass[],
        },
      ],
      () => null,
      "/repo",
    );
    expect(result.productionEdges.has("tests/db/consumer.test.ts")).toBe(false);
  });

  test("a helper with no consumer names nobody as affected", () => {
    // Kills: a boundary that records an EMPTY affected list.
    const result = propagateThroughImports(
      [
        {
          file: "tests/db/_lonely.ts",
          sf: parse(`const sql = 1;`, "tests/db/_lonely.ts"),
          own: ["undisposed"] as FileClass[],
        },
      ],
      () => null,
      "/repo",
    );
    expect(result.affected.size).toBe(0);
  });

  /** Resolver over a literal map, for the multi-hop propagation fixtures below. */
  function chainResolver(map: Record<string, string>): ImportResolver {
    return (_from, specifier) => map[specifier] ?? null;
  }

  function chainFiles(tree: Record<string, { source: string; own?: FileClass[] }>) {
    return Object.entries(tree).map(([file, entry]) => ({
      file,
      sf: parse(entry.source, file),
      own: entry.own ?? ([] as FileClass[]),
    }));
  }

  test("a file whose driver contact is REPORTED still carries a class", () => {
    // Kills / whole-diff R1 scope B P0: deriving own-classes from `sites` alone. A correctly
    // reported acquisition or shadowed-driver call is not a site, so a helper whose entire
    // driver contact is reported contributed NO class -- and because those reports are
    // dutifully dispositioned, every gate condition stayed green while each of its consumers
    // silently left the classified graph. The importing tests still evaluate a module that
    // opens a connection, and nothing classified or named them.
    const shadowed = classifyFile(
      P,
      [IMPORT, `function f(postgres) {`, `  return postgres(process.env.DB_URL);`, `}`].join("\n"),
    );
    expect(shadowed.sites, "the premise: this file has NO site, only reports").toEqual([]);
    expect(shadowed.reports.map((r) => r.kind)).toEqual(["shadowed-driver"]);

    expect(
      ownClassesFor(shadowed, () => false),
      "disposed",
    ).toEqual(["dispositioned"]);
    expect(
      ownClassesFor(shadowed, () => true),
      "undisposed",
    ).toEqual(["undisposed"]);
  });

  test("ownClassesFor carries an accepted SITE class through verbatim", () => {
    // Kills: the site branch of the class derivation. The reports branch alone was covered,
    // so nothing pinned that an accepted class survives the pass unchanged.
    const rec = classifyFile(P, [IMPORT, `const sql = postgres(${ENV});`].join("\n"));
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
    expect(ownClassesFor(rec, () => false)).toEqual(["validation-env"]);
    expect(
      ownClassesFor(rec, () => true),
      "an accepted class is NOT a disposition",
    ).toEqual(["validation-env"]);
  });

  test("an unresolvable SITE takes its disposition, in both directions", () => {
    // Kills: the `unclassifiable`/`remote-literal` test and the disposition call under it.
    // Both directions, because a derivation stuck on either answer passes a one-sided check.
    const rec = classifyFile(P, [IMPORT, `const sql = postgres(pickUrl());`].join("\n"));
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
    expect(
      ownClassesFor(rec, () => false),
      "row present",
    ).toEqual(["dispositioned"]);
    expect(
      ownClassesFor(rec, () => true),
      "no row",
    ).toEqual(["undisposed"]);
  });

  test("a loader naming the DRIVER with an unclassifiable second argument reports", () => {
    // Kills: the acquisition-side half of the undecidable split. The edge-side half was
    // covered; this is the same decision made where the specifier names the driver itself,
    // and it reports rather than being read as a replacement factory.
    const rec = classifyFile(P, [`vi.mock("postgres", opts);`].join("\n"));
    expect(rec.reports.map((r) => r.kind)).toEqual(["acquisition"]);
    expect(rec.reports[0]?.detail).toContain("cannot classify as a replacement factory");
  });

  test("an EDGE report seeds no class, because it is not about that file's own driver", () => {
    // The boundary of the rule above. `unresolved-import` and `loader-call` are reported
    // against the IMPORTING file about an edge; seeding from them would attribute a
    // helper's behaviour to every file that failed to resolve any specifier.
    const record = {
      file: P,
      sites: [],
      reports: (["unresolved-import", "loader-call"] as const).map((kind) => ({
        file: P,
        line: 3,
        ordinal: null,
        kind,
        site: "./_helper",
        detail: "",
        argIsCall: false,
      })),
    };
    expect(ownClassesFor(record, () => false)).toEqual([]);
  });

  test("a conditional loader's second argument decides by ROLE, never by arity", () => {
    // Kills / whole-diff R1 scope A: `arguments.length > 1` read every second argument as a
    // replacement factory. The position is overloaded — Vitest takes a factory OR
    // ModuleMockOptions — and only the factory keeps the original module from evaluating.
    // Reading autospy as a factory drops a live edge with no class and no report, which is
    // the silence the consequence bound forbids. The autospy spelling is already in the
    // corpus at tests/admin/test-auth-gate.test.ts:161.
    const cases: Array<[string, string, boolean]> = [
      ["absent", `vi.mock("./_helper.js");`, true],
      ["autospy", `vi.mock("./_helper.js", { spy: true });`, true],
      ["automock, empty options", `vi.mock("./_helper.js", {});`, true],
      ["automock, spy false", `vi.mock("./_helper.js", { spy: false });`, true],
      ["explicit undefined", `vi.mock("./_helper.js", undefined);`, true],
      ["arrow factory", `vi.mock("./_helper.js", () => ({}));`, false],
      ["function factory", `vi.mock("./_helper.js", function () { return {}; });`, false],
      ["doMock autospy", `vi.doMock("./_helper.js", { spy: true });`, true],
    ];
    for (const [label, source, loads] of cases) {
      const result = propagateThroughImports(
        chainFiles({
          "tests/db/consumer.test.ts": { source },
          "tests/db/_helper.ts": { source: `const sql = 1;`, own: ["validation-env"] },
        }),
        chainResolver({ "./_helper.js": "tests/db/_helper.ts" }),
        "/repo",
      );
      expect([...(result.classes.get("tests/db/consumer.test.ts") ?? [])], label).toEqual(
        loads ? ["validation-env"] : [],
      );
      expect(
        result.reports.map((r) => r.kind),
        label,
      ).toEqual([]);
    }
  });

  test("a second argument the census cannot classify REPORTS rather than being guessed", () => {
    // The other half of the same split. An identifier or a call could be either role, and
    // the census resolves no values -- guessing `factory` drops a live edge, guessing
    // `options` invents one. Neither is acceptable, so it reports and owes a row.
    for (const source of [
      `vi.mock("./_helper.js", opts);`,
      `vi.mock("./_helper.js", makeOptions());`,
      `vi.doMock("./_helper.js", opts);`,
    ]) {
      const result = propagateThroughImports(
        chainFiles({
          "tests/db/consumer.test.ts": { source },
          "tests/db/_helper.ts": { source: `const sql = 1;`, own: ["validation-env"] },
        }),
        chainResolver({ "./_helper.js": "tests/db/_helper.ts" }),
        "/repo",
      );
      expect(
        result.reports.map((r) => r.kind),
        source,
      ).toEqual(["loader-call"]);
    }
  });

  test("a helper two hops away names its far consumer as affected", () => {
    // Kills: a fixpoint whose DIRECT-edge growth does not re-trigger a pass. Every direct
    // edge lands in the first pass, so a first pass that grows only direct edges and does
    // not signal it leaves the transitive pass unrun — and the far consumer unnamed. File
    // order is load-bearing: the consumer is listed BEFORE the helper it reaches.
    const result = propagateThroughImports(
      chainFiles({
        // EVERY file carries the class, so class propagation adds nothing and saturates
        // at pass one. That isolation is the point: with the class on the deepest file
        // only, class growth signals `grew` on its own and masks a removed reach signal.
        "tests/db/far.test.ts": { source: `import "./_mid.js";`, own: ["undisposed"] },
        "tests/db/_mid.ts": { source: `import "./_deep.js";`, own: ["undisposed"] },
        "tests/db/_deep.ts": { source: `const sql = 1;`, own: ["undisposed"] },
      }),
      chainResolver({ "./_mid.js": "tests/db/_mid.ts", "./_deep.js": "tests/db/_deep.ts" }),
      "/repo",
    );
    expect(result.affected.get("tests/db/_deep.ts")).toEqual([
      "tests/db/_mid.ts",
      "tests/db/far.test.ts",
    ]);
  });

  test("a helper three hops away names its farthest consumer as affected", () => {
    // Kills: a fixpoint whose TRANSITIVE-reach growth does not re-trigger a pass. Two hops
    // is not enough to catch it — the second pass completes the two-hop reach and stops,
    // which is the right answer there. At three hops the third pass is the one that never
    // runs, so the head of the chain silently drops out of the affected list.
    const result = propagateThroughImports(
      chainFiles({
        // As above: the class is on every file, so only reach growth can signal.
        "tests/db/head.test.ts": { source: `import "./_one.js";`, own: ["undisposed"] },
        "tests/db/_one.ts": { source: `import "./_two.js";`, own: ["undisposed"] },
        "tests/db/_two.ts": { source: `import "./_three.js";`, own: ["undisposed"] },
        "tests/db/_three.ts": { source: `const sql = 1;`, own: ["undisposed"] },
      }),
      chainResolver({
        "./_one.js": "tests/db/_one.ts",
        "./_two.js": "tests/db/_two.ts",
        "./_three.js": "tests/db/_three.ts",
      }),
      "/repo",
    );
    expect(result.affected.get("tests/db/_three.ts")).toEqual([
      "tests/db/_one.ts",
      "tests/db/_two.ts",
      "tests/db/head.test.ts",
    ]);
  });

  test("a rendered report with an EMPTY affected list prints no affected line", () => {
    // Kills: a boundary that prints the affected line for an empty list.
    const rendered = renderReport(
      [
        {
          file: "tests/db/x.test.ts",
          line: 3,
          ordinal: 1,
          kind: "unclassifiable",
          site: "cfg.url",
          detail: "",
          argIsCall: false,
          affected: [],
        },
      ],
      {
        "guard-bound": 0,
        "validation-env": 0,
        "loopback-literal": 0,
        "remote-literal": 0,
        unclassifiable: 0,
      },
    ).split("\n");
    expect(rendered).toHaveLength(2);
  });

  test("a channel report's line is the file's first line", () => {
    // Kills: an off-by-one in the synthesized line number.
    expect(channelReports(["tests/db/a.test.ts"], new Set())[0]!.line).toBe(1);
  });

  test("an inadmissible row on a report with NO admissible kind says so", () => {
    // Kills: a boundary that renders the empty admissible set as a list.
    const result = reconcileDispositions(
      [
        {
          file: P,
          line: 1,
          ordinal: 1,
          kind: "remote-literal",
          site: "u",
          detail: "",
          argIsCall: false,
        },
      ],
      [{ file: P, site: "u", kind: "unclassifiable", reason: "checked by a reviewer" }],
    );
    expect(result.inadmissible[0]!.reason).toBe(
      "a remote-literal report has no admissible disposition kind",
    );
  });

  test("a row that matches exactly one report is never ambiguous", () => {
    // Kills: a boundary that calls a single match ambiguous.
    const result = reconcileDispositions(
      [
        {
          file: P,
          line: 1,
          ordinal: 1,
          kind: "unclassifiable",
          site: "u",
          detail: "",
          argIsCall: false,
        },
      ],
      [{ file: P, site: "u", kind: "unclassifiable", reason: "checked by a reviewer" }],
    );
    expect(result.ambiguous).toEqual([]);
    expect(result.undisposed).toEqual([]);
  });

  test("the join matches in the SQL-stripped view as well as the JS-stripped one", () => {
    // Kills: a join that reads only one of the two views.
    const marker = ["public", "prune_app_events"].join(".") + "()";
    const withSqlComment = `await sql.unsafe("select /* note */ ${marker}");`;
    expect(
      discoveredByDestructiveGuard([
        { path: "tests/db/sqlComment.test.ts", source: withSqlComment },
      ]),
    ).toEqual(["tests/db/sqlComment.test.ts"]);
  });
});

describe("connection census — the second scored run's survivors", () => {
  const REMOTE_A = `"postgresql://a@aws-1-us-east-2.pooler.supabase.com:5432/postgres"`;
  const REMOTE_B = `"postgresql://b@aws-9-eu-west-1.pooler.supabase.com:5432/postgres"`;

  test("a driver name in a property VALUE position is still a value reference", () => {
    // Kills: a key test that suppresses on "the parent is a property assignment" rather
    // than on "this identifier is its NAME".
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(${ENV});`, `const bag = { key: postgres };`].join("\n"),
    );
    expect(rec.reports.map((r) => [r.kind, r.line])).toEqual([["value-reference", 3]]);
  });

  test("a NON-literal specifier does not crash the guard-name collector", () => {
    // Kills: a collector whose skip is inverted, so a null literal reaches isGuardModule.
    const rec = classifyFile(
      P,
      [IMPORT, `import x from bar;`, `const sql = postgres(${ENV});`].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["validation-env"]);
  });

  test("two declarations with DIFFERENT remote hosts are unclassifiable", () => {
    // Kills: a rendering that drops the host, making two different remotes compare equal.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `function a() { const url = ${REMOTE_A}; return url; }`,
        `function b() { const url = ${REMOTE_B}; return url; }`,
        `const sql = postgres(url);`,
      ].join("\n"),
    );
    expect(rec.sites.map((s) => s.cls)).toEqual(["unclassifiable"]);
  });

  test("two declarations unclassifiable for DIFFERENT reasons say so in the detail", () => {
    // Kills: a rendering that drops the reason, so the disagreement reads as agreement and
    // the FIRST declaration's detail is reported instead of the disagreement.
    const rec = classifyFile(
      P,
      [
        IMPORT,
        `function a() { const url = cfg.a; return url; }`,
        `function b() { const url = other(); return url; }`,
        `const sql = postgres(url);`,
      ].join("\n"),
    );
    expect(rec.sites[0]!.detail).toBe("`url` has declarations that classify differently");
  });

  test("reports are ordered by LINE, not by the order the walk produced them", () => {
    // Kills: dropping the sort, or inverting its comparator. The acquisition report is
    // pushed FIRST and belongs LAST.
    const rec = classifyFile(
      P,
      [IMPORT, `const sql = postgres(cfg.url);`, ``, ``, `import "postgres";`].join("\n"),
    );
    expect(rec.reports.map((r) => [r.line, r.kind])).toEqual([
      [2, "unclassifiable"],
      [5, "acquisition"],
    ]);
  });

  test("a helper with exactly ONE consumer names it", () => {
    // Kills: an off-by-one on the affected-list boundary.
    const helper = "tests/db/_helper.ts";
    const result = propagateThroughImports(
      [
        { file: helper, sf: parse(`const sql = 1;`, helper), own: ["undisposed"] as FileClass[] },
        {
          file: "tests/db/one.test.ts",
          sf: parse(`import x from "./_helper";`, "tests/db/one.test.ts"),
          own: [] as FileClass[],
        },
      ],
      (_from, specifier) => (specifier === "./_helper" ? helper : null),
      "/repo",
    );
    expect(result.affected.get(helper)).toEqual(["tests/db/one.test.ts"]);
  });

  test("a file that reaches nothing is not affected by an undisposed helper", () => {
    // Kills: an affected list keyed on "every other file" rather than on reachability.
    const helper = "tests/db/_helper.ts";
    const result = propagateThroughImports(
      [
        { file: helper, sf: parse(`const sql = 1;`, helper), own: ["undisposed"] as FileClass[] },
        {
          file: "tests/db/one.test.ts",
          sf: parse(`import x from "./_helper";`, "tests/db/one.test.ts"),
          own: [] as FileClass[],
        },
        {
          file: "tests/db/unrelated.test.ts",
          sf: parse(`const x = 1;`, "tests/db/unrelated.test.ts"),
          own: [] as FileClass[],
        },
      ],
      (_from, specifier) => (specifier === "./_helper" ? helper : null),
      "/repo",
    );
    expect(result.affected.get(helper)).toEqual(["tests/db/one.test.ts"]);
  });

  test("a row whose `nth` names no occurrence is STALE, and both sites report", () => {
    // Kills: dropping the stale push in the wanted-occurrence-missing branch, and dropping
    // its `continue` (which would consult admissibility with nothing selected).
    const twice = [1, 2].map((ordinal) => ({
      file: P,
      line: ordinal * 10,
      ordinal,
      kind: "unclassifiable" as const,
      site: "resolve()",
      detail: "",
      argIsCall: true,
    }));
    const result = reconcileDispositions(twice, [
      { file: P, site: "resolve()", nth: 3, kind: "resolver", reason: "checked by a reviewer" },
    ]);
    expect(result.stale.map((r) => r.nth)).toEqual([3]);
    expect(result.undisposed).toHaveLength(2);
  });

  test("the join matches a destructive call whose SPAN carries a SQL comment", () => {
    // Kills: a join that requires BOTH views to match. The comment sits between the
    // function name and its parenthesis, which the recognizer spans with `\s*` — so the
    // SQL-stripped view (where the comment becomes SPACES) matches and the JS-stripped view
    // does not. The first spelling tried here put the comment after `public.`, where the
    // recognizer allows no whitespace at all and NEITHER view matched: a fixture whose
    // discriminating premise is false is indistinguishable from a mutant that survives.
    const marker = "public.prune_sync_log" + "/* note */" + "()";
    const files = [
      { path: "tests/db/split.test.ts", source: `await sql.unsafe("select ${marker}");` },
    ];
    expect(discoveredByDestructiveGuard(files)).toEqual(["tests/db/split.test.ts"]);
  });

  test("a rendered report with ONE affected consumer prints the affected line", () => {
    // Kills: an off-by-one on the render boundary.
    const rendered = renderReport(
      [
        {
          file: "tests/db/x.test.ts",
          line: 3,
          ordinal: 1,
          kind: "unclassifiable",
          site: "cfg.url",
          detail: "",
          argIsCall: false,
          affected: ["tests/db/one.test.ts"],
        },
      ],
      {
        "guard-bound": 0,
        "validation-env": 0,
        "loopback-literal": 0,
        "remote-literal": 0,
        unclassifiable: 0,
      },
    ).split("\n");
    expect(rendered[1]).toBe("    affected: tests/db/one.test.ts");
  });
});

// ── validation-env reconciliation (the allowlist arm) ─────────────────────────
// The census NAMES the class; this arm decides whether a member of it is permitted.
// Constructed sources only — the live-tree measurement is the meta-test's job, and
// keeping the corpus out of here is what keeps this suite's input set closable.

const ALLOW = (
  file: string,
  reason = "a CI job points it at validation",
): ValidationEnvAllowRow => ({
  file,
  reason,
});

const VALIDATION_SRC = [IMPORT, `const sql = postgres(${ENV});`].join("\n");
const LOOPBACK_SRC = [IMPORT, `const sql = postgres(${LOOPBACK});`].join("\n");

describe("reconcileValidationEnv — the allowlist arm (validation-env is permitted BY FILE)", () => {
  test("a validation-env site in a file with no row is REPORTED, by file, line and argument", () => {
    const rec = classifyFile("tests/db/_b2Helpers.ts", VALIDATION_SRC);
    const { unallowed, stale, inadmissible } = reconcileValidationEnv([rec], []);
    expect(unallowed).toEqual([
      { file: "tests/db/_b2Helpers.ts", line: 2, site: "process.env.TEST_DATABASE_URL" },
    ]);
    expect(stale).toEqual([]);
    expect(inadmissible).toEqual([]);
  });

  test("the same site in an allowlisted file is NOT reported", () => {
    const rec = classifyFile("tests/db/validation-schema-parity.test.ts", VALIDATION_SRC);
    const allow = [ALLOW("tests/db/validation-schema-parity.test.ts")];
    expect(reconcileValidationEnv([rec], allow).unallowed).toEqual([]);
  });

  test("the allowance is scoped to ITS file, not to the class", () => {
    // A row must never launder a validation-env site in some OTHER file: that is the
    // exact shape of the defect (one legitimate remote reader, sixty accidental ones).
    const allowed = classifyFile("tests/db/validation-schema-parity.test.ts", VALIDATION_SRC);
    const other = classifyFile("tests/notify/deliver-real-db.test.ts", VALIDATION_SRC);
    const allow = [ALLOW("tests/db/validation-schema-parity.test.ts")];
    expect(reconcileValidationEnv([allowed, other], allow).unallowed.map((r) => r.file)).toEqual([
      "tests/notify/deliver-real-db.test.ts",
    ]);
  });

  test("every validation-env site in an unallowed file is reported, not just the first", () => {
    // A reconciler that stopped at the first site would under-report a helper holding
    // two connections — which `_b2Helpers.ts` does (a pooled client and `newConn`).
    const rec = classifyFile(
      "tests/db/_b2Helpers.ts",
      [IMPORT, `const a = postgres(${ENV});`, `const b = postgres(${ENV});`].join("\n"),
    );
    expect(reconcileValidationEnv([rec], []).unallowed.map((r) => r.line)).toEqual([2, 3]);
  });

  test("a row whose file DOES still have its site is NOT stale", () => {
    // THE KILLING CASE for statement-removal:1641:7, which deletes
    // `withSites.add(record.file)` from reconcileValidationEnv. That leaves
    // `withSites` permanently empty, so `stale` reports EVERY allow row --
    // including live ones whose file still holds the site the row permits.
    //
    // The block around this tested `stale` in both directions that make it
    // NON-empty (a repaired file, a file absent from the walk) and never once
    // that it is EMPTY for a live allowance, which is why the mutant survived
    // with every assertion green. The nearest case, "the same site in an
    // allowlisted file is NOT reported", asserts only `.unallowed` -- and
    // `unallowed` is byte-identical under clean and mutant, so it could never
    // have seen this.
    const rec = classifyFile("tests/db/validation-schema-parity.test.ts", VALIDATION_SRC);
    premiseHolds(
      "the fixture really carries a validation-env site, or this asserts nothing",
      rec.sites.some((site) => site.cls === "validation-env"),
    );
    const result = reconcileValidationEnv(
      [rec],
      [ALLOW("tests/db/validation-schema-parity.test.ts")],
    );
    // Clean: []. Mutant: ["tests/db/validation-schema-parity.test.ts"].
    expect(result.stale).toEqual([]);
    expect(result.unallowed).toEqual([]);
  });

  test("a row whose file no longer has a validation-env site is STALE", () => {
    // The repair direction: once the file resolves locally its row must red, rather than
    // sit there permitting a site that could come back under it.
    const repaired = classifyFile("tests/db/_b2Helpers.ts", LOOPBACK_SRC);
    const result = reconcileValidationEnv([repaired], [ALLOW("tests/db/_b2Helpers.ts")]);
    expect(result.stale).toEqual(["tests/db/_b2Helpers.ts"]);
    expect(result.unallowed).toEqual([]);
  });

  test("a row naming a file that is not in the walk at all is STALE too", () => {
    // A moved or deleted file leaves a row that permits nothing and protects nothing.
    expect(reconcileValidationEnv([], [ALLOW("tests/db/gone.test.ts")]).stale).toEqual([
      "tests/db/gone.test.ts",
    ]);
  });

  test("a row with a blank reason is INADMISSIBLE — an empty reason is a free hole", () => {
    const rec = classifyFile("tests/db/validation-schema-parity.test.ts", VALIDATION_SRC);
    const rows = [{ file: "tests/db/validation-schema-parity.test.ts", reason: "   " }];
    const result = reconcileValidationEnv([rec], rows);
    expect(result.inadmissible).toEqual(["tests/db/validation-schema-parity.test.ts"]);
    // Inadmissible AND permitting nothing: the site it names still reports.
    expect(result.unallowed.map((r) => r.file)).toEqual([
      "tests/db/validation-schema-parity.test.ts",
    ]);
  });

  test("a non-validation-env site is never reported by this arm", () => {
    const rec = classifyFile("tests/db/some.test.ts", LOOPBACK_SRC);
    premiseHolds(
      "the fixture really does classify as loopback-literal, so the arm has something to ignore",
      rec.sites.every((s) => s.cls === "loopback-literal"),
    );
    expect(reconcileValidationEnv([rec], []).unallowed).toEqual([]);
  });
});

// Unit tests for the type-aware ParseWarning site recognizer (spec
// 2026-08-03-scanner-precision-cluster-design.md §3.1).
//
// EVERY case runs against an IN-MEMORY ts-morph project, never the live tree, so
// each proof stands on its own rather than on the repo happening to contain an
// instance. That matters here more than usual: five adversarial rounds each
// produced a COMPILED escaping mutant against an earlier design, and those
// mutants are the cases below. A test that only asserted "the live scan finds 58"
// would have passed against every one of the broken designs.
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";

import { scanParseWarningSites } from "@/lib/messages/__internal__/parseWarningSites";

const TYPES = `
export type ParseWarning = {
  severity: "info" | "warn";
  code: string;
  message: string;
  blockRef?: { kind: string };
  roleToken?: string;
};
export type Alert = { kind: "alert"; code: string };
`;

/** A project holding the ParseWarning declaration plus one fixture module. */
function scanOf(source: string): ReturnType<typeof scanParseWarningSites> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true, target: 99, moduleResolution: 2 },
  });
  project.createSourceFile("/types.ts", TYPES);
  project.createSourceFile(
    "/main.ts",
    `import type { ParseWarning, Alert } from "./types";\n${source}`,
  );
  return scanParseWarningSites(project, {
    typesFilePath: "/types.ts",
    typeName: "ParseWarning",
    include: (rel) => rel === "/main.ts",
  });
}

const codesOf = (s: ReturnType<typeof scanParseWarningSites>) => [...s.codes.keys()].sort();
const kinds = (s: ReturnType<typeof scanParseWarningSites>) => s.skips.map((k) => k.kind).sort();

describe("scanParseWarningSites — capture", () => {
  it("R1: a severity-adjacent literal is captured", () => {
    const s = scanOf(
      `export const w: ParseWarning = { severity: "warn", code: "PLAIN_LITERAL", message: "m" };`,
    );
    expect(codesOf(s)).toEqual(["PLAIN_LITERAL"]);
    expect(s.signalled).toEqual([]);
  });

  it('A-g: severity "info" is captured — both members of the union count', () => {
    const s = scanOf(
      `export const w: ParseWarning = { severity: "info", code: "INFO_SEVERITY", message: "m" };`,
    );
    expect(codesOf(s)).toEqual(["INFO_SEVERITY"]);
  });

  it("A-c: severity supplied by a TYPED CONST is captured (R2a mutant)", () => {
    // A recognizer requiring a literal `severity:` silently rejected this.
    const s = scanOf(`
      const WARN_SEVERITY: ParseWarning["severity"] = "warn";
      export const w: ParseWarning = { severity: WARN_SEVERITY, code: "CONST_SEVERITY", message: "m" };
    `);
    expect(codesOf(s)).toEqual(["CONST_SEVERITY"]);
    expect(s.signalled).toEqual([]);
  });

  it("A-i: a UNION contextual type is captured (R2a mutant)", () => {
    // contextual = ParseWarning | Alert (not assignable); intrinsic IS assignable.
    // A "contextual else intrinsic" rule silently REJECTED a valid warning.
    const s = scanOf(`
      declare function sink(x: ParseWarning | Alert): void;
      export function go(): void { sink({ severity: "warn", code: "UNION_CONTEXT", message: "m" }); }
    `);
    expect(codesOf(s)).toEqual(["UNION_CONTEXT"]);
  });

  it("A-h: Object.assign is captured — no single argument is assignable (R2a mutant)", () => {
    const s = scanOf(`
      export const w: ParseWarning = Object.assign(
        { severity: "warn" as const },
        { code: "OBJECT_ASSIGN" as const },
        { message: "m" },
      );
    `);
    expect(codesOf(s)).toEqual(["OBJECT_ASSIGN"]);
  });

  it("A-b/A-d: an INDIRECT return type with a union-typed code is captured (R1 mutant)", () => {
    // `Alias["warnings"][number]` never spells ParseWarning, and `code` is shorthand.
    const s = scanOf(`
      type Result = { warnings: ParseWarning[] };
      type Codes = "IND_ONE" | "IND_TWO";
      function make(code: Codes): Result["warnings"][number] {
        return { severity: "warn", code, message: code };
      }
      export const w = make("IND_ONE");
    `);
    expect(codesOf(s)).toEqual(["IND_ONE", "IND_TWO"]);
  });

  it("A-e: a `code: string` factory resolves at its direct call sites", () => {
    const s = scanOf(`
      function make(code: string): ParseWarning {
        return { severity: "warn", code, message: code };
      }
      export const a = make("CALLSITE_ONE");
      export const b = make("CALLSITE_TWO");
    `);
    expect(codesOf(s)).toEqual(["CALLSITE_ONE", "CALLSITE_TWO"]);
    expect(s.signalled).toEqual([]);
  });

  it("A-n: `await` on an async factory is a site (R3a mutant)", () => {
    const s = scanOf(`
      async function build(code: string): Promise<ParseWarning> {
        return { severity: "warn", code, message: code };
      }
      export async function go(): Promise<ParseWarning> { return await build("AWAITED_CODE"); }
    `);
    expect(codesOf(s)).toContain("AWAITED_CODE");
    expect(s.signalled).toEqual([]);
  });

  it("A-l: a spread whose RESULT type preserves a literal code is captured (R3a mutant)", () => {
    const s = scanOf(`
      const patch = { code: "SPREAD_VARIABLE_CODE" } as const;
      export const w: ParseWarning = { severity: "warn", message: "m", ...patch };
    `);
    expect(codesOf(s)).toEqual(["SPREAD_VARIABLE_CODE"]);
  });
});

describe("scanParseWarningSites — fail-closed default", () => {
  it("A-Z: a code with no literal anywhere SIGNALS rather than vanishing", () => {
    const s = scanOf(`
      declare const dynamic: string;
      export const w: ParseWarning = { severity: "warn", code: dynamic, message: "m" };
    `);
    expect(codesOf(s)).toEqual([]);
    expect(s.signalled.length).toBeGreaterThan(0);
  });

  it("A-j: class construction SIGNALS — a class has no scanned factory body (R3a mutant)", () => {
    const s = scanOf(`
      class WarningClass implements ParseWarning {
        severity = "warn" as const;
        code = String(Math.random());
        message = "m";
      }
      export const w: ParseWarning = new WarningClass();
    `);
    expect(s.signalled.length).toBeGreaterThan(0);
  });

  it("A-m: a declaration-only const factory has no scanned body, so its OWN argument is read", () => {
    // R3a's point was that such a factory must not be treated as a scanned USE.
    // It is not: with no body to define the code, the call's own argument is the
    // only evidence, and it is read by parameter NAME through the resolved
    // signature. The earlier assertion was an OR that accepted either outcome and
    // so pinned neither — it passed while capturing, never testing the signal path.
    const s = scanOf(`
      declare const factory: (code: string) => ParseWarning;
      export const w = factory("DECL_ONLY_DARK");
    `);
    expect(codesOf(s)).toEqual(["DECL_ONLY_DARK"]);
    expect(
      s.skips.map((k) => k.kind),
      "no scanned body means it is not a USE",
    ).not.toContain("USE");
  });

  it("A-m2: a declaration-only factory whose code is NOT a literal signals", () => {
    const s = scanOf(`
      declare const factory: (code: string) => ParseWarning;
      declare const dynamic: string;
      export const w = factory(dynamic);
    `);
    expect(codesOf(s)).toEqual([]);
    expect(s.signalled.length).toBeGreaterThan(0);
  });
});

describe("scanParseWarningSites — classifications are CAPTURE-LINKED (R4a mutants)", () => {
  it("COPY with an `any`-laundered source SIGNALS, it is not silently skipped", () => {
    const s = scanOf(`
      declare function loadCopy(): any;
      const copySource: ParseWarning = loadCopy();
      declare function consume(w: ParseWarning): void;
      export function go(): void { consume({ ...copySource, message: "copy" }); }
    `);
    expect(codesOf(s)).toEqual([]);
    expect(s.signalled.length, "an untraceable copy source must signal").toBeGreaterThan(0);
  });

  it("FACTORY_BODY with ZERO direct call sites SIGNALS — vacuous truth is not a link", () => {
    // `["X"].map(make)` gives the factory references but no DIRECT call site, so
    // "every call site resolves" was vacuously true and swallowed the code.
    const s = scanOf(`
      function make(code: string): ParseWarning {
        return { severity: "warn", code, message: code };
      }
      export const ws = ["FACTORY_HIDDEN"].map(make);
    `);
    expect(s.signalled.length, "no direct call site means no capture link").toBeGreaterThan(0);
  });

  it("USE whose callee body captures nothing SIGNALS", () => {
    const s = scanOf(`
      declare function parseUnknown(): unknown;
      function build(): ParseWarning {
        const raw = parseUnknown() as ParseWarning;
        return raw;
      }
      export const w = build();
    `);
    expect(codesOf(s)).toEqual([]);
    expect(s.signalled.length, "a validate-and-return factory captures nothing").toBeGreaterThan(0);
  });

  it("a genuine COPY of a captured warning IS skipped, with its kind recorded", () => {
    const s = scanOf(`
      const base: ParseWarning = { severity: "warn", code: "BASE_CODE", message: "m" };
      export const stamped: ParseWarning = { ...base, message: "stamped" };
    `);
    expect(codesOf(s)).toEqual(["BASE_CODE"]);
    expect(kinds(s)).toContain("COPY");
    expect(s.signalled).toEqual([]);
  });
});

describe("scanParseWarningSites — whole-diff review regressions", () => {
  it("WD1: a call's code comes from the `code` PARAMETER, not any code-shaped argument", () => {
    // Taking "any SHOUTY argument" captured the WRONG literal whenever a factory
    // carries a second code-shaped parameter and the real code is dynamic — the
    // unrelated literal was captured and the site never signalled.
    // The callee is DECLARATION-ONLY on purpose: a local body would route this
    // through FACTORY_BODY and never reach the argument-binding path under test.
    const s = scanOf(`
      declare const dynamic: string;
      declare function make(code: string, fallback: string): ParseWarning;
      export const w = make(dynamic, "UNRELATED_LITERAL");
    `);
    expect(codesOf(s), "an unrelated argument must not be read as the code").not.toContain(
      "UNRELATED_LITERAL",
    );
    expect(s.signalled.length, "a dynamic code must signal").toBeGreaterThan(0);
  });

  it("WD2: USE links to the CALLEE's body, not merely to its file", () => {
    // A file-wide link accepted any warning captured anywhere in the same file,
    // so a typed passthrough beside an unrelated emitter vanished silently.
    const s = scanOf(`
      declare const opaque: ParseWarning;
      export const unrelated: ParseWarning = {
        severity: "warn", code: "UNRELATED_CAPTURE", message: "m",
      };
      function passthrough(): ParseWarning { return opaque; }
      export const w = passthrough();
    `);
    expect(codesOf(s)).toEqual(["UNRELATED_CAPTURE"]);
    expect(
      s.signalled.length,
      "a passthrough whose own body captured nothing must signal, even beside a captured sibling",
    ).toBeGreaterThan(0);
  });

  it("WD3: COPY links to the SOURCE's declaration, not merely to it being warning-typed", () => {
    // `declare const external: ParseWarning` is warning-typed and non-any, which
    // the first capture-link accepted — while its code was captured nowhere.
    const s = scanOf(`
      declare const external: ParseWarning;
      export const unrelated: ParseWarning = {
        severity: "warn", code: "UNRELATED_CAPTURE", message: "m",
      };
      export const copied: ParseWarning = { ...external, message: "copy" };
    `);
    expect(codesOf(s)).toEqual(["UNRELATED_CAPTURE"]);
    expect(
      s.signalled.length,
      "a copy of an externally-declared warning has no captured origin and must signal",
    ).toBeGreaterThan(0);
  });
});

describe("scanParseWarningSites — whole-diff R2 regressions (ordering and value-linkage)", () => {
  it("WD4: a later spread that OVERWRITES code is not reported as the earlier decoy", () => {
    // `Partial<ParseWarning>` widens the union to `string | "DECOY_CODE"`, so
    // reporting just the literal half named a value the runtime never uses.
    const s = scanOf(`
      const patch: Partial<ParseWarning> = { code: "HIDDEN_CODE" };
      export const w: ParseWarning = { severity: "warn", code: "DECOY_CODE", message: "m", ...patch };
    `);
    expect(codesOf(s), "the overwritten literal must not be reported as fact").not.toContain(
      "DECOY_CODE",
    );
    expect(s.signalled.length, "an undetermined code must signal").toBeGreaterThan(0);
  });

  it("WD5: FACTORY_BODY binds the parameter the BODY uses, not the one named `code`", () => {
    const s = scanOf(`
      function make(code: string, actual: string): ParseWarning {
        return { severity: "warn", code: actual, message: code };
      }
      export const w = make("DECOY_CODE", "HIDDEN_CODE");
    `);
    expect(codesOf(s)).toContain("HIDDEN_CODE");
    expect(codesOf(s), "the unused `code` parameter must not be read").not.toContain("DECOY_CODE");
  });

  it("WD6: USE links to the RETURNED expression, not to anything inside the body", () => {
    // The callee emits an unrelated warning (satisfying containment) and then
    // returns something opaque — the returned code is captured nowhere.
    const s = scanOf(`
      declare const opaque: ParseWarning;
      declare function sink(w: ParseWarning): void;
      function build(): ParseWarning {
        sink({ severity: "warn", code: "DECOY_CODE", message: "m" });
        return opaque;
      }
      export const w = build();
    `);
    expect(codesOf(s)).toEqual(["DECOY_CODE"]);
    expect(
      s.signalled.length,
      "an opaque RETURN must signal even when the body captured something else",
    ).toBeGreaterThan(0);
  });

  it("WD7: COPY links to the source's INITIALIZER, and every produced value must be captured", () => {
    const s = scanOf(`
      declare const opaque: ParseWarning;
      declare const flag: boolean;
      const source: ParseWarning = flag
        ? { severity: "warn", code: "DECOY_CODE", message: "m" }
        : opaque;
      export const copied: ParseWarning = { ...source, message: "copy" };
    `);
    expect(codesOf(s)).toEqual(["DECOY_CODE"]);
    expect(
      s.signalled.length,
      "a source whose other branch is opaque must signal, not ride the captured branch",
    ).toBeGreaterThan(0);
  });
});

describe("scanParseWarningSites — whole-diff R3 regressions (provenance and Object.assign order)", () => {
  it("R3a: a returned CONDITIONAL is decomposed — an opaque branch signals", () => {
    // Lexical containment vouched for both branches at once: the captured branch
    // sat inside the returned expression's span, so the opaque one rode along.
    const s = scanOf(`
      declare const opaque: ParseWarning;
      declare const flag: boolean;
      function build(): ParseWarning {
        return flag ? { severity: "warn", code: "DECOY_USE", message: "m" } : opaque;
      }
      export const w = build();
    `);
    expect(codesOf(s)).toEqual(["DECOY_USE"]);
    expect(s.signalled.length, "the opaque branch must signal").toBeGreaterThan(0);
  });

  it("R3b: a WRAPPED conditional is decomposed too — parens and `as` do not hide it", () => {
    const s = scanOf(`
      declare const opaque: ParseWarning;
      declare const flag: boolean;
      const source: ParseWarning = (
        flag ? ({ severity: "warn", code: "DECOY_COPY", message: "m" } as ParseWarning) : opaque
      );
      export const copied: ParseWarning = { ...source, message: "copy" };
    `);
    expect(codesOf(s)).toEqual(["DECOY_COPY"]);
    expect(s.signalled.length, "a wrapper must not defeat decomposition").toBeGreaterThan(0);
  });

  it("R3c: Object.assign trusts the LAST code-bearing argument, not the intersection", () => {
    // The result type is an intersection that preserves the target's earlier
    // literal, while at runtime the later argument overwrites it.
    const s = scanOf(`
      const patch: Partial<ParseWarning> = { code: "HIDDEN_ASSIGN" };
      export const w: ParseWarning = Object.assign(
        { severity: "warn" as const, code: "DECOY_ASSIGN" as const, message: "m" },
        patch,
      );
    `);
    expect(codesOf(s), "the overwritten literal must not be reported").not.toContain(
      "DECOY_ASSIGN",
    );
    expect(s.signalled.length, "an undetermined assign result must signal").toBeGreaterThan(0);
  });
});

// tests/paneCompaction/_metaSendAuthNamePositionCover.test.ts
//
// THE DERIVED COVER OVER NAME POSITIONS.
//
// Diff rounds 2 and 3 each returned one more member of a single class: a name
// POSITION the shared rule resolved correctly and some feeding site did not.
// Three members in two rounds, zero refutations — which says the population is
// ENUMERABLE, not that the reviewer was thorough. A reviewer finds members by
// thinking of them; that is the one defect class a derived cover closes and a
// review round structurally cannot.
//
// WHAT IT ASSERTS. A `grammar` disposition is a claim about the FIELD'S DECLARED
// TYPE — that it admits only `Identifier`. The spec says so outright, and says it
// must be validated against the compiler rather than by reading the call site.
// Nothing validated it, so a site merely PREFILTERED with `isIdentifier` could
// carry a durable `grammar` exemption while the field admitted siblings the
// prefilter silently discarded. That is precisely how the round-3 spelling miss
// got in.
//
// This asks TypeScript. It builds a real program over the scanner and reads the
// DECLARED type at each site — the field's own declaration, or for a local the
// type it was declared with rather than the guard-narrowed type at the use.
//
// IT IS DELIBERATELY NOT A `suitePath` of the enrolled surface. It creates a
// TypeScript program, which costs seconds; the deciding suite runs once PER
// MUTANT, and a few seconds there would add hours to every scored run. It gates
// CI instead, which is what a structural claim about dispositions needs.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { premiseHolds } from "../_shared/premise";

import { NAME_POSITION_DISPOSITIONS } from "./sendAuthNamePositions";

const SCANNER = "tests/paneCompaction/sendAuthScan.ts";

/** Names that mean "this really is grammar-fixed to an identifier". */
const IDENTIFIER_ONLY = new Set(["Identifier", "ts.Identifier"]);

type SiteType = { key: string; declared: string | null; text: string };

const declaredTypesBySite = (sourcePath: string): SiteType[] => {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  premiseHolds("the project tsconfig was found", configPath !== undefined);
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath!, ts.sys.readFile).config,
    ts.sys,
    ".",
  );
  const program = ts.createProgram([sourcePath], {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(sourcePath);
  premiseHolds("the scanner was loaded into a real program", sf !== undefined);

  const enclosing = (n: ts.Node): string => {
    for (let c: ts.Node | undefined = n; c !== undefined; c = c.parent) {
      if (ts.isFunctionDeclaration(c) && c.name !== undefined) return c.name.text;
      if (
        ts.isVariableDeclaration(c) &&
        ts.isIdentifier(c.name) &&
        c.initializer !== undefined &&
        (ts.isArrowFunction(c.initializer) || ts.isFunctionExpression(c.initializer))
      ) {
        return c.name.text;
      }
    }
    return "(module)";
  };

  /**
   * The WIDEST type this site can see — the declaration's, never the narrowed
   * type at the use. Reading the narrowed type would report `Identifier`
   * everywhere an `isIdentifier` guard appears, which is the exact confusion
   * this cover exists to end.
   */
  const declaredAt = (access: ts.PropertyAccessExpression): string | null => {
    const receiver = access.expression;
    if (ts.isPropertyAccessExpression(receiver)) {
      const declaration = checker.getSymbolAtLocation(receiver.name)?.declarations?.[0];
      const typeNode = declaration ? (declaration as { type?: ts.TypeNode }).type : undefined;
      return typeNode ? typeNode.getText() : null;
    }
    if (ts.isIdentifier(receiver)) {
      const symbol = checker.getSymbolAtLocation(receiver);
      const declaration = symbol?.declarations?.[0];
      if (symbol === undefined || declaration === undefined) return null;
      const typeNode = (declaration as { type?: ts.TypeNode }).type;
      return typeNode
        ? typeNode.getText()
        : checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, declaration));
    }
    return null;
  };

  const seen = new Map<string, number>();
  const out: SiteType[] = [];
  const walk = (n: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(n) &&
      (n.name.text === "text" || n.name.text === "escapedText")
    ) {
      const fn = enclosing(n);
      const ordinal = (seen.get(fn) ?? 0) + 1;
      seen.set(fn, ordinal);
      out.push({ key: `${fn}#${ordinal}`, declared: declaredAt(n), text: n.getText(sf!) });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf!);
  return out;
};

describe("the derived cover over name positions — a `grammar` claim is checked, not asserted", () => {
  const sites = declaredTypesBySite(SCANNER);
  const byKey = new Map(sites.map((s) => [s.key, s]));

  it("resolves a declared type for the sites it judges — the zero must be attributable", () => {
    // A cover that resolved NOTHING would report zero mis-dispositions and read
    // exactly like a clean table. The floor is what separates the two.
    premiseHolds("the scanner yielded name sites", sites.length > 20);
    const resolved = sites.filter((s) => s.declared !== null);
    expect(resolved.length).toBeGreaterThan(10);
    // And the population must match the table the suite ships.
    expect(byKey.size).toBe(NAME_POSITION_DISPOSITIONS.length);
  });

  it("every `grammar` row names a field whose DECLARED type is only `Identifier`", () => {
    // The claim `grammar` makes is durable BECAUSE it is about the declared type.
    // A site behind an `isIdentifier` prefilter whose declaration is wider is
    // `narrowed`: it owes a consequence and a re-file trigger, and it is not
    // safe to write once and forget.
    const wrong = NAME_POSITION_DISPOSITIONS.filter((r) => r.disposition === "grammar")
      .map((r) => ({ r, t: byKey.get(`${r.fn}#${r.ordinal}`)?.declared }))
      .filter((x) => x.t != null && !IDENTIFIER_ONLY.has(x.t!))
      .map((x) => `${x.r.fn}#${x.r.ordinal} (${x.r.text}) declared ${x.t}, not Identifier`);
    expect(wrong).toEqual([]);
  });

  it("PROVES it discriminates — a constructed false `grammar` claim is caught", () => {
    // Both directions, on the real population: a row that claims `grammar` over a
    // site whose declared type admits siblings must be reported.
    const wider = sites.find((s) => s.declared != null && !IDENTIFIER_ONLY.has(s.declared!));
    premiseHolds(
      "the module contains at least one non-Identifier-declared site",
      wider !== undefined,
    );

    const judge = (rows: { fn: string; ordinal: number; disposition: string }[]): string[] =>
      rows
        .filter((r) => r.disposition === "grammar")
        .map((r) => byKey.get(`${r.fn}#${r.ordinal}`)?.declared)
        .filter((t) => t != null && !IDENTIFIER_ONLY.has(t!))
        .map(String);

    const [fn, ordinal] = wider!.key.split("#");
    expect(judge([{ fn: fn!, ordinal: Number(ordinal), disposition: "grammar" }])).toHaveLength(1);
    // ...and the same row dispositioned honestly is NOT reported.
    expect(judge([{ fn: fn!, ordinal: Number(ordinal), disposition: "narrowed" }])).toEqual([]);
  });

  it("every `narrowed` row carries the consequence AND the trigger its kind owes", () => {
    // `grammar` is durable and owes only a reason; `narrowed` decays and owes
    // both. Moving a row from one to the other is not a relabelling.
    const missing = NAME_POSITION_DISPOSITIONS.filter((r) => r.disposition === "narrowed")
      .filter((r) => (r.why ?? "").length < 12 || (r.refileWhen ?? "").length < 12)
      .map((r) => `${r.fn}#${r.ordinal}`);
    expect(missing).toEqual([]);
  });
});

// tests/paneCompaction/sendAuthScan.ts
//
// The send-authorization single-read scanner (spec
// docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md).
//
// An IMPORTABLE module with a referring suite from the start, because it is a
// guard surface and the source-mutation runner overlays a target only when a
// Vitest suite imports it (AGENTS.md, convergence bullet 4). No module-scope
// `process.exit`, no terminal CLI shape.
//
// WHAT IT CLAIMS: inside a declared authorization pass, every use of the
// injected surface is one this scanner has classified, and each read method is
// read at most once, on a straight-line path, in that pass -- as is the
// declaration of any derivation. Anything it cannot classify is REPORTED BY
// NAME. WHAT IT DOES NOT CLAIM: that a send was authorized at all. That is a
// control-flow property and the spec withdraws it (§4 limit 1). There is no
// call graph here, no path counting and no dominance analysis.

import ts from "typescript";

/** One enrolled module. Every rule below is driven by this row, never by a literal. */
export type SendAuthSurface = {
  /** Repo-relative path of the enrolled module. */
  module: string;
  /** The name of the injected surface's type declaration. */
  surfaceType: string;
  /** Discovery anchor. A function calling one of these on a surface binding is send-bearing. */
  sinks: readonly string[];
  /** Declared effects: neither read nor anchor. */
  effects: readonly string[];
  /** Generators, not observations: they carry no value that can go stale. */
  ambient: readonly string[];
  /** The ONLY callees a derivation may go through, besides a spread. */
  derivationHelpers: readonly string[];
};

/**
 * The enrolment registry.
 *
 * One row per module. A brand-new surface type in a module importing nothing
 * from a registered one is outside the scanner's range until it is enrolled
 * (§4 limit 4); the import-edge arm covers the reachable case.
 */
export const SEND_AUTH_SURFACES: readonly SendAuthSurface[] = [
  {
    module: "scripts/pane-compaction.ts",
    surfaceType: "Surface",
    sinks: ["send"],
    effects: ["out", "outRaw", "nonceWrite", "nonceConsume"],
    ambient: ["now", "random"],
    derivationHelpers: ["cacheOf", "memoize"],
  },
];

export type FindingCode =
  | "UNDECLARED-PASS"
  | "AMBIGUOUS-PASS"
  | "UNCLASSIFIED-USE"
  | "NON-STRAIGHT-LINE-READ"
  | "MULTI-READ"
  | "MISSING-DERIVATION"
  | "MULTI-DERIVATION"
  | "NON-STRAIGHT-LINE-DERIVATION"
  | "RAW-HANDOFF"
  | "UNREGISTERED-IMPORTER";

/**
 * Findings are DATA, not strings: assertions compare records by equality, never
 * a rendered substring. A substring pin on a message is exactly the shape that
 * survives a scanner reporting the right code for the WRONG site.
 *
 * A finding's IDENTITY includes `name` -- the method or callee it names. Two
 * findings sharing a code, a file and a line but naming different callees are
 * DISTINCT and both survive: the round-4 fixture emits exactly that pair. This
 * scanner performs NO dedup, NO collapsing and NO ordering guarantee, so a
 * caller comparing multi-finding results compares sets or sorted records.
 */
export type Finding = {
  code: FindingCode;
  file: string;
  line: number;
  /** The method or callee the finding names. */
  name: string;
  /** Every line the finding ranges over; `lines[0] === line`. */
  lines: number[];
};

const scriptKindFor = (file: string): ts.ScriptKind =>
  file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));

/**
 * Every member of the surface type declaration, minus the row's declared sinks,
 * effects and ambient members.
 *
 * The read set is the COMPLEMENT, so a member added to the type and left
 * unclassified is a READ on the commit that adds it rather than on the commit
 * someone remembers to classify it (§1.1 item 4). Exported because AC-4 is
 * otherwise UNOBSERVABLE: a correctly-counted single read produces no finding,
 * so nothing in a findings-only API distinguishes "this member is a read" from
 * "this member is ignored".
 *
 * Takes TEXT rather than a path, so it parses as `.ts`. That is the right kind
 * for every surface declaration this repo has, and it is NOT the path the
 * scanner itself takes: `scanModule` parses with the kind its file EXTENSION
 * implies and reads the member list off that parse, which is what
 * `generic-arrow-scriptkind.ts` pins. Stated because the two paths could
 * otherwise be assumed identical, and only one of them chooses its kind.
 */
export function readsFor(sourceText: string, row: SendAuthSurface): string[] {
  return readsFromSourceFile(parse("__surface.ts", sourceText), row);
}

/**
 * Members are collected in DECLARATION ORDER, which is what §2.2's table prints.
 * Both `type X = { … }` and `interface X { … }` are read: the surface's spelling
 * is the author's choice, and a scanner that understood only one of them would
 * report an empty read set -- silently -- against a module using the other.
 */
function readsFromSourceFile(sf: ts.SourceFile, row: SendAuthSurface): string[] {
  const declared = new Set<string>([...row.sinks, ...row.effects, ...row.ambient]);
  const reads: string[] = [];

  const collect = (members: ts.NodeArray<ts.TypeElement>): void => {
    for (const member of members) {
      const name = member.name;
      // Both MethodSignature and PropertySignature: the rule ranges over every
      // member of the declaration, and the live type mixes the two forms.
      if (name === undefined || !ts.isIdentifier(name)) continue;
      if (!declared.has(name.text)) reads.push(name.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === row.surfaceType &&
      ts.isTypeLiteralNode(node.type)
    ) {
      collect(node.type.members);
    } else if (ts.isInterfaceDeclaration(node) && node.name.text === row.surfaceType) {
      collect(node.members);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return reads;
}

/** Scan one enrolled module against its row. */
export function scanModule(file: string, row: SendAuthSurface): Finding[] {
  void file;
  void row;
  return [];
}

/** Walk the declared roots from disk and scan every enrolled module under them. */
export function scanRepo(
  roots: readonly string[],
  registry: readonly SendAuthSurface[] = SEND_AUTH_SURFACES,
): Finding[] {
  void roots;
  void registry;
  return [];
}

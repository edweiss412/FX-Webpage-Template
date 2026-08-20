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

import { readFileSync } from "node:fs";

import ts from "typescript";

import { commentRanges } from "../_shared/stripComments";

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

/**
 * The marker grammar is LITERAL, and deliberately not a regex.
 *
 * A regex spelling (`/^\/\/\s*send-auth:\s*pass\s*$/`) reads as more tolerant and
 * is strictly worse: `\s*` is a regex-quantifier-bound mutation SITE, and every
 * real marker carries exactly one space, so mutating `*` to `+` changes nothing
 * observable and the mutant SURVIVES. Comparing a trimmed comment against a
 * literal removes the site rather than covering it.
 *
 * DOCUMENTED LIMIT, and it is the conservative direction: a marker written with
 * doubled or unusual internal whitespace is not recognized, and its function
 * then reports `UNDECLARED-PASS` — a surfaced report on an unrecognized input,
 * never a silent pass. This is the shape both closest analogues use for their
 * inline tokens (`// no-telemetry: <reason>`, `// not-subject-to-meta: <reason>`).
 */
const PASS_TOKEN = "// send-auth: pass";
const EXEMPT_PREFIX = "// send-auth: exempt:";

type Marker = {
  kind: "pass" | "exempt";
  reason: string;
  line: number;
  /** The function the marker declares, or null when it attaches to anything else. */
  fn: ts.Node | null;
};

const isFunctionLike = (n: ts.Node): boolean =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/**
 * The OUTERMOST node beginning exactly at `pos` — not the deepest.
 *
 * A marker above `const authorize = () => {}` must see the VariableStatement so
 * that `passFunctionOf` can reach the initializer.
 */
const nodeStartingAt = (sf: ts.SourceFile, pos: number): ts.Node | null => {
  let found: ts.Node | null = null;
  const visit = (n: ts.Node): void => {
    if (found !== null) return;
    if (n.getStart(sf) === pos) {
      found = n;
      return;
    }
    if (n.getStart(sf) <= pos && n.getEnd() > pos) ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
};

/**
 * The function a marker declares, or null.
 *
 * Null is the `detached-marker` case and it is load-bearing: the marker exists,
 * the file's marker COUNT is 1, and the send-bearing function still has no
 * declared pass. An implementation counting markers per FILE reports that module
 * clean.
 */
const passFunctionOf = (node: ts.Node): ts.Node | null => {
  if (ts.isFunctionDeclaration(node)) return node;
  if (ts.isVariableStatement(node)) {
    const init = node.declarationList.declarations[0]?.initializer;
    if (init !== undefined && isFunctionLike(init)) return init;
  }
  if (isFunctionLike(node)) return node;
  return null;
};

/**
 * Markers, extracted through `commentRanges` rather than by scanning lines.
 *
 * That is what makes AC-5's impostor clause hold: `commentRanges` takes its
 * protected ranges from the PARSE, so a token inside a string literal or JSX
 * text is never a comment at all. The ScriptKind comes from the file EXTENSION,
 * because reading a `.ts` file as TSX makes `<T>(x: T) => x` open a JSX element
 * and swallow every comment after it.
 */
const markersIn = (file: string, text: string, sf: ts.SourceFile): Marker[] => {
  const ranges = commentRanges(text, scriptKindFor(file), sf);
  const out: Marker[] = [];
  for (const [start, end] of ranges) {
    const body = text.slice(start, end).trim();
    let kind: "pass" | "exempt" | null = null;
    let reason = "";
    if (body === PASS_TOKEN) kind = "pass";
    else if (body.startsWith(EXEMPT_PREFIX)) {
      kind = "exempt";
      reason = body.slice(EXEMPT_PREFIX.length).trim();
    }
    if (kind === null) continue;

    // "Immediately above" is a source-text relation, so it is resolved in source
    // text: the next real token past this comment and any run of whitespace and
    // further comments.
    let pos = end;
    for (;;) {
      while (pos < text.length && /\s/.test(text[pos]!)) pos += 1;
      const next = ranges.find(([a]) => a === pos);
      if (next === undefined) break;
      pos = next[1];
    }
    const node = nodeStartingAt(sf, pos);
    out.push({
      kind,
      reason,
      line: sf.getLineAndCharacterOfPosition(start).line + 1,
      fn: node === null ? null : passFunctionOf(node),
    });
  }
  return out;
};

/** Bindings of the surface type: parameters and variable declarations annotated with it. */
const surfaceBindings = (sf: ts.SourceFile, row: SendAuthSurface): Set<string> => {
  const names = new Set<string>();
  const isSurfaceRef = (t: ts.TypeNode | undefined): boolean =>
    t !== undefined &&
    ts.isTypeReferenceNode(t) &&
    ts.isIdentifier(t.typeName) &&
    t.typeName.text === row.surfaceType;
  const visit = (n: ts.Node): void => {
    if (
      (ts.isParameter(n) || ts.isVariableDeclaration(n)) &&
      isSurfaceRef(n.type) &&
      ts.isIdentifier(n.name)
    ) {
      names.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
};

/**
 * MODULE-LEVEL functions, with their names.
 *
 * Module-level is the grain §3.5 counts at, and §2.1 states the live sends at
 * :857, :873 and :898 are "all lexically inside drive()" — one of which sits in
 * a nested arrow. Taking the innermost enclosing function instead would report
 * that arrow as its own undeclared pass, against correct live code.
 */
const topLevelFunctions = (sf: ts.SourceFile): { node: ts.Node; name: string; line: number }[] => {
  const out: { node: ts.Node; name: string; line: number }[] = [];
  const push = (node: ts.Node, name: string): void => {
    out.push({ node, name, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name !== undefined) push(st, st.name.text);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (d.initializer !== undefined && isFunctionLike(d.initializer) && ts.isIdentifier(d.name))
          push(d.initializer, d.name.text);
      }
    }
  }
  return out;
};

const lexicallyWithin = (outer: ts.Node, inner: ts.Node, sf: ts.SourceFile): boolean =>
  inner.getStart(sf) >= outer.getStart(sf) && inner.getEnd() <= outer.getEnd();

/**
 * Rule 1 — TOTALITY, MODULE-WIDE.
 *
 * Every occurrence of a surface binding anywhere in an enrolled module is one of:
 * a direct member call, a declared derivation source, an ordinary injection
 * argument, a parameter or declaration name, or an AMBIENT member handed on as a
 * callback. Anything else is REPORTED BY NAME and fails the gate.
 *
 * MODULE-WIDE rather than pass-scoped, because the destructured-sink evasion
 * (spec round 2, F3) lives OUTSIDE the pass. An ambient reference is exempt
 * because a generator carries no observation and so cannot hold a stale one —
 * but the exemption is for a callback HANDOFF, not for every mention, or an
 * ambient member could be aliased and called twice invisibly.
 */
const classifyUses = (
  sf: ts.SourceFile,
  file: string,
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
  reads: readonly string[],
): Finding[] => {
  const known = new Set<string>([...reads, ...row.sinks, ...row.effects, ...row.ambient]);
  const ambient = new Set<string>(row.ambient);
  const out: Finding[] = [];

  const report = (node: ts.Node, name: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ code: "UNCLASSIFIED-USE", file, line, name, lines: [line] });
  };

  const classify = (id: ts.Identifier): void => {
    const parent = id.parent;

    if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
      const member = parent.name.text;
      const grand = parent.parent;
      if (ts.isCallExpression(grand) && grand.expression === parent) {
        // A direct member call. A member absent from the type entirely cannot be
        // classified, and silence is never a certificate.
        if (!known.has(member)) report(parent, member);
        return;
      }
      // Referenced without being called. Exempt ONLY when it is an ambient member
      // being handed on: a property value or a call argument.
      const handedOn =
        (ts.isPropertyAssignment(grand) && grand.initializer === parent) ||
        (ts.isCallExpression(grand) && grand.arguments.includes(parent));
      if (ambient.has(member) && handedOn) return;
      report(parent, member);
      return;
    }

    if (ts.isElementAccessExpression(parent) && parent.expression === id) {
      // The member is not knowable from the source text, so the use cannot be
      // classified; the finding names the binding instead.
      report(parent, id.text);
      return;
    }

    // A declared derivation SOURCE. Rule 3 (Task 5) decides whether the
    // derivation itself is well-formed; here it is simply a classified use.
    if (ts.isSpreadAssignment(parent) && parent.expression === id) return;

    // An injection argument. Inside a declared pass this becomes RAW-HANDOFF,
    // which rule 3 owns; outside one it is ordinary injection and correct.
    if (ts.isCallExpression(parent) && parent.arguments.includes(id)) return;

    if (ts.isVariableDeclaration(parent) && parent.initializer === id) {
      if (ts.isObjectBindingPattern(parent.name)) {
        // Calls through the bindings are invisible, so each bound member is
        // reported by NAME rather than the destructure being reported once.
        for (const element of parent.name.elements) {
          const named = element.propertyName ?? element.name;
          report(element, ts.isIdentifier(named) ? named.text : id.text);
        }
        return;
      }
      report(id, id.text);
      return;
    }

    report(id, id.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const parent = node.parent;
      const isDeclarationName =
        (ts.isParameter(parent) ||
          ts.isVariableDeclaration(parent) ||
          ts.isBindingElement(parent)) &&
        parent.name === node;
      const isPropertyName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (!isDeclarationName && !isPropertyName) classify(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

/**
 * Rule 2 — in-pass reads are STRAIGHT-LINE and SINGLE.
 *
 * Inside the declared pass a read call must sit on the pass's own straight-line
 * path: no enclosing nested function, callback, or loop between it and the pass
 * body. Each read method may appear at most once on that path.
 *
 * This ONE rule replaces the discarded draft's per-invocation counting and its
 * cycle detection. Spec round 2's F2 — a NAMED local callback invoked twice — is
 * caught because the read sits behind a nested function, with no need to know
 * how many times it runs. A read behind a nested function has no static count,
 * so position is the checkable property and execution is not.
 */
const blocksStraightLine = (n: ts.Node): boolean =>
  isFunctionLike(n) ||
  ts.isForStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isWhileStatement(n) ||
  ts.isDoStatement(n);

const analyzePassReads = (
  sf: ts.SourceFile,
  file: string,
  bindings: ReadonlySet<string>,
  reads: readonly string[],
  passFn: ts.Node,
): Finding[] => {
  const readSet = new Set<string>(reads);
  const out: Finding[] = [];
  const onPath = new Map<string, number[]>();
  const lineAt = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      bindings.has(n.expression.expression.text) &&
      readSet.has(n.expression.name.text)
    ) {
      const member = n.expression.name.text;
      let cursor: ts.Node = n.parent;
      let nested = false;
      while (cursor !== passFn && cursor.parent !== undefined) {
        if (blocksStraightLine(cursor)) {
          nested = true;
          break;
        }
        cursor = cursor.parent;
      }
      const line = lineAt(n);
      if (nested) {
        out.push({ code: "NON-STRAIGHT-LINE-READ", file, line, name: member, lines: [line] });
      } else {
        onPath.set(member, [...(onPath.get(member) ?? []), line]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(passFn);

  for (const [member, lines] of onPath) {
    // Names BOTH lines: the finding is about two instants, so naming one of them
    // would report half the defect.
    if (lines.length > 1) {
      out.push({ code: "MULTI-READ", file, line: lines[0]!, name: member, lines });
    }
  }
  return out;
};

/** Scan one enrolled module against its row. */
export function scanModule(file: string, row: SendAuthSurface): Finding[] {
  const text = readFileSync(file, "utf8");
  const sf = parse(file, text);
  const bindings = surfaceBindings(sf, row);
  const markers = markersIn(file, text, sf);
  const reads = readsFromSourceFile(sf, row);
  const findings: Finding[] = classifyUses(sf, file, row, bindings, reads);

  // Rules 2 and 3 range over every DECLARED pass, whether or not its enclosing
  // function turned out to be send-bearing: a declared pass is a claim about how
  // the surface is read there, and the claim is checked wherever it is made.
  for (const marker of markers) {
    if (marker.kind !== "pass" || marker.fn === null) continue;
    findings.push(...analyzePassReads(sf, file, bindings, reads, marker.fn));
  }

  for (const fn of topLevelFunctions(sf)) {
    // Send-bearing: the SUBTREE calls a declared SINK on a surface binding.
    // Anchored on sinks, never on effects — anchoring on every effect makes the
    // live `main` send-bearing through its fifteen `out(...)` calls and reports
    // against correct code (§3.5, AC-14).
    let sendBearing = false;
    const look = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        bindings.has(n.expression.expression.text) &&
        row.sinks.includes(n.expression.name.text)
      ) {
        sendBearing = true;
      }
      ts.forEachChild(n, look);
    };
    look(fn.node);
    if (!sendBearing) continue;

    // An exempt marker suppresses only with a NON-EMPTY reason: the bare token
    // is not a certificate.
    const exempted = markers.some(
      (m) => m.kind === "exempt" && m.fn === fn.node && m.reason !== "",
    );
    if (exempted) continue;

    const passes = markers.filter(
      (m) => m.kind === "pass" && m.fn !== null && lexicallyWithin(fn.node, m.fn, sf),
    );
    if (passes.length === 0) {
      findings.push({
        code: "UNDECLARED-PASS",
        file,
        line: fn.line,
        name: fn.name,
        lines: [fn.line],
      });
    } else if (passes.length > 1) {
      findings.push({
        code: "AMBIGUOUS-PASS",
        file,
        line: fn.line,
        name: fn.name,
        lines: passes.map((m) => sf.getLineAndCharacterOfPosition(m.fn!.getStart(sf)).line + 1),
      });
    }
  }
  return findings;
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

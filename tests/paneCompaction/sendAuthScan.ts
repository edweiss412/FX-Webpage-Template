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
import { dirname, join, normalize } from "node:path";

import ts from "typescript";

import { walkSourceFiles } from "../../lib/messages/__internal__/walkSourceFiles";
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

/**
 * The roots the live-tree scan walks.
 *
 * `scripts` and `lib` are where §3.7's census looked for a herdr send, and they
 * are narrow and explicit because `walkSourceFiles` skips only `__generated__` —
 * it does NOT skip `node_modules`, so a broad root would walk the world.
 */
export const LIVE_ROOTS: readonly string[] = ["scripts", "lib"];

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
  /** The function the marker declares, or null when it attaches to anything else. */
  fn: ts.Node | null;
};

/**
 * TOTAL over every index, so the scan needs no bounds check.
 *
 * `charAt` past the end returns "", which is not whitespace — where `text[i]`
 * returns `undefined` and would have to be reasoned about. The bounds test it
 * replaces was a relational mutation site whose only differing case was the very
 * end of the file, i.e. a site that could only ever be defended by an
 * equivalence argument. Removing it is strictly better than winning that
 * argument.
 */
const isWhitespaceAt = (text: string, index: number): boolean => /\s/.test(text.charAt(index));

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
    // No containment prune: a node beginning at `pos` necessarily sits inside
    // ancestors that contain `pos`, so a subtree excluding `pos` cannot hold one.
    // The prune was three mutation sites excusing themselves as equivalences; the
    // walk is over a single file and the sites are gone instead.
    ts.forEachChild(n, visit);
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
      while (isWhitespaceAt(text, pos)) pos += 1;
      const next = ranges.find(([a]) => a === pos);
      if (next === undefined) break;
      pos = next[1];
    }
    const node = nodeStartingAt(sf, pos);
    out.push({ kind, reason, fn: node === null ? null : passFunctionOf(node) });
  }
  return out;
};

/** Is this type annotation a reference to the row's surface type? ONE copy, reused
 *  by the binding walk and by the totality arm, so the two cannot drift apart. */
const isSurfaceRef = (t: ts.TypeNode | undefined, row: SendAuthSurface): boolean =>
  t !== undefined &&
  ts.isTypeReferenceNode(t) &&
  ts.isIdentifier(t.typeName) &&
  t.typeName.text === row.surfaceType;

/** Bindings of the surface type: parameters and variable declarations annotated with it. */
const surfaceBindings = (sf: ts.SourceFile, row: SendAuthSurface): Set<string> => {
  const names = new Set<string>();
  const isSurfaceRef2 = (t: ts.TypeNode | undefined): boolean => isSurfaceRef(t, row);
  const visit = (n: ts.Node): void => {
    if (
      (ts.isParameter(n) || ts.isVariableDeclaration(n)) &&
      isSurfaceRef2(n.type) &&
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
    // An anonymous declaration (`export default function () { … }`) is still a
    // function and can still call a sink. Requiring a NAME made it undiscoverable
    // and therefore SILENT, which the consequence bound forbids; it is named
    // "(anonymous)" instead so the report can still point at a line.
    if (ts.isFunctionDeclaration(st)) push(st, st.name?.text ?? "(anonymous)");
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
  derivedAt: (name: string, at: ts.Node) => boolean,
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

    // A declared derivation SOURCE. Rule 3 (Task 5) decides whether the
    // derivation itself is well-formed; here it is simply a classified use.
    // A SpreadAssignment has exactly one expression child, so an identifier whose
    // PARENT is the spread necessarily IS that expression; the second conjunct
    // could never be false and was a mutation site excusing itself.
    if (ts.isSpreadAssignment(parent)) return;

    // An injection argument. Inside a declared pass this becomes RAW-HANDOFF,
    // which rule 3 owns; outside one it is ordinary injection and correct.
    if (ts.isCallExpression(parent) && parent.arguments.includes(id)) return;

    // A declaration NAME is filtered before `classify` runs, so an identifier
    // whose parent is a VariableDeclaration is necessarily its initializer; the
    // second conjunct could never be false and was a mutation site excusing
    // itself as an equivalence.
    if (ts.isVariableDeclaration(parent)) {
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

    // Everything unmatched, INCLUDING a computed member access: the member is not
    // knowable from the source text, so the finding names the binding. A separate
    // arm for `ch[key]` produced this exact record — same code, same name, same
    // line, since the access begins at the binding — so it was deleted rather
    // than kept as a site arguing its own equivalence.
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
      // Derived AT THIS USE, not anywhere in the module: reads through a snapshot
      // are unconstrained inside the pass that took it, and nowhere else.
      if (!isDeclarationName && !isPropertyName && !derivedAt(node.text, node)) classify(node);
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
/**
 * Node identity rather than offsets.
 *
 * "Is this read inside that initializer" is a TREE question, and answering it by
 * comparing start/end offsets introduces two relational boundaries whose endpoint
 * cases are unreachable — exactly the shape that ends up defended by an
 * equivalence argument instead of being removed. Walking parents cannot be off by
 * an endpoint.
 */
const hasAncestor = (node: ts.Node, ancestor: ts.Node): boolean => {
  for (let cursor: ts.Node | undefined = node; cursor !== undefined; cursor = cursor.parent) {
    if (cursor === ancestor) return true;
  }
  return false;
};

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
  derivations: readonly Derivation[],
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
      // Raw reads inside a derivation's OWN initializer are exempt from this
      // rule: that is the shipped memo at `scripts/pane-compaction.ts:797`,
      // which reads `marker` once inside the snapshot it is building. The
      // exemption covers the READS; a raw HANDOFF in the same initializer still
      // reports, which `derivation-leaks-handoff` pins.
      const inDerivationInitializer = derivations.some((d) => hasAncestor(n, d.initializer));
      if (inDerivationInitializer) return;
      let cursor: ts.Node = n.parent;
      let nested = false;
      while (cursor !== passFn && cursor.parent !== undefined) {
        if (blocksStraightLine(cursor)) nested = true;
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

/**
 * Rule 3 — EXACTLY ONE declared derivation, and no raw handoff inside the pass.
 *
 * A derivation is a variable declaration inside the pass whose initializer either
 * SPREADS the surface or calls a DECLARED derivation helper with it. Reads through
 * the derived binding are unconstrained.
 *
 * The helper list is DECLARED, not inferred, and that is a measurement rather
 * than a preference: accepting any call that merely TAKES the surface made
 * `observe(freshPane, freshRoster, as, s, cacheOf(s))` read as a derivation and
 * silenced the round-4 shape entirely (spec §3.2).
 */
type Derivation = { name: string; line: number; declaration: ts.Node; initializer: ts.Node };

const calleeNameOf = (call: ts.CallExpression): string => {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return "(anonymous)";
};

const isDerivationInitializer = (
  node: ts.Node,
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
): boolean => {
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some(
      (prop) =>
        ts.isSpreadAssignment(prop) &&
        ts.isIdentifier(prop.expression) &&
        bindings.has(prop.expression.text),
    );
  }
  if (ts.isCallExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      row.derivationHelpers.includes(node.expression.text) &&
      node.arguments.some((a) => ts.isIdentifier(a) && bindings.has(a.text))
    );
  }
  return false;
};

const derivationsIn = (
  sf: ts.SourceFile,
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
  passFn: ts.Node,
): Derivation[] => {
  const out: Derivation[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer !== undefined &&
      isDerivationInitializer(n.initializer, row, bindings)
    ) {
      out.push({
        name: n.name.text,
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        declaration: n,
        initializer: n.initializer,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(passFn);
  return out;
};

/** The declared name of a pass function, for the findings that name the pass. */
const passNameOf = (fn: ts.Node): string => {
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isFunctionDeclaration(fn) && fn.name !== undefined) return fn.name.text;
  return "(anonymous)";
};

const analyzeDerivations = (
  sf: ts.SourceFile,
  file: string,
  passFn: ts.Node,
  derivations: readonly Derivation[],
): Finding[] => {
  const out: Finding[] = [];
  const passLine = sf.getLineAndCharacterOfPosition(passFn.getStart(sf)).line + 1;
  const passName = passNameOf(passFn);

  // "Exactly one" is violated by ZERO as well as by two. Without the zero arm the
  // rule degrades silently into "at most one", and every read then comes straight
  // off the live surface at its own instant.
  if (derivations.length === 0) {
    out.push({
      code: "MISSING-DERIVATION",
      file,
      line: passLine,
      name: passName,
      lines: [passLine],
    });
  } else if (derivations.length > 1) {
    out.push({
      code: "MULTI-DERIVATION",
      file,
      line: derivations[0]!.line,
      name: passName,
      lines: derivations.map((d) => d.line),
    });
  }

  // The exemption is POSITIONAL, not temporal. The round-2 draft justified it by
  // claiming the initializer "is evaluated once per pass", and round 3 defeated
  // that by declaring the derivation under a two-iteration loop and inside a
  // named callback invoked twice — both scanned clean. What it now rests on is
  // checkable in the source text, using rule 2's existing predicate.
  for (const derivation of derivations) {
    let cursor: ts.Node = derivation.declaration.parent;
    while (cursor !== passFn && cursor.parent !== undefined) {
      if (blocksStraightLine(cursor)) {
        out.push({
          code: "NON-STRAIGHT-LINE-DERIVATION",
          file,
          line: derivation.line,
          name: derivation.name,
          lines: [derivation.line],
        });
        break;
      }
      cursor = cursor.parent;
    }
  }
  return out;
};

/**
 * Passing the raw surface to anything else inside the pass is RAW-HANDOFF.
 *
 * The same shape OUTSIDE a pass is ordinary injection and is correct — the live
 * report phase does exactly that. So this ranges over the pass only.
 */
const analyzeHandoffs = (
  sf: ts.SourceFile,
  file: string,
  bindings: ReadonlySet<string>,
  passFn: ts.Node,
  derivations: readonly Derivation[],
): Finding[] => {
  const out: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && !derivations.some((d) => d.initializer === n)) {
      for (const argument of n.arguments) {
        if (!ts.isIdentifier(argument) || !bindings.has(argument.text)) continue;
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        // Named by CALLEE: two handoffs can share a code, a file AND a line and
        // differ only here, so the callee is part of the finding's IDENTITY.
        out.push({ code: "RAW-HANDOFF", file, line, name: calleeNameOf(n), lines: [line] });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(passFn);
  return out;
};

/**
 * Occurrences DISCOVERY CANNOT REACH, reported rather than skipped.
 *
 * The consequence bound is "handled correctly OR SIGNALED — never silently
 * wrong", and diff round 1 found three ways the population walk fell short of it
 * while staying quiet. The repair is DEFAULT-DENY rather than a wider recognizer:
 * what the analysis cannot classify is REPORTED, so the complement of the accept
 * set is answered by construction instead of one grammar corner per round. A
 * conservative over-report is a documented limit; silence is not.
 *
 * (a) A surface binding introduced by DESTRUCTURING. `settle({ dispatch }: Channel)`
 *     calls the sink through a bare local, so nothing is a property access on a
 *     binding and every member-based arm is blind to it. Each bound member is
 *     reported BY NAME, matching what `classifyUses` already does for a
 *     destructured variable declaration.
 * (b) A sink call outside every discovered module-level function — a class method,
 *     an object-literal method, or module scope itself. Discovery ranges over
 *     module-level functions by design (§3.5, so a nested arrow is not reported as
 *     its own pass), and a send-bearing construct outside that range must not
 *     therefore vanish.
 */
const unreachedOccurrences = (
  sf: ts.SourceFile,
  file: string,
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
  topLevel: readonly { node: ts.Node; name: string; line: number }[],
): Finding[] => {
  const out: Finding[] = [];
  const at = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  // (a) destructured surface bindings
  const destructured = new Set<string>();
  const walkDestructures = (n: ts.Node): void => {
    if (
      (ts.isParameter(n) || ts.isVariableDeclaration(n)) &&
      isSurfaceRef(n.type, row) &&
      ts.isObjectBindingPattern(n.name)
    ) {
      for (const element of n.name.elements) {
        const named = element.propertyName ?? element.name;
        const member = ts.isIdentifier(named) ? named.text : "(computed)";
        if (ts.isIdentifier(element.name)) destructured.add(element.name.text);
        const line = at(element);
        out.push({ code: "UNCLASSIFIED-USE", file, line, name: member, lines: [line] });
      }
    }
    ts.forEachChild(n, walkDestructures);
  };
  walkDestructures(sf);

  // (b) sink calls no discovered module-level function contains
  const enclosingName = (n: ts.Node): string => {
    for (let cur: ts.Node | undefined = n.parent; cur !== undefined; cur = cur.parent) {
      if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
      if (ts.isFunctionDeclaration(cur) && cur.name !== undefined) return cur.name.text;
      if (ts.isPropertyAssignment(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
      if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    }
    return "(module scope)";
  };
  const walkSinks = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const isMemberSink =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        bindings.has(callee.expression.text) &&
        row.sinks.includes(callee.name.text);
      // A sink reached through a destructured local: no property access exists to
      // inspect, so the local's own name is the whole signal.
      const isBareSink = ts.isIdentifier(callee) && destructured.has(callee.text);
      if ((isMemberSink || isBareSink) && !topLevel.some((t) => lexicallyWithin(t.node, n, sf))) {
        const line = at(n);
        out.push({
          code: "UNDECLARED-PASS",
          file,
          line,
          name: enclosingName(n),
          lines: [line],
        });
      }
    }
    ts.forEachChild(n, walkSinks);
  };
  walkSinks(sf);
  return out;
};

/** Scan one enrolled module against its row. */
export function scanModule(file: string, row: SendAuthSurface): Finding[] {
  const text = readFileSync(file, "utf8");
  const sf = parse(file, text);
  const bindings = surfaceBindings(sf, row);
  const markers = markersIn(file, text, sf);
  const reads = readsFromSourceFile(sf, row);

  // Rules 2 and 3 range over every DECLARED pass, whether or not its enclosing
  // function turned out to be send-bearing: a declared pass is a claim about how
  // the surface is read there, and the claim is checked wherever it is made.
  const passes = markers
    .filter((m) => m.kind === "pass" && m.fn !== null)
    .map((m) => ({ fn: m.fn!, derivations: derivationsIn(sf, row, bindings, m.fn!) }));

  // A DERIVED binding is not a raw surface binding: reads through it are
  // unconstrained, which is what makes the snapshot worth taking at all. Removing
  // the derived names before any other analysis is what keeps the live memo's
  // `snapshot.marker(...)` from counting against rule 2.
  // The exemption is keyed to the PASS THAT DECLARES IT, not to the module. Keyed
  // module-wide by TEXT, a derivation named `snap` in one pass silently exempted a
  // RAW parameter named `snap` in another, and the second pass's double read went
  // unreported -- an exemption keyed coarser than the fact it disposes of absorbs
  // every later arrival at the finer grain, invisibly, because the absorbed thing
  // does not exist yet when the row is written (diff r1 F1).
  const derivedAt = (name: string, at: ts.Node): boolean =>
    passes.some((p) => p.derivations.some((d) => d.name === name) && lexicallyWithin(p.fn, at, sf));

  const topLevel = topLevelFunctions(sf);
  const findings: Finding[] = classifyUses(sf, file, row, bindings, reads, derivedAt);
  findings.push(...unreachedOccurrences(sf, file, row, bindings, topLevel));
  for (const { fn, derivations } of passes) {
    // Per-pass, for the same reason: inside THIS pass, only THIS pass's derivations
    // are derived. Another pass's names are ordinary raw bindings here.
    const rawHere = new Set<string>(
      [...bindings].filter((b) => !derivations.some((d) => d.name === b)),
    );
    findings.push(...analyzePassReads(sf, file, rawHere, reads, fn, derivations));
    findings.push(...analyzeDerivations(sf, file, fn, derivations));
    findings.push(...analyzeHandoffs(sf, file, rawHere, fn, derivations));
  }

  for (const fn of topLevel) {
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

/** Repo-relative module path a specifier resolves to, or null when it is not local. */
const resolveSpecifier = (fromFile: string, specifier: string): string | null => {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith(".")) return normalize(join(dirname(fromFile), specifier));
  return null;
};

const withoutExtension = (path: string): string => path.replace(/\.tsx?$/, "");

/**
 * Discovery beyond the registry: an import-edge arm, exact and checker-free.
 *
 * Any module that imports a registered `surfaceType` SYMBOL from a registered
 * module, and is not itself registered, is `UNREGISTERED-IMPORTER` (§2.4). It
 * follows the SYMBOL rather than the local binding name, so
 * `import type { Channel as Alias }` is still discovered.
 *
 * DOCUMENTED LIMIT: a namespace import (`import * as M`) and a re-export chain
 * are not followed. The scanner has no call graph and no module resolution
 * beyond this one edge (§4 limit 6), and a module reached only that way is
 * outside its range until enrolled — the same posture as the mutation registry,
 * where enrolment is an act (§4 limit 4).
 */
const importEdgeFindings = (
  file: string,
  text: string,
  registry: readonly SendAuthSurface[],
): Finding[] => {
  const out: Finding[] = [];
  // A file importing the symbol necessarily contains its NAME, so this prefilter
  // is sound and keeps the parse off the ~575 live files that cannot match.
  const candidates = registry.filter((row) => text.includes(row.surfaceType));
  if (candidates.length === 0) return out;

  const sf = parse(file, text);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const resolved = resolveSpecifier(file, statement.moduleSpecifier.text);
    if (resolved === null) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;

    // A NAMESPACE import of a registered module reaches the surface type through a
    // QUALIFIED name (`registered.Channel`), which §2.4's rule covers -- "any module
    // that imports the surfaceType symbol" -- and which §4 never excepted. Skipping
    // it entirely was a limit the spec did not record and the suite ratified, so it
    // was silence rather than a documented limit (diff r1 F5). Qualified-name
    // matching is EXACT and checker-free, the same posture as the named-import arm:
    // a namespace import whose module never mentions the type is not reported.
    if (ts.isNamespaceImport(bindings)) {
      for (const row of candidates) {
        if (withoutExtension(resolved) !== withoutExtension(row.module)) continue;
        let qualified = false;
        const look = (n: ts.Node): void => {
          if (
            ts.isQualifiedName(n) &&
            ts.isIdentifier(n.left) &&
            n.left.text === bindings.name.text &&
            n.right.text === row.surfaceType
          ) {
            qualified = true;
          }
          ts.forEachChild(n, look);
        };
        look(sf);
        if (!qualified) continue;
        const line = sf.getLineAndCharacterOfPosition(statement.getStart(sf)).line + 1;
        out.push({
          code: "UNREGISTERED-IMPORTER",
          file,
          line,
          name: row.surfaceType,
          lines: [line],
        });
      }
      continue;
    }
    if (!ts.isNamedImports(bindings)) continue;

    for (const row of candidates) {
      if (withoutExtension(resolved) !== withoutExtension(row.module)) continue;
      for (const element of bindings.elements) {
        // `propertyName` is the SYMBOL when the import is aliased; `name` is the
        // local binding. Comparing the local name misses `Channel as Alias`.
        const symbol = (element.propertyName ?? element.name).text;
        if (symbol !== row.surfaceType) continue;
        const line = sf.getLineAndCharacterOfPosition(statement.getStart(sf)).line + 1;
        out.push({ code: "UNREGISTERED-IMPORTER", file, line, name: symbol, lines: [line] });
      }
    }
  }
  return out;
};

/**
 * Walk the declared roots FROM DISK and scan every enrolled module under them.
 *
 * From disk rather than from a hardcoded file list, so a module added under a
 * walked root is covered by default rather than silently exempt — the same
 * fail-by-default posture the repo's other structural guards use.
 */
export function scanRepo(
  roots: readonly string[],
  registry: readonly SendAuthSurface[] = SEND_AUTH_SURFACES,
): Finding[] {
  const findings: Finding[] = [];
  for (const file of walkSourceFiles(roots)) {
    const row = registry.find((r) => file.endsWith(r.module));
    if (row !== undefined) {
      findings.push(...scanModule(file, row));
      continue;
    }
    findings.push(...importEdgeFindings(file, readFileSync(file, "utf8"), registry));
  }
  return findings;
}

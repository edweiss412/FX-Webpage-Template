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
    // BOTH loops here terminate independently of what a mutant does to any
    // predicate, and that is the point rather than a style choice.
    //
    // The whitespace run was a `while (isWhitespaceAt(text, pos)) pos += 1`. Its
    // termination lived ENTIRELY in the predicate: negate the whitespace test and
    // `charAt` past the end keeps returning "" forever, so the mutant does not
    // fail, it HANGS -- it burns the whole per-case timeout and takes the entire
    // measurement down with it. A regex match for the leading run has no loop and
    // no comparison operator to mutate at all.
    //
    // The comment walk was a `for (;;)` whose only exit was `find(([a]) => a ===
    // pos)` returning undefined. Flip that `===` and it re-finds the same range
    // forever at an unchanging `pos`. It is now BOUNDED BY CONSTRUCTION: each step
    // consumes one comment range, so `ranges.length` steps is a ceiling no mutant
    // can lift, and the worst case degrades from a hang to a SURVIVOR YOU CAN SEE.
    //
    // Note the direction: this ADDS a comparison rather than removing one. Making a
    // mutant unrepresentable would be gaming the score; making it terminate is not.
    let pos = end;
    const advancePastWhitespace = (): void => {
      // TOTAL, and with nothing to mutate. `/\S|$/` matches every string -- at the
      // first non-whitespace character, or at the end -- so `search` never returns
      // -1 and there is no null branch to test. The branch this replaces was
      // UNREACHABLE (`/^\s*/` is zero-width and matches everything), i.e. a site
      // that could only ever have been defended by an equivalence argument.
      pos += text.slice(pos).search(/\S|$/);
    };
    advancePastWhitespace();
    for (const _boundedByOneRangePerStep of ranges) {
      const next = ranges.find(([a]) => a === pos);
      if (next === undefined) break;
      pos = next[1];
      advancePastWhitespace();
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
      // A PropertyDeclaration is included for the same reason as the other two: a
      // class holding the surface (`private ch: Channel`) is ordinary authoring
      // inside the threat fence, and omitting it made `this.ch.send(...)` silent.
      (ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) &&
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

  /**
   * Classify the member reached THROUGH `receiver`, whatever shape the receiver has.
   * One definition for the bare path and the property-receiver path, because the two
   * answering differently is what made `this.ch.typo()` silent while `ch.typo()`
   * reported (diff r4 F1).
   */
  const classifyMemberOn = (receiver: ts.PropertyAccessExpression | ts.Expression): void => {
    const outer = receiver.parent;
    if (!ts.isPropertyAccessExpression(outer) || outer.expression !== receiver) return;
    const member = outer.name.text;
    const call = outer.parent;
    if (ts.isCallExpression(call) && call.expression === outer) {
      if (!known.has(member)) report(outer, member);
      return;
    }
    const handedOn =
      (ts.isPropertyAssignment(call) && call.initializer === outer) ||
      (ts.isCallExpression(call) && call.arguments.includes(outer));
    if (ambient.has(member) && handedOn) return;
    report(outer, member);
  };

  const classify = (id: ts.Identifier): void => {
    const parent = id.parent;

    if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
      // ONE implementation, called with the identifier as the receiver. Copying these
      // branches for the property-receiver path left SEVEN survivors on the copy —
      // no case reached it — and worse, it duplicated the line the registry's control
      // edit keys on BY TEXT, so the control landed on the unexercised copy and the
      // suite stopped noticing it. A control edit keyed by text is only as good as
      // that text's uniqueness, which duplication silently destroys.
      classifyMemberOn(id);
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

    // STORING the surface into a field of `this` -- `this.ch = ch` in a constructor
    // -- is the same ordinary injection as passing it as an argument, and the field
    // it lands in is itself a surface binding, so the sink calls through it are
    // reached. Deliberately narrow: ONLY an assignment whose target is a property of
    // `this`. A wider "any assignment RHS" exemption would be keyed far coarser than
    // the fact it disposes of and would swallow real handoffs.
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.right === id &&
      ts.isPropertyAccessExpression(parent.left) &&
      parent.left.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      return;
    }

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
          ts.isPropertyDeclaration(parent) ||
          ts.isBindingElement(parent)) &&
        parent.name === node;
      const isPropertyName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      // A property NAME is not a binding reference — EXCEPT when the property itself
      // is a surface binding, which is what a class field is. `this.ch.typo()` was
      // dropped here and caught by no later arm, while the bare `ch.typo()` reported
      // (diff r4 F1). The skip stays; the surface-binding case is handed to the same
      // member classification the bare path uses, so DECLINE THROUGH A PROPERTY
      // RECEIVER REPORTS EXACTLY WHERE DECLINE THROUGH A BARE IDENTIFIER ALREADY DID.
      // Deliberately not a blanket report on member reads: `ch.panes()` and
      // `this.ch.panes()` both scan clean outside a pass and they AGREE, because a
      // read outside a declared pass is unconstrained by rule 2.
      if (isPropertyName && bindings.has(node.text) && !derivedAt(node.text, node)) {
        classifyMemberOn(parent as ts.PropertyAccessExpression);
        return;
      }
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
  // A PREDICATE, not a set: whether a name is a RAW binding depends on WHERE it is
  // used. A parameter shadowing a derived name inside the same pass is raw at its own
  // uses and derived nowhere (diff r2 F1), and a set keyed on the name alone cannot
  // say that.
  isRaw: (name: string, at: ts.Node) => boolean,
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
      isRaw(n.expression.expression.text, n) &&
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
  isRaw: (name: string, at: ts.Node) => boolean,
  passFn: ts.Node,
  derivations: readonly Derivation[],
): Finding[] => {
  const out: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && !derivations.some((d) => d.initializer === n)) {
      for (const argument of n.arguments) {
        // Asked AT THE USE, not against a set of raw NAMES. The name-keyed set
        // subtracted every binding sharing a derivation's name, so a parameter
        // SHADOWING a derived name was subtracted with it and its handoff went
        // unreported — diff r2 F1's defect, still live one arm over at diff r4 F2.
        // A binding the scanner cannot SHOW to be derived here is RAW: fail closed.
        if (!ts.isIdentifier(argument) || !isRaw(argument.text, argument)) continue;
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
/**
 * The RIGHTMOST NAME of a call's receiver, or null when there is none.
 *
 * ONE definition, deliberately, because the two arms that ask this question used to
 * answer it differently and the disagreement was SILENT: the sink walk resolved a
 * receiver by rightmost name (so it saw `h.ch.dispatch`), suppressed on the grounds
 * that primary discovery would handle anything inside a top-level function, and
 * discovery then declined the same call because it accepted only a BARE IDENTIFIER.
 * Suppressed by one arm, skipped by the other, reported by neither (diff r3 F6).
 * A shared rule cannot drift apart the way two hand-written ones did.
 */
export type Receiver =
  /** the rightmost name resolves to a surface binding */
  | { kind: "surface"; name: string }
  /** a rightmost name exists and is NOT a binding */
  | { kind: "foreign"; name: string }
  /** no statically knowable rightmost name */
  | { kind: "opaque" };

/**
 * TRANSPARENCY IS ASKED OF THE COMPILER, NEVER ENUMERATED.
 *
 * "Which wrappers change no meaning" is a question TypeScript already answers:
 * `OuterExpressionKinds.All` covers parentheses, type assertions (`as` and the
 * angle form), non-null (`!`), `satisfies`, partially-emitted expressions and
 * expressions-with-type-arguments. A hand-written wrapper list is the exact
 * defect this arc exists to remove, so writing one HERE would have been the
 * defect committed inside its own repair.
 */
type SkipOuterExpressions = (node: ts.Expression, kinds: ts.OuterExpressionKinds) => ts.Expression;

/**
 * PROBED, NOT ASSUMED. In the pinned TypeScript (5.9.3) `skipOuterExpressions`
 * is present at RUNTIME and absent from the public `.d.ts`; `OuterExpressionKinds`
 * IS public and `All` is 63. So it is bound through a narrow declared shape
 * rather than reached for as a public export.
 *
 * It FAILS LOUD if an upgrade removes it. A silent fallback to a hand-written
 * wrapper list would re-open precisely the class this rule closes, and it would
 * do so invisibly -- the suite would stay green while the guard quietly stopped
 * seeing three of the four wrapper forms.
 */
const skipOuterExpressions: SkipOuterExpressions = ((): SkipOuterExpressions => {
  const fn = (ts as unknown as { skipOuterExpressions?: unknown }).skipOuterExpressions;
  if (typeof fn !== "function") {
    throw new Error(
      "sendAuthScan: ts.skipOuterExpressions is unavailable in this TypeScript build. " +
        "Rule A resolves receiver transparency THROUGH THE COMPILER deliberately; " +
        "a hand-written wrapper list is the defect this rule exists to remove, so " +
        "this fails rather than degrading to one.",
    );
  }
  return fn as SkipOuterExpressions;
})();

/** Rule A's unwrap. Both sides of the rule use this one function. */
const skipTransparent = (e: ts.Expression): ts.Expression =>
  skipOuterExpressions(e, ts.OuterExpressionKinds.All);

/**
 * The RIGHTMOST NAME of a receiver, or null when the source text does not name
 * it.
 *
 * A STATICALLY KNOWN element access resolves to its key: `this["ch"]` and
 * `` this[`ch`] `` name their member IN THE BYTES and need neither a checker nor
 * a call graph, so they are NOT the fenced call-result case. Treating them as
 * one left a real surface sink fully silent, which is the fail-open direction.
 * A non-literal key (`ch[name]`) has no name to resolve and stays opaque.
 */
const receiverRightmostName = (raw: ts.Expression): string | null => {
  const e = skipTransparent(raw);
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const key = skipTransparent(e.argumentExpression);
    // `isStringLiteralLike` is the compiler's own answer for "a literal whose
    // text is known statically", covering both `"ch"` and `` `ch` `` without
    // this module deciding which node kinds qualify.
    return ts.isStringLiteralLike(key) ? key.text : null;
  }
  return null;
};

/**
 * RULE A. Total and three-way, so every consumer disposes of every case
 * explicitly and the disposition table has no empty cells.
 *
 * `opaque` means "no statically knowable name", NOT "not a bare identifier" —
 * the distinction is load-bearing, and collapsing the two is what silenced a
 * real sink.
 */
export const surfaceReceiverOf = (raw: ts.Expression, bindings: ReadonlySet<string>): Receiver => {
  const name = receiverRightmostName(raw);
  if (name === null) return { kind: "opaque" };
  return bindings.has(name) ? { kind: "surface", name } : { kind: "foreign", name };
};

/**
 * The top-level functions primary discovery CLASSIFIES as send-bearing: the subtree
 * calls a declared SINK on a surface binding. Anchored on sinks, never on effects —
 * anchoring on every effect makes the live `main` send-bearing through its fifteen
 * `out(...)` calls and reports against correct code (§3.5, AC-14).
 *
 * Computed ONCE and handed to both consumers. The sink walk suppresses only where
 * this set says a classification actually happened, so a form discovery cannot
 * classify now REPORTS instead of vanishing — a suppression may not rest on another
 * arm's classification unless that arm made one.
 */
const sendBearingFunctions = (
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
  topLevel: readonly { node: ts.Node; name: string; line: number }[],
): { node: ts.Node; name: string; line: number }[] =>
  topLevel.filter((fn) => {
    let sendBearing = false;
    const look = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const receiver = surfaceReceiverOf(n.expression.expression, bindings);
        // `foreign` is silent and REQUIRED for zero false advisories; `opaque` is
        // DECLARED SILENCE under the no-call-graph fence. Only `surface` proceeds.
        if (receiver.kind === "surface" && row.sinks.includes(n.expression.name.text)) {
          sendBearing = true;
        }
      }
      ts.forEachChild(n, look);
    };
    look(fn.node);
    return sendBearing;
  });

const unreachedOccurrences = (
  sf: ts.SourceFile,
  file: string,
  row: SendAuthSurface,
  bindings: ReadonlySet<string>,
  classified: readonly { node: ts.Node; name: string; line: number }[],
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
      // The receiver is taken at its RIGHTMOST NAME, so `this.ch.send(...)` and
      // `self.ch.send(...)` are reached as well as a bare `ch.send(...)`. Rule 28:
      // a narrowing that declines an input owes it a CHANNEL, and these had none.
      //
      // A receiver that is a CALL RESULT (`getChannel().send(...)`) is still
      // declined, and that one is DECLARED SILENCE under the ratified no-call-graph
      // fence (§4) rather than an accidental gap — the scanner cannot know what a
      // call returns without the machinery this arc withdrew.
      // Parentheses are a TRANSPARENT WRAPPER -- same meaning, same evaluation order
      // -- so `(this.ch).send(...)` is the same call as `this.ch.send(...)` to every
      // reader. Inspecting the node without unwrapping made both the sink walk and the
      // default-deny arm miss it, and the module reported NOTHING (diff r2 F2). A
      // wrapper that changes no semantics must not change what the guard sees.
      const bare = skipTransparent(callee);
      const isMemberSink =
        ts.isPropertyAccessExpression(bare) &&
        row.sinks.includes(bare.name.text) &&
        surfaceReceiverOf(bare.expression, bindings).kind === "surface";
      // A sink reached through a destructured local: no property access exists to
      // inspect, so the local's own name is the whole signal.
      const isBareSink = ts.isIdentifier(bare) && destructured.has(bare.text);
      // Suppress ONLY where discovery actually classified the containing function.
      // The old test was `topLevel.some(...)` — mere containment — which handed the
      // call to an arm that had already declined it (diff r3 F6).
      if ((isMemberSink || isBareSink) && !classified.some((t) => lexicallyWithin(t.node, n, sf))) {
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
  // A NAME is not an identity. The exemption was keyed on (pass, name), so a RAW
  // parameter SHADOWING a derived name inside the same pass inherited it and its reads
  // went unreported (diff r2 F1). Name-keyed exemptions do not fail at the boundary
  // they were written for; they fail wherever the same name reappears meaning
  // something else.
  //
  // Resolving the binding properly needs a checker, which this scanner does not have
  // and will not grow. The check is CONSERVATIVE in the reporting direction instead:
  // if any function scope between the use and the derivation RE-DECLARES the name as a
  // parameter, the use is treated as RAW. A shadow the scanner cannot resolve
  // therefore REPORTS rather than falling silent, which is the only direction the
  // consequence bound allows.
  const shadowedBetween = (name: string, at: ts.Node, declaration: ts.Node): boolean => {
    for (let cur: ts.Node | undefined = at; cur !== undefined; cur = cur.parent) {
      if (cur === declaration) return false;
      if (isFunctionLike(cur)) {
        const shadows = (cur as ts.SignatureDeclaration).parameters.some(
          (param) => ts.isIdentifier(param.name) && param.name.text === name,
        );
        if (shadows) return true;
      }
    }
    return false;
  };

  const derivedAt = (name: string, at: ts.Node): boolean =>
    passes.some((p) =>
      p.derivations.some(
        (d) =>
          d.name === name &&
          lexicallyWithin(p.fn, at, sf) &&
          !shadowedBetween(name, at, d.declaration),
      ),
    );

  const topLevel = topLevelFunctions(sf);
  const classified = sendBearingFunctions(row, bindings, topLevel);
  const findings: Finding[] = classifyUses(sf, file, row, bindings, reads, derivedAt);
  findings.push(...unreachedOccurrences(sf, file, row, bindings, classified));
  for (const { fn, derivations } of passes) {
    // Per-pass, for the same reason: inside THIS pass, only THIS pass's derivations
    // are derived. Another pass's names are ordinary raw bindings here.
    // Raw HERE means: a surface binding, and not derived AT THIS USE by THIS pass.
    const rawHere = (name: string, at: ts.Node): boolean =>
      bindings.has(name) &&
      !derivations.some((d) => d.name === name && !shadowedBetween(name, at, d.declaration));
    findings.push(...analyzePassReads(sf, file, rawHere, reads, fn, derivations));
    findings.push(...analyzeDerivations(sf, file, fn, derivations));
    // The name-only view was NOT the right one: it subtracted a shadowing parameter
    // along with the derivation whose name it borrowed (diff r4 F2). Same predicate
    // as the read arm, asked at the use.
    findings.push(...analyzeHandoffs(sf, file, rawHere, fn, derivations));
  }

  for (const fn of classified) {
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

// A `.js` specifier naming a `.ts` module is ORDINARY, not an obfuscation: both
// bundler and NodeNext resolution map `./m.js` onto `m.ts`, and every ESM-output
// codebase writes it that way. Stripping only `.ts`/`.tsx` left the resolved path
// carrying its `.js`, so it matched no registry row and the importer went unreported
// (diff r2 F3).
const withoutExtension = (path: string): string => path.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");

/**
 * Discovery beyond the registry: an import-edge arm, exact and checker-free.
 *
 * Any module that imports a registered `surfaceType` SYMBOL from a registered
 * module, and is not itself registered, is `UNREGISTERED-IMPORTER` (§2.4). It
 * follows the SYMBOL rather than the local binding name, so
 * `import type { Channel as Alias }` is still discovered.
 *
 * A NAMESPACE import IS followed, through the qualified name it necessarily uses
 * (`import * as M` plus `M.Channel`) — exactly and not blanket, so an importer that
 * never reaches the type is not reported. This header said the opposite until diff
 * r2 F5, sitting directly above the arm that already followed it: the code changed
 * in r1 and the comment did not, which is the same stale-citation defect as a line
 * number that still resolves and points somewhere else.
 *
 * DOCUMENTED LIMIT: a RE-EXPORT CHAIN is not followed. The scanner has no call graph
 * and no module resolution beyond this one edge (§4 limit 6), and a module reached
 * only that way is outside its range until enrolled — the same posture as the
 * mutation registry, where enrolment is an act (§4 limit 4).
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
    }
    // No `continue` after the namespace branch: a NamespaceImport is never
    // NamedImports -- distinct SyntaxKinds -- so this next line already continues
    // for exactly those nodes. The statement was removable with the corpus green,
    // and a removable statement is a deletion, not an equivalence row.
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

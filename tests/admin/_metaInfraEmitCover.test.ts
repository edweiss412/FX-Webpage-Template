/**
 * tests/admin/_metaInfraEmitCover.test.ts — the resolving layer of the lib/admin
 * infra-emit walker, and the assertion the whole sweep exists to satisfy.
 *
 * Builds a ts.Program over lib/admin/**, supplies the construction, callee and
 * payload answers the syntactic core cannot derive from text, applies the core to
 * every file, and asserts the reported set is EMPTY.
 *
 * NO EXPECTED COUNT IS PINNED. The walker's output is the derivation; a number in
 * the assertion is a second source that goes stale. The spec's population table is a
 * dated measurement, not a contract this suite enforces.
 *
 * DOCUMENTED LIMIT this file owns (spec §9 limit 4): the cover is `lib/admin/**` and
 * stops there. Measured 2026-08-26: 165 raw `kind: "infra_error"` matches across 41
 * files outside it, concentrated in lib/notify/, lib/observe/query/, lib/appSettings/
 * and lib/adminAlerts/; lib/sync/ has its own emit guard
 * (tests/log/_metaAdminOutcomeContract.test.ts, the SYNC_INFRA_ERROR window scan).
 * Re-run trigger: point COVER_REL at another directory — it is one constant.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { premise, premiseHolds } from "../_shared/premise";
import { isInfraLiteral, scanSourceFile, type Resolver, type Site } from "./infraEmitScan";
import { NEW_FORENSIC_CODES } from "../log/_auditableMutations";
// The registry is DATA, in its own module: importing a `.test.ts` runs that
// suite's describes inside this one. Reading the same rows rather than
// duplicating a list is what makes the completeness check below derived.
import { infraRegistry } from "./_infraRegistry";

const ROOT = resolve(__dirname, "..", "..");
const COVER_REL = "lib/admin";
const COVER = join(ROOT, COVER_REL);

/**
 * Membership is TypeScript's own list of what it compiles, not one this file
 * maintains (plan R3 F2). `ts.Extension` is the compiler's own enum of every
 * extension it knows, so a `.tsx` loader is scanned by construction and a `.mts`
 * one would be too; a `.md` file is not in it and is excluded with that reason
 * recorded. The filter selects TypeScript SOURCES from that enum — declaration
 * files hold types, never a return statement, and `.js` is not in this cover.
 * `getScriptKindFromFileName` and `getSupportedExtensions` would both read more
 * directly but neither is in the public `.d.ts` for this TypeScript version.
 */
const SUPPORTED: readonly string[] = Object.values(ts.Extension).filter(
  (e) => /^\.[cm]?tsx?$/.test(e), // TypeScript sources: .ts .tsx .mts .cts, never .d.* or .js
);
const isTypeScript = (rel: string): boolean => SUPPORTED.some((e) => rel.endsWith(e));
const isTest = (rel: string): boolean => /\.test\.tsx?$/.test(rel);

/** Acquisition A: a recursive directory walk. */
function walkAll(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkAll(p, out);
    else out.push(relative(ROOT, p));
  }
  return out;
}
/** Acquisition B: git's index. Shares no code with A — that is the entire point. */
const gitAll = (): string[] =>
  execFileSync("git", ["ls-files", COVER_REL], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f !== "");

/**
 * Population pass B: syntax only, NO checker. Resolves a const alias by NAME within
 * the file, which is weaker than the symbol table and deliberately so — two passes
 * sharing resolution code cannot disagree.
 */
function syntaxOnlyLines(sf: ts.SourceFile): number[] {
  const aliases = new Set<string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) {
          let init: ts.Expression = d.initializer;
          while (ts.isParenthesizedExpression(init) || ts.isAsExpression(init))
            init = init.expression;
          if (isInfraLiteral(init)) aliases.add(d.name.text);
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const lines: number[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isReturnStatement(n) && n.expression) {
      let e: ts.Expression = n.expression;
      while (
        ts.isParenthesizedExpression(e) ||
        ts.isAsExpression(e) ||
        ts.isSatisfiesExpression(e)
      ) {
        e = e.expression;
      }
      if (isInfraLiteral(e) || (ts.isIdentifier(e) && aliases.has(e.text))) {
        lines.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return lines;
}

function tsconfigOptions(): ts.CompilerOptions {
  const path = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json")!;
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(path, ts.sys.readFile).config,
    ts.sys,
    ROOT,
  );
  return { ...parsed.options, noEmit: true };
}

export function makeResolver(checker: ts.TypeChecker): Resolver {
  const declOf = (id: ts.Identifier): ts.Declaration | undefined => {
    const sym = checker.getSymbolAtLocation(id);
    const s = sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    return s?.valueDeclaration ?? s?.declarations?.[0];
  };
  const strip = (e: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    }
    return e;
  };
  const mentionsInfra = (t: ts.Type): boolean => {
    for (const p of t.isUnion() ? t.types : [t]) {
      const k = p.getProperty("kind");
      const d = k?.valueDeclaration ?? k?.declarations?.[0];
      if (!k || !d) continue;
      const kt = checker.getTypeOfSymbolAtLocation(k, d);
      for (const kp of kt.isUnion() ? kt.types : [kt]) {
        if (kp.isStringLiteral() && kp.value === "infra_error") return true;
      }
    }
    return false;
  };
  return {
    isConstAlias(id) {
      const d = declOf(id);
      return (
        !!d &&
        ts.isVariableDeclaration(d) &&
        !!d.initializer &&
        isInfraLiteral(strip(d.initializer))
      );
    },
    calleeOrigin(subject) {
      // `subject` is the binding the guard tests; find the call it was bound from.
      const d = declOf(subject);
      if (!d || !ts.isVariableDeclaration(d) || !d.initializer) return null;
      let init = strip(d.initializer);
      if (ts.isAwaitExpression(init)) init = strip(init.expression);
      if (!ts.isCallExpression(init)) return null;
      let callee = strip(init.expression);
      // `opts.loadHolds ?? loadOpenIdentityHolds` — production always takes the right arm.
      if (
        ts.isBinaryExpression(callee) &&
        callee.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        callee = strip(callee.right);
      }
      if (!ts.isIdentifier(callee)) return null;
      const sym = checker.getSymbolAtLocation(callee);
      const wasImported = !!sym && (sym.flags & ts.SymbolFlags.Alias) !== 0;
      const cd = declOf(callee);
      const file = cd?.getSourceFile().fileName;
      if (!file) return null;
      return { inCover: file.startsWith(COVER + "/"), origin: wasImported ? "imported" : "local" };
    },
    isObjectPayload(expr) {
      const t = checker.getTypeAtLocation(expr);
      const parts = t.isUnion() ? t.types : [t];
      if (parts.length === 0) return false;
      return parts.every((p) => {
        if (p.flags & ts.TypeFlags.Unknown) return true; // a catch binding is the whole value
        if (!(p.flags & ts.TypeFlags.Object)) return false; // scalars, any, the error type
        return p.getCallSignatures().length === 0; // a callable is not a payload
      });
    },
    typeMentionsInfra: (expr) => mentionsInfra(checker.getTypeAtLocation(expr)),
    callProducedInCover(expr) {
      let e = strip(expr);
      if (ts.isAwaitExpression(e)) e = strip(e.expression);
      if (!ts.isCallExpression(e)) return null;
      let callee = strip(e.expression);
      if (
        ts.isBinaryExpression(callee) &&
        callee.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        callee = strip(callee.right);
      }
      if (!ts.isIdentifier(callee)) return null;
      const sym = checker.getSymbolAtLocation(callee);
      const wasImported = !!sym && (sym.flags & ts.SymbolFlags.Alias) !== 0;
      const file = declOf(callee)?.getSourceFile().fileName;
      if (!file || !file.startsWith(COVER + "/")) return null;
      return { origin: wasImported ? "imported" : "local" };
    },
  };
}

// ── acquisition, derived twice by independent means (premise 1) ───────────────
const walked = walkAll(COVER).sort();
const tracked = gitAll().sort();
const onlyWalked = walked.filter((f) => !tracked.includes(f));
const onlyTracked = tracked.filter((f) => !walked.includes(f));
premiseHolds(
  `file acquisition agrees — walk-only [${onlyWalked}], git-only [${onlyTracked}]`,
  onlyWalked.length === 0 && onlyTracked.length === 0,
);

// The partition is asserted exhaustive, so nothing is dropped by an unexamined filter.
const scanned = walked.filter((f) => isTypeScript(f) && !isTest(f));
const tests = walked.filter((f) => isTypeScript(f) && isTest(f));
const notTypeScript = walked.filter((f) => !isTypeScript(f));
premiseHolds(
  "the file partition is exhaustive",
  scanned.length + tests.length + notTypeScript.length === walked.length,
);
premise("the cover holds scanned files", scanned.length, 0);

const program = ts.createProgram(
  scanned.map((f) => join(ROOT, f)),
  tsconfigOptions(),
);
const checker = program.getTypeChecker();
const resolver = makeResolver(checker);

const sitesByFile = new Map<string, Site[]>();
for (const rel of scanned) {
  const sf = program.getSourceFile(join(ROOT, rel));
  premiseHolds(`the program resolved ${rel}`, sf !== undefined);
  sitesByFile.set(rel, scanSourceFile(sf!, resolver));
}

// ── population, derived twice by independent means (premise 2) ────────────────
const popMismatch: string[] = [];
for (const rel of scanned) {
  const sf = program.getSourceFile(join(ROOT, rel))!;
  const bySyntax = new Set(syntaxOnlyLines(sf));
  const byChecker = new Set(
    sitesByFile
      .get(rel)!
      .filter((s) => s.shape !== "unclassified")
      .map((s) => s.line),
  );
  for (const l of bySyntax) if (!byChecker.has(l)) popMismatch.push(`${rel}:${l} syntax-only`);
  for (const l of byChecker) if (!bySyntax.has(l)) popMismatch.push(`${rel}:${l} checker-only`);
}
premiseHolds(
  `the two population passes agree — ${popMismatch.join(", ")}`,
  popMismatch.length === 0,
);

const allSites = [...sitesByFile.values()].flat();

// ── both construction shapes witnessed (premise 3) ────────────────────────────
premiseHolds(
  "a literal construction is witnessed",
  allSites.some((s) => s.shape === "literal"),
);
premiseHolds(
  "a const-alias construction is witnessed",
  allSites.some((s) => s.shape === "const-alias"),
);

// ── BOTH propagation callee categories witnessed (premise 4) ──────────────────
// A resolver that resolves imports but not local declarations passes a one-witness
// premise while reporting the two bellFeed sites — and the "repair" for a reported
// propagation is a DUPLICATE EMIT, the exact fault the exemption prevents.
const exempt = allSites.filter((s) => s.verdict.kind === "exempt-propagation");
premiseHolds(
  "an IMPORTED in-cover propagation callee is witnessed",
  exempt.some((s) => s.verdict.kind === "exempt-propagation" && s.verdict.origin === "imported"),
);
premiseHolds(
  "a LOCALLY DECLARED in-cover propagation callee is witnessed",
  exempt.some((s) => s.verdict.kind === "exempt-propagation" && s.verdict.origin === "local"),
);

// ── the checker resolved usefully, not merely answered (premise 5) ────────────
// A broken program yields `any`, which the POSITIVE object test reports rather than
// accepts — but say so out loud instead of leaving a wall of reports to read as real.
{
  // PREMISE 5: the checker resolved USEFULLY, not merely answered. An earlier
  // version parsed two expressions and asserted it had found two AST nodes — it
  // never called the resolver, so it proved nothing about the thing it named. It
  // now runs the real predicate over a known object and a known scalar and
  // requires opposite answers.
  const probeSrc = `declare const o: { a: number }; declare const s: string;
function f(){ log.error("m", { code: "C", error: o }); log.error("m", { code: "C", error: s }); }`;
  const probePath = join(ROOT, "lib/admin/__premise_probe__.ts");
  const probeProgram = ts.createProgram([probePath], tsconfigOptions(), {
    ...ts.createCompilerHost(tsconfigOptions()),
    getSourceFile: (name, lang) =>
      name === probePath
        ? ts.createSourceFile(name, probeSrc, lang, true)
        : ts.createCompilerHost(tsconfigOptions()).getSourceFile(name, lang),
  });
  const probeResolver = makeResolver(probeProgram.getTypeChecker());
  const args: ts.Expression[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "error") {
      args.push(n.initializer);
    }
    ts.forEachChild(n, walk);
  };
  walk(probeProgram.getSourceFile(probePath)!);
  premiseHolds("the premise probe found both payload expressions", args.length === 2);
  premiseHolds(
    "the resolver ACCEPTS a known object payload",
    probeResolver.isObjectPayload(args[0]!),
  );
  premiseHolds(
    "the resolver REJECTS a known scalar payload",
    !probeResolver.isObjectPayload(args[1]!),
  );
}

describe("lib/admin infra-emit cover", () => {
  it("every infra_error construction is preceded by a code-carrying, object-payload emit", () => {
    const reported = allSites
      .flatMap((s) =>
        s.verdict.kind === "reported"
          ? [
              `${[...sitesByFile.entries()].find(([, v]) => v.includes(s))![0]}:${s.line} ${s.verdict.reason} — ${s.text}`,
            ]
          : [],
      )
      .sort();
    expect(reported, "infra_error returns with no whole-fault emit").toEqual([]);
  });

  it("every file holding a construction is registered in infraRegistry", () => {
    const withSites = new Set(
      [...sitesByFile.entries()].filter(([, v]) => v.length > 0).map(([rel]) => rel),
    );
    const registered = new Set(infraRegistry.map((e) => e.path));
    expect(
      [...withSites].filter((f) => !registered.has(f)).sort(),
      "unregistered cover files",
    ).toEqual([]);
  });

  it("every code the scanner saw is registered forensic, and every emit stamps a literal", () => {
    // DERIVED FROM THE WALK, not from a second regex over the same files. An
    // earlier version re-scanned with a regex that only understood
    // `code: "LITERAL"`, so `const code = "X"; log.error(m, { code, error })`
    // satisfied the walker and registered nothing — the "derived, not listed"
    // claim failing quietly, which is the one failure mode a derived check exists
    // to prevent.
    const seen = new Set<string>();
    const nonLiteral: string[] = [];
    for (const [rel, sites] of sitesByFile) {
      for (const s of sites) {
        if (s.verdict.kind !== "satisfied") continue;
        if (s.verdict.code === null) nonLiteral.push(`${rel}:${s.line}`);
        else seen.add(s.verdict.code);
      }
    }
    // A non-literal code cannot be checked against the registry at all, so it is
    // refused rather than skipped: the guard must not go quiet on the one shape it
    // cannot verify.
    expect(nonLiteral, "emits whose `code` is not a string literal").toEqual([]);
    expect(
      [...seen].filter((c) => !NEW_FORENSIC_CODES.has(c)).sort(),
      "unregistered codes",
    ).toEqual([]);
    premise("the walk saw codes to check", seen.size, 0);
  });
});

/**
 * Probe: does a TYPE-based whole-fault predicate close the alias hole that a
 * syntactic one leaves open?
 *
 * Spec round 2 forced `error` to be a bare identifier rather than `.message`.
 * Round 3 then showed the hole that leaves: `const error = raw.message` binds a
 * bare identifier to a flattened string, and the syntactic test accepts it. Any
 * further syntactic rule (reject `.msg` too, reject `String(...)` too) is one more
 * case for the next round, which is the widening this repo's round-economy rules
 * say to refuse.
 *
 * The closable form asks the type system instead: a whole fault is an object;
 * anything flattened to text is `string`, however it was written. This probe runs
 * both predicates over the same fixtures and reports where they disagree.
 *
 * Run: node --import tsx docs/superpowers/specs/observability/probes/2026-08-26-emit-payload-predicate.ts
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Real lib.d.ts: without it `String(x)` has no type and the type predicate cannot
// see that it yields a string, which is a probe artifact rather than a design gap.
const TS_LIB_DIR = dirname(require.resolve("typescript"));
const LIB = "lib.es2020.full.d.ts";

type Fixture = { name: string; src: string; whole: boolean };

const PRELUDE = `
type PgError = { message: string; code: string; details: string };
declare const raw: PgError;
declare const CODE: string;
declare const log: { error(m: string, f: Record<string, unknown>): void };
`;

const FIXTURES: Fixture[] = [
  { name: "error: error (object)", whole: true,
    src: `function f() { const error = raw; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "error: err (catch binding, unknown)", whole: true,
    src: `function f() { try { throw raw; } catch (err) { log.error("m", { code: CODE, error: err }); return { kind: "infra_error" as const }; } }` },
  { name: "error: error.message", whole: false,
    src: `function f() { const error = raw; log.error("m", { code: CODE, error: error.message }); return { kind: "infra_error" as const }; }` },
  { name: "alias to .message (R3 F2)", whole: false,
    src: `function f() { const error = raw.message; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "alias to String(raw)", whole: false,
    src: `function f() { const error = String(raw); log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "destructured message", whole: false,
    src: `function f() { const { message: error } = raw; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "template literal", whole: false,
    src: `function f() { const error = \`\${raw.code}\`; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "alias to a different field (.code, also a string)", whole: false,
    src: `function f() { const error = raw.code; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "no error field at all", whole: false,
    src: `function f() { log.error("m", { code: CODE }); return { kind: "infra_error" as const }; }` },
  // ── R4: non-string scalars and partial objects. The string-only rule accepts all of these.
  { name: "number field (raw.status)", whole: false,
    src: `function f() { const error = 403; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "boolean field", whole: false,
    src: `function f() { const error = true; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "bigint field", whole: false,
    src: `function f() { const error = 1n; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "symbol field", whole: false,
    src: `function f() { const error = Symbol("x"); log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "null payload", whole: false,
    src: `function f() { const error = null; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "undefined payload", whole: false,
    src: `function f() { const error = undefined; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  { name: "function payload", whole: false,
    src: `function f() { const error = () => {}; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
  // The one the tightened rule still accepts, and §9 records it: a reconstructed partial object
  // is an object, and no static rule distinguishes it from the whole fault.
  { name: "partial object literal (DOCUMENTED LIMIT)", whole: false,
    src: `function f() { const error = { message: raw.message }; log.error("m", { code: CODE, error }); return { kind: "infra_error" as const }; }` },
];

const FNAME = "/probe.ts";
function analyse(src: string): { syntactic: boolean; typed: boolean } {
  const full = PRELUDE + src;
  const host: ts.CompilerHost = {
    getSourceFile: (n) => {
      if (n === FNAME) return ts.createSourceFile(n, full, ts.ScriptTarget.Latest, true);
      try { return ts.createSourceFile(n, readFileSync(join(TS_LIB_DIR, n), "utf8"), ts.ScriptTarget.Latest, true); }
      catch { return undefined; }
    },
    writeFile: () => {}, getDefaultLibFileName: () => LIB, useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (n) => n, getCurrentDirectory: () => "/", getNewLine: () => "\n",
    fileExists: (n) => n === FNAME, readFile: (n) => (n === FNAME ? full : undefined),
  };
  const program = ts.createProgram([FNAME], { noResolve: true, strict: true, target: ts.ScriptTarget.ES2020 }, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(FNAME)!;
  let syntactic = false, typed = false;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "log.error") {
      for (const a of n.arguments) {
        if (!ts.isObjectLiteralExpression(a)) continue;
        let hasCode = false;
        let errExpr: ts.Expression | null = null;
        for (const pr of a.properties) {
          if (ts.isShorthandPropertyAssignment(pr)) {
            if (pr.name.text === "code") hasCode = true;
            if (pr.name.text === "error") errExpr = pr.name;
          } else if (ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.name)) {
            if (pr.name.text === "code") hasCode = true;
            if (pr.name.text === "error") errExpr = pr.initializer;
          }
        }
        if (!hasCode || !errExpr) continue;
        // R2 predicate: bare identifier, not a `.message` member access.
        syntactic = ts.isIdentifier(errExpr);
        // R3 repair: the type must not be a string. R4 showed that is too narrow —
        // `error: raw.status` is a number and sails through. The rule is now the
        // category, not the member: every part of the type must be an OBJECT type.
        // One rule, not a growing list of rejected scalars.
        const t = checker.getTypeAtLocation(errExpr);
        const parts = t.isUnion() ? t.types : [t];
        const SCALAR =
          ts.TypeFlags.String | ts.TypeFlags.StringLike | ts.TypeFlags.Number | ts.TypeFlags.NumberLike |
          ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike |
          ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void |
          ts.TypeFlags.Never | ts.TypeFlags.Enum | ts.TypeFlags.EnumLike;
        typed = parts.length > 0 && !parts.some((p) => {
          if (p.flags & SCALAR) return true;
          // a function type is callable, not a payload
          if (p.getCallSignatures().length > 0) return true;
          return false;
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { syntactic, typed };
}

console.log("fixture                                                  want   string-only  object-rule");
let synWrong = 0, typWrong = 0;
for (const f of FIXTURES) {
  const { syntactic, typed } = analyse(f.src);
  if (syntactic !== f.whole) synWrong++;
  if (typed !== f.whole) typWrong++;
  console.log(
    `${f.name.padEnd(56)} ${String(f.whole).padEnd(6)} ` +
      `${(syntactic === f.whole ? "ok  " : "WRONG").padEnd(12)} ${typed === f.whole ? "ok" : "WRONG"}`,
  );
}
console.log(`\nstring-only predicate wrong on ${synWrong}/${FIXTURES.length}; object-rule predicate wrong on ${typWrong}/${FIXTURES.length}`);

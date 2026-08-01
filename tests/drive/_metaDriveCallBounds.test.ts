// tests/drive/_metaDriveCallBounds.test.ts — structural guard for the
// drive-timeout cluster (spec D7/§3.4, plan Task 7).
//
// THE CLASS: eight unbounded Drive/Sheets calls accumulated under app/api/
// while lib/ was being bounded one incident at a time — nothing failed a NEW
// unbounded call site by default. This walk does: every Drive/Sheets API call
// under lib/ and app/ must carry a non-degenerate `timeout` or `signal` in its
// options argument, or an explicit `// drive-call-bound: <where>` exemption.
//
// RULES (converged over 8 adversarial plan rounds; the mutation families
// MF1-MF7 and negative controls below are the ratified closure set):
//   - MATCH: a call expression whose callee property chain contains a
//     NON-terminal segment in {files, channels, revisions, spreadsheets,
//     values} and whose terminal method is not a JS collection method
//     (blocklist below; `at` covers the live tree's `revisions.at(-1)`).
//   - BOUND: the call has >= 2 arguments (googleapis treats the FIRST object
//     as request params, where a `timeout` key is silently ignored) and its
//     LAST argument is an object literal with a `timeout` or `signal` property
//     whose initializer is one of the WHITELISTED shapes:
//       w1  positive numeric literal
//       w2  identifier
//       w3  identifier-or-`this`-rooted non-optional property chain whose
//           final segment is not NaN/undefined/null
//       w4  `A ?? B` where A is an identifier/property-chain read (optional
//           chaining allowed on the left) and B is w1/w2/w3
//   - EXEMPT: the call's first line or the preceding line carries
//     `// drive-call-bound: <where>` naming the layer that bounds it.
//
// HONEST CEILING (ratified, do not "fix"): the guard judges initializer
// EXPRESSIONS with zero symbol resolution. An identifier, enum member, or
// imported constant whose VALUE happens to be degenerate is trusted (named-
// value laundering, MF7), exactly as an aliased/renamed drive client escapes
// the namespace match (MF5) — same posture as the self-redirect guard
// (BL-SOUND-REDIRECT-GUARD). Runtime expiry for every in-scope site is proven
// by the behavioral tests (agenda/reel/scan route suites, clientAuthTimeout,
// errorStatus). A green run means "no known-shape unbounded call", not "the
// class is impossible".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const NAMESPACE_SEGMENTS = new Set(["files", "channels", "revisions", "spreadsheets", "values"]);
const COLLECTION_METHOD_BLOCKLIST = new Set([
  "map", "filter", "forEach", "some", "every", "find", "findIndex", "includes",
  "join", "slice", "splice", "reduce", "flat", "flatMap", "indexOf", "keys",
  "entries", "sort", "concat", "push", "pop", "shift", "unshift", "at",
]);
const DEGENERATE_FINAL_SEGMENTS = new Set(["NaN", "undefined", "null"]);
const EXEMPTION_MARKER = "// drive-call-bound: ";

export type BoundFinding = { line: number; reason: string };

function chainSegments(expr: ts.Expression): { segments: string[]; rootIsIdentifier: boolean } {
  const segments: string[] = [];
  let node: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(node)) {
    segments.unshift(node.name.text);
    node = node.expression;
  }
  const rootIsIdentifier = ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword;
  if (ts.isIdentifier(node)) segments.unshift(node.text);
  return { segments, rootIsIdentifier };
}

function isPositiveNumericLiteral(e: ts.Expression): boolean {
  if (ts.isNumericLiteral(e)) return Number(e.text.replace(/_/g, "")) > 0;
  return false;
}

/** w2/w3: identifier or identifier/this-rooted non-optional property chain. */
function isSafeReadShape(e: ts.Expression, opts: { allowOptionalChain: boolean }): boolean {
  if (ts.isIdentifier(e)) return !DEGENERATE_FINAL_SEGMENTS.has(e.text);
  let node: ts.Expression = e;
  let finalSegment: string | null = null;
  while (ts.isPropertyAccessExpression(node)) {
    if (!opts.allowOptionalChain && node.questionDotToken) return false;
    if (finalSegment === null) finalSegment = node.name.text;
    node = node.expression;
  }
  if (finalSegment === null) return false; // not a property chain
  const rootOk = ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword;
  return rootOk && !DEGENERATE_FINAL_SEGMENTS.has(finalSegment);
}

function isWhitelistedBoundValue(e: ts.Expression): boolean {
  // w4: A ?? B
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return (
      isSafeReadShape(e.left, { allowOptionalChain: true }) &&
      (isPositiveNumericLiteral(e.right) || isSafeReadShape(e.right, { allowOptionalChain: false }))
    );
  }
  // w1
  if (isPositiveNumericLiteral(e)) return true;
  // w2/w3
  return isSafeReadShape(e, { allowOptionalChain: false });
}

function callIsBound(call: ts.CallExpression): boolean {
  if (call.arguments.length < 2) return false;
  const last = call.arguments[call.arguments.length - 1];
  if (last === undefined || !ts.isObjectLiteralExpression(last)) return false;
  for (const prop of last.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (name !== "timeout" && name !== "signal") continue;
    if (isWhitelistedBoundValue(prop.initializer)) return true;
  }
  return false;
}

export function auditDriveCallBounds(sourceText: string, filePath: string): BoundFinding[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const lines = sourceText.split("\n");
  const findings: BoundFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const terminal = node.expression.name.text;
      const { segments } = chainSegments(node.expression.expression);
      const hasNamespace = segments.some((s) => NAMESPACE_SEGMENTS.has(s));
      if (hasNamespace && !COLLECTION_METHOD_BLOCKLIST.has(terminal)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const ownLine = lines[line - 1] ?? "";
        const prevLine = lines[line - 2] ?? "";
        const exempt =
          ownLine.includes(EXEMPTION_MARKER) || prevLine.trim().startsWith(EXEMPTION_MARKER.trim());
        if (!exempt && !callIsBound(node)) {
          findings.push({
            line,
            reason: `unbounded Drive/Sheets call \`.${segments.filter((s) => NAMESPACE_SEGMENTS.has(s)).join(".")}.${terminal}(...)\` — add a non-degenerate timeout/signal in the options argument or a \`${EXEMPTION_MARKER}<where>\` exemption`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

// ── negative controls: the checker itself, exercised on the ratified mutants ──

describe("auditDriveCallBounds negative controls (MF1-MF7 closure set)", () => {
  const audit = (code: string) => auditDriveCallBounds(code, "control.ts");

  it("(a) bare metadata call -> 1 finding (MF1)", () => {
    expect(audit(`await drive.files.get({ fileId: "x" });`)).toHaveLength(1);
  });

  it("(b) bounded call with options on a later line -> 0", () => {
    expect(
      audit(`await drive.files.get(
        { fileId: "x" },
        {
          timeout: DRIVE_FILES_GET_TIMEOUT_MS,
          retry: false,
        },
      );`),
    ).toHaveLength(0);
  });

  it("(c) collection-method lookalikes -> no match", () => {
    expect(audit(`formData.files.map((f) => f);`)).toHaveLength(0);
    expect(audit(`const last = revisions.at(-1);`)).toHaveLength(0);
  });

  it("(d) conditional signal {signal: opts?.signal} -> 1 finding (MF3)", () => {
    expect(audit(`await drive.files.get(p, { signal: opts?.signal });`)).toHaveLength(1);
  });

  it("(e) unbounded non-allowlisted verb (getByDataFilter) -> 1 finding (MF4)", () => {
    expect(audit(`await sheets.spreadsheets.getByDataFilter({ spreadsheetId: "s" });`)).toHaveLength(
      1,
    );
  });

  it("(f) exempted site -> 0", () => {
    expect(
      audit(`// drive-call-bound: outer withStepTimeout budget
await drive.files.get({ fileId: "x" });`),
    ).toHaveLength(0);
  });

  it("(g) statically-degenerate bounds -> 1 finding each (MF6)", () => {
    for (const options of [
      `{ timeout: undefined }`,
      `{ timeout: null }`,
      `{ timeout: 0 }`,
      `{ timeout: NaN }`,
      `{ timeout: Number.NaN }`,
      `{ timeout: 0 && DRIVE_FILES_GET_TIMEOUT_MS }`,
      `{ timeout: Number.parseInt("x") ?? DRIVE_FILES_GET_TIMEOUT_MS }`,
      `{ timeout: ({ value: 0 }).value }`,
      `{ signal: null }`,
    ]) {
      expect(audit(`await drive.files.get(p, ${options});`), options).toHaveLength(1);
    }
  });

  it("(h) single-argument params-object laundering -> 1 finding", () => {
    expect(audit(`await drive.files.get({ fileId: "x", timeout: 8_000 });`)).toHaveLength(1);
  });

  it("accepts the live tree's bounded idioms", () => {
    for (const options of [
      `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }`,
      `{ timeout: deps.timeoutMs ?? DRIVE_FILES_GET_TIMEOUT_MS, retry: false }`,
      `{ timeout: options.listTimeoutMs ?? DRIVE_LIST_TIMEOUT_MS, retry: false }`,
      `{ responseType: "stream", signal: guard.signal }`,
      `{ timeout: deps.timeoutMs ?? DRIVE_CALL_TIMEOUT_MS, retry: false }`,
    ]) {
      expect(audit(`await drive.files.get(p, ${options});`), options).toHaveLength(0);
    }
  });
});

// ── the live-tree walk: zero unbounded calls, fail-by-default for new sites ──

const ROOTS = ["lib", "app"];
const SKIP_DIRS = new Set(["__generated__", "node_modules"]);

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walkFiles(full);
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".d.ts") &&
      !entry.endsWith(".test.ts")
    ) {
      yield full;
    }
  }
}

describe("Drive/Sheets call-bound walk (lib/ + app/)", () => {
  it("finds ZERO unbounded Drive/Sheets calls tree-wide", () => {
    const all: { file: string; finding: BoundFinding }[] = [];
    for (const root of ROOTS) {
      for (const file of walkFiles(root)) {
        for (const finding of auditDriveCallBounds(readFileSync(file, "utf8"), file)) {
          all.push({ file, finding });
        }
      }
    }
    expect(
      all.map((f) => `${f.file}:${f.finding.line} ${f.finding.reason}`),
    ).toEqual([]);
  });
});

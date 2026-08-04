import ts from "typescript";

/**
 * The closed, declared operator set (spec §3.1).
 *
 * Enumeration is AST-based, not textual, and that is the load-bearing choice:
 * a text scan needs hand-written masking for comments, string interiors, TS
 * generics and `=>`, and the throwaway sweep that preceded this harness got
 * that masking wrong — it spliced an integer mutant into a user-visible
 * message string. Under `ts.forEachChild` those cases cannot arise, because
 * comments are not nodes and a digit inside a string is not a `NumericLiteral`.
 *
 * The set is keyed on AST node kind, never on spelling, per the accept-set
 * discipline in `docs/agents/spec-self-review.md:38`. Anything outside it is
 * an operator proposal (spec §6.3), not a review finding.
 */
export const OPERATOR_NAMES = [
  "relational-boundary",
  "equality-flip",
  "logical-connector",
  "integer-literal",
  "regex-quantifier-bound",
  "statement-removal",
] as const;

export type OperatorName = (typeof OPERATOR_NAMES)[number];

export type Site = {
  operator: OperatorName;
  /** Absolute character offsets into the source text. */
  start: number;
  end: number;
  /** Replacement text; `""` for a removal. */
  replacement: string;
  line: number;
  column: number;
  /** Original text at the site, for the ledger key and human triage. */
  from: string;
  to: string;
};

/**
 * Stable ledger key. Includes position, so an edit above a site drifts its id
 * — reconciliation reports that as a stale row plus a new alarm rather than
 * silently absorbing it (spec §3.2/§3.5).
 */
export const siteId = (s: Site): string => `${s.operator}:${s.line}:${s.column}:${s.from}>${s.to}`;

/** Boundary shift: each relational operator to its adjacent form. */
const RELATIONAL: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.LessThanToken]: "<=",
  [ts.SyntaxKind.LessThanEqualsToken]: "<",
  [ts.SyntaxKind.GreaterThanToken]: ">=",
  [ts.SyntaxKind.GreaterThanEqualsToken]: ">",
};

const EQUALITY: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "!==",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "===",
};

const LOGICAL: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.AmpersandAmpersandToken]: "||",
  [ts.SyntaxKind.BarBarToken]: "&&",
};

/** `{m,n}` inside a regex literal or a RegExp-constructor source string. */
const QUANTIFIER = /\{(\d+),(\d+)\}/g;

/**
 * A literal node whose TEXT may carry a regex quantifier. `regex-quantifier-bound`
 * is the only operator that reaches inside literal text, and only for this shape
 * — `RegExp` sources in this repo are written as both regex literals and strings
 * (`lib/specLint/taskContract.ts:33,39`), so both must be walked.
 */
const carriesRegexSource = (node: ts.Node): boolean =>
  ts.isRegularExpressionLiteral(node) ||
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node);

/**
 * Statements whose removal still compiles. A `VariableStatement` is excluded
 * deliberately: removing a declaration breaks every later reference, so the
 * mutant is killed by the typechecker no matter what the suite asserts, and a
 * guaranteed-killed mutant inflates the score without testing anything.
 */
const isRemovableStatement = (node: ts.Node): boolean =>
  ts.isExpressionStatement(node) || ts.isContinueStatement(node) || ts.isBreakStatement(node);

/**
 * Enumerate every mutation site the given operators produce for `text`.
 *
 * `operators` is the per-surface subset declared in the registry, so a surface
 * may enrol fewer than all six without the generator emitting the rest.
 */
export function enumerateSites(
  sourcePath: string,
  text: string,
  operators: readonly OperatorName[],
): Site[] {
  const enabled = new Set(operators);
  const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const sites: Site[] = [];

  const push = (
    operator: OperatorName,
    start: number,
    end: number,
    replacement: string,
    from: string,
    to: string,
  ): void => {
    if (!enabled.has(operator)) return;
    const { line, character } = sf.getLineAndCharacterOfPosition(start);
    sites.push({
      operator,
      start,
      end,
      replacement,
      line: line + 1,
      column: character + 1,
      from,
      to,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const tok = node.operatorToken;
      const rel = RELATIONAL[tok.kind];
      const eq = EQUALITY[tok.kind];
      const log = LOGICAL[tok.kind];
      const operator: OperatorName | null = rel
        ? "relational-boundary"
        : eq
          ? "equality-flip"
          : log
            ? "logical-connector"
            : null;
      const to = rel ?? eq ?? log;
      if (operator && to !== undefined) {
        push(operator, tok.getStart(sf), tok.end, to, tok.getText(sf), to);
      }
    }

    // Integer literals only. A float or a numeric separator would need its own
    // rewrite rule, and silently mangling one would be a wrong mutant rather
    // than a missing one.
    if (ts.isNumericLiteral(node) && /^\d+$/.test(node.text)) {
      const to = String(Number(node.text) + 1);
      push("integer-literal", node.getStart(sf), node.end, to, node.text, to);
    }

    if (carriesRegexSource(node)) {
      const raw = node.getText(sf);
      const base = node.getStart(sf);
      QUANTIFIER.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = QUANTIFIER.exec(raw)) !== null) {
        const to = `{${m[1]},${Number(m[2]) + 1}}`;
        push("regex-quantifier-bound", base + m.index, base + m.index + m[0].length, to, m[0], to);
      }
    }

    if (isRemovableStatement(node)) {
      const start = node.getStart(sf);
      push("statement-removal", start, node.end, "", node.getText(sf), "(removed)");
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return sites;
}

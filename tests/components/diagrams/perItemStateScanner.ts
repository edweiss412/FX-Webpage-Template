/**
 * tests/components/diagrams/perItemStateScanner.ts
 *
 * Enumerates EVERY `useState` and `useRef` declaration in a component source.
 *
 * The enumeration is deliberately unfiltered. Spec §4.0.3 rejected an earlier
 * closure that grepped declaration TEXT for `Map`, `Set` or `id`: that is a
 * lexical scan, it cannot see a `Record<string, number>` or an object literal,
 * and it missed three members that already existed. A cover has to enumerate
 * everything and let a registry classify; anything else fails open on the shapes
 * nobody thought of.
 *
 * Parsing is by TypeScript's own AST rather than by regex, so a declaration
 * spanning lines, carrying comments, or using an unusual generic is still one
 * declaration.
 */
import ts from "typescript";

export type StateDecl = {
  /** The declared binding: `failedKeys` for `const [failedKeys, setFailedKeys] = useState(...)`. */
  name: string;
  /** `useState` or `useRef`. */
  hook: "useState" | "useRef";
  /** 1-based line of the declaration. */
  line: number;
};

/** Every `useState`/`useRef` declaration in `source`, in source order. */
export function scanStateDeclarations(source: string, fileName = "component.tsx"): StateDecl[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: StateDecl[] = [];

  /**
   * Strip the wrappers an ordinary edit puts around a hook call.
   *
   * Plan review R4 ran executed mutants and every one of these got PAST the
   * scanner: `(useState(...))`, `useState(...) as Foo`, `useRef(...)!`. A
   * recognizer that sees only a bare `CallExpression` fails OPEN on each, which
   * is the one direction a cover must never fail.
   */
  const unwrap = (e: ts.Expression): ts.Expression => {
    let cur: ts.Expression = e;
    for (;;) {
      if (
        ts.isParenthesizedExpression(cur) ||
        ts.isAsExpression(cur) ||
        ts.isNonNullExpression(cur) ||
        ts.isSatisfiesExpression(cur) ||
        ts.isTypeAssertionExpression(cur)
      ) {
        cur = cur.expression;
        continue;
      }
      return cur;
    }
  };

  const visit = (node: ts.Node): void => {
    // The VariableDeclaration guard stays in scope for the whole body, because
    // `node.name` below needs it; only the initializer is unwrapped.
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrap(node.initializer);
      if (!ts.isCallExpression(init)) {
        ts.forEachChild(node, visit);
        return;
      }
      const callee = unwrap(init.expression);
      // `React.useState`, `React["useState"]` and a bare `useState` all name the
      // same hook. The computed form was another R4 mutant that got past.
      const hookName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isElementAccessExpression(callee) &&
              callee.argumentExpression !== undefined &&
              ts.isStringLiteralLike(callee.argumentExpression)
            ? callee.argumentExpression.text
            : "";
      if (hookName === "useState" || hookName === "useRef") {
        // `const [x, setX] = useState()` binds an array pattern; the FIRST
        // element is the value. `const xRef = useRef()` binds an identifier.
        let name: string | null = null;
        if (ts.isIdentifier(node.name)) name = node.name.text;
        else if (ts.isArrayBindingPattern(node.name)) {
          const first = node.name.elements[0];
          if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
            name = first.name.text;
          }
        }
        if (name !== null) {
          out.push({
            name,
            hook: hookName,
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

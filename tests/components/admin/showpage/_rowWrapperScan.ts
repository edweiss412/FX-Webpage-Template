/**
 * tests/components/admin/showpage/_rowWrapperScan.ts
 *
 * AST scanner for the Careful row wrappers.
 *
 * Was a regex; adversarial review broke that three ways in one round, and all
 * three were failures of LEXING rather than of the rule being checked:
 *   - a `>` inside an attribute value (`data-note="width > zero"`) truncated the
 *     tag match, so a contract-correct wrapper produced zero openings;
 *   - a wrapper spelled inside a COMMENT supplied a clean decoy opening while
 *     the real one was ignored;
 *   - `ref={(n) => n?.addEventListener("contextmenu", …)}` attaches a native
 *     listener with neither an `on*` prop nor a spread.
 *
 * A real parse removes the first two by construction — comments are not JSX and
 * attribute values are not tag terminators — and lets the third be checked as
 * what it is: an attribute named `ref`.
 */
import ts from "typescript";

/** The wrapper's prescribed class list, as a single literal string attribute.
 *  A source-form contract (documented in the plan): written literally, never
 *  assembled, so the scan can bind to it. */
export const WRAPPER_CLASS_VALUE = "flex w-full flex-col gap-2";

export type WrapperFinding = {
  /** 1-based line of the wrapper's opening element. */
  line: number;
  /** Attribute names that attach behavior: `on*`, `ref`, or a JSX spread. */
  offending: string[];
};

export type WrapperScan = {
  /** One entry per wrapper element found in the parsed source. */
  found: WrapperFinding[];
};

const isWrapperOpening = (node: ts.JsxOpeningLikeElement): boolean =>
  node.attributes.properties.some(
    (attr) =>
      ts.isJsxAttribute(attr) &&
      attr.name.getText() === "className" &&
      attr.initializer !== undefined &&
      ts.isStringLiteral(attr.initializer) &&
      attr.initializer.text === WRAPPER_CLASS_VALUE,
  );

function offendingAttributes(node: ts.JsxOpeningLikeElement): string[] {
  const out: string[] = [];
  for (const attr of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      // `const p = { onDoubleClick: fn }; <div {...p}>` hides a handler from any
      // attribute-name check.
      out.push("{...spread}");
      continue;
    }
    if (!ts.isJsxAttribute(attr)) continue;
    const name = attr.name.getText();
    // `ref` can attach a native listener imperatively, which is neither an
    // `on*` prop nor a spread.
    if (/^on[A-Z]/.test(name) || name === "ref") out.push(name);
  }
  return out;
}

export function scanRowWrappers(src: string, fileName = "probe.tsx"): WrapperScan {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: WrapperFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      isWrapperOpening(node)
    ) {
      found.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        offending: offendingAttributes(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { found };
}

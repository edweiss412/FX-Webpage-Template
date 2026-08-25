// @vitest-environment node
import { Project, ScriptTarget, SyntaxKind, type Node } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  attributeAlwaysPresent,
  classifyExpression,
  marksUnconditionally,
} from "./_renderFaultScan";

/**
 * The hop into a shared component is only sound for a component that marks on
 * EVERY render. This pins the discrimination itself, because the live tree
 * cannot: no shipped fault branch currently renders a marking component without
 * passing the prop, so `_metaRenderFaultMarking` stays green either way and
 * would not notice this predicate being deleted.
 */
function returnedJsxOf(source: string): Node {
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
    useInMemoryFileSystem: true,
  });
  const file = project.createSourceFile("probe.tsx", source);
  const returned = file.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression();
  if (returned === undefined) throw new Error("fixture has no returned expression");
  return returned;
}

describe("the component hop distinguishes an always-on marker from a call-site one", () => {
  it("refuses a component that spreads an optional prop", () => {
    // React omits an attribute whose value is `undefined`, so a call site that
    // passes no prop renders NO marker. Counting this component as marked is a
    // false negative: an unmarked fault branch would satisfy the meta-test while
    // the capture saw nothing at all.
    const jsx = returnedJsxOf(`
      function FailureSurface({ renderFault }: { renderFault?: string | undefined }) {
        return <div data-render-fault={renderFault}>failed</div>;
      }
    `);
    expect(marksUnconditionally(jsx)).toBe(false);
  });

  it("accepts a template literal, which always produces a string", () => {
    // SectionTileError's real shape. The value depends on a prop, but the
    // ATTRIBUTE is always present, which is the property the hop needs.
    const jsx = returnedJsxOf(`
      function SectionTileError({ domain }: { domain: string }) {
        return <div data-render-fault={\`tile-\${domain}\`}>failed</div>;
      }
    `);
    expect(marksUnconditionally(jsx)).toBe(true);
  });

  it("accepts a plain string literal", () => {
    const jsx = returnedJsxOf(`
      function Fixed() {
        return <div data-render-fault="always">failed</div>;
      }
    `);
    expect(marksUnconditionally(jsx)).toBe(true);
  });

  it("accepts a computed expression that cannot be undefined", () => {
    // Narrowness is deliberate: only a BARE identifier can arrive undefined
    // from a call site. Widening this to any expression would start refusing
    // correct implementations.
    const jsx = returnedJsxOf(`
      function Computed({ kind }: { kind: string }) {
        return <div data-render-fault={kind || "fallback"}>failed</div>;
      }
    `);
    expect(marksUnconditionally(jsx)).toBe(true);
  });

  it("accepts the prop spelling at a component boundary", () => {
    const jsx = returnedJsxOf(`
      function Caller() {
        return <FailureSurface renderFault="staged-preview-lookup" />;
      }
    `);
    expect(marksUnconditionally(jsx)).toBe(true);
  });
});

describe("marker detection counts only what React actually renders", () => {
  // Probed at whole-diff review r4b: text-matching the JSX source counted a
  // JSX COMMENT mentioning the prop, and counted values React omits. A false
  // positive here is worse than a miss, because it certifies coverage that does
  // not exist -- the capture would sail past a fault branch reporting it marked.
  const opening = (source: string): Node => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.tsx", source);
    const el =
      file.getFirstDescendantByKind(SyntaxKind.JsxSelfClosingElement) ??
      file.getFirstDescendantByKind(SyntaxKind.JsxOpeningElement);
    if (el === undefined) throw new Error("fixture has no JSX element");
    return el;
  };

  it.each([
    ["a string literal", '<div data-render-fault="x" />', true],
    ["a template literal", "<div data-render-fault={`tile-${d}`} />", true],
    ["a bare attribute", "<div data-render-fault />", true],
    ["an undefined value", "<div data-render-fault={undefined} />", false],
    [
      "a conditional with an undefined arm",
      '<div data-render-fault={f ? "x" : undefined} />',
      false,
    ],
    ["a logical and", '<div data-render-fault={reason && "x"} />', false],
    ["a bare optional prop", "<div data-render-fault={renderFault} />", false],
  ])("treats %s as present=%s", (_label, source, expected) => {
    expect(attributeAlwaysPresent(opening(source))).toBe(expected);
  });
});

describe("round 5b: polarity is decided in ONE place, and every path goes through it", () => {
  // The repair that mattered here was not another clause. Round 4b fixed the
  // DIRECT binary comparison and left four shortcuts that reached the same
  // conclusion by other routes: a predicate registered because its text
  // MENTIONS the fault literal, a one-hop initializer classified by substring,
  // and disjunctions accepted on one side. Each is now funnelled through this
  // one function, so a healthy branch cannot be enrolled as a fault branch and
  // pressured to carry a marker that would refuse healthy captures.
  const classify = (guard: string): unknown => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.ts", `const _x = ${guard};`);
    const expression = file.getVariableDeclarationOrThrow("_x").getInitializerOrThrow();
    return classifyExpression(expression, new Set<string>());
  };

  it.each([
    ['result.kind === "infra_error"', true],
    ['result.kind !== "infra_error"', false],
    ['!(result.kind === "infra_error")', false],
    ['result.kind === "infra_error" || result.kind === "ok"', false],
    ['result.kind === "infra_error" && ready', true],
  ])("classifies %s as a fault guard = %s", (guard, expected) => {
    expect(classify(guard) !== null).toBe(expected);
  });
});

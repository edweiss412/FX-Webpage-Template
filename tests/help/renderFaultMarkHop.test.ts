// @vitest-environment node
import { Project, ScriptTarget, SyntaxKind, type Node } from "ts-morph";
import { describe, expect, it } from "vitest";
import { marksUnconditionally } from "./_renderFaultScan";

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

// @vitest-environment node
import { Project, ScriptTarget, SyntaxKind, type Node } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  attributeAlwaysPresent,
  attributeCanRender,
  classifyExpression,
  componentRendersMarker,
  infraPredicateNames,
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

/**
 * Round 6b found a substring fallback surviving INSIDE the polarity funnel: if
 * `classifyExpression` declined an initializer, the next line re-classified it
 * as `tile-errors` merely because its text mentioned the literal. That skipped
 * the negation and disjunction rules the funnel exists to apply, so a
 * healthy-capable guard was enrolled as a fault guard and its branch would have
 * been pressured to carry a marker that refuses healthy captures.
 *
 * These fixtures need a PRECEDING declaration, because the defect only shows on
 * the one-hop path where the guard is an identifier resolved to an initializer.
 */
describe("the one-hop polarity path applies the rules, it does not substring", () => {
  const classifyHop = (prelude: string, guard: string): unknown => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.ts", `${prelude}\nconst _x = ${guard};`);
    const expression = file.getVariableDeclarationOrThrow("_x").getInitializerOrThrow();
    return classifyExpression(expression, new Set<string>());
  };

  it.each([
    // The reviewer's two probes, verbatim in shape. Both mention `tileErrors`
    // and both can be TRUE on a healthy render, so neither is a fault guard.
    ["negated one-hop", "const healthy = !tileErrors.length;", "healthy"],
    ["mixed disjunction one-hop", "const mixed = tileErrors.length || ready;", "mixed"],
  ])("does not classify a %s as a fault guard", (_label, prelude, guard) => {
    expect(classifyHop(prelude, guard)).not.toBe("tile-errors");
  });

  it("still classifies a genuine one-hop fault guard", () => {
    // The narrowing must not cost the real case: without this, deleting the
    // whole one-hop path would pass the two cases above.
    expect(classifyHop("const bad = tileErrors.length > 0;", "bad")).toBe("tile-errors");
  });
});

/**
 * Resolution is by DECLARATION, so an aliased import must resolve to the
 * declaration it names. It did not: the set recorded the declaration's spelling
 * while the call site was compared by its LOCAL spelling, so an aliased
 * predicate was neither accepted nor reported. Silently skipped is the one
 * outcome the consequence bound forbids.
 */
describe("imported predicate aliases resolve to their declaration", () => {
  const namesFor = (importLine: string): Set<string> => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      "predicates.ts",
      `export const isInfraError = (v: { kind: string }): v is { kind: "infra_error" } =>
         v.kind === "infra_error";`,
    );
    const file = project.createSourceFile("probe.ts", `${importLine}\nexport const _u = 1;`);
    return infraPredicateNames(file);
  };

  it("registers the LOCAL alias, not only the declared name", () => {
    expect(namesFor(`import { isInfraError as bad } from "./predicates";`).has("bad")).toBe(true);
  });

  it("still registers an unaliased import under its own name", () => {
    expect(namesFor(`import { isInfraError } from "./predicates";`).has("isInfraError")).toBe(true);
  });
});

/**
 * `attributeCanRender` answers the HAND-MARKED site's question -- can this
 * marker ever reach the DOM -- which is not the shared component's question.
 * Conflating them fails correct code: the canonical hand shape is conditional
 * on the fault flag by design.
 */
describe("attributeCanRender separates a conditional marker from an impossible one", () => {
  const el = (jsx: string): Node => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.tsx", `const _x = ${jsx};`);
    const node =
      file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)[0] ??
      file.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)[0];
    if (node === undefined) throw new Error("fixture has no JSX element");
    return node;
  };

  it.each([
    ['<div data-render-fault="x" />', true],
    ['<div renderFault={isInfra ? "telemetry-events" : undefined} />', true],
    ["<div data-render-fault={flag} />", true],
    ['<div data-render-fault={cond && "x"} />', true],
    // Can NEVER render: React omits an attribute whose value is `undefined`.
    ["<div data-render-fault={undefined} />", false],
    ["<div renderFault={undefined} />", false],
    ["<div data-render-fault={cond ? undefined : undefined} />", false],
    ["<div data-render-fault={null} />", false],
    ["<div />", false],
  ])("%s can render: %s", (jsx, expected) => {
    expect(attributeCanRender(el(jsx))).toBe(expected);
  });

  it("is WEAKER than attributeAlwaysPresent, not a synonym for it", () => {
    // The distinction this whole predicate exists for. If someone collapses the
    // two, this fails rather than the failure surfacing on a live component.
    const conditional = el('<div renderFault={isInfra ? "telemetry-events" : undefined} />');
    expect(attributeCanRender(conditional)).toBe(true);
    expect(attributeAlwaysPresent(conditional)).toBe(false);
  });
});

/**
 * The component hop's own certification, pinned directly.
 *
 * The live tree CANNOT discriminate this: no shipped fault branch renders a
 * marking component without passing the prop, so the census stays green whether
 * the predicate works or not. That is exactly why round 6b found the hop
 * certifying components that render no marker at all, and why these cases are
 * the only thing standing under the repair.
 *
 * The defect was a pair. `MARKER.test(subtreeText)` matched the attribute's
 * NAME anywhere in the text, a comment included; `marksUnconditionally` then
 * answered "if the root carries a marker, is it always present", which is
 * vacuously TRUE when the root carries none. Text-presence plus vacuous
 * unconditionality read as "marked".
 */
describe("the component hop certifies only a component that really marks", () => {
  const componentIn = (source: string, name: string): boolean => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.tsx", source);
    return componentRendersMarker(file, name);
  };

  it("refuses a component whose only marker is in a COMMENT", () => {
    // The round-6b probe: markerRegexMatches true, rootAlwaysPresent false,
    // and the pair certified it anyway.
    expect(
      componentIn(
        `function Note() {
           return <div>{/* data-render-fault= threaded by the caller */}failed</div>;
         }`,
        "Note",
      ),
    ).toBe(false);
  });

  it("refuses a component whose LATER return is unmarked", () => {
    // Only the first return was inspected, so this read as marked. A component
    // marks on every render only if every exit does.
    expect(
      componentIn(
        `function Maybe({ bad }: { bad: boolean }) {
           if (bad) return <div data-render-fault="x">failed</div>;
           return <div>fine</div>;
         }`,
        "Maybe",
      ),
    ).toBe(false);
  });

  it("accepts a component whose every return is marked", () => {
    // The narrowing must not reject a correct component, or the guard trades a
    // false negative for a false positive and the census fails on real code.
    expect(
      componentIn(
        `function Always({ bad }: { bad: boolean }) {
           if (bad) return <div data-render-fault="x">failed</div>;
           return <div data-render-fault="y">also failed</div>;
         }`,
        "Always",
      ),
    ).toBe(true);
  });

  it("refuses a component that returns no JSX at all", () => {
    // `every` over an empty list is TRUE, so without the non-empty guard this
    // certifies a component that renders nothing.
    expect(componentIn(`function Empty() { return null; }`, "Empty")).toBe(false);
  });
});

/**
 * Round 7 found three defects in the round-6b repairs. Each is pinned here with
 * the reviewer's own probe, because each survived a repair that was believed to
 * close its class -- which is the recurring shape of this whole review.
 */
describe("the round-7 repairs", () => {
  const componentIn = (source: string, name: string): boolean => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.tsx", source);
    return componentRendersMarker(file, name);
  };

  // 1. The ancestry walk is bounded BY the root, so it can never inspect the
  //    root. An embedded local that is itself conditional slipped through the
  //    hop that had just been repaired to catch exactly this.
  it.each([
    ["ternary with a null arm", `cond ? <b data-render-fault="x" /> : null`],
    ["logical and", `cond && <b data-render-fault="x" />`],
    ["logical or with an unmarked arm", `other || <b data-render-fault="x" />`],
    ["nullish with an unmarked arm", `other ?? <b data-render-fault="x" />`],
  ])("refuses an embedded local whose root is a %s", (_label, expression) => {
    expect(
      componentIn(
        `function Host() {
           const note = ${expression};
           return <div>{note}</div>;
         }`,
        "Host",
      ),
    ).toBe(false);
  });

  it("still accepts an embedded local marked on BOTH ternary arms", () => {
    // Both arms mark, so the DOM gets a marker whichever way it goes. Without
    // this the repair could just refuse every conditional root and pass.
    expect(
      componentIn(
        `function Host() {
           const note = cond ? <b data-render-fault="x" /> : <i data-render-fault="y" />;
           return <div>{note}</div>;
         }`,
        "Host",
      ),
    ).toBe(true);
  });

  // 2. Filtering to JSX before `every` made the quantifier range over the
  //    survivors. A non-JSX exit renders no marker and must fail outright.
  it.each([
    ["null", "null"],
    ["undefined", "undefined"],
    ["false", "false"],
    ["zero", "0"],
    ["text", `"nothing to report"`],
  ])("refuses a component whose other exit returns %s", (_label, value) => {
    expect(
      componentIn(
        `function Maybe({ bad }: { bad: boolean }) {
           if (bad) return <div data-render-fault="x">failed</div>;
           return ${value};
         }`,
        "Maybe",
      ),
    ).toBe(false);
  });

  // 3. `attributeCanRender` defaults unrecognized expressions to renderable,
  //    which is the direction that lets an impossible marker certify. These
  //    wrappers all reached that default.
  const canRender = (jsx: string): boolean => {
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      useInMemoryFileSystem: true,
    });
    const file = project.createSourceFile("probe.tsx", `const _x = ${jsx};`);
    const node =
      file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)[0] ??
      file.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)[0];
    if (node === undefined) throw new Error("fixture has no JSX element");
    return attributeCanRender(node);
  };

  it.each([
    ["parenthesized undefined", "<div data-render-fault={(undefined)} />"],
    ["void 0", "<div data-render-fault={void 0} />"],
    ["as-cast undefined", "<div data-render-fault={undefined as string | undefined} />"],
    ["satisfies undefined", "<div data-render-fault={undefined satisfies undefined} />"],
    ["nested wrappers", "<div data-render-fault={((void 0))} />"],
  ])("refuses %s, which can never produce an attribute", (_label, jsx) => {
    expect(canRender(jsx)).toBe(false);
  });

  it("still accepts a wrapped value that CAN render", () => {
    // The unwrapping must defer to what it wraps, not refuse every wrapper.
    expect(canRender(`<div data-render-fault={("telemetry-events")} />`)).toBe(true);
    expect(canRender(`<div data-render-fault={code as string} />`)).toBe(true);
  });
});

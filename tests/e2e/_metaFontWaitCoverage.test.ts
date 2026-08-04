// Structural guard — every navigation is followed by a font wait, in its own
// function, before that function's first geometry read.
//
// WHY THE WAITS EXIST AT ALL. `font-display: block` makes measuring the fallback
// frame vanishingly unlikely; awaiting `document.fonts.ready` makes it
// impossible, and impossible is what the CSS Font Loading spec actually offers:
// sizes and positions are not final until that promise settles. Hand an
// unsynchronized caller a real face and it can measure a fallback frame and then
// have those metrics re-derived into a pinned figure -- WORSE than the ambient
// measurement it replaced, because the ambient one was at least stable.
//
// WHY A COUNT IS NOT ENOUGH, measured on the corpus rather than argued.
// `attention-pill-focus.spec.ts` navigates at line 104 and first reads geometry
// at 553. Hoisting the await to immediately after `goto` keeps the count at its
// expected value while settling the promise against a document with no measured
// content in it -- the exact mis-anchoring this row claims to reject.
//
// WHY NOT A PER-TEST-BODY REGION SPLIT EITHER. Navigation and geometry
// routinely live in DIFFERENT FUNCTIONS: eleven of these files put navigation
// in a helper (`boot`, `open`, `openHarness`, `sweepCell`, ...) and read
// geometry in the test callback. Associating an await inside `boot()` with a
// read in its caller needs an interprocedural call graph, which is out of
// proportion to what this protects and would either false-fail correct
// placements or silently skip those documents.
//
// SO THE ANCHOR IS THE ENCLOSING FUNCTION of each navigation. This is
// deliberately WEAKER than the spec's per-document invariant, and saying so is
// the honest framing: it guarantees every navigation is followed by a wait in
// its own function, not that every measured document is awaited before its
// first read. A helper that navigates and awaits correctly, whose caller then
// mutates the document further before measuring, satisfies this row. Nothing
// available catches that without a call graph; the per-document invariant
// remains what implementers are asked to satisfy, and this is the mechanical
// floor under it.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import ts from "typescript";

const E2E_DIR = resolve(__dirname);

/** Callers that navigate and measure; the three already-synchronized ones excepted. */
const CALLERS = [
  "agendaScheduleLayout",
  "appHealthIndicator.layout",
  "attention-pill-focus",
  "autoAppliedCardGrid.layout",
  "bulk-ignore-eyebrow.layout",
  "collapse-panel-morph",
  "compact-alert-card-layout",
  "dataQualityBadge.layout",
  "developer-toggle-layout",
  "hoverhelp-geometry",
  "pendingDiscardReal.layout",
  "pendingDiscardReflow.layout",
  "popover-clip-fit",
  "published-review-modal.layout",
  "pusher-alignment.layout",
  "section-header-layout.layout",
  "section-header-visual",
  "statusStripToggleLayout",
  "step3-review-modal.agenda",
  "step3-review-modal.interactions",
  "step3-review-modal.layout",
  "step3-review-page.layout",
  "step3-schedule-bookend-layout",
  "toggle-edge-layout",
  "wizard-blocker-modal.layout",
] as const;

const NAVIGATION = /^(goto|setContent|reload|goBack|goForward)$/;
const GEOMETRY = /^(getBoundingClientRect|boundingBox|offsetWidth|scrollWidth|clientWidth)$/;

interface Site {
  readonly kind: "navigate" | "geometry" | "wait";
  readonly pos: number;
  readonly line: number;
}

/**
 * Every navigation, geometry read and font wait, grouped by the function that
 * contains it.
 */
function sitesByFunction(source: ts.SourceFile): Map<ts.Node, Site[]> {
  const byFn = new Map<ts.Node, Site[]>();

  const enclosing = (node: ts.Node): ts.Node => {
    let n: ts.Node | undefined = node;
    while (n) {
      if (
        ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n) ||
        ts.isMethodDeclaration(n)
      ) {
        return n;
      }
      n = n.parent;
    }
    return source;
  };

  const record = (node: ts.Node, kind: Site["kind"]): void => {
    const fn = enclosing(node);
    const list = byFn.get(fn) ?? [];
    list.push({
      kind,
      pos: node.getStart(source),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
    byFn.set(fn, list);
  };

  const visit = (node: ts.Node): void => {
    // A WAIT IS THE CALL, not the `document.fonts` access inside it. The access
    // sits inside an arrow (`page.evaluate(() => document.fonts.ready)`), so
    // attributing it by its own enclosing function credits the ARROW and the
    // navigating function never matches -- which reports every correctly
    // awaited navigation as unguarded.
    if (ts.isCallExpression(node) && node.getText(source).includes("document.fonts.ready")) {
      record(node, "wait");
    }
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (NAVIGATION.test(name) && ts.isCallExpression(node.parent)) record(node, "navigate");
      else if (GEOMETRY.test(name)) record(node, "geometry");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const list of byFn.values()) list.sort((a, b) => a.pos - b.pos);
  return byFn;
}

describe("font-wait coverage", () => {
  test.each(CALLERS)("%s awaits fonts after every navigation, before geometry", (name) => {
    const file = join(E2E_DIR, `${name}.spec.ts`);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const problems: string[] = [];

    for (const sites of sitesByFunction(source).values()) {
      const navigations = sites.filter((s) => s.kind === "navigate");
      if (navigations.length === 0) continue;
      const waits = sites.filter((s) => s.kind === "wait");
      const lastNavigation = navigations[navigations.length - 1]!;

      // (a) the function that navigates must also await
      if (waits.length === 0) {
        problems.push(`navigation at line ${lastNavigation.line} with no document.fonts.ready`);
        continue;
      }
      // (b) the await must come AFTER a navigation, not be hoisted above it
      const firstNavigation = navigations[0]!;
      if (!waits.some((w) => w.pos > firstNavigation.pos)) {
        problems.push(
          `document.fonts.ready at line ${waits[0]!.line} precedes the navigation at line ` +
            `${firstNavigation.line}, so it settles against the outgoing document`,
        );
      }
      // (c) and BEFORE this function's first geometry read
      const firstGeometry = sites.find((s) => s.kind === "geometry");
      if (firstGeometry && !waits.some((w) => w.pos < firstGeometry.pos)) {
        problems.push(
          `geometry read at line ${firstGeometry.line} precedes every document.fonts.ready in ` +
            `its function, so it can measure a fallback frame`,
        );
      }
    }

    expect(problems, `${name}.spec.ts:\n  ${problems.join("\n  ")}`).toEqual([]);
  });
});

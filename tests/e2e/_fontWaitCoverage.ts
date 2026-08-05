// Pure analysis core for the font-wait structural guard. Kept beside the test
// rather than inside it so the rule can be exercised against synthetic sources
// — a guard whose only input is the corpus it guards cannot be shown to fail,
// and `_metaFontWaitCoverageMutants.test.ts` is what makes this one falsifiable.
//
// NO TEST-FRAMEWORK IMPORT MAY EVER ENTER THIS FILE, per tests/helpers/fontManifest.ts.
import ts from "typescript";

/** Navigation methods that replace the document under measurement. */
const NAVIGATION = /^(goto|setContent|reload|goBack|goForward)$/;

/**
 * Reads whose value depends on which face is resolved at the moment of the read.
 *
 * HEIGHTS ARE THE MAJORITY OF THIS CORPUS AND WERE ALL MISSING. The first
 * version listed `offsetWidth|scrollWidth|clientWidth` and no height at all,
 * which is precisely backwards for layout tests: a wrong face changes line
 * height and wraps, so height is the MORE font-sensitive axis, not the less.
 * Measured across `tests/e2e/*.spec.ts`: 47 `scrollHeight`, 46 `clientHeight`,
 * 13 `getClientRects`, 5 `offsetHeight` — 111 reads the ordering rule silently
 * exempted, including the very shape of the live defect this guard caught
 * (`statusStripToggleLayout`, a strip HEIGHT comparison, which was only seen
 * because it happened to be spelled `getBoundingClientRect`).
 *
 * Offsets are included for the same reason: a shifted baseline moves an
 * element's origin as surely as it resizes it.
 */
const GEOMETRY_NAMES = [
  "getBoundingClientRect",
  "getClientRects",
  "boundingBox",
  "offsetWidth",
  "offsetHeight",
  "offsetTop",
  "offsetLeft",
  "scrollWidth",
  "scrollHeight",
  "clientWidth",
  "clientHeight",
] as const;

const GEOMETRY = new RegExp(`^(${GEOMETRY_NAMES.join("|")})$`);
const GEOMETRY_IN_TEXT = new RegExp(`\\.(${GEOMETRY_NAMES.join("|")})\\b`);

type Kind = "navigate" | "geometry" | "wait";

interface Site {
  readonly kind: Kind;
  readonly pos: number;
  readonly line: number;
}

/**
 * Whether a call mentioning `document.fonts.ready` actually SETTLES it before
 * the next statement runs.
 *
 * The text of the promise is not the awaiting of it, and all three ways to get
 * that wrong are ordinary authoring slips rather than obfuscation:
 *
 *   page.evaluate(() => document.fonts.ready);              // never awaited
 *   await page.evaluate(() => { document.fonts.ready; });   // never returned
 *   await Promise.all([page.goto(u), page.evaluate(() => document.fonts.ready)]);
 *
 * The third is the subtlest and the most tempting: it reads like a tidy
 * parallelisation, but the wait races the navigation it is supposed to follow,
 * so it can settle against the OUTGOING document and resolve before the new one
 * has requested a face at all.
 */
function settles(call: ts.CallExpression, source: ts.SourceFile): boolean {
  // (1) The result must be consumed by an `await`, directly or through a
  //     wrapper like `Promise.all([...])`.
  let awaited = false;
  for (let n: ts.Node | undefined = call.parent; n; n = n.parent) {
    if (ts.isAwaitExpression(n)) {
      awaited = true;
      break;
    }
    // A `return` hands the promise to a caller that awaits it; anything that
    // starts a new function body means this call's value was discarded.
    if (ts.isFunctionLike(n) && !ts.isArrowFunction(n)) break;
    if (ts.isExpressionStatement(n)) break;
  }
  if (!awaited) return false;

  // (2) Inside the browser callback, the promise must be the value produced,
  //     not merely mentioned. A concise arrow body produces it; a block body
  //     needs an explicit `return`.
  const access = findFontsReadyAccess(call, source);
  if (access) {
    for (let n: ts.Node | undefined = access.parent; n && n !== call; n = n.parent) {
      if (ts.isReturnStatement(n)) break;
      if (ts.isArrowFunction(n)) {
        if (ts.isBlock(n.body)) return false;
        break;
      }
      if (ts.isFunctionLike(n)) return false;
    }
  }

  // (3) Concurrency with a navigation defeats the ordering this credits.
  for (let n: ts.Node | undefined = call.parent; n; n = n.parent) {
    if (!ts.isArrayLiteralExpression(n)) continue;
    const parent = n.parent;
    if (
      !ts.isCallExpression(parent) ||
      !/^Promise\.(all|race|allSettled|any)$/.test(parent.expression.getText(source))
    ) {
      continue;
    }
    const siblings = n.elements.filter((e) => !isAncestorOrSelf(e, call));
    if (siblings.some((e) => NAVIGATION_IN_TEXT.test(e.getText(source)))) return false;
  }

  return true;
}

const NAVIGATION_IN_TEXT = /\.(goto|setContent|reload|goBack|goForward)\s*\(/;

function isAncestorOrSelf(candidate: ts.Node, node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) if (n === candidate) return true;
  return false;
}

function findFontsReadyAccess(
  call: ts.CallExpression,
  source: ts.SourceFile,
): ts.PropertyAccessExpression | null {
  let found: ts.PropertyAccessExpression | null = null;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n) && n.getText(source).endsWith("document.fonts.ready")) {
      found = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(call, walk);
  return found;
}

/**
 * Every navigation, geometry read and font wait, grouped by the function that
 * contains it.
 *
 * ATTRIBUTION IS BY ENCLOSING CALL, NOT ENCLOSING FUNCTION, for anything that
 * can be written inside a browser-side arrow. Playwright's idiom puts the work
 * in a callback -- `page.evaluate(() => document.fonts.ready)`, `locator
 * .evaluate((n) => n.getBoundingClientRect().height)` -- and the arrow IS a
 * function, so naive attribution files the site under the arrow and the
 * navigating function never sees it.
 *
 * That was fixed for waits when the guard was written and NOT for geometry,
 * which left the ordering rule below blind to 48 of this corpus's reads: every
 * `evaluate`-wrapped measurement landed in an arrow bucket that contains no
 * navigation and is therefore skipped. Both kinds are now recorded from the
 * enclosing CALL. Direct property reads (`el.offsetWidth` in Node-side code)
 * are still recorded from the access itself, so both spellings are covered.
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

  const record = (node: ts.Node, kind: Kind): void => {
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
    if (ts.isCallExpression(node)) {
      const text = node.getText(source);
      // Record the OUTERMOST call for each: a nested match (the inner
      // `n.getBoundingClientRect()` inside an `evaluate`) also matches, but it
      // starts later, and every rule below reads the FIRST site by position.
      if (text.includes("document.fonts.ready") && settles(node, source)) record(node, "wait");
      if (GEOMETRY_IN_TEXT.test(text)) record(node, "geometry");
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

/**
 * The problems in one spec file, empty when it satisfies the rule.
 *
 * THE RULE, PER NAVIGATION rather than per function: if a navigation is
 * followed by a geometry read in the same function, some `document.fonts.ready`
 * must settle BETWEEN them.
 *
 * Checking each navigation individually is the point. The previous form asked
 * only whether SOME wait followed the FIRST navigation and SOME wait preceded
 * the FIRST geometry read — two independent `some()` calls that a single wait
 * could satisfy while a later navigation went entirely unguarded. That is the
 * exact shape of the two live defects it failed to report
 * (`statusStripToggleLayout.spec.ts:181,185`: navigate, measure, navigate,
 * measure, with one wait far above all four).
 *
 * A navigation with NO geometry read after it carries no requirement — there is
 * nothing whose value could depend on the resolved face. `agendaScheduleLayout
 * .spec.ts:409` navigates and then reads `transitionDuration`, which no font
 * affects. Demoting that case is deliberate: the alternative flags correct code
 * and teaches implementers to add waits that protect nothing.
 *
 * STILL WEAKER THAN THE SPEC'S PER-DOCUMENT INVARIANT, and the reason is
 * unchanged: navigation and measurement routinely live in different functions
 * (`boot`, `open`, `openHarness`, `sweepCell`), and pairing those needs an
 * interprocedural call graph. A helper that navigates and awaits correctly,
 * whose caller then mutates the document further before measuring, satisfies
 * this. This is the mechanical floor under the invariant, not the invariant.
 */
export function analyzeSource(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const problems: string[] = [];

  for (const sites of sitesByFunction(source).values()) {
    const navigations = sites.filter((s) => s.kind === "navigate");
    if (navigations.length === 0) continue;
    const waits = sites.filter((s) => s.kind === "wait");
    const geometry = sites.filter((s) => s.kind === "geometry");

    for (const navigation of navigations) {
      const read = geometry.find((g) => g.pos > navigation.pos);
      if (!read) continue;
      if (waits.some((w) => w.pos > navigation.pos && w.pos < read.pos)) continue;
      problems.push(
        `navigation at line ${navigation.line} is measured at line ${read.line} with no ` +
          `document.fonts.ready between them, so that read can land on a fallback frame`,
      );
    }
  }

  return problems;
}

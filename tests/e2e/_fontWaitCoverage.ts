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

/**
 * CSSOM RESOLVED geometry counts too. `getComputedStyle(el).width` on an
 * intrinsically sized text element resolves to a used value that depends on the
 * face, so it is as font-sensitive as a rect read.
 *
 * Property-scoped rather than blanket, because the same call is also how a test
 * reads properties no font affects — `transitionDuration` at
 * `agendaScheduleLayout.spec.ts:409` is the demote this guard deliberately
 * keeps.
 */
const COMPUTED_PROPERTIES = new Set(["width", "height", "inlineSize", "blockSize"]);

/**
 * Whether a call reads geometry, found through the AST rather than its text.
 *
 * Text matching was the same defect the wait side already fixed: a call's source
 * range INCLUDES the comments inside it, so a commented-out measurement read as
 * a live one and could fail correct code. Comments are not nodes.
 */
function hasGeometryAccess(call: ts.CallExpression): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n)) {
      if (GEOMETRY.test(n.name.text)) {
        found = true;
        return;
      }
      // `getComputedStyle(el).width` — resolved geometry. Property-scoped, so
      // `transitionDuration` stays the deliberate demote it has always been.
      if (
        COMPUTED_PROPERTIES.has(n.name.text) &&
        ts.isCallExpression(n.expression) &&
        n.expression.expression.getText().endsWith("getComputedStyle")
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(call, walk);
  return found;
}

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
 * The text of the promise is not the awaiting of it, and every way to get that
 * wrong here is an ordinary authoring slip rather than obfuscation:
 *
 *   page.evaluate(() => document.fonts.ready);              // never awaited
 *   await page.evaluate(() => { document.fonts.ready; });   // never returned
 *   await page.evaluate(() => { return void document.fonts.ready; });
 *   await Promise.all([page.goto(u), page.evaluate(() => document.fonts.ready)]);
 *   await Promise.race([fontsReady(page), timeout(500)]);
 *
 * The combinators are the subtle ones. `all` reads like a tidy parallelisation
 * but races the wait against the navigation it is supposed to follow, so it can
 * settle against the OUTGOING document; `race` and `any` can resolve without
 * the font promise at all.
 *
 * ACCEPTING CORRECT CODE MATTERS AS MUCH AS REJECTING WRONG CODE. An earlier
 * version of this demanded a `return` in every block body and so rejected the
 * async-callback idiom already live at `stackedBandLayout.spec.ts:85` --
 *
 *   await page.evaluate(async () => {
 *     await document.fonts.ready;
 *     await new Promise((r) => requestAnimationFrame(() => r(null)));
 *   });
 *
 * -- which is not merely valid but stronger than the concise form, since it
 * also waits a frame. A guard that fails correct code teaches contributors to
 * work around it, and a worked-around guard protects nothing.
 */
/**
 * Playwright methods whose argument runs IN THE BROWSER. A wait written inside
 * one belongs to the function that made the call, not to the callback.
 */
const BROWSER_CALLBACKS = new Set([
  "evaluate",
  "evaluateHandle",
  "$eval",
  "$$eval",
  "waitForFunction",
]);

/**
 * The call a wait should be ATTRIBUTED to: outward from the access through
 * combinators and browser callbacks, stopping before the surrounding test.
 *
 * Both directions of this were wrong in turn, which is why it is now its own
 * named idea. Recording the OUTERMOST call containing the access credited
 * `Promise.race([...])` as the wait, so the combinator check never saw its own
 * array. Recording the INNERMOST fixed that and broke attribution: a correct
 * `await page.evaluate(async () => { await Promise.all([document.fonts.ready,
 * frame]); })` filed the wait under the browser callback, and the navigating
 * test function -- which is where the navigation and the measurement both live
 * -- saw no wait at all. Correct code, reported as unguarded.
 */
function boundaryCall(access: ts.Node): ts.CallExpression | null {
  let call = nearestCall(access);
  if (!call) return null;
  for (;;) {
    const outer = nearestCall(call);
    if (!outer) return call;
    const callee = outer.expression;
    const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
    const isCombinator = /^Promise\.(all|race|allSettled|any)$/.test(callee.getText());
    if (!BROWSER_CALLBACKS.has(method) && !isCombinator) return call;
    call = outer;
  }
}

function settles(call: ts.CallExpression, source: ts.SourceFile): boolean {
  // The access is found through the AST, never the call's text. Text matching
  // credits a COMMENTED-OUT `// return document.fonts.ready` -- the comment
  // travels with the node's source range but is not a node.
  const access = findFontsReadyAccess(call);
  if (!access) return false;
  if (!produces(access, call)) return false;
  if (!consumed(call)) return false;
  // From the ACCESS, not from `call`: a combinator can sit anywhere between the
  // two, and scanning from the outer call would miss every one below it.
  return !racedOrOptional(access, source);
}

/** Whether the callback yields the promise rather than merely mentioning it. */
function produces(access: ts.Node, call: ts.CallExpression): boolean {
  for (let n: ts.Node | undefined = access; n && n !== call; n = n.parent) {
    // `void x` discards the value whatever surrounds it.
    if (ts.isVoidExpression(n)) return false;
    // Awaited inside an async callback: settled before the callback resolves.
    if (ts.isAwaitExpression(n)) return true;
    if (ts.isReturnStatement(n)) return true;
    if (ts.isArrowFunction(n)) return !ts.isBlock(n.body);
    if (ts.isFunctionLike(n)) return false;
  }
  return true;
}

/**
 * Whether the call's own promise is settled before the next statement: awaited
 * directly, awaited through a binding, or returned to a caller that awaits it.
 */
function consumed(call: ts.CallExpression): boolean {
  for (let n: ts.Node | undefined = call.parent; n; n = n.parent) {
    if (ts.isAwaitExpression(n)) return true;
    if (ts.isReturnStatement(n)) return true;
    if (ts.isArrowFunction(n) && n.body === call) return true;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      return awaitedLater(n.name.text, n);
    }
    if (ts.isFunctionLike(n)) return false;
    if (ts.isExpressionStatement(n)) return false;
  }
  return false;
}

/** `const p = evaluate(...); ...; await p;` — the alias is settled too. */
function awaitedLater(name: string, from: ts.Node): boolean {
  let scope: ts.Node | undefined = from;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  if (!scope) return false;
  let awaited = false;
  const walk = (n: ts.Node): void => {
    if (awaited) return;
    // Identifier NODE equality, anywhere inside the awaited expression.
    //
    // Two failures bracket this line and both are pinned below. Matching the
    // awaited TEXT with `includes(name)` let a one-letter alias `p` be
    // satisfied by `await page.waitForTimeout(1)` -- the wrong promise. Fixing
    // that by demanding the awaited expression BE the bare identifier then
    // rejected `await Promise.all([fontsReady])`, which settles the alias
    // perfectly well. Scanning for the identifier as a NODE accepts every way
    // an alias is legitimately consumed while `page` still never matches `p`.
    if (ts.isAwaitExpression(n) && mentionsIdentifier(n.expression, name)) {
      // ...unless the awaiting expression is a combinator that makes it
      // optional or races it with a navigation, exactly as an inline wait
      // would be.
      if (!combinatorDefeats(n.expression, name)) {
        awaited = true;
        return;
      }
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(scope, walk);
  return awaited;
}

/** Whether an identifier with this exact name appears anywhere in a subtree. */
function mentionsIdentifier(root: ts.Node, name: string): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  if (ts.isIdentifier(root)) return root.text === name;
  ts.forEachChild(root, walk);
  return found;
}

/**
 * Whether the expression awaiting an aliased wait is a combinator that defeats
 * it: `race`/`any` can settle without it, and `all`/`allSettled` beside a
 * navigation start it concurrently rather than after.
 */
function combinatorDefeats(expression: ts.Expression, name: string): boolean {
  if (!ts.isCallExpression(expression)) return false;
  const combinator = /^Promise\.(all|race|allSettled|any)$/.exec(expression.expression.getText());
  if (!combinator) return false;
  if (combinator[1] === "race" || combinator[1] === "any") return true;
  const list = expression.arguments[0];
  if (!list || !ts.isArrayLiteralExpression(list)) return false;
  return list.elements
    .filter((e) => !mentionsIdentifier(e, name))
    .some((e) => NAVIGATION_IN_TEXT.test(e.getText()) || mentionsNavigationBinding(e));
}

/** Whether an element is, or names, a binding initialised by a navigation. */
function mentionsNavigationBinding(element: ts.Expression): boolean {
  if (!ts.isIdentifier(element)) return false;
  const target = element.text;
  let found = false;
  const root = element.getSourceFile();
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === target &&
      n.initializer &&
      NAVIGATION_IN_TEXT.test(n.initializer.getText())
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(root);
  return found;
}

/**
 * Whether a Promise combinator makes this wait optional or concurrent with a
 * navigation. `race`/`any` can settle without it; `all`/`allSettled` start it
 * alongside a sibling navigation instead of after it.
 */
function racedOrOptional(from: ts.Node, source: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = from.parent; n; n = n.parent) {
    if (!ts.isArrayLiteralExpression(n)) continue;
    const parent = n.parent;
    if (!ts.isCallExpression(parent)) continue;
    const combinator = /^Promise\.(all|race|allSettled|any)$/.exec(
      parent.expression.getText(source),
    );
    if (!combinator) continue;
    // `race`/`any` resolve on the FIRST settled member, so the font promise is
    // optional regardless of what its siblings do.
    if (combinator[1] === "race" || combinator[1] === "any") return true;
    const siblings = n.elements.filter((e) => !isAncestorOrSelf(e, from));
    if (siblings.some((e) => navigates(e, source))) return true;
  }
  return false;
}

/**
 * Whether an expression performs or carries a navigation. Text covers the
 * direct call; the binding scan covers `const nav = page.goto(u)` handed to a
 * combinator by name, where the text is only an identifier.
 */
function navigates(expression: ts.Expression, source: ts.SourceFile): boolean {
  const text = expression.getText(source);
  if (NAVIGATION_IN_TEXT.test(text)) return true;
  if (!ts.isIdentifier(expression)) return false;
  const name = expression.text;
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      NAVIGATION_IN_TEXT.test(n.initializer.getText(source))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(source);
  return found;
}

const NAVIGATION_IN_TEXT = /\.(goto|setContent|reload|goBack|goForward)\s*\(/;

function isAncestorOrSelf(candidate: ts.Node, node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) if (n === candidate) return true;
  return false;
}

/** The closest enclosing call of a node, or null at the top of the tree. */
function nearestCall(node: ts.Node): ts.CallExpression | null {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) return n;
  }
  return null;
}

function findFontsReadyAccess(call: ts.CallExpression): ts.PropertyAccessExpression | null {
  let found: ts.PropertyAccessExpression | null = null;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(n) &&
      n.name.text === "ready" &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "fonts"
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(call, walk);
  return found;
}

/**
 * Names of file-local functions whose body contains a credited wait, so that
 * calling one counts as waiting.
 *
 * This is the one-level call graph the per-function anchor otherwise lacks. A
 * helper like `async function settleFonts(page) { await page.evaluate(() =>
 * document.fonts.ready); }` is the obvious way to avoid repeating the idiom,
 * and without this its callers all read as unguarded -- a false positive on the
 * tidiest version of the correct code.
 */
function waitHelpers(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const walk = (n: ts.Node): void => {
    let name: string | undefined;
    let body: ts.Node | undefined;
    if (ts.isFunctionDeclaration(n) && n.name) {
      name = n.name.text;
      body = n.body;
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      name = n.name.text;
      body = n.initializer.body;
    }
    if (name && body) {
      let hasWait = false;
      const inner = (m: ts.Node): void => {
        if (hasWait) return;
        const inAccess = ts.isCallExpression(m) ? findFontsReadyAccess(m) : null;
        if (
          ts.isCallExpression(m) &&
          inAccess &&
          nearestCall(inAccess) === m &&
          settles(m, source)
        ) {
          hasWait = true;
          return;
        }
        ts.forEachChild(m, inner);
      };
      inner(body);
      if (hasWait) names.add(name);
    }
    ts.forEachChild(n, walk);
  };
  walk(source);
  return names;
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
  const helpers = waitHelpers(source);

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
      // Record the OUTERMOST call for each: a nested match (the inner
      // `n.getBoundingClientRect()` inside an `evaluate`) also matches, but it
      // starts later, and every rule below reads the FIRST site by position.
      // The INNERMOST call containing the access, never an outer wrapper. A
      // wrapper contains the access too, so crediting it hid exactly the
      // defect the combinator check exists to find: `Promise.race([...])` was
      // itself recorded as the wait, and the walk that looks upward for a
      // combinator never saw the array sitting BELOW it.
      const access = findFontsReadyAccess(node);
      if (access && boundaryCall(access) === node && settles(node, source)) record(node, "wait");
      else if (
        ts.isIdentifier(node.expression) &&
        helpers.has(node.expression.text) &&
        // The helper waits; the CALL still has to be settled. `settleFonts(page)`
        // without `await` starts the wait and drops it, and handing it to a
        // combinator beside a navigation races it exactly as an inline wait
        // would be raced.
        consumed(node) &&
        !racedOrOptional(node, source)
      ) {
        record(node, "wait");
      }
      if (hasGeometryAccess(node)) record(node, "geometry");
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

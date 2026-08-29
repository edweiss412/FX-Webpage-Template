import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Structural adoption pin for the shared popover/overlay helpers
 * (spec 2026-08-01-admin-popover-overlay-cluster §7, §11 closure i-iv).
 *
 * The failure this guard exists to catch is NOT "the helper is missing" — it is
 * "the helper exists, is imported for show, and the consumer still runs its own
 * copy." Every rule below therefore resolves through the TYPE CHECKER rather
 * than matching identifier text: a same-named local const, a same-named function
 * PARAMETER shadowing the import, or a same-named export from a decoy module all
 * read identically to a text scan and all fail here.
 *
 * ## What this guard does NOT prove (documented limit, not an oversight)
 *
 * It does not prove LIVE-PATH adoption. Cross-model review demonstrated two
 * families of evasion with working probes, and the second survived a round of
 * tightening:
 *
 *   1. an executed decoy — `createRafCoalescer(() => {}).cancel()` on a
 *      throwaway instance, while a private class handles every real
 *      `schedule()`/`cancel()`;
 *   2. a discarded result — calling `useFitWithinClip(...)` and then attaching
 *      a private ref callback to the node instead of the returned one.
 *
 * Rules (i)-(viii) are reachability-blind by construction, so closing this
 * statically means dataflow analysis, which is not what a meta-test should be.
 * The rules here raise the cost of an accidental fork and catch every shape
 * short of a deliberate one.
 *
 * BEHAVIOURAL adoption is carried by executable tests, which a fork cannot pass
 * because they assert observable behaviour rather than structure:
 *
 *   - ShareHub coalescer      -> shareHubVisualViewport.test.tsx T-S8 (a burst
 *                                collapses to ONE frame and cancels none) and
 *                                T-S9 (unmount cancels the pending frame id).
 *   - HoverHelp coalescer     -> hoverHelpVisualViewport.test.tsx (open/closed
 *                                scheduling) and hoverHelpLifecycle.test.tsx
 *                                (close/unmount cancels the pending frame).
 *   - ReSyncButton
 *     coalescer               -> tests/e2e/published-review-modal.interactions.spec.ts,
 *                                T-OVERLAY and the three T-OVERLAY-BOUNDS
 *                                branches, which measure the placed geometry
 *                                against the real modal panel. The fit backstop
 *                                this line used to name went with the migration.
 *   - PublishedToggle
 *     coalescer               -> tests/e2e/popover-clip-fit.spec.ts, the four
 *                                "§3.6 — the module selects the side" cases,
 *                                which drive each branch of the placement
 *                                algebra against a real clip panel. The fit
 *                                backstop this line used to name went with the
 *                                migration: the banner is no longer capped by
 *                                the hook, so a unit assertion about that cap
 *                                would pin behaviour the component no longer
 *                                has.
 *   - AttentionMenu fit       -> attentionMenu.test.tsx, "the scroller is capped
 *                                against the clip ancestor, not just by the CSS
 *                                cap", plus the settled-fit browser cases in
 *                                tests/e2e/popover-clip-fit.spec.ts, which
 *                                compare the scroller's measured height against
 *                                the room actually available.
 *
 * Cited precisely on purpose. An earlier draft of this note named the browser
 * spec and the hook's own unit file as the backstop for EVERY consumer, and
 * cross-model review showed that was false: the browser spec never mounts a
 * ReSyncButton result panel, and its PublishedToggle cases assert containment
 * and overflow but not fitted HEIGHT — so a private ref writing
 * `max-height: 1px` stayed visible, contained, overflowing, tabbable and
 * scrollable, and passed. The per-consumer unit cases above are what actually
 * catch a fork. A documented limit is a claim, and a claim has to be checkable.
 *
 * Read the two layers together: this file pins the WIRING, those pin the
 * BEHAVIOUR. Neither is sufficient alone, and that is deliberate.
 */

const ROOT = process.cwd();

type AdoptionRow = {
  /** Repo-relative consumer path. */
  readonly consumer: string;
  /** Exported helper the consumer must actually CALL. */
  readonly helper: string;
  /** Exact module specifier text the import must carry. */
  readonly module: string;
  /**
   * Coalescer consumers must also route their cleanup through the shared
   * instance's `.cancel()` — keeping a raw `cancelAnimationFrame(frame)` teardown
   * means the local frame bookkeeping survived the extraction (§7).
   */
  readonly requiresCancelAdoption: boolean;
};

const ROWS: readonly AdoptionRow[] = [
  {
    consumer: "components/admin/showpage/ShareHub.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
  {
    consumer: "components/admin/HoverHelp.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
  // Migrated off the fit hook 2026-08-25 (feat/review-modal-strip-dock): the
  // refusal banner is placed by the module now, so what this consumer shares
  // with ShareHub and HoverHelp is the frame throttle rather than the cap. The
  // row moves rather than being deleted — the point of the registry is that a
  // consumer cannot quietly stop sharing a helper, and that applies just as
  // much when it starts sharing a different one.
  {
    consumer: "components/admin/PublishedToggle.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
  // BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW: this consumer moved off
  // useFitWithinClip onto placeWithinVisibleViewport 2026-08-28, and the hook
  // retired with it as its last consumer. It now coalesces its own placement
  // re-measures on the shared throttle, exactly as the other stack consumers do,
  // so the row MOVES rather than being deleted — same reason the PublishedToggle
  // and Re-sync rows moved.
  {
    consumer: "components/admin/showpage/AttentionMenu.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
  // Migrated 2026-08-25 with PublishedToggle: three overlays, three placement
  // effects, all sharing the frame throttle. Moves rather than being deleted,
  // for the same reason the PublishedToggle row moved.
  {
    consumer: "components/admin/ReSyncButton.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
];

/**
 * Names that must never be DECLARED inside a consumer — in any form. Importing
 * them is the point; re-declaring one is the local copy coming back.
 */
const NEVER_DECLARED_IN_CONSUMERS = [
  "createRafCoalescer",
] as const;

/**
 * Where each shared name is legitimately DECLARED. Rule (iii) has to exempt a
 * name in its own defining module or it reports the definition itself as a local
 * copy. The exemption is per NAME, not per file.
 *
 * `useFitWithinClip` and `findClippingAncestor` were rows here until 2026-08-28,
 * when the hook that defined both retired with its last consumer
 * (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW). A name with no defining module is
 * not a name this guard can police, so they leave rather than dangle.
 */
const DEFINING_MODULE: Readonly<Record<string, string>> = {
  createRafCoalescer: "lib/popover/rafCoalescer.ts",
};

/** The shared coalescer's semantic marker comment. Exactly one source file may carry it. */
const COALESCER_MARKER = "cleared BEFORE running";

const CONSUMER_FILES = [...new Set(ROWS.map((r) => r.consumer))];

/**
 * Roots are the consumer files only. `noResolve` keeps the program from pulling
 * React and the rest of the graph in (this pin asks only about bindings declared
 * IN the consumer), and local alias symbols for import specifiers are bound
 * regardless of whether the target module resolves — which is what lets the RED
 * observation be "no import specifier" rather than a crash.
 */
function buildProgram(): ts.Program {
  return ts.createProgram({
    rootNames: CONSUMER_FILES.map((f) => resolve(ROOT, f)),
    options: {
      noResolve: true,
      noLib: true,
      skipLibCheck: true,
      allowJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
}

const program = buildProgram();
const checker = program.getTypeChecker();

function sourceOf(consumer: string): ts.SourceFile {
  const sf = program.getSourceFile(resolve(ROOT, consumer));
  if (!sf) throw new Error(`consumer not in program: ${consumer}`);
  return sf;
}

/** Every `import { x } from "mod"` specifier in this file, as declared nodes. */
function importSpecifiers(source: ts.SourceFile): ts.ImportSpecifier[] {
  const out: ts.ImportSpecifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function specifierMatches(
  spec: ts.ImportSpecifier,
  importedName: string,
  moduleText: string,
): boolean {
  if ((spec.propertyName ?? spec.name).text !== importedName) return false;
  const decl = spec.parent.parent.parent;
  return ts.isStringLiteral(decl.moduleSpecifier) && decl.moduleSpecifier.text === moduleText;
}

/**
 * Rule (ii): some call in `source` has a callee whose RAW symbol declares at an
 * ImportSpecifier in THIS file for `importedName` from exactly `moduleText`.
 *
 * The symbol is deliberately NOT alias-resolved: `getAliasedSymbol` would walk
 * through the import to the shared module's FunctionDeclaration, which is never
 * an ImportSpecifier, and would reject every legitimate consumer.
 */
function callResolvesToImport(
  source: ts.SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const sym = checker.getSymbolAtLocation(node.expression);
      const decl = sym?.declarations?.[0];
      if (
        decl &&
        ts.isImportSpecifier(decl) &&
        decl.getSourceFile() === source &&
        specifierMatches(decl, importedName, moduleText)
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Rule (v): a `<receiver>.cancel()` whose receiver is a variable holding the imported factory's result. */
function cancelRoutesThroughSharedInstance(
  source: ts.SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "cancel"
    ) {
      const receiverSym = checker.getSymbolAtLocation(node.expression.expression);
      for (const decl of receiverSym?.declarations ?? []) {
        if (!ts.isVariableDeclaration(decl) || !decl.initializer) continue;
        const init = decl.initializer;
        if (!ts.isCallExpression(init)) continue;
        const factorySym = checker.getSymbolAtLocation(init.expression);
        const factoryDecl = factorySym?.declarations?.[0];
        if (
          factoryDecl &&
          ts.isImportSpecifier(factoryDecl) &&
          factoryDecl.getSourceFile() === source &&
          specifierMatches(factoryDecl, importedName, moduleText)
        ) {
          found = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Rule (iii): declarations of a forbidden name, in every form that can shadow an import. */
function declarationsOfName(source: ts.SourceFile, name: string): string[] {
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    const named =
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isParameter(node);
    if (named && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      hits.push(`${ts.SyntaxKind[node.kind]} at line ${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/**
 * Rule (vi): a constant-false conditional. These exist for exactly one reason in
 * a consumer — to park an unreachable "adoption token" that satisfies an
 * existence-based rule while the live path runs a private copy.
 */
function constantFalseBranches(source: ts.SourceFile): string[] {
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) {
      const c = node.expression;
      const dead =
        c.kind === ts.SyntaxKind.FalseKeyword ||
        (ts.isNumericLiteral(c) && c.text === "0") ||
        (ts.isPrefixUnaryExpression(c) &&
          c.operator === ts.SyntaxKind.ExclamationToken &&
          (c.operand.kind === ts.SyntaxKind.TrueKeyword ||
            (ts.isNumericLiteral(c.operand) && c.operand.text === "1")));
      if (dead) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        hits.push(`line ${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/**
 * Rule (vii): a LOCAL re-implementation, detected by SHAPE rather than by name.
 * The escaping mutant that motivated this renamed its copy `localRafCoalescer`,
 * so the name-based rule (iii) never fired. Any local factory returning an
 * object literal that exposes both `schedule` and `cancel` is a coalescer,
 * whatever it is called.
 */
function localCoalescerShapes(source: ts.SourceFile): string[] {
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isObjectLiteralExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node)
    ) {
      const members = ts.isObjectLiteralExpression(node) ? node.properties : node.members;
      const names = new Set(
        members
          .map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : null))
          .filter((n): n is string => n !== null),
      );
      if (names.has("schedule") && names.has("cancel")) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        hits.push(`line ${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/**
 * Rule (viii): the instance that is cancelled must be the instance that is
 * scheduled. Two different objects satisfying (ii) and (v) separately is exactly
 * the dead-token shape.
 */
function scheduleAndCancelShareAnInstance(source: ts.SourceFile): boolean {
  const scheduled = new Set<ts.Symbol>();
  const cancelled = new Set<ts.Symbol>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const member = node.expression.name.text;
      if (member === "schedule" || member === "cancel") {
        const sym = checker.getSymbolAtLocation(node.expression.expression);
        if (sym) (member === "schedule" ? scheduled : cancelled).add(sym);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const sym of cancelled) if (scheduled.has(sym)) return true;
  return false;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".claude",
  "coverage",
  "dist",
  "test-results",
  "playwright-report",
  "public",
  "supabase",
]);

/** Every .ts/.tsx source file in the repo. */
function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".claude") {
      if (entry.isDirectory()) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSources(full, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("shared helper adoption (spec §7, §11 closure)", () => {
  describe.each(ROWS.map((r) => [`${r.consumer} → ${r.helper}`, r] as const))(
    "%s",
    (_label, row) => {
      it("(i) imports the helper from the shared module", () => {
        const source = sourceOf(row.consumer);
        const matching = importSpecifiers(source).filter((s) =>
          specifierMatches(s, row.helper, row.module),
        );
        expect(
          matching.length,
          `${row.consumer} must import { ${row.helper} } from "${row.module}"`,
        ).toBeGreaterThan(0);
      });

      it("(ii) CALLS the imported helper (checker-resolved, not by name)", () => {
        const source = sourceOf(row.consumer);
        expect(
          callResolvesToImport(source, row.helper, row.module),
          `${row.consumer} has no call whose callee resolves to its "${row.module}" import of ${row.helper} — a same-named local, parameter, or decoy-module import does not count`,
        ).toBe(true);
      });

      it("(vi) parks no adoption token behind a constant-false branch", () => {
        const source = sourceOf(row.consumer);
        const dead = constantFalseBranches(source);
        expect(
          dead,
          `${row.consumer} has unreachable if-blocks at ${dead.join(", ")}; the only use for one here is smuggling a call that satisfies the adoption rules without ever running`,
        ).toEqual([]);
      });

      if (row.requiresCancelAdoption) {
        it("(vii) declares no local coalescer SHAPE, whatever it is named", () => {
          const source = sourceOf(row.consumer);
          const shapes = localCoalescerShapes(source);
          expect(
            shapes,
            `${row.consumer} builds an object exposing both schedule and cancel at ${shapes.join(", ")} — that is a private coalescer, and renaming it is not adoption`,
          ).toEqual([]);
        });

        it("(viii) the cancelled instance is the scheduled instance", () => {
          const source = sourceOf(row.consumer);
          expect(
            scheduleAndCancelShareAnInstance(source),
            `${row.consumer} schedules one object and cancels another — an existence-only pin passes that while the live path runs a private copy`,
          ).toBe(true);
        });
      }

      if (row.requiresCancelAdoption) {
        it("(v) cleanup cancels through the shared instance, not a raw frame id", () => {
          const source = sourceOf(row.consumer);
          expect(
            cancelRoutesThroughSharedInstance(source, row.helper, row.module),
            `${row.consumer} never calls .cancel() on a value produced by ${row.helper}() — the local cancelAnimationFrame teardown survived the extraction`,
          ).toBe(true);
        });
      }
    },
  );

  it("(iii) no consumer re-declares a shared helper name in any form", () => {
    const offences: string[] = [];
    for (const consumer of CONSUMER_FILES) {
      const source = sourceOf(consumer);
      for (const name of NEVER_DECLARED_IN_CONSUMERS) {
        if (DEFINING_MODULE[name] === consumer) continue;
        for (const where of declarationsOfName(source, name)) {
          offences.push(`${consumer}: ${name} declared as ${where}`);
        }
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it(`(iv) the marker comment "${COALESCER_MARKER}" lives in exactly one source file`, () => {
    const carriers = walkSources(ROOT)
      .filter((f) => readFileSync(f, "utf8").includes(COALESCER_MARKER))
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith("tests/"))
      .sort();
    expect(carriers, `carriers: ${carriers.join(", ") || "(none)"}`).toEqual([
      "lib/popover/rafCoalescer.ts",
    ]);
  });
});

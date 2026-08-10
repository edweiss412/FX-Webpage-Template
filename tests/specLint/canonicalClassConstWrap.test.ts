// The nine class-string consts the canonical-class lint rule could not see, pinned as
// `cn(...)` calls.
//
// Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.3
// Plan: docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md, Task A3
//
// THE BLIND SPOT, from the entry's probe matrix. `better-tailwindcss/enforce-canonical-classes`
// traverses recognized callees (`cn`, `clsx`, `cva`, …) and direct JSX string attributes.
// It does NOT traverse a bare `const X = "…"` initializer or an object VALUE, so Tailwind
// drift inside one escapes `pnpm lint` and therefore CI. Nine such consts shipped across
// three files; `THUMB_BASE` had already drifted to `h-5 w-5` where its three sibling
// switches say `size-5`, which is exactly the class of defect the rule exists to report.
//
// THE REPAIR IS THE WRAP. `cn` of a single string is that string, so runtime is unchanged
// and the rule starts traversing. Renaming to `classes` (the plugin's other recognized
// shape) cannot serve nine consts across three files.
//
// WHY THIS FILE IS AN ENUMERATION AND THAT IS DELIBERATE. The lint rule itself is the
// derived cover for class-string drift — this guard's whole job is keeping these nine
// SPECIFIC declarations inside the rule's reach. Spec §4 limit 2 fences the residue: the
// plugin's `cn(IDENT)` blind spot is upstream behavior this arc does not change, and a
// future const that dodges both the implementation-time census shape and the rule files as
// a NEW instance rather than a regression of this work. The census was run at
// implementation time and its dispositions are in the PR body.
//
// Each row's premise is that the declaration is FOUND: a rename or a move must fail loudly
// here rather than leave a row asserting nothing.

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";

const ROOT = process.cwd();

/**
 * The nine sites. `kind` is the initializer shape the row expects — asserting the shape as
 * well as the wrap means a `Record` silently collapsed to a single string (or the reverse)
 * fails here rather than passing a check written for the other shape.
 */
const SITES = [
  {
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    name: "TRACK_BASE",
    kind: "string",
    scope: "<module>",
  },
  {
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    name: "THUMB_BASE",
    kind: "string",
    scope: "<module>",
  },
  {
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    name: "TAP_TARGET",
    kind: "string",
    scope: "<module>",
  },
  {
    file: "components/shared/AccentButton.tsx",
    name: "SIZE_CLASS",
    kind: "record",
    scope: "<module>",
  },
  {
    file: "components/shared/AccentButton.tsx",
    name: "WEIGHT_CLASS",
    kind: "record",
    scope: "<module>",
  },
  {
    file: "components/shared/AccentButton.tsx",
    name: "RING_OFFSET_CLASS",
    kind: "record",
    scope: "<module>",
  },
  {
    file: "components/shared/AccentButton.tsx",
    name: "BASE_CLASS",
    kind: "string",
    scope: "<module>",
  },
  {
    file: "components/admin/OnboardingWizard.tsx",
    name: "base",
    kind: "string",
    scope: "StepIndicator",
  },
  {
    file: "components/admin/OnboardingWizard.tsx",
    name: "focusRing",
    kind: "string",
    scope: "StepIndicator",
  },
] as const;

/** The callees the lint rule traverses. `cn` is this repo's wrapper (`lib/ui/cn`). */
const RECOGNIZED_CALLEES = ["cn", "clsx", "cva", "classnames"];

interface Initializer {
  /** The label used in failure messages — the const, or the const's property. */
  label: string;
  /** `null` for an object member this reader cannot express (spread, shorthand). */
  node: ts.Expression | null;
}

function sourceFileFor(rel: string): ts.SourceFile {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * The declaration named `name`, anywhere in the file.
 *
 * Deliberately not module-scope-only: `base` and `focusRing` are declared inside
 * `StepIndicator`, and the rule's blind spot does not care about scope.
 */
/**
 * Every class-bearing constant that actually FEEDS a `className`, discovered
 * from the use sites.
 *
 * WHY THIS REPLACED A LIST OF NINE NAMES. Rounds 3, 4 and 5 each found the same
 * defect one level deeper — a name is not an identity. First the first match
 * anywhere satisfied a row; then uniqueness did not help, because a rename plus
 * a surviving decoy re-bound it; then name-plus-enclosing-scope did not help
 * either, because an ordinary same-scope rename re-bound it again. That is five
 * instances of one class, and the reviewer's summary was right: another
 * collision tuple will not close it.
 *
 * So the question changed. The old one — "is the declaration called `base`
 * wrapped?" — is about a WORD, and words move. The real question is the one the
 * lint rule cares about: *which constants reach a `className` through an
 * identifier, where the rule cannot follow them?* That is answered from the use
 * sites, so a rename is followed automatically (the reference moves with it) and
 * a decoy is irrelevant (nothing references it).
 *
 * It also retires the enumeration. The nine names are no longer a registry to
 * maintain; they are an expected SUBSET, asserted as a floor so this walk going
 * quiet is a failure rather than a pass.
 */
/** The initializer(s) the wrap has to cover: the value itself, or every Record value. */
function initializersOf(declaration: ts.VariableDeclaration, name: string): Initializer[] {
  const init = declaration.initializer;
  if (init === undefined) return [];
  if (ts.isObjectLiteralExpression(init)) {
    // An EMPTY object yields zero rows, and zero rows satisfy every premise and
    // the wrap assertion at once — the class text can move out of the record
    // entirely and the guard stays green (review R5). Surfaced as an unwrappable
    // row so it fails loudly.
    if (init.properties.length === 0) return [{ label: `${name}.<empty record>`, node: null }];
    return init.properties.flatMap((prop): Initializer[] => {
      // A member this reader cannot express used to be dropped SILENTLY, which
      // empties the list and passes everything (review R3). Surfaced instead.
      if (!ts.isPropertyAssignment(prop)) {
        return [{ label: `${name}.<${ts.SyntaxKind[prop.kind]}>`, node: null }];
      }
      const key = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : "<computed>";
      return [{ label: `${name}.${key}`, node: prop.initializer }];
    });
  }
  // A ternary is TWO values, not one. `cond ? "a" : "b"` behind an identifier is
  // two class strings the rule cannot see, and wrapping the whole ternary would
  // expose neither — a recognized callee follows its ARGUMENTS, and a ternary is
  // one argument whose branches it does not enter. So each branch is its own row,
  // recursively, which also covers the nested ternaries this codebase uses for
  // per-state pill classes.
  if (ts.isConditionalExpression(init)) {
    const branch = (node: ts.Expression, label: string): Initializer[] =>
      ts.isConditionalExpression(node)
        ? [...branch(node.whenTrue, `${label}.<t>`), ...branch(node.whenFalse, `${label}.<f>`)]
        : [{ label, node }];
    return [
      ...branch(init.whenTrue, `${name}.<when-true>`),
      ...branch(init.whenFalse, `${name}.<when-false>`),
    ];
  }
  return [{ label: name, node: init }];
}

interface ClassFeed {
  /** `<file> — <identifier>` or `<file> — <identifier>.<key>`. */
  label: string;
  /** The initializer the wrap must cover, or `null` when it cannot be read. */
  node: ts.Expression | null;
}

/** Resolve an identifier the way the LANGUAGE does: nearest enclosing binding. */
function resolveIdentifier(
  id: ts.Identifier,
  sourceFile: ts.SourceFile,
): ts.VariableDeclaration | null {
  const name = id.text;
  for (let cur: ts.Node | undefined = id.parent; cur; cur = cur.parent) {
    let found: ts.VariableDeclaration | null = null;
    const scan = (node: ts.Node): void => {
      if (found !== null) return;
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node;
        return;
      }
      // Do not descend into nested functions: their bindings are not in scope here.
      if (
        node !== cur &&
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node))
      )
        return;
      ts.forEachChild(node, scan);
    };
    scan(cur);
    if (found !== null) return found;
    if (ts.isSourceFile(cur)) break;
  }
  return null;
}

/** Identifiers referenced anywhere inside a `className` expression. */
function classNameIdentifiers(attr: ts.JsxAttribute): { id: ts.Identifier; key: string | null }[] {
  const out: { id: ts.Identifier; key: string | null }[] = [];
  const init = attr.initializer;
  if (init === undefined || !ts.isJsxExpression(init) || init.expression === undefined) return out;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      out.push({ id: node.expression, key: node.name.text });
      return;
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      // `SIZE_CLASS[size]` — the KEY is dynamic, so every value is in play.
      out.push({ id: node.expression, key: null });
      return;
    }
    if (ts.isIdentifier(node)) {
      out.push({ id: node, key: null });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(init.expression);
  return out;
}

function classFeedsOf(sourceFile: ts.SourceFile, rel: string): ClassFeed[] {
  const feeds = new Map<string, ClassFeed>();
  const seen = new Set<ts.VariableDeclaration>();

  // TRANSITIVE, because composition is the normal shape. `AccentButton` builds
  // `const classes = cn(BASE_CLASS, SIZE_CLASS[size], …)` and renders
  // `className={classes}`. A one-hop walk finds `classes` — already wrapped, so
  // it reports clean — and never reaches the four constants that are actually
  // dark. The lint rule stops at the first identifier; the walk must not.
  const follow = (id: ts.Identifier, key: string | null, depth: number): void => {
    if (depth > 6) return;
    const decl = resolveIdentifier(id, sourceFile);
    if (decl === null || seen.has(decl)) return;
    const init = decl.initializer;
    if (init === undefined) return;
    seen.add(decl);

    for (const entry of initializersOf(decl, id.text)) {
      if (key !== null && ts.isObjectLiteralExpression(init) && !entry.label.endsWith(`.${key}`)) {
        continue;
      }
      if (entry.node !== null) {
        // Descend into the identifiers this value itself references BEFORE
        // judging it, so a wrapped composer can never hide an unwrapped part.
        const nested: ts.Identifier[] = [];
        const scan = (n: ts.Node): void => {
          if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
            follow(n.expression, n.name.text, depth + 1);
            return;
          }
          if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression)) {
            follow(n.expression, null, depth + 1);
            return;
          }
          if (ts.isIdentifier(n)) nested.push(n);
          ts.forEachChild(n, scan);
        };
        scan(entry.node);
        for (const n of nested) follow(n, null, depth + 1);

        // Only class-BEARING values. A const feeding a className can legitimately
        // hold a non-class string, and the rule would not judge that either.
        if (!holdsClassText(entry.node)) continue;
      }
      feeds.set(`${rel} — ${entry.label}`, {
        label: `${rel} — ${entry.label}`,
        node: entry.node,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "className") {
      for (const { id, key } of classNameIdentifiers(node)) follow(id, key, 0);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...feeds.values()];
}

/** Does this initializer carry Tailwind-looking class text the rule would judge? */
function holdsClassText(node: ts.Expression): boolean {
  const texts: string[] = [];
  const collect = (n: ts.Node): void => {
    if (isBareStringLiteral(n as ts.Expression)) texts.push((n as ts.StringLiteral).text);
    ts.forEachChild(n, collect);
  };
  collect(node);
  const tokens = texts.join(" ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((t) =>
    /^(?:[a-z0-9-]+:)*-?(?:m|p|px|py|pt|pb|pl|pr|w|h|size|min-w|min-h|max-w|max-h|gap|inset|top|bottom|left|right|z|flex|grid|items|justify|self|text|font|leading|tracking|bg|border|outline|ring|shadow|opacity|rounded|transition|duration|ease|animate|translate|cursor|select|overflow|underline|absolute|relative|fixed|sticky|block|inline|inline-flex|inline-block|hidden)(?:-[^\s]+)?$/.test(
      t,
    ),
  );
}

function isRecognizedCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    RECOGNIZED_CALLEES.includes(node.expression.text)
  );
}

/** A string-literal expression, so "wrapped" can be distinguished from "not a class string". */
function isBareStringLiteral(
  node: ts.Expression,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

describe("class-string consts stay inside the lint rule's reach (spec §2.3)", () => {
  const FILES = [...new Set(SITES.map((s) => s.file))];
  const feeds = FILES.flatMap((rel) => classFeedsOf(sourceFileFor(rel), rel));

  it("premise: the walk finds class-bearing constants, and covers every historically-named site", () => {
    // A discovery walk whose passing state is "nothing unwrapped" cannot prove
    // itself by finding an empty set — "found nothing" is both the pass and what
    // a broken walk reports.
    premiseHolds(
      `the use-site walk found ${feeds.length} class-bearing constants across ${FILES.length} files`,
      feeds.length >= SITES.length,
    );

    // The nine names this arc was filed against are no longer a registry to
    // maintain — they are an expected SUBSET, asserted as a FLOOR. If the walk
    // stops seeing one of them it has gone quiet somewhere, and that is a
    // failure rather than a smaller clean set.
    const labels = feeds.map((f) => f.label);
    const missing = SITES.filter(
      (site) => !labels.some((l) => l.startsWith(`${site.file} — ${site.name}`)),
    ).map((site) => `${site.file} — ${site.name}`);
    expect(
      missing,
      "the use-site walk no longer reaches these historically-named constants. Either they stopped " +
        "feeding a className (in which case delete the row and say why) or the walk regressed.",
    ).toEqual([]);
  });

  it("wraps every constant that reaches a className through an identifier", () => {
    const unwrapped = feeds
      .filter((f) => f.node === null || !isRecognizedCall(f.node))
      .map((f) => f.label);
    expect(
      unwrapped,
      "these constants reach a `className` through an IDENTIFIER, which is precisely where " +
        "`better-tailwindcss/enforce-canonical-classes` stops following: it traverses recognized " +
        "callees (`cn`/`clsx`/`cva`) and direct JSX attributes, never a bare const initializer or " +
        "an object VALUE. Tailwind drift inside one escapes `pnpm lint` and therefore CI — which " +
        "is how `THUMB_BASE` kept `h-5 w-5` while its three sibling switches moved to `size-5`. " +
        "Wrap the value in `cn(...)` from @/lib/ui/cn; `cn` of one string is that string, so " +
        "runtime is unchanged. A row with no readable initializer (an empty record, a spread) is " +
        "listed here too: it cannot be vouched for, so it is not.",
    ).toEqual([]);
  });
});

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
  },
  {
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    name: "THUMB_BASE",
    kind: "string",
  },
  {
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    name: "TAP_TARGET",
    kind: "string",
  },
  { file: "components/shared/AccentButton.tsx", name: "SIZE_CLASS", kind: "record" },
  { file: "components/shared/AccentButton.tsx", name: "WEIGHT_CLASS", kind: "record" },
  { file: "components/shared/AccentButton.tsx", name: "RING_OFFSET_CLASS", kind: "record" },
  { file: "components/shared/AccentButton.tsx", name: "BASE_CLASS", kind: "string" },
  { file: "components/admin/OnboardingWizard.tsx", name: "base", kind: "string" },
  { file: "components/admin/OnboardingWizard.tsx", name: "focusRing", kind: "string" },
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
function findDeclarations(sourceFile: ts.SourceFile, name: string): ts.VariableDeclaration[] {
  const found: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** The initializer(s) the wrap has to cover: the value itself, or every Record value. */
function initializersOf(declaration: ts.VariableDeclaration, name: string): Initializer[] {
  const init = declaration.initializer;
  if (init === undefined) return [];
  if (ts.isObjectLiteralExpression(init)) {
    return init.properties.flatMap((prop): Initializer[] => {
      // A member this reader does not understand used to be dropped SILENTLY,
      // which is the worst possible handling: moving the dark values behind
      // `{ ...DARK, sm }` emptied the result list, and an empty list satisfies
      // the shape premise, the non-empty premise AND the wrap assertion at once
      // (review R3). Unsupported members are now surfaced as a row that cannot
      // be wrapped, so they fail loudly instead of vanishing.
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
  return [{ label: name, node: init }];
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
  const parsed = SITES.map((site) => {
    const sourceFile = sourceFileFor(site.file);
    const all = findDeclarations(sourceFile, site.name);
    return {
      site,
      sourceFile,
      declaration: all.length === 1 ? (all[0] as ts.VariableDeclaration) : null,
      count: all.length,
    };
  });

  it("premise: every named declaration is present, UNIQUE in its file, and the shape its row expects", () => {
    const missing = parsed
      .filter((p) => p.count === 0)
      .map((p) => `${p.site.file} — ${p.site.name}`);
    premiseHolds(
      `every named class-string const is present: missing ${missing.join(", ") || "(none)"}`,
      missing.length === 0,
    );

    // UNIQUE, because a row identifies its target BY NAME and the reader used to
    // take the first match anywhere in the file. Adding an unrelated wrapped
    // `base` above `StepIndicator` let the intended `base` go bare while the row
    // stayed green (review R3) — and `base`/`focusRing` are exactly the names
    // most likely to collide. Ambiguity is refused rather than resolved by
    // position: a second declaration means the row no longer names one thing.
    const ambiguous = parsed
      .filter((p) => p.count > 1)
      .map((p) => `${p.site.file} — ${p.site.name} (${p.count} declarations)`);
    premiseHolds(
      `every named const resolves to exactly ONE declaration: ambiguous ${ambiguous.join(", ") || "(none)"}`,
      ambiguous.length === 0,
    );

    const wrongShape = parsed.flatMap((p) => {
      const init = p.declaration?.initializer;
      if (init === undefined) return [];
      const isRecord = ts.isObjectLiteralExpression(init);
      // A `cn(...)`-wrapped Record is still an ObjectLiteral; a wrapped string is a
      // CallExpression. So the shape test reads through the wrap.
      const effective = isRecognizedCall(init) ? "string" : isRecord ? "record" : "string";
      return effective === p.site.kind
        ? []
        : [`${p.site.file} — ${p.site.name}: expected ${p.site.kind}, found ${effective}`];
    });
    premiseHolds(
      `every row's initializer shape matches: ${wrongShape.join(" | ") || "(all match)"}`,
      wrongShape.length === 0,
    );
  });

  it("premise: each site really does carry Tailwind class text, so the wrap assertion is not vacuous", () => {
    // A row whose value is an empty string would satisfy "is a cn() call" while proving
    // nothing about class-string coverage.
    const empty = parsed.flatMap(({ site, declaration }) => {
      if (declaration === null) return [];
      return initializersOf(declaration, site.name).flatMap((entry) => {
        if (entry.node === null) return [`${site.file} — ${entry.label} (unreadable member)`];
        const args: readonly ts.Expression[] = ts.isCallExpression(entry.node)
          ? entry.node.arguments
          : [entry.node];
        const text = args
          .flatMap((a) => (isBareStringLiteral(a) ? [a.text] : []))
          .join(" ")
          .trim();
        return text.length > 0 ? [] : [`${site.file} — ${entry.label}`];
      });
    });
    premiseHolds(
      `every site carries non-empty class text: empty at ${empty.join(", ") || "(none)"}`,
      empty.length === 0,
    );
  });

  it("wraps every class-string const (and every Record value) in a recognized callee", () => {
    const unwrapped = parsed.flatMap(({ site, declaration }) => {
      if (declaration === null) return [];
      return initializersOf(declaration, site.name)
        .filter((entry) => entry.node === null || !isRecognizedCall(entry.node))
        .map((entry) => `${site.file} — ${entry.label}`);
    });
    expect(
      unwrapped,
      "these class-string declarations are invisible to " +
        "`better-tailwindcss/enforce-canonical-classes`: the rule traverses recognized callees " +
        "(`cn`/`clsx`/`cva`) and direct JSX attributes, never a bare const initializer or an " +
        "object VALUE. Tailwind drift inside one escapes `pnpm lint` and therefore CI — which " +
        "is how `THUMB_BASE` kept `h-5 w-5` while its three sibling switches moved to `size-5`. " +
        "Wrap the value in `cn(...)` from @/lib/ui/cn; `cn` of one string is that string, so " +
        "runtime is unchanged.",
    ).toEqual([]);
  });
});

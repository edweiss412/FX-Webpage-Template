#!/usr/bin/env node
/**
 * audit-cn-operand-kinds.mjs — the executable form of spec §4.1's all-truthy claim.
 *
 * Spec:  docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §4.1
 * Plan:  docs/superpowers/plans/2026-08-07-classname-array-join-cn.md, preflight P1 step 3
 *
 * WHAT IT PROVES.  Stage 1 of this arc rewrites `[A, B, C].join(" ")` to `cn(A, B, C)`.
 * The two emit the same string only where every operand is truthy — `cn` drops falsy
 * operands, `join` renders them (`["a", false, "b"].join(" ")` is `"a false b"`, and
 * `["a", "", "b"].join(" ")` is `"a  b"`).  So the migration's equivalence claim rests on
 * a property of the BASE COMMIT, not of the rewrite, and that property is measured here
 * rather than read.  It is re-measured after every rebase (plan C4 step 4.1), because a
 * single upstream edit can break it without moving any count this arc otherwise watches.
 *
 * WHY THREE KINDS AND NOT TWO.  Checking the known falsy literals and the eight known
 * identifier names is not the same as proving no operand of an unvetted kind appeared.
 * An upstream edit to `active && "bg-accent"` introduces a `false` operand that is
 * neither a falsy literal nor one of the eight names: both narrow checks pass, parity
 * passes (the operand is preserved), the `cn` unit test passes, the DayCard test passes,
 * and rendering changes.  So every top-level operand at every unfiltered site is
 * enumerated and must fall in one of three PROVEN-TRUTHY kinds:
 *
 *   1. a non-empty string literal;
 *   2. one of the eight proven-truthy identifiers of spec §4.1 — accepted ONLY when the
 *      name has exactly one binding in its file (a nested `const base = ""` shadows the
 *      truthy outer `base` while the operand spelling and the outer definition both stay
 *      unchanged), and only when its own definition is proven truthy;
 *   3. a conditional (possibly nested) whose every result branch is a non-empty string
 *      literal — with exactly one sanctioned exception, the `tone === "set"` branch in
 *      components/crew/primitives/DayCard.tsx, which is spec §4's sole E2 site and is
 *      pinned by its own render test.
 *
 * `.filter(Boolean)` sites are exempt by definition: `cn` IS `filter(Boolean).join(" ")`,
 * so a falsy operand there is already dropped before and after.
 *
 * BOTH FORMS.  Before the migration the sites are array joins; after it they are `cn(...)`
 * calls.  The script accepts either and classifies the same operand lists, which is what
 * lets C4 re-run it against the migrated tree.
 *
 * EXTRACTION IS AST-BASED, SHARED WITH THE PARITY SCRIPT.  The plan calls for the same
 * extraction in both arc scripts; `scripts/lib/cnSites.mjs` is that shared extractor, and
 * it walks the TypeScript AST rather than matching brackets textually.  That is strictly
 * more capable than the bracket walk the plan sketches (it sees through comments, nested
 * brackets, JSX and template literals identically) and it is the house pattern — a dozen
 * tracked meta-tests in this repo already scan via the TS compiler API.
 *
 * IT PROVES IT CAN FAIL BEFORE IT IS TRUSTED GREEN.  `--self-test` plants an on-disk
 * fixture tree and runs THIS SAME analysis against one mutant per rejection path the
 * script implements, plus an accept-side control, asserting exit 1 naming each and exit 0
 * on the clean corpus.  Every invocation site runs `--self-test` before the live audit:
 *
 *     node scripts/audit-cn-operand-kinds.mjs --self-test && node scripts/audit-cn-operand-kinds.mjs
 *
 * The script is otherwise unwired (no workflow, no test suite — spec §4.3), so without the
 * leading self-test a repair that hollowed out a rejection path would pass silently
 * against a clean corpus.
 *
 * Exit 0: every check passed; prints the per-kind tally.
 * Exit 1: one or more STOPs; prints every one — out-of-kind operands, moved identifier
 *         definitions, shadowed names, and reconciliation failures — with file:line.
 * Exit 2: usage error.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { collectSites, operandText, parseSource } from "./lib/cnSites.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ *
 * The measured base — spec §2.2 and §4.1.  Every number here is a
 * reconciliation target, not a description: a mismatch is a STOP.
 * ------------------------------------------------------------------ */

/** The 18 className files and their site counts (spec §2.2). */
const SITE_FILES = [
  ["components/admin/OnboardingWizard.tsx", 5],
  ["components/admin/PublishedToggle.tsx", 2],
  ["components/admin/settings/AutoPublishToggle.tsx", 2],
  ["components/admin/settings/DeveloperToggleButton.tsx", 2],
  ["components/admin/settings/NotifyToggle.tsx", 2],
  ["components/admin/wizard/Step3SheetCard.tsx", 1],
  ["components/atoms/Avatar.tsx", 1],
  ["components/atoms/KeyValue.tsx", 1],
  ["components/atoms/Section.tsx", 1],
  ["components/crew/RightNowHero.tsx", 3],
  ["components/crew/SectionChipLink.tsx", 1],
  ["components/crew/primitives/DayCard.tsx", 3],
  ["components/crew/primitives/PersonRow.tsx", 6],
  ["components/crew/sections/GearSection.tsx", 2],
  ["components/crew/sections/TodaySection.tsx", 2],
  ["components/crew/sections/TravelSection.tsx", 1],
  ["components/shared/AccentButton.tsx", 1],
  ["app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", 1],
];

/**
 * The 6 `.filter(Boolean)` sites (spec §2.2), keyed by their 0-based index in source
 * order within their file.  Declared rather than detected, because after the migration
 * the `.filter(Boolean)` marker is gone — `cn(A, B)` is the same shape at a filtered and
 * an unfiltered site.  Before the migration the marker IS present, and the two are
 * reconciled against each other (a declared-vs-detected mismatch is a STOP), so this map
 * cannot quietly drift away from the tree it describes.
 */
const FILTERED_SITES = {
  "components/atoms/KeyValue.tsx": [0],
  "components/crew/sections/GearSection.tsx": [0],
  "components/crew/sections/TodaySection.tsx": [0, 1],
  "components/crew/sections/TravelSection.tsx": [0],
  "components/shared/AccentButton.tsx": [0],
};

/** The eight proven-truthy identifiers of spec §4.1, with their defining file. */
const IDENTIFIER_TABLE = [
  { name: "base", file: "components/admin/OnboardingWizard.tsx" },
  { name: "focusRing", file: "components/admin/OnboardingWizard.tsx" },
  // Added by the 2026-08-09 final rebase: `fix/step3-a11y-cluster` split the step pill into a
  // 44px tap-target anchor plus an inner painted span, introducing this identifier and a
  // fifth site in this file. Non-empty string literal, so proven truthy by the same rule as
  // `base` and `focusRing`.
  { name: "tapTarget", file: "components/admin/OnboardingWizard.tsx" },
  { name: "pillState", file: "components/admin/OnboardingWizard.tsx" },
  { name: "TRACK_BASE", file: "components/admin/settings/DeveloperToggleButton.tsx" },
  { name: "THUMB_BASE", file: "components/admin/settings/DeveloperToggleButton.tsx" },
  { name: "surfaceClass", file: "components/crew/RightNowHero.tsx" },
  { name: "CHIP_CLASS", file: "components/crew/primitives/PersonRow.tsx" },
];

/** The sole sanctioned falsy conditional branch (spec §4, E2) — file AND exact operand. */
const SANCTIONED_FALSY_FILE = "components/crew/primitives/DayCard.tsx";
const SANCTIONED_FALSY_SIGNATURE =
  'tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong"';
/**
 * ...and the 0-based index of the SITE it lives at, in source order within its file.
 *
 * File + signature + count-of-1 stops substitution and duplication but NOT relocation of
 * that exact signature to another site in the same file. The DayCard render test that
 * justifies E2 is attached to a specific site, so the sanction has to name that site too.
 */
const SANCTIONED_FALSY_SITE_INDEX = 2;

/** Reconciliation targets for the live tree (spec §2.2, §4.1, plan P1 step 3). */
const EXPECTED = {
  totalSites: 37,
  filteredSites: 6,
  unfilteredSites: 31,
  conditionalOperands: 18,
  conditionalSites: 18,
  sanctionedFalsyBranches: 1,
};

const LIVE_CONFIG = {
  label: "live tree",
  root: REPO_ROOT,
  files: SITE_FILES,
  filteredSites: FILTERED_SITES,
  identifierTable: IDENTIFIER_TABLE,
  sanctionedFalsyFile: SANCTIONED_FALSY_FILE,
  sanctionedFalsySignature: SANCTIONED_FALSY_SIGNATURE,
  sanctionedFalsySiteIndex: SANCTIONED_FALSY_SITE_INDEX,
  expected: EXPECTED,
};

/* ------------------------------------------------------------------ *
 * Literal / truthiness primitives
 * ------------------------------------------------------------------ */

function isStringLiteralNode(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isNonEmptyStringLiteral(node) {
  return isStringLiteralNode(node) && node.text.length > 0;
}

/** Every leaf (non-conditional) result branch of a possibly-nested conditional. */
function conditionalBranches(node) {
  const out = [];
  const visit = (n) => {
    if (ts.isConditionalExpression(n)) {
      visit(n.whenTrue);
      visit(n.whenFalse);
      return;
    }
    if (ts.isParenthesizedExpression(n)) {
      visit(n.expression);
      return;
    }
    out.push(n);
  };
  visit(node);
  return out;
}

/* ------------------------------------------------------------------ *
 * Binding analysis — the shadowing stop
 * ------------------------------------------------------------------ */

/**
 * Every binding position for `name` in the file: variable declarations, function and
 * class declarations, parameters, destructuring binding elements, imports, and catch
 * clause variables.  More than one for a name used as an operand is a STOP, because the
 * operand's spelling cannot tell them apart while `join` and `cn` can.
 */
function collectBindings(sourceFile, name) {
  const found = [];
  const record = (node) => found.push(node);
  const visit = (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      record(node);
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassExpression(node) ||
        ts.isImportSpecifier(node) ||
        ts.isImportClause(node) ||
        ts.isNamespaceImport(node) ||
        // `import base = N.empty` is a real, legal binding that can shadow an allowlisted
        // name with a falsy value while the outer definition stays truthy.
        ts.isImportEqualsDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      record(node);
    }
    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration?.name &&
      ts.isIdentifier(node.variableDeclaration.name) &&
      node.variableDeclaration.name.text === name
    ) {
      // already recorded by the VariableDeclaration branch above
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Is this identifier's own DEFINITION proven non-empty-truthy?  This is the path a
 * name-allowlisting binding-counter skips: `const base = ""` passes the one-binding rule
 * and the operand-kind rule while `["a", base, "b"].join(" ")` emits `"a  b"` against
 * `cn`'s `"a b"`.
 */
function proveDefinitionTruthy(decl) {
  if (!ts.isVariableDeclaration(decl)) {
    return {
      ok: false,
      why: `binding is a ${ts.SyntaxKind[decl.kind]}, not a variable declaration`,
    };
  }
  const list = decl.parent;
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const)) {
    return {
      ok: false,
      why: "declaration is not `const` — a later reassignment could make it falsy",
    };
  }
  const init = decl.initializer;
  if (!init) return { ok: false, why: "declaration has no initializer" };

  if (isNonEmptyStringLiteral(init)) return { ok: true, why: "non-empty string literal" };
  if (isStringLiteralNode(init))
    return { ok: false, why: "initializer is the empty string literal" };

  if (ts.isConditionalExpression(init)) {
    const branches = conditionalBranches(init);
    const bad = branches.filter((b) => !isNonEmptyStringLiteral(b));
    if (bad.length > 0) {
      return {
        ok: false,
        why: `conditional initializer has ${bad.length} branch(es) that are not non-empty string literals`,
      };
    }
    return {
      ok: true,
      why: `conditional initializer, all ${branches.length} branches non-empty literals`,
    };
  }

  // `const X = ["a", "b"].join(" ")` before the migration, `const X = cn("a", "b")` after.
  const operands = literalJoinOperands(init);
  if (operands) {
    // An EMPTY list is falsy, not vacuously truthy: `[].join(" ")` and `cn()` are both `""`.
    // Without this, `const CHIP_CLASS = cn()` certifies as truthy while every one of its
    // consumers silently loses a separator.
    if (operands.length === 0) {
      return {
        ok: false,
        why: "class-list initializer is EMPTY, so it evaluates to the empty string",
      };
    }
    const bad = operands.filter((o) => !isNonEmptyStringLiteral(o));
    if (bad.length > 0) {
      return {
        ok: false,
        why: `class-list initializer has ${bad.length} non-literal or empty operand(s)`,
      };
    }
    return { ok: true, why: `class-list initializer of ${operands.length} non-empty literals` };
  }

  return {
    ok: false,
    why: `initializer is a ${ts.SyntaxKind[init.kind]} that is not proven truthy`,
  };
}

/** The operand list of `[...].join(" ")` / `[...].filter(Boolean).join(" ")` / `cn(...)`, else null. */
function literalJoinOperands(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression) && node.expression.text === "cn") {
    return [...node.arguments];
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "join" &&
    node.arguments.length === 1 &&
    isStringLiteralNode(node.arguments[0])
  ) {
    let receiver = node.expression.expression;
    if (
      ts.isCallExpression(receiver) &&
      ts.isPropertyAccessExpression(receiver.expression) &&
      receiver.expression.name.text === "filter"
    ) {
      // A FOREIGN predicate can empty the list: `["truthy"].filter(() => false).join("")`
      // is `""`, yet counting the original non-empty elements certified it truthy. Only
      // `.filter(Boolean)` preserves the "every element is non-empty ⇒ result is non-empty"
      // reasoning this function performs.
      if (
        receiver.arguments.length !== 1 ||
        !ts.isIdentifier(receiver.arguments[0]) ||
        receiver.arguments[0].text !== "Boolean"
      ) {
        return null;
      }
      receiver = receiver.expression.expression;
    }
    if (ts.isArrayLiteralExpression(receiver)) return [...receiver.elements];
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

function runAudit(config) {
  const stops = [];
  const tally = {
    files: 0,
    totalSites: 0,
    filteredSites: 0,
    unfilteredSites: 0,
    kind1Literal: 0,
    kind2Identifier: 0,
    kind3Conditional: 0,
    conditionalSites: 0,
    sanctionedFalsyBranches: 0,
  };

  const stop = (where, message) => stops.push(`${where}: ${message}`);
  const parsed = new Map();

  for (const [rel, expectedCount] of config.files) {
    const abs = path.join(config.root, rel);
    if (!fs.existsSync(abs)) {
      stop(rel, "file is missing — spec §2.2's inventory no longer describes the tree");
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    const sourceFile = parseSource(rel, text);
    parsed.set(rel, sourceFile);
    tally.files += 1;

    const sites = collectSites(sourceFile);
    if (sites.length !== expectedCount) {
      stop(
        rel,
        `site count moved: spec §2.2 declares ${expectedCount}, found ${sites.length} — re-derive §2.2 before proceeding`,
      );
    }

    const declaredFiltered = new Set(config.filteredSites[rel] ?? []);

    sites.forEach((site, index) => {
      const line = lineOf(sourceFile, site.node);
      const where = `${rel}:${line}`;
      tally.totalSites += 1;

      const isDeclaredFiltered = declaredFiltered.has(index);

      // Reconciliation: before the migration the `.filter(Boolean)` marker is present and
      // must agree with the declared map; after it, the map is the only authority.
      if (site.hasForeignFilter) {
        stop(
          where,
          "the join is filtered by a predicate other than `Boolean`. `cn` is exactly " +
            '`filter(Boolean).join(" ")`, so migrating this site would change output for any ' +
            "operand the predicate keeps and `Boolean` drops (or vice versa).",
        );
      }
      if (site.form === "array-join" && site.hasFilterMarker !== isDeclaredFiltered) {
        stop(
          where,
          site.hasFilterMarker
            ? `site ${index} carries .filter(Boolean) but is not declared filtered — the declared map has drifted`
            : `site ${index} is declared filtered but carries no .filter(Boolean) — the declared map has drifted`,
        );
      }

      if (isDeclaredFiltered) {
        tally.filteredSites += 1;
        return; // exempt by definition: cn IS filter(Boolean).join(" ")
      }
      tally.unfilteredSites += 1;

      let siteHasConditional = false;
      for (const operand of site.operands) {
        const verdict = classifyOperand({
          operand,
          rel,
          siteIndex: index,
          sourceFile,
          config,
          stop,
          where,
          tally,
        });
        if (verdict === "conditional") siteHasConditional = true;
      }
      if (siteHasConditional) tally.conditionalSites += 1;
    });
  }

  // SPELLING-BASED RECOGNITION NEEDS ITS NAMES TO MEAN WHAT THEY SAY. Both extractors match
  // `Boolean` and `cn` by spelling, so a local binding of either silently changes what a
  // recognized site DOES while leaving every count and operand identical:
  //   `const Boolean = () => true`  -> a "sanctioned" filter that drops nothing
  //   `const cn = (...p) => p.join("-")` -> a "migrated" call that renders "a-b"
  // Both are pathological rather than ordinary authoring, but the walked set is 18 declared
  // files, so proving their absence is cheap and removes the argument entirely.
  for (const [rel] of config.files) {
    const sourceFile = parsed.get(rel);
    if (sourceFile === undefined) continue;
    for (const reserved of ["Boolean", "cn"]) {
      const bindings = collectBindings(sourceFile, reserved).filter(
        // The `cn` module import is the one binding that is supposed to exist.
        (b) => !(reserved === "cn" && isCnModuleImport(b)),
      );
      if (bindings.length > 0) {
        stop(
          `${rel}:${lineOf(sourceFile, bindings[0])}`,
          `\`${reserved}\` has a local binding in this file. Both extractors recognize it by ` +
            "SPELLING, so a local one changes what a recognized site does while every count " +
            "and operand stays identical.",
        );
      }
    }
  }

  // Every one of the eight identifier definitions is checked, whether or not it was
  // reached as an operand above — a definition that moved is the drift this catches.
  for (const entry of config.identifierTable) {
    const sourceFile = parsed.get(entry.file);
    if (!sourceFile) {
      stop(entry.file, `identifier \`${entry.name}\` — defining file was not parsed`);
      continue;
    }
    checkIdentifierDefinition({ entry, sourceFile, stop });
  }

  const expected = config.expected;
  if (expected) {
    const reconcile = (key, actual) => {
      if (expected[key] !== undefined && expected[key] !== actual) {
        stop("premise", `${key}: expected ${expected[key]}, measured ${actual}`);
      }
    };
    reconcile("totalSites", tally.totalSites);
    reconcile("filteredSites", tally.filteredSites);
    reconcile("unfilteredSites", tally.unfilteredSites);
    reconcile("conditionalOperands", tally.kind3Conditional);
    reconcile("conditionalSites", tally.conditionalSites);
    reconcile("sanctionedFalsyBranches", tally.sanctionedFalsyBranches);
  }

  return { stops, tally };
}

function classifyOperand({ operand, rel, siteIndex, sourceFile, config, stop, where, tally }) {
  // Kind 1 — non-empty string literal.
  if (isNonEmptyStringLiteral(operand)) {
    tally.kind1Literal += 1;
    return "literal";
  }
  if (isStringLiteralNode(operand)) {
    stop(
      where,
      "operand is the empty string literal at an unfiltered site — a new E2 site (spec §4)",
    );
    return "stop";
  }

  // Kind 2 — one of the eight proven-truthy identifiers, sole-bound in its file.
  if (ts.isIdentifier(operand)) {
    const entry = config.identifierTable.find((e) => e.name === operand.text && e.file === rel);
    if (!entry) {
      stop(
        where,
        `identifier operand \`${operand.text}\` is not in spec §4.1's proven-truthy table for this file — re-derive §4.1`,
      );
      return "stop";
    }
    const bindings = collectBindings(sourceFile, operand.text);
    if (bindings.length !== 1) {
      stop(
        where,
        `identifier operand \`${operand.text}\` has ${bindings.length} bindings in this file; exactly 1 is required — a shadowing binding makes the checked definition the wrong one`,
      );
      return "stop";
    }
    tally.kind2Identifier += 1;
    return "identifier";
  }

  // Kind 3 — conditional whose every branch is a non-empty string literal, with the one
  // sanctioned exception.
  if (ts.isConditionalExpression(operand)) {
    tally.kind3Conditional += 1;
    const branches = conditionalBranches(operand);
    for (const branch of branches) {
      if (isNonEmptyStringLiteral(branch)) continue;
      const isFalsyLiteral =
        isStringLiteralNode(branch) ||
        branch.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(branch) && branch.text === "undefined") ||
        branch.kind === ts.SyntaxKind.FalseKeyword;
      // Keyed on file AND the operand's exact rendering, NOT the file alone. A file-wide
      // key lets the sanctioned branch be DELETED and an equivalent one introduced at a
      // different conditional in the same file: the count stays 1 and every reconciliation
      // target stays green while a different site's output changes.
      const signature = operandText(operand, sourceFile);
      if (
        isFalsyLiteral &&
        rel === config.sanctionedFalsyFile &&
        signature === config.sanctionedFalsySignature &&
        siteIndex === config.sanctionedFalsySiteIndex
      ) {
        tally.sanctionedFalsyBranches += 1;
        continue;
      }
      stop(
        where,
        isFalsyLiteral
          ? `conditional operand has a falsy branch at a non-sanctioned site — spec §4 sanctions exactly one, in ${config.sanctionedFalsyFile}`
          : `conditional operand has a branch that is a ${ts.SyntaxKind[branch.kind]}, not a non-empty string literal`,
      );
    }
    return "conditional";
  }

  stop(
    where,
    `operand is a ${ts.SyntaxKind[operand.kind]} — outside the three proven-truthy kinds of spec §4.1; re-derive §4.1 before proceeding`,
  );
  return "stop";
}

function checkIdentifierDefinition({ entry, sourceFile, stop }) {
  const bindings = collectBindings(sourceFile, entry.name);
  const where = `${entry.file}`;
  if (bindings.length === 0) {
    stop(
      where,
      `identifier \`${entry.name}\` from spec §4.1 has no binding in this file — the definition moved`,
    );
    return;
  }
  if (bindings.length > 1) {
    stop(
      where,
      `identifier \`${entry.name}\` has ${bindings.length} bindings; spec §4.1 checks one definition and cannot tell them apart`,
    );
    return;
  }
  const verdict = proveDefinitionTruthy(bindings[0]);
  if (!verdict.ok) {
    const line = lineOf(sourceFile, bindings[0]);
    stop(
      `${entry.file}:${line}`,
      `identifier \`${entry.name}\` is no longer proven truthy: ${verdict.why} — spec §4.1's all-truthy claim is broken`,
    );
  }
}

/** Is this `cn` binding the sanctioned `import { cn } from "@/lib/ui/cn"`? */
function isCnModuleImport(node) {
  for (let n = node; n !== undefined; n = n.parent) {
    if (ts.isImportDeclaration(n)) {
      const spec = n.moduleSpecifier;
      return ts.isStringLiteral(spec) && spec.text === "@/lib/ui/cn";
    }
  }
  return false;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function printTally(config, tally) {
  console.log(`operand-kind audit — ${config.label}`);
  console.log(`  files walked ................ ${tally.files}`);
  console.log(
    `  sites ....................... ${tally.totalSites} (${tally.filteredSites} filtered, ${tally.unfilteredSites} unfiltered)`,
  );
  console.log(`  kind 1 non-empty literals ... ${tally.kind1Literal}`);
  console.log(`  kind 2 proven identifiers ... ${tally.kind2Identifier}`);
  console.log(
    `  kind 3 conditionals ......... ${tally.kind3Conditional} at ${tally.conditionalSites} sites`,
  );
  console.log(`  sanctioned falsy branches ... ${tally.sanctionedFalsyBranches} (spec §4 E2)`);
}

/* ------------------------------------------------------------------ *
 * --self-test: one mutant per rejection path, plus an accept control
 * ------------------------------------------------------------------ */

const CLEAN_WIDGET = `import { useState } from "react";

const base = "rounded-md px-2";
const trackedButUnused = "tracked-only-in-the-table";
const pillState =
  step === 1 ? "bg-one" : step === 2 ? "bg-two" : step === 3 ? "bg-three" : "bg-four";
const CHIP = ["inline-block max-w-full truncate", "text-xs font-semibold"].join(" ");

export function Widget({ step, active, tone }) {
  return (
    <>
      <span className={[base, pillState, "shrink-0"].join(" ")} />
      <span className={[CHIP, active ? "bg-on" : "bg-off"].join(" ")} />
      <span
        className={[
          "size-1.75 shrink-0 rounded-full",
          tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong",
        ].join(" ")}
      />
      <span className={["a-token", active ? "b-token" : null].filter(Boolean).join(" ")} />
    </>
  );
}
`;

const CLEAN_OTHER = `export function Other({ open }) {
  return <div className={["fixed inset-0", open ? "block" : "hidden"].join(" ")} />;
}
`;

// Widget holds FIVE sites, not four: the `const CHIP = [...].join(" ")` module const is
// itself one, exactly as `CHIP_CLASS` is in the live tree (spec §2.2's "3 uncounted
// sites" note — the same miscount, reproduced here deliberately so the fixture teaches
// it).  Site 4 is the `.filter(Boolean)` one.
const SELF_TEST_FILES = [
  ["components/Widget.tsx", 5],
  ["components/Other.tsx", 1],
];

const SELF_TEST_BASE = {
  files: SELF_TEST_FILES,
  filteredSites: { "components/Widget.tsx": [4] },
  identifierTable: [
    { name: "base", file: "components/Widget.tsx" },
    { name: "pillState", file: "components/Widget.tsx" },
    { name: "CHIP", file: "components/Widget.tsx" },
    // Deliberately never used as an OPERAND: the operand-level shadowing stop cannot fire
    // for it, so a double binding here exercises the definition-level branch alone.
    { name: "trackedButUnused", file: "components/Widget.tsx" },
  ],
  sanctionedFalsyFile: "components/Widget.tsx",
  sanctionedFalsySignature:
    'tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong"',
  sanctionedFalsySiteIndex: 3,
  expected: {
    totalSites: 6,
    filteredSites: 1,
    unfilteredSites: 5,
    conditionalOperands: 3,
    conditionalSites: 3,
    sanctionedFalsyBranches: 1,
  },
};

/**
 * Each mutant names the rejection path it exercises and a substring the STOP output must
 * contain.  A mutant that stops for the WRONG reason is a failed self-test: the assertion
 * is not "it exited 1" but "it exited 1 naming this".
 */
const MUTANTS = [
  {
    id: "P1-out-of-kind-operand",
    why: "an operand outside the three kinds (`&&`, which yields `false`)",
    expect: "outside the three proven-truthy kinds",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(`open ? "block" : "hidden"`, `open && "block"`),
    }),
  },
  {
    id: "P2-falsy-branch-non-sanctioned",
    why: "a ternary operand with a falsy branch at a non-sanctioned site",
    expect: "falsy branch at a non-sanctioned site",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(
        `open ? "block" : "hidden"`,
        `open ? "block" : ""`,
      ),
    }),
  },
  {
    id: "P3-shadowed-identifier",
    why: "a shadowed identifier — truthy outer binding, second falsy inner binding",
    expect: "bindings in this file; exactly 1 is required",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        "export function Widget({ step, active, tone }) {\n  return (",
        'export function Widget({ step, active, tone }) {\n  const base = "";\n  return (',
      ),
    }),
  },
  {
    id: "P4a-sole-bound-identifier-falsy-literal",
    why: "a sole-bound identifier whose own definition is the empty string literal",
    expect: "initializer is the empty string literal",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";',
        'const base = "";',
      ),
    }),
  },
  {
    id: "P4b-sole-bound-identifier-falsy-conditional-branch",
    why: "a sole-bound identifier whose conditional initializer has one falsy branch",
    expect: "conditional initializer has 1 branch(es) that are not non-empty string literals",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        `step === 3 ? "bg-three" : "bg-four"`,
        `step === 3 ? "bg-three" : ""`,
      ),
    }),
  },
  {
    id: "P5-unknown-identifier-operand",
    why: "an identifier operand that is not in spec §4.1's proven-truthy table",
    expect: "is not in spec §4.1's proven-truthy table",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        "[base, pillState,",
        "[base, pillState, unvettedName,",
      ),
    }),
  },
  {
    id: "P6-site-count-premise",
    why: "a site count that no longer matches the declared inventory",
    expect: "site count moved",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": `${CLEAN_OTHER}\nexport const Extra = ["p-1", "p-2"].join(" ");\n`,
    }),
  },
  {
    id: "P7-filtered-map-reconciliation",
    why: "a `.filter(Boolean)` marker that disagrees with the declared filtered map",
    expect: "the declared map has drifted",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        `["a-token", active ? "b-token" : null].filter(Boolean).join(" ")`,
        `["a-token", active ? "b-token" : "c-token"].join(" ")`,
      ),
    }),
  },
  {
    id: "P8-sanctioned-branch-vanished",
    why: "the sole sanctioned E2 branch disappearing (drift in the other direction)",
    expect: "sanctionedFalsyBranches: expected 1, measured 0",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        `tone === "set" ? "" : "bg-border-strong"`,
        `tone === "set" ? "bg-set" : "bg-border-strong"`,
      ),
    }),
  },
  {
    id: "P10-sanctioned-branch-relocated",
    why: "the sanctioned falsy branch DELETED and an equivalent one introduced elsewhere in the same file (the count stays 1)",
    expect: "falsy branch at a non-sanctioned site",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        `tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong"`,
        `tone === "show" ? "bg-accent" : "bg-border-strong"`,
      ).replace(`active ? "bg-on" : "bg-off"`, `active ? "bg-on" : ""`),
    }),
  },
  {
    id: "P11-foreign-filter-predicate",
    why: "a join filtered by a predicate other than `Boolean`, which `cn` is NOT equivalent to",
    expect: "filtered by a predicate other than `Boolean`",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        `["a-token", active ? "b-token" : null].filter(Boolean).join(" ")`,
        `["a-token", active ? "b-token" : null].filter((x) => x !== "skip").join(" ")`,
      ),
    }),
  },
  {
    id: "P12-missing-file",
    why: "a declared inventory file that no longer exists",
    expect: "file is missing",
    mutate: (c) => {
      const next = { ...c };
      delete next["components/Other.tsx"];
      return next;
    },
  },
  {
    id: "P13-filtered-map-mismatch-other-direction",
    why: "a `.filter(Boolean)` marker on a site the map does NOT declare filtered (the opposite direction of P7)",
    expect: "but is not declared filtered",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(
        `["fixed inset-0", open ? "block" : "hidden"].join(" ")`,
        `["fixed inset-0", open ? "block" : "hidden"].filter(Boolean).join(" ")`,
      ),
    }),
  },
  {
    id: "P14-top-level-empty-string-operand",
    why: "a bare empty-string operand at an unfiltered site (not inside a conditional)",
    expect: "operand is the empty string literal at an unfiltered site",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(`"fixed inset-0",`, `"fixed inset-0", "",`),
    }),
  },
  {
    id: "P15-nonliteral-conditional-branch",
    why: "a conditional operand with a branch that is neither a literal nor falsy (a call)",
    expect: "not a non-empty string literal",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(
        `open ? "block" : "hidden"`,
        `open ? compute() : "hidden"`,
      ),
    }),
  },
  {
    id: "P16-allowlisted-identifier-with-no-binding",
    why: "an allowlisted identifier whose definition has vanished from its file",
    expect: "has no binding in this file",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";\n',
        "",
      ).replace("[base, pillState,", "[pillState,"),
    }),
  },
  {
    id: "P17-definition-binding-not-a-variable-declaration",
    why: "an allowlisted name whose sole binding is a function declaration, not a variable",
    expect: "not a variable declaration",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";',
        "function base() {}",
      ),
    }),
  },
  {
    id: "P18-const-without-initializer",
    why: "an allowlisted definition declared without an initializer",
    expect: "declaration has no initializer",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";',
        "declare const base: string;",
      ),
    }),
  },
  {
    id: "P19-invalid-class-list-initializer",
    why: "a class-list initializer holding an empty-string operand",
    expect: "class-list initializer has",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const CHIP = ["inline-block max-w-full truncate", "text-xs font-semibold"].join(" ");',
        'const CHIP = ["inline-block max-w-full truncate", ""].join(" ");',
      ),
    }),
  },
  {
    id: "P20-unsupported-initializer-kind",
    why: "an allowlisted definition whose initializer is a call, which is not proven truthy",
    expect: "that is not proven truthy",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";',
        "const base = computeBase();",
      ),
    }),
  },
  {
    id: "P21-empty-class-list-initializer",
    why: 'an allowlisted definition whose class-list initializer is EMPTY (evaluates to "")',
    expect: "class-list initializer is EMPTY",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const CHIP = ["inline-block max-w-full truncate", "text-xs font-semibold"].join(" ");',
        'const CHIP = [].join(" ");',
      ),
    }),
  },
  {
    id: "P22-array-transform-other-than-filter",
    why: "an array transform other than `filter` between the literal and the join (`.map`), which `cn` does not reproduce",
    expect: "filtered by a predicate other than `Boolean`",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": CLEAN_OTHER.replace(
        '["fixed inset-0", open ? "block" : "hidden"].join(" ")',
        '["fixed inset-0", open ? "block" : "hidden"].map((x) => x).join(" ")',
      ),
    }),
  },
  {
    id: "P23-local-Boolean-shadow",
    why: "a local `Boolean` binding, which makes a `.filter(Boolean)` marker mean something else",
    expect: "`Boolean` has a local binding in this file",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": `const Boolean = () => true;\n${CLEAN_OTHER}`,
    }),
  },
  {
    id: "P24-local-cn-shadow",
    why: "a local `cn` binding, which makes a recognized `cn(...)` site render differently",
    expect: "`cn` has a local binding in this file",
    mutate: (c) => ({
      ...c,
      "components/Other.tsx": `const cn = (...p) => p.join("-");\n${CLEAN_OTHER}`,
    }),
  },
  {
    id: "P25-identifier-defining-file-unparsed",
    why: "an identifier-table entry whose defining file is absent, so its definition cannot be checked",
    expect: "defining file was not parsed",
    mutate: (c) => {
      const next = { ...c };
      delete next["components/Widget.tsx"];
      return next;
    },
  },
  {
    id: "P26-definition-level-multiple-bindings",
    why: "a tracked identifier that is never an operand gains a second binding (only the definition-level stop can see it)",
    expect: "bindings; spec §4.1 checks one definition",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        "export function Widget({ step, active, tone }) {",
        'export function Widget({ step, active, tone }) {\n  const trackedButUnused = "";',
      ),
    }),
  },
  {
    id: "P27-sanctioned-branch-relocated-same-signature",
    why: "the sanctioned conditional SWAPPED with the conditional at another site in the same file (signature and every count unchanged)",
    expect: "falsy branch at a non-sanctioned site",
    mutate: (c) => {
      const sanctioned = 'tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong"';
      const other = 'active ? "bg-on" : "bg-off"';
      const swapped = CLEAN_WIDGET.replace(sanctioned, "__TMP__")
        .replace(other, () => sanctioned)
        .replace("__TMP__", () => other);
      return { ...c, "components/Widget.tsx": swapped };
    },
  },
  {
    id: "P9-identifier-definition-not-const",
    why: "an identifier definition that is no longer `const` (a later write could make it falsy)",
    expect: "declaration is not `const`",
    mutate: (c) => ({
      ...c,
      "components/Widget.tsx": CLEAN_WIDGET.replace(
        'const base = "rounded-md px-2";',
        'let base = "rounded-md px-2";',
      ),
    }),
  },
];

function writeCorpus(root, corpus) {
  for (const [rel, text] of Object.entries(corpus)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, "utf8");
  }
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cn-operand-audit-"));
  const clean = { "components/Widget.tsx": CLEAN_WIDGET, "components/Other.tsx": CLEAN_OTHER };
  const failures = [];

  try {
    // Accept-side control: in-kind operands, the identifier pattern with truthy
    // definitions (including a truthy conditional initializer — the `pillState` shape),
    // a `.filter(Boolean)` site, and the sanctioned falsy branch.  Must exit 0.
    const cleanRoot = path.join(tmp, "clean");
    writeCorpus(cleanRoot, clean);
    const cleanResult = runAudit({
      ...SELF_TEST_BASE,
      label: "self-test clean corpus",
      root: cleanRoot,
    });
    if (cleanResult.stops.length > 0) {
      failures.push(
        `ACCEPT CONTROL failed — clean corpus produced ${cleanResult.stops.length} stop(s):`,
      );
      cleanResult.stops.forEach((s) => failures.push(`    ${s}`));
    } else {
      console.log("  ✓ accept control — clean corpus exits 0");
    }

    for (const mutant of MUTANTS) {
      const root = path.join(tmp, mutant.id);
      writeCorpus(root, mutant.mutate(clean));
      const { stops } = runAudit({ ...SELF_TEST_BASE, label: mutant.id, root });
      if (stops.length === 0) {
        failures.push(
          `REJECTION PATH NOT EXERCISED — ${mutant.id} (${mutant.why}) produced no stop`,
        );
        continue;
      }
      const named = stops.some((s) => s.includes(mutant.expect));
      if (!named) {
        failures.push(
          `WRONG STOP — ${mutant.id} stopped, but no stop names ${JSON.stringify(mutant.expect)}:`,
        );
        stops.forEach((s) => failures.push(`    ${s}`));
        continue;
      }
      console.log(`  ✓ ${mutant.id} — ${mutant.why}`);
    }

    // EVERY RECONCILE PATH, EXERCISED INDEPENDENTLY. The mutants above trip the operand and
    // definition stops, but a `reconcile(...)` line can be deleted without any of them
    // noticing — probed: removing totalSites, filteredSites, unfilteredSites,
    // conditionalOperands or conditionalSites still reported success. Perturbing ONE
    // expectation at a time against the CLEAN corpus isolates each line by name.
    const cleanExpected = SELF_TEST_BASE.expected;
    for (const key of Object.keys(cleanExpected)) {
      const perturbed = { ...cleanExpected, [key]: cleanExpected[key] + 1 };
      const { stops } = runAudit({
        ...SELF_TEST_BASE,
        label: `reconcile:${key}`,
        root: cleanRoot,
        expected: perturbed,
      });
      if (!stops.some((s) => s.includes(`${key}: expected`))) {
        failures.push(
          `RECONCILE PATH NOT EXERCISED — perturbing \`${key}\` produced no stop naming it; ` +
            "that reconcile line could be deleted and this self-test would still pass",
        );
      } else {
        console.log(`  ✓ reconcile:${key} — the premise line for ${key} is live`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error("\nself-test FAILED:");
    failures.forEach((f) => console.error(`  ${f}`));
    return 1;
  }
  console.log(
    `\nself-test passed — ${MUTANTS.length} rejection paths exercised, ` +
      `${Object.keys(SELF_TEST_BASE.expected).length} reconcile premises probed, 1 accept control.`,
  );
  return 0;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

function main(argv) {
  const args = argv.slice(2);
  const unknown = args.filter((a) => a !== "--self-test");
  if (unknown.length > 0) {
    console.error(`usage: node scripts/audit-cn-operand-kinds.mjs [--self-test]`);
    console.error(`unknown argument(s): ${unknown.join(", ")}`);
    return 2;
  }

  if (args.includes("--self-test")) {
    console.log("operand-kind audit — self-test (rejection paths + accept control)");
    return selfTest();
  }

  const { stops, tally } = runAudit(LIVE_CONFIG);
  printTally(LIVE_CONFIG, tally);
  if (stops.length > 0) {
    console.error(
      `\nSTOP — ${stops.length} finding(s). Spec §4.1's equivalence premise no longer holds as measured:`,
    );
    stops.forEach((s) => console.error(`  ${s}`));
    console.error("\nRe-derive spec §2.2 / §4.1 before implementing or merging (plan P1 step 4).");
    return 1;
  }
  console.log("\nOK — every operand at every unfiltered site is proven truthy.");
  return 0;
}

process.exit(main(process.argv));

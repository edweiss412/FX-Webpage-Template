/**
 * tests/components/admin/_metaPopoverViewportSource.test.ts
 *
 * Structural guard (spec 2026-07-24-hoverhelp-visual-viewport, plan Task 2):
 * no popover-placement consumer may read the LAYOUT viewport directly.
 *
 * Consumers are DISCOVERED by walking the tree for `placeWithinVisibleViewport`
 * call sites, not read from a hardcoded list. That is the whole point: round 1
 * of this spec's review caught a second consumer (ShareHub) that a stale,
 * hand-maintained view of "who positions popovers" had missed. A guard with the
 * same weakness would repeat the same miss, so a NEW consumer added later fails
 * this test by default until it uses the shared helper.
 *
 * Comments are stripped before scanning: this repo has a documented
 * comment-fragility failure mode in structural meta-tests, where prose
 * mentioning a banned identifier either masks or fakes a violation.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
// lib/ is scanned too (round-2 F3): a component could otherwise import a lib/
// wrapper that reads the layout viewport and calls the core, evading a
// components-only scan entirely.
const ROOTS = ["components", "app", "lib"];

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Block comments, then line comments (the `[^:]` guard spares `https://`). */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sourceFiles = ROOTS.flatMap((r) => walk(join(REPO_ROOT, r), []));

/**
 * ONE authoritative discovery rule (round-6 F3): a consumer is a file that
 * IMPORTS from the placement-policy module. Import-based, not call-text-based,
 * so `import { placeWithinVisibleViewport as place }` is still discovered - a
 * call-text rule misses every alias.
 */
/**
 * Module specifiers are matched in BOTH alias and RELATIVE form (round-3
 * finding): a wrapper living inside `lib/popover/` can import `./position` and
 * `./viewport` and hand-roll layout-bounded placement without ever writing the
 * `@/lib/popover/...` alias, which an alias-only rule misses entirely.
 */
const spec = (mod: string): string =>
  String.raw`["'](?:@/lib/popover/|\./|\.\./(?:popover/)?)` + mod + String.raw`["']`;

const IMPORTS_PLACE = new RegExp(String.raw`import\s[^;]*?from\s*` + spec("place"));

/**
 * The core may only be imported by the policy module. This matches the IMPORT,
 * not the call, so an alias (`computePopoverPlacement as compute`) and a dead
 * import are both caught; a call-text rule catches neither.
 */
const IMPORTS_CORE_PLACEMENT = new RegExp(
  String.raw`import\s*\{[^}]*\bcomputePopoverPlacement\b[^}]*\}\s*from\s*` + spec("position"),
);

/**
 * A NAMESPACE import reaches the same core without naming it
 * (`import * as pos from "@/lib/popover/position"; pos.computePopoverPlacement(...)`),
 * so the named-import rule alone is evadable. Whole-diff review, F3.
 */
const IMPORTS_CORE_NAMESPACE = new RegExp(
  String.raw`import\s*\*\s*as\s+\w+\s*from\s*` + spec("position"),
);

/**
 * NON-CIRCULAR backstop. Discovery above only sees files that already import the
 * policy module, so a brand-new consumer that hand-rolls placement would not be
 * discovered at all and would escape every rule. This one is independent of
 * imports: NO file under components/ or app/ may read the layout viewport, which
 * is the actual thing this change exists to stop.
 *
 * Allowlist entries record a viewport read that is NOT placement.
 */
const READS_LAYOUT_VIEWPORT = new RegExp(
  [
    // window.innerWidth / globalThis.innerHeight
    String.raw`(?:window|globalThis)\s*\.\s*inner(?:Width|Height)`,
    // window["innerWidth"]
    String.raw`(?:window|globalThis)\s*\[\s*["']inner(?:Width|Height)["']\s*\]`,
    // const { innerWidth } = window
    String.raw`\{[^}]*\binner(?:Width|Height)\b[^}]*\}\s*=\s*(?:window|globalThis)`,
    // document.documentElement.clientWidth - the same measurement by another name
    String.raw`document\s*\.\s*documentElement\s*\.\s*client(?:Width|Height)`,
  ].join("|"),
);
const LAYOUT_VIEWPORT_ALLOWLIST = new Map<string, string>([
  [
    "components/admin/dev/DevCaptureControl.tsx",
    "records the viewport size into a dev capture payload; positions nothing",
  ],
]);

/**
 * The placement core is reserved to the policy module, REPO-WIDE. Scanning only
 * components/ let a lib/ wrapper call the core and read the layout viewport
 * while the component importing it stayed clean (round-2 F3).
 */
const CORE_IMPORT_ALLOWLIST = new Set(["lib/popover/place.ts"]);

/**
 * Residual, recorded rather than hidden: a file that aliases the global first
 * (`const w: Window = window; w.innerWidth`) is not matched by a lexical rule.
 * `lib/popover/viewport.ts` legitimately reads `win.innerWidth` from an injected
 * parameter, which is why parameter-style reads are not banned outright.
 */

const consumers = sourceFiles.filter((f) =>
  IMPORTS_PLACE.test(stripComments(readFileSync(f, "utf8"))),
);

describe("popover placement consumers read the visible viewport, not the layout viewport", () => {
  it("discovers EXACTLY the two known consumers", () => {
    // Set equality, not containment: a third consumer appearing silently is
    // exactly the drift that hid ShareHub for a whole review round.
    const rels = consumers.map((f) => relative(REPO_ROOT, f)).sort();
    expect(rels).toEqual(
      ["components/admin/HoverHelp.tsx", "components/admin/showpage/ShareHub.tsx"].sort(),
    );
  });

  it("no scanned file reads the LAYOUT viewport (import-independent, repo-wide)", () => {
    const offenders = sourceFiles
      .filter((f) => READS_LAYOUT_VIEWPORT.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(REPO_ROOT, f))
      .filter((rel) => !LAYOUT_VIEWPORT_ALLOWLIST.has(rel));
    expect(offenders).toEqual([]);
  });

  it("the allowlist has no stale rows", () => {
    for (const [rel] of LAYOUT_VIEWPORT_ALLOWLIST) {
      const abs = join(REPO_ROOT, rel);
      const present = sourceFiles.includes(abs);
      expect(present, `${rel} is allowlisted but no longer exists`).toBe(true);
      expect(
        READS_LAYOUT_VIEWPORT.test(stripComments(readFileSync(abs, "utf8"))),
        `${rel} is allowlisted but no longer reads the layout viewport`,
      ).toBe(true);
    }
  });

  it("a NAMESPACE core import is rejected too", () => {
    const ns = `import * as pos from "@/lib/popover/position";`;
    expect(IMPORTS_CORE_NAMESPACE.test(ns)).toBe(true);
  });

  it("RELATIVE specifiers are matched, not just the @/ alias", () => {
    // A sibling module inside lib/popover/ writes "./position", never the alias.
    expect(
      IMPORTS_CORE_PLACEMENT.test(`import { computePopoverPlacement } from "./position";`),
    ).toBe(true);
    expect(IMPORTS_CORE_NAMESPACE.test(`import * as p from "../popover/position";`)).toBe(true);
    expect(IMPORTS_PLACE.test(`import { placeWithinVisibleViewport } from "./place";`)).toBe(true);
  });

  it.each(consumers.map((f) => [relative(REPO_ROOT, f), f] as const))(
    "%s does not read window.innerWidth/innerHeight",
    (_rel, file) => {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(code).not.toMatch(/window\s*\.\s*inner(Width|Height)/);
    },
  );

  // Stronger than "uses the helper": a consumer must NOT call the placement core
  // directly, because the bounds policy (and its never-newly-hidden guarantee)
  // lives in lib/popover/place.ts. A direct core call would bypass it entirely.
  it("only lib/popover/place.ts imports the placement core, repo-wide", () => {
    // Scope (round-6 F3): the core is reserved to lib/popover/place.ts, which
    // owns the bounds policy and its never-newly-hidden guarantee. A UI file
    // reaching past it - by direct call, by alias, or by a dead import that a
    // later edit would use - bypasses that guarantee. A future non-viewport
    // consumer needing explicit bounds should call the core from a lib/ module,
    // not from a component, so this ban is deliberately total for UI paths.
    const direct = sourceFiles
      .filter((f) => {
        const code = stripComments(readFileSync(f, "utf8"));
        return IMPORTS_CORE_PLACEMENT.test(code) || IMPORTS_CORE_NAMESPACE.test(code);
      })
      .map((f) => relative(REPO_ROOT, f))
      .filter((rel) => !CORE_IMPORT_ALLOWLIST.has(rel));
    expect(direct).toEqual([]);
  });

  it("the ban is import-based, so an ALIASED core import is still rejected", () => {
    const aliased = `import { computePopoverPlacement as compute } from "@/lib/popover/position";`;
    expect(IMPORTS_CORE_PLACEMENT.test(aliased)).toBe(true);
  });

  it("a DEAD core import (never called) is still rejected", () => {
    const dead = `import { computePopoverPlacement } from "@/lib/popover/position";\nexport const x = 1;`;
    expect(IMPORTS_CORE_PLACEMENT.test(dead)).toBe(true);
  });

  it("an ALIASED policy import is still DISCOVERED as a consumer", () => {
    const aliasedPlace = `import { placeWithinVisibleViewport as place } from "@/lib/popover/place";`;
    expect(IMPORTS_PLACE.test(aliasedPlace)).toBe(true);
  });
});

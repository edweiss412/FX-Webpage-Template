/**
 * tests/components/admin/_metaPopoverViewportSource.test.ts
 *
 * Structural guard: popover placement goes through the shared policy, and
 * nothing else reads the layout viewport.
 *
 * Specifiers are RESOLVED, not pattern-matched. Every regex formulation leaked
 * in turn: alias-only missed `./position`; adding `./` and `../` still missed
 * `../../lib/popover/position`, missed re-exports
 * (`export { computePopoverPlacement } from "./position"`), and falsely matched
 * any unrelated local module that happened to be named `place`. Resolving each
 * specifier to a real path and comparing against the canonical module ends that
 * whole class instead of patching one shape at a time.
 *
 * The walk covers .ts/.tsx AND .mts/.cts, because tsconfig includes them and an
 * .mts wrapper could otherwise re-export the core and serve a third consumer
 * without ever entering the scan.
 *
 * Consumers are DISCOVERED, never listed: a hardcoded list is exactly what let a
 * second consumer (ShareHub) go unnoticed for a full review round.
 */
import { describe, expect, it } from "vitest";
import { stripCommentsForFile } from "../../_shared/stripComments";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
// lib/ is scanned too: a component could otherwise import a lib/ wrapper that
// reads the layout viewport and calls the core while itself staying clean.
const ROOTS = ["components", "app", "lib"];

const CANONICAL = {
  place: join(REPO_ROOT, "lib/popover/place.ts"),
  position: join(REPO_ROOT, "lib/popover/position.ts"),
} as const;

/** The policy module is the ONLY thing allowed to import the placement core. */
const CORE_IMPORT_ALLOWLIST = new Set(["lib/popover/place.ts"]);

/**
 * Layout-viewport reads that are NOT placement. Each row is a deliberate
 * exemption; the stale-row test below fails if one stops being true.
 */
const LAYOUT_VIEWPORT_ALLOWLIST = new Map<string, string>([
  [
    "components/admin/dev/DevCaptureControl.tsx",
    "records the viewport size into a dev capture payload; positions nothing",
  ],
]);

/**
 * All four spellings of the same measurement. Residual, recorded rather than
 * hidden: a file that aliases the global first (`const w: Window = window`)
 * defeats any lexical rule, and lib/popover/viewport.ts legitimately reads
 * `win.innerWidth` from an INJECTED parameter, which is why parameter-style
 * reads are not banned outright.
 */
const READS_LAYOUT_VIEWPORT = new RegExp(
  [
    String.raw`(?:window|globalThis)\s*\.\s*inner(?:Width|Height)`,
    String.raw`(?:window|globalThis)\s*\[\s*["']inner(?:Width|Height)["']\s*\]`,
    String.raw`\{[^}]*\binner(?:Width|Height)\b[^}]*\}\s*=\s*(?:window|globalThis)`,
    String.raw`document\s*\.\s*documentElement\s*\.\s*client(?:Width|Height)`,
  ].join("|"),
);

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx?|mts|cts)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Block comments, then line comments (the `[^:]` guard spares `https://`). */

/** Every `from "..."` specifier, imports AND re-exports, with its clause. */
function specifiersOf(code: string): { spec: string; clause: string }[] {
  const out: { spec: string; clause: string }[] = [];
  const re = /(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) out.push({ clause: m[1] ?? "", spec: m[2] ?? "" });
  return out;
}

/** Resolve an alias or relative specifier to a concrete file path, or null. */
function resolveSpec(fromFile: string, spec: string): string | null {
  // `moduleResolution: "bundler"` resolves a ".js" specifier to the ".ts"
  // source, so the extension must be stripped before probing or
  // `position.js` becomes `position.js.ts` and the rule silently misses.
  const bare = spec.replace(/\.(js|jsx|mjs|cjs)$/, "");
  let base: string;
  if (bare.startsWith("@/")) base = join(REPO_ROOT, bare.slice(2));
  else if (bare.startsWith(".")) base = resolve(dirname(fromFile), bare);
  else return null; // package import
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    join(base, "index.ts"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return `${base}.ts`;
}

const importsModule = (file: string, code: string, target: string): boolean =>
  specifiersOf(code).some((s) => resolveSpec(file, s.spec) === target);

const importsCorePlacement = (file: string, code: string): boolean =>
  specifiersOf(code).some(
    (s) =>
      resolveSpec(file, s.spec) === CANONICAL.position &&
      // named, `* as ns`, AND bare `export *` - the last re-exports the core
      // wholesale and was accepted by a clause filter that required a name.
      (/\bcomputePopoverPlacement\b/.test(s.clause) ||
        /\*\s+as\s+\w+/.test(s.clause) ||
        /^\s*\*\s*$/.test(s.clause)),
  );

const sourceFiles = ROOTS.flatMap((r) => walk(join(REPO_ROOT, r), []));
const rawCache = new Map<string, string>();
const rawOf = (f: string): string => {
  let v = rawCache.get(f);
  if (v === undefined) {
    v = readFileSync(f, "utf8");
    rawCache.set(f, v);
  }
  return v;
};
const strippedCache = new Map<string, string>();
const strippedSourceOf = (f: string): string => {
  let v = strippedCache.get(f);
  if (v === undefined) {
    v = stripCommentsForFile(rawOf(f), f);
    strippedCache.set(f, v);
  }
  return v;
};
/** Sound fast path (whole-diff R1 F2 replaced a raw-first predicate test, which was
 *  unsound: `window/* gap *\/.innerWidth` matches stripped text but not raw). The
 *  prefilter uses only CONTIGUOUS fragments — identifiers and module-specifier path
 *  segments cannot be split by a comment, so any stripped-source predicate match
 *  requires one of these to appear verbatim in raw. */
const MAY_MATCH = /inner(?:Width|Height)|client(?:Width|Height)|popover\//;
const matchesStripped = (f: string, test: (code: string) => boolean): boolean =>
  MAY_MATCH.test(rawOf(f)) && test(strippedSourceOf(f));

const consumers = sourceFiles.filter((f) => matchesStripped(f, (c) => importsModule(f, c, CANONICAL.place)));

describe("popover placement consumers read the visible viewport, not the layout viewport", () => {
  it("discovers EXACTLY the two known consumers", () => {
    const rels = consumers.map((f) => relative(REPO_ROOT, f)).sort();
    expect(rels).toEqual(
      ["components/admin/HoverHelp.tsx", "components/admin/showpage/ShareHub.tsx"].sort(),
    );
  });

  it("only lib/popover/place.ts imports the placement core, repo-wide", () => {
    const direct = sourceFiles
      .filter((f) => matchesStripped(f, (c) => importsCorePlacement(f, c)))
      .map((f) => relative(REPO_ROOT, f))
      .filter((rel) => !CORE_IMPORT_ALLOWLIST.has(rel));
    expect(direct).toEqual([]);
  });

  it("no scanned file reads the LAYOUT viewport (import-independent, repo-wide)", () => {
    const offenders = sourceFiles
      .filter((f) => matchesStripped(f, (c) => READS_LAYOUT_VIEWPORT.test(c)))
      .map((f) => relative(REPO_ROOT, f))
      .filter((rel) => !LAYOUT_VIEWPORT_ALLOWLIST.has(rel));
    expect(offenders).toEqual([]);
  });

  it("the allowlist has no stale rows", () => {
    for (const [rel] of LAYOUT_VIEWPORT_ALLOWLIST) {
      const abs = join(REPO_ROOT, rel);
      expect(sourceFiles.includes(abs), `${rel} is allowlisted but no longer exists`).toBe(true);
      expect(
        READS_LAYOUT_VIEWPORT.test(strippedSourceOf(abs)),
        `${rel} is allowlisted but no longer reads the layout viewport`,
      ).toBe(true);
    }
  });

  it("resolution catches every specifier shape, and only the real modules", () => {
    const here = join(REPO_ROOT, "components/admin/Probe.tsx");
    const core = (code: string) => importsCorePlacement(here, code);
    expect(core(`import { computePopoverPlacement } from "@/lib/popover/position";`)).toBe(true);
    expect(core(`import * as p from "../../lib/popover/position";`)).toBe(true);
    expect(core(`export { computePopoverPlacement } from "../../lib/popover/position";`)).toBe(
      true,
    );
    expect(core(`import { computePopoverPlacement as c } from "../../lib/popover/position";`)).toBe(
      true,
    );
    expect(core(`import { computePopoverPlacement } from "@/lib/popover/position.js";`)).toBe(true);
    expect(core(`export * from "@/lib/popover/position";`)).toBe(true);
    // A DIFFERENT module exporting a same-named symbol is not the core.
    expect(core(`import { computePopoverPlacement } from "./localHelpers";`)).toBe(false);
    // An unrelated local module named `place` is NOT the policy module.
    expect(importsModule(here, `import x from "./place";`, CANONICAL.place)).toBe(false);
    expect(
      importsModule(
        here,
        `import { placeWithinVisibleViewport } from "@/lib/popover/place";`,
        CANONICAL.place,
      ),
    ).toBe(true);
  });

  it.each(consumers.map((f) => [relative(REPO_ROOT, f), f] as const))(
    "%s does not read window.innerWidth/innerHeight",
    (_rel, file) => {
      expect(strippedSourceOf(file)).not.toMatch(READS_LAYOUT_VIEWPORT);
    },
  );
});

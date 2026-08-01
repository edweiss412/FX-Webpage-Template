/**
 * tests/e2e/_metaLiveEntryToolchain.test.ts
 *
 * The harness toolchain (esbuild for the browser bundle, the Tailwind CLI for
 * harness CSS) is invoked from exactly one place:
 * `tests/e2e/helpers/liveEntryToolchain.ts`. Before that helper, 36 call sites
 * across 29 files spelled the invocations out by hand via `pnpm dlx`, which
 * meant a network fetch per run for packages that are local devDependencies.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §3.3.
 *
 * WHY THIS PARSES INSTEAD OF PATTERN-MATCHING TEXT. Two earlier versions did
 * regex-over-source with a hand-rolled comment stripper, and both were wrong:
 *   - banning the bare words flagged `pnpm dlx tsx` (legitimate) and the words
 *     `@import "tailwindcss"` inside a comment;
 *   - the hand lexer mis-parsed a regex literal whose character class contains
 *     a slash-star, reading it as a block comment and deleting a real
 *     invocation after it, and treated template literals as opaque so comments
 *     inside an interpolation became false positives.
 * Comments and regex literals are exactly what a real parser already gets
 * right, so this walks the TypeScript AST: only STRING LITERALS in CALL
 * ARGUMENTS (or an import specifier) count, which cannot be a comment by
 * construction.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const E2E = join(ROOT, "tests/e2e");

/**
 * Files allowed to own a toolchain invocation. Every entry needs a reason —
 * an unreasoned exemption is how a second owner goes invisible.
 */
const EXEMPT = new Map<string, string>([
  ["helpers/liveEntryToolchain.ts", "the permitted invocation point"],
  ["_metaLiveEntryToolchain.test.ts", "this guard; its fixtures name the binaries"],
  [
    "_step3ReviewModalBundle.mjs",
    "needs esbuild's PLUGIN API (useServerElision / emptyNodeBuiltins) to replicate " +
      "Next's `use server` elision — a CLI invocation cannot express a resolver plugin, " +
      "so this cannot route through the helper. See its own header for the rationale.",
  ],
  [
    "helpers/useServerDirectivePlugin.test.ts",
    "the plugin contract test builds fixtures through the real esbuild API — the " +
      "build boundary IS the contract, so it imports esbuild by name (PR-C / C1).",
  ],
]);

/** Binary names that mean "the harness toolchain", however they are spelled. */
const TOOLCHAIN = ["esbuild", "tailwindcss", "@tailwindcss/cli"];

/** Runners that can carry a toolchain binary as a command or an argument. */
const SPAWNERS = new Set([
  "execFileSync",
  "execSync",
  "exec",
  "spawnSync",
  "spawn",
  "execFile",
  "fork",
]);

/** `esbuild@0.28.0` -> `esbuild`; `@tailwindcss/cli@4.2.4` -> `@tailwindcss/cli`. */
function normalise(raw: string): string {
  return raw.replace(/@[\d.]+$/, "");
}

function isToolchainToken(raw: string): boolean {
  return TOOLCHAIN.includes(normalise(raw));
}

/**
 * Toolchain binaries invoked from this source, found by walking the AST.
 *
 * Covers, deliberately: the binary as the command itself
 * (`execFileSync("esbuild", …)`), as an argument-array element after any number
 * of flags (`["exec", "--silent", "esbuild"]`), inside a single command string
 * (`execSync("pnpm exec esbuild …")`, `npx esbuild …`), and direct API use
 * (`import … from "esbuild"`).
 */
export function toolchainInvocations(source: string, fileName = "probe.ts"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();

  const noteToken = (raw: string): void => {
    if (isToolchainToken(raw)) found.add(normalise(raw));
  };
  const noteCommandString = (raw: string): void => {
    for (const word of raw.split(/\s+/)) noteToken(word);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      noteToken(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (SPAWNERS.has(name) || name === "require") {
        for (const arg of node.arguments) {
          if (ts.isStringLiteralLike(arg)) {
            noteToken(arg.text);
            noteCommandString(arg.text);
          } else if (ts.isArrayLiteralExpression(arg)) {
            for (const el of arg.elements) {
              if (ts.isStringLiteralLike(el)) noteToken(el.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return [...found].sort();
}

/** Package scripts referenced from the given sources (array or string form). */
export function referencedScripts(sources: string[], scriptNames: string[]): string[] {
  return scriptNames.filter((name) => {
    const n = name.replace(/[.*+?^${}()|[\]\\/@:-]/g, "\\$&");
    const patterns = [
      new RegExp(
        `["'\`]pnpm["'\`]\\s*,\\s*\\[\\s*(?:["'\`](?:run|exec)["'\`]\\s*,\\s*)?["'\`]${n}["'\`]`,
      ),
      new RegExp(`\\bpnpm\\s+(?:run\\s+)?${n}(?![\\w:.-])`),
    ];
    return sources.some((src) => patterns.some((re) => re.test(src)));
  });
}

function walk(dir: string = E2E): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : /\.(tsx?|mjs|cjs|js)$/.test(entry.name)
        ? [relative(E2E, join(dir, entry.name))]
        : [],
  );
}

function candidates(): string[] {
  return walk().filter((f) => !EXEMPT.has(f));
}

describe("live-entry toolchain is invoked from exactly one place", () => {
  it("detects every invocation shape, and no look-alike", () => {
    // Positives — the two shapes in this repo…
    expect(toolchainInvocations('execFileSync("pnpm", ["dlx", "esbuild@0.28.0", e])')).toEqual([
      "esbuild",
    ]);
    expect(toolchainInvocations('execFileSync("pnpm", ["exec", "tailwindcss", "-i", c])')).toEqual([
      "tailwindcss",
    ]);
    // …and the shapes an earlier regex version missed.
    expect(toolchainInvocations('execFileSync("esbuild", [entry])')).toEqual(["esbuild"]);
    expect(toolchainInvocations('execSync("npx esbuild --bundle x.ts")')).toEqual(["esbuild"]);
    expect(toolchainInvocations('spawnSync("pnpm", ["exec", "--silent", "esbuild", e])')).toEqual([
      "esbuild",
    ]);
    expect(toolchainInvocations('import * as esbuild from "esbuild";')).toEqual(["esbuild"]);

    // Negatives — legitimate, must stay green.
    expect(toolchainInvocations('spawnSync("pnpm", ["dlx", "tsx", "seed.ts"])')).toEqual([]);
    expect(
      toolchainInvocations('// app/globals.css is `@import "tailwindcss"` + design tokens'),
    ).toEqual([]);
    expect(toolchainInvocations("/* esbuild is used by the helper */")).toEqual([]);
    // A regex literal containing a slash-star broke the previous hand lexer.
    expect(toolchainInvocations('const r = /[/*]/; const ok = "unrelated";')).toEqual([]);
  });

  it("the script-reference detector resolves the shapes this repo uses", () => {
    expect(referencedScripts(['spawnSync("pnpm", ["db:seed"], {})'], ["db:seed", "other"])).toEqual(
      ["db:seed"],
    );
    expect(referencedScripts(['execSync("pnpm run build:x")'], ["build:x"])).toEqual(["build:x"]);
    expect(referencedScripts(['const x = "prebuild:xylophone";'], ["build:xy"])).toEqual([]);
  });

  it("no file but the helper invokes a toolchain binary", () => {
    const offenders = candidates().filter(
      (f) => toolchainInvocations(readFileSync(join(E2E, f), "utf8"), f).length > 0,
    );
    expect(offenders, "route these through tests/e2e/helpers/liveEntryToolchain.ts").toEqual([]);
  });

  it("no package script reachable from tests/e2e invokes a toolchain binary", () => {
    // Spec §3.3 clause 3: moving the invocation into a package script would
    // otherwise satisfy a filesystem-only scan of tests/e2e.
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const sources = candidates().map((f) => readFileSync(join(E2E, f), "utf8"));
    const offenders = referencedScripts(sources, Object.keys(scripts)).filter((name) =>
      (scripts[name] ?? "").split(/\s+/).some((word) => isToolchainToken(word)),
    );
    expect(offenders, "a referenced package script invokes the toolchain").toEqual([]);
  });
});

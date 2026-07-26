/**
 * tests/e2e/_metaLiveEntryToolchain.test.ts
 *
 * The harness toolchain (esbuild for the browser bundle, the Tailwind CLI for
 * harness CSS) is invoked from exactly one place:
 * `tests/e2e/helpers/liveEntryToolchain.ts`. Before that helper, 36 call sites
 * across 29 files spelled the invocations out by hand via `pnpm dlx`, which
 * meant a network fetch per run for packages that are local devDependencies,
 * and nothing keeping the invocations consistent.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §3.3.
 *
 * WHY THE DETECTOR MATCHES AN INVOCATION, NOT A WORD. An earlier draft banned
 * the bare strings `dlx` / `esbuild` / `tailwindcss` and would have failed on
 * three legitimate things: `pnpm dlx tsx` in `help-docs-setup.ts` (dlx is fine;
 * tsx is not a toolchain binary), the words `@import "tailwindcss"` inside a
 * comment in `step3-schedule-bookend-layout.spec.ts`, and this file's own
 * fixtures. Since this test runs in the serial project, that would have
 * reddened the required `unit-suite` check. So: a toolchain binary must appear
 * as a COMMAND ARGUMENT next to `dlx` or `exec`, and comments do not count.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const E2E = join(ROOT, "tests/e2e");

/**
 * Files allowed to own a toolchain invocation. Every entry needs a reason —
 * an unreasoned exemption is how a second owner goes invisible.
 */
const EXEMPT = new Map<string, string>([
  ["helpers/liveEntryToolchain.ts", "the permitted invocation point"],
  ["_metaLiveEntryToolchain.test.ts", "this guard; its fixtures necessarily contain the strings"],
  [
    "_step3ReviewModalBundle.mjs",
    "needs esbuild's PLUGIN API (useServerElision / emptyNodeBuiltins) to replicate " +
      "Next's `use server` elision — a CLI invocation cannot express a resolver plugin, " +
      "so this cannot route through the helper. See its own header for the full rationale.",
  ],
]);

const TOOLCHAIN = ["esbuild", "@tailwindcss/cli", "tailwindcss"] as const;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/@]/g, "\\$&");
}

/**
 * Remove comments WITHOUT destroying string literals. A naive `//` strip eats
 * the rest of a line containing e.g. `"http://x"` or `"foo//bar"`, which would
 * hide a real invocation later on that line.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Toolchain binaries used as a command argument (adjacent to `dlx` or `exec`),
 * ignoring anything inside comments.
 */
export function toolchainInvocations(source: string): string[] {
  const code = stripComments(source);
  return TOOLCHAIN.filter((bin) => {
    const b = escapeRe(bin);
    const v = "(?:@[\\d.]+)?";
    return [
      // ["dlx","esbuild"] / ["exec","tailwindcss"], optionally via a `--` separator
      new RegExp(
        `["'\`](?:dlx|exec)["'\`]\\s*,\\s*(?:["'\`]--["'\`]\\s*,\\s*)?["'\`]${b}${v}["'\`]`,
      ),
      // a single command string: execSync("pnpm exec esbuild ...")
      new RegExp(`["'\`][^"'\`]*\\bpnpm\\s+(?:dlx|exec)\\s+(?:--\\s+)?${b}${v}\\b`),
      // direct API use
      new RegExp(`from\\s+["'\`]${b}["'\`]|require\\(\\s*["'\`]${b}["'\`]`),
    ].some((re) => re.test(code));
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

/**
 * Package scripts referenced from the given sources.
 *
 * Must resolve BOTH shapes this repo uses: the argument-array form
 * `spawnSync("pnpm", ["db:seed"])` and the command-string form
 * `pnpm run build:x`. A textual `pnpm <name>` scan alone misses the array
 * form, which is how `help-docs-setup.ts:34` invokes its seed.
 */
export function referencedScripts(sources: string[], scriptNames: string[]): string[] {
  return scriptNames.filter((name) => {
    const n = escapeRe(name);
    const patterns = [
      new RegExp(
        `["'\`]pnpm["'\`]\\s*,\\s*\\[\\s*(?:["'\`](?:run|exec)["'\`]\\s*,\\s*)?["'\`]${n}["'\`]`,
      ),
      new RegExp(`\\bpnpm\\s+(?:run\\s+)?${n}(?![\\w:.-])`),
    ];
    return sources.some((src) => patterns.some((re) => re.test(src)));
  });
}

function candidates(): string[] {
  return walk().filter((f) => !EXEMPT.has(f));
}

describe("live-entry toolchain is invoked from exactly one place", () => {
  it("the detector fires on a real invocation and ignores look-alikes", () => {
    // Positive: the two shapes that exist in this repo.
    expect(toolchainInvocations('execFileSync("pnpm", ["dlx", "esbuild@0.28.0", entry])')).toEqual([
      "esbuild",
    ]);
    expect(
      toolchainInvocations('execFileSync("pnpm", ["exec", "tailwindcss", "-i", css])'),
    ).toEqual(["tailwindcss"]);
    // Negative: dlx with a NON-toolchain binary is legitimate (help-docs-setup).
    expect(toolchainInvocations('spawnSync("pnpm", ["dlx", "tsx", "seed.ts"])')).toEqual([]);
    // Negative: the word inside a comment is not an invocation.
    expect(
      toolchainInvocations('// app/globals.css is `@import "tailwindcss"` + design tokens'),
    ).toEqual([]);
    expect(toolchainInvocations("/* esbuild is used by the helper */")).toEqual([]);
  });

  it("no file but the helper invokes a toolchain binary", () => {
    const offenders = candidates().filter(
      (f) => toolchainInvocations(readFileSync(join(E2E, f), "utf8")).length > 0,
    );
    expect(offenders, "route these through tests/e2e/helpers/liveEntryToolchain.ts").toEqual([]);
  });

  it("only the helper imports esbuild directly", () => {
    const offenders = candidates().filter((f) =>
      /from\s+["']esbuild["']|require\(["']esbuild["']\)/.test(readFileSync(join(E2E, f), "utf8")),
    );
    expect(offenders, "the esbuild API belongs behind the helper").toEqual([]);
  });

  it("the script-reference detector resolves the shapes this repo actually uses", () => {
    // Positive fixtures, both real shapes:
    expect(referencedScripts(['spawnSync("pnpm", ["db:seed"], {})'], ["db:seed", "other"])).toEqual(
      ["db:seed"],
    );
    expect(referencedScripts(['execSync("pnpm run build:x")'], ["build:x"])).toEqual(["build:x"]);
    expect(
      referencedScripts(["const s = `pnpm test:e2e:standalone`;"], ["test:e2e:standalone"]),
    ).toEqual(["test:e2e:standalone"]);
    // Negative: a script name that merely appears as a substring of another word.
    expect(referencedScripts(['const x = "prebuild:xylophone";'], ["build:xy"])).toEqual([]);
  });

  it("no package script reachable from tests/e2e invokes a toolchain binary", () => {
    // Spec §3.3 clause 3: moving the invocation into a package script would
    // otherwise satisfy a filesystem-only scan of tests/e2e.
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const sources = candidates().map((f) => readFileSync(join(E2E, f), "utf8"));
    const referenced = referencedScripts(sources, Object.keys(scripts));
    const offenders = referenced.filter((name) =>
      TOOLCHAIN.some((bin) => new RegExp(`\\b${escapeRe(bin)}\\b`).test(scripts[name] ?? "")),
    );
    expect(offenders, "a referenced package script invokes the toolchain").toEqual([]);
  });
});

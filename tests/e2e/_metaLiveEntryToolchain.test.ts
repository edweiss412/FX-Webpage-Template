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

/** The permitted invocation point, plus this guard (its fixtures hold the strings). */
const EXEMPT = new Set(["helpers/liveEntryToolchain.ts", "_metaLiveEntryToolchain.test.ts"]);

const TOOLCHAIN = ["esbuild", "@tailwindcss/cli", "tailwindcss"] as const;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/@]/g, "\\$&");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Toolchain binaries used as a command argument (adjacent to `dlx` or `exec`),
 * ignoring anything inside comments.
 */
export function toolchainInvocations(source: string): string[] {
  const code = stripComments(source);
  return TOOLCHAIN.filter((bin) =>
    new RegExp(`["'\`](?:dlx|exec)["'\`]\\s*,\\s*["'\`]${escapeRe(bin)}(@[\\d.]+)?["'\`]`).test(
      code,
    ),
  );
}

function walk(dir: string = E2E): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [relative(E2E, join(dir, entry.name))]
        : [],
  );
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

  it("no package script reachable from tests/e2e invokes a toolchain binary", () => {
    // Spec §3.3 clause 3: moving the invocation into a package script would
    // otherwise satisfy a filesystem-only scan of tests/e2e.
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const sources = candidates().map((f) => readFileSync(join(E2E, f), "utf8"));
    const referenced = Object.keys(scripts).filter((name) =>
      sources.some((src) => src.includes(`pnpm ${name}`) || src.includes(`"${name}"`)),
    );
    const offenders = referenced.filter((name) =>
      TOOLCHAIN.some((bin) => new RegExp(`\\b${escapeRe(bin)}\\b`).test(scripts[name] ?? "")),
    );
    expect(offenders, "a referenced package script invokes the toolchain").toEqual([]);
  });
});

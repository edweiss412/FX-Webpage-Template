/**
 * tests/e2e/helpers/liveEntryToolchain.ts
 *
 * The ONE place the e2e harness toolchain is invoked.
 *
 * Every standalone harness spec needs two artefacts: a browser bundle of its
 * live entry (esbuild) and a stylesheet scoped to the components it renders
 * (the Tailwind CLI). Before this helper, 36 call sites across 29 files each
 * spelled those invocations out by hand via `pnpm dlx`, which meant (a) a
 * network fetch per call for packages that are — or should be — local
 * devDependencies, and (b) nothing keeping the invocations consistent. Spec
 * `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.4 has
 * the census and §3 the rationale.
 *
 * DELIBERATELY NOT a resolver policy. An earlier design gave this module a
 * rule-based esbuild plugin that decided which modules were server-only and
 * stubbed them. It was built, measured, and descoped because its safety
 * guarantee could not be made sound — see `BL-HARNESS-RESOLVER-POLICY` in
 * BACKLOG.md. Aliases stay EXPLICIT at each call site: a caller says which
 * specifiers it stubs and with what, and nothing here second-guesses it.
 *
 * `tests/e2e/_metaLiveEntryToolchain.test.ts` enforces that no other file
 * under `tests/e2e/**` names a toolchain binary.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Derived from this file's location, NOT process.cwd(): every spec already
// uses `join(__dirname, "..", "..")` for exactly this reason, and cwd is only
// the repo root by convention of how the runners happen to be invoked.
// tests/e2e/helpers/ -> repo root is three levels up.
const REPO_ROOT = join(__dirname, "..", "..", "..");

export interface BundleOptions {
  /** Absolute path to the harness entry (.tsx). */
  entry: string;
  /** Absolute path of the bundle to write. */
  outFile: string;
  /**
   * Import specifier -> absolute stub path, passed through as `--alias:`.
   * Explicit per call site by design (see the module header).
   */
  aliases?: Record<string, string>;
  /** Extra `--external:` entries. `node:fs` is always included. */
  externals?: string[];
  /**
   * When set, esbuild writes its build metafile (JSON) to this absolute path.
   * C4's import-graph reality check consumes it to prove no server library
   * (googleapis / postgres / google-auth-library) reached the browser graph.
   */
  metafilePath?: string;
}

/**
 * Bundle a harness entry for the browser with the LOCAL esbuild binary.
 *
 * `pnpm exec`, not `pnpm dlx`: esbuild is already a devDependency pinned to
 * the exact version the call sites used to fetch (`package.json`), so `dlx`
 * bought a network round-trip and a second copy of the same compiler.
 */
export function bundleLiveEntry({
  entry,
  outFile,
  aliases = {},
  externals = [],
  metafilePath,
}: BundleOptions): void {
  if (!existsSync(entry)) {
    throw new Error(`bundleLiveEntry: entry does not exist: ${entry}`);
  }
  if (!existsSync(dirname(outFile))) {
    throw new Error(`bundleLiveEntry: output directory does not exist: ${dirname(outFile)}`);
  }

  // Spawns a `node` child (not `pnpm exec esbuild`) because the harness now
  // needs an esbuild resolver PLUGIN (useServerDirectivePlugin) that a CLI
  // invocation cannot express. The child mirrors the CLI flag set exactly, so
  // no call site changes; aliases still apply before plugins. See
  // _bundleLiveEntryChild.mjs.
  execFileSync(
    "node",
    [
      join(__dirname, "_bundleLiveEntryChild.mjs"),
      entry,
      outFile,
      join(REPO_ROOT, "tsconfig.json"),
      JSON.stringify(aliases),
      JSON.stringify(["node:fs", ...externals]),
      ...(metafilePath ? ["--metafile", metafilePath] : []),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );
}

export interface CssOptions {
  /** Absolute path of an ALREADY-WRITTEN entry stylesheet (the `-i` input). */
  entryCss: string;
  /** Absolute path of the compiled stylesheet to write (the `-o` output). */
  outFile: string;
}

/**
 * Compile a harness stylesheet with the LOCAL Tailwind CLI.
 *
 * DELIBERATELY NARROW. An earlier version also owned building the entry
 * stylesheet from a `sources` list plus `app/globals.css`. That consolidation
 * was abandoned: the 28 call sites construct their entry CSS in materially
 * different ways (inline template literals, `sources.map`, an array of
 * pre-formatted `@source` directives), and a mechanical rewrite of all of them
 * produced 54 TypeScript errors across 12 files. The PR's goal is removing the
 * per-run NETWORK FETCH, which this achieves; deduplicating the `globals.css`
 * read is cosmetic and not worth restructuring 28 harnesses for.
 *
 * The binary is named `tailwindcss` — the PACKAGE is `@tailwindcss/cli`, and
 * the `tailwindcss` package itself ships no `bin` in v4, so the name resolves
 * unambiguously.
 */
export function compileEntryCss({ entryCss, outFile }: CssOptions): void {
  if (!existsSync(entryCss)) {
    throw new Error(`compileEntryCss: entry stylesheet does not exist: ${entryCss}`);
  }
  if (!existsSync(dirname(outFile))) {
    throw new Error(`compileEntryCss: output directory does not exist: ${dirname(outFile)}`);
  }

  execFileSync("pnpm", ["exec", "tailwindcss", "-i", entryCss, "-o", outFile], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    // 180s, not the 120s most call sites used: two of them
    // (pusher-alignment.layout, section-header-layout.layout) deliberately
    // allow 180s, and nothing measured justifies shortening them. Taking the
    // MAXIMUM across call sites means migration cannot regress any of them.
    timeout: 180_000,
  });
}

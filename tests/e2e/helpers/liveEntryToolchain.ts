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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPO_ROOT = process.cwd();

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
}: BundleOptions): void {
  if (!existsSync(entry)) {
    throw new Error(`bundleLiveEntry: entry does not exist: ${entry}`);
  }
  if (!existsSync(dirname(outFile))) {
    throw new Error(`bundleLiveEntry: output directory does not exist: ${dirname(outFile)}`);
  }

  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      entry,
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      ...["node:fs", ...externals].map((e) => `--external:${e}`),
      ...Object.entries(aliases).map(([specifier, target]) => `--alias:${specifier}=${target}`),
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${outFile}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );
}

export interface CssOptions {
  /** Absolute paths listed as `@source` entries. */
  sources: string[];
  /** Absolute path of the stylesheet to write. */
  outFile: string;
  /** Directory for the intermediate entry CSS. */
  workDir: string;
}

/**
 * Build harness CSS with the LOCAL Tailwind CLI.
 *
 * The helper reads `app/globals.css` itself: all 28 call sites did so
 * identically, so the path lives here once instead of 28 times.
 *
 * The binary is named `tailwindcss` — the PACKAGE is `@tailwindcss/cli`, and
 * the `tailwindcss` package itself ships no `bin` in v4, so the name resolves
 * unambiguously.
 */
export function buildEntryCss({ sources, outFile, workDir }: CssOptions): void {
  if (sources.length === 0) {
    // An empty source list yields a stylesheet with no utilities, which renders
    // an unstyled harness and fails downstream as a confusing layout error
    // rather than as the configuration mistake it is.
    throw new Error("buildEntryCss: needs at least one source");
  }
  if (!existsSync(workDir)) {
    throw new Error(`buildEntryCss: work directory does not exist: ${workDir}`);
  }

  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  const entryCss = join(workDir, "entry.css");
  writeFileSync(entryCss, [...sources.map((s) => `@source "${s}";`), globals].join("\n"));

  execFileSync("pnpm", ["exec", "tailwindcss", "-i", entryCss, "-o", outFile], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    timeout: 120_000,
  });
}

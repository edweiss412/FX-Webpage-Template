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
 * RESOLVER POLICY: the DIRECTIVE rule (PR-C; spec ci-dark-descoped-closeout §5.1
 * row 3). bundleLiveEntry routes through _bundleLiveEntryChild.mjs, which installs
 * the shared useServerDirectivePlugin: a module is stubbed iff its own directive
 * prologue cooks to `"use server"` — the authoritative Next signal, decided by a
 * real TypeScript parse, not a path heuristic or graph-derivation. The stub
 * THROWS on any call (contract-tested at the build boundary in
 * helpers/useServerDirectivePlugin.test.ts), so a consumed-but-uninvoked proxy
 * cannot silently alter behaviour — the unsoundness that descoped the earlier
 * rule-based attempt (BL-HARNESS-RESOLVER-POLICY, now graduated). Aliases stay
 * EXPLICIT and per-call-site (esbuild applies them BEFORE the plugin), so a
 * caller still says which non-directive specifiers it stubs and with what.
 *
 * `tests/e2e/_metaLiveEntryToolchain.test.ts` enforces that no other file
 * under `tests/e2e/**` names a toolchain binary.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { displayOf, familyOf, parseFontFaces, srcOf } from "../../helpers/fontCss";
import {
  HARNESS_FONT_FILENAME,
  PUBLIC_FONT_PATH,
  PUBLIC_FONT_URL,
} from "../../helpers/fontManifest";

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

  emitCommittedFace(outFile);
}

/**
 * Append the committed `@font-face` to the compiled output and copy the binary
 * beside it.
 *
 * WHY THIS IS A POST-STEP ON THE OUTPUT, not something callers opt into. The 32
 * callers build their entry CSS in materially different ways -- inline template
 * literals, `sources.map`, arrays of pre-formatted `@source` directives -- and a
 * previous attempt to consolidate that produced 54 TypeScript errors across 12
 * files. None of that diversity matters here: the face is appended AFTER the CLI
 * returns, so every caller gets it regardless of how it assembled its input, and
 * no caller's entry stylesheet is touched.
 *
 * WITHOUT THIS the harnesses have no face at all. They compile `app/globals.css`
 * with no Next runtime, so `--font-inter` is undefined and `--font-sans` falls
 * through to its inline literal -- which named a host-INSTALLED Inter if one
 * existed, and the ambient system font otherwise (SF Pro locally, DejaVu Sans on
 * the CI runner). That is BL-HARNESS-FONT-FIDELITY: 28 harnesses measuring
 * geometry a font determines, against a font the product never renders.
 *
 * TWO DESCRIPTORS DIVERGE FROM THE APP, both deliberately:
 *   - `font-display: block`, not `swap`. A reader must never stare at invisible
 *     text; a measurement harness must never measure the WRONG face. The files
 *     are served from the same directory as the page, so the block period is a
 *     local read.
 *   - `src` is a BARE sibling filename. The app requests `/fonts/...` from a
 *     server root; a harness serves one flat directory, and all 32 callers write
 *     `outFile` into the directory they serve.
 *
 * The block is DERIVED from `app/fonts.css` rather than hand-duplicated, so the
 * two cannot drift the first time one is edited.
 */
function emitCommittedFace(outFile: string): void {
  const fontsCss = readFileSync(join(REPO_ROOT, "app", "fonts.css"), "utf8");
  const outDir = dirname(outFile);

  // Rewrite the served URL to a bare sibling, and swap the display value.
  // Anchored to the exact declarations rather than a loose pattern: a silent
  // no-op here would ship the app's `/fonts/` URL into every harness, where it
  // 404s and renders identically to a missing face.
  const faceBlock = fontsCss
    .replace(`url("${PUBLIC_FONT_URL}")`, () => `url("${HARNESS_FONT_FILENAME}")`)
    .replace("font-display: swap;", "font-display: block;");

  // Verify the rewrite through the PARSER, not a substring search. The
  // stylesheet's own comment names `public/fonts/InterVariable-latin.woff2`,
  // which contains the served URL as a substring -- so a text check reports the
  // URL surviving when only the prose mentions it. Ask what the src actually
  // says instead.
  const rewritten = parseFontFaces(faceBlock);
  const interFace = rewritten.find((face) => familyOf(face) === "Inter");
  const emittedUrl = interFace ? srcOf(interFace)[0]?.url : undefined;
  if (emittedUrl !== HARNESS_FONT_FILENAME) {
    throw new Error(
      `compileEntryCss: the harness face src is "${emittedUrl ?? "absent"}", expected the bare ` +
        `sibling "${HARNESS_FONT_FILENAME}". app/fonts.css must spell its src as ` +
        `url("${PUBLIC_FONT_URL}") for the rewrite to find it; otherwise the harness requests a ` +
        `path that does not exist beside its stylesheet, which 404s and renders identically to ` +
        `a missing face.`,
    );
  }
  if (interFace && displayOf(interFace) !== "block") {
    throw new Error(
      "compileEntryCss: font-display was not rewritten to `block`. A harness that swaps can " +
        "measure the fallback frame, which is the failure the wait invariant also guards.",
    );
  }

  appendFileSync(
    outFile,
    `
/* harness face (BL-HARNESS-FONT-FIDELITY) */
${faceBlock}`,
  );
  copyFileSync(join(REPO_ROOT, PUBLIC_FONT_PATH), join(outDir, HARNESS_FONT_FILENAME));
}

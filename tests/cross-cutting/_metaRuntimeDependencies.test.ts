// tests/cross-cutting/_metaRuntimeDependencies.test.ts
//
// Every third-party package imported by PRODUCTION SERVER code must live in
// package.json `dependencies`, not `devDependencies`.
//
// Why this guard exists: the private-image-pipeline arc added `sharp` imports to
// lib/sync (the ingest variant stage) while `sharp` sat in devDependencies. A
// pruned production install — the shape any `--prod` install or a runtime that
// drops dev deps produces — then has no sharp at all, and the sync path throws
// MODULE_NOT_FOUND on the first diagram-bearing show. Probed before the fix:
//
//     $ pnpm install --prod && node -e "require('sharp')"
//     Error: Cannot find module 'sharp'
//
// The failure is invisible to every other gate: typecheck resolves against the
// dev install, the unit suites run against the dev install, and a build machine
// that installs dev dependencies builds fine. Only a production-shaped install
// reproduces it, which is exactly the thing no local gate does by default.
//
// The check is DERIVED, not a list: it walks the production server trees from
// disk and resolves the bare specifiers it finds, so a new import of a new
// dev-only package fails by default rather than being silently exempt.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { premise } from "@/tests/_shared/premise";

const REPO_ROOT = resolve(__dirname, "..", "..");

/**
 * Trees whose modules run on the server in production. `tests/` and `scripts/`
 * are deliberately absent: a dev-only dependency is correct there.
 */
const PRODUCTION_TREES = ["lib", "app", "components"] as const;

/**
 * A module under those trees that is NOT reached by a request — a static-analysis
 * helper the audit scripts and tests drive — declares itself in its OWN header.
 * The exemption lives with the file rather than in a list here, so a new one has
 * to be written by the person adding it, and a production module cannot be
 * exempted by editing this test.
 */
const BUILD_TIME_ONLY_MARKER = /(?:^|\n)\s*\/\/\s*build-time-only:\s+\S/;

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Specifiers that are never package dependencies: node builtins, the repo's own
 * path alias, and relative paths.
 */
function isThirdPartySpecifier(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return false;
  if (specifier.startsWith("@/")) return false;
  if (specifier.startsWith("node:")) return false;
  return true;
}

/** `@scope/name/sub/path` → `@scope/name`; `name/sub` → `name`. */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__generated__" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * VALUE imports only. A `import type { X } from "pkg"` is erased at compile time
 * and genuinely needs no runtime dependency, so counting it would produce false
 * failures that teach people to add exemptions.
 */
const VALUE_IMPORT_RE = /^\s*import\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/gm;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

function importedPackages(file: string): string[] {
  const text = readFileSync(file, "utf8");
  if (BUILD_TIME_ONLY_MARKER.test(text)) return [];
  const found = new Set<string>();
  for (const re of [VALUE_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const specifier = match[1]!;
      if (isThirdPartySpecifier(specifier)) found.add(packageNameOf(specifier));
    }
  }
  return [...found];
}

describe("production server code imports only runtime dependencies", () => {
  test("every package imported from lib/ app/ components/ is in `dependencies`", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const runtime = new Set(Object.keys(manifest.dependencies ?? {}));
    const devOnly = new Set(Object.keys(manifest.devDependencies ?? {}));

    const files = PRODUCTION_TREES.flatMap((tree) => walk(join(REPO_ROOT, tree)));
    premise("the walk found production source files to scan", files.length, 0);

    const violations: string[] = [];
    let checked = 0;
    for (const file of files) {
      for (const pkg of importedPackages(file)) {
        // Only packages the manifest actually declares are in scope. A bare
        // specifier resolved by tsconfig paths or by a transitive install is not
        // this guard's business, and guessing would produce noise.
        if (!runtime.has(pkg) && !devOnly.has(pkg)) continue;
        checked += 1;
        if (devOnly.has(pkg) && !runtime.has(pkg)) {
          violations.push(
            `${file.slice(REPO_ROOT.length + 1)} imports "${pkg}", which is a devDependency — ` +
              `a production-only install would not have it`,
          );
        }
      }
    }

    // Without declared imports to classify, "no violations" proves nothing.
    premise("the scan classified at least one declared package", checked, 0);
    expect(violations).toEqual([]);
  });

  test("sharp specifically — the import that motivated this guard", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Named explicitly as well as covered by the walk: the walk states the rule,
    // this row states the instance that shipped broken, so a future edit that
    // narrows the walk cannot quietly take sharp with it.
    const importsSharp = importedPackages(join(REPO_ROOT, "lib", "sync", "diagramVariants.ts"));
    expect(importsSharp).toContain("sharp");
    expect(Object.keys(manifest.dependencies ?? {})).toContain("sharp");
    expect(Object.keys(manifest.devDependencies ?? {})).not.toContain("sharp");
  });
});

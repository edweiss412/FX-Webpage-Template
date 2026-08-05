// The SOURCE-CSS walk, extracted so it can be pointed somewhere other than the
// repo root.
//
// WHY IT MOVED (BL-FONT-STYLESHEET-GRAPH-FIDELITY, Codex R2 LOW). The plan asks
// for an EXECUTABLE proof that this walk misses both reconstructed escape
// fixtures. While the function was a private local in `fontLoading.test.ts`,
// bound to `opts.repoRoot` and the real `app/components/lib` roots, that proof could
// not be written — the fixture tests could only inspect fixture TEXT and assert
// what the walk "would" do. Parameterising the roots makes the claim runnable
// against the fixtures themselves.
//
// Behaviour is unchanged for the real call: same roots, same specifier set, same
// `node_modules`/dotfile skip.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

interface Stylesheet {
  /** Repo-relative for authored files, package-relative for node_modules. */
  readonly label: string;
  readonly text: string;
}

export type { Stylesheet };

export function resolveSpecifier(
  specifier: string,
  importer: string,
  repoRoot: string,
): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(importer), specifier);
  // A root-relative `@import "/x.css"` is served from `public/`, which is the
  // one place in this repo where a URL path and a file path differ.
  if (specifier.startsWith("/")) {
    const fromPublic = resolve(repoRoot, "public", specifier.slice(1));
    if (existsSync(fromPublic)) return fromPublic;
    return null;
  }
  if (specifier.startsWith("@/")) return resolve(repoRoot, specifier.slice(2));
  for (const candidate of [specifier, `${specifier}/index.css`, `${specifier}.css`]) {
    const guess = resolve(repoRoot, "node_modules", candidate);
    if (existsSync(guess) && statSync(guess).isFile()) return guess;
  }
  return null;
}

export function discoverShippedStylesheets(opts: {
  repoRoot: string;
  /** Directories walked for import specifiers. Dependencies are NEVER roots —
   *  in the real tree that is `node_modules`, in a fixture it is `vendor/`. */
  roots: readonly string[];
  /** Files seeded into the walk regardless of imports (the app's own entries). */
  seeds?: readonly string[];
}): Stylesheet[] {
  const found = new Map<string, Stylesheet>();

  const read = (absolute: string, label: string): void => {
    if (found.has(absolute)) return;
    let text: string;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      return;
    }
    found.set(absolute, { label, text });

    // Every legal spelling of the at-rule. `@import url( "x.css" )` with
    // whitespace inside the parens is valid CSS and slipped past a pattern that
    // required the quote immediately after `url(`.
    const IMPORTS = [
      /@import\s+url\(\s*["']([^"']+)["']\s*\)/g, // url( "x.css" )
      /@import\s+["']([^"']+)["']/g, //             "x.css"
      /@import\s+url\(\s*([^"')]+?)\s*\)/g, //      url(x.css), unquoted
    ];
    for (const pattern of IMPORTS) {
      for (const match of text.matchAll(pattern)) {
        const next = resolveSpecifier(match[1]!.trim(), absolute, opts.repoRoot);
        if (next) read(next, relative(opts.repoRoot, next));
      }
    }
  };

  const walk = (dir: string, visit: (file: string) => void): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full, visit);
      else visit(full);
    }
  };

  // Every spelling that pulls a stylesheet into the bundle. Static `import`,
  // `require`, and dynamic `import()` are three syntaxes for one act, and a
  // guard that recognises only the first is a guard against one syntax.
  const SPECIFIERS = [
    /\bimport\s+["']([^"']+\.css)["']/g, //                        side-effect
    /\bimport\s[^;\n]*?\bfrom\s*["']([^"']+\.css)["']/g, //       CSS Modules binding
    /\brequire\s*\(\s*["']([^"']+\.css)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+\.css)["']\s*\)/g,
  ];

  for (const seed of opts.seeds ?? []) {
    const abs = resolve(opts.repoRoot, seed);
    if (existsSync(abs)) read(abs, seed);
  }

  for (const root of opts.roots) {
    const dir = resolve(opts.repoRoot, root);
    if (!existsSync(dir)) continue;
    walk(dir, (file) => {
      // A stylesheet ships because something IMPORTS it, never because of where
      // it sits. Next requires CSS to be imported; seeding every `app/**.css`
      // by placement failed a tree carrying an unreferenced file that reaches
      // no browser -- a false positive, and those are not the safe direction.
      // Import scanning below finds the real graph, including new files.
      if (file.endsWith(".css")) return;
      if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(file)) return;
      const source = readFileSync(file, "utf8");
      for (const pattern of SPECIFIERS) {
        for (const match of source.matchAll(pattern)) {
          const target = resolveSpecifier(match[1]!, file, opts.repoRoot);
          if (target) read(target, relative(opts.repoRoot, target));
        }
      }
    });
  }

  return [...found.values()];
}

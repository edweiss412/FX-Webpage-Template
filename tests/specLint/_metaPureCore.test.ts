import { describe, expect, it } from "vitest";
import ts from "typescript";

import { readFileSync, readdirSync } from "node:fs";
import { stripCommentsSafely } from "../_shared/stripComments";
import { join } from "node:path";

// Structural purity pin (spec §7): nothing under lib/specLint/ may import node:fs,
// node:child_process, or node:process — in ANY form. The single pattern covers bare
// imports, `from` clauses, require(), dynamic import(), template-literal specifiers,
// and subpaths (node:fs/promises), because every form contains the quoted-or-backticked
// specifier. Template: tests/observe/_metaReadOnlyQueryCore.test.ts (fails-by-default
// on new files via recursive walk).
const CORE_DIR = join(process.cwd(), "lib/specLint");
const FORBIDDEN = /["'`]node:(fs|child_process|process)(\/[A-Za-z/]+)?["'`]/;

/**
 * Every module specifier, in each form a specifier can take: a `from` clause
 * (import OR export, value OR `import type`), a bare side-effect import,
 * `require()`, and dynamic `import()`. One alternation rather than four scans,
 * matching the shape of `FORBIDDEN` above.
 *
 * DOCUMENTED LIMIT, probed -- and the probe was not exhaustive the first time,
 * which is worth recording beside the limit itself. The scan catches the `from`
 * clause, a bare side-effect import, `require()`, dynamic `import()`,
 * `export ... from`, `export * from`, `import type`, multi-line `from`,
 * `import x = require()`, a template-literal specifier, a newline inside
 * `import(...)`, an indented bare import, a package subpath, and an
 * import-attributes call `import("pkg", { with: ... })`. That last one ESCAPED
 * until whole-diff review round 3: the pattern demanded `)` immediately after
 * the specifier, so a standards-valid two-argument dynamic import with a STATIC
 * literal specifier passed the guard. It now accepts `,` or `)` there. A list of
 * forms is evidence about the forms someone thought to try, never a proof of
 * closure. It has two false positives: `from "pkg"` sitting
 * inside a STRING or TEMPLATE literal is flagged, because comments are stripped
 * here and strings are not.
 *
 * That class is currently UNREACHABLE, which is why it is recorded rather than
 * repaired: `lib/specLint/**` contains zero `from "` inside a string literal --
 * every occurrence is ``from `x` `` in JSDoc, which `stripCommentsSafely` removes.
 * Moving this scan onto the TypeScript AST would remove the class, and is
 * deliberately NOT taken: a recognizer upgrade for an input that cannot occur is
 * the ratchet this arc's convergence criterion exists to refuse.
 *
 * RE-FILE TRIGGER: the first core file that needs `from "..."` inside a string
 * literal. A dynamic `import(variable)` is likewise unmatched and unmatchable
 * statically.
 */
const SPECIFIER =
  /(?:from\s*["'`]([^"'`]+)["'`])|(?:^\s*import\s+["'`]([^"'`]+)["'`])|(?:require\(\s*["'`]([^"'`]+)["'`]\s*[,)])|(?:import\(\s*["'`]([^"'`]+)["'`]\s*[,)])/gm;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("spec-lint pure core (structural)", () => {
  const files = walk(CORE_DIR);

  it("has files (walker sanity floor)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files)("%s imports no node:fs / node:child_process / node:process", (file) => {
    const src = readFileSync(file, "utf8");
    const m = FORBIDDEN.exec(src);
    expect(m, m ? `forbidden import ${m[0]} in ${file}` : undefined).toBeNull();
  });

  // Every module specifier under lib/specLint/ is RELATIVE — no third-party
  // package, type-only or otherwise.
  //
  // The assertion above cannot carry this: it forbids exactly three `node:`
  // modules, so `import { remark } from "remark"` passes it, and the AC coverage
  // arm's design puts the markdown parser in the ADAPTER precisely so the core
  // stays free of one. That boundary had no guard until this test
  // (`docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`
  // §8.3, round-1 plan finding 3). A `import type` counts: it is erased at
  // compile time but it still names a package, and exempting it is how the
  // exemption starts.
  it.each(files)("%s imports nothing but relative paths", (file) => {
    const src = readFileSync(file, "utf8");
    // Comments are stripped first, through the repo's single source for it: the
    // first draft matched `from "text"` inside PROSE and reported four files
    // that import nothing but relative paths. A guard whose false positives are
    // the normal case gets disabled, not fixed.
    const code = stripCommentsSafely(src, ts.ScriptKind.TS);
    const bad = [...code.matchAll(SPECIFIER)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
      .filter((s): s is string => s !== undefined)
      .filter((s) => !s.startsWith("./") && !s.startsWith("../"));
    expect(
      bad,
      bad.length > 0 ? `non-relative import(s) in ${file}: ${bad.join(", ")}` : undefined,
    ).toEqual([]);
  });
});

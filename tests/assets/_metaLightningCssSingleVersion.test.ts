// Structural guard — exactly ONE `lightningcss`, pinned exactly.
//
// WHY THIS EXISTS. The static font guard's claim to authority is that it parses
// with the SAME front end that compiles the file: `@tailwindcss/node` (4.2.4 in
// this tree) depends on `lightningcss` at an EXACT `1.32.0`, with no caret. A
// bare `pnpm add -D lightningcss` resolves 1.33.0 alongside it, and the guard
// would then parse with a build that compiles nothing in this repo. The
// argument would be gone and nothing would report it — so this file IS the
// argument's enforcement, not a nicety.
//
// This is the same discipline the repo already applies to byte-comparison
// gates, which pin their execution environment rather than trusting that a
// deterministic-looking script produces stable bytes. A parser is an execution
// environment for a grammar, and a guard that pins its expectations while
// floating its parser has pinned the wrong half.
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import pkg from "../../package.json";

/**
 * Collect every resolved `lightningcss` version from `pnpm ls --json`.
 *
 * pnpm emits nested OBJECTS keyed by package name — `{"lightningcss": {"version":
 * "1.32.0", …}}` — never a `"name@version"` string key, so a regex for
 * `"lightningcss@1.32.0"` matches nothing and the set comes back empty. A guard
 * that cannot go green is not a guard; walk the parsed payload instead. The walk
 * also has to descend through `"deduped": true` nodes, which truncate the
 * printed tree without removing the dependency.
 */
function resolvedVersions(): string[] {
  const out = execFileSync("pnpm", ["ls", "lightningcss", "--depth", "Infinity", "--json"], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  const versions = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "lightningcss" && value && typeof value === "object") {
        const version = (value as { version?: unknown }).version;
        if (typeof version === "string") versions.add(version);
      }
      visit(value);
    }
  };
  visit(JSON.parse(out));
  return [...versions].sort();
}

describe("lightningcss is a single, exactly-pinned instance", () => {
  test("package.json pins it with no range operator", () => {
    // Exact, not `^1.32.0`: a caret is what lets a second copy in.
    expect(pkg.devDependencies.lightningcss).toBe("1.32.0");
  });

  test("exactly one version resolves in the tree", () => {
    // NOTE: this passes even before the pin is added, because 1.32.0 is already
    // present transitively via @tailwindcss/node. That is correct and not a
    // weakness — its job is to fail the day a SECOND copy appears, which is
    // precisely what `pnpm add -D lightningcss` without `-E` would do.
    expect(resolvedVersions()).toEqual(["1.32.0"]);
  });
});

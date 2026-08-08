/**
 * tests/codexGuard/importSurface.test.ts — the dependency contract, executable.
 *
 * `scripts/codex-guard.mjs` must stay runnable as bare `node` from any checkout:
 * the AGENTS.md shim one-liner points a shell script straight at it, with no
 * install step and no bundler. That contract is invisible in the source, so a
 * new import would break it silently on someone else's machine.
 *
 * The list is EXACT rather than a no-node_modules check, because the ratified
 * decision was to vendor the block parse INLINE (spec §1.1 item 4). A second
 * relative sibling would satisfy "no dependencies" while violating exactly the
 * thing that was decided — so a new relative import fails here too. Growing this
 * list is a deliberate, reviewed edit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD_SRC = readFileSync(join(process.cwd(), "scripts/codex-guard.mjs"), "utf8");

const ALLOWED = [
  "node:child_process",
  "node:fs",
  "node:os",
  "node:path",
  "./reviewRoundEmit.mjs",
].sort();

describe("codex-guard import surface", () => {
  const specifiers = [...GUARD_SRC.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);

  it("finds imports at all (a scan of nothing proves nothing)", () => {
    expect(specifiers.length).toBeGreaterThanOrEqual(4);
  });

  it("imports EXACTLY the allowed specifiers and nothing else", () => {
    expect([...new Set(specifiers)].sort()).toEqual(ALLOWED);
  });

  it("uses no require() and no dynamic import()", () => {
    // Both would smuggle a dependency past the static list above.
    expect(GUARD_SRC).not.toMatch(/\brequire\s*\(/);
    expect(GUARD_SRC).not.toMatch(/\bimport\s*\(/);
  });

  it("names no node_modules specifier", () => {
    const bare = specifiers.filter((s) => !s.startsWith("node:") && !s.startsWith("."));
    expect(bare).toEqual([]);
  });
});

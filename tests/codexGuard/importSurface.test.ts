/**
 * tests/codexGuard/importSurface.test.ts — the dependency contract, executable.
 *
 * `scripts/codex-guard.mjs` must stay runnable as bare `node` from any checkout:
 * the AGENTS.md shim one-liner points a shell script straight at it, with no
 * install step and no bundler. That contract is invisible in the source, so a
 * new import would break it silently on someone else's machine.
 *
 * The list is EXACT rather than a no-node_modules check. A new relative sibling
 * fails here too, so growing this list is a deliberate, reviewed edit — which is
 * what `./specLintGate.mjs` is: `scripts/codex-guard.mjs` cannot import a `.ts`,
 * and the ratified remedy for that is a lib half plus a bare-node bridge plus a
 * parity suite (`docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md`
 * §1.1 item 8, the same ratification `./reviewRoundEmit.mjs` shipped under).
 *
 * The previous header cited "spec §1.1 item 4" for a vendor-the-parse-inline
 * decision. That citation did not resolve: item 4 of that section is "Filings are
 * immutable evidence", and the codex-guard spec has no §1.1 at all.
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
  "./specLintGate.mjs",
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

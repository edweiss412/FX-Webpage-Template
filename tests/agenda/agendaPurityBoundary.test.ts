/**
 * tests/agenda/agendaPurityBoundary.test.ts — spec §8 test-5 (round-3 plan finding).
 *
 * Static-source guard: the three modules that comprise the admin agenda render
 * path must NEVER import server-only primitives. They are bundled into a
 * `"use client"` card, so any server-only import would break the build.
 *
 * Prohibited imports:
 *   - `server-only`          — Next.js server-only marker
 *   - `next/headers`         — server-only Next.js headers API
 *   - `fs` (bare module)     — Node.js filesystem (not available in browser bundles)
 *   - `googleapis`           — Google API client (server/admin side only)
 *   - any `lib/drive/*`      — Drive helpers (require service-account credentials)
 *
 * Negative-regression protocol (must be verified manually before each commit):
 *   1. Add `import "server-only";` to lib/agenda/agendaAdminPreview.ts
 *   2. Run this test → it MUST fail on agendaAdminPreview.ts
 *   3. Revert the import
 *   4. Confirm `git diff` is clean before committing
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Files covered by this purity guard.
const GUARDED_FILES: Array<{ path: string; label: string }> = [
  {
    path: "lib/agenda/agendaAdminPreview.ts",
    label: "agendaAdminPreview (client-bundled builder)",
  },
  {
    path: "components/crew/AgendaScheduleBlock.tsx",
    label: "AgendaScheduleBlock (client-bundled presenter)",
  },
  {
    path: "lib/agenda/normalizeAgendaExtraction.ts",
    label: "normalizeAgendaExtraction (render-boundary validator)",
  },
];

/**
 * Patterns that identify a prohibited import in TypeScript/ESM source.
 * Each entry has a human-readable name for failure messages and a regex
 * that matches ES import statements or CommonJS require() calls.
 */
const PROHIBITED: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "server-only",
    pattern:
      /(?:import\s+["']server-only["']|from\s+["']server-only["']|require\s*\(\s*["']server-only["']\s*\))/,
  },
  {
    name: "next/headers",
    pattern: /(?:from\s+["']next\/headers["']|require\s*\(\s*["']next\/headers["']\s*\))/,
  },
  {
    name: "fs (bare Node.js module)",
    // Match `from "fs"` or `from 'fs'` but NOT `from "fs/promises"` — the
    // bare `fs` import is the dangerous one for browser bundles.
    pattern: /(?:from\s+["']fs["']|require\s*\(\s*["']fs["']\s*\))/,
  },
  {
    name: "googleapis",
    pattern: /(?:from\s+["']googleapis["']|require\s*\(\s*["']googleapis["']\s*\))/,
  },
  {
    name: "lib/drive/* (Drive helpers)",
    pattern: /(?:from\s+["'][^"']*lib\/drive\/|require\s*\(\s*["'][^"']*lib\/drive\/)/,
  },
];

function readSource(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

describe("client-bundle purity guard", () => {
  for (const { path, label } of GUARDED_FILES) {
    describe(label, () => {
      const src = readSource(path);

      for (const { name, pattern } of PROHIBITED) {
        test(`does NOT import "${name}"`, () => {
          expect(
            pattern.test(src),
            `${path} contains a prohibited import of "${name}" — this module must stay client-bundle safe`,
          ).toBe(false);
        });
      }
    });
  }
});

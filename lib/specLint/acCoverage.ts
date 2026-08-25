/**
 * The AC coverage arm (`docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`).
 *
 * A plan opts ONE table in with `<!-- ac-coverage: command-col=N -->`. In a
 * declared table the arm asserts, hard, that each data row's command cell carries
 * commands and that every one of them parses, and advises when a row cites an
 * executable pin under `tests/` the command cannot reach.
 *
 * It recognizes nothing in open English AND no markdown grammar: remark parses,
 * the adapter injects the view, and this module reads it (spec §8.3).
 *
 * Pure: no `node:` imports and no third-party imports
 * (pinned by tests/specLint/_metaPureCore.test.ts).
 */
import type { AcBlocks, Finding } from "./types";

/** Task 1 stub. Every assertion below fails on the arm's OUTPUT, never on module
 *  resolution, which is what makes the red valid by construction. */
export function checkAcCoverage(_blocks: AcBlocks, _kind: "spec" | "plan"): Finding[] {
  return [];
}

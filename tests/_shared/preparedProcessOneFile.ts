/**
 * The `ready`-kind `PreparedProcessOneFile` fixture every test that drives a manual-sync seam needs
 * since `prepared` became a REQUIRED sixth parameter (spec
 * docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md §3.1).
 *
 * ONE definition, imported — a per-file copy would drift from the production shape, which is the
 * failure this fixture exists to make impossible.
 */
import type { ParseResult } from "@/lib/parser/types";
import type { PreparedProcessOneFile } from "@/lib/sync/runScheduledCronSync";

export function readyPrepared(
  overrides: Partial<Extract<PreparedProcessOneFile, { kind: "ready" }>> = {},
): PreparedProcessOneFile {
  return {
    kind: "ready",
    resolvedMode: "manual",
    binding: { bindingToken: "head-1", modifiedTime: "2026-08-14T12:00:00.000Z" },
    parseResult: {
      show: { title: "Prepared Fixture" },
      warnings: [],
    } as unknown as ParseResult,
    ...overrides,
  };
}

import { describe, expect, it } from "vitest";

import {
  collectParseWarningCodeSites,
  type ParseWarningCodeScan,
} from "@/lib/messages/__internal__/parseWarningCodeSites";

/**
 * The scan builds a full TypeScript program (~19s: ~11.7s construction, ~2.8s
 * checker warm-up, ~4.5s walk, over 2882 files). Compute it ONCE for the whole
 * file — six assertions each paying that cost would be minutes, and vitest's
 * default 30s timeout does not cover even one.
 */
let cached: ParseWarningCodeScan | undefined;
function scan(): ParseWarningCodeScan {
  cached ??= collectParseWarningCodeSites();
  return cached;
}

const SCAN_TIMEOUT_MS = 180_000;

/**
 * Structural guard over the parse-warning emit surface.
 *
 * Discovery is program-walked (the TypeScript program, not a file list), so an
 * emitter landing in a directory nobody anticipated is covered by construction
 * rather than by remembering to extend a root list. Spec:
 * docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md
 */
describe("parse-warning code sites", () => {
  it(
    "finds a plain object-literal emit",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "SECTION_HEADER_NO_FIELDS");
    // emitEmptySection pushes the literal into agg.warnings (lib/parser/warnings.ts:44-51).
    // Asserting file AND via, not merely presence, so a later rule cannot satisfy
    // this through the wrong path.
      expect(hit?.file).toBe("lib/parser/warnings.ts");
      expect(hit?.via).toBe("literal");
    },
    SCAN_TIMEOUT_MS,
  );
});

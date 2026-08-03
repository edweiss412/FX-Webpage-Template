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

  it(
    "resolves a code referenced through an imported const",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "BLOCK_DISAPPEARED");
      // lib/sync/blockDisappearance.ts:79 reads `code: BLOCK_DISAPPEARED`, where
      // the identifier is IMPORTED from lib/parser/warnings.ts:67. An
      // implementation that reads the local symbol without following the import
      // alias resolves nothing here.
      expect(hit?.file).toBe("lib/sync/blockDisappearance.ts");
      expect(hit?.via).toBe("const");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "resolves a code passed as a factory argument",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "AGENDA_SCHEDULE_TIME_ADJUSTED");
      // `warn(code, message): ParseWarning` (lib/sync/enrichAgenda.ts:45-47) takes
      // the code as an ARGUMENT, so no `code:` regex reaches it from any root.
      // This is one of the four codes the hand-maintained residue existed to supply.
      expect(hit?.file).toBe("lib/sync/enrichAgenda.ts");
      expect(hit?.via).toBe("factory");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "records no site from an excluded file",
    () => {
      const { sites } = scan();
      // M6. findReferencesAsNodes() searches the WHOLE program, so the
      // scanned-file predicate has to govern recorded call sites and not merely
      // the file walk. Probed against the unpatched recognizer: exporting the
      // factory at lib/sync/enrichAgenda.ts:45 and calling it from a test with a
      // literal minted that code into the production manifest (58 codes, one site
      // attributed to tests/). Nothing may be attributed to an excluded tree.
      const leaked = sites.filter(
        (s) => s.file.startsWith("tests/") || s.file.startsWith("lib/dev/attentionScenarios/"),
      );
      expect(leaked).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});

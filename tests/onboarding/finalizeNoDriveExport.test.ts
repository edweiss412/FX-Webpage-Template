import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Structural guard: the Step-3 finalize route must perform NO Drive XLSX export — it reads
// pending_syncs.source_anchors instead. This is the fast complement to the behavioral DB test
// (finalizeReadsSourceAnchors.db.test.ts), which publishes with the Drive-export functions mocked
// to throw. Comments are stripped so a stray explanatory comment can't cause a false failure.
const routeSrcRaw = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/api/admin/onboarding/finalize/route.ts",
  ),
  "utf8",
);
const routeSrc = routeSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("finalize route performs no Drive XLSX export", () => {
  it("does not reference the Drive export / anchor-compute functions in code", () => {
    expect(routeSrc).not.toMatch(/fetchSheetMarkdownWithBinding/);
    expect(routeSrc).not.toMatch(/fetchSheetTitleToGid/);
    expect(routeSrc).not.toMatch(/\bextractSourceAnchors\b/);
  });

  it("no longer exposes a fetchOnboardingSourceAnchors dependency", () => {
    expect(routeSrc).not.toMatch(/fetchOnboardingSourceAnchors/);
  });

  it("imports nothing export-capable from @/lib/drive/fetch (catches a renamed/aliased export import)", () => {
    // [^}]* spans newlines already, so no dotAll flag is needed (avoids the es2018 target requirement).
    const m = routeSrc.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/drive\/fetch["']/);
    if (m) {
      // Only the metadata get is allowed; no XLSX-export function may be imported under any alias.
      expect(m[1]).not.toMatch(
        /fetchSheetMarkdownWithBinding|fetchSheetAsMarkdown|fetchSheetMarkdownAndBytes/,
      );
    }
  });
});

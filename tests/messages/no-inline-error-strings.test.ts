/**
 * tests/messages/no-inline-error-strings.test.ts (M9 C7 / M5-D8)
 *
 * Static-grep contract: no inline literal-string `setError("...")` /
 * setUi({kind:"error", message: "..."}) calls should appear in
 * `app/` or `components/` source unless the call site carries a
 * `// not-subject:M5-D8` annotation (with optional rationale).
 *
 * Why: the §12.4 message catalog is the single source of truth for
 * user-visible error copy (AGENTS.md invariant 5). Inline literal
 * strings drift over time and cannot be reused across surfaces;
 * routing every error through `messageFor(code).crewFacing` keeps
 * the catalog and the rendered DOM in lockstep.
 *
 * What this test catches:
 *   - "I added a new error path with setError('Something failed')
 *     instead of a catalog code." — fails CI before adversarial
 *     review can find it.
 *   - "I refactored an existing error path and accidentally inlined
 *     the string." — the annotation is missing → fails.
 *
 * Documented exemptions (must carry an inline `// not-subject:M5-D8`
 * comment in the source file):
 *   - app/show/[slug]/p/Bootstrap.tsx: GENERIC_ERROR_COPY +
 *     NO_FRAGMENT_COPY are catch-all bootstrap-layer strings; adding
 *     a dedicated BOOTSTRAP_GENERIC catalog code requires a spec
 *     amendment per AGENTS.md §1.7 — deferred.
 *
 * The grep is structural, not behavioral; the per-surface unit tests
 * that exercise the actual error rendering remain the primary safety
 * net. This meta-test is the no-regression backstop.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return walkFiles(path);
    }
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

// Match `setError("literal")` or `setError('literal')` — single-line.
// The double-escaped form rules out `setError(null)`, `setError(err)`,
// `setError({ kind: "..." })` style which all use catalog codes
// via the `kind` discriminator.
const INLINE_SETERROR_RE = /setError\((["'])[^"']+["']\)/g;
// `not-subject:M5-D8` annotation token — file-scoped exemption.
const EXEMPT_RE = /not-subject:M5-D8/;

describe("META no inline literal error strings (M5-D8)", () => {
  const files = [...walkFiles("app"), ...walkFiles("components")];

  test("no `setError(\"literal\")` callsites outside exempt files", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (EXEMPT_RE.test(source)) continue;
      const matches = source.match(INLINE_SETERROR_RE);
      if (matches) {
        violations.push(`${file}: ${matches.join(", ")}`);
      }
    }
    expect(
      violations,
      `Route error UI through messageFor(code) instead of inline literal strings. To exempt a file, add a "// not-subject:M5-D8" comment with rationale (see app/show/[slug]/p/Bootstrap.tsx for the canonical example).`,
    ).toEqual([]);
  });
});

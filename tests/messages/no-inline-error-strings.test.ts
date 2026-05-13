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

// Patterns that signal "inline literal error copy" — broader than the
// initial R1 setError-only sweep:
//   (1) setError("literal") / setError('literal')
//   (2) const FOO_COPY = "..."  (constants likely rendered as error UI)
//   (3) const FOO_MESSAGE = "..."
//   (4) message: "literal"  (object-shape error/alert payload)
// Each pattern is checked per-line; an inline `// not-subject:M5-D8`
// comment within ±3 lines of the match exempts that callsite.
const PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "setError literal", re: /setError\((["'])[^"']+["']\)/ },
  { name: "ERROR/COPY/MESSAGE const literal", re: /const\s+[A-Z_]*(COPY|MESSAGE|ERROR)\s*=\s*["']/ },
  { name: "object error message literal", re: /\bmessage:\s*(["'])[^"']{8,}["']/ },
];

const EXEMPT_TOKEN = "not-subject:M5-D8";
const NEARBY_LINES = 3;

function isExempt(lines: string[], matchedIdx: number): boolean {
  const start = Math.max(0, matchedIdx - NEARBY_LINES);
  const end = Math.min(lines.length, matchedIdx + NEARBY_LINES + 1);
  for (let i = start; i < end; i++) {
    if (lines[i]?.includes(EXEMPT_TOKEN)) return true;
  }
  return false;
}

describe("META no inline literal error strings (M5-D8)", () => {
  const files = [...walkFiles("app"), ...walkFiles("components")];

  test("no inline literal error-copy callsites outside callsite-scoped exemptions", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const { name, re } of PATTERNS) {
          if (re.test(line)) {
            if (isExempt(lines, i)) continue;
            violations.push(`${file}:${i + 1} [${name}]: ${line.trim()}`);
          }
        }
      }
    }
    expect(
      violations,
      `Route error UI through messageFor(code) instead of inline literal strings. To exempt a single callsite, add a "// not-subject:M5-D8" comment within ±${NEARBY_LINES} lines of the match (see app/show/[slug]/p/Bootstrap.tsx and components/shared/ReportModal.tsx for canonical examples).`,
    ).toEqual([]);
  });
});

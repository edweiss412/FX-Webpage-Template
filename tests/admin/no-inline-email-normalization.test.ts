/**
 * tests/admin/no-inline-email-normalization.test.ts (M3 adversarial Round 4
 * Finding 1 — optional belt-and-suspenders).
 *
 * Static-text guard against the subtler regression that the spy + capture-arg
 * tests in tests/admin/test-auth-gate.test.ts cannot catch directly:
 * a future refactor that ADDS an inline trim()/toLowerCase() chain ALONGSIDE
 * the canonicalize() call. The runtime tests would still observe canonicalize
 * being called and Supabase receiving the canonical form, but a parallel
 * inline-normalization branch would have crept in — drift bait.
 *
 * This test reads the route source as text and asserts no `.toLowerCase()`
 * or `.trim()` patterns appear outside of comments. AGENTS.md §1.3 forbids
 * inline email handling at the auth boundary; lib/email/canonicalize.ts is
 * the only allowed surface.
 *
 * Same guard applied to tests/e2e/helpers/signInAs.ts (Round 3 Finding 2
 * also fixed inline normalization there in deleteFixtureUserByEmail).
 *
 * Future paths can opt in via `// canonicalize-exempt: <reason>` line
 * suffix if a non-email use legitimately needs trim/lowercase. The audit
 * here intentionally has no exempt rules to avoid encouraging bypass —
 * if a real exemption is needed in M5+, add the parsing logic then.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

/**
 * Strip line and block comments from TypeScript source so the regex sweep
 * doesn't false-positive on doc-comments (which legitimately mention
 * `.trim()` or `.toLowerCase()` to explain why they're forbidden).
 *
 * Conservative — preserves string literals (so a string containing
 * "trim()" still appears in the output). The auth boundary doesn't have
 * any such strings today, but the test would tolerate them by checking
 * specific identifier-style usage rather than substring match.
 */
function stripComments(src: string): string {
  // Block comments first (greedy nested-block-safe via non-greedy match).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments: //  to end of line. NOTE: this is naive about //
  // appearing inside strings — but the route file has no such strings.
  out = out.replace(/\/\/[^\n]*/g, "");
  return out;
}

const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\.toLowerCase\s*\(/g, label: ".toLowerCase()" },
  { regex: /\.toLocaleLowerCase\s*\(/g, label: ".toLocaleLowerCase()" },
  { regex: /\.trim\s*\(/g, label: ".trim()" },
  { regex: /\.trimStart\s*\(/g, label: ".trimStart()" },
  { regex: /\.trimEnd\s*\(/g, label: ".trimEnd()" },
];

const AUDITED_PATHS = [
  "app/api/test-auth/set-session/route.ts",
  "tests/e2e/helpers/signInAs.ts",
];

describe("Round 4 Finding 1 — static-text guard against inline email normalization", () => {
  for (const rel of AUDITED_PATHS) {
    test(`${rel} contains NO inline trim/lowercase patterns (per AGENTS.md §1.3)`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const stripped = stripComments(src);
      for (const { regex, label } of FORBIDDEN_PATTERNS) {
        const matches = stripped.match(regex) ?? [];
        expect(
          matches.length,
          `${rel} contains ${matches.length} ${label} call(s) outside comments. ` +
            `AGENTS.md §1.3: lib/email/canonicalize.ts is the ONLY function allowed ` +
            `to touch raw emails at this boundary. Use canonicalize() instead.`,
        ).toBe(0);
      }
    });
  }

  // Negative control: prove the regex actually fires when it should.
  // If this test breaks, the regex is wrong (false-negative would let the
  // forbidden patterns through silently in the audited files).
  test("control: regex correctly detects .trim() and .toLowerCase() in a probe string", () => {
    const probe = `const x = raw.trim().toLowerCase();`;
    const stripped = stripComments(probe);
    expect(stripped.match(/\.toLowerCase\s*\(/g)?.length ?? 0).toBe(1);
    expect(stripped.match(/\.trim\s*\(/g)?.length ?? 0).toBe(1);
  });

  test("control: stripComments correctly removes line and block comments", () => {
    const probe = `
      // .toLowerCase() in a line comment should be ignored
      /* .trim() in a block comment should be ignored */
      const x = "real code with no patterns";
    `;
    const stripped = stripComments(probe);
    expect(stripped.match(/\.toLowerCase\s*\(/g)?.length ?? 0).toBe(0);
    expect(stripped.match(/\.trim\s*\(/g)?.length ?? 0).toBe(0);
  });
});

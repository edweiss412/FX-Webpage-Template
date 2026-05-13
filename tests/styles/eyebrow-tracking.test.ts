/**
 * tests/styles/eyebrow-tracking.test.ts (M9 C2 / M4-D5)
 *
 * Static-grep contract: no `tracking-` arbitrary-square-bracket
 * letter-spacing values (e.g., tracking-, then "[", then a numeric em
 * value, then "]") should appear on uppercase elements anywhere under
 * `components/` or `app/`. The eyebrow tracking values were consolidated
 * to two named tokens during M9 C2:
 *   - `tracking-eyebrow`         (0.12em — standard eyebrow)
 *   - `tracking-eyebrow-strong`  (0.18em — emphasis eyebrow)
 *
 * Future eyebrow callsites MUST use the named tokens. Adding a new
 * inline arbitrary tracking value to an uppercase element fails this
 * test; either add the value as a token in app/globals.css @theme +
 * document in DESIGN.md §2, or use the existing tokens.
 *
 * Class-sweep contract (per AGENTS.md): the test scans every file in
 * `components/` and `app/` rather than a hand-named list, so the
 * coverage stays in sync with the codebase as files are added/moved.
 *
 * Note: the regex literal below is the only `tracking-[...]` form this
 * file contains. Comments and test names DO NOT spell the arbitrary
 * class out verbatim because Tailwind v4 scans test files and would
 * emit those literals into the built CSS (M9 C2 R1 finding).
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
    // Scan every source extension Tailwind v4 can pick up classes from:
    // .ts/.tsx for JSX className strings, .js/.jsx for legacy, .css for
    // @apply / arbitrary-value usage in stylesheets (M9 C2 R1 L1 fix —
    // a future Tailwind-scanned .css file under app/ or components/
    // should not be able to slip an arbitrary tracking value past
    // this meta-test).
    return /\.(ts|tsx|js|jsx|css)$/.test(path) ? [path] : [];
  });
}

describe("META eyebrow tracking token contract (M4-D5)", () => {
  const ARBITRARY_TRACKING_RE = /tracking-\[[^\]]+\]/g;
  const files = [...walkFiles("components"), ...walkFiles("app")];

  test("no arbitrary square-bracket tracking values remain in components/ or app/", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const matches = source.match(ARBITRARY_TRACKING_RE);
      if (matches) {
        violations.push(`${file}: ${matches.join(", ")}`);
      }
    }
    expect(
      violations,
      `Use the consolidated eyebrow tracking tokens (tracking-eyebrow / tracking-eyebrow-strong) instead of arbitrary inline values. To add a new value, declare it in app/globals.css @theme and document in DESIGN.md §2.`,
    ).toEqual([]);
  });

  test("`tracking-eyebrow` and `tracking-eyebrow-strong` are actually used (sanity)", () => {
    let eyebrowCount = 0;
    let eyebrowStrongCount = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      eyebrowCount += (source.match(/tracking-eyebrow(?!-)/g) ?? []).length;
      eyebrowStrongCount += (source.match(/tracking-eyebrow-strong/g) ?? []).length;
    }
    // After the M4-D5 consolidation, expect at least 10 standard-tier
    // callsites (the 0.12em + 0.14em group) and at least 2 strong-tier
    // callsites (the 0.18em + 0.22em group).
    expect(eyebrowCount, "tracking-eyebrow usages").toBeGreaterThanOrEqual(10);
    expect(eyebrowStrongCount, "tracking-eyebrow-strong usages").toBeGreaterThanOrEqual(2);
  });
});

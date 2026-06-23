/**
 * tests/help/help-prose-layer.test.ts
 *
 * Fast structural guard for the /help prose typography layer (companion to the
 * real-browser tests/e2e/help-typography.spec.ts). jsdom/source-level only — it
 * pins the WIRING so a careless edit can't silently revert /help to unstyled
 * walls of text:
 *   1. globals.css defines a `.help-prose` ruleset (in @layer base) that restores
 *      heading scale, list markers, inline-link affordance, and a reading measure
 *      using project @theme tokens.
 *   2. app/help/layout.tsx wraps {children} in the `help-prose` class.
 *   3. app/help/errors/page.tsx no longer carries the inert `prose prose-neutral`
 *      / `max-w-none` classes (the @tailwindcss/typography plugin is NOT installed,
 *      so those classes did nothing — the page must inherit `.help-prose` instead).
 *
 * The behavioral proof (computed sizes/markers/measure in a real browser) lives
 * in the e2e spec; this guard catches the cheap structural regressions instantly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("/help prose typography layer — structural wiring", () => {
  it("globals.css defines a .help-prose layer with the key prose contracts", () => {
    const css = read("app/globals.css");

    expect(css, "globals.css must define a .help-prose ruleset").toMatch(/\.help-prose\b/);

    // Isolate the .help-prose region so the declaration checks below can't be
    // satisfied by unrelated rules elsewhere in the file.
    const start = css.indexOf(".help-prose");
    const region = css.slice(start);

    // Headings restored via the canonical size-scale tokens (DESIGN.md §2.2).
    expect(region, "h1 must use --text-2xl").toMatch(/h1\b[\s\S]*?var\(--text-2xl\)/);
    expect(region, "h2 must use --text-xl").toMatch(/h2\b[\s\S]*?var\(--text-xl\)/);
    // A reading measure (DESIGN.md §2.5: 65–75ch).
    expect(region, "must cap the reading measure").toMatch(/max-width:\s*\d+ch/);
    // List markers restored (preflight strips them).
    expect(region, "ul marker restored").toMatch(/list-style:\s*disc/);
    expect(region, "ol marker restored").toMatch(/list-style:\s*decimal/);
    // Inline prose links get an accent color + underline.
    expect(region, "links underlined").toMatch(/text-decoration:\s*underline/);
    expect(region, "links use the accent-on-bg token").toMatch(/var\(--color-accent-on-bg\)/);

    // Must live in @layer base so per-element Tailwind utilities (RefAnchor /
    // Step / Callout) still win over the prose defaults.
    expect(css, ".help-prose must be authored in @layer base").toMatch(
      /@layer\s+base\s*\{[\s\S]*\.help-prose/,
    );
  });

  it("layout.tsx wraps {children} in the help-prose class", () => {
    const layout = read("app/help/layout.tsx");
    expect(layout, "layout must reference the help-prose wrapper").toMatch(/help-prose/);
    // The wrapper must be an ANCESTOR of {children} — help-prose appears before
    // {children} in source order inside <main>.
    const proseIdx = layout.indexOf("help-prose");
    const childrenIdx = layout.indexOf("{children}");
    expect(proseIdx, "help-prose wrapper present").toBeGreaterThan(-1);
    expect(childrenIdx, "{children} rendered").toBeGreaterThan(-1);
    expect(proseIdx, "help-prose must wrap (precede) {children}").toBeLessThan(childrenIdx);
  });

  it("errors page drops the inert typography-plugin classes", () => {
    const errors = read("app/help/errors/page.tsx");
    expect(errors, "errors page must not keep inert `prose prose-neutral`").not.toMatch(
      /prose\s+prose-neutral/,
    );
    expect(errors, "errors page must not keep inert `max-w-none`").not.toMatch(/max-w-none/);
  });
});

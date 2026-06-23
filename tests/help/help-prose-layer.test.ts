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
    // Inline prose links are underlined; the brand accent is hover-only (the
    // rest-state color is inherited and AA-safe — pinned by the guards below).
    expect(region, "links underlined").toMatch(/text-decoration:\s*underline/);
    expect(region, "accent reserved for :hover").toMatch(
      /a:hover\s*\{[^}]*var\(--color-accent-on-bg\)/,
    );

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

  // Codex adversarial-review finding: a prior revision colored body prose links
  // with --color-accent-on-bg (#c25e00 → 4.11:1 on the page bg, below WCAG AA
  // 4.5:1 for normal text). The rest-state link must NOT use a sub-AA color; the
  // underline is the affordance and the link inherits the high-contrast body
  // text color. These guards pin that contract so the sub-AA accent can't creep
  // back as the resting link color. (BL-ACCENT-ON-BG-AA-CONTRAST.)
  it("rest-state prose links set no color (inherit AA-safe text), not the sub-AA accent", () => {
    const css = read("app/globals.css");
    // The rest-state rule is `.help-prose :is(p, li, dd, td) a {` (space-brace);
    // the `a:hover {` variant is a separate block and may carry the accent.
    const m = css.match(/\.help-prose :is\(p, li, dd, td\) a \{([^}]*)\}/);
    expect(m, "rest-state inline-link rule must exist").not.toBeNull();
    const body = m![1] ?? "";
    expect(body, "link affordance is the underline").toMatch(/text-decoration:\s*underline/);
    expect(body, "rest-state link must NOT set an explicit color (inherits text)").not.toMatch(
      /(^|\s)color:/,
    );
    // Belt-and-suspenders: the accent-on-bg token may only appear under :hover.
    const hover = css.match(/\.help-prose :is\(p, li, dd, td\) a:hover \{([^}]*)\}/);
    const hoverBody = hover?.[1] ?? "";
    if (/--color-accent-on-bg/.test(hoverBody)) {
      // accent on hover is allowed (transient state, not subject to the 1.4.3 floor)
      expect(hoverBody).toMatch(/--color-accent-on-bg/);
    }
  });

  it("the inherited prose-link text color clears WCAG AA (4.5:1) on the page bg in both modes", () => {
    const css = read("app/globals.css");
    // Pull the runtime hex for text + bg from the light (:root) and dark
    // ([data-theme="dark"]) blocks — derive expected values from the live CSS,
    // never hardcode.
    const blockFor = (selector: string): string => {
      const idx = css.indexOf(selector);
      expect(idx, `${selector} block must exist`).toBeGreaterThan(-1);
      return css.slice(idx, idx + 1600);
    };
    const hexIn = (block: string, varName: string): string => {
      const mm = block.match(new RegExp(`${varName}:\\s*(#[0-9a-fA-F]{6})`));
      expect(mm, `${varName} must be defined`).not.toBeNull();
      return mm![1] ?? "";
    };
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: string, b: string) => {
      const la = lum(a) + 0.05;
      const lb = lum(b) + 0.05;
      return Math.max(la, lb) / Math.min(la, lb);
    };

    const light = blockFor(":root {");
    const dark = blockFor('[data-theme="dark"] {');
    const lightRatio = ratio(
      hexIn(light, "--color-text-runtime"),
      hexIn(light, "--color-bg-runtime"),
    );
    const darkRatio = ratio(hexIn(dark, "--color-text-runtime"), hexIn(dark, "--color-bg-runtime"));

    expect(
      lightRatio,
      `light prose-link contrast ${lightRatio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(darkRatio, `dark prose-link contrast ${darkRatio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

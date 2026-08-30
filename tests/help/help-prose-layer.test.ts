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
    // A reading measure (DESIGN.md §2.5: 65–75ch). Retargeted with the cap move:
    // the literal now lives on the --help-measure declaration rather than on a
    // max-width, because the measure is applied to the children through a
    // registered length.
    //
    // EXACTLY 70ch, not `\d+ch`. The pattern this replaces accepted any integer,
    // so a one-line 70ch -> 69ch edit passed here, passed the typography spec
    // (which asserts only a 76ch ceiling), stayed inside the card suite's 28-75ch
    // band, and still distinguished the bleed — while shrinking every capped
    // desktop child from 704.4px to about 694.3px, which is precisely what AC-2
    // forbids. A guard that accepts a family of values cannot enforce a criterion
    // that names one, and AC-2's staged violation only ever removed the cap, so
    // it could not settle the wrong-value case.
    expect(region, "must cap the reading measure at exactly 70ch").toMatch(
      /--help-measure:\s*70ch\b/,
    );
    // List markers restored (preflight strips them).
    expect(region, "ul marker restored").toMatch(/list-style:\s*disc/);
    expect(region, "ol marker restored").toMatch(/list-style:\s*decimal/);
    // Inline prose links are underlined and inherit the AA-safe text color in
    // EVERY state — the sub-AA brand accent must not appear in the prose-link
    // rules at all (not at rest, not on :hover). Pinned by the guards below.
    expect(region, "links underlined").toMatch(/text-decoration:\s*underline/);
    expect(region, "prose links never use the sub-AA accent token").not.toMatch(
      /var\(--color-accent-on-bg\)/,
    );

    // Must live in @layer base so per-element Tailwind utilities (RefAnchor /
    // Step / Callout) still win over the prose defaults.
    expect(css, ".help-prose must be authored in @layer base").toMatch(
      /@layer\s+base\s*\{[\s\S]*\.help-prose/,
    );
  });

  it("a help-bleed child can escape the measure while its siblings keep it", () => {
    const css = read("app/globals.css");
    const start = css.indexOf(".help-prose");
    const region = css.slice(start);

    // The measure is carried by an @property-REGISTERED length, and the
    // registration is load-bearing rather than decorative: `ch` resolves against
    // the element's own font, so an unregistered custom property substitutes the
    // tokens "70ch" into each child and re-resolves them per font — which sends
    // every heading level wider than the column it sits in. Registering with
    // syntax "<length>" computes it once, in the wrapper's font context, and
    // inherits it as an absolute length.
    expect(css, "the measure must be an @property-registered <length>").toMatch(
      /@property\s+--help-measure\s*\{[\s\S]*?syntax:\s*"<length>"/,
    );
    expect(region, "the wrapper declares the measure").toMatch(/--help-measure:\s*\d+ch/);

    // Scoped to the CHILDREN, not the wrapper: a cap on the wrapper is one no
    // child can exceed, so no opt-out is expressible at all.
    expect(region, "children carry the measure").toMatch(
      /\.help-prose\s*>\s*\*\s*\{[\s\S]*?max-width:\s*var\(--help-measure\)/,
    );

    // The escape itself. Without this rule the bleed class is inert and every
    // grid stays inside the reading column.
    expect(region, "help-bleed lifts the measure").toMatch(
      /\.help-prose\s*>\s*\.help-bleed\s*\{[\s\S]*?max-width:\s*none/,
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

  // Codex adversarial-review findings (rounds 1+2): a prior revision colored
  // body prose links with --color-accent-on-bg (#c25e00 → 4.11:1 on the page bg,
  // ≈3.6–3.9:1 on the tinted Callout fills — below WCAG AA 4.5:1 for normal
  // text), first at rest (round 1) then on :hover (round 2). WCAG 1.4.3 is not
  // waived for hover text, so the prose-link rules must NOT set that color in
  // ANY state: the underline is the affordance and the link inherits the
  // high-contrast text color. These guards pin that contract.
  // (BL-ACCENT-ON-BG-AA-CONTRAST.)
  it("prose links set no explicit color in any state, and never the sub-AA accent", () => {
    const css = read("app/globals.css");
    const m = css.match(/\.help-prose :is\(p, li, dd, td\) a \{([^}]*)\}/);
    expect(m, "rest-state inline-link rule must exist").not.toBeNull();
    const body = m![1] ?? "";
    expect(body, "link affordance is the underline").toMatch(/text-decoration:\s*underline/);
    expect(body, "rest-state link must NOT set an explicit color (inherits text)").not.toMatch(
      /(^|\s)color:/,
    );
    // No :hover (or any) prose-link rule may apply the sub-AA accent token.
    expect(css, "prose links must not set the sub-AA accent on :hover").not.toMatch(
      /\.help-prose :is\(p, li, dd, td\) a:hover \{[^}]*--color-accent-on-bg/,
    );
  });

  it("the inherited prose-link color clears WCAG AA (4.5:1) on the page bg AND the Callout fills, both modes", () => {
    const css = read("app/globals.css");
    // Pull the runtime hex for text + bg from the light (:root) and dark
    // ([data-theme="dark"]) blocks — derive expected values from the live CSS,
    // never hardcode.
    // The WHOLE rule, found by matching its braces — not a fixed-size window.
    // This read `css.slice(idx, idx + 1600)`, and the `:root` block is 3145
    // characters long, so every token past the halfway mark was invisible to
    // it. Adding one ordinary token pushed `--color-info-bg-runtime` (offset
    // 2339) out of the window and the assertion failed with "must be defined"
    // — which reads as a MISSING TOKEN when the token is right there and the
    // parser simply stopped early. A bigger constant would only move the cliff
    // to the next token somebody adds; the block boundary is the real edge, so
    // the extractor uses it.
    const blockFor = (selector: string): string => {
      const idx = css.indexOf(selector);
      expect(idx, `${selector} block must exist`).toBeGreaterThan(-1);
      let depth = 0;
      for (let i = idx; i < css.length; i += 1) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") {
          depth -= 1;
          if (depth === 0) return css.slice(idx, i + 1);
        }
      }
      throw new Error(`${selector} block is unterminated in app/globals.css`);
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

    // Premise. Every assertion below is of the form "this token is present and
    // its value clears a ratio", so a block that got truncated would fail as
    // "token must be defined" and look like a missing token. Assert the
    // extractor reached the closing brace, so that confusion cannot recur.
    for (const [name, block] of [
      ["light :root", light],
      ['dark [data-theme="dark"]', dark],
    ] as const) {
      expect(block.endsWith("}"), `${name} block must end at its closing brace`).toBe(true);
      expect(
        block.length,
        `${name} block looks truncated at ${block.length} chars`,
      ).toBeGreaterThan(1600);
    }

    // Prose links set no color, so they inherit the surrounding context's text
    // color on that context's background. Pin every place a prose link renders:
    //  - body paragraph: --color-text on --color-bg
    //  - note/tip Callout + TipFromSheets aside: --color-text-strong on --color-info-bg
    //  - warning Callout: --color-warning-text on --color-warning-bg
    // (text/bg token pairs per app/help/_components/{Callout,TipFromSheets}.tsx.)
    const surfaces: Array<[string, string, string]> = [
      ["body", "--color-text-runtime", "--color-bg-runtime"],
      ["note/tip callout", "--color-text-strong-runtime", "--color-info-bg-runtime"],
      ["warning callout", "--color-warning-text-runtime", "--color-warning-bg-runtime"],
    ];
    for (const [mode, block] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      for (const [name, textVar, bgVar] of surfaces) {
        const r = ratio(hexIn(block, textVar), hexIn(block, bgVar));
        expect(
          r,
          `${mode} prose-link contrast on ${name}: ${r.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

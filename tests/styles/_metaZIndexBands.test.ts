/**
 * tests/styles/_metaZIndexBands.test.ts
 *
 * Semantic z-index band guard (BL-ADMIN-SEMANTIC-Z-INDEX-SCALE, M-wave 2 spec
 * §2.6). The overlay surfaces carried raw numerals in two idioms — Tailwind
 * `z-<n>` utilities and inline `zIndex:` numerics — and a numeral says nothing
 * about which surface must sit over which. The FIXED band set (one token per
 * live numeral, name substitution with zero stacking change):
 *
 *   --z-index-raised:         10  (z-raised)
 *   --z-index-dropdown:       20  (z-dropdown)
 *   --z-index-nav:            30  (z-nav)
 *   --z-index-banner:         40  (z-banner)
 *   --z-index-overlay:        50  (z-overlay)
 *   --z-index-dev-controls:   60  (z-dev-controls)
 *   --z-index-sticky-banner: 100  (z-sticky-banner)
 *
 * (Spec §2.6 spells the tokens `--z-*`; Tailwind v4's z-index theme namespace
 * is `--z-index-*` — verified against the shipped tailwindcss dist — so the
 * band names and values are the spec's, on the namespace the utility layer
 * actually reads.)
 *
 * The guard walks the census universe from disk in BOTH idioms via the AST
 * scanner (`_zIndexScan.ts`), so a NEW numeric site fails by default with the
 * site named; exemptions require a reason (`zIndexExemptions.ts`, expected
 * empty). Comment mentions (`z-100`, `z-0`, one `z-60` in prose) are outside
 * the recognition universe by construction — the scanner reads className
 * context and style objects, not raw text.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { scanZIndexSites, type ZSite } from "./_zIndexScan";
import { Z_INDEX_EXEMPTIONS } from "./zIndexExemptions";

const BAND_TOKENS: Record<string, number> = {
  "z-raised": 10,
  "z-dropdown": 20,
  "z-nav": 30,
  "z-banner": 40,
  "z-overlay": 50,
  "z-dev-controls": 60,
  "z-sticky-banner": 100,
};

function liveSites(): ZSite[] {
  const sites: ZSite[] = [];
  for (const file of walkSourceFiles(["app", "components"], { extensions: [".tsx"] })) {
    if (file.startsWith("app/api/")) continue;
    sites.push(...scanZIndexSites(readFileSync(file, "utf8"), file));
  }
  return sites;
}

const siteKey = (s: ZSite) => `${s.file} :: ${s.token}`;

describe("scanner premise (a guard that matched nothing would be vacuously green)", () => {
  it("flags a planted utility-idiom numeric", () => {
    const sites = scanZIndexSites(
      'export const P = () => <div className="absolute z-40" />;',
      "components/P.tsx",
    );
    expect(sites).toEqual([
      { file: "components/P.tsx", line: 1, token: "z-40", idiom: "utility" },
    ]);
  });

  it("flags a planted inline-style numeric (the PreviewBanner idiom)", () => {
    const sites = scanZIndexSites(
      'export const P = () => <div style={{ position: "sticky", top: 0, zIndex: 100 }} />;',
      "components/P.tsx",
    );
    expect(sites).toEqual([
      { file: "components/P.tsx", line: 1, token: "zIndex: 100", idiom: "inline-style" },
    ]);
  });

  it("flags a numeric fed through a module cn() const", () => {
    const source = [
      'const SKIN = cn("absolute inset-x-0 top-full z-50");',
      "export const P = () => <div className={SKIN} />;",
    ].join("\n");
    expect(scanZIndexSites(source, "components/P.tsx").map((s) => s.token)).toEqual(["z-50"]);
  });

  it("does NOT flag band tokens, comment mentions, or non-z numerics", () => {
    const source = [
      "// a comment saying z-40 is not a site",
      'export const P = () => <div className="z-overlay top-10" style={{ top: 40 }} />;',
    ].join("\n");
    expect(scanZIndexSites(source, "components/P.tsx")).toEqual([]);
  });
});

describe("semantic z-index bands (dual idiom, filesystem-walked)", () => {
  it("no raw numeric z-index remains on the swept surfaces in EITHER idiom", () => {
    const exempted = new Set(Z_INDEX_EXEMPTIONS.map((e) => `${e.file} :: ${e.token}`));
    const offenders = liveSites().filter((s) => !exempted.has(siteKey(s)));
    expect(
      offenders.map((s) => `${s.file}:${s.line} ${s.token} (${s.idiom})`),
      "Raw numeric z-index. Move the site to its band token (z-raised 10 · z-dropdown 20 · z-nav 30 · " +
        "z-banner 40 · z-overlay 50 · z-dev-controls 60 · z-sticky-banner 100) or add a reasoned " +
        "exemption row in tests/styles/zIndexExemptions.ts.",
    ).toEqual([]);
  });

  it("every exemption row is live and reasoned", () => {
    const live = new Set(liveSites().map(siteKey));
    for (const e of Z_INDEX_EXEMPTIONS) {
      expect(e.reason.trim().length, `${e.file} ${e.token} needs a reason`).toBeGreaterThan(10);
      expect(
        live.has(`${e.file} :: ${e.token}`),
        `Stale exemption: ${e.file} ${e.token} no longer matches a live site — remove the row.`,
      ).toBe(true);
    }
  });

  it("the band tokens exist in app/globals.css @theme with the fixed values", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const [name, value] of Object.entries(BAND_TOKENS)) {
      const token = `--z-index-${name.slice(2)}`;
      expect(
        new RegExp(`${token}:\\s*${value};`).test(css),
        `${token}: ${value}; missing from app/globals.css @theme`,
      ).toBe(true);
    }
  });
});

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
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { scanBandClassNames, scanZIndexSites, type ZSite } from "./_zIndexScan";
import { Z_INDEX_EXEMPTIONS } from "./zIndexExemptions";
import { premise } from "../_shared/premise";

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

/**
 * Exemption key. The LINE is part of it (whole-diff review r2 F2): keyed on
 * file + token alone, a single row exempted every identical site in that file —
 * two `z-40`s in one component, one reasoned row, both silent — and a row could
 * outlive the site it was written for by transferring to a later occurrence.
 */
const siteKey = (s: ZSite) => `${s.file}:${s.line} :: ${s.token}`;

describe("scanner premise (a guard that matched nothing would be vacuously green)", () => {
  it("flags a planted utility-idiom numeric", () => {
    const sites = scanZIndexSites(
      'export const P = () => <div className="absolute z-40" />;',
      "components/P.tsx",
    );
    expect(sites).toEqual([{ file: "components/P.tsx", line: 1, token: "z-40", idiom: "utility" }]);
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
    const exempted = new Set(Z_INDEX_EXEMPTIONS.map((e) => `${e.file}:${e.line} :: ${e.token}`));
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
        live.has(`${e.file}:${e.line} :: ${e.token}`),
        `Stale exemption: ${e.file}:${e.line} ${e.token} no longer matches a live site — remove the row.`,
      ).toBe(true);
    }
  });

  it("each band COMPILES to its pinned value through the real globals.css", () => {
    // Whole-diff review r2 F1 killed two string-presence versions of this check,
    // and the second death is the instructive one. Searching the `@theme` block's
    // TEXT cannot distinguish a live declaration from a commented-out one (the
    // comment still contains the string), from a duplicate whose second value
    // wins, or from a later `:root` override. Each leaves the predicate green
    // while the compiled value is wrong or absent.
    //
    // So the assertion compiles. Tailwind reads the SHIPPED app/globals.css with
    // a synthetic content file naming the seven band classes, and the emitted
    // rules are what gets asserted — presence AND resolved value. Nothing about
    // where the declaration sits in the file, or how many there are, can fool it.
    const dir = mkdtempSync(join(tmpdir(), "zbands-"));
    try {
      const content = join(dir, "probe.html");
      const out = join(dir, "out.css");
      writeFileSync(content, `<div class="${Object.keys(BAND_TOKENS).join(" ")}"></div>`, "utf8");
      execFileSync(
        "pnpm",
        ["exec", "tailwindcss", "-i", "app/globals.css", "-o", out, "--content", content],
        { cwd: process.cwd(), stdio: "pipe" },
      );
      const css = readFileSync(out, "utf8");

      const missing: string[] = [];
      const wrong: string[] = [];
      for (const [cls, value] of Object.entries(BAND_TOKENS)) {
        const rule = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(css);
        if (!rule) {
          missing.push(cls);
          continue;
        }
        const body = rule[1]!;
        const varName = `--z-index-${cls.slice(2)}`;
        // The rule may emit the literal or a var() reference; resolve either.
        let resolved = /z-index:\s*([0-9-]+)/.exec(body)?.[1];
        if (resolved === undefined && body.includes(varName)) {
          const decls = [...css.matchAll(new RegExp(`${varName}:\\s*([0-9-]+)`, "g"))];
          resolved = decls.length > 0 ? decls[decls.length - 1]![1] : undefined;
        }
        if (resolved === undefined) missing.push(`${cls} (no resolvable z-index)`);
        else if (Number(resolved) !== value)
          wrong.push(`${cls}: compiled ${resolved}, pinned ${value}`);
      }

      premise("the compile produced CSS at all", css.length, 500);
      expect(missing, "band classes that compile to no z-index rule").toEqual([]);
      expect(wrong, "band classes whose COMPILED value is not the pinned band level").toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("every band class used in the tree actually COMPILES to a z-index rule", () => {
    // The sharpest failure this guard can have, and r1 F2's other half: a
    // typo'd token (`z-overaly`) is not a raw numeral, so the census is silent,
    // and Tailwind emits nothing for it — the element simply loses its stacking
    // while every string-level check stays green. Only compiling can catch it.
    //
    // Deliberately driven from the classes the TREE uses rather than from
    // BAND_TOKENS: asserting the seven known-good names would prove Tailwind
    // works, which was never in doubt. What is in doubt is whether the names
    // the source actually writes are among them.
    const used = new Set<string>();
    for (const file of walkSourceFiles(["app", "components"], { extensions: [".tsx"] })) {
      for (const name of scanBandClassNames(readFileSync(file, "utf8"), file)) used.add(name);
    }
    premise("the tree uses band classes at all", used.size, 0);

    const unknown = [...used].filter((cls) => !(cls in BAND_TOKENS));
    expect(
      unknown,
      "band-shaped classes in the tree that name no declared band — a typo here emits NO z-index " +
        "at all, so nothing else in this file would notice",
    ).toEqual([]);
  });
});

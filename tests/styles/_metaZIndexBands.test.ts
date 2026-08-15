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

import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { scanBandClassTokens, scanZIndexSites, type ZSite } from "./_zIndexScan";
import { Z_INDEX_EXEMPTIONS } from "./zIndexExemptions";
import { premise } from "../_shared/premise";

/**
 * Hand-written CSS in `app/globals.css` that legitimately sets a z-index without
 * going through a band utility. Reasons required, and the guard fails CLOSED on
 * anything absent from here (r4 F1) — so this list is the ONLY way a
 * band-valued rule can pass without naming a band.
 */
const HANDWRITTEN_Z_RULES: readonly { readonly selector: string; readonly reason: string }[] = [];

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
  for (const file of walkSourceFiles(["app", "components"], { extensions: [".tsx", ".ts"] })) {
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

  /**
   * ONE mechanism, replacing three hand-written recognizers that review defeated
   * in three consecutive rounds — variant prefixes, arbitrary values, negatives,
   * the `!` modifier, named group variants, template chunks, `cn(cond && "…")`,
   * `.ts` class modules, wrapped inline numbers. Each repair widened a pattern
   * and the next round found the next idiom, which is the ratchet the
   * round-economy rule warns about: enumeration over an open class does not
   * terminate.
   *
   * So the recognizer is no longer hand-written. Tailwind's OWN extractor reads
   * the real content globs, and the compiled stylesheet is the subject. Whatever
   * reaches the DOM appears there — that is what a compiler is — and whatever
   * does not, does not matter. The criterion is closed and machine-checked:
   * every z-index the app can emit is one of the seven band values.
   *
   * DOCUMENTED LIMIT, unchanged and unchangeable by any recognizer: a class
   * assembled at RUNTIME from fragments is invisible to Tailwind's extractor
   * too, and therefore emits no rule at all — the utility simply does not exist,
   * which is a loud failure in the browser rather than a silent wrong stacking.
   */
  const compiled = (() => {
    let cache: { css: string } | null = null;
    return (): string => {
      if (cache !== null) return cache.css;
      const dir = mkdtempSync(join(tmpdir(), "zbands-app-"));
      try {
        const out = join(dir, "out.css");
        execFileSync(
          "pnpm",
          // No --content: `@import "tailwindcss"` auto-detects sources from the
          // CSS file's project, honouring the `@source not` exclusions in
          // globals.css. That detection IS the authority on what reaches the
          // DOM, and adding --content on top only obscures which set is being
          // measured.
          ["exec", "tailwindcss", "-i", "app/globals.css", "-o", out],
          { cwd: process.cwd(), stdio: "pipe" },
        );
        cache = { css: readFileSync(out, "utf8") };
        return cache.css;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
  })();

  /** Last declaration wins, exactly as the cascade resolves it (r3 F4). */
  function lastVarValue(css: string, varName: string): string | undefined {
    const all = [...css.matchAll(new RegExp(`${varName}:\\s*([^;}]+)`, "g"))];
    return all.length > 0 ? all[all.length - 1]![1]!.trim() : undefined;
  }

  /**
   * The utility class a compiled selector applies, variants and the `!`
   * modifier stripped: `.focus\:z-overlay:focus` -> `z-overlay`,
   * `.min-\[720px\]\:z-50` -> `z-50`. Returns null when the selector carries
   * no z- utility (a bare element or attribute rule).
   */
  function utilityOf(selector: string): string | null {
    // The class excludes `\\` deliberately: allowing it let the character class
    // eat the escaping backslash, so `\\:` never reached the escape branch and
    // `.min-\\[720px\\]\\:z-50` truncated to `min-[720px]` — no `z-`, no finding.
    for (const m of selector.matchAll(/\.((?:[^.\s,{>+~:\\]|\\.)+)/g)) {
      const cls = m[1]!.replace(/\\(.)/g, "$1");
      const idx = cls.lastIndexOf(":z-");
      const util = idx >= 0 ? cls.slice(idx + 1) : cls.startsWith("z-") ? cls : null;
      if (util !== null) return util.replace(/!$/, "");
    }
    return null;
  }

  it("every z-index the app compiles to is a BAND, by name and by value", () => {
    // Parsed with postcss, not a regex. The regex version missed every variant
    // that nests its rule inside an at-rule — `min-[720px]:z-50`,
    // `group-hover/occ:z-50`, `[&_svg]:z-50` all survived mutation because the
    // flat pattern captured the @media prelude as the "selector" and found no
    // class in it. A CSS parser knows what a rule's parent is; a regex is
    // guessing, and this is the third time in this arc that guessing lost.
    const css = compiled();
    premise("the app compiled to real CSS", css.length, 5000);

    const BAND_VALUES = new Set(Object.values(BAND_TOKENS));
    const offenders: string[] = [];
    const root = postcss.parse(css);
    root.walkDecls("z-index", (decl) => {
      // Climb to the nearest ancestor RULE. Tailwind v4 emits variants with
      // nested syntax — `.min-\[720px\]\:z-50 { @media (width >= 720px) {
      // z-index: 50 } }` — so a declaration's immediate parent is often the
      // at-rule, and reading `decl.parent.selector` returned undefined and
      // skipped every variant-wrapped numeral. Four mutants survived on exactly
      // that before this loop existed.
      type Node = { type: string; parent?: unknown; selector?: string };
      let node: Node | undefined = decl.parent as Node | undefined;
      let outermost: Node | undefined;
      while (node !== undefined) {
        if (node.type === "rule") outermost = node;
        node = node.parent as Node | undefined;
      }
      if (outermost?.selector === undefined) return;
      const selector = outermost.selector;
      let value = decl.value.trim();
      const varRef = /var\((--[a-z0-9-]+)\)/.exec(value);
      if (varRef !== null) {
        const resolved = lastVarValue(css, varRef[1]!);
        if (resolved === undefined) {
          offenders.push(`${selector}: ${value} resolves to nothing`);
          return;
        }
        value = resolved;
      }
      // r6 F2: `if (value === "auto") return` admitted `z-auto` AND every variant
      // and arbitrary form that resolves to auto, with no band and no exemption.
      // `auto` is a legitimate reset, but it has to be NAMED as one.
      if (value === "auto") {
        const autoUtility = utilityOf(selector);
        if (autoUtility !== "z-auto" && !HANDWRITTEN_Z_RULES.some((r) => r.selector === selector)) {
          offenders.push(`${selector}: resolves to auto through ${autoUtility ?? "no z- utility"}`);
        }
        return;
      }
      // r3 F4: a bare integer, not a numeric PREFIX — `50px` is not 50.
      if (!/^-?\d+$/.test(value)) {
        offenders.push(`${selector}: z-index ${value} is not an integer`);
        return;
      }
      if (!BAND_VALUES.has(Number(value))) {
        offenders.push(`${selector}: z-index ${value} is not a band value`);
        return;
      }
      // Matching a band VALUE is not the contract; being a band NAME is — and
      // this FAILS CLOSED. r4 F1: `[z-index:50]`, `hover:[z-index:50]`, `!z-50`
      // and `hover:!z-50` all emit 50 through selectors that name no z- utility,
      // so a `utility === null` pass let every one of them through. An emitted
      // band value the guard cannot attribute to a band NAME is now an offender
      // unless the selector is a declared hand-written rule.
      const utility = utilityOf(selector);
      if (utility === null) {
        if (!HANDWRITTEN_Z_RULES.some((r) => r.selector === selector)) {
          offenders.push(
            `${selector}: emits a band value through no band utility — add a band class, or a ` +
              `reasoned HANDWRITTEN_Z_RULES row if this is hand-written CSS`,
          );
        }
      } else if (!(utility in BAND_TOKENS)) {
        offenders.push(`${selector}: stacks by numeral (${utility}), not by band name`);
      } else if (BAND_TOKENS[utility] !== Number(value)) {
        // r6 F1, and the sharpest hole this guard has had: the value check and
        // the name check were INDEPENDENT. "50 is some band's value" and
        // "z-overlay is some band's name" were both true after retuning
        // `--z-index-overlay` to 40, so every overlay in the app silently moved a
        // band while the guard stayed green. The mapping is the whole contract;
        // assert the CORRESPONDENCE, not the two memberships.
        offenders.push(
          `${selector}: ${utility} compiles to ${value}, but the band is ${BAND_TOKENS[utility]}`,
        );
      }
    });

    expect(
      offenders,
      "the compiled stylesheet emits a z-index that is not a band. Tailwind's extractor sees every " +
        "candidate that reaches the DOM — arbitrary values, negatives, variants, the `!` modifier, " +
        "`.ts` class modules — so a hit here is real, not a recognizer gap.",
    ).toEqual([]);
  });

  it("every band candidate in the source compiles, VARIANTS INCLUDED", () => {
    // r3 F3: `foucs:z-overlay` normalizes to a declared band name and emits
    // nothing at all. Checking the normalized name cannot see it, so each
    // candidate is compiled VERBATIM, one probe per candidate, and a candidate
    // that produces no z-index declaration fails by name.
    const candidates = new Set<string>();
    for (const file of walkSourceFiles(["app", "components"], { extensions: [".tsx", ".ts"] })) {
      for (const raw of scanBandClassTokens(readFileSync(file, "utf8"), file)) candidates.add(raw);
    }
    premise("the tree writes band candidates", candidates.size, 0);

    const dir = mkdtempSync(join(tmpdir(), "zbands-cand-"));
    const silent: string[] = [];
    try {
      // ISOLATION is the whole trick, and getting it wrong twice is what this
      // comment is for. `@import "tailwindcss"` auto-detects sources from its
      // own project, so a probe compiled against `app/globals.css` emits the
      // ENTIRE app's utilities and every candidate looks like it compiles. The
      // first fix wrote a rewritten entry into `app/` — which raced
      // `fontFeatureAvailability`'s "exactly one first-party stylesheet" guard
      // in a parallel run. So the entry lives in the TEMP dir: detection off,
      // the `@source not` lines dropped (they say nothing once detection is
      // off), the `@theme` block carried over for the band tokens, and exactly
      // one source added.
      const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
      const entryBody = globals
        .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);')
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("@source"))
        .join("\n");
      const entry = join(dir, "entry.css");
      const compileProbe = (classes: string): string => {
        const probe = join(dir, "probe.html");
        const out = join(dir, "out.css");
        writeFileSync(probe, `<div class="${classes}"></div>`, "utf8");
        writeFileSync(entry, `${entryBody}\n@source "${probe}";\n`, "utf8");
        execFileSync("pnpm", ["exec", "tailwindcss", "-i", entry, "-o", out], {
          cwd: process.cwd(),
          stdio: "pipe",
        });
        return readFileSync(out, "utf8");
      };
      const countZ = (css: string): number => {
        let n = 0;
        postcss.parse(css).walkDecls("z-index", () => {
          n += 1;
        });
        return n;
      };
      const baselineZCount = countZ(compileProbe("no-such-utility-baseline"));

      for (const candidate of candidates) {
        const css = compileProbe(candidate);
        // r4 F2: "the output contains a z-index declaration" is not the
        // question — globals.css's own rules emit some regardless, so a typo'd
        // candidate passed by riding along with them. The question is whether
        // THIS candidate ADDS one, so the probe is diffed against a baseline
        // compiled with no candidate at all.
        if (countZ(css) <= baselineZCount) silent.push(candidate);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(
      silent,
      "band-shaped classes the source writes that Tailwind compiles to NOTHING — a typo in the band " +
        "name OR in a variant emits no z-index at all, and no string-level check sees it",
    ).toEqual([]);
  });
});

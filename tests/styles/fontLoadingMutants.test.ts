// Mutation matrix for the static font guard.
//
// Every mutant is a transform over the REAL app/fonts.css, fed to the same
// `assertFontsCss` the on-disk rows use. That is the point: a matrix built
// against a private copy of the guard proves things about the copy.
//
// A SURVIVING MUTANT IS A GUARD DEFECT, NEVER A CORPUS DEFECT. Fix the guard;
// do not weaken the mutant.
//
// Families, per the plan's enumerated closure set. M1 descriptor deletion, M2
// duplication, M3 substitution, M4 value corruption, M5 source-list corruption,
// M6 URL corruption, M8 spelling and case escapes, M9 fallback corruption,
// M10 token corruption, M11 environment override, M12 second delivery
// mechanism, M16 dependency-stylesheet registration.
//
// M7 (byte corruption) and the seven-subset permutation mutants are NOT here:
// they are properties of files on disk, not of a stylesheet string, and the
// digest row in fontLoading.test.ts owns them. The subset-permutation family is
// void under one face — a bijection over a one-element domain is not a claim —
// which is a consequence of the ratified one-face decision rather than a gap.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { assertFontsCss } from "../helpers/fontCss";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REAL = readFileSync(resolve(REPO_ROOT, "app/fonts.css"), "utf8");
const GLOBALS = readFileSync(resolve(REPO_ROOT, "app/globals.css"), "utf8");

/** The real shipped list, so the non-mutated baseline is the true configuration. */
const SHIPPED = [{ label: "app/globals.css", css: GLOBALS }];

interface Mutant {
  readonly family: string;
  readonly name: string;
  /** Applied to the fonts stylesheet. */
  readonly mutate?: (css: string) => string;
  /** Applied to app/globals.css instead, for the dependency families. */
  readonly mutateShipped?: (css: string) => string;
}

const MUTANTS: Mutant[] = [
  // ---- M1 descriptor deletion ------------------------------------------
  {
    family: "M1",
    name: "drop font-weight from the Inter face",
    mutate: (c) => c.replace("  font-weight: 100 900;\n", ""),
  },
  {
    family: "M1",
    name: "drop font-display from the Inter face",
    mutate: (c) => c.replace("  font-display: swap;\n", ""),
  },
  {
    family: "M1",
    name: "drop size-adjust from the fallback",
    mutate: (c) => c.replace("  size-adjust: 107.89%;\n", ""),
  },

  // ---- M2 descriptor duplication (CSS applies the LAST) ----------------
  {
    family: "M2",
    name: "append a second src to the Inter face",
    mutate: (c) =>
      c.replace(
        '  src: url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");',
        '  src: url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");\n  src: local("Arial");',
      ),
  },
  {
    family: "M2",
    name: "append a second size-adjust to the fallback",
    mutate: (c) =>
      c.replace("  size-adjust: 107.89%;", "  size-adjust: 107.89%;\n  size-adjust: 200%;"),
  },

  // ---- M3 descriptor substitution (count preserved) --------------------
  {
    family: "M3",
    name: "swap font-style for size-adjust: 200%",
    mutate: (c) => c.replace("  font-style: normal;", "  size-adjust: 200%;"),
  },

  // ---- M4 value corruption ---------------------------------------------
  {
    family: "M4",
    name: "collapse the variable axis to font-weight: 400",
    mutate: (c) => c.replace("font-weight: 100 900;", "font-weight: 400;"),
  },
  {
    family: "M4",
    name: "reclassify the face as italic",
    mutate: (c) => c.replace("font-style: normal;", "font-style: italic;"),
  },
  {
    family: "M4",
    name: "collapse font-display to block in the app",
    mutate: (c) => c.replace("font-display: swap;", "font-display: block;"),
  },
  {
    family: "M4",
    name: "corrupt one override value",
    mutate: (c) => c.replace("ascent-override: 89.79%;", "ascent-override: 90.44%;"),
  },

  // ---- M5 source-list corruption ---------------------------------------
  {
    family: "M5",
    name: "prepend a local() source that wins",
    mutate: (c) =>
      c.replace(
        'src: url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");',
        'src: local("Arial"), url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");',
      ),
  },
  {
    family: "M5",
    name: "unsupported format() excludes the real source",
    mutate: (c) => c.replace('format("woff2")', 'format("definitely-unsupported")'),
  },
  {
    family: "M5",
    name: "tech() that can exclude the source",
    mutate: (c) => c.replace('format("woff2")', 'format("woff2") tech(incremental)'),
  },

  // ---- M6 URL corruption -----------------------------------------------
  {
    family: "M6",
    name: "relative path that resolves nowhere",
    mutate: (c) => c.replace('url("/fonts/', 'url("./fonts/'),
  },
  {
    family: "M6",
    name: "path traversal out of public/",
    mutate: (c) => c.replace('url("/fonts/', 'url("/../assets/fonts/'),
  },

  // ---- M8 spelling and case escapes ------------------------------------
  {
    family: "M8",
    name: "uppercase SRC: with a local() impostor",
    mutate: (c) =>
      c.replace(
        '  src: url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");',
        '  SRC: local("Arial");',
      ),
  },
  {
    family: "M8",
    name: "escaped s\\72 c spelling of src",
    mutate: (c) =>
      c.replace(
        '  src: url("/fonts/InterVariable-latin.d5549562.woff2") format("woff2");',
        '  s\\72 c: local("Arial");',
      ),
  },

  // ---- M9 fallback-face corruption -------------------------------------
  {
    family: "M9",
    name: "repoint the fallback at Times New Roman",
    mutate: (c) => c.replace('src: local("Arial");', 'src: local("Times New Roman");'),
  },
  {
    family: "M9",
    name: "source-order trick: Times first, Arial second",
    mutate: (c) =>
      c.replace('src: local("Arial");', 'src: local("Times New Roman"), local("Arial");'),
  },
  {
    family: "M9",
    name: "a second Inter Fallback at weight 700",
    mutate: (c) =>
      `${c}\n@font-face{font-family:"Inter Fallback";font-weight:700;src:local("Times New Roman")}\n`,
  },
  {
    family: "M9",
    name: "unicode-range excludes the fallback from Latin text",
    mutate: (c) =>
      c.replace('  src: local("Arial");', '  src: local("Arial");\n  unicode-range: U+0370-03FF;'),
  },

  // ---- M10 token corruption ---------------------------------------------
  {
    family: "M10",
    name: "drop the companion from --font-inter",
    mutate: (c) => c.replace('--font-inter: "Inter", "Inter Fallback";', '--font-inter: "Inter";'),
  },
  {
    family: "M10",
    name: "redeclare --font-inter later (CSS takes the last)",
    mutate: (c) => `${c}\n:root{--font-inter:Arial}\n`,
  },
  {
    family: "M10",
    name: "append a trailing family to the token",
    mutate: (c) =>
      c.replace(
        '--font-inter: "Inter", "Inter Fallback";',
        '--font-inter: "Inter", "Inter Fallback", Arial;',
      ),
  },

  // ---- M12 second delivery mechanism ------------------------------------
  {
    family: "M12",
    name: "a second Inter face appended",
    mutate: (c) => `${c}\n@font-face{font-family:"Inter";src:local("Arial")}\n`,
  },

  // ---- M11 environment override, M16 dependency stylesheet ---------------
  {
    family: "M16",
    name: "dependency declares an impostor Inter face",
    mutateShipped: (c) => `${c}\n@font-face{font-family:"Inter";src:local("Arial")}\n`,
  },
  {
    family: "M11",
    name: "dependency redefines a font token under dark mode",
    mutateShipped: (c) => `${c}\n@media (prefers-color-scheme: dark){:root{--font-sans:Arial}}\n`,
  },
  {
    family: "M11",
    name: "dependency redefines a font token under a theme ATTRIBUTE",
    mutateShipped: (c) => `${c}\n[data-theme="dark"]{--font-sans:Arial}\n`,
  },
  {
    family: "M11",
    name: "dependency sets a literal family with !important",
    mutateShipped: (c) => `${c}\n.rpv{font-family:Arial!important}\n`,
  },
];

describe("static font guard — mutation matrix", () => {
  test("baseline: the real stylesheet passes", () => {
    // Non-vacuity. A guard that throws on everything kills every mutant while
    // proving nothing, which is the exact shape this matrix exists to detect.
    expect(() => assertFontsCss(REAL, { shipped: SHIPPED })).not.toThrow();
  });

  test.each(MUTANTS)("$family — $name is killed", ({ mutate, mutateShipped }) => {
    const css = mutate ? mutate(REAL) : REAL;
    const shipped = mutateShipped
      ? [{ label: "app/globals.css", css: mutateShipped(GLOBALS) }]
      : SHIPPED;
    if (mutate) expect(css, "the mutation must actually change the stylesheet").not.toBe(REAL);
    if (mutateShipped) {
      expect(shipped[0]!.css, "the mutation must actually change the sheet").not.toBe(GLOBALS);
    }
    expect(() => assertFontsCss(css, { shipped })).toThrow();
  });
});

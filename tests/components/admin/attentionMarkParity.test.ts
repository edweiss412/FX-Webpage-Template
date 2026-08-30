/**
 * tests/components/admin/attentionMarkParity.test.ts
 *
 * The STRUCTURAL close of this arc's most expensive axis.
 *
 * Four whole-diff rounds found the same defect: a mark decision applied to one
 * review pill and not its twin. Decision 7 itself, then the leading-dot repair,
 * then the middot contrast floor, then the per-segment mark. Each was repaired
 * by hand on both pills and the next one diverged again, so the repair here is
 * not another careful sweep -- it is removing the second place to diverge.
 * `components/admin/review/attentionMark.ts` is now the only description of a
 * mark, and this file is the walk that keeps it that way.
 *
 * Both halves matter and neither is sufficient alone:
 *   - the WALK is filesystem-derived, so a mark added to a file that does not
 *     exist today fails by default rather than being silently exempt;
 *   - the CONTRAST rows are recomputed from `app/globals.css`, so a token edit
 *     that makes a ring invisible fails HERE instead of shipping. The arc twice
 *     chose a ring ink against a plate the element never paints on, which no
 *     class-string assertion could ever have caught.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  attentionMarkClass,
  type AttentionMarkKind,
  type AttentionMarkPlate,
} from "@/components/admin/review/attentionMark";

const ROOT = process.cwd();

/** Every `.tsx` under components/, walked from disk. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

/**
 * A mark-shaped className LITERAL: an 8px box painted with a status or text
 * token. Deliberately broader than "a pill mark" -- the point is that anything
 * mark-shaped has to justify itself, and narrowing the recognizer to the files
 * we already know about would rebuild the enumeration this replaces.
 */
const MARK_LITERAL = /"[^"]*\bsize-2\b[^"]*"/g;
const CARRIES_TOKEN = /\bbg-status-|\bborder-status-|\bborder-text-/;

/**
 * The marks that are NOT review-pill marks, each with the reason it owns its own
 * string. Asserted in BOTH directions below: an unregistered site fails, and a
 * registered site that no longer exists fails too, so this cannot rot into a
 * list of excuses for code that has moved on.
 */
const NON_PILL_MARKS: ReadonlyArray<{ file: string; literal: string; why: string }> = [
  {
    file: "components/admin/showpage/AttentionMenu.tsx",
    literal:
      '"mt-1.5 size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"',
    why: "Menu ROW marks, not the pill. The menu is open, at full width, and every row carries its own visible text, so the mark is a tone cue rather than the sole carrier of a state -- which is the entire reason the pill's marks needed a shape vocabulary.",
  },
  {
    file: "components/admin/wizard/Step3ReviewModal.tsx",
    literal: '"size-2 rounded-pill bg-status-review"',
    why: 'The "Sheet changed" CHIP, which is not the attention pill and not under the header cap -- a separate always-labelled chip whose text carries its own meaning. Folding it into the builder added `shrink-0` and broke T-STEP3-DIRTY-INVARIANT, a byte baseline whose entire job is proving Step 3 unchanged; the baseline was right and the tidying was wrong. The pill marks in this same file DO go through the builder, which is why the file is registered rather than exempted wholesale -- the walk still fails on any NEW literal here.',
  },
  {
    file: "components/admin/review/ShowReviewSurface.tsx",
    literal: '"size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"',
    why: "The S3C-1 no-issues ring, the hollow half of the same registered nav vocabulary as the row below.",
  },
  {
    file: "components/admin/review/ShowReviewSurface.tsx",
    literal: '"size-2 shrink-0 rounded-pill bg-status-review"',
    why: "The section-nav rail dots, a DIFFERENT registered vocabulary: DESIGN.md S3C-1 (filled amber disc = needs review, hollow teal ring = no issues) with its own sr-only text equivalent. Folding it into the pill's builder would merge two vocabularies that DESIGN.md deliberately keeps apart.",
  },
];

describe("attention-pill marks have exactly one implementation (whole-diff R4, twin-divergence axis)", () => {
  const files = walk(join(ROOT, "components"));

  it("premise: the walk actually reaches the review pills", () => {
    // Without this the whole suite passes vacuously on an empty file list, which
    // is the shape of a guard that proves nothing.
    const rel = files.map((f) => f.slice(ROOT.length + 1));
    expect(rel).toContain("components/admin/showpage/PublishedReviewModal.tsx");
    expect(rel).toContain("components/admin/wizard/Step3ReviewModal.tsx");
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file builds a mark className by hand except the registered non-pill vocabularies", () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = abs.slice(ROOT.length + 1);
      if (rel.endsWith("components/admin/review/attentionMark.ts")) continue;
      const src = readFileSync(abs, "utf8");
      for (const literal of src.match(MARK_LITERAL) ?? []) {
        if (!CARRIES_TOKEN.test(literal)) continue;
        // Matched on the EXACT literal, never on the file. A per-file registry
        // would exempt every future mark added to a file that already has one
        // registered row -- including `Step3ReviewModal.tsx`, whose pill marks
        // DO go through the builder while its chip does not.
        if (NON_PILL_MARKS.some((r) => r.file === rel && r.literal === literal)) continue;
        offenders.push(`${rel}: ${literal}`);
      }
    }
    expect(
      offenders,
      `hand-rolled mark className(s). Route them through attentionMarkClass(kind, plate), or register the file in NON_PILL_MARKS with the reason it is not a pill mark:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no registered exemption has gone stale", () => {
    // The other direction, so the registry cannot outlive the code it excuses.
    for (const { file } of NON_PILL_MARKS) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const hits = (src.match(MARK_LITERAL) ?? []).filter((l) => CARRIES_TOKEN.test(l));
      expect(
        hits.length,
        `${file} no longer carries a hand-rolled mark; drop its row`,
      ).toBeGreaterThan(0);
    }
  });

  it("both review pills consume the shared builder", () => {
    for (const rel of [
      "components/admin/showpage/PublishedReviewModal.tsx",
      "components/admin/wizard/Step3ReviewModal.tsx",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} must import the shared mark`).toContain("attentionMarkClass");
    }
  });
});

/** WCAG relative luminance, on the same formula DESIGN.md section 1.2 uses. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const ch = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Token values read from the LIVE stylesheet, never transcribed. */
function tokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  // The first definition of each `-runtime` token is light; the redefinitions
  // under the dark blocks come later, so last-wins gives dark.
  for (const m of css.matchAll(/--color-([a-z-]+)-runtime:\s*(#[0-9a-fA-F]{6})/g)) {
    const [, name, hex] = m;
    if (light[name!] === undefined) light[name!] = hex!;
    else dark[name!] = hex!;
  }
  return { light, dark };
}

describe("every mark clears the non-text floor on the plate it actually paints on", () => {
  const { light, dark } = tokens();
  const PLATE: Record<AttentionMarkPlate, string> = {
    warning: "warning-bg",
    sunken: "surface-sunken",
  };
  /** The ink each kind puts against its plate: a ring's border, a fill's bg. */
  const INK: Record<AttentionMarkKind, string> = {
    issues: "status-review",
    warnings: "status-review",
    monitoring: "status-positive",
    judgment: "", // resolved per plate below — that IS the finding this pins
  };

  it("premise: the stylesheet parsed and both modes resolved", () => {
    for (const t of [
      "warning-bg",
      "surface-sunken",
      "status-review",
      "status-positive",
      "text-faint",
      "text-subtle",
    ]) {
      expect(light[t], `light ${t}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(dark[t], `dark ${t}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  for (const plate of ["warning", "sunken"] as const) {
    for (const kind of ["issues", "warnings", "monitoring", "judgment"] as const) {
      it(`${kind} on the ${plate} plate clears 3:1 in both modes`, () => {
        const cls = attentionMarkClass(kind, plate);
        // For judgment the ink is chosen BY plate, so read it back out of the
        // class the builder produced rather than assuming which one it picked.
        const ink =
          kind === "judgment" ? (/border-(text-[a-z]+)\b/.exec(cls)?.[1] ?? "") : INK[kind];
        expect(ink, `could not resolve the ink for ${kind}/${plate} from "${cls}"`).not.toBe("");
        const bg = PLATE[plate];
        for (const [mode, table] of [
          ["light", light],
          ["dark", dark],
        ] as const) {
          const ratio = contrast(table[ink]!, table[bg]!);
          expect(
            ratio,
            `${kind} on ${plate}: ${ink} vs ${bg} is ${ratio.toFixed(3)}:1 in ${mode} mode, under the 3:1 non-text floor (WCAG 1.4.11)`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  it("issues and warnings SHARE a fill, so shape is provably the carrier", () => {
    const i = attentionMarkClass("issues", "warning");
    const w = attentionMarkClass("warnings", "warning");
    expect(i).toContain("bg-status-review");
    expect(w).toContain("bg-status-review");
    // ...and they are still different marks.
    expect(i).not.toBe(w);
  });

  it("the warnings mark is a THREE-point clip, not the retired four-point square", () => {
    const cls = attentionMarkClass("warnings", "warning");
    const poly = /polygon\(([^)]*)\)/.exec(cls);
    expect(poly, "the warnings mark must be clipped to a polygon").not.toBeNull();
    expect(poly![1]!.split(",").filter((s) => s.trim() !== "")).toHaveLength(3);
  });

  it("every kind occupies the same 8px box, so a state flip never reflows", () => {
    for (const plate of ["warning", "sunken"] as const) {
      for (const kind of ["issues", "warnings", "monitoring", "judgment"] as const) {
        expect(attentionMarkClass(kind, plate), `${kind}/${plate}`).toContain("size-2");
      }
    }
  });
});

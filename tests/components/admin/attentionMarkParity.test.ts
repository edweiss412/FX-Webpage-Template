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
 * Every string REGION in a file -- quoted strings and whole template literals,
 * interpolations included.
 *
 * The first version of this matched only QUOTED regions containing `size-2`,
 * and whole-diff R5 walked straight through it: writing the mark as
 * `` className={`size-2 ${cond ? "bg-status-review" : "..."}`} `` splits the box
 * class and the colour token across an interpolation, so no single quoted region
 * held both and the recognizer saw nothing. A second mark implementation could
 * return to the pill with the walk still green. A recognizer shaped around the
 * strings that happen to exist today is not a cover.
 */
/* eslint-disable-next-line no-useless-escape -- scanner, not a matcher */
function stringRegions(src: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const q = src[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    let depth = 0;
    for (let k = i + 1; k < src.length; k += 1) {
      const c = src[k];
      if (c === "\\") {
        k += 1;
        continue;
      }
      // Inside a template literal, an interpolation can itself contain quotes
      // and nested templates, so track its depth rather than stopping at the
      // first backtick after it.
      if (q === "`" && c === "$" && src[k + 1] === "{") {
        depth += 1;
        k += 1;
        continue;
      }
      if (q === "`" && depth > 0) {
        if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        continue;
      }
      if (c === q) {
        out.push(src.slice(i, k + 1));
        i = k;
        break;
      }
      if (q !== "`" && c === "\n") break;
    }
  }
  return out;
}

/** An 8px box painted with a status or text token, however it is composed. */
const IS_MARK_SHAPED = (expr: string) =>
  /\bsize-2\b/.test(expr) && /\bbg-status-|\bborder-status-|\bborder-text-/.test(expr);

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
      for (const expr of stringRegions(src)) {
        if (!IS_MARK_SHAPED(expr)) continue;
        // Built by the shared helper: fine, however it is spelled.
        if (expr.includes("attentionMarkClass(")) continue;
        // Matched on the EXACT literal, never on the file. A per-file registry
        // would exempt every future mark added to a file that already has one
        // registered row -- including `Step3ReviewModal.tsx`, whose pill marks
        // DO go through the builder while its chip does not.
        if (NON_PILL_MARKS.some((r) => r.file === rel && r.literal === expr)) continue;
        offenders.push(`${rel}: ${expr.replace(/\s+/g, " ").slice(0, 160)}`);
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
      const hits = stringRegions(src).filter(IS_MARK_SHAPED);
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

/**
 * Token values read from the LIVE stylesheet, never transcribed, and read as
 * THREE separate tables.
 *
 * The first version collapsed them with last-wins, which whole-diff R5 showed is
 * a false green in the direction that matters: this project themes dark TWICE,
 * once under `@media (prefers-color-scheme: dark)` for first paint and once
 * under `[data-theme="dark"]` for the explicit toggle. Editing only the media
 * block left the parser reading the later attribute block, so a token that had
 * become invisible for every system-dark viewer was asserted at its old ratio.
 * Both dark tables are now asserted, because a viewer sees one or the other.
 */
function tokenTables(): {
  light: Record<string, string>;
  mediaDark: Record<string, string>;
  attrDark: Record<string, string>;
} {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const mediaAt = css.indexOf("@media (prefers-color-scheme: dark)");
  const attrAt = css.indexOf('[data-theme="dark"] {');
  expect(mediaAt, "globals.css must carry a prefers-color-scheme dark block").toBeGreaterThan(0);
  expect(attrAt, "globals.css must carry a [data-theme=dark] block").toBeGreaterThan(0);
  const read = (slice: string) => {
    const out: Record<string, string> = {};
    for (const m of slice.matchAll(/--color-([a-z-]+)-runtime:\s*(#[0-9a-fA-F]{6})/g)) {
      if (out[m[1]!] === undefined) out[m[1]!] = m[2]!;
    }
    return out;
  };
  const [first, second] = mediaAt < attrAt ? [mediaAt, attrAt] : [attrAt, mediaAt];
  const tables = {
    light: read(css.slice(0, first)),
    a: read(css.slice(first, second)),
    b: read(css.slice(second)),
  };
  return mediaAt < attrAt
    ? { light: tables.light, mediaDark: tables.a, attrDark: tables.b }
    : { light: tables.light, mediaDark: tables.b, attrDark: tables.a };
}

/**
 * The ink a mark puts against its plate, READ BACK from the class the builder
 * produced -- never assumed. R5: `monitoring` was hard-coded as
 * `status-positive`, so changing the builder to emit `border-text-faint` left
 * the test asserting the old token's ratio while the real one was 2.793:1 dark.
 * A test that names the ink itself is testing its own copy of the answer.
 */
function inkOf(cls: string): string {
  const border = /\bborder-((?:status|text|warning)-[a-z-]+)\b/.exec(cls);
  if (border !== null) return border[1]!;
  const bg = /\bbg-((?:status|text|warning)-[a-z-]+)\b/.exec(cls);
  return bg === null ? "" : bg[1]!;
}

describe("every mark clears the non-text floor on the plate it actually paints on", () => {
  const { light, mediaDark, attrDark } = tokenTables();
  const PLATE: Record<AttentionMarkPlate, string> = {
    warning: "warning-bg",
    sunken: "surface-sunken",
  };

  it("premise: all three token tables parsed and carry the tokens under test", () => {
    for (const [name, table] of [
      ["light", light],
      ["media-dark", mediaDark],
      ["attr-dark", attrDark],
    ] as const) {
      for (const tok of [
        "warning-bg",
        "surface-sunken",
        "status-review",
        "status-positive",
        "text-faint",
        "text-subtle",
      ]) {
        expect(table[tok], `${name} ${tok}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
    // The two dark blocks must actually be distinct slices, or the split above
    // silently degrades back to the last-wins read it replaced.
    expect(mediaDark).not.toBe(attrDark);
  });

  for (const plate of ["warning", "sunken"] as const) {
    for (const kind of ["issues", "warnings", "monitoring", "judgment"] as const) {
      it(`${kind} on the ${plate} plate clears 3:1 in light and in BOTH dark modes`, () => {
        const cls = attentionMarkClass(kind, plate);
        const ink = inkOf(cls);
        expect(ink, `could not resolve the ink for ${kind}/${plate} from "${cls}"`).not.toBe("");
        // R5: a mark that composites at partial alpha is invisible at full
        // token contrast. The builder emits no opacity utility and this is what
        // keeps it that way.
        expect(cls, `${kind}/${plate} must not carry an opacity utility`).not.toMatch(
          /\bopacity-\d/,
        );
        const bg = PLATE[plate];
        for (const [mode, table] of [
          ["light", light],
          ["dark (prefers-color-scheme)", mediaDark],
          ["dark ([data-theme])", attrDark],
        ] as const) {
          const ratio = contrast(table[ink]!, table[bg]!);
          expect(
            ratio,
            `${kind} on ${plate}: ${ink} vs ${bg} is ${ratio.toFixed(3)}:1 in ${mode}, under the 3:1 non-text floor (WCAG 1.4.11)`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  it("issues and warnings SHARE a fill, so shape is provably the carrier", () => {
    const i = attentionMarkClass("issues", "warning");
    const w = attentionMarkClass("warnings", "warning");
    expect(inkOf(i)).toBe(inkOf(w));
    expect(i).not.toBe(w);
  });

  it("the warnings mark is a triangle with REAL AREA, not three collinear points", () => {
    // R5: counting points accepts `polygon(50% 100%, 100% 100%, 0% 100%)` --
    // three points on one line, zero painted area, every other assertion green
    // and no mark on screen. The area is the property; the count never was.
    const cls = attentionMarkClass("warnings", "warning");
    const poly = /polygon\(([^)]*)\)/.exec(cls);
    expect(poly, "the warnings mark must be clipped to a polygon").not.toBeNull();
    const pts = poly![1]!
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((p) => p.split(/[\s_]+/).map((n) => parseFloat(n)));
    expect(pts, "a triangle has three points").toHaveLength(3);
    for (const p of pts) expect(p, `unparseable point in "${poly![1]}"`).toHaveLength(2);
    // Shoelace, in percentage units. Anything degenerate collapses to zero.
    const [a, b, c] = pts as [number[], number[], number[]];
    const area =
      Math.abs(a[0]! * (b[1]! - c[1]!) + b[0]! * (c[1]! - a[1]!) + c[0]! * (a[1]! - b[1]!)) / 2;
    expect(
      area,
      `the clip encloses no area (${poly![1]}), so the mark paints nothing`,
    ).toBeGreaterThan(100);
  });

  it("every kind occupies the same 8px box, so a state flip never reflows", () => {
    for (const plate of ["warning", "sunken"] as const) {
      for (const kind of ["issues", "warnings", "monitoring", "judgment"] as const) {
        expect(attentionMarkClass(kind, plate), `${kind}/${plate}`).toContain("size-2");
      }
    }
  });
});

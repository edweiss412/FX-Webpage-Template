/**
 * tests/components/admin/sheetIconLinkContainment.test.ts
 *
 * Containment guard for the sheet-link phrase (sheet-icon-link spec §7.10) —
 * the adoption catcher that closes BL-HEADER-LINK-AFFORDANCE-CLASS's drift
 * class. The aria phrase "Open the source sheet" may exist in EXACTLY these
 * files at EXACTLY these occurrence counts:
 *
 *   - components/admin/SheetIconLink.tsx (2 — the subject and fallback label
 *     literals; every icon-only sheet link must delegate here)
 *   - components/admin/wizard/Step3SheetCard.tsx (1 — the ratified text-link
 *     variant, spec §1.5: visible words carry the affordance)
 *   - components/admin/wizard/step3ReviewSections.tsx (1 — the agenda
 *     error-state text link, spec §1.11: visible words carry the affordance)
 *
 * SET-EQUALITY with per-file counts, not an allowlist: a re-inlined anchor in
 * a NEW file adds a row; one inside an allowlisted file bumps its count. Both
 * fail. Comments count too (deliberate — a label-quoting comment re-seeds the
 * drift the next time someone copies it; reword instead, see spec §4.3).
 *
 * Filesystem-walked, never a named file list, so a new file cannot dodge the
 * walk. Walks components/ AND app/ (excluding app/api — no UI there), because
 * an inline anchor in a page/layout would otherwise slip the set-equality
 * (audit P3).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PHRASE = "Open the source sheet";

const EXPECTED: Record<string, number> = {
  "components/admin/SheetIconLink.tsx": 2,
  "components/admin/wizard/Step3SheetCard.tsx": 1,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Whole-diff r5 (tightened r6): the component's own token set is pinned by
 * set-equality in the unit suite, but that covers only what SheetIconLink
 * renders — a NEW consumer passing colour/size/hit-area utilities through
 * `className` (the prop is contractually positional-only: order/margin) would
 * ship an off-contract skin with no guard failing. Every JSX usage's
 * className must therefore be a STRING LITERAL whose tokens all match the
 * positional allowlist. Fails by construction (r6): brace-expression
 * className, ANY spread attribute on the tag (props could smuggle className),
 * and an aliased import of the component (an alias defeats this static
 * guard — do not alias). The allowlist is a closed non-negative margin scale
 * (0–3, half steps) plus order utilities: negative margins (`-mr-3.5`),
 * arbitrary values (`mr-[-14px]`), and box-altering utilities (`self-*`,
 * sizes, colours) all fail.
 */
const POSITIONAL =
  /^(?:sm:|md:|lg:)?(?:m[lrtb]-(?:0(?:\.5)?|1(?:\.5)?|2(?:\.5)?|3)|order-(?:\d|first|last|none))$/;

function classNameViolations(src: string): string[] {
  const out: string[] = [];
  if (/import\s*{[^}]*\bSheetIconLink\s+as\s+/s.test(src)) {
    out.push("aliased SheetIconLink import — an alias defeats this static guard; do not alias");
  }
  for (const m of src.matchAll(/<SheetIconLink\b[^>]*?(?:\/>|>)/gs)) {
    const tag = m[0];
    if (tag.includes("{...")) {
      out.push(`spread attribute on SheetIconLink (could smuggle className): ${tag.slice(0, 100)}`);
      continue;
    }
    const lit = tag.match(/className="([^"]*)"/);
    if (lit) {
      for (const tok of lit[1]!.split(/\s+/).filter(Boolean)) {
        if (!POSITIONAL.test(tok))
          out.push(`off-contract className token "${tok}" in: ${tag.slice(0, 100)}`);
      }
    } else if (/className[=\s]/.test(tag)) {
      out.push(`non-literal className in: ${tag.slice(0, 100)}`);
    }
  }
  return out;
}

describe("sheet-link phrase containment (spec §7.10)", () => {
  it("per-file occurrence counts equal the pinned set exactly", () => {
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")).filter((f) => !f.includes("/app/api/")),
    ];
    for (const file of files) {
      const rel = file.slice(root.length + 1);
      const count = readFileSync(file, "utf8").split(PHRASE).length - 1;
      if (count > 0) found[rel] = count;
    }
    expect(found).toEqual(EXPECTED);
  });

  it("className checker flags off-contract tokens and non-literal expressions (negative plants)", () => {
    expect(
      classNameViolations(
        '<SheetIconLink href="x" subjectLabel="y" testId="t" ringOffset="bg" className="size-tap-min text-text-subtle" />',
      ),
    ).toHaveLength(2);
    expect(classNameViolations("<SheetIconLink className={dynamic} />")).toHaveLength(1);
    expect(classNameViolations("<SheetIconLink className={`mr-0.5 ${x}`} />")).toHaveLength(1);
    // r6 forms: spread, alias, negative margin, arbitrary value, self-*
    expect(classNameViolations('<SheetIconLink {...props} className="mr-0.5" />')).toHaveLength(1);
    expect(
      classNameViolations(
        'import { SheetIconLink as Link } from "@/components/admin/SheetIconLink";',
      ),
    ).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="-mr-3.5" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="mr-[-14px]" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="self-stretch" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="mr-4" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="sm:order-1 sm:ml-0.5" />')).toHaveLength(
      0,
    );
    expect(classNameViolations('<SheetIconLink className="mr-0.5" />')).toHaveLength(0);
    expect(classNameViolations('<SheetIconLink ringOffset="bg" />')).toHaveLength(0);
  });

  it("every live SheetIconLink call site keeps className positional-only string literals", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")).filter((f) => !f.includes("/app/api/")),
    ];
    const violations = files.flatMap((file) => {
      // Gate on the bare name, not the JSX tag — an alias-importing file
      // contains no `<SheetIconLink` tag yet must still be flagged.
      const src = readFileSync(file, "utf8");
      if (!src.includes("SheetIconLink")) return [];
      return classNameViolations(src).map((v) => `${file.slice(root.length + 1)}: ${v}`);
    });
    expect(violations).toEqual([]);
  });
});

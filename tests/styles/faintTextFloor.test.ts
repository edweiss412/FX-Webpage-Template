/**
 * `--color-text-faint` as the colour of TEXT.
 *
 * WHY THIS EXISTS. The token measures 3.21:1 on `--color-bg` and 3.35:1 on
 * `--color-surface` in light (DESIGN §1.2). That clears the 3:1 floor for a
 * glyph or a boundary and misses the 4.5:1 floor for text. DESIGN §1.1 has
 * always reserved it for decorative text and divider labels, and nothing held
 * that line: `BL-DIAGRAMS-HEADING-FAINT-CONTRAST` found a crew tile heading and
 * the day-card weekdays on it, and the sweep behind that row found flight
 * confirmation codes, admin timestamps and two input placeholders as well.
 *
 * THE RULE. Every string in app/, components/ and lib/ that names the token is
 * either gone or sits in KEPT with the reason WCAG 1.4.3 does not reach it. The
 * walk starts from disk, so a new site fails until someone writes that reason.
 * It reads string literals through the TypeScript parser, so comments that
 * explain why a site moved OFF the token are not sites.
 *
 * DOCUMENTED LIMIT: this reads which token a string names and not what ground
 * it lands on, so it cannot see a class name assembled at runtime from parts.
 * `faintRestingControls.test.ts` keeps the separate question of action targets.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

const ROOT = process.cwd();
const TOKEN = /(?:^|\s)(?:\S*:)?text-text-faint(?=\s|$)/;

function faintLiterals(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const isLiteral =
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddleOrTemplateTail(node);
    if (isLiteral && TOKEN.test(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

type Hit = { readonly file: string; readonly literal: string };

function liveHits(): Hit[] {
  const hits: Hit[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const entry of readdirSync(join(ROOT, dir), { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(entry)) continue;
      const file = `${dir}/${entry}`;
      for (const literal of faintLiterals(file, readFileSync(join(ROOT, file), "utf8"))) {
        hits.push({ file, literal });
      }
    }
  }
  return hits;
}

const GLYPH = "not text: an icon or glyph, held to the 3:1 non-text floor";
const SEPARATOR = "pure decoration: an aria-hidden separator between two text runs";
const INACTIVE = "inactive component, which SC 1.4.3 exempts";

type Kept = {
  readonly file: string;
  /** A substring of the literal, unique among this file's rows. */
  readonly anchor: string;
  readonly sites: number;
  readonly why: string;
};

const KEPT: readonly Kept[] = [
  { file: "app/me/meShowSections.tsx", anchor: "text-text-faint", sites: 2, why: SEPARATOR },
  { file: "components/layout/Footer.tsx", anchor: "text-text-faint", sites: 2, why: SEPARATOR },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    anchor: "px-1.5 font-normal",
    sites: 1,
    why: SEPARATOR,
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    anchor: "opacity-60",
    sites: 1,
    why: GLYPH,
  },
  { file: "components/atoms/Section.tsx", anchor: "text-text-faint", sites: 1, why: GLYPH },
  { file: "components/admin/ShowsTable.tsx", anchor: "absolute left-2.5", sites: 1, why: GLYPH },
  { file: "components/admin/ShowsTable.tsx", anchor: "min-[768px]:block", sites: 1, why: GLYPH },
  { file: "components/admin/telemetry/EventRow.tsx", anchor: "size-4", sites: 1, why: GLYPH },
  { file: "components/crew/CrewAllSections.tsx", anchor: "size-4", sites: 1, why: GLYPH },
  { file: "components/crew/search/CrewSearchResults.tsx", anchor: "size-4", sites: 1, why: GLYPH },
  { file: "components/shared/CardReportTrigger.tsx", anchor: "h-fit", sites: 1, why: GLYPH },
  {
    file: "components/admin/HoverHelp.tsx",
    anchor: "rounded-full",
    sites: 1,
    why: "an aria-hidden ? inside a bordered badge, ruled a glyph by DESIGN §1.1a",
  },
  {
    file: "app/auth/sign-in/page.tsx",
    anchor: "bg-bg px-2",
    sites: 1,
    why: "the OR on a divider rule, the divider label DESIGN §1.1 names",
  },
  {
    file: "components/layout/Header.tsx",
    anchor: "tracking-eyebrow-strong",
    sites: 1,
    why: "the FXAV wordmark, a logotype, which SC 1.4.3 exempts",
  },
  {
    file: "components/admin/OnboardingWizard.tsx",
    anchor: "bg-surface-sunken",
    sites: 1,
    why: `${INACTIVE}: the pill of a step not reached yet`,
  },
  {
    file: "components/admin/wizard/Step2Verify.tsx",
    anchor: "bg-surface-sunken",
    sites: 1,
    why: `${INACTIVE}: the aria-disabled Continue button`,
  },
  {
    file: "components/crew/CrewLoadingSkeleton.tsx",
    anchor: "text-text-faint",
    sites: 2,
    why: `${INACTIVE}: loading stand-ins for labels the real page replaces`,
  },
];

describe("text-text-faint never carries text WCAG holds to 4.5:1", () => {
  const hits = liveHits();
  const rowsFor = (hit: Hit) =>
    KEPT.filter((row) => row.file === hit.file && hit.literal.includes(row.anchor));

  it("the parser reads the shapes the classes actually take", () => {
    const at = (source: string) => faintLiterals("probe.tsx", source).length;
    expect(at('<p className="text-xs text-text-faint">a</p>')).toBe(1);
    expect(at("<p className={`${a} text-text-faint ${b}`}>a</p>")).toBe(1);
    expect(at("<p className={`text-text-faint ${b}`}>a</p>")).toBe(1);
    expect(at('const c = on ? "text-text-faint" : "text-text";')).toBe(1);
    expect(at('<input className="placeholder:text-text-faint" />')).toBe(1);
    expect(at('<p className="min-[768px]:text-text-faint">a</p>')).toBe(1);
    expect(at('<p className="border border-text-faint">a</p>')).toBe(0);
    expect(at("// text-text-faint\n/* text-text-faint */ const a = 1;")).toBe(0);
    expect(at("<p>{/* text-text-faint */}</p>")).toBe(0);
  });

  it("the walk reached the live tree, through a template literal too", () => {
    premise("faint literals found on disk", hits.length, 10);
    premiseHolds(
      "the template-literal site in CardReportTrigger is visible to the walk",
      hits.some((hit) => hit.file === "components/shared/CardReportTrigger.tsx"),
    );
  });

  it("every site has exactly one reason", () => {
    const unreasoned = hits.filter((hit) => rowsFor(hit).length !== 1);
    expect(unreasoned.map((hit) => `${hit.file}: ${hit.literal}`)).toEqual([]);
  });

  it("no row outlives its site", () => {
    const counted = KEPT.map((row) => ({
      row: `${row.file} ${row.anchor}`,
      sites: hits.filter((hit) => rowsFor(hit).includes(row)).length,
    }));
    expect(counted).toEqual(
      KEPT.map((row) => ({ row: `${row.file} ${row.anchor}`, sites: row.sites })),
    );
  });
});

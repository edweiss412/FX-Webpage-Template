/**
 * tests/styles/crewSectionTypeScale.test.ts
 *
 * The crew section type scale (docs/superpowers/specs/2026-11-07-crew-panel-followups-design.md
 * §3). CSS cannot compare a class by value, so app/globals.css names every literal
 * size below 12px. This walks the section components from disk, so a new file or a
 * new literal is covered by default: a literal the rule set does not name fails here
 * instead of shipping as small text a crew member cannot read on a show floor.
 *
 * A browser walk (tests/e2e/crew-section-toggle.spec.ts) proves the computed sizes.
 * This catches what that walk cannot reach: a literal the seeded show never renders.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

const ROOTS = ["components/show-panels", "components/crew"];
const FLOOR_PX = 12;
const REM_PX = 16;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every Tailwind literal size below the floor, as the class's bracket contents. */
function smallLiterals(source: string): string[] {
  const found = new Set<string>();
  for (const [, value, unit] of source.matchAll(/\btext-\[(\d*\.?\d+)(px|rem)\]/g)) {
    const px = unit === "rem" ? Number(value) * REM_PX : Number(value);
    if (px < FLOOR_PX) found.add(`${value}${unit}`);
  }
  return [...found];
}

/** The rule set's text, or the empty string when it is absent. */
function typeScaleCss(): string {
  const css = readFileSync("app/globals.css", "utf8");
  return [...css.matchAll(/\[data-crew-section-type\][^{]*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
}

/** `10.5px` as the escaped class selector the CSS has to carry. */
function selectorFor(literal: string): string {
  return `.text-\\[${literal.replaceAll(".", "\\.")}\\]`;
}

describe("crew section type scale", () => {
  it("recognizes a small literal, and leaves one at the floor alone", () => {
    expect(smallLiterals('"text-[9px] text-[0.625rem] text-[12px] text-[0.75rem]"')).toEqual([
      "9px",
      "0.625rem",
    ]);
  });

  it("defines both type variables on the attribute", () => {
    const css = typeScaleCss();
    expect(css).toContain("--text-xs: 0.8125rem");
    expect(css).toContain("--text-sm: 0.9375rem");
  });

  it("names every literal below 12px in the section components", () => {
    const files = ROOTS.flatMap(sourceFiles);
    premiseHolds(
      "the walk saw FieldRowList",
      files.includes(join("components/show-panels", "FieldRowList.tsx")),
    );
    const literals = new Set(files.flatMap((f) => smallLiterals(readFileSync(f, "utf8"))));
    premise("literals the walk found", literals.size, 0);
    const css = typeScaleCss();
    const missing = [...literals].filter((l) => !css.includes(selectorFor(l)));
    expect(missing).toEqual([]);
  });

  it("sets labels after the 11px rule, so a class carrying both is a 12px label", () => {
    const css = typeScaleCss();
    const eleven = css.indexOf(selectorFor("11px"));
    const labels = css.indexOf(".uppercase");
    premiseHolds("both rules exist", eleven >= 0 && labels >= 0);
    expect(labels).toBeGreaterThan(eleven);
  });
});

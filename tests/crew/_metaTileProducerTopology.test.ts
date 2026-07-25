/**
 * tests/crew/_metaTileProducerTopology.test.ts
 *
 * Structural defense for the tile-render alert producer.
 *
 * Filesystem-walked so a NEW surface fails by default. The required `ledger`
 * prop only removes the silent-omission case; assertion 3 here is what actually
 * bounds ownership, because a caller can otherwise type-safely construct a
 * section with a throwaway ledger the sweep never reads, and every type-level
 * and mock-level check would still pass.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const SHELL = "app/show/[slug]/[shareToken]/_CrewShell.tsx";
const SECTIONS_DIR = join("components", "crew", "sections");

const SECTION_COMPONENTS = [
  "TodaySection",
  "ScheduleSection",
  "VenueSection",
  "TravelSection",
  "CrewSection",
  "GearSection",
  "BudgetSection",
] as const;

/**
 * Which tileId belongs to which section FILE. Checking only the global set would
 * let two sections swap their tile IDs and stay green, which would silently
 * misattribute every alert those tiles raise.
 */
const EXPECTED_TILE_BY_FILE: Record<string, string> = {
  "TodaySection.tsx": "crew:today:notes",
  "ScheduleSection.tsx": "crew:schedule:days",
  "VenueSection.tsx": "crew:venue:diagrams",
  "TravelSection.tsx": "crew:travel:transport",
  "CrewSection.tsx": "crew:crew:roster",
  "GearSection.tsx": "crew:gear:scope",
  "BudgetSection.tsx": "crew:budget:rows",
};

const EXPECTED_TILE_IDS = Object.values(EXPECTED_TILE_BY_FILE).slice().sort();

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, acc);
    else if (rel.endsWith(".tsx") || rel.endsWith(".ts")) acc.push(rel);
  }
  return acc;
}

const PRODUCTION_FILES = [...walk("components"), ...walk("app")];

/**
 * Source with comments stripped. Non-negotiable: a raw regex over the file
 * treats prose in a doc comment as JSX, which reports files that merely NAME a
 * component in a comment as call sites.
 */
function codeOf(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** The paren-balanced text of the `after(` call starting at `from`. */
function afterCallFrom(src: string, from: number): string {
  const at = src.indexOf("after(", from);
  if (at < 0) return "";
  let depth = 0;
  for (let i = at + "after".length; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return src.slice(at);
}

describe("META tile producer topology", () => {
  test("every <WrappedSection> call site lives in components/crew/sections/", () => {
    const offenders = PRODUCTION_FILES.filter(
      (f) => /<WrappedSection[\s/>]/.test(codeOf(f)) && !f.startsWith(SECTIONS_DIR),
    );
    expect(offenders, `unexpected <WrappedSection> outside ${SECTIONS_DIR}`).toEqual([]);
  });

  test("the tileId literals are exactly the documented set, each used once", () => {
    // A LIST, not a Set: set-collection cannot detect a second wrapper reusing
    // an existing tileId, which would make two tiles share one alert identity.
    const found: string[] = [];
    for (const f of PRODUCTION_FILES) {
      for (const m of codeOf(f).matchAll(/tileId="(crew:[^"]+)"/g)) found.push(m[1] as string);
    }
    expect(found.slice().sort()).toEqual(EXPECTED_TILE_IDS);
    expect(new Set(found).size, "a tileId is used by more than one wrapper").toBe(found.length);
  });

  test("each section file declares ITS OWN tileId", () => {
    // The set check above cannot detect two sections swapping IDs; this can.
    const actual: Record<string, string[]> = {};
    for (const f of PRODUCTION_FILES) {
      if (!f.startsWith(SECTIONS_DIR)) continue;
      const ids = [...codeOf(f).matchAll(/tileId="(crew:[^"]+)"/g)].map((m) => m[1] as string);
      if (ids.length > 0) actual[f.split("/").pop() as string] = ids;
    }
    const flattened = Object.fromEntries(
      Object.entries(actual).map(([file, ids]) => [file, ids.join(",")]),
    );
    expect(flattened).toEqual(EXPECTED_TILE_BY_FILE);
  });

  test("crew sections are constructed ONLY in the crew shell", () => {
    const offenders: string[] = [];
    for (const f of PRODUCTION_FILES) {
      if (f === SHELL) continue;
      const src = codeOf(f);
      for (const name of SECTION_COMPONENTS) {
        // The word boundary matters: `<CrewSection` without it also matches
        // `<CrewSections`, the client controller.
        if (new RegExp(`<${name}[\\s/>]`).test(src)) offenders.push(`${f}:${name}`);
      }
    }
    expect(
      offenders,
      `crew sections constructed outside the shell: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  test("the shell registers the sweep and RETURNS its promise", () => {
    const src = codeOf(SHELL);
    expect(src).toMatch(/after\(\s*\(\)\s*=>\s*\n?\s*sweepTileRenderAlerts\(/);
    expect(src, "the sweep promise must be returned, not voided").not.toMatch(
      /after\(\s*\(\)\s*=>\s*\{\s*void\s+sweepTileRenderAlerts/,
    );
  });

  test("the ledger is created once, in the component body", () => {
    const src = codeOf(SHELL);
    expect(src.match(/createTileRenderLedger\(\)/g) ?? []).toHaveLength(1);

    // Anchor on the REGISTRATION, not the first mention of the sweep: the first
    // mention is the import, and the next `after(` from there is the projection
    // alert's registration, whose body legitimately contains no ledger creation.
    const regAt = src.search(/after\(\s*\(\)\s*=>\s*\n?\s*sweepTileRenderAlerts\(/);
    expect(regAt, "the tile sweep registration must exist").toBeGreaterThan(-1);
    const sweepCall = afterCallFrom(src, regAt);
    expect(
      sweepCall.includes("createTileRenderLedger"),
      "createTileRenderLedger() must not be called inside the after() callback",
    ).toBe(false);
  });

  test("WrappedSection contains no alert write", () => {
    expect(codeOf(join("components", "crew", "WrappedSection.tsx"))).not.toMatch(
      /upsertAdminAlert/,
    );
  });

  test("WrappedTile has no production call site, keeping TileServerFallback dormant", () => {
    const self = join("components", "shared", "WrappedTile.tsx");
    const offenders = PRODUCTION_FILES.filter(
      (f) => f !== self && /<WrappedTile[\s/>]/.test(codeOf(f)),
    );
    expect(offenders).toEqual([]);
  });
});
